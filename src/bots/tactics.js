// Estimates use only the public bot view, never the match's RNG or hidden cells.
import { dist, spellZoneCells, areaDamagePercent, key } from '../engine/geometry';
import { armorReduction, damageAmount, applyResistances, critDivisor, effectiveStat, statBuffTotal } from '../engine/formulas';
import { effectAcceptsTarget } from '../engine/engine';

export const DAMAGE_KINDS = new Set(['damage', 'lifeSteal', 'fixedLifeSteal', 'punitionDamage']);
export const effectMean = e => ((e.min || 0) + (e.max ?? e.min ?? 0)) / 2;

export function expectedHit(effect, caster, target, fighters = {}, spell = {}, center = target.pos, from = caster.pos) {
  let victim = target;
  if (!spell.trap) {
    const sacrifice = victim.effects?.find(e => e.kind === 'sacrifice' && e.source !== victim.id && fighters[e.source]?.hp > 0);
    if (sacrifice) victim = fighters[sacrifice.source];
    if (victim.effects?.some(e => e.kind === 'dodgeMelee') && dist(from, victim.pos) === 1
      && !victim.carriedBy && !victim.effects.some(e => e.kind === 'state' && e.stateId === 6)) {
      return { damage: 0, healing: 0, recoil: 0, victim };
    }
  }
  const element = effect.kind === 'punitionDamage' ? 'neutre' : effect.element;
  let jet = effectMean(effect);
  if (caster.effects?.some(e => e.kind === 'minRolls') || victim.effects?.some(e => e.kind === 'minRolls')) jet = effect.min || 0;
  if (caster.effects?.some(e => e.kind === 'maxRolls') || victim.effects?.some(e => e.kind === 'maxRolls')) jet = effect.max ?? effect.min ?? 0;
  const boost = (caster.effects || []).filter(e => e.kind === 'spellBoost' && e.boostSpell === spell.id).reduce((n, e) => n + e.value, 0);
  const raw = effect.kind === 'punitionDamage'
    ? Math.floor((((Math.cos(2 * Math.PI * (caster.hp / Math.max(1, caster.maxHp) - .5)) + 1) ** 2) / 4) * (effect.p1 || 0) / 100 * caster.maxHp)
    : effect.kind === 'fixedLifeSteal' ? jet : damageAmount(jet + boost, element, caster, spell);
  const area = effect.kind === 'fixedLifeSteal' ? 100 : areaDamagePercent(effect.zone, center, target.pos, spell.isWeapon);
  const mitigated = effect.kind === 'fixedLifeSteal' ? raw
    : Math.max(0, applyResistances(Math.floor(raw * area / 100), element, victim, caster) - armorReduction(victim, element, fighters));
  const reflection = caster.id === victim.id || spell.trap ? 0 : Math.min(mitigated, (victim.effects || [])
    .filter(e => e.kind === 'damageReflection').reduce((n, e) => n + Math.floor(e.value * (100 + effectiveStat(victim, 'sagesse')) / 100), 0));
  let damage = mitigated - reflection, healing = 0;
  let recoil = caster.id === victim.id ? 0 : Math.min(mitigated, Math.max(0, statBuffTotal(victim, 'reflect')));
  recoil += Math.max(0, applyResistances(reflection, element, caster, victim) - armorReduction(caster, element, fighters));
  const luck = victim.effects?.find(e => e.kind === 'ecaflipLuck');
  if (luck) {
    const probability = luck.chance / 100;
    healing = Math.min(victim.maxHp - victim.hp, damage * luck.healFactor) * probability;
    damage *= (1 - probability) * luck.damageFactor;
    recoil *= 1 - probability;
  }
  if (!spell.isWeapon && !spell.trap && victim.id !== caster.id) {
    const reflect = victim.effects?.find(e => e.kind === 'spellReflection' && e.value >= (spell.grade || 1));
    if (reflect) {
      const p = Math.min(1, (reflect.chance || 100) / 100);
      recoil += Math.max(0, applyResistances(Math.floor(raw * area / 100), element, caster, victim) - armorReduction(caster, element, fighters)) * p;
      damage *= 1 - p; healing *= 1 - p;
    }
  }
  return { damage, healing, recoil, victim };
}

export function spellDamage(spell, caster, victim, fighters = {}, center = victim.pos, from = caster.pos) {
  const rowsDamage = rows => (rows || []).reduce((n, e) => {
    if (!DAMAGE_KINDS.has(e.kind) || !effectAcceptsTarget(e, caster, victim)) return n;
    if (!(e.targetMask & 32) && !spellZoneCells(e.zone, center, from).some(p => p.x === victim.pos.x && p.y === victim.pos.y)) return n;
    const hit = expectedHit(e, caster, victim, fighters, spell, center, from);
    const sign = hit.victim.team === caster.team ? -1 : 1;
    return n + (sign * (hit.damage - hit.healing) - hit.recoil) * (e.chance > 0 ? e.chance / 100 : 1);
  }, 0);
  let damage = rowsDamage(spell.effects);
  if (spell.critRate && spell.critEffects?.length) {
    const p = 1 / critDivisor(spell.critRate, effectiveStat(caster, 'agilite'), statBuffTotal(caster, 'crit') + (spell.critBonus || 0));
    damage = damage * (1 - p) + rowsDamage(spell.critEffects) * p;
  }
  return Math.max(0, damage * (spell.failRate ? 1 - 1 / Math.max(2, spell.failRate) : 1));
}

