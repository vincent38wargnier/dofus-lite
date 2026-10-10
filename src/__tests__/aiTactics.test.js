import { createGame, applyAction, getView, currentFighter, validateAction } from '../engine/engine';
import { emptyLoadout } from '../engine/equipment';
import { createRng } from '../engine/rng';
import { makeBotApi } from '../bots/api';
import { utilityDecide } from '../bots/utilityBrain';
import { monsterDecide } from '../engine/monsters';
import { dist } from '../engine/geometry';

const hit = (amount, extra = {}) => ({ kind: 'damage', element: 'feu', min: amount, max: amount, zone: 'Pa', targetMask: 1, ...extra });
const spell = (key, pa, effects, extra = {}) => ({ id: 9000 + [...key].reduce((n, c) => n + c.charCodeAt(0), 0),
  key, name: key, grade: 1, pa, effects, critEffects: [], rangeMin: 1, rangeMax: 7, targetMode: 'enemy',
  needsLos: true, cooldown: 0, maxPerTurn: 0, maxPerTarget: 0, ...extra });
const book = spells => ({ ...emptyLoadout('IOP'), level: 200, base: {}, spells: { custom: spells } });
const setup = (spells, opponents = [spell('danger', 3, [hit(20)])]) => {
  const { state } = createGame({ mapId: 'arene', seed: 42, fighters: [
    { id: 'A', team: 'A', classId: 'IOP', loadout: book(spells) },
    { id: 'B', team: 'B', classId: 'IOP', loadout: book(opponents) },
    { id: 'S', team: 'B', monsterId: 52, monsterGrade: 1 },
  ] });
  state.currentIndex = state.order.indexOf('A'); state.board.obstacles = {};
  for (const f of Object.values(state.fighters)) {
    f.stats = {}; f.effects = []; f.permanent = {}; f.weaponSpell = null;
    f.resistances = {}; f.resistancesFixed = {}; f.hp = f.maxHp = f.baseMaxHp = 500;
    f.pa = f.basePa = 6; f.pm = f.basePm = 0;
  }
  state.fighters.A.pos = { x: 3, y: 3 }; state.fighters.B.pos = { x: 6, y: 3 };
  Object.assign(state.fighters.S, { pos: { x: 4, y: 4 }, ownerId: 'B', isSummon: true, leader: false, hp: 10, maxHp: 10, basePa: 0, pa: 0 });
  return state;
};
const decide = (state, weights, rng = createRng(1)) => {
  const view = getView(state, currentFighter(state).id);
  const before = JSON.stringify(state), publicBefore = JSON.stringify(view);
  const action = utilityDecide(view, makeBotApi(view, rng), weights);
  expect(JSON.stringify(state)).toBe(before); expect(JSON.stringify(view)).toBe(publicBefore);
  return action;
};
const execute = state => {
  const action = decide(state), result = applyAction(state, action);
  expect(result.ok).toBe(true); return { action, ...result };
};

test('prefers the summoner to a fragile disposable summon; killing its owner removes both', () => {
  const state = setup([spell('strike', 3, [hit(60)])]);
  expect(decide(state).target).toEqual(state.fighters.B.pos);
  state.fighters.B.hp = 50;
  const result = execute(state);
  expect(result.state.fighters.B.hp).toBe(0); expect(result.state.fighters.S.hp).toBe(0);
  expect(result.state.winner).toBe('A');
});

test('can remove a summon blocking the only reachable attack', () => {
  const state = setup([spell('contact', 3, [hit(60)], { rangeMax: 1 })]);
  state.fighters.S.pos = { x: 4, y: 3 };
  const result = execute(state);
  expect(result.action.target).toEqual(state.fighters.S.pos); expect(result.state.fighters.S.hp).toBe(0);
});

test('prioritizes the more dangerous original opponent, independently of roster order', () => {
  const state = setup([spell('strike', 3, [hit(50)])], [spell('weak', 3, [hit(1)])]);
  Object.assign(state.fighters.S, { isSummon: false, leader: true, ownerId: null, isMonster: false, classId: 'IOP',
    hp: 500, maxHp: 500, basePa: 6, pa: 6, loadout: book([spell('danger', 3, [hit(100)])]) });
  expect(decide(state).target).toEqual(state.fighters.S.pos);
});

test('aims an area spell at an empty cell to hit both enemies without hurting allies', () => {
  const state = setup([spell('explosion', 3, [hit(60, { zone: 'Cb', targetMask: 0 })], { targetMode: 'cell' })]);
  state.fighters.B.pos = { x: 6, y: 3 }; state.fighters.S.pos = { x: 6, y: 5 };
  Object.assign(state.fighters.S, { hp: 500, maxHp: 500, isSummon: false, ownerId: null });
  const result = execute(state);
  expect(result.action.target).toEqual({ x: 6, y: 4 });
  expect(result.state.fighters.B.hp).toBeLessThan(500); expect(result.state.fighters.S.hp).toBeLessThan(500);
  expect(result.state.fighters.A.hp).toBe(500);
});

