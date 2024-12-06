// Base game mechanics constants
export const MAX_HP = 100;
export const MAX_PA = 6;  // Action Points
export const MAX_PM = 3;  // Movement Points

// Direction Vectors (for movement and calculations)
export const DIRECTIONS = {
  UP: { x: 0, y: -1 },
  RIGHT: { x: 1, y: 0 },
  DOWN: { x: 0, y: 1 },
  LEFT: { x: -1, y: 0 },
  UP_RIGHT: { x: 1, y: -1 },
  UP_LEFT: { x: -1, y: -1 },
  DOWN_RIGHT: { x: 1, y: 1 },
  DOWN_LEFT: { x: -1, y: 1 }
};

// Turn Time Limit (in milliseconds)
export const TURN_TIME_LIMIT = 30000; // 30 seconds

// Cell Types
export const CELL_TYPES = {
  NORMAL: 'NORMAL',
  OBSTACLE: 'OBSTACLE',
  WATER: 'WATER'
};