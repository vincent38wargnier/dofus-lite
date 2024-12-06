// Mage Spells
export const MAGE_SPELLS = {
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