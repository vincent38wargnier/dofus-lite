import { SORT_TYPES } from '../sortTypes';
import { EFFECTS } from '../effects';

export const ARCHER_SORTS = {
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
    effect: EFFECTS.POISON,
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
};
