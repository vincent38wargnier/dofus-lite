import { ITEMS, emptyLoadout, rolledEffects, resolveLoadout, equipSet } from '../engine/equipment';
import { RUNES, POTIONS, runeWeight, forgeChances, forgeAttempt, statDeltas } from '../engine/forgemagie';
import { createForgedItem, forgeRestriction, validateForgedItem, FM_STATS, FORGE_MODEL, naturalBounds, statLimit, replaceEquipment } from '../engine/forgedItems';
import { libraryReducer, emptyLibrary, isLoadout, sameLoadout } from '../ui/loadoutStore';
import OBSERVATIONS from '../engine/forgemagieObservations.json';
import { createGame } from '../engine/engine';

const rune = id => RUNES.find(r => r.id === id);
const potion = id => POTIONS.find(p => p.id === id);
const coco = ITEMS[9128];
const draft = () => ({ ...emptyLoadout('IOP'), level: 200, slots: { ring1: 9128 } });
const initial = (item = coco) => createForgedItem(item, rolledEffects(item, draft(), 'ring1'), 123);
const findResult = (item, state, reagent, outcome, predicate = () => true) => {
  for (let seed = 0; seed < 20000; seed++) {
    const next = forgeAttempt(item, { ...state, rngState: seed }, reagent);
    if (next.history.at(-1).outcome === outcome && predicate(next)) return next;
  }
  throw new Error(`Could not produce ${outcome}`);
};

test('52 mapped runes keep client powers; fractional weights round once per rune', () => {
  expect(RUNES.filter(r => r.supported)).toHaveLength(52);
  expect([1523, 1548, 1554].map(id => runeWeight(rune(id)))).toEqual([1, 3, 8]);
  expect([1557, 1558, 7438, 7433, 7434, 7435, 7437].map(id => runeWeight(rune(id)))).toEqual([100, 90, 51, 30, 20, 20, 30]);
  expect([7443, 7444, 7445].map(id => runeWeight(rune(id)))).toEqual([3, 8, 25]);
  expect([7452, 7457, 10613].map(id => runeWeight(rune(id)))).toEqual([5, 4, 45]);
});

test('client exclusions and category restrictions apply to class sets, Dofus and pets', () => {
  expect(forgeRestriction(coco)).toBe('');
  expect(forgeRestriction(ITEMS[6980])).toBeTruthy();
  expect(forgeRestriction(ITEMS[8628])).toBeTruthy();
  expect(forgeChances(coco, initial(), rune(12988)).allowed).toBe(false);
});

test('natural restoration and 101 caps distinguish a Gelano AP from an exotic AP', () => {
  const gelano = ITEMS[2469], state = initial(gelano);
  expect(forgeChances(gelano, state, rune(1557)).allowed).toBe(false);
  const empty = { ...state, stats: { pa: 0 } };
  expect(forgeChances(gelano, empty, rune(1557)).mode).toBe('normal');
  const pm = forgeChances(gelano, state, rune(1558));
  expect(pm).toMatchObject({ SC: .01, SN: 0, EC: .99, mode: 'exo' });
  expect(forgeChances(gelano, { ...state, puits: 200 }, rune(1558)).SC).toBe(.01);
  expect(statLimit(coco, 'sagesse', initial().stats)).toBe(33);
  expect(statLimit(coco, 'vitalite', initial().stats)).toBe(404);
  const high = { ...coco, effects: [[174, 1000, 1500, '']] };
  expect(statLimit(high, 'initiative', { initiative: 1500 })).toBe(1500);
  expect(forgeChances(coco, { ...initial(), stats: { ...initial().stats, pa: 1 } }, rune(1558)).allowed).toBe(false);
});

test('SC adds the whole rune and never consumes the reservoir or other stats', () => {
  const state = { ...initial(), stats: { ...initial().stats, sagesse: 10 }, puits: 20 };
  const next = findResult(coco, state, rune(1521), 'SC');
  expect(next.puits).toBe(20);
  expect(statDeltas(state.stats, next.stats)).toEqual({ sagesse: 1 });
  expect(state.attempts).toBe(0);
  expect(next.consumption[1521]).toBe(1);
});

