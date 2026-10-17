import { spellLibrary as LIBRARY } from './gameData';

// A reproducible design budget, not Ankama's (unpublished) balancing formula.
// Units are raw-damage equivalents at 600 characteristic / +56 fixed damage.
// See docs/spell-balance.md and scripts/audit_spell_budgets.cjs.
export const SPELL_BALANCE_VERSION = 1;
export const MAX_SPELL_SCORE = 100;
export const MAX_KIT_SCORE = 650;
export const BALANCE_WEIGHTS = {
  buffDamage: .4, buffPower: .10, buffStat: .08, buffPa: 15, buffPm: 9,
  buffRange: 6, buffCrit: 1.5, buffVitality: .06, armor: 1.8,
  resistBuff: .45, resistAllBuff: 1.6, resistDebuff: .65,
  removePa: 12, removePm: 9, debuffPa: 15, debuffPm: 11, debuffRange: 6,
  debuffStat: .08, stealStat: .13, stealPa: 23, stealPm: 16,
};
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const num = v => Number.isFinite(Number(v)) ? Number(v) : 0;
const damageKinds = ['damage', 'lifeSteal', 'poison', 'fixedLifeSteal'];
const offensiveKinds = [...damageKinds, 'punitionDamage', 'percentLifeDamage', 'kill'];
const variants = s => [s.effects || [], ...(s.critRate && s.critEffects?.length ? [s.critEffects] : [])];
const point = e => e.targetMask === 32 || !e.zone || e.zone[0] === 'P' || e.zone[1] === 'a';
const potency = e => Math.max(0, .325 * num(e.min) + .675 * Math.max(num(e.min), num(e.max)));
const lifetime = e => 1 + .5 * Math.max(0, Math.min(8, num(e.duration)) - 1);
const range = s => num(s.rangeMax ?? s.range?.[1]);
const casts = s => num(s.maxPerTurn ?? s.usesPerTurn) || 3;

function reachMultiplier(spell, effect) {
  if (effect.targetMask === 32 || spell.targetMode === 'self' || !range(spell)) return 1;
  return (.85 + .025 * Math.min(12, range(spell)))
    * (spell.needsLos === false ? 1.18 : 1) * (spell.adjustableRange ? 1.12 : 1)
    * (spell.lineOnly ? .9 : 1) * (num(spell.rangeMin ?? spell.range?.[0]) >= 3 ? .9 : 1);
}

export function balanceAreaMultiplier(effect) {
  if (point(effect)) return 1;
  const radius = clamp((effect.zone?.charCodeAt(1) || 97) - 97, 1, 6);
  const shape = effect.zone?.[0];
  const spread = shape === 'C' ? .8 + radius * .3 : shape === 'X' ? .55 + radius * .2 : .5 + radius * .12;
  // A useful area often catches two or three fighters, not every geometric cell.
  return (1 + spread) * (effect.targetMask === 1 ? 1.12 : 1);
}

