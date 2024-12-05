import { DIRECTIONS } from '../../utils/constants';

class MovementManager {
  constructor(boardEngine) {
    this.boardEngine = boardEngine;
  }

  calculateValidMoves(player) {
    const currentPosition = this.findPlayerPosition(player);
    if (!currentPosition) return [];

    const validMoves = [];
    const movementPoints = player.getPM();
    
    // Use breadth-first search to find valid moves
    this.bfs(currentPosition, movementPoints, validMoves);
    
    return validMoves;
  }

  findPlayerPosition(player) {
    const board = this.boardEngine.getBoardState();
    for (let y = 0; y < board.length; y++) {
      for (let x = 0; x < board[y].length; x++) {
        if (board[y][x].occupant === player) {
          return { x, y };
        }
      }
    }
    return null;
  }

  bfs(start, movementPoints, validMoves) {
    const queue = [{ ...start, cost: 0 }];
    const visited = new Set();
    visited.add(`${start.x},${start.y}`);

    while (queue.length > 0) {
      const current = queue.shift();
      validMoves.push({ x: current.x, y: current.y });

      if (current.cost >= movementPoints) continue;

      // Check all adjacent cells
      Object.values(DIRECTIONS).forEach(direction => {
        const newX = current.x + direction.x;
        const newY = current.y + direction.y;
        const key = `${newX},${newY}`;

        if (!visited.has(key) && this.isValidMove(newX, newY)) {
          visited.add(key);
          queue.push({ x: newX, y: newY, cost: current.cost + 1 });
        }
      });
    }
  }

  isValidMove(x, y) {
    const cell = this.boardEngine.getCell(x, y);
    return cell && !cell.obstacle && !cell.occupant;
  }

  movePlayer(player, toX, toY) {
    const fromPos = this.findPlayerPosition(player);
    if (!fromPos) return false;

    const validMoves = this.calculateValidMoves(player);
    const isValidMove = validMoves.some(move => move.x === toX && move.y === toY);

    if (!isValidMove) return false;

    // Calculate movement cost (Manhattan distance)
    const cost = Math.abs(toX - fromPos.x) + Math.abs(toY - fromPos.y);
    
    if (cost > player.getPM()) return false;

    // Execute the move
    this.boardEngine.removePlayer(fromPos.x, fromPos.y);
    this.boardEngine.placePlayer(player, toX, toY);
    player.reducePM(cost);

    return true;
  }

  getPath(fromX, fromY, toX, toY) {
    // A* pathfinding implementation to be added
    // This will return the optimal path between two points
    return [];
  }

  isPathObstructed(path) {
    return path.some(point => {
      const cell = this.boardEngine.getCell(point.x, point.y);
      return !cell || cell.obstacle || cell.occupant;
    });
  }
}

export default MovementManager;
