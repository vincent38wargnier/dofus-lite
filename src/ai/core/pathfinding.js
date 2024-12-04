import { isValidPosition } from './utils';

export function findPath(start, end, board, maxDistance) {
    const queue = [{pos: start, path: [start]}];
    const visited = new Set();

    while (queue.length > 0) {
        const {pos, path} = queue.shift();
        const key = `${pos.x},${pos.y}`;

        if (visited.has(key)) continue;
        visited.add(key);

        if (pos.x === end.x && pos.y === end.y) {
            if (path.length - 1 <= maxDistance) return path;
            continue;
        }

        if (path.length - 1 >= maxDistance) continue;

        const directions = [{x: 0, y: 1}, {x: 0, y: -1}, {x: 1, y: 0}, {x: -1, y: 0}];
        for (const dir of directions) {
            const newX = pos.x + dir.x;
            const newY = pos.y + dir.y;

            if (isValidPosition(newX, newY) && !board[newY][newX].obstacle) {
                queue.push({
                    pos: {x: newX, y: newY},
                    path: [...path, {x: newX, y: newY}]
                });
            }
        }
    }

    return null;
}

export function hasLineOfSight(start, end, board) {
    // Bresenham's line algorithm
    const dx = Math.abs(end.x - start.x);
    const dy = Math.abs(end.y - start.y);
    const sx = start.x < end.x ? 1 : -1;
    const sy = start.y < end.y ? 1 : -1;
    let err = dx - dy;

    let x = start.x;
    let y = start.y;

    while (true) {
        if (x === end.x && y === end.y) return true;
        if (board[y][x].obstacle) return false;

        const e2 = 2 * err;
        if (e2 > -dy) {
            err -= dy;
            x += sx;
        }
        if (e2 < dx) {
            err += dx;
            y += sy;
        }
    }
}