// Immediate, stackable resource/stat boosts for a short within-turn forecast.
// The actual action still goes through the engine and every step is re-planned.
export function casterAfterSpell(caster, spell, center, from = caster.pos) {
  const result = { ...caster, pos: from, pa: caster.pa - spell.pa, effects: [...caster.effects] };
  const stats = { buffPa: 'pa', buffPm: 'pm', debuffPa: 'pa', debuffPm: 'pm', buffPower: 'power', buffDamage: 'damage', buffCrit: 'crit', buffRange: 'range' };
  for (const effect of spell.effects) {
    if (!effectAcceptsTarget(effect, caster, caster)) continue;
    if (!(effect.targetMask & 32) && !spellZoneCells(effect.zone, center, from).some(p => p.x === from.x && p.y === from.y)) continue;
    const stat = stats[effect.kind] || (effect.kind === 'buffStat' ? effect.stat : null);
    if (stat) {
      const value = effectMean(effect) * (effect.chance > 0 ? effect.chance / 100 : 1) * (effect.kind.startsWith('debuff') ? -1 : 1);
      result.effects.push({ kind: 'buff', stat, value });
      if (stat === 'pa') result.pa = Math.max(0, result.pa + value);
    }
    if (effect.kind === 'weaponMastery') result.effects.push({ kind: 'weaponMastery', weaponType: effect.p1, value: effect.p2 });
    if (['state', 'removeState'].includes(effect.kind)) {
      result.effects = result.effects.filter(e => !(e.kind === 'state' && e.stateId === effect.p3));
      if (effect.kind === 'state') result.effects.push({ kind: 'state', stateId: effect.p3 });
    }
  }
  return result;
}

// A cooldown starts immediately; per-target limits also constrain combinations.
export function castsRemaining(spell, fighter, targetId) {
  const perTarget = spell.usesPerTarget > 0
    ? Math.max(0, spell.usesPerTarget - (fighter.usedOnTarget?.[spell.key]?.[targetId] || 0)) : 99;
  return Math.max(0, Math.min(spell.usesLeft ?? 99, perTarget, spell.cooldown > 0 ? 1 : 99));
}

// Bounded knapsack, not a greedy damage/PA sum: e.g. 3+3 AP beats 4 AP
// when the expensive hit would strand the last two points.
export function bestBudget(options, budget) {
  const pa = Math.max(0, Math.min(40, Math.floor(budget)));
  let scores = Array(pa + 1).fill(0);
  for (const option of options) {
    const cost = Math.max(1, Math.ceil(option.pa));
    const uses = Math.min(option.uses ?? 99, Math.floor(pa / cost));
    const before = scores;
    scores = [...before];
    for (let b = cost; b <= pa; b++) for (let n = 1; n <= uses && n * cost <= b; n++) {
      scores[b] = Math.max(scores[b], before[b - n * cost] + option.value * n);
    }
  }
  return scores[pa];
}

// Inverse area: include EMPTY aimed cells whose area contains a fighter.
// This covers circles, crosses, lines, staffs and hammers without class IDs.
export function areaAimCells(spell, victim, from, board) {
  if (!['cell', 'freeCell'].includes(spell.targetMode)) return [{ ...victim }];
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_';
  const zones = [...new Set([...(spell.effects || []), ...(spell.critEffects || [])]
    .filter(e => !(e.targetMask & 32)).map(e => e.zone || 'Pa'))];
  const points = new Map([[key(victim.x, victim.y), { ...victim }]]);
  for (const zone of zones) {
    const radius = zone[0] === 'P' ? 0 : Math.min(Math.max(board.width, board.height), Math.max(0, alphabet.indexOf(zone[1])));
    for (let y = Math.max(0, victim.y - radius); y <= Math.min(board.height - 1, victim.y + radius); y++) {
      for (let x = Math.max(0, victim.x - radius); x <= Math.min(board.width - 1, victim.x + radius); x++) {
        const center = { x, y };
        if (zone[0] === 'C' && dist(center, victim) > radius) continue;
        if (zone[0] === 'O' && dist(center, victim) !== radius) continue;
        if (zone[0] === 'X' && center.x !== victim.x && center.y !== victim.y) continue;
        if (['C', 'O', 'X'].includes(zone[0]) || spellZoneCells(zone, center, from).some(p => p.x === victim.x && p.y === victim.y)) points.set(key(x, y), center);
      }
    }
  }
  return [...points.values()];
}
