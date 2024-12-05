import { SORT_TYPES } from '../sortTypes';
import { EFFECTS } from '../effects';

export const WARRIOR_SORTS = {
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
    effect: EFFECTS.DEFENSE_UP,
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
};
