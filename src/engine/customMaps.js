import { MAPS, OBSTACLE_TYPES } from './maps';

export const MAP_ART_MAX_BYTES = 8 * 1048576;
export const MAX_CUSTOM_MAP_SIZE = 40;
const record = value => !!value && typeof value === 'object' && !Array.isArray(value);
const integer = (n, min, max) => Number.isSafeInteger(n) && n >= min && n <= max;
const keys = (value, allowed) => record(value) && Object.keys(value).every(key => allowed.includes(key));
const pointKey = p => `${p.x},${p.y}`;

// A package owns geometry and artwork together. Never register imported IDs in
// the global native catalogue: two archives may safely contain different maps.
export function customMapErrors(map) {
  const errors = [];
  if (!keys(map, ['version', 'id', 'name', 'description', 'width', 'height', 'background', 'startingCells', 'obstacles'])
    || map.version !== 1 || !/^custom-[a-z0-9-]{1,80}$/.test(map.id || '')
    || typeof map.name !== 'string' || !map.name.trim() || map.name.length > 120
    || typeof map.description !== 'string' || map.description.length > 800
    || !integer(map.width, 5, MAX_CUSTOM_MAP_SIZE) || !integer(map.height, 5, MAX_CUSTOM_MAP_SIZE)) return ['Terrain personnalisé invalide.'];
  const point = p => keys(p, ['x', 'y']) && integer(p.x, 0, map.width - 1) && integer(p.y, 0, map.height - 1);
  const bg = map.background;
  if (!keys(bg, ['artworkId', 'file', 'width', 'height', 'hw', 'top', 'originX', 'propsFile'])
    || !/^[a-zA-Z0-9_-]{1,100}$/.test(bg.artworkId || '') || !/^[a-z][a-z0-9_-]*\.png$/.test(bg.file || '')
    || (bg.propsFile != null && (!/^[a-z][a-z0-9_-]*\.png$/.test(bg.propsFile) || bg.propsFile === bg.file))
    || !integer(bg.width, 256, 2048) || !integer(bg.height, 256, 1536) || !integer(bg.hw, 8, 128)
    || !integer(bg.top, 0, bg.height) || !integer(bg.originX, 1, 100)) errors.push('Image ou projection du terrain invalide.');
  else if ((bg.originX - map.height) * bg.hw < 0 || (bg.originX + map.width) * bg.hw > bg.width
    || bg.top + (map.width + map.height) * bg.hw / 2 > bg.height) errors.push('Les cases sortent de l’image du terrain.');
  if (!Array.isArray(map.obstacles) || map.obstacles.length > map.width * map.height
    || map.obstacles.some(o => !keys(o, ['x', 'y', 'type', 'prop']) || !point({ x: o.x, y: o.y })
      || !Object.hasOwn(OBSTACLE_TYPES, o.type) || !['pillar', 'barricade', 'brazier', undefined].includes(o.prop)
      || (o.prop === 'pillar' && !['WALL', 'ROCK'].includes(o.type)) || (['barricade', 'brazier'].includes(o.prop) && o.type !== 'BUSH'))
    || new Set(map.obstacles.map(pointKey)).size !== map.obstacles.length) return [...errors, 'Obstacles du terrain invalides.'];
  const blocked = new Set(map.obstacles.map(pointKey));
  if (!Array.isArray(map.startingCells) || map.startingCells.length !== 2
    || map.startingCells.some(camp => !Array.isArray(camp) || camp.length < 8 || camp.length > 32
      || camp.some(p => !point(p) || blocked.has(pointKey(p))))
    || new Set(map.startingCells.flat().map(pointKey)).size !== map.startingCells.flat().length) return [...errors, 'Prévoyez au moins 8 départs libres et distincts par camp.'];
  const visited = new Set(), queue = [map.startingCells[0][0]];
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i], key = pointKey(p);
    if (!point(p) || blocked.has(key) || visited.has(key)) continue;
    visited.add(key);
    queue.push({ x: p.x - 1, y: p.y }, { x: p.x + 1, y: p.y }, { x: p.x, y: p.y - 1 }, { x: p.x, y: p.y + 1 });
  }
  if (map.startingCells.flat().some(p => !visited.has(pointKey(p)))) errors.push('Les deux camps doivent être reliés par un passage.');
  return errors;
}

export function resolveCustomMap(battlefield) {
  const errors = customMapErrors(battlefield);
  if (errors.length) throw new Error(errors.join(' '));
  return { ...battlefield, kind: 'custom', spawns: battlefield.startingCells.map(camp => camp[0]),
    placement: { status: 'custom' }, originalVisuals: true,
    obstacles: Object.fromEntries(battlefield.obstacles.map(o => [pointKey(o), { ...OBSTACLE_TYPES[o.type], ...o }])) };
}

export function dungeonMap(dungeon) {
  if (!dungeon?.battlefield) return MAPS[dungeon?.mapId] || null;
  return !customMapErrors(dungeon.battlefield).length && dungeon.mapId === dungeon.battlefield.id ? resolveCustomMap(dungeon.battlefield) : null;
}
