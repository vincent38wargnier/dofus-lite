#!/usr/bin/env python3
"""Import real Dofus 1.29 maps from the OblivionRetro emulator into the Koliséum.

Decodes AivyDofus/Resources/Maps.json (MapData: 10 chars per cell, 6-bit
alphabet) using the exact algorithm from OblivionRetro's Map.cs / Hash.cs:

  b[i]        = index of char in [a-zA-Z0-9-_]
  active      = (b[0] & 32) != 0
  seeThrough  = (b[0] & 1) == 1          # bit 0 clear -> blocks line of sight
  cellType    = (b[2] & 56) >> 3         # 0 = NOT_WALKABLE
  Y           = row - (cellId - row*(2w-1)) % w      with row = cellId // (2w-1)
  X           = (cellId - (w-1)*Y) / w

In the (X, Y) diamond space, fight movement is 4-neighbour and distances are
Manhattan — exactly the Koliséum engine's geometry, so cells map 1:1.

Usage:
  python3 scripts/import_dofus_maps.py report          # rank candidates
  python3 scripts/import_dofus_maps.py show <mapId>    # ascii preview
  python3 scripts/import_dofus_maps.py generate <mapId> [mapId...]  # write JS
"""

import json
import sys
import unicodedata
from collections import deque
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MAPS_JSON = ROOT / 'OblivionRetro/AivyDofus/Resources/Maps.json'
OUT_JS = ROOT / 'src/engine/dofusMaps.js'
PLACEMENTS_JSON = ROOT / 'scripts/map_placements.json'
DEFAULT_MAPS = [5383, 1571, 6170, 6173, 1735, 2095, 2195, 6158,
                6167, 9750, 4, 1720, 8313, 999, 1907, 2073, 7423, 952]
PVP_MAPS = {7423: ('Astrub PvP', '[5,-23]'), 952: ('Amakna PvP', '[-1,0]')}

ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_'
H = {c: i for i, c in enumerate(ALPHABET)}

# Cell kinds after decoding
FLOOR, BLOCK, WATER, VOID = 'floor', 'block', 'water', 'void'
# BLOCK: blocks movement + line of sight (rock/wall/tree trunk)
# WATER: blocks movement only (water, pits — you can shoot across)
# VOID:  outside the playable diamond


def cell_xy(cid, width):
    row = cid // (width * 2 - 1)
    y = row - ((cid - row * (width * 2 - 1)) % width)
    return (cid - (width - 1) * y) // width, y


