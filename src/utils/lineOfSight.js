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
    return !points.some(point => board.blocksLineOfSight(point.x, point.y));
  }

  static calculateDistance(pos1, pos2) {
    return Math.abs(pos1.x - pos2.x) + Math.abs(pos1.y - pos2.y);
  }

  static isInSpellRange(position, target, minRange, maxRange) {
    const distance = this.calculateDistance(position, target);
    return distance >= minRange && distance <= maxRange;
  }

  static getPatternCells(center, pattern, patternSize, orientation = 0) {
    const cells = new Set();
    
    switch (pattern) {
      case 'SINGLE':
        cells.add(`${center.x},${center.y}`);
        break;

      case 'CIRCLE':
        for (let x = center.x - patternSize; x <= center.x + patternSize; x++) {
          for (let y = center.y - patternSize; y <= center.y + patternSize; y++) {
            if (this.calculateDistance(center, {x, y}) <= patternSize) {
              cells.add(`${x},${y}`);
            }
          }
        }
        break;

      case 'CROSS':
        // Horizontal line
        for (let x = center.x - patternSize; x <= center.x + patternSize; x++) {
          cells.add(`${x},${center.y}`);
        }
        // Vertical line
        for (let y = center.y - patternSize; y <= center.y + patternSize; y++) {
          cells.add(`${center.x},${y}`);
        }
        break;

      case 'LINE':
        // Handle orientation for line spells
        const dx = Math.cos(orientation * Math.PI / 2);
        const dy = Math.sin(orientation * Math.PI / 2);
        for (let i = 0; i <= patternSize; i++) {
          const x = Math.round(center.x + i * dx);
          const y = Math.round(center.y + i * dy);
          cells.add(`${x},${y}`);
        }
        break;

      case 'CONE':
        for (let x = center.x - patternSize; x <= center.x + patternSize; x++) {
          for (let y = center.y - patternSize; y <= center.y + patternSize; y++) {
            const distance = this.calculateDistance(center, {x, y});
            if (distance <= patternSize) {
              const angle = Math.atan2(y - center.y, x - center.x);
              const normalizedAngle = ((angle + 2 * Math.PI) % (2 * Math.PI)) * (180 / Math.PI);
              if (normalizedAngle >= orientation - 45 && normalizedAngle <= orientation + 45) {
                cells.add(`${x},${y}`);
              }
            }
          }
        }
        break;

      case 'STAR':
        // Center point
        cells.add(`${center.x},${center.y}`);
        // Arms of the star
        const directions = [[0,1], [1,0], [0,-1], [-1,0], [1,1], [-1,-1], [1,-1], [-1,1]];
        directions.forEach(([dx, dy]) => {
          for (let i = 1; i <= patternSize; i++) {
            cells.add(`${center.x + dx * i},${center.y + dy * i}`);
          }
        });
        break;

      case 'DIAMOND':
        for (let d = 0; d <= patternSize; d++) {
          for (let i = 0; i <= d; i++) {
            cells.add(`${center.x + i},${center.y + (d - i)}`);
            cells.add(`${center.x + i},${center.y - (d - i)}`);
            cells.add(`${center.x - i},${center.y + (d - i)}`);
            cells.add(`${center.x - i},${center.y - (d - i)}`);
          }
        }
        break;

      default:
        cells.add(`${center.x},${center.y}`);
    }

    return cells;
  }

  static getVisibleCells(position, spell, board) {
    const visibleCells = new Set();
    const maxRange = spell.range;
    const minRange = spell.min_range || 0;
    const pattern = spell.pattern || 'SINGLE';
    const patternSize = spell.pattern_size || 0;
    
    // For single target spells or patterns that need center point checks
    if (pattern === 'SINGLE' || pattern === 'CIRCLE' || pattern === 'DIAMOND') {
      // Check all possible center points
      for (let x = Math.max(0, position.x - maxRange); x <= Math.min(board.width - 1, position.x + maxRange); x++) {
        for (let y = Math.max(0, position.y - maxRange); y <= Math.min(board.height - 1, position.y + maxRange); y++) {
          const target = { x, y };
          
          // Check if the center point is in range and has line of sight
          if (this.isInSpellRange(position, target, minRange, maxRange) && 
              this.hasLineOfSight(position, target, board)) {
            // Get and validate each cell in the pattern
            const patternCells = this.getPatternCells(target, pattern, patternSize);
            patternCells.forEach(cellKey => {
              const [cellX, cellY] = cellKey.split(',').map(Number);
              if (board.isWithinBounds(cellX, cellY) && this.hasLineOfSight(position, {x: cellX, y: cellY}, board)) {
                visibleCells.add(cellKey);
              }
            });
          }
        }
      }
    } else {
      // For directional patterns (LINE, CONE), check from edges inward
      const extendedRange = maxRange + patternSize;
      for (let x = Math.max(0, position.x - extendedRange); x <= Math.min(board.width - 1, position.x + extendedRange); x++) {
        for (let y = Math.max(0, position.y - extendedRange); y <= Math.min(board.height - 1, position.y + extendedRange); y++) {
          const target = { x, y };
          const distance = this.calculateDistance(position, target);
          
          if (distance <= extendedRange && this.hasLineOfSight(position, target, board)) {
            const patternCells = this.getPatternCells(target, pattern, patternSize);
            patternCells.forEach(cellKey => {
              const [cellX, cellY] = cellKey.split(',').map(Number);
              // Validate each cell in the pattern is within actual spell range
              if (board.isWithinBounds(cellX, cellY) && 
                  this.isInSpellRange(position, {x: cellX, y: cellY}, minRange, maxRange) && 
                  this.hasLineOfSight(position, {x: cellX, y: cellY}, board)) {
                visibleCells.add(cellKey);
              }
            });
          }
        }
      }
    }

    return visibleCells;
  }
}