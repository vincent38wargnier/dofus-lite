// Dofus Retro / 1.29 combat model. Audited against Ankama's archived French
// changelogs and historical calculators; provenance and remaining limits: README.
// All functions are pure; randomness comes from the seeded rng passed in.

// Which characteristic boosts which element.
export const ELEMENT_STAT = {
  neutre: 'force',
  terre: 'force',
  feu: 'intelligence',
  eau: 'chance',
  air: 'agilite',
};

export const ELEMENT_EMOJI = {
  neutre: '⚪', terre: '🟤', feu: '🔥', eau: '💧', air: '💨',
};

// ---------------------------------------------------------------- critique

// Critical hit divisor: base "1/x" improved by agility.
// Apply +CC before agility. Agility never makes the adjusted base rate worse.
// DofuX calculator: 0 agi preserves 1/40; 8/42/134/384 agi turn 1/3..1/6 into 1/2.
// (e * 1.1 ≈ 2.9901, the constant seen across all emulators)
export function critDivisor(baseRate, agility, critBonus = 0) {
  if (!baseRate || baseRate <= 0) return 0; // spell cannot crit
  const adjusted = Math.max(2, baseRate - critBonus);
  const rate = Math.floor((adjusted * Math.E * 1.1) / Math.log(Math.max(0, agility) + 12));
  return Math.max(2, Math.min(adjusted, rate));
}

export function rollCritical(rng, baseRate, agility, critBonus = 0) {
  const divisor = critDivisor(baseRate, agility, critBonus);
  if (divisor === 0) return false;
  return rng.int(1, divisor) === 1;
}

// Critical failure (échec critique): flat 1/x, agility plays no part.
export function rollFailure(rng, failRate) {
  if (!failRate || failRate <= 0) return false;
  return rng.int(1, Math.max(2, failRate)) === 1;
}

// ---------------------------------------------------------------- fuite

// Escape chance when leaving contact (tacle/fuite, 1.29):
//   chance = floor(300 * (agi + 25) / (agi + enemiesAgi + 50)) - 100,
//   clamped to [0, 100] (equal agility => 50%). Ankama 1.27, "gestion du tacle".
export function escapeChance(agiMover, agiEnemiesSum) {
  const chance = Math.floor(
    (300 * (agiMover + 25)) / (agiMover + agiEnemiesSum + 50),
  ) - 100;
  return Math.min(100, Math.max(0, chance));
}

// Roll the escape. On failure the fighter is tackled: the move is cancelled,
// ALL remaining PM are lost, plus floor(PA * chance / 200).
// Ankama's example: a failed 50% escape with 8 or 10 PA loses 2 PA.
export function rollEscape(rng, agiMover, agiEnemiesSum, currentPa) {
  const chance = escapeChance(agiMover, agiEnemiesSum);
  const roll = rng.int(0, 99);
  if (roll < chance) return { escaped: true, chance, roll, lostPa: 0 };
  const lostPa = Math.min(currentPa, Math.floor((currentPa * chance) / 200));
  return { escaped: false, chance, roll, lostPa };
}

// ---------------------------------------------------------------- esquive

// Dodge stat against PA/PM removal: sagesse / 4.
export function dodgeStat(sagesse) {
  return Math.floor(sagesse / 4);
}

// Ankama 1.25: dodge bonuses affect defense only, not removal ability.
export function pointRemovalScores(attacker, victim, stat) {
  return {
    attack: dodgeStat(effectiveStat(attacker, 'sagesse')),
    defense: dodgeStat(effectiveStat(victim, 'sagesse'))
      + statBuffTotal(victim, stat === 'pa' ? 'dodgePa' : 'dodgePm'),
  };
}

// Each point is rolled separately, using the points left after successful rolls.
// Bounds 10..90 are official (1.25); integer-percent rounding is our local model.
export function pointRemovalChance(removerDodge, victimDodge, remaining, max) {
  if (remaining <= 0 || max <= 0) return 0;
  const rd = Math.max(1, removerDodge);
  const vd = Math.max(1, victimDodge);
  return Math.min(90, Math.max(10, Math.ceil((rd / vd) * (remaining / max) * 50)));
}

export function rollPointRemoval(rng, removerDodge, victimDodge, current, max, points) {
  let removed = 0;
  for (let i = 0; i < points; i++) {
    const remaining = Math.max(0, current - removed);
    if (remaining <= 0 || max <= 0) break;
    const percent = pointRemovalChance(removerDodge, victimDodge, remaining, max);
    if (rng.int(0, 99) < percent) removed += 1;
  }
  return { removed, dodged: points - removed };
}

// ---------------------------------------------------------------- divers

