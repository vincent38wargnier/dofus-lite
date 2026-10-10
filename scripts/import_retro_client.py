#!/usr/bin/env python3
"""Import an installed Retro asset library for local, offline use.

Usage: python3 scripts/import_retro_client.py [--client /path/to/retroclient]
Generated files go to the git-ignored public/dofus-local directory. The source
installation is read only. No game process or network connection is needed.
"""
import argparse
from collections import Counter, defaultdict
import json
from pathlib import Path
import re
import shutil
import struct

from retro_swf import adapt_sprite, adapt_static, adapt_effect, exports, movie, place, read, tag
from retro_audio import find_audio_data, sound_cues
from retro_data import data_tables
from extract_spells import parse_tuple, read_sql_lines
from import_dofus_maps import H, MAPS_JSON, decode, VOID

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public/dofus-local'
DEFAULT_CLIENT = Path('/Applications/Ankama/Retro/Dofus Retro.app/Contents/Resources/app/retroclient')
CLASSES = ['FECA', 'OSAMODAS', 'ENUTROF', 'SRAM', 'XELOR', 'ECAFLIP',
           'ENIRIPSA', 'IOP', 'CRA', 'SADIDA', 'SACRIEUR', 'PANDAWA']


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':')))


def extract_audio(client, audio_data=None):
    result = {}
    for kind in ('effects', 'musics'):
        items = read(client / f'audio/{kind}.swf')[2]
        names = {cid: name for name, cid in exports(items).items()}
        result[kind] = {}
        for code, data in items:
            if code != 14 or data[2] >> 4 != 2:
                continue
            cid = struct.unpack_from('<H', data)[0]
            name = names.get(cid, str(cid))
            destination = f'audio/{kind}/{cid}.mp3'
            file = OUT / destination
            file.parent.mkdir(parents=True, exist_ok=True)
            # DefineSound: id(2), flags(1), sample count(4), seek samples(2).
            file.write_bytes(data[9:])
            result[kind][name] = destination
    tables = find_audio_data(client, OUT / 'audio/definitions.swf', audio_data)
    result['cues'], result['missingCues'] = sound_cues(tables, result['effects'])
    result['definitionVersion'] = tables.get('VERSION')
    print(f'Linked {len(tables["AUEC"]) - len(result["missingCues"])} sound names; '
          f'{len(result["missingCues"])} recordings absent from the installed client.', flush=True)
    return result


def import_symbols(groups):
    """Link a map to the original exported graphics without flattening vectors."""
    out, lookup, next_id = [], {}, 1
    for library, names in sorted(groups.items()):
        payload = ('../raw/clips/gfx/' + library).encode() + b'\0\x01\x00' + struct.pack('<H', len(names))
        for name in sorted(names):
            lookup[(library, name)] = next_id
            payload += struct.pack('<H', next_id) + name.encode() + b'\0'
            next_id += 1
        out.append(tag(71, payload))
    return out, lookup


