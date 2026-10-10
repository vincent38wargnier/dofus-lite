import { applyAction, createGame, currentFighter, getView, spellsOf, validateAction } from '../engine/engine';
import { SPELL_LIBRARY } from '../engine/classes';
import { emptyLoadout, ITEMS, weaponSpell } from '../engine/equipment';
import { damageAmount, effectiveStat, statBuffTotal } from '../engine/formulas';
import { makeBotApi } from '../bots/api';
import { createRng } from '../engine/rng';

function fight(classId) {
  const { state } = createGame({ seed: 7, fighters: [
    { id: 'A', classId, loadout: { ...emptyLoadout(classId), level: 200, base: {}, slots: {},
      spells: { common: [393], grades: Object.fromEntries(SPELL_LIBRARY.classes[classId].map(id => [id, 5])) } } },
    { id: 'B', classId: 'IOP' },
  ] });
  state.board = { width: 35, height: 35, obstacles: {} };
  state.order = ['A', 'B']; state.currentIndex = 0;
  state.fighters.A.pos = { x: 10, y: 10 }; state.fighters.B.pos = { x: 11, y: 10 };
  for (const f of Object.values(state.fighters)) {
    f.hp = f.maxHp = f.baseMaxHp = 5000; f.pa = 100;
    f.stats = { force: 100, intelligence: 100, chance: 100, agilite: 100, sagesse: 100 };
    f.effects = []; f.permanent = {}; f.resistances = {}; f.resistancesFixed = {};
  }
  // Four real elemental rows expose stat-specific as well as flat bonuses.
  state.fighters.A.weaponSpell = weaponSpell(ITEMS[9736]);
  return state;
}

const spell = (state, id) => Object.values(spellsOf(currentFighter(state))).find(s => s.id === id);
function cast(state, id, target = state.fighters.B.pos, accept = () => true) {
  const action = { type: 'CAST', spell: spell(state, id).key, target };
  expect(validateAction(state, action)).toMatchObject({ ok: true });
  for (let seed = 1; seed < 10000; seed++) {
    const result = applyAction({ ...state, rngState: seed }, action);
    if (result.events.some(e => e.t === 'spell_fail' || (e.t === 'cast' && e.crit)) || !accept(result)) continue;
    expect(result.state.turn).toBe(state.turn);
    expect(result.state.currentIndex).toBe(state.currentIndex);
    expect(result.events.some(e => e.t === 'turn_start' || e.t === 'turn_end')).toBe(false);
    return result;
  }
  throw new Error(`No matching cast of ${id}`);
}
const self = (state, id, accept) => cast(state, id, state.fighters.A.pos, accept);
const hits = result => result.events.filter(e => e.t === 'damage' && e.target === 'B');
const bonus = (result, stat, target = 'A') => result.events.filter(e => e.t === 'effect_add' && e.fighter === target && e.stat === stat)
  .reduce((sum, e) => sum + e.value, 0);

test.each([5, 6])('three Furies at grade %i immediately use +0, +8, +16, and leave +24 for the following spell', grade => {
  let state = fight('SACRIEUR');
  state.fighters.A.loadout.spells.grades[447] = grade;
  state.fighters.B.pos = { x: 13, y: 10 };
  const aim = { x: 12, y: 10 }; // Edge of the cross: 100%, no self-hit.
  const rolled = [], amounts = [];
  for (let n = 0; n < 3; n++) {
    const result = cast(state, 447, aim), hit = hits(result)[0];
    expect(hit.calculation.flatDamage).toBe(n * 8);
    expect(hit.calculation.raw).toBe(hit.calculation.jet * 2 + n * 8);
    expect(hit.amount).toBe(hit.calculation.raw);
    expect(statBuffTotal(result.state.fighters.A, 'damage')).toBe((n + 1) * 8);
    rolled.push(hit.calculation.jet); amounts.push(hit.amount);
    state = result.state;
  }
  expect(new Set(rolled).size).toBe(1); // Identical seeded jets isolate the bonus.
  expect(amounts[1] - amounts[0]).toBe(8);
  expect(amounts[2] - amounts[1]).toBe(8);
  const followUp = cast(state, 436);
  expect(hits(followUp)[0].calculation.flatDamage).toBe(24);
});

