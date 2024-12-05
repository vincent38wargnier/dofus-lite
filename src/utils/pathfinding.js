class PriorityQueue {
  constructor() {
    this.values = [];
  }

  enqueue(val, priority) {
    this.values.push({ val, priority });
    this.sort();
  }

  dequeue() {
    return this.values.shift();
  }

  sort() {
    this.values.sort((a, b) => a.priority - b.priority);
  }
}

export const findPath = (start, goal, board) => {
  const queue = new PriorityQueue();
  const cameFrom = {};
  const costSoFar = {};
  const moves = [
    { x: 0, y: 1 },  // down
    { x: 0, y: -1 }, // up
    { x: 1, y: 0 },  // right
    { x: -1, y: 0 }, // left
  ];

  queue.enqueue(start, 0);
  cameFrom[`${start.x},${start.y}`] = null;
  costSoFar[`${start.x},${start.y}`] = 0;

  while (queue.values.length > 0) {
    const current = queue.dequeue().val;

    if (current.x === goal.x && current.y === goal.y) {
      break;
    }

    for (let move of moves) {
      const next = {
        x: current.x + move.x,
        y: current.y + move.y
      };

      if (!isCellAccessible(next, board)) {
        continue;
      }

      const newCost = costSoFar[`${current.x},${current.y}`] + 1;
      const nextKey = `${next.x},${next.y}`;

      if (!costSoFar.hasOwnProperty(nextKey) || newCost < costSoFar[nextKey]) {
        costSoFar[nextKey] = newCost;
        const priority = newCost + heuristic(next, goal);
        queue.enqueue(next, priority);
        cameFrom[nextKey] = current;
      }
    }
  }

  return reconstructPath(cameFrom, start, goal);
};

export const isCellAccessible = (cell, board) => {
  // Check if the cell is within board boundaries
  if (cell.x < 0 || cell.x >= board.width || cell.y < 0 || cell.y >= board.height) {
    return false;
  }

  // Check if the cell is blocked by obstacles or other players
  return !board.isBlocked(cell);
};

export const calculateMovementCost = (path) => {
  // For now, each step costs 1 movement point
  return path.length - 1; // -1 because we don't count the starting position
};

const heuristic = (a, b) => {
  // Manhattan distance
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
};

const reconstructPath = (cameFrom, start, goal) => {
  const path = [];
  let current = goal;
  const startKey = `${start.x},${start.y}`;

  while (current) {
    path.unshift(current);
    const currentKey = `${current.x},${current.y}`;
    if (currentKey === startKey) break;
    current = cameFrom[currentKey];
  }

  return path;
};