test('chooses two 3 PA attacks instead of stranding PA after one expensive hit', () => {
  let state = setup([spell('expensive', 4, [hit(100)]), spell('efficient', 3, [hit(65)])]);
  state.fighters.S.hp = 0;
  let result = execute(state); expect(result.action.spell).toBe('efficient'); state = result.state;
  result = execute(state); expect(result.action.spell).toBe('efficient');
  expect(result.state.fighters.B.hp).toBe(370); expect(result.state.fighters.A.pa).toBe(0);
});

test('combination planning respects cooldowns and per-target limits', () => {
  for (const constraint of [{ cooldown: 3 }, { maxPerTarget: 1 }, { maxPerTurn: 1 }]) {
    const state = setup([spell('expensive', 4, [hit(100)]), spell('limited', 3, [hit(65)], constraint)]);
    state.fighters.S.hp = 0;
    expect(decide(state).spell).toBe('expensive');
  }
});

test('uses an immediate boost before attacks when that produces more damage this turn', () => {
  let state = setup([spell('attack', 2, [hit(20)]), spell('boost', 2,
    [{ kind: 'buffDamage', min: 40, max: 40, zone: 'Pa', targetMask: 32, duration: 3 }], { rangeMin: 0, rangeMax: 0, cooldown: 4 })]);
  state.fighters.S.hp = 0;
  const boosted = execute(state); expect(boosted.action.spell).toBe('boost');
  const result = execute(boosted.state); expect(result.action.spell).toBe('attack');
  expect(result.state.fighters.B.hp).toBe(440);
});

test('takes a certain killing hit immediately instead of setting up unnecessary boosts', () => {
  const state = setup([spell('attack', 3, [hit(60)]), spell('boost', 2,
    [{ kind: 'buffDamage', min: 8, max: 8, zone: 'Pa', targetMask: 32, duration: 3 }], { rangeMin: 0, rangeMax: 0 })]);
  state.fighters.B.hp = 40;
  expect(decide(state).spell).toBe('attack');
});

test('chooses the damage element after actual resistance and avoids reflected suicide', () => {
  const state = setup([spell('fire', 3, [hit(100)]), spell('water', 3, [hit(60, { element: 'eau' })])]);
  state.fighters.S.hp = 0; state.fighters.B.resistances.feu = 90;
  expect(decide(state).spell).toBe('water');
  state.fighters.B.effects = [{ kind: 'spellReflection', value: 6, chance: 100, turnsLeft: 2 }];
  state.fighters.A.hp = 20;
  expect(decide(state).type).toBe('PASS');
});

test('does not waste a contact hit on Dérobade when it can attack another opponent', () => {
  const state = setup([spell('strike', 3, [hit(60)])]);
  state.fighters.B.pos = { x: 4, y: 3 }; state.fighters.B.effects = [{ kind: 'dodgeMelee', turnsLeft: 2 }];
  Object.assign(state.fighters.S, { pos: { x: 3, y: 5 }, isSummon: false, ownerId: null });
  expect(decide(state).target).toEqual(state.fighters.S.pos);
});

test('retreats from real contact danger after spending its PA', () => {
  const state = setup([spell('strike', 3, [hit(60)])], [spell('contact', 3, [hit(100)], { rangeMax: 1 })]);
  state.fighters.S.hp = 0; state.fighters.A.pa = 0; state.fighters.A.pm = 3;
  state.fighters.A.hp = 60; state.fighters.B.pos = { x: 4, y: 3 };
  const action = decide(state);
  expect(action.type).toBe('MOVE'); expect(dist(action.to, state.fighters.B.pos)).toBeGreaterThan(1);
  expect(validateAction(state, action).ok).toBe(true);
});

test('walks around a wall even when the first step increases straight-line distance', () => {
  const state = setup([spell('contact', 3, [hit(60)], { rangeMax: 1 })]);
  state.fighters.S.hp = 0; state.fighters.A.pm = 1; state.fighters.A.pos = { x: 3, y: 3 };
  state.fighters.B.pos = { x: 5, y: 3 };
  for (let y = 1; y <= 5; y++) state.board.obstacles[`4,${y}`] = { x: 4, y, blocksMove: true, blocksLos: true };
  const action = decide(state);
  expect(action.type).toBe('MOVE'); expect(action.to.x).toBe(3); expect(action.to.y).not.toBe(3);
});

test('re-plans rejected actions without learning an invisible enemy position', () => {
  const state = setup([spell('strike', 3, [hit(60)])]);
  state.fighters.S.hp = 0; const rng = createRng(1);
  const first = decide(state, undefined, rng);
  const next = decide(state, undefined, rng);
  expect(next).not.toEqual(first);
  expect(decide(state, undefined, createRng(1))).toEqual(first);
});

