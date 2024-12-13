export class GameState {
  constructor() {
    this.board = {
      cells: [],
      obstacles: [],
      dimensions: { width: 0, height: 0 }
    };
    this.players = {};
    this.currentTurn = {
      playerId: null,
      phase: 'MOVEMENT',
      remainingTime: 0
    };
  }
} 