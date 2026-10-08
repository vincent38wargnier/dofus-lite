// Grid geometry: distances, alignment and line of sight ("ligne de vue").
// Distances are Manhattan, like Dofus (diamond-shaped ranges).

export function key(x, y) {
  return `${x},${y}`;
}

export function dist(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function samePos(a, b) {
  return a.x === b.x && a.y === b.y;
}

export function isAligned(a, b) {
  return a.x === b.x || a.y === b.y;
}

export function adjacentCells(pos) {
  return [
    { x: pos.x + 1, y: pos.y },
    { x: pos.x - 1, y: pos.y },
    { x: pos.x, y: pos.y + 1 },
    { x: pos.x, y: pos.y - 1 },
  ];
}

// All cells strictly between a and b touched by the segment joining the two
// cell centers (integer supercover — no floating point, corners count as
// touching both adjacent cells, which makes LoS symmetrical and strict).
export function cellsBetween(a, b) {
  const cells = [];
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  const nx = Math.abs(dx);
  const ny = Math.abs(dy);
  const sx = Math.sign(dx);
  const sy = Math.sign(dy);
  let x = a.x;
  let y = a.y;
  let ix = 0;
  let iy = 0;
  while (ix < nx || iy < ny) {
    const decision = (1 + 2 * ix) * ny - (1 + 2 * iy) * nx;
    if (decision === 0) {
      // Exact corner crossing: both side cells are considered crossed.
      cells.push({ x: x + sx, y });
      cells.push({ x, y: y + sy });
      x += sx;
      y += sy;
      ix++;
      iy++;
    } else if (decision < 0) {
      x += sx;
      ix++;
    } else {
      y += sy;
      iy++;
    }
    if (!(x === b.x && y === b.y)) cells.push({ x, y });
  }
  // Remove endpoints if they slipped in (corner case near target).
  return cells.filter((c) => !samePos(c, a) && !samePos(c, b));
}

// blockers: (x, y) => boolean. Both obstacles marked blocksLos and living
// fighters block the line of sight, like in Dofus.
export function hasLineOfSight(from, to, isBlocking) {
  return cellsBetween(from, to).every((c) => !isBlocking(c.x, c.y));
}

// Diamond of cells at Manhattan distance within [minRange, maxRange].
export function cellsInRange(pos, minRange, maxRange, width, height, lineOnly = false) {
  const out = [];
  for (let y = Math.max(0, pos.y - maxRange); y <= Math.min(height - 1, pos.y + maxRange); y++) {
    for (let x = Math.max(0, pos.x - maxRange); x <= Math.min(width - 1, pos.x + maxRange); x++) {
      const d = dist(pos, { x, y });
      if (d < minRange || d > maxRange) continue;
      if (lineOnly && !isAligned(pos, { x, y })) continue;
      out.push({ x, y });
    }
  }
  return out;
}

// Spell zones, Dofus 1.29 encoding: two chars [shape][size].
// Shapes: P = point, C = cercle (Manhattan disc), X = croix, L = ligne
// (from the caster through the target). Size letter: a=0, b=1, c=2…
// Sizes are capped for arena sanity (some spells encode "infinite" lines).
const ZONE_SIZE_CAP = 3;

function zoneSize(code) {
  const c = code.charCodeAt(1) - 97; // 'a' -> 0
  if (Number.isNaN(c) || c < 0) return ZONE_SIZE_CAP;
  return Math.min(ZONE_SIZE_CAP, c);
}

export function spellZoneCells(code, target, casterPos) {
  const shape = code ? code[0] : 'P';
  const size = code && code.length > 1 ? zoneSize(code) : 0;
  if (shape === 'C' && size > 0) {
    const cells = [];
    for (let dy = -size; dy <= size; dy++) {
      for (let dx = -size; dx <= size; dx++) {
        if (Math.abs(dx) + Math.abs(dy) <= size) {
          cells.push({ x: target.x + dx, y: target.y + dy });
        }
      }
    }
    return cells;
  }
  if (shape === 'X' && size > 0) {
    const cells = [{ ...target }];
    for (let i = 1; i <= size; i++) {
      cells.push({ x: target.x + i, y: target.y });
      cells.push({ x: target.x - i, y: target.y });
      cells.push({ x: target.x, y: target.y + i });
      cells.push({ x: target.x, y: target.y - i });
    }
    return cells;
  }
  if (shape === 'L') {
    // Ligne: from the target, continuing away from the caster.
    const dx = Math.sign(target.x - casterPos.x);
    const dy = Math.sign(target.y - casterPos.y);
    const cells = [{ ...target }];
    if (dx !== 0 || dy !== 0) {
      for (let i = 1; i <= size; i++) {
        cells.push({ x: target.x + dx * i, y: target.y + dy * i });
      }
    }
    return cells;
  }
  return [{ ...target }];
}
