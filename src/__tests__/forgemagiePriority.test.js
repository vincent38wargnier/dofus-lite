import { ITEMS, emptyLoadout, rolledEffects } from '../engine/equipment';
import { RUNES, FM_STATS, forgeAttempt, createForgedItem } from '../engine/forgemagie';

const rune = id => RUNES.find(r => r.id === id);
const template = effects => ({ ...ITEMS[9128], id: 900000, effects });
const initial = item => createForgedItem(item, rolledEffects(item, emptyLoadout('IOP'), 'ring1'), 123);
const findResult = (item, state, id, outcome, predicate = () => true) => {
  for (let seed = 0; seed < 20000; seed++) {
    const next = forgeAttempt(item, { ...state, rngState: seed }, rune(id));
    if (next.history.at(-1).outcome === outcome && predicate(next)) return next;
  }
  throw new Error(`Could not produce ${outcome}`);
};

test.each(['pa', 'pm', 'range'])('a weight-1 rune threatens an exotic %s far more than the identical natural point', stat => {
  const natural = template([[FM_STATS[stat].effect, 1, 1, '']]);
  const exotic = template([]);
  const rate = item => {
    const state = { ...initial(item), stats: { [stat]: 1 } };
    let failures = 0, losses = 0;
    for (let seed = 0; seed < 3000; seed++) {
      const next = forgeAttempt(item, { ...state, rngState: seed }, rune(1519));
      if (next.history.at(-1).outcome !== 'EC') continue;
      failures++;
      if (!next.stats[stat]) losses++;
    }
    return losses / failures;
  };
  const naturalRate = rate(natural), exoticRate = rate(exotic);
  expect(naturalRate).toBeLessThan(.05);
  expect(exoticRate).toBeGreaterThan(.7);
  expect(exoticRate).toBeLessThan(.9); // Fragile does not mean guaranteed to fall.
  expect(exoticRate).toBeGreaterThan(10 * naturalRate);
});

test.each(['SN', 'EC'])('an existing exotic PA pays before the puits on %s', outcome => {
  const item = template([[118, 1, 60, '']]);
  const state = { ...initial(item), stats: { force: 40, pa: 1 }, puits: 20 };
  const next = findResult(item, state, 1519, outcome, n => !n.stats.pa);
  expect(next.puits).toBe(119);
  expect(next.stats.force).toBe(outcome === 'SN' ? 41 : 40);
  expect(next.history.at(-1)).toMatchObject({ fromPuits: 0, loss: { weight: 100,
    steps: [{ stat: 'pa', kind: 'exo', phase: 'other-extra', points: 1, weight: 100 }],
    checks: [expect.objectContaining({ kind: 'exo', estimated: true, spared: false })] } });
});

test('a spared exotic is not retried after the reservoir pays the loss', () => {
  const item = template([[118, 1, 60, '']]);
  const state = { ...initial(item), stats: { force: 40, pa: 1 }, puits: 20 };
  const next = findResult(item, state, 1519, 'EC', n => n.stats.pa === 1);
  expect(next.stats).toEqual(state.stats);
  expect(next.puits).toBe(19);
  expect(next.history.at(-1)).toMatchObject({ fromPuits: 1, loss: { weight: 0,
    checks: [expect.objectContaining({ stat: 'pa', kind: 'exo', spared: true })], steps: [{ phase: 'puits', weight: 1 }] } });
});

test('a spared exotic is not retried in the later natural phase either', () => {
  const item = template([[118, 1, 60, '']]);
  const state = { ...initial(item), stats: { force: 40, pa: 1 } };
  const next = findResult(item, state, 1519, 'EC', n => n.stats.pa === 1);
  expect(next.stats).toEqual({ force: 39, pa: 1 });
  expect(next.history.at(-1).loss.checks).toHaveLength(1);
  expect(next.history.at(-1).loss.steps).toEqual([{ phase: 'natural', stat: 'force', kind: 'natural', points: 1, weight: 1 }]);
});

