// Game Constants
export const MAX_HP = 100;
export const MAX_PA = 6;  // Action Points
export const MAX_PM = 3;  // Movement Points

// Cell Types
export const CELL_TYPES = {
  NORMAL: 'NORMAL',
  OBSTACLE: 'OBSTACLE',
  WATER: 'WATER'
};

// Player Classes
export const CLASSES = {
  WARRIOR: {
    name: 'Warrior',
    baseHP: 100,
    basePA: 6,
    basePM: 3,
    sorts: ['SLASH', 'SHIELD', 'CHARGE']
  },
  ARCHER: {
    name: 'Archer',
    baseHP: 85,
    basePA: 6,
    basePM: 4,
    sorts: ['ARROW_SHOT', 'POISON_ARROW', 'JUMP_BACK']
  },
  MAGE: {
    name: 'Mage',
    baseHP: 75,
    basePA: 7,
    basePM: 3,
    sorts: ['FIREBALL', 'TELEPORT', 'HEAL']
  }
};

// Sorts (Spells/Abilities)
export const SORTS = {
  // Warrior Sorts
  SLASH: {
    name: 'Slash',
    type: 'DAMAGE',
    cost: 3,
    range: 1,
    damage: 20,
    cooldown: 0
  },
  SHIELD: {
    name: 'Shield',
    type: 'BUFF',
    cost: 2,
    range: 0,
    effect: 'DEFENSE_UP',
    duration: 2,
    cooldown: 3
  },
  CHARGE: {
    name: 'Charge',
    type: 'MOVEMENT_DAMAGE',
    cost: 4,
    range: 3,
    damage: 15,
    cooldown: 2
  },
  
  // Archer Sorts
  ARROW_SHOT: {
    name: 'Arrow Shot',
    type: 'DAMAGE',
    cost: 3,
    range: 6,
    damage: 15,
    cooldown: 0
  },
  POISON_ARROW: {
    name: 'Poison Arrow',
    type: 'DOT_DAMAGE',
    cost: 4,
    range: 5,
    damage: 8,
    duration: 3,
    cooldown: 3
  },
  JUMP_BACK: {
    name: 'Jump Back',
    type: 'MOVEMENT',
    cost: 2,
    range: 2,
    cooldown: 3
  },
  
  // Mage Sorts
  FIREBALL: {
    name: 'Fireball',
    type: 'DAMAGE',
    cost: 4,
    range: 4,
    damage: 25,
    cooldown: 1
  },
  TELEPORT: {
    name: 'Teleport',
    type: 'MOVEMENT',
    cost: 3,
    range: 4,
    cooldown: 3
  },
  HEAL: {
    name: 'Heal',
    type: 'HEAL',
    cost: 3,
    range: 3,
    healing: 20,
    cooldown: 2
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
  }
};

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

// Game Status
export const GAME_STATUS = {
  WAITING: 'WAITING',
  ACTIVE: 'ACTIVE',
  PAUSED: 'PAUSED',
  ENDED: 'ENDED'
};

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

// Status Effects
export const STATUS_EFFECTS = {
  POISONED: {
    name: 'Poisoned',
    type: 'DEBUFF',
    effect: 'DAMAGE_OVER_TIME'
  },
  DEFENSE_UP: {
    name: 'Defense Up',
    type: 'BUFF',
    effect: 'DAMAGE_REDUCTION'
  },
  STUNNED: {
    name: 'Stunned',
    type: 'DEBUFF',
    effect: 'SKIP_TURN'
  }
};
