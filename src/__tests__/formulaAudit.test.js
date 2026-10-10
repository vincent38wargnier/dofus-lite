// French web audit: Ankama changelogs 1.25, 1.27, 1.28 and DofuX calculator
// outputs. URLs, input vectors and unverified details are documented in README.
import {
  damageAmount, healAmount, critDivisor, initiative, escapeChance, rollEscape,
  dodgeStat, pointRemovalScores, pointRemovalChance, rollPointRemoval, armorReduction,
} from '../engine/formulas';
import { createGame, applyAction, getView, COMBAT_RULES_VERSION } from '../engine/engine';
import { emptyLoadout, resolveLoadout } from '../engine/equipment';
import { makeBotApi } from '../bots/api';
import { createRng } from '../engine/rng';

const fighter = (stats = {}, permanent = {}) => ({ stats, permanent, effects: [] });

test.each([
  ['neutre', 49, 91], ['terre', 49, 91], ['feu', 39, 71],
  ['eau', 29, 51], ['air', 24, 41],
])('element %s matches historical calculator results, including +damage and %%damage', (element, min, max) => {
  const caster = fighter({ force: 300, intelligence: 200, chance: 100, agilite: 50 }, { damage: 7, power: 20 });
  expect(damageAmount(10, element, caster)).toBe(min);
  expect(damageAmount(20, element, caster)).toBe(max);
});

test('healing uses intelligence and +heals; power and +damage do not boost it', () => {
  const caster = fighter({ intelligence: 300 }, { heal: 7, power: 500, damage: 100 });
  expect(healAmount(10, caster)).toBe(47);
  expect(healAmount(20, caster)).toBe(87);
});

test.each([[3, 8], [4, 42], [5, 134], [6, 384]])('critical threshold 1/%s reaches 1/2 at %s agility', (base, agility) => {
  expect(critDivisor(base, agility - 1)).toBe(3);
  expect(critDivisor(base, agility)).toBe(2);
});

test('low or negative agility never worsens the rate after +CC; +CC applies first', () => {
  for (const agi of [-100, 0, 7]) expect(critDivisor(40, agi, 10)).toBe(30);
  expect(critDivisor(30, 150, 10)).toBe(11);
  expect(critDivisor(30, 150, 20)).toBe(5);
  expect(critDivisor(40, 0, 100)).toBe(2);
  expect(critDivisor(0, 100, 100)).toBe(0);
});

test('initiative ignores vitality and wisdom, includes equipment bonus and life ratio', () => {
  const stats = { force: 300, intelligence: 200, chance: 100, agilite: 50, sagesse: 400, vitalite: 900 };
  expect(initiative(stats, 1000, 1000, 150)).toBe(800);
  expect(initiative(stats, 500, 1000, 150)).toBe(400);
  expect(initiative({ ...stats, sagesse: 0, vitalite: 0 }, 100, 100, 150)).toBe(800);
  const loadout = { ...emptyLoadout('IOP'), slots: {}, base: { vitalite: 495 } };
  expect(resolveLoadout('IOP', loadout).initiative).toBe(404); // Four scrolled elements, vitality still contributes zero.
  const { state } = createGame({ fighters: [{ id: 'A', classId: 'IOP', loadout },
    { id: 'B', classId: 'IOP', loadout: { ...loadout, base: { force: 1 } } }] });
  expect(state.order[0]).toBe('B');
  expect(state.rulesVersion).toBe(COMBAT_RULES_VERSION);
});

test('tackle allows guaranteed success/failure and the official 8/10 PA examples', () => {
  expect(escapeChance(50, 0)).toBe(100);
  expect(escapeChance(0, 50)).toBe(0);
  expect(rollEscape({ int: () => 99 }, 50, 0, 8).escaped).toBe(true);
  expect(rollEscape({ int: () => 0 }, 0, 50, 8).escaped).toBe(false);
  expect(rollEscape({ int: () => 49 }, 60, 60, 8).escaped).toBe(true);
  expect(rollEscape({ int: () => 50 }, 60, 60, 8).lostPa).toBe(2);
  expect(rollEscape({ int: () => 50 }, 60, 60, 10).lostPa).toBe(2);
  const { state } = createGame({ fighters: [{ id: 'A', classId: 'IOP' }, { id: 'B', classId: 'IOP' }] });
  state.fighters.A.pos = { x: 5, y: 5 }; state.fighters.B.pos = { x: 6, y: 5 };
  state.fighters.A.pa = 8;
  const api = makeBotApi(getView(state, 'A'), createRng(1));
  expect(api.tackleInfo()).toMatchObject({ escapeChance: 50, paIfTackled: 6 });
});