test('guaranteed mode adds an exotic PM without losses or puits use for every sampled RNG seed', () => {
  const state = { ...initial(), puits: 20 };
  const options = { guaranteedSuccess: true };
  expect(forgeChances(coco, state, rune(1558), options)).toMatchObject({ allowed: true, SC: 1, SN: 0, EC: 0, estimated: false, guaranteedSuccess: true });
  for (const rngState of [0, 1, 123, 500, 9876, 0xffffffff]) {
    const next = forgeAttempt(coco, { ...state, rngState }, rune(1558), options);
    expect(statDeltas(state.stats, next.stats)).toEqual({ pm: 1 });
    expect(next.puits).toBe(20);
    expect(next.consumption[1558]).toBe(1);
    expect(next.rngState).not.toBe(rngState);
    expect(next.history.at(-1)).toMatchObject({ outcome: 'SC', loss: { weight: 0 }, fromPuits: 0, chances: { guaranteedSuccess: true } });
    expect(forgeChances(coco, next, rune(1558), options).allowed).toBe(false);
  }
  expect(state.attempts).toBe(0);
  expect(state.stats.pm).toBeUndefined();
});

test('guaranteed mode enforces native ceilings and the exact combined 101 boundary', () => {
  const options = { guaranteedSuccess: true };
  const kumokan = ITEMS[13170], state = initial(kumokan);
  expect(state.stats.crit).toBe(5);
  expect(forgeChances(kumokan, state, rune(7433), options).allowed).toBe(false);
  expect(() => forgeAttempt(kumokan, state, rune(7433), options)).toThrow(/101/);
  expect(forgeChances(kumokan, state, rune(1558), options).allowed).toBe(true);
  const withAP = { ...initial(), stats: { ...initial().stats, pa: 1 } };
  expect(forgeChances(coco, withAP, rune(1558), options).allowed).toBe(false);
  const at101 = forgeAttempt(coco, withAP, rune(1519), options);
  expect(at101.stats.force).toBe(1);
  expect(forgeChances(coco, at101, rune(1519), options).allowed).toBe(false);
  expect(() => forgeAttempt(coco, at101, rune(1519), options)).toThrow(/101/);
  expect(forgeChances(coco, initial(), rune(12988), options).allowed).toBe(false);
});

test('turning guaranteed mode off restores normal chances without changing saved jets', () => {
  const state = { ...initial(), stats: { ...initial().stats, sagesse: 12 } };
  const next = forgeAttempt(coco, state, rune(1521), { guaranteedSuccess: true });
  const snapshot = JSON.parse(JSON.stringify(next));
  expect(forgeChances(coco, next, rune(1521), { guaranteedSuccess: false })).toEqual(forgeChances(coco, next, rune(1521)));
  expect(forgeChances(coco, next, rune(1521)).SC).toBeLessThan(1);
  expect(next).toEqual(snapshot);
  expect(snapshot.history.at(-1).chances.guaranteedSuccess).toBe(true);
});

test('guaranteed weapon conversion keeps bonuses and still rejects a second conversion', () => {
  const item = ITEMS[200], state = { ...initial(item), puits: 12 };
  const options = { guaranteedSuccess: true };
  const next = forgeAttempt(item, state, potion(1345), options);
  expect(next.weaponPotion).toBe(1345);
  expect(next.stats).toEqual(state.stats);
  expect(next.puits).toBe(12);
  expect(next.history.at(-1).chances.guaranteedSuccess).toBe(true);
  expect(forgeChances(item, next, potion(1345), options).allowed).toBe(false);
});

