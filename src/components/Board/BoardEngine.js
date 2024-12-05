import { BOARD_CONFIG, CELL_TYPES } from '../../utils/constants';

class BoardEngine {
  constructor(rows = BOARD_CONFIG.DEFAULT_SIZE.rows, columns = BOARD_CONFIG.DEFAULT_SIZE.columns) {
    this.rows = rows;
    this.columns = columns;
    this.board = this.initializeBoard();
  }

  initializeBoard() {
    return Array(this.rows).fill(null).map(() =>
      Array(this.columns).fill(null).map(() => ({
        type: CELL_TYPES.NORMAL,
        occupant: null,
        obstacle: null,
        isHighlighted: false
      }))
    );
  }

  getCell(x, y) {
    if (this.isValidPosition(x, y)) {
      return this.board[y][x];
    }
    return null;
  }

  setCell(x, y, cellData) {
    if (this.isValidPosition(x, y)) {
      this.board[y][x] = { ...this.board[y][x], ...cellData };
      return true;
    }
    return false;
  }

  isValidPosition(x, y) {
    return x >= 0 && x < this.columns && y >= 0 && y < this.rows;
  }

  placePlayer(player, x, y) {
    if (this.isValidPosition(x, y) && !this.board[y][x].occupant && !this.board[y][x].obstacle) {
      this.setCell(x, y, { occupant: player });
      return true;
    }
    return false;
  }

  removePlayer(x, y) {
    if (this.isValidPosition(x, y) && this.board[y][x].occupant) {
      this.setCell(x, y, { occupant: null });
      return true;
    }
    return false;
  }

  placeObstacle(obstacle, x, y) {
    if (this.isValidPosition(x, y) && !this.board[y][x].occupant && !this.board[y][x].obstacle) {
      this.setCell(x, y, { obstacle });
      return true;
    }
    return false;
  }

  highlightCells(cells, highlight = true) {
    cells.forEach(({ x, y }) => {
      if (this.isValidPosition(x, y)) {
        this.setCell(x, y, { isHighlighted: highlight });
      }
    });
  }

  clearHighlights() {
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.columns; x++) {
        if (this.board[y][x].isHighlighted) {
          this.setCell(x, y, { isHighlighted: false });
        }
      }
    }
  }

  getBoardState() {
    return this.board;
  }

  // Additional methods to be implemented:
  // - movePlayer(player, fromX, fromY, toX, toY)
  // - getValidMoves(player)
  // - getLineOfSight(fromX, fromY, toX, toY)
}

export default BoardEngine;
