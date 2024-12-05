import { SORT_TYPES } from '../sortTypes';

export const MAGE_SORTS = {
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
};
