import DATA from './forgemagieData.json';
import CALIBRATION from './forgemagieCalibration.json';
import { createRng } from './rng';
import { FM_STATS, FORGE_MODEL, naturalBounds, extraWeight, statLimit, validateForgedItem } from './forgedItems';

export { FORGE_MODEL, FM_STATS, createForgedItem, naturalBounds, extraWeight, statLimit, forgeRestriction } from './forgedItems';
export const RUNES = DATA.runes;
export const POTIONS = DATA.potions;
export const FORGE_SOURCES = DATA.sources;
export const OUTCOMES = { SC: 'Succès critique', SN: 'Succès neutre', EC: 'Échec' };
const clamp = (x, min, max) => Math.max(min, Math.min(max, x));
const round = x => Math.round(x * 1000000) / 1000000;
const units = weight => Math.round(weight * 20);
export const runeWeight = rune => rune?.supported ? Math.ceil(round(rune.power * FM_STATS[rune.stat].weight)) : 0;

export function forgeCheck(item, state, reagent) {
  const error = validateForgedItem(item, state);
  if (error) return error;
  if (!reagent) return 'Choisissez une rune ou une potion.';
  if (reagent.type === 26) {
    if (!POTIONS.some(p => p === reagent)) return 'Potion inconnue.';
    if (state.weaponPotion) return 'Cette arme a déjà changé d’élément. La conversion est irréversible.';
    if (!item.weapon || !item.effects.some(([id]) => id === 100)) return 'La potion nécessite des dégâts directs neutres.';
    return '';
  }
  if (!RUNES.some(r => r === reagent) || !reagent.supported) return reagent.reason || 'Rune non reproduite.';
  const next = (state.stats[reagent.stat] || 0) + reagent.power;
  if (next > statLimit(item, reagent.stat, state.stats)) return 'Cette rune dépasserait le plafond de puissance (101).';
  if (extraWeight(item, { ...state.stats, [reagent.stat]: next }) > 101 + 1e-8) return 'Le cumul des surjets et exotiques dépasserait 101 de poids.';
  return '';
}

// One law for every rune (scripts/fit_forgemagie.py → forgemagieCalibration.json).
// X, the weight at stake, is the rune's weight on a natural line and the whole
// line's weight after the rune for an over or exo (the quantity the 101 cap limits).
// The weight sets one score r = K / X − M (in %), which the 2009 devblog split
// turns into the three results: SC = r within [1, 66]; N stays at 50 and only
// shrinks when r leaves [0, 50] (very easy → SC, very hard → EC); EC = rest.
// K and M are fitted on the captured server attempts and rounded inside their
// 95 % interval; this is a measured reconstruction, not Ankama's source code.
// Natural lines keep the devblog cap (66, 43 near the max, lower on complex items).
export const WEIGHT_LAW = { K: CALIBRATION.adopted.K, M: CALIBRATION.adopted.M };

export const lawScore = stake => WEIGHT_LAW.K / stake - WEIGHT_LAW.M;

export function stakeWeight(item, state, reagent) {
  const bounds = naturalBounds(item);
  const current = state.stats[reagent.stat] || 0;
  const natural = bounds[reagent.stat] && current + reagent.power <= Math.max(0, bounds[reagent.stat].max);
  return round((natural ? reagent.power : current + reagent.power) * FM_STATS[reagent.stat].weight);
}