function effectUnits(spell, effect, depth = 0) {
  const value = potency(effect), duration = lifetime(effect), kind = effect.kind;
  let units;
  if (damageKinds.includes(kind)) units = (value + 8) * (kind.includes('Steal') ? 1.45 : 1) * (kind === 'poison' ? duration : 1);
  else if (kind === 'heal') units = (value + 5) * .9 * duration;
  else if (BALANCE_WEIGHTS[kind]) {
    const repeat = spell.cooldown > 1 ? 1 : casts(spell);
    const stacks = Math.ceil((num(effect.duration) + 1) / Math.max(1, num(spell.cooldown))) * repeat;
    const stackable = /^buff|^resist|^armor/.test(kind);
    units = value * BALANCE_WEIGHTS[kind] * duration * (stackable ? 1 + .2 * Math.max(0, stacks - 1) : 1);
    if (kind === 'buffStat' && effect.stat === 'sagesse') units *= 1.25;
  } else if (kind === 'push') units = value * 5;
  else if (['pull', 'fear', 'throw'].includes(kind)) units = value * 3.5;
  else if (kind === 'teleport') units = 12 + Math.min(12, range(spell)) * 4;
  else if (kind === 'spellBoost') units = Math.max(0, num(effect.p3)) * .32; // prepared hit, one cooldown later
  else if (kind === 'refundPa') units = value * 15;
  else if (['summon', 'staticSummon', 'double', 'revive'].includes(kind)) units = kind === 'revive' ? 90 : 45;
  else if (['trap', 'glyph', 'delayedSpell'].includes(kind)) {
    units = depth < 2 && effect.trigger?.effects?.length
      ? effect.trigger.effects.reduce((sum, e) => sum + effectUnits(spell, e, depth + 1), 0) * .8 : 40;
  } else if (['invisibility', 'dodgeMelee', 'sacrifice', 'skipTurn', 'spellReflection'].includes(kind)) units = 30 * duration;
  else if (['damageReflection', 'damageOnHit', 'punishment', 'apPoison'].includes(kind)) units = Math.min(70, value * 3) * duration;
  else if (['swap', 'rollback', 'dispel', 'ecaflipLuck'].includes(kind)) units = 35;
  else if (['reveal', 'erosion', 'state', 'removeState', 'carry', 'maxRolls', 'minRolls'].includes(kind)) units = 12 * duration;
  else if (kind === 'punitionDamage') units = 100;
  else if (['percentLifeDamage', 'lifeTransfer'].includes(kind)) units = value * 4;
  else if (['ignore', 'cosmetic', 'outOfCombat', 'selfDamage'].includes(kind)) units = 0;
  else units = 250; // Unknown mechanics must never provide a free budget.
  if (num(effect.targetMask) & 8) units *= .035; // native summon-only damage, e.g. Fouet
  if (num(effect.chance) > 0) units *= Math.max(.1, num(effect.chance) / 100);
  return units * balanceAreaMultiplier(effect) * reachMultiplier(spell, effect);
}

const canonicalFields = ['pa', 'rangeMin', 'rangeMax', 'needsLos', 'lineOnly', 'adjustableRange', 'targetMode',
  'emptyCellOnly', 'maxPerTurn', 'maxPerTarget', 'cooldown', 'initialCooldown', 'critRate', 'failRate',
  'endsTurnOnFailure', 'requiredStates', 'forbiddenStates', 'effects', 'critEffects'];
function originalClassSpell(spell) {
  if (spell.authoringVersion !== undefined) return false;
  const original = LIBRARY.spells[spell.id]?.grades.find(g => g.grade === spell.grade);
  return original && (LIBRARY.common.includes(spell.id) || Object.values(LIBRARY.classes).some(ids => ids.includes(spell.id)))
    && canonicalFields.every(key => JSON.stringify(original[key] ?? null) === JSON.stringify(spell[key] ?? null));
}

function variantUnits(spell, effects) {
  let flat = 0, power = 0, stats = {}, total = 0;
  for (const effect of effects) {
    let units = effectUnits(spell, effect);
    if (damageKinds.includes(effect.kind)) {
      const stat = { terre: 'force', neutre: 'force', feu: 'intelligence', eau: 'chance', air: 'agilite' }[effect.element];
      units *= 1 + ((power + (stats[stat] || 0)) / 100 * potency(effect) + flat) / (7 * (potency(effect) + 8));
    }
    total += units;
    if (effect.targetMask === 32 || (spell.targetMode === 'self' && [0, 4].includes(effect.targetMask || 0))) {
      if (effect.kind === 'buffDamage') flat += potency(effect);
      if (effect.kind === 'buffPower') power += potency(effect);
      if (effect.kind === 'buffStat') stats[effect.stat] = (stats[effect.stat] || 0) + potency(effect);
    }
  }
  return total;
}

export function spellBalance(spell) {
  const pa = Math.max(1, num(spell.pa));
  const cooldownCredit = 1 + .25 * clamp(num(spell.cooldown) - 1, 0, 4);
  const singleTargetLimit = num(spell.maxPerTarget ?? spell.usesPerTarget) === 1
    && variants(spell).every(effects => effects.every(point));
  const limited = spell.cooldown > 1 ? 1 : (casts(spell) === 1 ? .9 : singleTargetLimit ? .95 : 1);
  const constrained = spell.requiredStates?.length ? .8 : 1;
  const rows = variants(spell).map(effects => {
    const units = variantUnits(spell, effects);
    return { units, score: units / pa / cooldownCredit * limited * constrained * 7 };
  });
  const normal = rows[0]?.score || 0, critical = rows[1]?.score ?? normal;
  // Critical gear can reach 1/2; a large critical cannot be excused by 1/100.
  const rawScore = Math.max(normal, (normal + critical) / 2, critical / 1.35);
  const native = originalClassSpell(spell);
  // Original class mechanics are admitted with their exact restrictions;
  // exceptional originals spend the entire slot budget. Modified copies do not.
  const score = Math.ceil(native ? Math.min(MAX_SPELL_SCORE, rawScore) : rawScore);
  return { version: SPELL_BALANCE_VERSION, score, limit: MAX_SPELL_SCORE, valid: score <= MAX_SPELL_SCORE,
    normal: Math.ceil(normal), critical: spell.critRate ? Math.ceil(critical) : null,
    original: !!native, exception: !!native && rawScore > MAX_SPELL_SCORE,
    factors: { pa, cooldownCredit, limited, constrained },
    effects: (spell.effects || []).map(e => ({ kind: e.kind, units: +effectUnits(spell, e).toFixed(1) })) };
}