def decode(m):
    data = m['MapData']
    w = m['Width']
    cells = {}
    for cid in range(len(data) // 10):
        b = [H[c] for c in data[cid * 10:cid * 10 + 10]]
        active = (b[0] & 32) != 0
        see_through = (b[0] & 1) == 1
        walkable = ((b[2] & 56) >> 3) != 0
        x, y = cell_xy(cid, w)
        if not active:
            kind = VOID
        elif walkable and see_through:
            kind = FLOOR
        elif not see_through:
            kind = BLOCK
        else:
            kind = WATER
        cells[(x, y)] = kind
    return cells


def crop(cells):
    """Normalize to a 0-based grid over the bounding box of non-void cells."""
    pts = [p for p, k in cells.items() if k != VOID]
    if not pts:
        return None
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    x0, y0 = min(xs), min(ys)
    wdt = max(xs) - x0 + 1
    hgt = max(ys) - y0 + 1
    grid = [[VOID] * wdt for _ in range(hgt)]
    for (x, y), k in cells.items():
        if x0 <= x < x0 + wdt and y0 <= y < y0 + hgt:
            grid[y - y0][x - x0] = k
    return grid


def components(grid):
    """Connected components of FLOOR cells (4-neighbour)."""
    hgt, wdt = len(grid), len(grid[0])
    seen = set()
    comps = []
    for y in range(hgt):
        for x in range(wdt):
            if grid[y][x] == FLOOR and (x, y) not in seen:
                comp = []
                q = deque([(x, y)])
                seen.add((x, y))
                while q:
                    cx, cy = q.popleft()
                    comp.append((cx, cy))
                    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        nx, ny = cx + dx, cy + dy
                        if 0 <= nx < wdt and 0 <= ny < hgt and grid[ny][nx] == FLOOR \
                                and (nx, ny) not in seen:
                            seen.add((nx, ny))
                            q.append((nx, ny))
                comps.append(comp)
    return sorted(comps, key=len, reverse=True)


def bfs_far(grid, start, allowed):
    """Farthest allowed cell from start; returns (cell, dist)."""
    dist = {start: 0}
    q = deque([start])
    far = (start, 0)
    while q:
        c = q.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            n = (c[0] + dx, c[1] + dy)
            if n in allowed and n not in dist:
                dist[n] = dist[c] + 1
                if dist[n] > far[1]:
                    far = (n, dist[n])
                q.append(n)
    return far


def analyze(m):
    grid = crop(decode(m))
    if grid is None:
        return None
    hgt, wdt = len(grid), len(grid[0])
    flat = [k for row in grid for k in row]
    floor = flat.count(FLOOR)
    block = flat.count(BLOCK)
    water = flat.count(WATER)
    comps = components(grid)
    if not comps:
        return None
    main = comps[0]
    # spawns: approximate diameter of the main walkable component
    allowed = set(main)
    u, _ = bfs_far(grid, main[0], allowed)
    v, diam = bfs_far(grid, u, allowed)
    return {
        'map': m, 'grid': grid, 'w': wdt, 'h': hgt,
        'floor': floor, 'block': block, 'water': water,
        'main_ratio': len(main) / floor if floor else 0,
        'diameter': diam, 'spawnA': u, 'spawnB': v,
    }


def is_candidate(a):
    return (a is not None
            and 12 <= a['w'] <= 16 and 12 <= a['h'] <= 16
            and 80 <= a['floor'] <= 200
            and 8 <= a['block'] + a['water'] <= 45
            and a['main_ratio'] >= 0.9
            and a['diameter'] >= 14)


def score(a):
    obst = a['block'] + a['water']
    density = obst / (a['floor'] + obst)
    return -abs(density - 0.14) * 100 + a['diameter'] * 0.3 + a['main_ratio'] * 5


def ascii_art(a):
    sym = {FLOOR: '·', BLOCK: '█', WATER: '~', VOID: ' '}
    starts = a.get('startingCells', [[dict(zip(('x', 'y'), a['spawnA']))],
                                    [dict(zip(('x', 'y'), a['spawnB']))]])
    teams = [{(c['x'], c['y']) for c in team} for team in starts]
    rows = []
    for y, row in enumerate(a['grid']):
        line = ''
        for x, k in enumerate(row):
            if (x, y) in teams[0]:
                line += 'A'
            elif (x, y) in teams[1]:
                line += 'B'
            else:
                line += sym[k]
        rows.append(line)
    return '\n'.join(rows)


def slugify(name, map_id):
    s = unicodedata.normalize('NFKD', name).encode('ascii', 'ignore').decode()
    s = ''.join(c if c.isalnum() else '_' for c in s.lower()).strip('_')
    return f"{s}_{map_id}"


def decode_places(places):
    """Server GP payload: two encoded team lists, two characters per cell."""
    teams = places.split('|')
    if len(teams) != 2 or any(not team or len(team) % 2 for team in teams):
        raise ValueError('Starting places must contain two nonempty teams')
    if any(c not in H for team in teams for c in team):
        raise ValueError('Invalid character in starting places')
    ids = [[H[team[i]] * 64 + H[team[i + 1]] for i in range(0, len(team), 2)]
           for team in teams]
    flat = ids[0] + ids[1]
    if len(set(flat)) != len(flat):
        raise ValueError('Duplicate or overlapping starting cells')
    return ids


def starting_placement(m, a, record):
    """Never silently filter/fix a historical list or invent missing cells."""
    if record['status'] != 'historical':
        cells = [[{'x': a['spawnA'][0], 'y': a['spawnA'][1]}],
                 [{'x': a['spawnB'][0], 'y': a['spawnB'][1]}]]
        return cells, {'status': 'local', 'reason': record['reason']}
    if (record['width'], record['height']) != (m['Width'], m['Height']):
        raise ValueError(f"Map {m['MapId']}: placement dimensions mismatch")
    decoded = decode(m)
    occupied = [p for p, kind in decoded.items() if kind != VOID]
    x0 = min(p[0] for p in occupied)
    y0 = min(p[1] for p in occupied)
    main = set(components(a['grid'])[0])
    teams = []
    for ids in decode_places(record['places']):
        team = []
        for cid in ids:
            x, y = cell_xy(cid, m['Width'])
            if not 0 <= cid < len(m['MapData']) // 10 or decoded.get((x, y)) != FLOOR:
                raise ValueError(f"Map {m['MapId']}: blocked/invalid starting cell {cid}")
            if (x - x0, y - y0) not in main:
                raise ValueError(f"Map {m['MapId']}: disconnected starting cell {cid}")
            team.append({'x': x - x0, 'y': y - y0, 'cellId': cid})
        teams.append(team)
    return teams, {k: record[k] for k in ('status', 'source', 'places', 'width', 'height')}


def distance_between(grid, start, end):
    distances = {tuple(start): 0}
    queue = deque([tuple(start)])
    while queue:
        x, y = queue.popleft()
        if (x, y) == tuple(end):
            return distances[(x, y)]
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            p = x + dx, y + dy
            if (0 <= p[1] < len(grid) and 0 <= p[0] < len(grid[0])
                    and grid[p[1]][p[0]] == FLOOR and p not in distances):
                distances[p] = distances[(x, y)] + 1
                queue.append(p)
    raise ValueError('Disconnected starting cells')


def load():
    return json.loads(MAPS_JSON.read_text())


def cmd_report():
    maps = load()
    cands = []
    for m in maps:
        try:
            a = analyze(m)
        except Exception:
            continue
        if is_candidate(a):
            cands.append(a)
    cands.sort(key=score, reverse=True)
    print(f"{len(cands)} candidates / {len(maps)} maps\n")
    seen_area = {}
    for a in cands[:40]:
        m = a['map']
        area_count = seen_area.get(m['AreaName'], 0)
        seen_area[m['AreaName']] = area_count + 1
        if area_count >= 3:
            continue
        print(f"mapId={m['MapId']:>6}  {m['AreaName']} {m['Coordinate']}"
              f"  {a['w']}x{a['h']}  floor={a['floor']} block={a['block']}"
              f" water={a['water']} diam={a['diameter']} score={score(a):.1f}")


def cmd_show(map_id):
    maps = load()
    m = next(x for x in maps if x['MapId'] == map_id)
    a = analyze(m)
    record = json.loads(PLACEMENTS_JSON.read_text())['maps'].get(str(map_id), {
        'status': 'local', 'reason': 'No reviewed historical starting cells available.',
    })
    a['startingCells'], metadata = starting_placement(m, a, record)
    print(f"{m['AreaName']} {m['Coordinate']} (mapId {map_id}) {a['w']}x{a['h']}")
    print(f"Placement: {metadata['status']} — A / B mark the two starting zones")
    print(ascii_art(a))


def cmd_generate(map_ids):
    maps = load()
    by_id = {m['MapId']: m for m in maps}
    placements = json.loads(PLACEMENTS_JSON.read_text())
    entries = []
    for mid in map_ids:
        m = by_id[mid]
        pvp = PVP_MAPS.get(mid)
        if pvp and m['Coordinate'] != pvp[1]:
            raise ValueError(f'Map {mid} does not match the requested PvP coordinates {pvp[1]}')
        a = analyze(m)
        if not a or a['diameter'] < 8 or a['main_ratio'] < .9:
            raise ValueError(f'Map {mid} has no suitable connected combat area')
        record = placements['maps'].get(str(mid), {
            'status': 'local', 'reason': 'No reviewed historical starting cells available.',
        })
        starting_cells, placement = starting_placement(m, a, record)
        spawns = [{k: team[0][k] for k in ('x', 'y')} for team in starting_cells]
        obstacles = []
        for y, row in enumerate(a['grid']):
            for x, k in enumerate(row):
                if k == BLOCK:
                    obstacles.append({'x': x, 'y': y, 't': 'ROCK'})
                elif k == WATER:
                    obstacles.append({'x': x, 'y': y, 't': 'WATER'})
                elif k == VOID:
                    obstacles.append({'x': x, 'y': y, 't': 'VOID'})
        entries.append({
            'id': slugify(m['AreaName'], m['MapId']),
            'name': f"{pvp[0] if pvp else m['AreaName']} {m['Coordinate']}",
            **({'frameToCells': True} if pvp else {}),
            'sourceId': mid, 'area': m['AreaName'], 'coordinate': m['Coordinate'],
            'walkableCells': a['floor'],
            'spawnDistance': distance_between(a['grid'],
                                             (spawns[0]['x'], spawns[0]['y']),
                                             (spawns[1]['x'], spawns[1]['y'])),
            'description': f"Carte Dofus authentique ({m['GlobalAreaName']}), mapId {m['MapId']}.",
            'width': a['w'], 'height': a['h'],
            'spawns': spawns,
            'startingCells': starting_cells, 'placement': placement,
            'obstacles': obstacles,
        })

    lines = [
        '// GENERATED by scripts/import_dofus_maps.py — do not edit by hand.',
        '// Real Dofus 1.29 maps decoded from the OblivionRetro emulator',
        "// (OblivionRetro/AivyDofus/Resources/Maps.json, algorithm from Map.cs).",
        '',
        'export const DOFUS_MAPS_RAW = ' + json.dumps(entries, ensure_ascii=False, indent=2) + ';',
        '',
    ]
    OUT_JS.write_text('\n'.join(lines), encoding='utf-8')
    print(f"wrote {OUT_JS} with {len(entries)} maps: {[e['id'] for e in entries]}")


if __name__ == '__main__':
    if len(sys.argv) < 2 or sys.argv[1] == 'report':
        cmd_report()
    elif sys.argv[1] == 'show':
        cmd_show(int(sys.argv[2]))
    elif sys.argv[1] == 'generate':
        cmd_generate([int(x) for x in sys.argv[2:]] or DEFAULT_MAPS)
    else:
        print(__doc__)
