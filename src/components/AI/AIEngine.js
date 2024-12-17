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

  async executeStrategy(gameState, selectedUnit, strategyType) {
    let strategy;
    
    try {
      // Make sure we have the latest actions
      if (!this.actions) {
        console.error('Actions not initialized');
        return;
      }

      // Load the selected strategy
      switch (strategyType) {
        case 'simpleMovement':
          strategy = require('./strategies/simpleMovementStrategy.json');
          break;
        case 'chessLike':
          strategy = require('./strategies/chessLikeStrategy.json');
          break;
        default:
          console.error('Unknown strategy type:', strategyType);
          return;
      }

      // Execute strategy based on its type
      if (strategyType === 'simpleMovement') {
        await this.executeSimpleMovement(gameState, selectedUnit, strategy);
      } else if (strategyType === 'chessLike') {
        await this.executeChessLike(gameState, selectedUnit, strategy);
      }

    } catch (error) {
      console.error('Error executing strategy:', error);
    }
  }

  async executeSimpleMovement(gameState, selectedUnit, strategy) {
    const nearestEnemy = this.findNearestEnemy(gameState, selectedUnit);
    
    if (!nearestEnemy) {
      console.log('No enemies found');
      return this.endTurn();
    }

    // While unit has movement points, try to move towards enemy
    while (selectedUnit.currentPM > 0) {
      const currentPos = selectedUnit.position;
      const targetPos = nearestEnemy.position;
      
      const nextMove = this.calculateBestMove(currentPos, targetPos, gameState.obstacles);
      
      if (!nextMove) {
        console.log('No valid moves available');
        return this.endTurn();
      }

      if (this.isValidMove(nextMove, selectedUnit, gameState)) {
        await this.moveUnit(selectedUnit, nextMove);
        selectedUnit.currentPM -= 1;
      } else {
        break;
      }
    }

    if (selectedUnit.currentPM <= 0 || 
        strategy.movement.endTurn.conditions.noMovementPoints) {
      return this.endTurn();
    }
  }

  async executeChessLike(gameState, selectedUnit, strategy) {
    // Implementation for chess-like strategy
    console.log('Chess-like strategy not implemented yet');
    return this.endTurn();
  }

  // Helper methods
  findNearestEnemy(gameState, unit) {
    const enemies = gameState.units.filter(u => u.team !== unit.team);
    let nearestEnemy = null;
    let shortestDistance = Infinity;

    enemies.forEach(enemy => {
      const distance = this.calculateDistance(unit.position, enemy.position);
      if (distance < shortestDistance) {
        shortestDistance = distance;
        nearestEnemy = enemy;
      }
    });

    return nearestEnemy;
  }

  calculateBestMove(currentPos, targetPos, obstacles) {
    const dx = Math.sign(targetPos.x - currentPos.x);
    const dy = Math.sign(targetPos.y - currentPos.y);

    // Try horizontal movement first
    if (dx !== 0) {
      const horizontalMove = { x: currentPos.x + dx, y: currentPos.y };
      if (!this.isObstacleAt(horizontalMove, obstacles)) {
        return horizontalMove;
      }
    }

    // Then try vertical movement
    if (dy !== 0) {
      const verticalMove = { x: currentPos.x, y: currentPos.y + dy };
      if (!this.isObstacleAt(verticalMove, obstacles)) {
        return verticalMove;
      }
    }

    return null;
  }

  isObstacleAt(position, obstacles) {
    return obstacles.some(obstacle => 
      obstacle.position.x === position.x && 
      obstacle.position.y === position.y
    );
  }

  isValidMove(move, unit, gameState) {
    const distance = this.calculateDistance(unit.position, move);
    if (distance > unit.currentPM) return false;

    if (this.isObstacleAt(move, gameState.obstacles)) return false;
    
    const isOccupied = gameState.units.some(u => 
      u.position.x === move.x && 
      u.position.y === move.y
    );
    
    return !isOccupied;
  }

  async moveUnit(unit, newPosition) {
    unit.position = newPosition;
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  async endTurn() {
    // Check if actions is available
    if (!this.actions || !this.actions.endTurn) {
      console.error('Turn management actions not available');
      return;
    }

    try {
      // Use the actions.endTurn from GameContext
      await this.actions.endTurn();
      console.log('Turn ended successfully');
    } catch (error) {
      console.error('Error ending turn:', error);
    }
  }

  initialize(gameState, actions) {
    this.gameState = gameState;
    this.actions = actions;
  }
} 