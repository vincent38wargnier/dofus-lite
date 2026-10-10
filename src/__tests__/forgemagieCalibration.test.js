import { ITEMS, emptyLoadout, rolledEffects } from '../engine/equipment';
import { RUNES, WEIGHT_LAW, lawScore, forgeChances, forgeAttempt } from '../engine/forgemagie';
import { createForgedItem, naturalBounds } from '../engine/forgedItems';
import CALIBRATION from '../engine/forgemagieCalibration.json';

// Rows come from scripts/fit_forgemagie.py: captured server attempts, with the
// item state before the rune and the puits re-estimated from visible losses.
const replay = row => {
  const item = ITEMS[row.template];
  const base = createForgedItem(item, rolledEffects(item, { ...emptyLoadout('IOP'), level: 200, slots: { ring1: item.id } }, 'ring1'), 7);
  const stats = { ...Object.fromEntries(Object.keys(naturalBounds(item)).map(s => [s, 0])), ...row.before };
  return { item, state: { ...base, stats, puits: row.puitsBefore }, reagent: RUNES.find(r => r.id === row.runeId) };
};
const split = score => {
  const SC = Math.min(66, Math.max(1, score));
  return { SC: SC / 100, SN: Math.max(0, Math.min(50, score + 50, 100 - SC)) / 100 };
};

test('the adopted weight law stays inside the 95 % interval fitted on the captures', () => {
  const { adopted, fit } = CALIBRATION;
  expect(WEIGHT_LAW).toEqual({ K: adopted.K, M: adopted.M });
  for (const k of ['K', 'M']) {
    expect(adopted[k]).toBeGreaterThanOrEqual(fit.ci95[k][0]);
    expect(adopted[k]).toBeLessThanOrEqual(fit.ci95[k][1]);
  }
  expect(CALIBRATION.attemptsUsable).toBe(CALIBRATION.rows.length);
});

test('the engine applies the calibrated law to every captured state', () => {
  for (const row of CALIBRATION.rows) {
    const { item, state, reagent } = replay(row);
    const chances = forgeChances(item, state, reagent);
    expect(chances.allowed).toBe(true);
    expect(chances.factors.stake).toBeCloseTo(row.stake, 6);
    if (row.mode === 'natural' && lawScore(row.stake) >= 15) continue; // devblog cap decides
    const expected = split(lawScore(row.stake));
    expect(chances.SC).toBeCloseTo(expected.SC, 6);
    const nothingCanPay = !row.puitsBefore && !Object.values(state.stats).some(n => n > 0);
    expect(chances.SN).toBeCloseTo(nothingCanPay ? 0 : expected.SN, 6);
  }
});

test('replaying the captured attempts through the engine fits far better than the previous model', () => {
  // Same replay at 400 seeds per row: previous model 91.05, this model 65.58.
  const seeds = 200;
  let nll = 0;
  for (const row of CALIBRATION.rows) {
    const { item, state, reagent } = replay(row);
    const freq = { 'S+': 0, 'S-': 0, F: 0 };
    for (let seed = 1; seed <= seeds; seed++) {
      const entry = forgeAttempt(item, { ...state, rngState: seed * 2654435761 >>> 0 }, reagent).history.at(-1);
      freq[entry.outcome === 'SC' ? 'S+' : entry.outcome === 'SN' && !entry.neutralized ? 'S-' : 'F']++;
    }
    const observed = row.tag === 'S+' || row.tag === 'S-' ? row.tag : 'F';
    nll -= Math.log((freq[observed] + .5) / (seeds + 1.5));
  }
  expect(nll).toBeLessThan(72);
});
