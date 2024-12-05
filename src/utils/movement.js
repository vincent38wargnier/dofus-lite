import { findPath, calculateMovementCost } from './pathfinding';

export const getValidMoves = (player, board, maxRange) => {
  const currentPos = board.findPlayerPosition(player);
  const validMoves = [];

  // Check all positions within maxRange
  for (let x = Math.max(0, currentPos.x - maxRange); x <= Math.min(board.width - 1, currentPos.x + maxRange); x++) {
    for (let y = Math.max(0, currentPos.y - maxRange); y <= Math.min(board.height - 1, currentPos.y + maxRange); y++) {
      const targetPos = { x, y };
      
      // Skip current position
      if (x === currentPos.x && y === currentPos.y) continue;

      // Check if position is accessible
      if (!board.isBlocked(targetPos)) {
        const path = findPath(currentPos, targetPos, board);
        
        // If path exists and within movement points
        if (path && calculateMovementCost(path) <= player.getPM()) {
          validMoves.push({
            position: targetPos,
            path: path,
            cost: calculateMovementCost(path)
          });
        }
      }
    }
  }

  return validMoves;
};

export const executeMove = (player, path, board) => {
  const cost = calculateMovementCost(path);
  
  // Validate movement points
  if (cost > player.getPM()) {
    throw new Error('Not enough movement points');
  }

  // Execute the move
  const currentPos = board.findPlayerPosition(player);
  const targetPos = path[path.length - 1];

  board.movePlayer(currentPos, targetPos);
  player.reducePM(cost);

  return {
    type: 'MOVE',
    player,
    from: currentPos,
    to: targetPos,
    cost
  };
};

export const getAdjacentCells = (position, board) => {
  const adjacent = [
    { x: position.x, y: position.y - 1 }, // up
    { x: position.x + 1, y: position.y }, // right
    { x: position.x, y: position.y + 1 }, // down
    { x: position.x - 1, y: position.y }  // left
  ];

  return adjacent.filter(pos => 
    pos.x >= 0 && 
    pos.x < board.width && 
    pos.y >= 0 && 
    pos.y < board.height &&
    !board.isBlocked(pos)
  );
};

export const getManhattanDistance = (pos1, pos2) => {
  return Math.abs(pos1.x - pos2.x) + Math.abs(pos1.y - pos2.y);
};
