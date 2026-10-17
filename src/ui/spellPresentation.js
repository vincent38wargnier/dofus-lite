import { SPELL_LIBRARY } from '../engine/classes';

export const SPELL_CATEGORIES = ['weapon', 'neutre', 'terre', 'feu', 'eau', 'air', 'multi',
  'boost', 'heal', 'summon', 'placement', 'debuff', 'utility'];
const LABELS = { weapon: 'Arme', neutre: 'Neutre', terre: 'Terre', feu: 'Feu', eau: 'Eau', air: 'Air',
  multi: 'Plusieurs éléments', boost: 'Boost / protection', heal: 'Soin', summon: 'Invocation',
  placement: 'Placement', debuff: 'Retrait / malus', utility: 'Utilitaire' };
// UI colours exist independently of any optional content library.
const DEFAULT_PALETTE = { neutre: '#89918a', terre: '#b58b62', feu: '#d86b54', eau: '#5c9fc4',
  air: '#82b76b', multi: '#a58bc7', boost: '#c5a85e', heal: '#69b29b', summon: '#a28a6d',
  placement: '#829cba', debuff: '#b78291', utility: '#8e9a89' };
const PROTECTIONS = new Set(['armor', 'resistBuff', 'resistAllBuff', 'punishment', 'weaponMastery', 'invisibility',
  'dodgeMelee', 'damageReflection', 'spellReflection', 'ecaflipLuck', 'sacrifice', 'maxRolls']);

function effectsOf(spell) {
  const effects = [...(spell.effects || []), ...(spell.critEffects || [])];
  // Traps, glyphs and delayed spells inherit the element of their triggered
  // effects. An invocation keeps its own category, not its creature's attacks.
  return effects.flatMap(effect => [effect, ...(effect.trigger ? effectsOf(effect.trigger) : [])]);
}

export function spellPresentation(spell) {
  const definition = spell.effects ? spell : SPELL_LIBRARY.spells[spell.id]?.grades.at(-1) || spell;
  const effects = effectsOf(definition);
  const elements = [...new Set(effects.flatMap(effect => {
    if (['damage', 'lifeSteal', 'poison'].includes(effect.kind)) return effect.element ? [effect.element] : [];
    if (effect.kind === 'punitionDamage') return ['neutre'];
    if (effect.kind === 'apPoison') return ['feu'];
    return [];
  }))];
  const has = (...kinds) => effects.some(effect => kinds.includes(effect.kind));
  let category = 'utility';
  if (spell.isWeapon) category = 'weapon';
  else if (elements.length) category = elements.length > 1 ? 'multi' : elements[0];
  else if (has('summon', 'staticSummon', 'double', 'revive')) category = 'summon';
  else if (effects.some(effect => effect.kind.startsWith('buff') || PROTECTIONS.has(effect.kind))) category = 'boost';
  else if (has('heal', 'lifeTransfer', 'fixedLifeSteal')) category = 'heal';
  else if (has('push', 'pull', 'teleport', 'swap', 'carry', 'throw', 'fear', 'rollback')) category = 'placement';
  else if (effects.some(effect => /^(removeP[am]|stealP[am]|debuff|resistDebuff|minRolls|skipTurn)/.test(effect.kind))) category = 'debuff';
  const color = SPELL_LIBRARY.iconPalette?.[category] || DEFAULT_PALETTE[category] || DEFAULT_PALETTE.utility;
  return { category, color: category === 'weapon' ? '#697257' : color, label: LABELS[category] };
}

export function sortSpellsByType(spells) {
  // Stable within a category: retain the user's order and current spell grades.
  return [...spells].sort((a, b) => SPELL_CATEGORIES.indexOf(spellPresentation(a).category)
    - SPELL_CATEGORIES.indexOf(spellPresentation(b).category)).map(spell => spell.id);
}
