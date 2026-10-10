import { CLASS_IDS, CLASSES, SPELL_LIBRARY, resolveSpellLoadout, defaultSpellGrade } from '../engine/classes';
import { CHARACTERISTICS, emptyLoadout, equipSet, resolveLoadout, pointCost } from '../engine/equipment';
import { createGame, spellsOf } from '../engine/engine';
import { damageAmount, healAmount, dodgeStat } from '../engine/formulas';
import { loadoutAtLevel } from '../ui/playerSetupState';

test.each(CLASS_IDS)('%s has 101 free in every stat, even with zero level capital', classId => {
  const loadout = { ...emptyLoadout(classId), level: 1, base: {} };
  const result = resolveLoadout(classId, loadout);
  expect(result.valid).toBe(true);
  expect(result.points).toBe(0); expect(result.characteristicPoints).toBe(0);
  expect(result.stats).toEqual(Object.fromEntries(CHARACTERISTICS.map(s => [s, 101])));
  expect(result.hp).toBe(156); expect(result.initiative).toBe(404);
  expect(resolveLoadout(classId, emptyLoadout(classId)).valid).toBe(true);
  expect(resolveLoadout(classId, emptyLoadout(classId)).points).toBe(495);
  expect(Object.values(CLASSES[classId].stats).every(n => n >= 101)).toBe(true);
});

test('purchased points begin at the scrolled stat, including exact crossed tiers and Sacrieur vitality', () => {
  expect(pointCost('IOP', 'force', 1)).toBe(2); // 101 -> 102.
  expect(pointCost('IOP', 'force', 99)).toBe(198); // 101 -> 200.
  expect(pointCost('IOP', 'force', 100)).toBe(201); // 200 -> 201 costs three.
  expect(pointCost('IOP', 'intelligence', 1)).toBe(5);
  expect(pointCost('SACRIEUR', 'vitalite', 2)).toBe(1);
  const sac = resolveLoadout('SACRIEUR', { ...emptyLoadout('SACRIEUR'), base: { vitalite: 2 } });
  expect(sac.baseStats.vitalite).toBe(103); expect(sac.points).toBe(1);
});

test('parchments, investments and gear add exactly once in both combatants and affect formulas', () => {
  const plain = { ...emptyLoadout('IOP'), level: 200, base: {}, spells: { common: [350] } };
  const geared = { ...equipSet(plain, 1), base: { force: 99, sagesse: 50 } };
  const { state } = createGame({ fighters: [{ id: 'A', classId: 'IOP', loadout: geared }, { id: 'B', classId: 'IOP', loadout: plain }] });
  expect(state.fighters.A.stats.force).toBe(300); // 101 scrolled + 99 purchased + 100 from Bouftou.
  expect(state.fighters.A.stats.sagesse).toBe(171);
  expect(state.fighters.B.stats).toEqual(Object.fromEntries(CHARACTERISTICS.map(s => [s, 101])));
  expect(damageAmount(10, 'feu', state.fighters.B)).toBe(20);
  expect(healAmount(10, state.fighters.B)).toBe(20);
  expect(dodgeStat(state.fighters.B.stats.sagesse)).toBe(25);
  expect(state.fighters.B.maxHp).toBe(1151);
  expect(Object.values(spellsOf(state.fighters.B)).every(s => s.grade === 6)).toBe(true);
  const stored = JSON.parse(JSON.stringify(geared));
  expect(resolveLoadout('IOP', stored).stats).toEqual(state.fighters.A.stats);
  expect(stored.base).toEqual({ force: 99, sagesse: 50 });
});

test('existing allocations remain intact and are validated with the new thresholds', () => {
  const old = { ...emptyLoadout('IOP'), base: { force: 265 }, level: 100 };
  const before = JSON.stringify(old);
  const result = resolveLoadout('IOP', old);
  expect(result.stats.force).toBe(366);
  expect(result.points).toBe(762);
  expect(result.valid).toBe(false);
  expect(JSON.stringify(old)).toBe(before);
});

test.each([1, 100, 150, 199, 200])('all available class and selected common spells default to the preset at level %i', level => {
  for (const classId of CLASS_IDS) {
    const result = resolveSpellLoadout(classId, { level, spells: { common: SPELL_LIBRARY.common } });
    expect(result.valid).toBe(true);
    expect(Object.values(result.spells).every(s => s.grade === (level === 200 || (level >= 100 && SPELL_LIBRARY.common.includes(s.id)) ? 6 : 5))).toBe(true);
    expect(Object.values(result.spells).every(s => s.requiredLevel <= level)).toBe(true);
  }
  expect(defaultSpellGrade(159, 99)).toBeUndefined(); // Colère remains locked.
});

test('automatic grades follow level changes; explicit spell customizations and order survive', () => {
  const original = { ...emptyLoadout('IOP'), level: 199, spells: { common: [350, 367], order: [350, 367, 141], grades: { 350: 3, 141: 3 } } };
  const raised = loadoutAtLevel('IOP', original, 200);
  const spells = Object.values(resolveSpellLoadout('IOP', raised).spells);
  expect(spells.slice(0, 3).map(s => [s.id, s.grade])).toEqual([[350, 6], [367, 6], [141, 3]]);
  const lowered = loadoutAtLevel('IOP', raised, 199);
  expect(Object.values(resolveSpellLoadout('IOP', lowered).spells).slice(0, 3).map(s => s.grade)).toEqual([6, 6, 3]);
  expect(original.spells.grades).toEqual({ 350: 3, 141: 3 });
});
