import { ARCHER_SORTS } from '../sorts/archerSorts';

export const ARCHER = {
  name: 'Archer',
  emoji: '🏹',
  description: 'A ranged fighter with high mobility',
  characteristics: {
    baseHP: 90,
    basePA: 6,
    basePM: 4,
    defense: 12,
    resistance: 12,
  },
  sorts: ARCHER_SORTS,
};