test.each([
  ['FECA', 16], ['ENUTROF', 42], ['ENUTROF', 52], ['SRAM', 62],
  ['XELOR', 99], ['ECAFLIP', 113], ['ECAFLIP', 106], ['ECAFLIP', 118],
  ['IOP', 144], ['IOP', 145], ['IOP', 147], ['IOP', 148], ['IOP', 149], ['IOP', 153],
  ['CRA', 166], ['CRA', 180],
])('%s boost %i changes the very next weapon attack, before any turn transition', (classId, id) => {
  const boosted = self(fight(classId), id), result = cast(boosted.state, 0);
  const statFor = { neutre: 'force', terre: 'force', feu: 'intelligence', eau: 'chance', air: 'agilite' };
  const rows = hits(result);
  expect(rows).toHaveLength(4);
  let increased = false;
  for (const row of rows) {
    const jet = row.calculation.jet;
    const characteristic = bonus(boosted, statFor[row.element]);
    const fixed = bonus(boosted, 'damage') + (['neutre', 'terre'].includes(row.element) ? bonus(boosted, 'physicalDamage') : 0);
    const expected = Math.floor(jet * (200 + characteristic + bonus(boosted, 'power')) / 100) + fixed;
    expect(row.calculation.raw).toBe(expected);
    expect(row.amount).toBe(expected);
    increased ||= expected > jet * 2;
  }
  expect(increased).toBe(true);
});

test('Zatoishwan immediately enables the drunk attack and its power and damage bonuses', () => {
  const state = fight('PANDAWA');
  expect(validateAction(state, { type: 'CAST', spell: spell(state, 687).key, target: state.fighters.B.pos }).ok).toBe(false);
  const boosted = self(state, 701), result = cast(boosted.state, 687);
  const hit = hits(result)[0];
  expect(hit.calculation.raw).toBe(Math.floor(hit.calculation.jet * 3.4) + 10);
  expect(hit.calculation.flatDamage).toBe(10);
});

test.each([['ECAFLIP', 104], ['SRAM', 75], ['CRA', 162]])('%s critical boost %i changes the next critical roll immediately', (classId, id) => {
  const before = fight(classId), boosted = self(before, id).state;
  const action = { type: 'CAST', spell: 'weapon', target: before.fighters.B.pos };
  let found = false;
  for (let seed = 1; seed < 2000 && !found; seed++) {
    const normal = applyAction({ ...before, rngState: seed }, action);
    const improved = applyAction({ ...boosted, rngState: seed }, action);
    const a = normal.events.find(e => e.t === 'cast'), b = improved.events.find(e => e.t === 'cast');
    if (a && b && !a.crit && b.crit) {
      expect(improved.state.turn).toBe(before.turn); found = true;
    }
  }
  expect(found).toBe(true);
});

test('Mot Stimulant makes its AP usable for another spell right away', () => {
  const state = fight('ENIRIPSA'); state.fighters.A.pa = 3;
  const boosted = self(state, 126, r => bonus(r, 'pa') === 2);
  expect(boosted.state.fighters.A.pa).toBe(3); // 3 - 2 cost + 2 bonus.
  const result = cast(boosted.state, 122);
  expect(hits(result)[0].amount).toBeGreaterThan(0);
  expect(result.state.fighters.A.pa).toBe(0);
});

test.each([['ENUTROF', 55], ['SRAM', 72]])('%s PM boost %i enables movement after all initial MP were spent', (classId, id) => {
  const state = fight(classId); state.fighters.A.pm = 0; state.fighters.B.pos = { x: 20, y: 20 };
  const boosted = self(state, id), view = getView(boosted.state, 'A'), api = makeBotApi(view, createRng(1));
  const target = { x: 10 + bonus(boosted, 'pm'), y: 10 };
  expect(api.canMove(target).ok).toBe(true);
  const moved = applyAction(boosted.state, { type: 'MOVE', to: target });
  expect(moved.ok).toBe(true); expect(moved.state.fighters.A.pm).toBe(0);
  expect(moved.state.turn).toBe(state.turn);
});

test.each([['CRA', 172, 161], ['ENIRIPSA', 137, 122]])('%s range boost %i immediately updates targeting and the next cast', (classId, id, attackId) => {
  const state = fight(classId), attack = spell(state, attackId);
  state.fighters.B.pos = { x: 10 + attack.range[1] + 1, y: 10 };
  expect(validateAction(state, { type: 'CAST', spell: attack.key, target: state.fighters.B.pos }).ok).toBe(false);
  const boosted = self(state, id), api = makeBotApi(getView(boosted.state, 'A'), createRng(1));
  expect(api.canCast(attack.key, state.fighters.B.pos).ok).toBe(true);
  expect(hits(cast(boosted.state, attackId))[0].amount).toBeGreaterThan(0);
});