export function forgeChances(item, state, reagent, { guaranteedSuccess = false } = {}) {
  const reason = forgeCheck(item, state, reagent);
  if (reason) return { allowed: false, reason, SC: 0, SN: 0, EC: 1, estimated: true, model: FORGE_MODEL };
  // Optional sandbox mode: legality is still checked before forcing the result.
  if (guaranteedSuccess) return { allowed: true, SC: 1, SN: 0, EC: 0, estimated: false,
    guaranteedSuccess: true, mode: 'guaranteed', model: FORGE_MODEL };
  if (reagent.type === 26) {
    const k = { 1: 100, 25: 175, 50: 350 }[reagent.level];
    const SC = clamp(Math.floor(10000 / (k + item.level)), 5, 95) / 100;
    return { allowed: true, SC, SN: 0, EC: 1 - SC, estimated: true, mode: 'potion', model: FORGE_MODEL };
  }
  const { stat, power } = reagent;
  const bounds = naturalBounds(item);
  const current = state.stats[stat] || 0;
  const max = Math.max(0, bounds[stat]?.max || 0);
  const mode = bounds[stat] && current + power <= max ? 'normal' : max > 0 ? 'over' : 'exo';
  const totalMax = Object.entries(bounds).reduce((n, [s, b]) => n + Math.max(0, b.max) * FM_STATS[s].weight, 0);
  const complexity = clamp(.35 * item.level / 200 + .35 * Object.keys(bounds).length / 10 + .3 * totalMax / 600, 0, 1);
  const others = Object.entries(bounds).filter(([s]) => s !== stat);
  const otherMax = others.reduce((n, [s, b]) => n + Math.max(0, b.max) * FM_STATS[s].weight, 0);
  const otherValue = others.reduce((n, [s, b]) => n + clamp(state.stats[s] || 0, 0, Math.max(0, b.max)) * FM_STATS[s].weight, 0);
  const quality = otherMax ? clamp((otherValue / otherMax - .5) * 2, 0, 1) : 0;
  const extra = extraWeight(item, state.stats);
  // Small runes become progressively unsuitable above ~20 times their gain.
  const sizePenalty = Math.exp(-Math.max(0, current / (power * 20) - 1));
  let cap = .66;
  if (mode === 'normal') {
    const nearMax = bounds[stat].min !== bounds[stat].max && current + power > .8 * max;
    cap = nearMax ? .43 - .28 * complexity : .66 - .30 * complexity * quality;
    cap = clamp(cap * Math.exp(-extra / 50) * sizePenalty, .01, .66);
  }
  const stake = stakeWeight(item, state, reagent);
  const score = Math.min(100 * cap, lawScore(stake));
  let SC = clamp(score, 1, 66);
  let SN = clamp(Math.min(50, score + 50, 100 - SC), 0, 50);
  // Nothing can pay a neutral result: the server reports it as a failure without effect.
  const canPay = state.puits > 0 || Object.entries(state.stats).some(([s, n]) => n > Math.min(0, bounds[s]?.min || 0));
  if (!canPay) SN = 0;
  SC = round(SC / 100);
  SN = round(SN / 100);
  return { allowed: true, SC, SN, EC: round(Math.max(0, 1 - SC - SN)), estimated: true, mode, model: FORGE_MODEL,
    factors: { stake, score: round(score), cap: round(cap), complexity: round(complexity), quality: round(quality), extraWeight: round(extra), sizePenalty: round(sizePenalty) } };
}

