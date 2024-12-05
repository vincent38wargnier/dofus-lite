// Recursive function to find all reachable cells within PM range
export const findReachableCells = (board, startX, startY, pm, visited = new Set()) => {
  const key = `${startX},${startY}`;
  if (visited.has(key)) return [];
  visited.add(key);

  const reachableCells = [{ x: startX, y: startY }];
  
  if (pm <= 0) return reachableCells;

  // Check all adjacent cells
  const directions = [
    { x: 0, y: -1 },  // up
    { x: 1, y: 0 },   // right
    { x: 0, y: 1 },   // down
    { x: -1, y: 0 }   // left
  ];

  directions.forEach(dir => {
    const newX = startX + dir.x;
    const newY = startY + dir.y;
    
    // Check if the new position is valid and walkable
    if (isValidPosition(newX, newY, board) && !board.isBlocked(newX, newY)) {
      const nextCells = findReachableCells(board, newX, newY, pm - 1, visited);
      reachableCells.push(...nextCells);
    }
  });

  return reachableCells;
};

// Function to find the shortest path between two points
export const findPath = (board, startX, startY, endX, endY, pm) => {
  const queue = [{
    x: startX,
    y: startY,
    path: [{ x: startX, y: startY }],
    cost: 0
  }];
  const visited = new Set();

  while (queue.length > 0) {
    const current = queue.shift();
    const key = `${current.x},${current.y}`;

    if (current.x === endX && current.y === endY) {
      return current.path;
    }

    if (visited.has(key) || current.cost >= pm) continue;
    visited.add(key);

    // Check all adjacent cells
    const directions = [
      { x: 0, y: -1 },  // up
      { x: 1, y: 0 },   // right
      { x: 0, y: 1 },   // down
      { x: -1, y: 0 }   // left
    ];

    directions.forEach(dir => {
      const newX = current.x + dir.x;
      const newY = current.y + dir.y;
      
      if (isValidPosition(newX, newY, board) && !board.isBlocked(newX, newY)) {
        queue.push({
          x: newX,
          y: newY,
          path: [...current.path, { x: newX, y: newY }],
          cost: current.cost + 1
        });
      }
    });
  }

  return null; // No path found
};

const isValidPosition = (x, y, board) => {
  return x >= 0 && x < board.width && y >= 0 && y < board.height;
};

export const calculateMovementCost = (path) => {
  return path ? path.length - 1 : 0; // -1 because starting position doesn't cost PM
};
