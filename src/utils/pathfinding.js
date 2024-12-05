import { BOARD_SIZE, CELL_TYPES } from './constants';

export const findPath = (start, end, board, maxDistance) => {
  if (!start || !end) return null;
  
  const queue = [{ pos: start, path: [start], cost: 0 }];
  const visited = new Set();

  while (queue.length > 0) {
    const { pos, path, cost } = queue.shift();
    const key = `${pos.x},${pos.y}`;

    if (visited.has(key)) continue;
    visited.add(key);

    if (pos.x === end.x && pos.y === end.y) {
      return path;
    }

    if (cost >= maxDistance) continue;

    const directions = [
      { x: 1, y: 0 }, { x: -1, y: 0 },
      { x: 0, y: 1 }, { x: 0, y: -1 }
    ];

    for (const dir of directions) {
      const newX = pos.x + dir.x;
      const newY = pos.y + dir.y;

      if (
        newX >= 0 && newX < BOARD_SIZE &&
        newY >= 0 && newY < BOARD_SIZE &&
        board[newY][newX].type === CELL_TYPES.EMPTY
      ) {
        queue.push({
          pos: { x: newX, y: newY },
          path: [...path, { x: newX, y: newY }],
          cost: cost + 1
        });
      }
    }
  }

  return null;
};