test.each(['SN', 'EC'])('%s debits a reservoir first, preventing losses while sufficient', outcome => {
  const state = { ...initial(), stats: { ...initial().stats, sagesse: 12 }, puits: 20 };
  const next = findResult(coco, state, rune(1521), outcome);
  expect(next.puits).toBe(17);
  expect(next.history.at(-1).loss.weight).toBe(0);
  expect(statDeltas(state.stats, next.stats)).toEqual(outcome === 'SN' ? { sagesse: 1 } : {});
});

test('losing one damage to a failed Sa rune creates 20 - 3 = 17 puits', () => {
  const item = { ...coco, effects: [[112, 1, 3, '']] }, state = initial(item);
  const next = findResult(item, state, rune(1521), 'EC', n => n.stats.damage < state.stats.damage);
  expect(next.stats.damage).toBe(2);
  expect(next.puits).toBe(17);
  expect(next.history.at(-1).loss).toMatchObject({ lost: { damage: 1 }, weight: 20 });
});

test('a partially funded attempt only pays the remaining cost from characteristics', () => {
  const item = { ...coco, effects: [[112, 1, 3, '']] }, state = { ...initial(item), puits: 2 };
  const next = findResult(item, state, rune(1521), 'EC', n => n.stats.damage < state.stats.damage);
  expect(next.puits).toBe(19);
  expect(next.history.at(-1).fromPuits).toBe(2);
});

test.each(['pa', 'pm', 'range', 'crit', 'damage'])('a light rune can spare an isolated heavy %s line on any item', stat => {
  const item = { ...coco, id: 900000, effects: [[FM_STATS[stat].effect, 1, 1, '']] };
  const state = initial(item);
  const spared = findResult(item, state, rune(1519), 'EC', n => n.stats[stat] === 1);
  expect(spared.stats).toEqual(state.stats);
  expect(spared.puits).toBe(0);
  expect(spared.consumption[1519]).toBe(1);
  expect(spared.rngState).not.toBe(state.rngState);
  expect(spared.history.at(-1).loss.checks).toEqual([
    expect.objectContaining({ stat, spared: true, estimated: true, remainingWeight: 1 }),
  ]); // A spared line is not retried until it eventually falls.
  const dropped = findResult(item, state, rune(1519), 'EC', n => n.stats[stat] === 0);
  expect(dropped.puits).toBe(FM_STATS[stat].weight - 1);
  expect(dropped.history.at(-1).loss.checks[0].spared).toBe(false);
});

test('Gelano failures expose PA progressively more with Fo, Pa Fo, Ra Fo and Ga Pme', () => {
  const item = ITEMS[2469], state = initial(item);
  // Independent attempts on the same initial jet, not an evolving item.
  const rates = [1519, 1545, 1551, 1558].map(id => {
    let failed = 0, dropped = 0;
    for (let seed = 0; seed < 5000; seed++) {
      const next = forgeAttempt(item, { ...state, rngState: seed }, rune(id));
      if (next.history.at(-1).outcome !== 'EC') continue;
      failed++;
      if (next.stats.pa === 0) dropped++;
    }
    expect(dropped).toBeGreaterThan(0);
    expect(dropped).toBeLessThan(failed);
    return dropped / failed;
  });
  expect(rates[0]).toBeLessThan(.05);
  expect(rates[3]).toBeGreaterThan(.8);
  for (let i = 1; i < rates.length; i++) expect(rates[i]).toBeGreaterThan(rates[i - 1]);
});

test('a spared PA makes a neutral result inert, without a free bonus or fabricated puits', () => {
  const item = ITEMS[2469], state = initial(item);
  const next = findResult(item, state, rune(1519), 'SN', n => n.history.at(-1).neutralized);
  expect(next.stats).toEqual(state.stats);
  expect(next.puits).toBe(0);
  expect(next.consumption[1519]).toBe(1);
  expect(next.history.at(-1)).toMatchObject({ added: 0, fromPuits: 0, deltas: {},
    loss: { weight: 0, cancelled: true, checks: [expect.objectContaining({ stat: 'pa', spared: true })] } });
});

