import { SORT_TYPES } from '../sortTypes';
import { EFFECTS } from '../effects';

export const WARRIOR_SORTS = {
  SLASH: {
    name: 'Basic Attack',
    description: 'Deal 20 damage to enemy in melee range',
    type: SORT_TYPES.DAMAGE,
    damage: 20,
    cost: 3,
    range: 1,
    cooldown: 0,
    requiresLOS: true,
    emoji: '🗡️',
  },
  BOOST_PA: {
    name: 'Frenzy',
    description: 'Gain +2 PA for this turn',
    type: SORT_TYPES.BUFF,
    cost: 2,
    range: 0,
    effect: EFFECTS.PA_BOOST,  // Gives +2 PA
    duration: 1,
    cooldown: 4,
    emoji: '💪',
  },
  BOOST_PM: {
    name: 'Battle Rush',
    description: 'Gain +2 PM for this turn',
    type: SORT_TYPES.BUFF,
    cost: 2,
    range: 0,
    effect: EFFECTS.PM_BOOST,  // Gives +2 PM
    duration: 1,
    cooldown: 4,
    emoji: '🏃',
  },
  CHARGE: {
    name: 'Charge',
    description: 'Rush up to 4 cells and deal 15 damage',
    type: SORT_TYPES.MOVEMENT_DAMAGE,
    damage: 15,
    cost: 4,
    range: 4,
    min_range: 2,  // Must move at least 2 cells
    cooldown: 3,
    emoji: '⚡',
  }
};