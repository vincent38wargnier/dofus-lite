import { SORTS, CLASSES } from './constants';
import { calculateMovementCost } from './gameLogic';

export const validateAction = (action, gameState) => {
  switch (action.type) {
    case 'MOVE':
      return validateMoveAction(action, gameState);
    case 'CAST_SORT':
      return validateSortAction(action, gameState);
    case 'END_TURN':
      return validateEndTurn(action.player, gameState);
    default:
      throw new Error(`Unknown action type: ${action.type}`);
  }
};

export const validateMoveAction = (action, gameState) => {
  const { player, targetPosition } = action;
  
  // Check if it's the player's turn
  if (gameState.currentPlayer !== player) {
    return {
      valid: false,
      error: 'Not your turn'
    };
  }

  // Check if the target position is within the board
  if (!isValidPosition(targetPosition, gameState.board)) {
    return {
      valid: false,
      error: 'Invalid position'
    };
  }

  // Check if the player has enough movement points
  const currentPos = gameState.board.findPlayerPosition(player);
  const movementCost = calculateMovementCost(currentPos, targetPosition);
  if (movementCost > player.getPM()) {
    return {
      valid: false,
      error: 'Not enough movement points'
    };
  }

  // Check if the path is clear
  if (isPathBlocked(currentPos, targetPosition, gameState.board)) {
    return {
      valid: false,
      error: 'Path is blocked'
    };
  }

  return { valid: true };
};

export const validateSortAction = (action, gameState) => {
  const { player, sort, target } = action;
  const sortData = SORTS[sort];

  // Basic validations
  if (!sortData) {
    return {
      valid: false,
      error: 'Invalid sort'
    };
  }

  if (gameState.currentPlayer !== player) {
    return {
      valid: false,
      error: 'Not your turn'
    };
  }

  // Check action points
  if (player.getPA() < sortData.cost) {
    return {
      valid: false,
      error: 'Not enough action points'
    };
  }

  // Check cooldown
  if (player.getSortCooldown(sort) > 0) {
    return {
      valid: false,
      error: 'Sort is on cooldown'
    };
  }

  // Check range
  if (!isInRange(player, target, sortData.range, gameState.board)) {
    return {
      valid: false,
      error: 'Target is out of range'
    };
  }

  // Check line of sight if required
  if (sortData.requiresLOS && !hasLineOfSight(player, target, gameState.board)) {
    return {
      valid: false,
      error: 'No line of sight to target'
    };
  }

  return { valid: true };
};

export const validateEndTurn = (player, gameState) => {
  if (gameState.currentPlayer !== player) {
    return {
      valid: false,
      error: 'Not your turn'
    };
  }

  return { valid: true };
};

export const validateGameStart = (settings) => {
  const { players, boardSize } = settings;

  // Validate number of players
  if (players.length < 2) {
    return {
      valid: false,
      error: 'Need at least 2 players'
    };
  }

  // Validate player classes
  const invalidClass = players.find(player => !CLASSES[player.class]);
  if (invalidClass) {
    return {
      valid: false,
      error: \`Invalid class: \${invalidClass.class}\`
    };
  }

  // Validate board size
  if (boardSize.width < 8 || boardSize.height < 8) {
    return {
      valid: false,
      error: 'Board size too small'
    };
  }

  if (boardSize.width > 20 || boardSize.height > 20) {
    return {
      valid: false,
      error: 'Board size too large'
    };
  }

  return { valid: true };
};

// Helper functions
const isValidPosition = (position, board) => {
  return position.x >= 0 && 
         position.x < board.width &&
         position.y >= 0 && 
         position.y < board.height;
};

const isPathBlocked = (from, to, board) => {
  // Simple check for now - can be replaced with proper pathfinding
  const path = getLinePath(from, to);
  return path.some(pos => board.isBlocked(pos));
};

const isInRange = (source, target, range, board) => {
  const sourcePos = board.findPlayerPosition(source);
  const targetPos = board.findPlayerPosition(target);
  const distance = calculateMovementCost(sourcePos, targetPos);
  return distance <= range;
};

const hasLineOfSight = (source, target, board) => {
  const sourcePos = board.findPlayerPosition(source);
  const targetPos = board.findPlayerPosition(target);
  const path = getLinePath(sourcePos, targetPos);
  return !path.some(pos => board.blocksLineOfSight(pos));
};

const getLinePath = (from, to) => {
  // Bresenham's line algorithm implementation
  const points = [];
  let x1 = from.x;
  let y1 = from.y;
  const x2 = to.x;
  const y2 = to.y;

  const dx = Math.abs(x2 - x1);
  const dy = Math.abs(y2 - y1);
  const sx = x1 < x2 ? 1 : -1;
  const sy = y1 < y2 ? 1 : -1;
  let err = dx - dy;

  while (true) {
    points.push({ x: x1, y: y1 });
    if (x1 === x2 && y1 === y2) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x1 += sx;
    }
    if (e2 < dx) {
      err += dx;
      y1 += sy;
    }
  }

  return points;
};
