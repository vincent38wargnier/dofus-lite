#!/usr/bin/env python3
"""Import an installed Retro asset library for local, offline use.

Usage: python3 scripts/import_retro_client.py [--client /path/to/retroclient]
Generated files go to the git-ignored public/dofus-local directory. The source
installation is read only. No game process or network connection is needed.
"""
import argparse
from collections import Counter, defaultdict
import hashlib
import json
import math
from pathlib import Path
import shutil
import struct

from retro_swf import (adapt_sprite, adapt_static, adapt_effect, exports, movie, place, read, tag,
                       display_bounds, tags, method, variable, push, action)
from retro_audio import find_audio_data, sound_cues, import_animation_sounds
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


def spell_visual(sprite_infos):
    """GA300: after spell ID / cell / gfx / grade come type, gesture, front.

    GameActionsEx (loader init-20835) reads the gesture directly. The first
    field selects SpellManager's effect placement, NOT anim{type // 10}.
    These arguments come from the server; they are not in spells_fr's grades.
    """
    parts = sprite_infos.split(',')
    effect_type, gesture = map(int, parts[:2])
    return {'type': effect_type, 'animation': f'anim{gesture}' if gesture >= 0 else None,
            'front': len(parts) > 2 and parts[2] == '1', 'spriteInfos': sprite_infos,
            'skipAnimation': gesture == -1, 'playEffect': effect_type >= 10 and gesture != -1}


def update_spell_visuals(manifest, client, timings):
    for line in read_sql_lines():
        if not line.startswith('INSERT INTO `sorts` VALUES '):
            continue
        values = parse_tuple(line.rstrip().rstrip(';'))
        sid, gfx = str(int(values[0])), values[2]
        visual = spell_visual(values[3])
        effect = f'effects/{gfx}.swf' if visual['playEffect'] and (client / f'clips/spells/{gfx}.swf').exists() else None
        manifest.setdefault('spells', {}).setdefault(sid, {}).update({
            **visual, 'effect': effect, **timings.get(gfx, {}),
            'icon': manifest.get('spells', {}).get(sid, {}).get('icon') or
                    (f'icons/{sid}.png' if (client / f'clips/spells/icons/up/{sid}.swf').exists() else None),
        })
    manifest['animationSources'] = {'client': 'loader.swf',
        'sha256': hashlib.sha256((client / 'loader.swf').read_bytes()).hexdigest(),
        'units': {'spriteDirections': 21157, 'castDirection': 20967, 'castSequence': 20813,
                  'effectPlacement': 21060, 'packetFields': 20835},
        'spellArguments': 'local legacy server SQL (graphics/gesture are sent by server)'}


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


def map_symbol_transform(rotation, flip, slope=1):
    """MapHandler's Flash quarter turns, about the exported symbol origin."""
    # A sloped ground selects a timeline frame instead of rotating the flat tile.
    if slope != 1:
        rotation = 0
    sx, sy, r0, r1 = [(1, 1, 0, 0), (0, 0, .5185, -1.9286),
                      (-1, -1, 0, 0), (0, 0, -.5185, 1.9286)][rotation]
    if flip:
        sx, r0 = -sx, -r0
    return sx, sy, r0, r1


