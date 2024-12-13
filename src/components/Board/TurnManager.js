import { AIPlayerController } from '../AI/AIPlayerController';

export class TurnManager {
  constructor() {
    this.aiPlayers = new Map();
    this.turnStartListeners = new Set();
  }

  registerAIPlayer(playerId, controller) {
    this.aiPlayers.set(playerId, controller);
  }

  unregisterAIPlayer(playerId) {
    this.aiPlayers.delete(playerId);
  }

  async startTurn(playerId) {
    // Notify listeners
    this.turnStartListeners.forEach(listener => listener(playerId));

    // If AI controlled, execute AI turn
    if (this.aiPlayers.has(playerId)) {
      const controller = this.aiPlayers.get(playerId);
      await controller.onTurnStart();
    }
  }

  addTurnStartListener(listener) {
    this.turnStartListeners.add(listener);
  }

  removeTurnStartListener(listener) {
    this.turnStartListeners.delete(listener);
  }
} 