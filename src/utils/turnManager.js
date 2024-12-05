import { processStatusEffects } from './combat';

export class TurnManager {
  constructor(players, timeLimit = 30000) { // 30 seconds default time limit
    this.players = players;
    this.currentPlayerIndex = 0;
    this.turnNumber = 1;
    this.timeLimit = timeLimit;
    this.turnStartTime = null;
    this.listeners = new Set();
  }

  getCurrentPlayer() {
    return this.players[this.currentPlayerIndex];
  }

  startTurn() {
    const currentPlayer = this.getCurrentPlayer();
    
    // Reset player's points
    currentPlayer.resetPA();
    currentPlayer.resetPM();
    
    // Process start of turn effects
    const effects = processStatusEffects(currentPlayer);
    
    // Decrement cooldowns
    currentPlayer.decrementCooldowns();
    
    // Set turn start time
    this.turnStartTime = Date.now();
    
    // Notify listeners
    this.notifyListeners('turnStart', {
      player: currentPlayer,
      effects: effects,
      turnNumber: this.turnNumber
    });
  }

  endTurn() {
    const currentPlayer = this.getCurrentPlayer();
    
    // Process end of turn effects
    const effects = processStatusEffects(currentPlayer);
    
    // Move to next player
    this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
    
    // Increment turn number if we've completed a round
    if (this.currentPlayerIndex === 0) {
      this.turnNumber++;
    }
    
    // Notify listeners
    this.notifyListeners('turnEnd', {
      player: currentPlayer,
      effects: effects,
      nextPlayer: this.getCurrentPlayer()
    });
    
    // Start next turn
    this.startTurn();
  }

  forceEndTurn() {
    // Similar to endTurn but triggered by time limit
    this.notifyListeners('turnTimeOut', {
      player: this.getCurrentPlayer()
    });
    this.endTurn();
  }

  getRemainingTime() {
    if (!this.turnStartTime) return this.timeLimit;
    const elapsed = Date.now() - this.turnStartTime;
    return Math.max(0, this.timeLimit - elapsed);
  }

  isTimeExpired() {
    return this.getRemainingTime() <= 0;
  }

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

  // For game saving/loading
  getState() {
    return {
      currentPlayerIndex: this.currentPlayerIndex,
      turnNumber: this.turnNumber,
      timeLimit: this.timeLimit,
      turnStartTime: this.turnStartTime
    };
  }

  setState(state) {
    this.currentPlayerIndex = state.currentPlayerIndex;
    this.turnNumber = state.turnNumber;
    this.timeLimit = state.timeLimit;
    this.turnStartTime = state.turnStartTime;
  }
}
