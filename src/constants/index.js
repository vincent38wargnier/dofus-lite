export * from './sortTypes';
export * from './effects';
export * from './baseStats';
export * from './classes';

// Game status constants
export const GAME_STATUS = {
  WAITING: 'WAITING',
  ACTIVE: 'ACTIVE',
  PAUSED: 'PAUSED',
  ENDED: 'ENDED',
};

// Board configuration
export const BOARD_CONFIG = {
  DEFAULT_SIZE: {
    rows: 15,
    columns: 15,
  },
  MAX_SIZE: {
    rows: 20,
    columns: 20,
  },
  MIN_SIZE: {
    rows: 8,
    columns: 8,
  }
};

// Cell types
export const CELL_TYPES = {
  NORMAL: 'NORMAL',
  OBSTACLE: 'OBSTACLE',
  WATER: 'WATER'
};

// Direction vectors (for movement and calculations)
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

// Turn time limit (in milliseconds)
export const TURN_TIME_LIMIT = 30000; // 30 seconds