test.each(['SN', 'EC'])('working a different line takes from an over before the puits on %s', outcome => {
  const item = template([[118, 1, 60, ''], [125, 100, 200, '']]);
  const state = { ...initial(item), stats: { force: 65, vitalite: 150 }, puits: 20 };
  const next = findResult(item, state, 1523, outcome);
  expect(next.stats.force).toBe(64);
  expect(next.stats.vitalite).toBe(outcome === 'SN' ? 153 : 150);
  expect(next.puits).toBe(20);
  expect(next.history.at(-1).fromPuits).toBe(0);
  expect(next.history.at(-1).loss.steps[0]).toMatchObject({ phase: 'other-extra', kind: 'over' });
});

test.each(['SN', 'EC'])('continuing the same over uses the puits before that line on %s', outcome => {
  const item = template([[118, 1, 60, ''], [125, 100, 200, '']]);
  const state = { ...initial(item), stats: { force: 65, vitalite: 150 }, puits: 20 };
  const next = findResult(item, state, 1519, outcome);
  expect(next.stats.force).toBe(outcome === 'SN' ? 66 : 65);
  expect(next.stats.vitalite).toBe(150);
  expect(next.puits).toBe(19);
  expect(next.history.at(-1).loss).toMatchObject({ weight: 0, steps: [{ phase: 'puits', weight: 1 }] });
});

test('without puits, the receiving over pays before natural characteristics', () => {
  const item = template([[118, 1, 60, ''], [125, 100, 200, '']]);
  const state = { ...initial(item), stats: { force: 65, vitalite: 150 } };
  const next = findResult(item, state, 1519, 'EC');
  expect(next.stats).toEqual({ force: 64, vitalite: 150 });
  expect(next.history.at(-1).loss.steps[0]).toMatchObject({ phase: 'target-extra', kind: 'over' });
});

test('an over line pays the whole attempt, but loses its priority once natural again', () => {
  const item = template([[118, 1, 60, ''], [125, 100, 200, '']]);
  const state = { ...initial(item), stats: { force: 65, vitalite: 150 }, puits: 20 };
  const first = findResult(item, state, 1554, 'EC');
  expect(first.stats).toEqual({ force: 57, vitalite: 150 });
  expect(first.puits).toBe(20);
  expect(first.history.at(-1).loss.steps[0]).toMatchObject({ phase: 'other-extra', points: 8, weight: 8 });
  const second = findResult(item, first, 1554, 'EC');
  expect(second.stats).toEqual(first.stats);
  expect(second.puits).toBe(12);
  expect(second.history.at(-1).loss.weight).toBe(0);
});

test('fractional losses across extra and natural phases are rounded once as a whole', () => {
  const item = template([[118, 1, 60, '']]);
  const state = { ...initial(item), stats: { force: 40, vitalite: 1 }, puits: 5 };
  const raIne = RUNES.find(r => r.stat === 'intelligence' && r.power === 10);
  const next = findResult(item, state, raIne.id, 'EC');
  expect(next.stats).toEqual({ force: 35, vitalite: 0 });
  expect(next.puits).toBe(1);
  expect(next.history.at(-1)).toMatchObject({ fromPuits: 5, loss: { rawWeight: 5.25, weight: 6,
    steps: [{ stat: 'vitalite', kind: 'exo', phase: 'other-extra', points: 1, weight: .25 },
      { phase: 'puits', weight: 5 }, { stat: 'force', kind: 'natural', phase: 'natural', points: 5, weight: 5 }] } });
});

test('a critical success leaves all overs, exotics and puits intact', () => {
  const item = template([[118, 1, 3, '']]);
  const state = { ...initial(item), stats: { force: 5, pm: 1 }, puits: 20 };
  for (const options of [undefined, { guaranteedSuccess: true }]) {
    const next = options ? forgeAttempt(item, state, rune(1519), options) : findResult(item, state, 1519, 'SC');
    expect(next.stats).toEqual({ force: 6, pm: 1 });
    expect(next.puits).toBe(20);
    expect(next.history.at(-1)).toMatchObject({ fromPuits: 0, loss: { weight: 0 } });
  }
});
