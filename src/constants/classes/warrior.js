import { WARRIOR_SPELLS } from '../spells/warrior';

export const WARRIOR = {
  name: 'Warrior',
  description: 'A tough melee fighter who excels at controlling the battlefield and protecting allies.',
  baseHP: 110,
  basePA: 6,
  basePM: 3,
  sorts: Object.keys(WARRIOR_SPELLS)
};