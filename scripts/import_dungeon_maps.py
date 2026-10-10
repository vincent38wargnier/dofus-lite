#!/usr/bin/env python3
"""Import final-room terrain, decor inputs and both placement zones from Retro.

No arena fallback or invented spawn cell is allowed. MA.m.p1/p2 are the
installed language table's player/monster cells. Encrypted map SWFs are read
with revision-specific public resource keys (see dungeon_map_keys.json).
"""
import argparse
import hashlib
import json
from pathlib import Path
from urllib.parse import unquote

from retro_data import cached_tables, data_tables
from import_retro_client import DEFAULT_CLIENT, OUT, ROOT
from import_dofus_maps import ALPHABET, decode, crop, decode_places, cell_xy, FLOOR, VOID, BLOCK, WATER

ENCOUNTERS = ROOT / 'scripts/dungeon_encounters.json'
KEYS = ROOT / 'scripts/dungeon_map_keys.json'
RAW_MAPS = ROOT / 'src/engine/dungeonMaps.json'
TERRAIN = OUT / 'dungeons/terrain.json'


def read_terrain(client, mid, keys):
    versions = sorted((client / 'data/maps').glob(f'{mid}_*X.swf'))
    if not versions:
        raise ValueError(f'Missing installed dungeon map {mid}')
    path = versions[-1]
    resource = keys.get(path.stem[:-1])
    if not resource:
        raise ValueError(f'No verified resource key for {path.name}')
    raw = data_tables(path)
    prepared = unquote(bytes.fromhex(resource['key']).decode())
    offset = sum(map(ord, prepared)) % 16 * 2
    decoded = unquote(''.join(chr(v ^ ord(prepared[(i + offset) % len(prepared)]))
                             for i, v in enumerate(bytes.fromhex(raw['mapData']))))
    expected = (raw['width'] * raw['height'] + (raw['width'] - 1) * (raw['height'] - 1)) * 10
    if len(decoded) != expected or not set(decoded) <= set(ALPHABET):
        raise ValueError(f'Invalid decoded cells for {path.name}')
    return {'MapId': mid, 'Width': raw['width'], 'Height': raw['height'], 'MapData': decoded,
            'source': {'file': path.name, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                       'decodedSha256': hashlib.sha256(decoded.encode()).hexdigest(),
                       'keySource': resource.get('url', resource.get('source'))}}


def build_map(room, terrain, metadata, placement_source):
    mid = terrain['MapId']
    entry = metadata['m'][mid]
    cells = decode(terrain)
    grid = crop(cells)
    active = [p for p, kind in cells.items() if kind != VOID]
    x0, y0 = min(p[0] for p in active), min(p[1] for p in active)
    zones = decode_places(entry['p1'] + '|' + entry['p2'])
    seen, starts = set(), []
    for zone in zones:
        result = []
        for cid in zone:
            p = cell_xy(cid, terrain['Width'])
            if cid in seen or cells.get(p) != FLOOR:
                raise ValueError(f'Invalid original placement cell {cid} on map {mid}')
            seen.add(cid)
            result.append({'x': p[0] - x0, 'y': p[1] - y0, 'cellId': cid})
        starts.append(result)
    count = sum(member['count'] for member in room['members'])
    if not starts[0] or len(starts[1]) < count:
        raise ValueError(f'Map {mid} cannot host the original group of {count} monsters')
    obstacles = [{'x': x, 'y': y, 't': {BLOCK: 'ROCK', WATER: 'WATER', VOID: 'VOID'}[kind]}
                 for y, row in enumerate(grid) for x, kind in enumerate(row) if kind != FLOOR]
    spawns = [{k: team[0][k] for k in ('x', 'y')} for team in starts]
    coordinate = f"[{entry['x']};{entry['y']}]"
    return {'id': f'dungeon_{mid}', 'name': room.get('mapLabel', room['name']) + ' ' + coordinate,
            'kind': 'dungeon', 'frameToCells': True, 'sourceId': mid,
            'area': metadata['sa'][entry['sa']]['n'], 'coordinate': coordinate,
            'walkableCells': sum(kind == FLOOR for kind in cells.values()),
            'description': 'Salle du client Retro · placements des deux camps importés du client.',
            'width': len(grid[0]), 'height': len(grid), 'spawns': spawns,
            'startingCells': starts, 'obstacles': obstacles,
            'source': terrain['source'],
            'placement': {'status': 'client', 'source': placement_source,
                          'places': entry['p1'] + '|' + entry['p2'],
                          'width': terrain['Width'], 'height': terrain['Height']}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--client', type=Path, default=DEFAULT_CLIENT)
    args = parser.parse_args()
    tables, sources = cached_tables(['maps'], OUT / 'dungeons/source', args.client)
    rooms = json.loads(ENCOUNTERS.read_text())['encounters']
    keys = json.loads(KEYS.read_text())['maps']
    terrain = [read_terrain(args.client, r['mapId'], keys) for r in rooms]
    source = sources['maps']
    maps = [build_map(room, m, tables['maps']['MA'], source) for room, m in zip(rooms, terrain)]
    RAW_MAPS.write_text(json.dumps(maps, ensure_ascii=False, separators=(',', ':')) + '\n')
    TERRAIN.write_text(json.dumps(terrain, ensure_ascii=False, separators=(',', ':')) + '\n')
    print(f'Imported {len(maps)} final-room maps, with {sum(len(t) for m in maps for t in m["startingCells"])} original starting cells.')


if __name__ == '__main__':
    main()
