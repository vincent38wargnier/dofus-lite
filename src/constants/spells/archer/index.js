// Archer Spells
export const ARCHER_SPELLS = {
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
  }
};