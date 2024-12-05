import { executeMove } from './movement';
import { applySortEffect } from './combat';
import { LineOfSight } from './lineOfSight';
import { SORTS } from './constants';

export class ActionManager {
  constructor(gameState) {
    this.gameState = gameState;
  }

  validateAction(action) {
    switch (action.type) {
      case 'MOVE':
        return this.validateMoveAction(action);
      case 'CAST_SORT':
        return this.validateSortAction(action);
      case 'END_TURN':
        return { valid: true };
      default:
        return { valid: false, error: 'Invalid action type' };
    }
  }

  executeAction(action) {
    const validation = this.validateAction(action);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    switch (action.type) {
      case 'MOVE':
        return this.executeMoveAction(action);
      case 'CAST_SORT':
        return this.executeSortAction(action);
      case 'END_TURN':
        return this.executeEndTurn(action);
      default:
        throw new Error('Invalid action type');
    }
  }

  validateMoveAction(action) {
    const { player, path } = action;
    
    // Check if it's the player's turn
    if (player !== this.gameState.currentPlayer) {
      return { valid: false, error: 'Not your turn' };
    }

    // Check if player has enough movement points
    const movementCost = path.length - 1;
    if (movementCost > player.getPM()) {
      return { valid: false, error: 'Not enough movement points' };
    }

    // Check if path is valid
    const validPath = path.every((pos, index) => {
      if (index === 0) return true;
      return !this.gameState.board.isBlocked(pos);
    });

    if (!validPath) {
      return { valid: false, error: 'Invalid path' };
    }

    return { valid: true };
  }

  validateSortAction(action) {
    const { player, sort, target } = action;
    const sortData = SORTS[sort];

    // Basic validation
    if (!sortData) {
      return { valid: false, error: 'Invalid sort' };
    }

    if (player !== this.gameState.currentPlayer) {
      return { valid: false, error: 'Not your turn' };
    }

    // Check action points
    if (player.getPA() < sortData.cost) {
      return { valid: false, error: 'Not enough action points' };
    }

    // Check cooldown
    if (player.getSortCooldown(sort) > 0) {
      return { valid: false, error: 'Sort is on cooldown' };
    }

    // Check range and line of sight
    const playerPos = this.gameState.board.findPlayerPosition(player);
    const targetPos = this.gameState.board.findPlayerPosition(target);
    const distance = Math.abs(targetPos.x - playerPos.x) + Math.abs(targetPos.y - playerPos.y);

    if (distance > sortData.range) {
      return { valid: false, error: 'Target out of range' };
    }

    if (sortData.requiresLOS && !LineOfSight.hasLineOfSight(playerPos, targetPos, this.gameState.board)) {
      return { valid: false, error: 'No line of sight to target' };
    }

    return { valid: true };
  }

  executeMoveAction(action) {
    const { player, path } = action;
    return executeMove(player, path, this.gameState.board);
  }

  executeSortAction(action) {
    const { player, sort, target } = action;
    const sortData = SORTS[sort];
    
    // Apply the sort effect
    const effects = applySortEffect(sort, player, target);
    
    // Use action points
    player.reducePA(sortData.cost);
    
    // Set cooldown
    player.updateSortCooldown(sort, sortData.cooldown);

    return {
      type: 'CAST_SORT',
      player,
      sort,
      target,
      effects
    };
  }

  executeEndTurn() {
    const currentPlayer = this.gameState.currentPlayer;
    this.gameState.turnManager.endTurn();
    
    return {
      type: 'END_TURN',
      player: currentPlayer
    };
  }
}