test('wisdom converts at four points per dodge point; dodge bonuses only defend', () => {
  expect(dodgeStat(103)).toBe(25);
  const attacker = fighter({ sagesse: 200 }, { dodgePa: 1000, dodgePm: 500 });
  const target = fighter({ sagesse: 200 }, { dodgePa: 50, dodgePm: 25 });
  expect(pointRemovalScores(attacker, target, 'pa')).toEqual({ attack: 50, defense: 100 });
  expect(pointRemovalScores(attacker, target, 'pm')).toEqual({ attack: 50, defense: 75 });
  attacker.effects.push({ kind: 'buff', stat: 'dodgePa', value: 100 });
  expect(pointRemovalScores(attacker, target, 'pa').attack).toBe(50);
  attacker.effects.push({ kind: 'buff', stat: 'sagesse', value: 200 });
  expect(pointRemovalScores(attacker, target, 'pa').attack).toBe(100);
});

test('point removal respects 10/90 boundaries even at extreme wisdom', () => {
  expect(pointRemovalChance(50, 50, 8, 8)).toBe(50);
  expect(rollPointRemoval({ int: () => 89 }, 1000, 1, 8, 8, 1).removed).toBe(1);
  expect(rollPointRemoval({ int: () => 90 }, 1000, 1, 8, 8, 1).removed).toBe(0);
  expect(rollPointRemoval({ int: () => 9 }, 1, 1000, 8, 8, 1).removed).toBe(1);
  expect(rollPointRemoval({ int: () => 10 }, 1, 1000, 8, 8, 1).removed).toBe(0);
  expect(pointRemovalChance(0, 0, 8, 8)).toBe(50);
});

test('each successful removal makes the next roll harder and cannot remove missing points', () => {
  // Equal wisdom, 8 AP: first success at 50%; the next rolls only have 44%.
  expect(rollPointRemoval({ int: () => 49 }, 50, 50, 8, 8, 3)).toEqual({ removed: 1, dodged: 2 });
  expect(rollPointRemoval({ int: () => 0 }, 50, 50, 1, 8, 3)).toEqual({ removed: 1, dodged: 2 });
  const rng = { int: jest.fn() };
  expect(rollPointRemoval(rng, 50, 50, 0, 8, 3).removed).toBe(0);
  expect(rng.int).not.toHaveBeenCalled();
});

function combat(classId = 'IOP', seed = 1) {
  const { state } = createGame({ seed, fighters: [{ id: 'A', classId }, { id: 'B', classId: 'IOP' }] });
  state.order = ['A', 'B']; state.currentIndex = 0;
  state.fighters.A.pos = { x: 5, y: 5 }; state.fighters.B.pos = { x: 6, y: 5 };
  return state;
}

test('Xelor removal is identical with and without attacker dodge buffs in actual combat', () => {
  let attempts = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const base = combat('XELOR', seed); base.fighters.B.pos = { x: 8, y: 5 };
    const buffed = JSON.parse(JSON.stringify(base));
    buffed.fighters.A.effects.push({ kind: 'buff', stat: 'dodgePa', value: 1000, turnsLeft: 2 });
    const action = { type: 'CAST', spell: 'ralentissement', target: base.fighters.B.pos };
    const a = applyAction(base, action); const b = applyAction(buffed, action);
    expect(a.ok && b.ok).toBe(true);
    expect(b.events.filter(e => e.t === 'point_removal')).toEqual(a.events.filter(e => e.t === 'point_removal'));
    expect(b.state.rngState).toBe(a.state.rngState);
    attempts += a.events.filter(e => e.t === 'point_removal').length;
  }
  expect(attempts).toBeGreaterThan(0);
});

test('equipment reflection neither prevents incoming damage nor scales with wisdom', () => {
  const action = { type: 'CAST', spell: 'pression', target: { x: 6, y: 5 } };
  let hits = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const base = combat('IOP', seed);
    const reflect = combat('IOP', seed); reflect.fighters.B.permanent = { reflect: 5 };
    const wise = combat('IOP', seed); wise.fighters.B.permanent = { reflect: 5 }; wise.fighters.B.stats.sagesse = 1000;
    const results = [base, reflect, wise].map(s => applyAction(s, action));
    results.forEach(r => expect(r.ok).toBe(true));
    if (results[0].events.some(e => e.t === 'spell_fail')) continue;
    const incoming = results.map(r => r.events.find(e => e.t === 'damage' && e.target === 'B'));
    expect(incoming[0].amount).toBeGreaterThan(5);
    expect(incoming[1].amount).toBe(incoming[0].amount);
    expect(incoming[2].amount).toBe(incoming[0].amount);
    for (const r of results.slice(1)) {
      expect(r.events.filter(e => e.t === 'damage' && e.target === 'A').map(e => e.amount)).toEqual([5]);
    }
    hits++;
  }
  expect(hits).toBeGreaterThan(0);
});

test('armor uses the stronger of element stat and half intelligence plus half element', () => {
  const target = fighter({ intelligence: 0, chance: 0 });
  target.effects.push({ kind: 'armor', spellId: 18, source: 'A', value: 10 });
  expect(armorReduction(target, 'eau', { A: fighter({ intelligence: 100, chance: 300 }) })).toBe(40);
  expect(armorReduction(target, 'eau', { A: fighter({ intelligence: 300, chance: 100 }) })).toBe(30);
  expect(armorReduction(target, 'terre', { A: fighter({ intelligence: 300, chance: 100 }) })).toBe(0);
});
