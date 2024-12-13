export class GameHistory {
  constructor() {
    this.actions = [];
    this.states = [];
    this.currentIndex = -1;
    this.statistics = {
      damageDealt: {},
      spellsCast: {},
      distanceMoved: {}
    };
  }

  recordAction(action, resultingState) {
    // Remove any future states if we're in the middle of history
    if (this.currentIndex < this.actions.length - 1) {
      this.actions.splice(this.currentIndex + 1);
      this.states.splice(this.currentIndex + 1);
    }

    this.actions.push({
      ...action,
      timestamp: Date.now()
    });
    
    // Deep clone the state to preserve it
    this.states.push(JSON.parse(JSON.stringify(resultingState)));
    this.currentIndex++;

    // Track statistics
    this.updateStatistics(action, resultingState);
  }

  getStateAtTurn(turnNumber) {
    return this.states.find(state => state.turnNumber === turnNumber);
  }

  getActionSequence(startTurn, endTurn) {
    return this.actions.filter(action => 
      action.turnNumber >= startTurn && action.turnNumber <= endTurn
    );
  }

  replayActions(fromTurn, toTurn) {
    const startState = this.getStateAtTurn(fromTurn);
    const actions = this.getActionSequence(fromTurn, toTurn);
    return this.simulateActions(startState, actions);
  }

  simulateActions(startState, actions) {
    let currentState = JSON.parse(JSON.stringify(startState));
    const results = [];

    for (const action of actions) {
      const result = this.simulateAction(currentState, action);
      results.push(result);
      currentState = result.resultingState;
    }

    return {
      finalState: currentState,
      actionResults: results
    };
  }

  // Add method to analyze patterns
  analyzePatterns() {
    return {
      favoredPositions: this.calculateFavoredPositions(),
      commonSpellTargets: this.analyzeSpellTargets(),
      movementPatterns: this.analyzeMovementPatterns()
    };
  }

  // Add method for AI to learn from history
  getPlayerBehaviorProfile(playerId) {
    return {
      aggressiveness: this.calculateAggressiveness(playerId),
      positioning: this.analyzePositioning(playerId),
      spellUsage: this.analyzeSpellUsage(playerId)
    };
  }
} 