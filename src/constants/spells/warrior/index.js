// Warrior Spells
export const WARRIOR_SPELLS = {
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
  }
};