export class AIEngine {
  constructor(configPath) {
    this.config = null;
    this.isEnabled = false;
    this.loadConfig(configPath);
  }

  async loadConfig(configPath) {
    try {
      const response = await fetch(configPath);
      this.config = await response.json();
    } catch (error) {
      console.error('Failed to load AI configuration:', error);
    }
  }

  evaluateGameState(state) {
    // Pure function that takes game state and returns evaluation
    const evaluation = {
      health: this.calculateHealthStatus(state),
      position: this.evaluatePosition(state),
      threats: this.identifyThreats(state),
      opportunities: this.findOpportunities(state)
    };

    return evaluation;
  }

  calculateHealthStatus(state) {
    const myHealth = state.currentPlayer.health;
    const maxHealth = state.currentPlayer.maxHealth;
    return (myHealth / maxHealth) * 100;
  }

  evaluatePosition(state) {
    const myPos = state.currentPlayer.position;
    const enemyPos = this.findClosestEnemy(state).position;
    
    return {
      distanceToEnemy: this.calculateDistance(myPos, enemyPos),
      nearObstacle: this.isNearObstacle(state, myPos),
      isDefensive: this.isInDefensivePosition(state, myPos)
    };
  }

  findClosestEnemy(state) {
    // Implementation to find nearest enemy
    return state.players.find(p => p.id !== state.currentPlayer.id);
  }

  decideNextAction(gameState) {
    if (!this.config) return null;

    const evaluation = this.evaluateGameState(gameState);
    const applicableRules = this.config.rules.filter(rule => 
      this.evaluateCondition(rule.condition, evaluation)
    );

    // Sort by priority and current state evaluation
    applicableRules.sort((a, b) => 
      (b.priority * this.config.priorities[b.action]) - 
      (a.priority * this.config.priorities[a.action])
    );

    if (applicableRules.length === 0) return null;

    return this.createAction(applicableRules[0], gameState);
  }

  evaluateCondition(condition, evaluation) {
    switch (condition) {
      case 'health < 30%':
        return evaluation.health < 30;
      case 'enemy_in_range':
        return evaluation.position.distanceToEnemy <= 3;
      case 'can_move_closer':
        return evaluation.position.distanceToEnemy > 1;
      default:
        return false;
    }
  }

  createAction(rule, gameState) {
    switch (rule.action) {
      case 'defensive_position':
        return this.createMoveAction(
          this.findDefensivePosition(gameState)
        );
      case 'cast_damage_spell':
        return this.createSpellAction(
          this.selectBestSpell(gameState),
          this.findBestTarget(gameState)
        );
      case 'approach_enemy':
        return this.createMoveAction(
          this.calculateApproachPosition(gameState)
        );
      default:
        return null;
    }
  }

  // Helper methods to create specific actions
  createMoveAction(position) {
    return {
      type: 'MOVE',
      data: { position }
    };
  }

  createSpellAction(spellId, target) {
    return {
      type: 'SPELL',
      data: { spellId, target }
    };
  }

  // Position calculation methods
  calculateDistance(pos1, pos2) {
    return Math.abs(pos1.x - pos2.x) + Math.abs(pos1.y - pos2.y);
  }

  isNearObstacle(state, position) {
    // Check adjacent cells for obstacles
    const adjacentCells = [
      {x: position.x + 1, y: position.y},
      {x: position.x - 1, y: position.y},
      {x: position.x, y: position.y + 1},
      {x: position.x, y: position.y - 1}
    ];

    return adjacentCells.some(pos => 
      state.board.getCell(pos.x, pos.y)?.obstacle
    );
  }

  enable() {
    this.isEnabled = true;
  }

  disable() {
    this.isEnabled = false;
  }
} 