export function statDeltas(before, after) {
  return Object.fromEntries([...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter(s => (after[s] || 0) !== (before[s] || 0)).map(s => [s, (after[s] || 0) - (before[s] || 0)]));
}

// Published guides put other overs/exos before the reservoir, and the target's
// own over/exo after it. Exact selection/spare probabilities are not published.
// This 80% pressure is an explicit SIMULATION PARAMETER, not an Ankama constant
// or a fit to the mixed captures. It removes most of a heavy non-natural point's
// protection while still allowing it to survive. Natural points keep v2's ratio.
const EXTRA_LOSS_PRESSURE = .8;

function payLoss(item, stats, cost, puits, rng, target) {
  const bounds = naturalBounds(item);
  const lost = {};
  const spared = new Set();
  const checks = [];
  const steps = [];
  let removed = 0;
  let fromPuits = 0;
  const floor = stat => Math.min(0, bounds[stat]?.min || 0);
  const kind = stat => stats[stat] > Math.max(0, bounds[stat]?.max || 0)
    ? (bounds[stat]?.max > 0 ? 'over' : 'exo') : 'natural';
  const remaining = () => units(cost - fromPuits) - removed;
  const funded = () => Math.ceil(removed / 20) + fromPuits >= cost;
  const take = (stat, phase, lineKind) => {
    const pointWeight = units(FM_STATS[stat].weight), debt = remaining();
    if (pointWeight > debt) {
      const naturalChance = debt / pointWeight;
      const chance = lineKind === 'natural' ? naturalChance
        : naturalChance + EXTRA_LOSS_PRESSURE * (1 - naturalChance);
      const roll = rng.next();
      checks.push({ stat, phase, kind: lineKind, remainingWeight: debt / 20, pointWeight: pointWeight / 20,
        naturalChance, chance, roll, spared: roll >= chance, estimated: true,
        ...(lineKind !== 'natural' ? { extraLossPressure: EXTRA_LOSS_PRESSURE } : {}) });
      // Never retry a spared line in another phase of this same attempt.
      if (roll >= chance) { spared.add(stat); return false; }
    }
    stats[stat] -= 1;
    lost[stat] = (lost[stat] || 0) + 1;
    removed += pointWeight;
    const last = steps.at(-1);
    if (last?.stat === stat && last.phase === phase && last.kind === lineKind) {
      last.points++; last.weight = round(last.weight + pointWeight / 20);
    } else steps.push({ stat, phase, kind: lineKind, points: 1, weight: pointWeight / 20 });
    return true;
  };
  const phase = (name, eligible, keepLine = false) => {
    if (funded()) return;
    while (remaining() > 0) {
      const candidates = Object.keys(stats).filter(s => !spared.has(s) && stats[s] > floor(s) && eligible(s));
      if (!candidates.length) break;
      const priorities = candidates.map(s => (s === target ? .35 : 1) / Math.sqrt(FM_STATS[s].weight));
      let pick = rng.next() * priorities.reduce((a, b) => a + b, 0);
      const stat = candidates[candidates.findIndex((_, i) => (pick -= priorities[i]) < 0)] || candidates[candidates.length - 1];
      const lineKind = kind(stat);
      // A selected over/exo line can pay the whole loss, including below its
      // natural maximum (documented worked over examples). This priority is
      // local to this attempt; its current status is reevaluated next time.
      do {
        if (!take(stat, name, lineKind)) break;
      } while (keepLine && remaining() > 0 && stats[stat] > floor(stat));
    }
  };
  phase('other-extra', s => s !== target && kind(s) !== 'natural', true);
  fromPuits = Math.min(puits, Math.max(0, cost - Math.ceil(removed / 20)));
  if (fromPuits) steps.push({ phase: 'puits', weight: fromPuits });
  phase('target-extra', s => s === target && kind(s) !== 'natural', true);
  phase('natural', () => true);
  // One rounding per loss event; individual stat points are not each rounded.
  return { fromPuits, loss: { lost, weight: Math.ceil(removed / 20), rawWeight: removed / 20, checks, steps } };
}

export function forgeAttempt(item, state, reagent, options) {
  const chances = forgeChances(item, state, reagent, options);
  if (!chances.allowed) throw new Error(chances.reason);
  const rng = createRng(state.rngState);
  const roll = rng.next();
  const outcome = roll < chances.SC ? 'SC' : roll < chances.SC + chances.SN ? 'SN' : 'EC';
  let stats = { ...state.stats };
  const beforePuits = state.puits;
  let puits = beforePuits;
  let weaponPotion = state.weaponPotion;
  let loss = { lost: {}, weight: 0, rawWeight: 0 };
  let cost = 0;
  let fromPuits = 0;
  let added = 0;
  let neutralized = false;
  if (reagent.type === 26) {
    if (outcome === 'SC') weaponPotion = reagent.id;
    else {
      // Historical emulator behavior, not measured in this player's rune session.
      for (const [stat, n] of Object.entries(stats)) if (n > 0) stats[stat] = Math.max(0, n - Math.max(1, Math.floor(n * .1)));
      loss.lost = Object.fromEntries(Object.entries(statDeltas(state.stats, stats)).map(([s, n]) => [s, -n]));
    }
  } else {
    cost = runeWeight(reagent);
    if (outcome !== 'SC') {
      // Assess losses against the existing item, not a provisional new bonus.
      ({ loss, fromPuits } = payLoss(item, stats, cost, puits, rng, reagent.stat));
      // A neutral result that its own line pays in full leaves no gain: the server
      // reports that case as a failure without loss (captured Gelano, Ra Vi 30 → 60).
      const selfPaid = outcome === 'SN' && (stats[reagent.stat] || 0) + reagent.power <= (state.stats[reagent.stat] || 0);
      if (outcome === 'SN' && (selfPaid || fromPuits + loss.weight < cost)) {
        // The devblog describes an unfunded neutral result as no change. Never
        // create a free gain or a reservoir from a bonus that was not applied.
        neutralized = true;
        stats = { ...state.stats };
        loss = { lost: {}, weight: 0, rawWeight: 0, checks: loss.checks, steps: [], cancelled: true };
        fromPuits = 0;
      } else puits = Math.max(0, puits + loss.weight - cost);
    }
    if (outcome !== 'EC' && !neutralized) { stats[reagent.stat] = (stats[reagent.stat] || 0) + reagent.power; added = reagent.power; }
  }
  const deltas = statDeltas(state.stats, stats);
  const entry = { attempt: state.attempts + 1, reagentId: reagent.id, reagent: reagent.name,
    outcome, roll, chances, added, cost, fromPuits, loss, ...(neutralized ? { neutralized } : {}),
    puitsBefore: beforePuits, puitsAfter: puits, deltas, before: { ...state.stats }, after: stats,
    ...(weaponPotion !== state.weaponPotion ? { weaponPotion } : {}) };
  const next = { ...state, model: FORGE_MODEL, stats, puits, ...(weaponPotion ? { weaponPotion } : {}),
    attempts: entry.attempt, rngState: rng.getState() >>> 0,
    consumption: { ...state.consumption, [reagent.id]: (state.consumption[reagent.id] || 0) + 1 },
    history: [...state.history, entry].slice(-100) };
  const error = validateForgedItem(item, next);
  if (error) throw new Error(error);
  return next;
}