test('insufficient funding cancels a neutral result, including tentative losses and puits consumption', () => {
  const item = ITEMS[2469], state = { ...initial(item), stats: { pa: 0, force: 30 }, puits: 20 };
  const next = findResult(item, state, rune(1557), 'SN');
  expect(next.stats).toEqual(state.stats);
  expect(next.puits).toBe(20);
  expect(next.history.at(-1)).toMatchObject({ neutralized: true, added: 0, fromPuits: 0, deltas: {}, loss: { weight: 0 } });
});

test('remaining debt after puits can spare a heavy line without creating a negative reservoir', () => {
  const item = ITEMS[2469], state = { ...initial(item), puits: 9 };
  const next = findResult(item, state, rune(1551), 'EC', n => n.stats.pa === 1);
  expect(next.puits).toBe(0);
  expect(next.history.at(-1)).toMatchObject({ fromPuits: 9, loss: { weight: 0,
    checks: [expect.objectContaining({ remainingWeight: 1, pointWeight: 100, spared: true })] } });
});

test('a spared line does not prevent losses on another available characteristic', () => {
  const item = { ...coco, effects: [[111, 1, 1, ''], [118, 10, 10, '']] }, state = initial(item);
  const next = findResult(item, state, rune(1521), 'EC', n => n.history.at(-1).loss.checks.some(c => c.stat === 'pa' && c.spared));
  expect(next.stats).toEqual({ pa: 1, force: 7 });
  expect(next.puits).toBe(0);
});

test('Gelano can lose PA, use the resulting puits, then restore PA while keeping its extra stat', () => {
  const item = ITEMS[2469];
  const dropped = findResult(item, initial(item), rune(1521), 'EC', n => n.stats.pa === 0);
  expect(dropped.puits).toBe(97);
  const boosted = findResult(item, dropped, rune(1545), 'SN');
  expect(boosted.stats).toEqual({ pa: 0, force: 3 });
  expect(boosted.puits).toBe(94);
  const restored = findResult(item, boosted, rune(1557), 'SC');
  expect(restored.stats).toEqual({ pa: 1, force: 3 });
  expect(restored.puits).toBe(94);
  expect(validateForgedItem(item, restored)).toBe('');
});

test.each(['retro-reconstruction-v1', 'retro-reconstruction-v2'])('%s snapshots keep their jets and history; only new attempts use the revised model', model => {
  const item = ITEMS[2469];
  const old = findResult(item, initial(item), rune(1519), 'SC');
  old.model = model;
  old.history[0].chances.model = old.model;
  const loaded = JSON.parse(JSON.stringify(old));
  expect(validateForgedItem(item, loaded)).toBe('');
  const next = forgeAttempt(item, loaded, rune(1519));
  expect(next.model).toBe(FORGE_MODEL);
  expect(next.history[0]).toEqual(old.history[0]);
  expect(loaded).toEqual(old);
});

test('the receiving line can lose points too: a successful Ra Vi may give less than 30', () => {
  const next = findResult(coco, initial(), rune(1554), 'SN', n => n.stats.vitalite > 35 && n.stats.vitalite < 65);
  expect(next.history.at(-1).added).toBe(30);
  expect(next.history.at(-1).loss.lost.vitalite).toBeGreaterThan(0);
});

test('negative natural stats can be improved; losses never exceed the natural malus', () => {
  const item = { ...coco, effects: [[157, 10, 30, ''], [125, 10, 30, '']] };
  const state = initial(item);
  const next = findResult(item, state, rune(1519), 'SC');
  expect(next.stats.force).toBe(-9);
  let current = state;
  for (let n = 0; n < 500; n++) current = forgeAttempt(item, current, rune(1523));
  expect(current.stats.force).toBeGreaterThanOrEqual(-30);
});