def build_maps(client):
    libraries = {'ground': {}, 'object': {}}
    graphics, graphics_hashes, symbol_bounds = {}, {}, {}
    for file in sorted((client / 'clips/gfx').glob('*.swf')):
        kind = 'ground' if file.stem.startswith('g') else 'object' if file.stem.startswith('o') else None
        if kind:
            items = read(file)[2]
            names = exports(items)
            graphics[file.name] = (names, [(c, p) for c, p in items if c not in (0, 1, 4, 5, 12, 26, 28, 70)])
            graphics_hashes[file.name] = hashlib.sha256(file.read_bytes()).digest()
            # The wrappers must import the same graphics library we just read.
            target = OUT / 'raw/clips/gfx' / file.name
            target.parent.mkdir(parents=True, exist_ok=True)
            if not target.exists() or target.read_bytes() != file.read_bytes():
                shutil.copyfile(file, target)
            for name in names:
                if name.isdigit():
                    libraries[kind][int(name)] = (file.name, name)

    def bounds(link):
        if link not in symbol_bounds:
            names, definitions = graphics[link[0]]
            symbol_bounds[link] = display_bounds([*definitions, *tags(place(names[link[1]]))], all_frames=True)
        return symbol_bounds[link]
    js = (ROOT / 'src/engine/dofusMaps.js').read_text()
    selected = json.loads(js[js.index('['):js.rindex(']') + 1])
    by_id = {m['MapId']: m for m in json.loads(MAPS_JSON.read_text())}
    dungeon_maps = ROOT / 'src/engine/dungeonMaps.json'
    if dungeon_maps.exists():
        selected += json.loads(dungeon_maps.read_text())
        by_id.update({m['MapId']: m for m in json.loads((OUT / 'dungeons/terrain.json').read_text())})
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
                layers['ground'].append((background, -x0, -y0, 0, False, 0, 'background', 1, -1))
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
            slope = b[4] >> 2
            elevations[f'{x},{y}'] = elevation
            for kind, library_kind, num, layer, flip, rotation in [
                ('ground', 'ground', ground, 'ground', bool(b[4] & 2), (b[1] & 48) >> 4),
                ('object1', 'object', obj1, 'ground', bool(b[7] & 8), (b[7] & 48) >> 4),
                ('object2', 'object', obj2, str(x + y), bool(b[7] & 4), 0),
            ]:
                if num == 0:
                    continue
                link = libraries[library_kind].get(num)
                if link is None:
                    raise ValueError(f'Missing {kind} graphic {num} on map {mid}, cell {cid}')
                groups[link[0]].add(link[1])
                layers[layer].append((link, x, y, elevation, flip, rotation, kind, slope, cid))
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
        # The client has separate Ground, Object1 and Object2 containers.
        # Flattening cell-by-cell allowed later floor tiles to erase earlier
        # flowers, grass, shadows and other Object1 scenery.
        layers['ground'].sort(key=lambda cell: {'background': 0, 'ground': 1, 'object1': 2}[cell[6]])
        # Retain decorations extending beyond the combat cells instead of
        # clipping their exported vectors to a terrain-only bounding box.
        left, right, upper, lower = 0, width, 0, height
        for cells in layers.values():
            for link, x, y, elevation, flip, rotation, kind, slope, _ in cells:
                px, py = (x - y + origin_x) * hw, top + (x + y + 1) * hh - elevation
                sx, sy, r0, r1 = map_symbol_transform(rotation, flip, slope)
                a, b, c, d = bounds(link)
                points = [(px + sx * xx + r1 * yy, py + r0 * xx + sy * yy) for xx in (a, b) for yy in (c, d)]
                left = min(left, *(p[0] - 1 for p in points)); right = max(right, *(p[0] + 1 for p in points))
                upper = min(upper, *(p[1] - 1 for p in points)); lower = max(lower, *(p[1] + 1 for p in points))
        left, upper = math.floor(left), math.floor(upper)
        width, height = math.ceil(right) - left, math.ceil(lower) - upper
        origin_x -= left / hw
        top -= upper
        layer_meta = []
        for name, cells in sorted(layers.items(), key=lambda entry: -1 if entry[0] == 'ground' else int(entry[0])):
            layer_groups = defaultdict(set)
            for link, *_ in cells:
                layer_groups[link[0]].add(link[1])
            imports, lookup = import_symbols(layer_groups)
            out = [tag(69, struct.pack('<I', 0)), *imports]
            init = b''
            for depth, (link, x, y, elevation, flip, rotation, kind, slope, cid) in enumerate(cells, 1):
                px = (x - y + origin_x) * hw
                py = top + (x + y + 1) * hh - elevation
                # Both tiles and objects are registered at the cell centre.
                sx, sy, r0, r1 = map_symbol_transform(rotation, flip, slope)
                instance = f'{kind}_{cid}'
                out.append(place(lookup[link], depth, px, py, sx, sy, r0, r1, name=instance))
                if kind == 'ground' and slope != 1:
                    init += method(variable(instance), 'gotoAndStop', [push(slope)]) + action(0x17)
            out += [tag(12, init + b'\x07\0'), tag(1)]
            filename = f'{mid}-{name}.swf'
            (OUT / 'maps').mkdir(exist_ok=True)
            destination = OUT / 'maps' / filename
            data = movie(out, (0, width, 0, height), 12)
            if not destination.exists() or destination.read_bytes() != data:
                destination.write_bytes(data)
            revision = hashlib.sha256(data + b''.join(graphics_hashes[lib] for lib in sorted(layer_groups))).hexdigest()[:12]
            layer_meta.append({'name': name, 'swf': f'maps/{filename}', 'image': f'maps/{mid}-{name}-{revision}.png'})
        result[raw['id']] = {'width': width, 'height': height, 'hw': hw, 'top': top,
                            'originX': origin_x, 'backgroundId': background_id, 'renderingVersion': 2,
                            'sceneryCounts': dict(Counter(cell[6] for cells in layers.values() for cell in cells)),
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
        import_animation_sounds(manifest, client)
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
        update_spell_visuals(manifest, client, timings)
        import_animation_sounds(manifest, client)
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
            spells[str(sid)] = {
                'effect': f'effects/{gfx}.swf' if (client / f'clips/spells/{gfx}.swf').exists() else None,
                **spell_visual(values[3]),
                'duration': effect_info.get(gfx, {}).get('duration', 2200),
                'fps': effect_info.get(gfx, {}).get('fps'),
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
    update_spell_visuals(manifest, client, effect_info)
    import_animation_sounds(manifest, client)
    write_json(OUT / 'manifest.json', manifest)
    write_json(OUT / 'inventory.json', inventory)
    print(f'Manifest ready: 24 class appearances, {len(spells)} spell mappings, {len(manifest["maps"])} maps.', flush=True)


if __name__ == '__main__':
    main()