test.each([['IOP', 155], ['ECAFLIP', 111]])('%s vitality boost %i raises current and maximum HP immediately', (classId, id) => {
  const state = fight(classId); state.fighters.A.hp = 2000;
  const boosted = self(state, id), added = bonus(boosted, 'vitalite');
  expect(added).toBeGreaterThan(0);
  expect(getView(boosted.state, 'A').you).toMatchObject({ hp: 2000 + added, maxHp: 5000 + added });
});

test.each([['SADIDA', 199, 193], ['OSAMODAS', 26, 34]])('%s summon boost %i permits another summon in the same turn', (classId, id, summonId) => {
  const state = fight(classId), a = state.fighters.A;
  a.maxSummons = 1;
  state.fighters.As1 = { ...a, id: 'As1', isSummon: true, ownerId: 'A', leader: false, pos: { x: 9, y: 9 } };
  a.summonCount = 1;
  const target = { x: 10, y: 11 };
  expect(validateAction(state, { type: 'CAST', spell: spell(state, summonId).key, target }).ok).toBe(false);
  const boosted = self(state, id), result = cast(boosted.state, summonId, target);
  expect(result.events.some(e => e.t === 'summon_add')).toBe(true);
});

test.each([[23, 'damage'], [29, 'power'], [22, 'pm'], [27, 'pa'], [32, 'vitalite']])('Osamodas boost %i immediately changes an allied summon’s %s', (id, stat) => {
  const state = fight('OSAMODAS'), a = state.fighters.A;
  state.fighters.C = { ...a, id: 'C', isSummon: true, ownerId: 'A', leader: false, effects: [], pos: { x: 10, y: 11 } };
  const result = cast(state, id, state.fighters.C.pos), c = result.state.fighters.C;
  const added = bonus(result, stat, 'C');
  expect(added).toBeGreaterThan(0);
  if (stat === 'damage' || stat === 'power') {
    expect(damageAmount(10, 'feu', c)).toBe(stat === 'damage' ? 20 + added : Math.floor(10 * (200 + added) / 100));
  } else if (stat === 'vitalite') expect([c.hp, c.maxHp]).toEqual([5000 + added, 5000 + added]);
  else expect(c[stat]).toBe(state.fighters.C[stat] + added);
  expect(getView(result.state, 'A').allies.find(f => f.id === 'C').effects.some(e => e.stat === stat)).toBe(true);
});

test('weapon mastery modifies the next matching hammer immediately', () => {
  const boosted = self(fight('IOP'), 393), mastery = boosted.state.fighters.A.effects.find(e => e.kind === 'weaponMastery');
  const result = cast(boosted.state, 0);
  expect(mastery.value).toBeGreaterThan(0);
  for (const hit of hits(result)) expect(hit.amount).toBe(Math.floor(hit.calculation.jet * 2 * (100 + mastery.value) / 100));
});

test('a Roulette healing bonus applies to the next weapon heal, without waiting a turn', () => {
  const state = fight('ECAFLIP'); state.fighters.B.hp = 1000;
  state.fighters.A.weaponSpell = weaponSpell(ITEMS[7156]);
  const boosted = self(state, 101, r => bonus(r, 'heal') === 50);
  const normalHit = cast(state, 0), boostedHit = cast(boosted.state, 0);
  const healed = r => r.events.find(e => e.t === 'heal' && e.target === 'B').amount;
  expect(healed(boostedHit) - healed(normalHit)).toBe(50);
});

test('a stolen characteristic is immediately available to the following attack', () => {
  const state = fight('SACRIEUR'), stolen = cast(state, 432);
  expect(effectiveStat(stolen.state.fighters.A, 'agilite')).toBe(115);
  const result = cast(stolen.state, 436), hit = hits(result)[0];
  expect(hit.calculation.raw).toBe(Math.floor(hit.calculation.jet * 2.15));
});

test('a resistance boost already protects against reflected hits during the caster’s turn', () => {
  const state = fight('FECA');
  state.fighters.B.effects.push({ kind: 'damageReflection', value: 10, turnsLeft: 3 });
  const normal = cast(state, 0), boosted = self(state, 7), protectedHit = cast(boosted.state, 0);
  const reflected = result => result.events.filter(e => e.t === 'damage' && e.target === 'A').map(e => e.amount);
  expect(reflected(normal)).toHaveLength(4);
  expect(reflected(protectedHit)).toEqual(reflected(normal).map(value => Math.floor(value * 0.62)));
});
