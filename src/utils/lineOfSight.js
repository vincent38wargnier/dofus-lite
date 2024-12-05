export class LineOfSight {
  // Implementation of Bresenham's line algorithm for line of sight
  static getLine(start, end) {
    const points = [];
    let x1 = start.x;
    let y1 = start.y;
    const x2 = end.x;
    const y2 = end.y;

    const dx = Math.abs(x2 - x1);
    const dy = Math.abs(y2 - y1);
    const sx = (x1 < x2) ? 1 : -1;
    const sy = (y1 < y2) ? 1 : -1;
    let err = dx - dy;

    while (true) {
      points.push({ x: x1, y: y1 });

      if (x1 === x2 && y1 === y2) break;

      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        x1 += sx;
      }
      if (e2 < dx) {
        err += dx;
        y1 += sy;
      }
    }

    return points;
  }

  static hasLineOfSight(start, end, board) {
    // Get all points along the line
    const points = this.getLine(start, end);
    
    // Remove start and end points from check
    points.shift(); // Remove start
    if (points.length > 0) points.pop(); // Remove end

    // Check if any point blocks line of sight
    return !points.some(point => board.blocksLineOfSight(point));
  }

  static getVisibleCells(position, range, board) {
    const visibleCells = new Set();
    
    // Check all cells within range
    for (let x = Math.max(0, position.x - range); x <= Math.min(board.width - 1, position.x + range); x++) {
      for (let y = Math.max(0, position.y - range); y <= Math.min(board.height - 1, position.y + range); y++) {
        const target = { x, y };
        if (this.hasLineOfSight(position, target, board)) {
          visibleCells.add(`${x},${y}`);
        }
      }
    }

    return visibleCells;
  }
}
