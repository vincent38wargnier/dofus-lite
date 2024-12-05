import { WARRIOR_SORTS } from '../sorts/warriorSorts';

export const WARRIOR = {
  name: 'Warrior',
  emoji: '⚔️',
  description: 'A close combat fighter with high defense and HP',
  characteristics: {
    baseHP: 120,
    basePA: 6,
    basePM: 3,
    defense: 20,
    resistance: 15,
  },
  sorts: WARRIOR_SORTS,
};
