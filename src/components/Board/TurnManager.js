import { AIPlayerController } from '../AI/AIPlayerController';

export class TurnManager {
  constructor() {
    this.players = new Map();
    this.turnStartListeners = new Set();
  }

  async startTurn(playerId) {
    const player = this.players.get(playerId);
    
    if (player instanceof AIPlayerController) {
      await player.onTurnStart();
    } else {
      this.notifyTurnStart(playerId);
    }
  }

  registerAIPlayer(playerId, aiController) {
    this.players.set(playerId, aiController);
  }

  notifyTurnStart(playerId) {
    this.turnStartListeners.forEach(listener => listener(playerId));
  }

  addTurnStartListener(listener) {
    this.turnStartListeners.add(listener);
  }

  removeTurnStartListener(listener) {
    this.turnStartListeners.delete(listener);
  }
} 