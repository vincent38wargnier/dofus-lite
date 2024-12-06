import { SORT_TYPES } from '../sortTypes';
import { EFFECTS } from '../effects';

export const ARCHER_SORTS = {
  ARROW_SHOT: {
    name: 'Arrow Shot',
    description: 'Deal 15 damage at range 6',
    type: SORT_TYPES.DAMAGE,
    damage: 15,
    cost: 3,
    range: 6,
    cooldown: 0,
    requiresLOS: true,
    emoji: '🎯',
  },
  BOOST_PM: {
    name: 'Quick Step',
    description: 'Gain +2 PM for this turn',
    type: SORT_TYPES.BUFF,
    cost: 2,
    range: 0,
    effect: EFFECTS.PM_BOOST,  // +2 PM
    duration: 1,
    cooldown: 3,
    emoji: '💨',
  },
  SWIFT_SHOT: {
    name: 'Swift Shot',
    description: 'Deal 12 damage and gain +1 PM',
    type: SORT_TYPES.DAMAGE,
    damage: 12,
    cost: 3,
    range: 4,
    effect: {
      type: 'BUFF',
      pm_bonus: 1,
      duration: 1
    },
    cooldown: 2,
    emoji: '🏃',
  },
  JUMP_BACK: {
    name: 'Jump Back',
    description: 'Move 2 cells away from target',
    type: SORT_TYPES.MOVEMENT,
    cost: 2,
    range: 2,
    cooldown: 3,
    emoji: '↩️',
  }
};