export function spellBudgetErrors(spell) {
  const report = spellBalance(spell), errors = [];
  if (!report.valid) errors.push(`${spell.name || 'Sort'} : score ${report.score}/${MAX_SPELL_SCORE}. Réduisez les effets, la portée ou la zone, augmentez les PA ou la relance.`);
  // No self-funding loops, even split across several effect rows.
  if (spell.authoringVersion !== undefined) for (const effects of variants(spell)) {
    const gains = effects.filter(e => e.kind === 'buffPa');
    if (gains.length && (gains.reduce((sum, e) => sum + num(e.max), 0) >= spell.pa
      || casts(spell) !== 1 || gains.some(e => spell.cooldown <= e.duration))) {
      errors.push('Bonus PA : gain total inférieur au coût, un lancer par tour et relance supérieure à la durée.');
    }
  }
  return [...new Set(errors)];
}

export function spellbookBalance(spells = []) {
  const entries = spells.map(spell => ({ id: spell.id, name: spell.name, ...spellBalance(spell) }));
  const sum = entries.reduce((value, entry) => value + entry.score, 0);
  const attacks = spells.filter(s => variants(s).some(effects => effects.some(e => offensiveKinds.includes(e.kind))));
  // A support-only kit can still attack with its equipped weapon.
  const strongest = Math.max(60, ...attacks.map(s => spellBalance(s).score));
  const bonus = kind => spells.reduce((sum, spell) => sum + Math.max(0, ...variants(spell)
    .map(effects => effects.filter(e => e.kind === kind).reduce((v, e) => v + num(e.max), 0))), 0);
  const amplification = bonus('buffDamage') / 60 + (bonus('buffPower') + bonus('buffStat')) / 400
    + bonus('buffPa') / 4 + bonus('resistDebuff') / 40;
  // Independent AP generators can circumvent each spell's anti-loop checks.
  // Price the combined economy, even if the kit contains no attack spell.
  const resourceSynergy = 10 * Math.max(0, bonus('buffPa') - 2) ** 2;
  const synergy = Math.ceil(strongest * Math.min(2, amplification) * .2) + resourceSynergy;
  const bursts = attacks.filter(s => s.cooldown >= 2 && spellBalance(s).score >= 75).length;
  const rotation = Math.max(0, bursts - 1) * 10;
  const score = sum + synergy + rotation;
  return { version: SPELL_BALANCE_VERSION, entries, sum, synergy, rotation, score, limit: MAX_KIT_SCORE,
    valid: score <= MAX_KIT_SCORE && entries.every(entry => entry.valid) };
}

export function spellbookBudgetErrors(spells) {
  const report = spellbookBalance(spells);
  const errors = spells.flatMap(spellBudgetErrors);
  if (report.score > MAX_KIT_SCORE) errors.push(`Classe : score ${report.score}/${MAX_KIT_SCORE}, dont ${report.synergy + report.rotation} points de synergies. Réduisez la puissance du kit ou remplacez un sort.`);
  return [...new Set(errors)];
}

// The benchmark covers every grade-six class spell, including unusual effects.
// Per-effect equivalents for native special mechanics are estimates, not a DPS ranking.
export function classBalanceReference() {
  return Object.entries(LIBRARY.classes).flatMap(([classId, ids]) => ids.map(id => {
    const entry = LIBRARY.spells[id], raw = { ...entry.grades.find(g => g.grade === 6), id, name: entry.name };
    return { classId, ...raw, balance: spellBalance(raw) };
  }));
}
