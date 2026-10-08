// Dofus 1.29 combat formulas, reimplemented from cross-checked emulator
// sources (CodeBreak, GDCore, Shivas, AncestraRemake — see emulators/).
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
// rate = max(2, floor((base - bonus) * e * 1.1 / ln(agility + 12)))
// (e * 1.1 ≈ 2.9901, the constant seen across all emulators)
export function critDivisor(baseRate, agility, critBonus = 0) {
  if (!baseRate || baseRate <= 0) return 0; // spell cannot crit
  let rate = baseRate - critBonus;
  rate = Math.floor((rate * Math.E * 1.1) / Math.log(agility + 12));
  return Math.max(2, rate);
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
//   clamped to [10, 90] (equal agility => 50%).
export function escapeChance(agiMover, agiEnemiesSum) {
  const chance = Math.floor(
    (300 * (agiMover + 25)) / (agiMover + agiEnemiesSum + 50),
  ) - 100;
  return Math.min(90, Math.max(10, chance));
}

// Roll the escape. On failure the fighter is tackled: the move is cancelled,
// ALL remaining PM are lost, plus (chance%) of current PA.
export function rollEscape(rng, agiMover, agiEnemiesSum, currentPa) {
  const chance = escapeChance(agiMover, agiEnemiesSum);
  const roll = rng.int(0, 99);
  if (roll <= chance) return { escaped: true, chance, roll, lostPa: 0 };
  const lostPa = Math.min(currentPa, Math.floor((currentPa * chance) / 100));
  return { escaped: false, chance, roll, lostPa };
}

// ---------------------------------------------------------------- esquive

// Dodge stat against PA/PM removal: sagesse / 4.
export function dodgeStat(sagesse) {
  return Math.floor(sagesse / 4);
}

// Each removed point is rolled separately:
//   P = ceil( (removerDodge / victimDodge) * (remaining / max) * 50 ) %, in [0, 100].
export function rollPointRemoval(rng, removerDodge, victimDodge, current, max, points) {
  let removed = 0;
  const rd = Math.max(1, removerDodge);
  const vd = Math.max(1, victimDodge);
  for (let i = 0; i < points; i++) {
    const remaining = Math.max(0, current - removed);
    if (remaining <= 0 || max <= 0) break;
    let percent = Math.ceil((rd / vd) * (remaining / max) * 50);
    if (percent > 100) percent = 100;
    if (rng.int(0, 99) < percent) removed += 1;
  }
  return { removed, dodged: points - removed };
}

// ---------------------------------------------------------------- divers

// Initiative (1.29): (extraVitality/4 + force + int + chance + agi) * life ratio.
// No roll — ties are broken by the match seed at fight creation.
export function initiative(stats, extraHp, hp, maxHp) {
  const coef = Math.floor(extraHp / 4)
    + stats.force + stats.intelligence + stats.chance + stats.agilite;
  return Math.max(0, Math.floor(coef * (hp / maxHp)));
}

// Dégâts de poussée (brute, unmitigated):
//   floor( (1d8+8) * max(0.1, level/50) * blockedCells ), minimum 1.
export function pushbackDamage(rng, level, remainingCells) {
  if (remainingCells <= 0) return 0;
  const coef = Math.max(0.1, level / 50);
  return Math.max(1, Math.floor(rng.int(9, 16) * coef * remainingCells));
}

// ---------------------------------------------------------------- dégâts

function statBuffTotal(fighter, stat) {
  return (fighter.effects || [])
    .filter((e) => e.kind === 'buff' && e.stat === stat)
    .reduce((s, e) => s + e.value, 0);
}

// Base jet -> element multiplier: floor(jet * (100 + stat + %power) / 100) + flat
export function damageAmount(jet, element, caster) {
  const statName = ELEMENT_STAT[element] || 'force';
  const stat = (caster.stats[statName] || 0) + statBuffTotal(caster, statName);
  const power = statBuffTotal(caster, 'power');
  const flat = statBuffTotal(caster, 'damage');
  return Math.floor((jet * (100 + stat + power)) / 100) + flat;
}

// Resistances of the target: % (base + buffs/débuffs élémentaires) then
// fixed, floored at 0. Les % cumulés sont bornés à 90.
export function applyResistances(damage, element, target) {
  let pct = (target.resistances && target.resistances[element]) || 0;
  pct += statBuffTotal(target, `res_${element}`);
  pct = Math.min(90, pct);
  const fixed = (target.resistancesFixed && target.resistancesFixed[element]) || 0;
  const reduced = Math.floor((damage * (100 - pct)) / 100) - fixed;
  return Math.max(0, reduced);
}

// Heal: floor(jet * (100 + intelligence) / 100)
export function healAmount(jet, caster) {
  const int = (caster.stats.intelligence || 0) + statBuffTotal(caster, 'intelligence');
  return Math.floor((jet * (100 + int)) / 100);
}
