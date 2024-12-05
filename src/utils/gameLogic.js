import { SORTS } from './constants';

export const executeAction = (action, gameState) => {
  switch (action.type) {
    case 'MOVE':
      return executeMoveAction(action, gameState);
    case 'CAST_SORT':
      return executeSortAction(action, gameState);
    case 'END_TURN':
      return executeEndTurn(gameState);
    default:
      throw new Error(`Unknown action type: ${action.type}`);
  }
};

const executeMoveAction = (action, gameState) => {
  const { player, targetPosition } = action;
  const currentPos = gameState.board.findPlayerPosition(player);
  
  // Check if move is valid
  const movementCost = calculateMovementCost(currentPos, targetPosition);
  if (movementCost > player.getPM()) {
    throw new Error('Not enough movement points');
  }

  // Execute move
  gameState.board.movePlayer(player, currentPos, targetPosition);
  player.reducePM(movementCost);

  return {
    ...gameState,
    lastAction: {
      type: 'MOVE',
      player,
      from: currentPos,
      to: targetPosition
    }
  };
};

const executeSortAction = (action, gameState) => {
  const { player, sort, target } = action;
  const sortData = SORTS[sort];
  
  // Validate sort usage
  if (!sortData) throw new Error('Invalid sort');
  if (player.getPA() < sortData.cost) throw new Error('Not enough action points');
  if (player.getSortCooldown(sort) > 0) throw new Error('Sort is on cooldown');

  // Calculate and apply effects
  const effects = calculateSortEffects(sort, player, target);
  applyEffects(effects, gameState);
  
  // Update player state
  player.reducePA(sortData.cost);
  player.updateSortCooldown(sort, sortData.cooldown);

  return {
    ...gameState,
    lastAction: {
      type: 'CAST_SORT',
      player,
      sort,
      target,
      effects
    }
  };
};

const executeEndTurn = (gameState) => {
  const nextPlayer = getNextPlayer(gameState);
  
  // Reset current player's points
  gameState.currentPlayer.resetPA();
  gameState.currentPlayer.resetPM();
  
  // Process end of turn effects
  processEndTurnEffects(gameState);
  
  return {
    ...gameState,
    currentPlayer: nextPlayer,
    turnNumber: gameState.turnNumber + 1,
    lastAction: {
      type: 'END_TURN',
      player: gameState.currentPlayer
    }
  };
};

export const calculateDamage = (attacker, defender, sort) => {
  const baseDamage = sort.damage;
  // For now, implement a simple damage calculation
  // Later we can add modifiers, equipment, status effects, etc.
  return baseDamage;
};

export const calculateSortEffects = (sort, caster, target) => {
  const effects = [];
  const sortData = SORTS[sort];

  switch (sortData.type) {
    case 'DAMAGE':
      effects.push({
        type: 'DAMAGE',
        value: calculateDamage(caster, target, sortData),
        target
      });
      break;
    case 'HEAL':
      effects.push({
        type: 'HEAL',
        value: sortData.healing,
        target
      });
      break;
    case 'BUFF':
      effects.push({
        type: 'STATUS_EFFECT',
        effect: sortData.effect,
        duration: sortData.duration,
        target
      });
      break;
    // Add more effect types as needed
  }

  return effects;
};

export const applyEffects = (effects, gameState) => {
  effects.forEach(effect => {
    switch (effect.type) {
      case 'DAMAGE':
        effect.target.reduceHP(effect.value);
        break;
      case 'HEAL':
        effect.target.increaseHP(effect.value);
        break;
      case 'STATUS_EFFECT':
        effect.target.addStatusEffect({
          type: effect.effect,
          duration: effect.duration
        });
        break;
      // Add more effect types as needed
    }
  });
};

export const processEndTurnEffects = (gameState) => {
  gameState.players.forEach(player => {
    // Process status effects
    player.processStatusEffects();
    // Decrement cooldowns
    player.decrementCooldowns();
  });
};

export const getNextPlayer = (gameState) => {
  const currentIndex = gameState.players.indexOf(gameState.currentPlayer);
  const nextIndex = (currentIndex + 1) % gameState.players.length;
  return gameState.players[nextIndex];
};

export const calculateMovementCost = (from, to) => {
  // Simple Manhattan distance for now
  return Math.abs(to.x - from.x) + Math.abs(to.y - from.y);
};

export const checkEndConditions = (gameState) => {
  // Check for win/lose conditions
  const alivePlayers = gameState.players.filter(player => player.isAlive());
  
  if (alivePlayers.length === 1) {
    return {
      gameOver: true,
      winner: alivePlayers[0]
    };
  }
  
  return {
    gameOver: false,
    winner: null
  };
};
