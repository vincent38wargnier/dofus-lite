import { getMonster } from './monsters';
import { buildSpell } from './classes';
import { isCustomSpell } from './customSpells';
import { spellbookBudgetErrors } from './spellBalance';

export function validCustomMonster(value, { allowEmpty = false } = {}) {
  const inRange = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
  return !!value && typeof value.key === 'string' && value.key.length > 0 && typeof value.name === 'string' && !!value.name.trim()
    && !!getMonster(value.reference?.monsterId, value.reference?.grade)
    && inRange(value.tuning?.hpPercent, 25, 150) && inRange(value.tuning?.statsPercent, 25, 150)
    && inRange(value.tuning?.paBonus, -2, 2) && inRange(value.tuning?.pmBonus, -2, 2)
    && Array.isArray(value.spells) && value.spells.length >= (allowEmpty ? 0 : 1) && value.spells.length <= 10
    && value.spells.every(spell => isCustomSpell(spell, { forStorage: allowEmpty }))
    && (allowEmpty || spellbookBudgetErrors(value.spells).length === 0)
    && new Set(value.spells.map(spell => spell.id)).size === value.spells.length;
}

export function resolveCustomMonster(value) {
  if (!validCustomMonster(value)) throw new Error('Monstre personnalisé invalide.');
  const reference = getMonster(value.reference.monsterId, value.reference.grade);
  // Native identifiers trigger special mechanics in combat. A visual/stat
  // reference must never secretly inherit those mechanics or its spellbook.
  return { ...reference, name: value.name, monsterId: null, appearanceMonsterId: reference.monsterId,
    behavior: 'custom', artworkId: value.artworkId,
    baseHp: Math.max(1, Math.round(reference.baseHp * value.tuning.hpPercent / 100)),
    basePa: Math.max(0, Math.min(20, reference.basePa + value.tuning.paBonus)),
    basePm: Math.max(0, Math.min(8, reference.basePm + value.tuning.pmBonus)),
    stats: Object.fromEntries(Object.entries(reference.stats).map(([stat, amount]) => [stat, Math.round(amount * value.tuning.statsPercent / 100)])),
    spells: Object.fromEntries(value.spells.map(raw => { const spell = buildSpell(raw); return [spell.key, spell]; })),
  };
}