test('chance model is normalized, explicit about estimates, and does not change with the RNG seed', () => {
  for (const r of RUNES.filter(r => r.supported)) {
    const chances = forgeChances(coco, initial(), r);
    expect(chances.SC + chances.SN + chances.EC).toBeCloseTo(1);
    expect(chances.SN).toBeLessThanOrEqual(.5);
    expect(chances.estimated).toBe(true);
    expect(forgeChances(coco, { ...initial(), rngState: 222 }, r)).toEqual(chances);
  }
  const low = { ...initial(), stats: { ...initial().stats, sagesse: 5 } };
  expect(forgeChances(coco, low, rune(1521)).SC).toBeGreaterThan(forgeChances(coco, initial(), rune(1521)).SC);
});

test.each([[127, 'pm', 1558], [2100, 'pa', 1557]])('legacy negative effect %s is improved rather than preserved beside a false exotic', (effect, stat, id) => {
  const item = Object.values(ITEMS).find(i => !forgeRestriction(i) && i.effects.some(([e]) => e === effect));
  const state = initial(item);
  expect(state.stats[stat]).toBeLessThan(0);
  expect(forgeChances(item, state, rune(id)).mode).toBe('normal');
  const next = findResult(item, state, rune(id), 'SC');
  expect(next.stats[stat]).toBe(state.stats[stat] + 1);
  expect(rolledEffects(item, { ...draft(), forgedItems: { boots: next } }, 'boots').some(e => e.row[0] === effect)).toBe(false);
});

test('attempts advance the RNG even on failure; serialized continuation is identical', () => {
  const first = findResult(coco, initial(), rune(1558), 'EC');
  const second = forgeAttempt(coco, first, rune(1558));
  expect(second.rngState).not.toBe(first.rngState);
  expect(second).toEqual(forgeAttempt(coco, JSON.parse(JSON.stringify(first)), rune(1558)));
  expect(second.attempts).toBe(2);
  expect(second.consumption[1558]).toBe(2);
});

test('history is bounded while total consumption and attempt count persist', () => {
  let state = initial();
  for (let i = 0; i < 125; i++) {
    // Reset an exotic if it happened to succeed, to keep testing valid attempts.
    state = forgeAttempt(coco, { ...state, stats: { ...state.stats, pm: 0 } }, rune(1558));
  }
  expect(state.history).toHaveLength(100);
  expect(state.attempts).toBe(125);
  expect(state.consumption[1558]).toBe(125);
});

test.each(OBSERVATIONS.attempts.filter(a => a.before_known).map((a, i) => [i + 2, a]))('captured transition %s remains intact when used as equipment', (_, attempt) => {
  const item = ITEMS[attempt.template];
  const stats = Object.fromEntries(Object.entries(FM_STATS).map(([s, d]) => [s, (attempt.after_stats[d.effect] || 0) - (attempt.after_stats[d.negativeEffect] || 0)]));
  const forged = { ...initial(item), stats };
  expect(validateForgedItem(item, forged)).toBe('');
  const result = resolveLoadout('IOP', { ...draft(), forgedItems: { ring1: forged } });
  expect(result.valid).toBe(true);
  for (const [s, n] of Object.entries(stats)) expect(result.bonuses[s] || 0).toBe(n);
  const before = Object.fromEntries(Object.entries(FM_STATS).map(([s, d]) => [s, attempt.before_stats[d.effect] || 0]));
  for (const [s, n] of Object.entries(statDeltas(before, stats))) expect(attempt.stat_deltas[FM_STATS[s].effect]).toBe(n);
});

