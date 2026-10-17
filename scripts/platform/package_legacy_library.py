#!/usr/bin/env python3
"""Package the already-imported private Retro catalogue. Never part of a site build.

    python3 scripts/platform/package_legacy_library.py [--output /private/path.zip]

Reads local data only. Does not contact the client/server, modify sources, publish,
or install into anyone's browser. Output must stay outside the served directories.
"""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import re
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[2]
MEDIA = ROOT / 'public/dofus-local'
sys.path.insert(0, str(ROOT / 'scripts'))
from retro_swf import read as read_swf


def read_json(path):
    return json.loads(path.read_text())


def catalogue():
    engine = ROOT / 'src/engine'
    result = {key: read_json(engine / (filename + '.json')) for key, filename in [
        ('spellLibrary', 'spellLibrary'), ('monsterData', 'monsterData'),
        ('equipmentData', 'equipmentData'), ('dungeonData', 'dungeonData'),
        ('dungeonMaps', 'dungeonMaps'), ('classData', 'legacyClassData')]}
    maps = (engine / 'dofusMaps.js').read_text().split('export const DOFUS_MAPS_RAW =', 1)[1]
    result['outdoorMaps'] = json.loads(maps.strip().removesuffix(';'))
    forging = read_json(engine / 'forgemagieData.json')
    result['forging'] = {key: forging[key] for key in ['runes', 'potions', 'nonMageableIds']}
    return result


def media_files(manifest):
    selected = {'manifest.json'}

    def visit(value):
        if isinstance(value, str) and '/' in value and re.search(r'\.(png|swf|mp3|ogg|webp|jpg)$', value):
            # Metadata also contains source cue names, not actual URLs. Only
            # concrete files under the imported media tree are dependencies.
            for relative in [value, 'raw/' + value]:
                path = (MEDIA / relative).resolve()
                if path.is_relative_to(MEDIA.resolve()) and path.is_file():
                    selected.add(path.relative_to(MEDIA).as_posix())
                    break
        elif isinstance(value, dict):
            for key, child in value.items():
                visit(key)
                visit(child)
        elif isinstance(value, list):
            for child in value:
                visit(child)

    visit(manifest)
    # Paths calculated by the UI rather than stored in the manifest.
    for directory in ['equipment', 'portraits', 'icons', 'static', 'raw/clips/sprites/accessories']:
        for path in (MEDIA / directory).rglob('*'):
            if path.is_file() and path.suffix in ['.png', '.json', '.swf']:
                selected.add(path.relative_to(MEDIA).as_posix())
    for filename in ['spell-catalogue.json', 'spell-audit.json', 'equipment-audit.json', 'equipment-balance-audit.json']:
        if (MEDIA / filename).is_file():
            selected.add(filename)
    # Include transitive SWF imports (map scenery and animated accessories).
    todo, inspected = list(selected), set()
    unresolved = set()
    while todo:
        relative = todo.pop()
        if not relative.endswith('.swf') or relative in inspected:
            continue
        inspected.add(relative)
        for tag, data in read_swf(MEDIA / relative)[2]:
            if tag not in [57, 71]:
                continue
            url = data.split(b'\0', 1)[0].decode()
            candidates = [(MEDIA / relative).parent / url, MEDIA / 'raw' / url]
            resolved = next((p.resolve() for p in candidates if p.is_file() and p.resolve().is_relative_to(MEDIA.resolve())), None)
            if resolved:
                target = resolved.relative_to(MEDIA).as_posix()
                if target not in selected:
                    selected.add(target)
                    todo.append(target)
            else:
                # Client's placeholder linkage, also unresolved before migration.
                if url != 'DefaultURL':
                    raise ValueError(f'Missing SWF dependency: {relative} -> {url}')
                unresolved.add(relative)
    return sorted(selected), sorted(unresolved)


def build(output):
    output = output.resolve()
    for directory in ['public', 'web-public', 'build', 'build-platform']:
        if output.is_relative_to(ROOT / directory):
            raise ValueError('Private library output cannot be inside a website asset directory.')
    data, manifest = catalogue(), read_json(MEDIA / 'manifest.json')
    files, placeholders = media_files(manifest)
    counts = {
        'classes': len(data['classData']['builds']),
        'playerSpells': len(data['spellLibrary']['spells']),
        'monsters': len(data['monsterData']['monsters']),
        'dungeonEncounters': len(data['dungeonData']['encounters']),
        'maps': len(data['dungeonMaps']) + len(data['outdoorMaps']),
        'items': len(data['equipmentData']['items']),
        'sets': len(data['equipmentData']['sets']),
        'runes': len(data['forging']['runes']), 'potions': len(data['forging']['potions']),
        'actors': len(manifest['actors']), 'mediaFiles': len(files),
    }
    metadata = {'format': 'arena-forge-library', 'version': 1, 'release': '1.0.0',
        'kind': 'catalogue', 'name': 'Dofus Retro — bibliothèque locale',
        'description': 'Catalogue privé restauré depuis les données déjà importées sur cet ordinateur : '
        f"{counts['classes']} classes, {counts['playerSpells']} sorts de joueur, {counts['monsters']} monstres, "
        f"{counts['dungeonEncounters']} rencontres, {counts['maps']} cartes et {counts['items']} équipements, "
        'avec familiers, montures, forgemagie, apparences, décors et audio. '
        'Retrouve les données et les limites de simulation de la version antérieure à Arena Forge. '
        'Ce fichier ne contient pas vos personnages, stuffs ou créations personnelles enregistrés dans le navigateur.'}
    output.parent.mkdir(parents=True, exist_ok=True)
    total = 0
    def write(archive, name, content):
        nonlocal total
        total += len(content)
        info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o100644 << 16
        archive.writestr(info, content)
    temporary = output.with_suffix('.zip.partial')
    try:
        with zipfile.ZipFile(temporary, 'w', allowZip64=False, compresslevel=6) as archive:
            for name, value in [('library.json', metadata), ('catalogue.json', data)]:
                write(archive, name, json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode())
            for index, name in enumerate(files):
                write(archive, 'assets/' + name, (MEDIA / name).read_bytes())
                if index and index % 2000 == 0:
                    print(f'Packed {index}/{len(files)} media files', flush=True)
        if total > 640 * 1048576 or temporary.stat().st_size > 512 * 1048576 or len(files) + 2 > 24000:
            raise ValueError('Library exceeds bounded local import limits.')
        temporary.replace(output)
    finally:
        temporary.unlink(missing_ok=True)
    report = {'file': str(output), 'counts': counts, 'bytes': output.stat().st_size,
        'expandedBytes': total, 'sha256': hashlib.file_digest(output.open('rb'), 'sha256').hexdigest(),
        'mediaByExtension': dict(Counter(Path(name).suffix for name in files)),
        'preexistingPlaceholderSwfs': placeholders,
        'privateOnly': True, 'published': False}
    output.with_suffix('.report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / 'var/private-libraries/dofus-retro.arena-library.zip')
    build(parser.parse_args().output)
