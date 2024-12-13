export class AIStrategy {
  updateGameState(state) {
    throw new Error('updateGameState must be implemented');
  }

  async decideNextAction(availableActions) {
    throw new Error('decideNextAction must be implemented');
  }
} 