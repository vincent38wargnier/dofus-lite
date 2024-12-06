import { WARRIOR_SPELLS } from './warrior';
import { ARCHER_SPELLS } from './archer';
import { MAGE_SPELLS } from './mage';
import { SPELL_PATTERNS } from './patterns';

export const SORTS = {
  ...WARRIOR_SPELLS,
  ...ARCHER_SPELLS,
  ...MAGE_SPELLS
};

export { SPELL_PATTERNS };