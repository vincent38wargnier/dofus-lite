import { key } from './geometry';
import { DOFUS_MAPS_RAW } from './dofusMaps';

// Obstacle types:
//   WALL / ROCK  block movement and line of sight
//   BUSH         blocks movement only (LoS passes over)
//   HOLE / WATER block movement only (you can see across)
//   VOID         outside the playable area (real Dofus maps are diamonds)
export const OBSTACLE_TYPES = {
  WALL: { type: 'WALL', emoji: '🧱', blocksMove: true, blocksLos: true },
  ROCK: { type: 'ROCK', emoji: '🪨', blocksMove: true, blocksLos: true },
  BUSH: { type: 'BUSH', emoji: '🌳', blocksMove: true, blocksLos: false },
  HOLE: { type: 'HOLE', emoji: '🕳️', blocksMove: true, blocksLos: false },
  WATER: { type: 'WATER', emoji: '', blocksMove: true, blocksLos: false },
  VOID: { type: 'VOID', emoji: '', blocksMove: true, blocksLos: true },
};

function make(id, name, description, width, height, spawns, obstacleList) {
  const obstacles = {};
  for (const [type, x, y] of obstacleList) {
    obstacles[key(x, y)] = { ...OBSTACLE_TYPES[type], x, y };
  }
  return { id, name, description, width, height, spawns, obstacles };
}

export const MAPS = {
  arene: make(
    'arene', 'Arène du Koliséum', 'Terrain ouvert, quatre piliers.', 13, 13,
    [{ x: 1, y: 6 }, { x: 11, y: 6 }],
    [
      ['ROCK', 4, 4], ['ROCK', 8, 4], ['ROCK', 4, 8], ['ROCK', 8, 8],
      ['BUSH', 6, 2], ['BUSH', 6, 10],
      ['HOLE', 6, 6],
    ],
  ),

  muraille: make(
    'muraille', 'La Muraille', 'Un mur central perce de deux breches.', 13, 13,
    [{ x: 1, y: 6 }, { x: 11, y: 6 }],
    [
      ['WALL', 6, 1], ['WALL', 6, 2], ['WALL', 6, 3], ['WALL', 6, 4],
      ['WALL', 6, 8], ['WALL', 6, 9], ['WALL', 6, 10], ['WALL', 6, 11],
      ['ROCK', 3, 6], ['ROCK', 9, 6],
      ['BUSH', 2, 2], ['BUSH', 10, 10],
    ],
  ),

  canyon: make(
    'canyon', 'Le Canyon', 'Crevasses et rochers, gare aux poussées.', 13, 13,
    [{ x: 2, y: 2 }, { x: 10, y: 10 }],
    [
      ['HOLE', 6, 5], ['HOLE', 6, 6], ['HOLE', 6, 7],
      ['HOLE', 5, 6], ['HOLE', 7, 6],
      ['ROCK', 2, 9], ['ROCK', 10, 3],
      ['WALL', 3, 5], ['WALL', 9, 7],
      ['BUSH', 5, 10], ['BUSH', 7, 2],
    ],
  ),
};

// Real Dofus 1.29 maps imported from the OblivionRetro emulator
// (see scripts/import_dofus_maps.py).
for (const raw of DOFUS_MAPS_RAW) {
  MAPS[raw.id] = make(
    raw.id, `🗺 ${raw.name}`, raw.description,
    raw.width, raw.height, raw.spawns,
    raw.obstacles.map((o) => [o.t, o.x, o.y]),
  );
}

export const MAP_IDS = Object.keys(MAPS);