test('forged jets survive roll-mode changes, library copies, reload and class combat resolution', () => {
  const fm = { ...initial(), stats: { ...initial().stats, sagesse: 12, pm: 1 } };
  const loadout = { ...draft(), forgedItems: { ring1: fm } };
  expect(isLoadout(loadout)).toBe(true);
  const library = libraryReducer(emptyLibrary(), { type: 'save', id: 'fm', classId: 'IOP', name: 'Test FM', loadout, now: 1 });
  const copy = JSON.parse(JSON.stringify(library)).builds[0].loadout;
  expect(sameLoadout(copy, loadout)).toBe(true);
  fm.stats.sagesse = 10;
  expect(copy.forgedItems.ring1.stats.sagesse).toBe(12);
  expect(resolveLoadout('IOP', { ...copy, rollMode: 'random', rollSeed: 200 }).bonuses.sagesse).toBe(12);
  const game = createGame({ seed: 'fm', mapId: 'arene', fighters: [
    { id: 'A', classId: 'IOP', loadout: copy }, { id: 'B', classId: 'CRA', loadout: emptyLoadout('CRA') }] });
  expect(game.state.fighters.A.basePm).toBe(4);
  expect(game.state.fighters.A.stats.sagesse).toBe(113);
  expect(game.state.fighters.A.loadout.forgedItems.ring1.stats.sagesse).toBe(12);
});

test('same-template rings have independent jets, and replacements never inherit stale FM', () => {
  const loadout = { ...draft(), slots: { ring1: 9128, ring2: 9128 }, forgedItems: { ring1: initial() } };
  expect(rolledEffects(coco, { ...loadout, rollMode: 'average' }, 'ring1').find(e => e.row[0] === 124).value).toBe(15);
  expect(rolledEffects(coco, { ...loadout, rollMode: 'average' }, 'ring2').find(e => e.row[0] === 124).value).toBe(13);
  expect(replaceEquipment(loadout, 'ring1', 2469).forgedItems.ring1).toBeUndefined();
  expect(equipSet(loadout, 1).forgedItems.ring1).toBeUndefined();
  expect(replaceEquipment(loadout, 'ring1', 9128).forgedItems.ring1).toEqual(loadout.forgedItems.ring1);
});

test('tampered jets, NaN, incompatible potions and modified base weapon rows are rejected', () => {
  expect(validateForgedItem(coco, { ...initial(), stats: { ...initial().stats, pa: 2 } })).toBeTruthy();
  expect(isLoadout({ ...draft(), forgedItems: { ring1: { ...initial(), puits: NaN } } })).toBe(false);
  expect(isLoadout({ ...draft(), forgedItems: { ring1: { ...initial(), history: [{}] } } })).toBe(false);
  const bad = { ...initial(), weaponPotion: 1345 };
  expect(validateForgedItem(coco, bad)).toBeTruthy();
  const edited = initial(); edited.baseEffects[0].row[1] = 9000;
  expect(resolveLoadout('IOP', { ...draft(), forgedItems: { ring1: edited } }).valid).toBe(false);
});

test('potions convert only neutral direct damage, persist in the weapon spell and cannot be applied twice', () => {
  const item = Object.values(ITEMS).find(i => !forgeRestriction(i) && i.weapon && i.effects.some(([id]) => id === 100) && i.effects.some(([id]) => id >= 91 && id <= 95));
  const state = initial(item);
  const next = findResult(item, state, potion(1345), 'SC');
  const loadout = { ...draft(), slots: { weapon: item.id }, forgedItems: { weapon: next } };
  const spell = resolveLoadout('IOP', loadout).weaponSpell;
  expect(spell.effects.find(e => e.kind === 'damage' && e.element === 'feu')).toBeTruthy();
  const leech = item.effects.find(([id]) => id >= 91 && id <= 95);
  expect(spell.effects.find(e => e.id === leech[0]).min).toBe(leech[1]);
  expect(forgeChances(item, next, potion(1347)).allowed).toBe(false);
});

test('observation dataset counts trials without declaring probabilities or critical success', () => {
  expect(OBSERVATIONS.attempts).toHaveLength(40);
  expect(OBSERVATIONS.attempts.filter(a => a.result === 'success')).toHaveLength(25);
  expect(OBSERVATIONS.probabilitiesVerified).toBe(false);
  expect(OBSERVATIONS.runeIdentitiesDecoded).toBe(false);
  expect(naturalBounds(coco).sagesse).toEqual({ min: 11, max: 15 });
});
