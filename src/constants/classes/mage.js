import { MAGE_SPELLS } from '../spells/mage';

export const MAGE = {
  name: 'Mage',
  description: 'A versatile spellcaster who can control areas and combine elements for powerful effects.',
  baseHP: 75,
  basePA: 7,
  basePM: 3,
  sorts: Object.keys(MAGE_SPELLS)
};