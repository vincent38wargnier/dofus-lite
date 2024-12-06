// Board Configuration
export const BOARD_CONFIG = {
  DEFAULT_SIZE: {
    rows: 15,
    columns: 15
  },
  MAX_SIZE: {
    rows: 20,
    columns: 20
  },
  MIN_SIZE: {
    rows: 8,
    columns: 8
  }
};

// Obstacle Types
export const OBSTACLE_TYPES = {
  WALL: {
    name: 'Wall',
    blocksMovement: true,
    blocksLOS: true
  },
  BUSH: {
    name: 'Bush',
    blocksMovement: false,
    blocksLOS: true
  },
  ROCK: {
    name: 'Rock',
    blocksMovement: true,
    blocksLOS: false
  },
  ICE_WALL: {
    name: 'Ice Wall',
    blocksMovement: true,
    blocksLOS: false,
    applyEffect: 'FROZEN',
    temporary: true
  }
};