test('the generic monster controller also prioritizes a reachable summoner', () => {
  const state = setup([spell('strike', 3, [hit(60)])]);
  Object.assign(state.fighters.A, { isMonster: true, monsterId: 147, monsterGrade: 1, pa: 8, basePa: 8 });
  state.fighters.B.pos = { x: 4, y: 3 }; state.fighters.S.pos = { x: 3, y: 4 };
  const view = getView(state, 'A'), action = monsterDecide(view, makeBotApi(view, createRng(1)), utilityDecide);
  expect(action.type).toBe('CAST');
  const result = applyAction(state, action); expect(result.ok).toBe(true);
  // Buffs may precede attacks; after consuming those the real boss must attack the owner.
  let s = result.state;
  for (let i = 0; i < 8 && s.fighters.B.hp === 500 && currentFighter(s).id === 'A'; i++) {
    const v = getView(s, 'A'), a = monsterDecide(v, makeBotApi(v, createRng(1)), utilityDecide);
    const r = applyAction(s, a); expect(r.ok).toBe(true); s = r.state;
  }
  expect(s.fighters.B.hp).toBeLessThan(500); expect(s.fighters.S.hp).toBe(10);
});

test('uses a required state to unlock a stronger attack in a custom spellbook', () => {
  const state = setup([spell('stance', 1, [{ kind: 'state', p3: 1, zone: 'Pa', targetMask: 32, duration: 3 }],
    { rangeMin: 0, rangeMax: 0 }), spell('attack', 3, [hit(100)], { requiredStates: [1] })]);
  state.fighters.S.hp = 0;
  const result = execute(state); expect(result.action.spell).toBe('stance');
  expect(execute(result.state).action.spell).toBe('attack');
});

test('uses instant kills and values self damage as a cost', () => {
  const state = setup([spell('kill', 3, [{ kind: 'kill', zone: 'Pa', targetMask: 1 }]),
    spell('suicide', 1, [hit(100), { kind: 'selfDamage', min: 500, max: 500, zone: 'Pa', targetMask: 32 }])]);
  expect(decide(state).spell).toBe('kill');
  const result = execute(state); expect(result.state.winner).toBe('A');
});

test('does not spend PA armoring or giving vitality to an enemy', () => {
  const state = setup([spell('armor', 2, [{ kind: 'armor', min: 500, max: 500, zone: 'Pa', duration: 4 }]),
    spell('vitality', 2, [{ kind: 'buffVitality', min: 500, max: 500, zone: 'Pa', duration: 4 }]), spell('attack', 3, [hit(40)])]);
  state.fighters.S.hp = 0; expect(decide(state).spell).toBe('attack');
});

test('forecasts per-target limits independently when the same spell changes targets', () => {
  const state = setup([spell('limited', 3, [hit(60)], { maxPerTarget: 1 })]);
  state.fighters.B.hp = 50;
  Object.assign(state.fighters.S, { hp: 80, maxHp: 80, isSummon: false, ownerId: null, leader: true });
  const first = execute(state); expect(first.state.fighters.B.hp).toBe(0);
  const next = execute(first.state); expect(next.action.target).toEqual(state.fighters.S.pos);
  expect(next.state.fighters.S.hp).toBe(20);
});

test('a sacrificial summon can trade its own life for useful damage', () => {
  const state = setup([spell('explosion', 3, [hit(150), { kind: 'selfDamage', min: 10000, max: 10000, zone: 'Pa', targetMask: 32 }])]);
  // A temporary actor with a custom kit remains an original actor for spell
  // resolution; its public view marks it as a disposable summon for valuation.
  const view = getView(state, 'A'); view.you.isSummon = true; view.you.hp = view.you.maxHp = 50;
  const api = makeBotApi(getView(state, 'A'), createRng(1));
  expect(utilityDecide(view, api).spell).toBe('explosion');
});

test('does not cast an indiscriminate poison when it only hurts its own team', () => {
  const state = setup([spell('poison', 2, [{ kind: 'poison', min: 30, max: 30, element: 'feu', zone: 'Cb', targetMask: 0, duration: 4 }],
    { targetMode: 'self', rangeMin: 0, rangeMax: 0 })]);
  state.fighters.S.hp = 0;
  expect(decide(state).type).toBe('PASS');
});

test('a real summon with no attacks moves into contact to block instead of hiding', () => {
  const state = setup([spell('strike', 3, [hit(60)])], [spell('danger', 3, [hit(200)])]);
  state.fighters.S.hp = 0;
  Object.assign(state.fighters.A, { isSummon: true, monsterId: 115, summonGrade: 5, pa: 0, basePa: 0, pm: 3, basePm: 3, hp: 160, maxHp: 160 });
  const action = decide(state); expect(action.type).toBe('MOVE');
  expect(dist(action.to, state.fighters.B.pos)).toBe(1);
  expect(applyAction(state, action).ok).toBe(true);
});

test('an aggressive lookahead does not spend PM for the same attack with no positional benefit', () => {
  const state = setup([spell('strike', 3, [hit(60)])]);
  state.fighters.S.hp = 0; state.fighters.A.pm = 3;
  expect(decide(state, { lookahead: 1.4, rangeBand: 0, aggression: 0, threat: 0, losHide: 0 }).type).toBe('CAST');
});
