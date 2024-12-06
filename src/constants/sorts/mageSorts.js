import { SORT_TYPES } from '../sortTypes';
import { EFFECTS } from '../effects';

export const MAGE_SORTS = {
  FIREBALL: {
    name: 'Fireball',
    description: 'Deal 25 damage at range 4',
    type: SORT_TYPES.DAMAGE,
    damage: 25,
    cost: 4,
    range: 4,
    cooldown: 1,
    requiresLOS: true,
    emoji: '🔥',
  },
  DOUBLE_PA: {
    name: 'Time Bend',
    description: 'Gain +3 PA but skip your next turn',
    type: SORT_TYPES.BUFF,
    cost: 2,
    range: 0,
    effect: {
      type: 'BUFF',
      pa_bonus: 3,
      duration: 1
    },
    self_effect: {
      type: 'DEBUFF',
      skip_turn: true,
      duration: 2
    },
    cooldown: 5,
    emoji: '⌛',
  },
  STEAL_PA: {
    name: 'Energy Drain',
    description: 'Steal 2 PA from target',
    type: SORT_TYPES.DEBUFF,
    cost: 3,
    range: 3,
    effect: {
      type: 'DEBUFF',
      pa_reduction: 2,
      duration: 1
    },
    self_effect: {
      type: 'BUFF',
      pa_bonus: 2,
      duration: 1
    },
    cooldown: 4,
    emoji: '💫',
  },
  TELEPORT: {
    name: 'Teleport',
    description: 'Move to any cell within range 4',
    type: SORT_TYPES.MOVEMENT,
    cost: 3,
    range: 4,
    cooldown: 3,
    emoji: '✨',
  }
};