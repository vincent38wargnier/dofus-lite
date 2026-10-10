import { isAuthoredSpell, authoredSpellErrors } from './authoredSpells';

export const MAX_CUSTOM_SPELLS = 10;

const integer = value => Number.isInteger(value) && value >= 0;
const effectsValid = (effects, depth = 0) => Array.isArray(effects) && effects.length <= 100 && depth < 8
  && effects.every(effect => effect && typeof effect.kind === 'string'
    && typeof effect.zone === 'string'
    && (effect.trigger == null || (effectsValid(effect.trigger.effects, depth + 1)
      && effectsValid(effect.trigger.critEffects || [], depth + 1))));

// Custom spellbooks store the imported grade, so replays and saved characters
// do not depend on a catalogue request or on another character's class.
export function isCustomSpell(raw) {
  return !!raw && integer(raw.id) && raw.id > 0 && typeof raw.name === 'string' && !!raw.name.trim()
    && typeof raw.key === 'string' && !!raw.key && integer(raw.grade) && raw.grade >= 1 && raw.grade <= 6
    && integer(raw.pa) && integer(raw.rangeMin) && integer(raw.rangeMax) && raw.rangeMax >= raw.rangeMin
    && effectsValid(raw.effects) && effectsValid(raw.critEffects)
    && (!isAuthoredSpell(raw) || authoredSpellErrors(raw).length === 0);
}

export function isCustomSpellbook(spells) {
  return isCustomSpellbookDraft(spells) && spells.length <= MAX_CUSTOM_SPELLS;
}

// Older creations allowed 40 spells. Keep those drafts editable and saved while
// their owner chooses which ten to keep; combat always uses the stricter check.
export function isCustomSpellbookDraft(spells) {
  return Array.isArray(spells) && spells.length <= 40 && spells.every(isCustomSpell)
    && new Set(spells.map(spell => spell.id)).size === spells.length;
}
