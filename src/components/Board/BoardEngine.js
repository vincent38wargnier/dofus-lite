import { CELL_TYPES } from '../../constants/game/mechanics';
import { BOARD_CONFIG } from '../../constants/game/board';

export class BoardEngine {
  constructor(width = BOARD_CONFIG.DEFAULT_SIZE.columns, height = BOARD_CONFIG.DEFAULT_SIZE.rows) {
    this.width = width;
    this.height = height;
    this.grid = this.initializeGrid();
  }

  initializeGrid() {
    return Array(this.height).fill(null).map(() =>
      Array(this.width).fill(null).map(() => ({
        type: CELL_TYPES.NORMAL,
        occupant: null,
        obstacle: null,
        highlighted: false
      }))
    );
  }

  isWithinBounds(x, y) {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }

  getCell(x, y) {
    if (!this.isWithinBounds(x, y)) return null;
    return this.grid[y][x];
  }

  setCell(x, y, data) {
    if (!this.isWithinBounds(x, y)) return false;
    this.grid[y][x] = { ...this.grid[y][x], ...data };
    return true;
  }

  findPlayerPosition(player) {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.grid[y][x].occupant === player) {
          return { x, y };
        }
      }
    }
    return null;
  }

  placePlayer(player, x, y) {
    if (!this.isWithinBounds(x, y) || this.grid[y][x].occupant || this.grid[y][x].obstacle) {
      return false;
    }
    this.setCell(x, y, { occupant: player });
    return true;
  }

  movePlayer(fromX, fromY, toX, toY) {
    const fromCell = this.getCell(fromX, fromY);
    if (!fromCell || !fromCell.occupant) return false;

    const toCell = this.getCell(toX, toY);
    if (!toCell || toCell.occupant || toCell.obstacle) return false;

    const player = fromCell.occupant;
    this.setCell(fromX, fromY, { occupant: null });
    this.setCell(toX, toY, { occupant: player });
    return true;
  }

  placeObstacle(obstacle, x, y) {
    if (!this.isWithinBounds(x, y) || this.grid[y][x].occupant || this.grid[y][x].obstacle) {
      return false;
    }
    this.setCell(x, y, { obstacle });
    return true;
  }

  isBlocked(x, y) {
    const cell = this.getCell(x, y);
    return !cell || cell.obstacle || cell.occupant;
  }

  blocksLineOfSight(x, y) {
    const cell = this.getCell(x, y);
    return !cell || (cell.obstacle && cell.obstacle.blocksLOS);
  }

  highlightCells(cells, highlight = true) {
    cells.forEach(({ x, y }) => {
      if (this.isWithinBounds(x, y)) {
        this.setCell(x, y, { highlighted: highlight });
      }
    });
  }

  clearHighlights() {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.grid[y][x].highlighted) {
          this.setCell(x, y, { highlighted: false });
        }
      }
    }
  }

  serialize() {
    return {
      width: this.width,
      height: this.height,
      grid: this.grid.map(row =>
        row.map(cell => ({
          type: cell.type,
          occupantId: cell.occupant ? cell.occupant.id : null,
          obstacleType: cell.obstacle ? cell.obstacle.type : null,
          highlighted: cell.highlighted
        }))
      )
    };
  }

  static deserialize(data, getPlayerById) {
    const board = new BoardEngine(data.width, data.height);
    board.grid = data.grid.map(row =>
      row.map(cell => ({
        type: cell.type,
        occupant: cell.occupantId ? getPlayerById(cell.occupantId) : null,
        obstacle: cell.obstacleType ? { type: cell.obstacleType } : null,
        highlighted: cell.highlighted
      }))
    );
    return board;
  }
}

export default BoardEngine;