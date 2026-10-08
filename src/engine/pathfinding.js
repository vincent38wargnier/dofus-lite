import { key } from './geometry';

// BFS over walkable cells (4 directions, 1 PM per cell, like Dofus).
// isBlocked: (x, y) => boolean — obstacles that block movement and fighters.
// Returns { costs: Map<key, cost>, parents: Map<key, key> } up to maxCost.
export function bfs(start, maxCost, width, height, isBlocked) {
  const costs = new Map([[key(start.x, start.y), 0]]);
  const parents = new Map();
  const queue = [start];
  while (queue.length) {
    const cur = queue.shift();
    const curCost = costs.get(key(cur.x, cur.y));
    if (curCost >= maxCost) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const k = key(nx, ny);
      if (costs.has(k)) continue;
      if (isBlocked(nx, ny)) continue;
      costs.set(k, curCost + 1);
      parents.set(k, key(cur.x, cur.y));
      queue.push({ x: nx, y: ny });
    }
  }
  return { costs, parents };
}

export function reconstructPath(start, goal, parents) {
  const path = [];
  let cur = key(goal.x, goal.y);
  const startKey = key(start.x, start.y);
  while (cur && cur !== startKey) {
    const [x, y] = cur.split(',').map(Number);
    path.unshift({ x, y });
    cur = parents.get(cur);
  }
  if (cur !== startKey) return null;
  return [{ ...start }, ...path];
}

// All cells reachable within pm points: [{ pos, cost, path }]
export function reachableCells(start, pm, width, height, isBlocked) {
  const { costs, parents } = bfs(start, pm, width, height, isBlocked);
  const out = [];
  for (const [k, cost] of costs) {
    if (cost === 0) continue;
    const [x, y] = k.split(',').map(Number);
    out.push({ pos: { x, y }, cost, path: reconstructPath(start, { x, y }, parents) });
  }
  return out;
}

// Shortest path start -> goal ignoring PM limit (used by bots to walk
// toward a distant target over several turns). Bounded by board size.
export function shortestPath(start, goal, width, height, isBlocked) {
  const { costs, parents } = bfs(start, width * height, width, height, isBlocked);
  if (!costs.has(key(goal.x, goal.y))) return null;
  return reconstructPath(start, goal, parents);
}
