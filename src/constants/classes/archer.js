import { ARCHER_SPELLS } from '../spells/archer';

export const ARCHER = {
  name: 'Archer',
  description: 'A mobile marksman who can control space and punish positioning mistakes.',
  baseHP: 85,
  basePA: 6,
  basePM: 4,
  sorts: Object.keys(ARCHER_SPELLS)
};