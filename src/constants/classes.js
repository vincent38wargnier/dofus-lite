// Sort Types
export const SORT_TYPES = {
  DAMAGE: 'DAMAGE',
  HEAL: 'HEAL',
  BUFF: 'BUFF',
  DEBUFF: 'DEBUFF',
  MOVEMENT: 'MOVEMENT',
  MOVEMENT_DAMAGE: 'MOVEMENT_DAMAGE',
  DOT_DAMAGE: 'DOT_DAMAGE', // Damage Over Time
  AREA_DAMAGE: 'AREA_DAMAGE',
  UTILITY: 'UTILITY',
};

// Sort Effects
export const SORT_EFFECTS = {
  POISON: {
    type: 'DOT_DAMAGE',
    damagePerTurn: 5,
  },
  BURN: {
    type: 'DOT_DAMAGE',
    damagePerTurn: 8,
  },
  DEFENSE_UP: {
    type: 'BUFF',
    value: 20, // 20% damage reduction
  },
  STRENGTH_UP: {
    type: 'BUFF',
    value: 20, // 20% damage increase
  },
  STUN: {
    type: 'DEBUFF',
    skipTurn: true,
  },
};

// Base class characteristics
export const BASE_CHARACTERISTICS = {
  PA: 6,  // Action Points
  PM: 3,  // Movement Points
  HP: 100, // Health Points
};

// Classes definition with all their characteristics
export const CLASSES = {
  WARRIOR: {
    name: 'Warrior',
    emoji: '⚔️',
    description: 'A close combat fighter with high defense and HP',
    characteristics: {
      baseHP: 120,
      basePA: 6,
      basePM: 3,
      defense: 20,
      resistance: 15,
    },
    sorts: {
      SLASH: {
        name: 'Slash',
        description: 'A powerful melee attack',
        type: SORT_TYPES.DAMAGE,
        damage: 20,
        cost: 3,
        range: 1,
        cooldown: 0,
        requiresLOS: true,
        emoji: '🗡️',
      },
      SHIELD: {
        name: 'Shield',
        description: 'Increase defense temporarily',
        type: SORT_TYPES.BUFF,
        effect: SORT_EFFECTS.DEFENSE_UP,
        cost: 2,
        range: 0,
        duration: 2,
        cooldown: 3,
        emoji: '🛡️',
      },
      CHARGE: {
        name: 'Charge',
        description: 'Rush towards an enemy and deal damage',
        type: SORT_TYPES.MOVEMENT_DAMAGE,
        damage: 15,
        cost: 4,
        range: 3,
        cooldown: 2,
        emoji: '⚡',
      },
    },
  },

  MAGE: {
    name: 'Mage',
    emoji: '🧙',
    description: 'A powerful spellcaster with high damage but low HP',
    characteristics: {
      baseHP: 80,
      basePA: 7,
      basePM: 3,
      defense: 10,
      resistance: 20,
    },
    sorts: {
      FIREBALL: {
        name: 'Fireball',
        description: 'Launch a powerful ball of fire',
        type: SORT_TYPES.DAMAGE,
        damage: 25,
        cost: 4,
        range: 4,
        cooldown: 1,
        requiresLOS: true,
        emoji: '🔥',
      },
      TELEPORT: {
        name: 'Teleport',
        description: 'Teleport to a target location',
        type: SORT_TYPES.MOVEMENT,
        cost: 3,
        range: 4,
        cooldown: 3,
        emoji: '✨',
      },
      HEAL: {
        name: 'Heal',
        description: 'Restore HP to target',
        type: SORT_TYPES.HEAL,
        healing: 20,
        cost: 3,
        range: 3,
        cooldown: 2,
        emoji: '💚',
      },
    },
  },

  ARCHER: {
    name: 'Archer',
    emoji: '🏹',
    description: 'A ranged fighter with high mobility',
    characteristics: {
      baseHP: 90,
      basePA: 6,
      basePM: 4,
      defense: 12,
      resistance: 12,
    },
    sorts: {
      ARROW_SHOT: {
        name: 'Arrow Shot',
        description: 'A precise ranged attack',
        type: SORT_TYPES.DAMAGE,
        damage: 15,
        cost: 3,
        range: 6,
        cooldown: 0,
        requiresLOS: true,
        emoji: '🎯',
      },
      POISON_ARROW: {
        name: 'Poison Arrow',
        description: 'Apply poison damage over time',
        type: SORT_TYPES.DOT_DAMAGE,
        effect: SORT_EFFECTS.POISON,
        damage: 8,
        cost: 4,
        range: 5,
        duration: 3,
        cooldown: 3,
        emoji: '☠️',
      },
      JUMP_BACK: {
        name: 'Jump Back',
        description: 'Jump away from danger',
        type: SORT_TYPES.MOVEMENT,
        cost: 2,
        range: 2,
        cooldown: 3,
        emoji: '↩️',
      },
    },
  },

  TANK: {
    name: 'Tank',
    emoji: '🛡️',
    description: 'A defensive specialist with very high HP',
    characteristics: {
      baseHP: 150,
      basePA: 5,
      basePM: 2,
      defense: 30,
      resistance: 25,
    },
    sorts: {
      PROVOKE: {
        name: 'Provoke',
        description: 'Force enemy to attack you',
        type: SORT_TYPES.DEBUFF,
        cost: 3,
        range: 2,
        duration: 2,
        cooldown: 3,
        emoji: '😠',
      },
      FORTRESS: {
        name: 'Fortress',
        description: 'Greatly increase defense',
        type: SORT_TYPES.BUFF,
        effect: {
          ...SORT_EFFECTS.DEFENSE_UP,
          value: 40, // 40% damage reduction
        },
        cost: 4,
        range: 0,
        duration: 2,
        cooldown: 4,
        emoji: '🏰',
      },
      SHIELD_BASH: {
        name: 'Shield Bash',
        description: 'Stun enemy with your shield',
        type: SORT_TYPES.DAMAGE,
        damage: 10,
        effect: SORT_EFFECTS.STUN,
        cost: 4,
        range: 1,
        duration: 1,
        cooldown: 4,
        emoji: '💥',
      },
    },
  },
};

// Helper function to get all available classes
export const getAvailableClasses = () => Object.keys(CLASSES);

// Helper function to get class details
export const getClassDetails = (className) => CLASSES[className];

// Helper function to get sort details for a class
export const getClassSorts = (className) => CLASSES[className]?.sorts || {};

// Helper function to get sort details
export const getSortDetails = (className, sortName) => CLASSES[className]?.sorts[sortName];

// Helper function to validate if a class exists
export const isValidClass = (className) => className in CLASSES;

// Helper function to validate if a sort exists for a class
export const isValidSort = (className, sortName) => sortName in (CLASSES[className]?.sorts || {});
