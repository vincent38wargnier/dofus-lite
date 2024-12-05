import { getValidMoves } from '../../utils/movement';
import { LineOfSight } from '../../utils/lineOfSight';

export class BoardInteractionManager {
  constructor(gameState) {
    this.gameState = gameState;
    this.selectedCell = null;
    this.highlightedCells = new Set();
    this.currentAction = null;
    this.listeners = new Set();
  }

  // Selection handling
  handleCellClick = (x, y) => {
    const cell = this.gameState.board.getCell(x, y);
    
    if (!cell) return;

    switch (this.currentAction) {
      case 'MOVE':
        this.handleMoveClick(x, y);
        break;
      case 'CAST_SORT':
        this.handleSortClick(x, y);
        break;
      default:
        this.handleDefaultClick(x, y);
    }
  }

  handleDefaultClick(x, y) {
    const cell = this.gameState.board.getCell(x, y);
    const currentPlayer = this.gameState.currentPlayer;

    // If clicking on current player's cell, show movement options
    if (cell.occupant === currentPlayer) {
      this.startMoveAction(x, y);
    } 
    // If clicking on another player, show targeting options
    else if (cell.occupant && currentPlayer.getSorts().length > 0) {
      this.startTargetingAction(x, y);
    }

    this.notifyListeners('cellSelected', { x, y, cell });
  }

  handleMoveClick(x, y) {
    const currentPlayer = this.gameState.currentPlayer;
    
    if (this.isValidMove(x, y)) {
      this.executeMoveAction(x, y);
    }
    
    this.clearAction();
  }

  handleSortClick(x, y) {
    const cell = this.gameState.board.getCell(x, y);
    
    if (this.isValidTarget(x, y)) {
      this.executeSortAction(x, y, cell.occupant);
    }
    
    this.clearAction();
  }

  // Action management
  startMoveAction(x, y) {
    const currentPlayer = this.gameState.currentPlayer;
    this.currentAction = 'MOVE';
    this.selectedCell = { x, y };
    
    // Show valid moves
    const validMoves = getValidMoves(currentPlayer, this.gameState.board, currentPlayer.getPM());
    this.highlightCells(validMoves.map(move => move.position));
    
    this.notifyListeners('moveStarted', { validMoves });
  }

  startTargetingAction(x, y) {
    const currentPlayer = this.gameState.currentPlayer;
    this.currentAction = 'CAST_SORT';
    this.selectedCell = { x, y };
    
    // Show valid targets based on selected sort
    const validTargets = this.getValidTargets();
    this.highlightCells(validTargets);
    
    this.notifyListeners('targetingStarted', { validTargets });
  }

  clearAction() {
    this.currentAction = null;
    this.selectedCell = null;
    this.clearHighlights();
    this.notifyListeners('actionCleared');
  }

  // Validation
  isValidMove(x, y) {
    if (!this.selectedCell) return false;
    
    const validMoves = getValidMoves(
      this.gameState.currentPlayer,
      this.gameState.board,
      this.gameState.currentPlayer.getPM()
    );

    return validMoves.some(move => 
      move.position.x === x && move.position.y === y
    );
  }

  isValidTarget(x, y) {
    if (!this.selectedCell) return false;
    
    const currentPlayer = this.gameState.currentPlayer;
    const playerPos = this.gameState.board.findPlayerPosition(currentPlayer);
    const targetCell = this.gameState.board.getCell(x, y);
    
    return targetCell.occupant && 
           targetCell.occupant !== currentPlayer &&
           LineOfSight.hasLineOfSight(playerPos, { x, y }, this.gameState.board);
  }

  // Highlight management
  highlightCells(cells) {
    this.clearHighlights();
    this.highlightedCells = new Set(cells.map(cell => `${cell.x},${cell.y}`));
    this.gameState.board.highlightCells(cells);
    this.notifyListeners('highlightsUpdated', { highlightedCells: this.highlightedCells });
  }

  clearHighlights() {
    this.gameState.board.clearHighlights();
    this.highlightedCells.clear();
    this.notifyListeners('highlightsUpdated', { highlightedCells: this.highlightedCells });
  }

  // Event handling
  addListener(listener) {
    this.listeners.add(listener);
  }

  removeListener(listener) {
    this.listeners.delete(listener);
  }

  notifyListeners(event, data) {
    for (const listener of this.listeners) {
      listener(event, data);
    }
  }
}

export default BoardInteractionManager;
