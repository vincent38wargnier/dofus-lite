// Game Status
export const GAME_STATUS = {
  WAITING: 'WAITING',
  ACTIVE: 'ACTIVE',
  PAUSED: 'PAUSED',
  ENDED: 'ENDED'
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