// Initiative since Ankama 1.28: (four elemental stats + initiative bonus) * life ratio.
// Vitality and wisdom do not add initiative.
// No roll — ties are broken by the match seed at fight creation.
export function initiative(stats, hp, maxHp, bonus = 0) {
  const coef = bonus + ['force', 'intelligence', 'chance', 'agilite']
    .reduce((sum, stat) => sum + (stats[stat] || 0), 0);
  return maxHp > 0 ? Math.max(0, Math.floor(coef * Math.min(1, hp / maxHp))) : 0;
}

// Dégâts de poussée (brute, unmitigated):
// Ankama 1.27 historical formula: floor((8 + 1d8 * level/50) * blockedCells).
export function pushbackDamage(rng, level, remainingCells) {
  if (remainingCells <= 0) return 0;
  return Math.max(1, Math.floor((8 + rng.int(1, 8) * Math.max(0, level) / 50) * remainingCells));
}

// ---------------------------------------------------------------- dégâts

export function statBuffTotal(fighter, stat) {
  return (fighter.permanent?.[stat] || 0) + (fighter.effects || [])
    .filter((e) => e.kind === 'buff' && e.stat === stat)
    .reduce((s, e) => s + e.value, 0);
}

export function effectiveStat(fighter, stat) {
  return Math.max(0, (fighter.stats[stat] || 0) + statBuffTotal(fighter, stat));
}

// Ankama 1.27: armor characteristic = max(element, (intelligence + element)/2).
// Elemental Feca armor uses its caster; other armor uses its recipient (local model).
export function armorReduction(target, element, fighters = {}) {
  const elements = { 1: ['feu'], 6: ['terre', 'neutre'], 14: ['air'], 18: ['eau'] };
  return (target.effects || []).filter(e => e.kind === 'armor').reduce((sum, e) => {
    const allowed = elements[e.spellId];
    if (allowed && !allowed.includes(element)) return sum;
    const owner = allowed ? fighters[e.source] || target : target;
    const intelligence = effectiveStat(owner, 'intelligence');
    const characteristic = effectiveStat(owner, ELEMENT_STAT[element] || 'force');
    const protectionStat = Math.max(characteristic, (intelligence + characteristic) / 2);
    return sum + Math.floor(e.value * (100 + protectionStat) / 100);
  }, statBuffTotal(target, 'armor') + statBuffTotal(target, ['terre', 'neutre'].includes(element) ? 'armorPhysical' : 'armorMagic'));
}

// Base jet -> element multiplier: floor(jet * (100 + stat + %power) / 100) + flat
export function damageAmount(jet, element, caster, options = {}) {
  const statName = ELEMENT_STAT[element] || 'force';
  const stat = effectiveStat(caster, statName);
  const power = statBuffTotal(caster, 'power') + (options.trap ? statBuffTotal(caster, 'trapPower') : 0);
  const flat = statBuffTotal(caster, 'damage') + (options.trap ? statBuffTotal(caster, 'trapDamage') : 0)
    + (options.flatDamage || 0) + (['terre', 'neutre'].includes(element) ? statBuffTotal(caster, 'physicalDamage') : 0);
  const mastery = options.weaponType ? (caster.effects || []).filter(e => e.kind === 'weaponMastery' && e.weaponType === options.weaponType)
    .reduce((value, e) => Math.max(value, e.value), 0) : 0;
  return Math.max(0, Math.floor((jet * Math.max(0, 100 + stat + power) * (100 + mastery)) / 10000) + flat);
}

// Ancestra Formulas.calculFinalDommage: fixed reduction before percentage.
// Player percentage resistance is capped at 50%; monsters keep their own cap.
export function resistanceValues(element, target, caster = null) {
  let pct = (target.resistances && target.resistances[element]) || 0;
  pct += statBuffTotal(target, `res_${element}`);
  if (caster?.leader) pct += statBuffTotal(target, `pvpRes_${element}`);
  pct = Math.min(target.isSummon ? 100 : 50, pct);
  const fixed = ((target.resistancesFixed && target.resistancesFixed[element]) || 0)
    + (caster?.leader ? statBuffTotal(target, `pvpFixed_${element}`) : 0);
  return { percent: pct, fixed };
}

export function applyResistances(damage, element, target, caster = null) {
  const { percent: pct, fixed } = resistanceValues(element, target, caster);
  const reduced = Math.floor((Math.max(0, damage - fixed) * (100 - pct)) / 100);
  return Math.max(0, reduced);
}

// Heal: floor(jet * (100 + intelligence) / 100)
export function healAmount(jet, caster) {
  const int = effectiveStat(caster, 'intelligence');
  return Math.max(0, Math.floor((jet * (100 + int)) / 100) + statBuffTotal(caster, 'heal'));
}