def build_maps(client):
    libraries = {'ground': {}, 'object': {}}
    for file in sorted((client / 'clips/gfx').glob('*.swf')):
        kind = 'ground' if file.stem.startswith('g') else 'object' if file.stem.startswith('o') else None
        if kind:
            for name in exports(read(file)[2]):
                if name.isdigit():
                    libraries[kind][int(name)] = (file.name, name)
    js = (ROOT / 'src/engine/dofusMaps.js').read_text()
    selected = json.loads(js[js.index('['):js.rindex(']') + 1])
    by_id = {m['MapId']: m for m in json.loads(MAPS_JSON.read_text())}
    result = {}
    for raw in selected:
        mid = int(raw['id'].split('_')[-1])
        m = by_id[mid]
        active = [p for p, kind in decode(m).items() if kind != VOID]
        x0, y0 = min(p[0] for p in active), min(p[1] for p in active)
        layers, groups = defaultdict(list), defaultdict(set)
        background_id = None
        if raw.get('frameToCells'):
            # Cells with ground ID 0 reveal the map's shared background. Its
            # ID is a plain assignment in the installed map SWF, independent
            # of the encrypted mapData string.
            versions = sorted((client / 'data/maps').glob(f'{mid}_*.swf'))
            if not versions:
                raise FileNotFoundError(f'Missing installed map metadata for {mid}')
            metadata = data_tables(versions[-1])
            if metadata.get('width') != m['Width'] or metadata.get('height') != m['Height']:
                raise ValueError(f'Installed map {mid} dimensions differ from the decoded layout')
            background_id = metadata.get('backgroundNum')
            background = libraries['ground'].get(background_id)
            if background_id and not background:
                raise ValueError(f'Missing background {background_id} for map {mid}')
            if background:
                layers['ground'].append((background, 0, 0, 0, False, 0, 'background'))
        elevations = {}
        for cid in range(len(m['MapData']) // 10):
            b = [H[c] for c in m['MapData'][cid * 10:cid * 10 + 10]]
            row = cid // (m['Width'] * 2 - 1)
            y = row - ((cid - row * (m['Width'] * 2 - 1)) % m['Width'])
            x = (cid - (m['Width'] - 1) * y) // m['Width']
            x, y = x - x0, y - y0
            if not (0 <= x < raw['width'] and 0 <= y < raw['height']):
                continue
            if not (b[0] & 32):
                continue
            ground = ((b[0] & 24) << 6) + ((b[2] & 7) << 6) + b[3]
            obj1 = ((b[0] & 4) << 11) + ((b[4] & 1) << 12) + (b[5] << 6) + b[6]
            obj2 = ((b[0] & 2) << 12) + ((b[7] & 1) << 12) + (b[8] << 6) + b[9]
            # Ground level 7 is the normal plane; one level is 20 Flash pixels.
            elevation = ((b[1] & 15) - 7) * 20
            elevations[f'{x},{y}'] = elevation
            for kind, num, layer, flip, rotation in [
                ('ground', ground, 'ground', bool(b[4] & 2), (b[1] & 48) >> 4),
                ('object', obj1, 'ground', bool(b[7] & 8), (b[7] & 48) >> 4),
                ('object', obj2, str(x + y), bool(b[7] & 4), 0),
            ]:
                link = libraries[kind].get(num)
                if num == 0 or link is None:
                    continue
                groups[link[0]].add(link[1])
                layers[layer].append((link, x, y, elevation, flip, rotation, kind))
        hw, hh, top = 26.75, 13.375, 100
        origin_x = raw['height']
        width = (raw['width'] + raw['height']) * hw
        height = top + (raw['width'] + raw['height']) * hh + 50
        if raw.get('frameToCells'):
            # Outdoor maps occupy a rectangle in screen space, but a much
            # larger diamond-space bounding box. Fit the displayed playfield
            # without changing any engine coordinate, cell or elevation.
            screen_x = [x - x0 - (y - y0) for x, y in active]
            screen_y = [x - x0 + y - y0 for x, y in active]
            origin_x = 1 - min(screen_x)
            width = (max(screen_x) - min(screen_x) + 2) * hw
            height = 150 + (max(screen_y) - min(screen_y) + 2) * hh
            top -= min(screen_y) * hh
        layer_meta = []
        for name, cells in layers.items():
            layer_groups = defaultdict(set)
            for link, *_ in cells:
                layer_groups[link[0]].add(link[1])
            imports, lookup = import_symbols(layer_groups)
            out = [tag(69, struct.pack('<I', 0)), *imports]
            for depth, (link, x, y, elevation, flip, rotation, kind) in enumerate(cells, 1):
                px = (x - y + origin_x) * hw
                py = top + (x + y + 1) * hh - elevation
                if kind == 'background':
                    px, py = 0, 100
                # Ground symbols use their top-left corner as their origin.
                if kind == 'ground':
                    px -= hw
                    py -= hh
                # Dofus quarter turns are rotations in the isometric plane.
                transforms = [(1, 1, 0, 0), (0, 0, .5, -2), (-1, -1, 0, 0), (0, 0, -.5, 2)]
                sx, sy, r0, r1 = transforms[rotation]
                if kind == 'ground' and rotation:
                    px += hw
                    py += hh
                    # Rotate about the tile centre.
                    px -= sx * hw + r1 * hh
                    py -= r0 * hw + sy * hh
                if flip:
                    if kind == 'ground':
                        px += 2 * hw * sx
                        py += 2 * hw * r0
                    sx, r0 = -sx, -r0
                out.append(place(lookup[link], depth, px, py, sx, sy, r0, r1))
            out += [tag(12, b'\x07\0'), tag(1)]
            filename = f'{mid}-{name}.swf'
            (OUT / 'maps').mkdir(exist_ok=True)
            destination = OUT / 'maps' / filename
            data = movie(out, (0, width, 0, height), 12)
            if not destination.exists() or destination.read_bytes() != data:
                destination.write_bytes(data)
            layer_meta.append({'name': name, 'swf': f'maps/{filename}', 'image': f'maps/{mid}-{name}.png'})
        result[raw['id']] = {'width': width, 'height': height, 'hw': hw, 'top': top,
                            **({'originX': origin_x, 'backgroundId': background_id} if raw.get('frameToCells') else {}),
                            'elevations': elevations, 'layers': layer_meta}
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--client', type=Path, default=DEFAULT_CLIENT)
    parser.add_argument('--maps-only', action='store_true')
    parser.add_argument('--animations-only', action='store_true')
    parser.add_argument('--audio-only', action='store_true')
    parser.add_argument('--audio-data', type=Path, help='Local lang/swf/audio_*.swf definitions')
    args = parser.parse_args()
    client = args.client.expanduser().resolve()
    if not (client / 'clips/sprites/80.swf').is_file():
        parser.error(f'Not a Retro client directory: {client}')
    OUT.mkdir(parents=True, exist_ok=True)
    if args.audio_only:
        manifest = json.loads((OUT / 'manifest.json').read_text())
        manifest['audio'] = extract_audio(client, args.audio_data)
        write_json(OUT / 'manifest.json', manifest)
        return
    if args.animations_only:
        manifest = json.loads((OUT / 'manifest.json').read_text())
        for file in sorted((client / 'clips/sprites').glob('*.swf')):
            adapted = adapt_sprite(file, OUT / 'actors' / file.name)
            if adapted:
                manifest['actors'][file.stem] = {'url': f'actors/{file.name}', **adapted}
        timings = {}
        for file in (client / 'clips/spells').glob('*.swf'):
            timings[file.stem] = adapt_effect(file, OUT / 'effects' / file.name)
        for spell in manifest['spells'].values():
            if spell.get('effect'):
                spell['duration'] = timings.get(Path(spell['effect']).stem, {}).get('duration', 2200)
        write_json(OUT / 'manifest.json', manifest)
        print(f'Updated {len(manifest["actors"])} sprite libraries and {len(timings)} spell timelines.')
        return
    if args.maps_only:
        manifest = json.loads((OUT / 'manifest.json').read_text())
        manifest['maps'] = build_maps(client)
        write_json(OUT / 'manifest.json', manifest)
        print(f'Prepared {len(manifest["maps"])} map layouts and original graphics.')
        return
    inventory = []
    for directory in ['clips', 'audio', 'fonts', 'styles', 'svg', 'loadingbanners', 'data']:
        source = client / directory
        if not source.exists():
            continue
        shutil.copytree(source, OUT / 'raw' / directory, dirs_exist_ok=True)
        for file in sorted(source.rglob('*')):
            if file.is_file():
                inventory.append({'path': str(file.relative_to(client)), 'bytes': file.stat().st_size})
    # Preserve the full UI library for inspection, without launching its login code.
    shutil.copy2(client / 'loader.swf', OUT / 'raw/loader.swf')
    inventory.append({'path': 'loader.swf', 'bytes': (client / 'loader.swf').stat().st_size})
    print(f'Copied {len(inventory)} local asset files.', flush=True)
    actors = {}
    for file in sorted((client / 'clips/sprites').glob('*.swf')):
        adapted = adapt_sprite(file, OUT / 'actors' / file.name)
        if adapted:
            actors[file.stem] = {'url': f'actors/{file.name}', **adapted}
    print(f'Prepared {len(actors)} animated sprite libraries.', flush=True)
    for i in range(1, 13):
        for sex in (0, 1):
            sid = i * 10 + sex
            adapt_static(client / f'clips/artworks/faces/{sid}.swf', OUT / f'static/portraits/{sid}.swf')
    for file in (client / 'clips/spells/icons/up').glob('*.swf'):
        adapt_static(file, OUT / 'static/icons' / file.name)
    effect_info = {}
    for file in (client / 'clips/spells').glob('*.swf'):
        effect_info[file.stem] = adapt_effect(file, OUT / 'effects' / file.name)
    spells, monsters = {}, {}
    for line in read_sql_lines():
        if line.startswith('INSERT INTO `sorts` VALUES '):
            values = parse_tuple(line.rstrip().rstrip(';'))
            sid, gfx = int(values[0]), values[2]
            anim = re.match(r'\d+', values[3])
            spells[str(sid)] = {
                'effect': f'effects/{gfx}.swf' if (client / f'clips/spells/{gfx}.swf').exists() else None,
                'animation': f'anim{int(anim[0]) // 10}' if anim else 'anim0',
                'duration': effect_info.get(gfx, {}).get('duration', 2200),
                'spriteInfos': values[3],
                'icon': f'icons/{sid}.png' if (client / f'clips/spells/icons/up/{sid}.swf').exists() else None,
            }
        elif line.startswith('INSERT INTO `monsters` VALUES '):
            values = parse_tuple(line.rstrip().rstrip(';'))
            if values[2] in actors:
                monsters[values[0]] = values[2]
    manifest = {
        'version': 1, 'files': len(inventory), 'bytes': sum(f['bytes'] for f in inventory),
        'classes': {c: {'male': str((i + 1) * 10), 'female': str((i + 1) * 10 + 1)} for i, c in enumerate(CLASSES)},
        'actors': actors, 'spells': spells, 'monsters': monsters, 'audio': extract_audio(client, args.audio_data),
        'maps': build_maps(client), 'imagesReady': False,
        'counts': dict(Counter(f['path'].split('/')[1] if f['path'].startswith('clips/') else f['path'].split('/')[0] for f in inventory)),
    }
    write_json(OUT / 'manifest.json', manifest)
    write_json(OUT / 'inventory.json', inventory)
    print(f'Manifest ready: 24 class appearances, {len(spells)} spell mappings, {len(manifest["maps"])} maps.', flush=True)


if __name__ == '__main__':
    main()
