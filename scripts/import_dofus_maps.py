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

ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_'
H = {c: i for i, c in enumerate(ALPHABET)}

# Cell kinds after decoding
FLOOR, BLOCK, WATER, VOID = 'floor', 'block', 'water', 'void'
# BLOCK: blocks movement + line of sight (rock/wall/tree trunk)
# WATER: blocks movement only (water, pits — you can shoot across)
# VOID:  outside the playable diamond


def decode(m):
    data = m['MapData']
    w = m['Width']
    cells = {}
    for cid in range(len(data) // 10):
        b = [H[c] for c in data[cid * 10:cid * 10 + 10]]
        active = (b[0] & 32) != 0
        see_through = (b[0] & 1) == 1
        walkable = ((b[2] & 56) >> 3) != 0
        row = cid // (w * 2 - 1)
        y = row - ((cid - row * (w * 2 - 1)) % w)
        x = (cid - (w - 1) * y) // w
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
    rows = []
    for y, row in enumerate(a['grid']):
        line = ''
        for x, k in enumerate(row):
            if (x, y) == a['spawnA']:
                line += 'A'
            elif (x, y) == a['spawnB']:
                line += 'B'
            else:
                line += sym[k]
        rows.append(line)
    return '\n'.join(rows)


def slugify(name, map_id):
    s = unicodedata.normalize('NFKD', name).encode('ascii', 'ignore').decode()
    s = ''.join(c if c.isalnum() else '_' for c in s.lower()).strip('_')
    return f"{s}_{map_id}"


def load():
    return json.load(open(MAPS_JSON))


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
    print(f"{m['AreaName']} {m['Coordinate']} (mapId {map_id}) {a['w']}x{a['h']}")
    print(ascii_art(a))


def cmd_generate(map_ids):
    maps = load()
    by_id = {m['MapId']: m for m in maps}
    entries = []
    for mid in map_ids:
        m = by_id[mid]
        a = analyze(m)
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
            'name': f"{m['AreaName']} {m['Coordinate']}",
            'description': f"Carte Dofus authentique ({m['GlobalAreaName']}), mapId {m['MapId']}.",
            'width': a['w'], 'height': a['h'],
            'spawns': [{'x': a['spawnA'][0], 'y': a['spawnA'][1]},
                       {'x': a['spawnB'][0], 'y': a['spawnB'][1]}],
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
        cmd_generate([int(x) for x in sys.argv[2:]])
    else:
        print(__doc__)
