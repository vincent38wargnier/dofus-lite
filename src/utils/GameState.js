import { TurnManager } from './turnManager';
import { ActionManager } from './ActionManager';
import { GAME_STATUS } from './constants';

export class GameState {
  constructor(players, board, settings = {}) {
    this.players = players;
    this.board = board;
    this.settings = {
      turnTimeLimit: 30000, // 30 seconds
      ...settings
    };

    this.turnManager = new TurnManager(players, this.settings.turnTimeLimit);
    this.actionManager = new ActionManager(this);
    this.status = GAME_STATUS.WAITING;
    this.winner = null;
    this.history = [];
  }

  start() {
    if (this.status !== GAME_STATUS.WAITING) {
      throw new Error('Game already started');
    }

    this.status = GAME_STATUS.ACTIVE;
    this.turnManager.startTurn();
  }

  pause() {
    if (this.status !== GAME_STATUS.ACTIVE) {
      throw new Error('Game not active');
    }

    this.status = GAME_STATUS.PAUSED;
  }

  resume() {
    if (this.status !== GAME_STATUS.PAUSED) {
      throw new Error('Game not paused');
    }

    this.status = GAME_STATUS.ACTIVE;
  }

  executeAction(action) {
    if (this.status !== GAME_STATUS.ACTIVE) {
      throw new Error('Game not active');
    }

    const result = this.actionManager.executeAction(action);
    this.history.push(result);

    // Check for game end conditions
    this.checkGameEnd();

    return result;
  }

  checkGameEnd() {
    const alivePlayers = this.players.filter(player => player.isAlive());

    if (alivePlayers.length <= 1) {
      this.status = GAME_STATUS.ENDED;
      this.winner = alivePlayers[0] || null;
    }
  }

  get currentPlayer() {
    return this.turnManager.getCurrentPlayer();
  }

  getPlayerPosition(player) {
    return this.board.findPlayerPosition(player);
  }

  // Save/Load functionality
  serialize() {
    return {
      players: this.players.map(player => player.serialize()),
      board: this.board.serialize(),
      settings: this.settings,
      status: this.status,
      winner: this.winner ? this.winner.id : null,
      history: this.history,
      turnState: this.turnManager.getState()
    };
  }

  static deserialize(data) {
    // Implementation of deserialization logic
    // This would reconstruct the full game state from saved data
  }

  // Event handling
  addListener(type, callback) {
    switch (type) {
      case 'turnStart':
      case 'turnEnd':
      case 'turnTimeout':
        this.turnManager.addListener(callback);
        break;
      // Add more event types as needed
    }
  }

  removeListener(type, callback) {
    switch (type) {
      case 'turnStart':
      case 'turnEnd':
      case 'turnTimeout':
        this.turnManager.removeListener(callback);
        break;
      // Add more event types as needed
    }
  }
}
