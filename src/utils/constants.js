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

// Status Effects
export const STATUS_EFFECTS = {
  POISONED: {
    name: 'Poisoned',
    type: 'DEBUFF',
    effect: 'DAMAGE_OVER_TIME',
    damage: 5
  },
  DEFENSE_UP: {
    name: 'Defense Up',
    type: 'BUFF',
    effect: 'DAMAGE_REDUCTION',
    reduction: 5
  },
  STUNNED: {
    name: 'Stunned',
    type: 'DEBUFF',
    effect: 'SKIP_TURN'
  },
  MARKED: {
    name: 'Marked',
    type: 'DEBUFF',
    effect: 'INCREASED_DAMAGE',
    increase: 5
  },
  BURNING: {
    name: 'Burning',
    type: 'DEBUFF',
    effect: 'DAMAGE_OVER_TIME',
    damage: 8
  },
  FROZEN: {
    name: 'Frozen',
    type: 'DEBUFF',
    effect: 'MOVEMENT_REDUCED',
    reduction: 2
  }
};

// Player Classes
export const CLASSES = {
  WARRIOR: {
    name: 'Warrior',
    description: 'A tough melee fighter who excels at controlling the battlefield and protecting allies.',
    baseHP: 110,
    basePA: 6,
    basePM: 3,
    sorts: ['SLASH', 'SHIELD_BASH', 'CHARGE', 'PROTECTIVE_LEAP']
  },
  ARCHER: {
    name: 'Archer',
    description: 'A mobile marksman who can control space and punish positioning mistakes.',
    baseHP: 85,
    basePA: 6,
    basePM: 4,
    sorts: ['PRECISE_SHOT', 'EXPLOSIVE_ARROW', 'TACTICAL_ROLL', 'MARK_TARGET']
  },
  MAGE: {
    name: 'Mage',
    description: 'A versatile spellcaster who can control areas and combine elements for powerful effects.',
    baseHP: 75,
    basePA: 7,
    basePM: 3,
    sorts: ['FIREBALL', 'ICE_WALL', 'TELEPORT', 'ARCANE_BLAST']
  }
};

// Add new pattern types to support the range mechanics
export const SPELL_PATTERNS = {
  SINGLE: 'SINGLE',      // Single target
  LINE: 'LINE',          // Straight line
  CONE: 'CONE',          // Cone shape
  CIRCLE: 'CIRCLE',      // Circular area
  CROSS: 'CROSS',        // Cross shape
  STAR: 'STAR',          // Star shape
  DIAMOND: 'DIAMOND'     // Diamond shape
};

// Sorts (Spells/Abilities) with improved tactical depth
export const SORTS = {
  // Warrior Sorts - Focus on battlefield control and ally protection
  SLASH: {
    name: 'Slash',
    type: 'DAMAGE',
    cost: 3,
    range: 1,
    pattern: 'CONE',  // Hits 3 cells in a cone
    pattern_size: 3,
    damage: 20,
    cooldown: 0,
    description: 'A wide slash that hits multiple enemies in a cone.'
  },
  SHIELD_BASH: {
    name: 'Shield Bash',
    type: 'DAMAGE',
    cost: 3,
    range: 1,
    pattern: 'LINE',  // Hits 2 cells in a line
    pattern_size: 2,
    damage: 15,
    effect: 'STUNNED',
    duration: 1,
    cooldown: 3,
    description: 'A powerful bash that stuns enemies in a line.'
  },
  CHARGE: {
    name: 'Charge',
    type: 'MOVEMENT_DAMAGE',
    cost: 4,
    min_range: 2,  // Must be used from at least 2 cells away
    range: 4,
    damage: 15,
    pushback: 2,
    pattern: 'LINE',  // Hits all enemies in the charge path
    cooldown: 3,
    description: 'Rush in a line, damaging and pushing all enemies in your path.'
  },
  PROTECTIVE_LEAP: {
    name: 'Protective Leap',
    type: 'MOVEMENT',
    cost: 3,
    min_range: 2,  // Must jump at least 2 cells
    range: 3,
    effect: 'DEFENSE_UP',
    duration: 2,
    pattern: 'CIRCLE',  // Affects allies in a circle
    pattern_size: 2,  // 2 cell radius
    cooldown: 4,
    description: 'Leap to a location. You and allies within 2 cells gain damage reduction.'
  },

  // Archer Sorts - Focus on positioning and punishing enemy movement
  PRECISE_SHOT: {
    name: 'Precise Shot',
    type: 'DAMAGE',
    cost: 3,
    min_range: 2,  // Must be at least 2 cells away
    range: 6,
    pattern: 'SINGLE',
    damage: 18,
    bonus_damage_marked: 8,
    cooldown: 0,
    description: 'A precise shot that deals extra damage to marked targets. Cannot be used at point blank.'
  },
  EXPLOSIVE_ARROW: {
    name: 'Explosive Arrow',
    type: 'DAMAGE',
    cost: 4,
    min_range: 3,
    range: 5,
    damage: 15,
    pattern: 'CROSS',  // Hits in a cross pattern
    pattern_size: 2,  // 2 cells in each direction
    effect: 'BURNING',
    duration: 2,
    cooldown: 3,
    description: 'Fire an explosive arrow that creates a cross-shaped explosion.'
  },
  TACTICAL_ROLL: {
    name: 'Tactical Roll',
    type: 'MOVEMENT',
    cost: 2,
    range: 3,
    pattern: 'LINE',  // Must roll in a straight line
    bonus_pm: 1,
    cooldown: 3,
    description: 'Roll in a straight line and gain 1 extra MP for the turn.'
  },
  MARK_TARGET: {
    name: 'Mark Target',
    type: 'DEBUFF',
    cost: 2,
    min_range: 2,
    range: 6,
    pattern: 'DIAMOND',  // Hits in a diamond shape
    pattern_size: 1,  // 1 cell radius diamond
    effect: 'MARKED',
    duration: 2,
    cooldown: 3,
    description: 'Mark targets in a diamond pattern, making them take increased damage.'
  },

  // Mage Sorts - Focus on area control and elemental combinations
  FIREBALL: {
    name: 'Fireball',
    type: 'DAMAGE',
    cost: 4,
    min_range: 2,
    range: 4,
    damage: 22,
    pattern: 'CIRCLE',  // Circular explosion
    pattern_size: 2,  // 2 cell radius
    effect: 'BURNING',
    duration: 2,
    cooldown: 2,
    description: 'Launch a fireball that creates a large circular explosion.'
  },
  ICE_WALL: {
    name: 'Ice Wall',
    type: 'OBSTACLE',
    cost: 3,
    range: 3,
    pattern: 'LINE',  // Creates a line of ice
    pattern_size: 3,  // 3 cells long
    pattern_orientation: 'PERPENDICULAR',  // Creates wall perpendicular to cast direction
    duration: 2,
    effect: 'FROZEN',
    cooldown: 4,
    description: 'Create a 3-cell wide wall of ice perpendicular to the cast direction.'
  },
  TELEPORT: {
    name: 'Teleport',
    type: 'MOVEMENT',
    cost: 3,
    min_range: 2,
    range: 4,
    cooldown: 3,
    description: 'Instantly teleport to a target location at least 2 cells away.'
  },
  ARCANE_BLAST: {
    name: 'Arcane Blast',
    type: 'DAMAGE',
    cost: 3,
    range: 3,
    pattern: 'STAR',  // Star-shaped pattern
    pattern_size: 2,  // 2 cells in each direction
    damage: 15,
    bonus_damage_status: 10,
    cooldown: 1,
    description: 'Release a star-shaped blast that deals bonus damage to debuffed targets.'
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