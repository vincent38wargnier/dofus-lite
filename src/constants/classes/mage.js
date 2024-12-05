import { MAGE_SORTS } from '../sorts/mageSorts';

export const MAGE = {
  name: 'Mage',
  emoji: '🧙',
  description: 'A powerful spellcaster with high damage but low HP',
  characteristics: {
    baseHP: 80,
    basePA: 7,
    basePM: 3,
    defense: 10,
    resistance: 20,
  },
  sorts: MAGE_SORTS,
};
