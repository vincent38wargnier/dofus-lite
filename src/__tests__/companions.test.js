import { ITEMS, emptyLoadout, resolveLoadout, rolledEffects } from '../engine/equipment';
import { replaceEquipment } from '../engine/forgedItems';
import { createGame, applyAction } from '../engine/engine';
import { emptyLibrary, libraryReducer, readLibrary, LIBRARY_STORAGE, isLoadout, equipmentSnapshot } from '../ui/loadoutStore';

const outfit = (pet, extra = {}) => ({ ...emptyLoadout('IOP'), base: {}, slots: { pet }, ...extra });

test.each([
  [6716, 'prospecting', 90], [7519, 'sagesse', 55], [6978, 'vitalite', 440],
  [7518, 'vitalite', 165], [7415, 'power', 55], [7414, 'initiative', 880],
  [7713, 'damage', 11], [7710, 'heal', 11], [8000, 'pods', 1100], [10863, 'reflect', 11],
])('pet %i is fully trained with increased capacity, including existing saved equipment', (pet, stat, amount) => {
  for (const rollMode of ['max', 'average', 'random']) {
    const summary = resolveLoadout('IOP', outfit(pet, { rollMode }));
    expect(summary.errors).toEqual([]);
    expect(summary.bonuses[stat]).toBe(amount);
  }
});

test('alternative pet bonuses use one shared capacity and save the chosen specialization', () => {
  const wabbit = outfit(1748, { petBonuses: { 1748: 124 } });
  expect(resolveLoadout('IOP', wabbit).bonuses).toEqual({ sagesse: 30 });
  const croum = outfit(7520, { petBonuses: { 7520: 213 } });
  expect(resolveLoadout('IOP', croum).bonuses).toEqual({ res_feu: 26 });
  const earth = { ...croum, petBonuses: { 7520: 210 } };
  expect(resolveLoadout('IOP', earth).bonuses).toEqual({ res_terre: 26 });
  expect(resolveLoadout('IOP', outfit(2076)).bonuses).toEqual({ agilite: 90 });
  const library = libraryReducer(emptyLibrary(), { type: 'save', id: 'croum', name: 'Croum feu', classId: 'IOP', loadout: croum, now: 1 });
  const stored = new Map([[LIBRARY_STORAGE, JSON.stringify(library)]]);
  const restored = readLibrary({ getItem: key => stored.get(key) }).library.builds[0].loadout;
  expect(equipmentSnapshot(restored)).toEqual(equipmentSnapshot(croum));
  expect(resolveLoadout('IOP', restored).bonuses).toEqual({ res_feu: 26 });
});

test('invalid pet specializations cannot become arbitrary bonuses in combat', () => {
  expect(isLoadout(outfit(7520, { petBonuses: { 7520: { value: 999 } } }))).toBe(false);
  expect(isLoadout(outfit(7520, { petBonuses: [213] }))).toBe(false);
  const invalid = outfit(7520, { petBonuses: { 7520: 111 } });
  expect(resolveLoadout('IOP', invalid).errors.join(' ')).toMatch(/spécialisation/);
  expect(() => createGame({ fighters: [{ id: 'A', classId: 'IOP', loadout: invalid }, { id: 'B', classId: 'IOP' }] })).toThrow(/spécialisation/);
});

test('fixed pets retain simultaneous bonuses and cosmetic pets do not invent characteristics', () => {
  expect(resolveLoadout('IOP', outfit(6604)).bonuses).toEqual({ prospecting: 20, initiative: 200 });
  expect(resolveLoadout('IOP', outfit(1711)).bonuses).toEqual({ sagesse: 20 });
  expect(resolveLoadout('IOP', outfit(13018)).bonuses).toEqual({});
  expect(rolledEffects(ITEMS[6604], outfit(6604)).some(e => e.row[0] === 940)).toBe(false);
});

test('ordinary companions are usable while restricted MJ pets and wild mounts stay unavailable', () => {
  const mounts = Object.values(ITEMS).filter(item => item.mount);
  expect(mounts).toHaveLength(71);
  for (const item of Object.values(ITEMS).filter(item => item.pet || item.mount)) {
    if (item.id === 6894) {
      expect(resolveLoadout('IOP', outfit(item.id)).valid).toBe(false);
      continue;
    }
    expect({ name: item.name, errors: resolveLoadout('IOP', outfit(item.id, { level: 200 })).errors })
      .toEqual({ name: item.name, errors: [] });
  }
  for (const id of [7806, 7807, 7809, 7864, 7865]) expect(ITEMS[id]).toBeUndefined();
});

test('mounts have their level 100 bonuses from rider level 60, distinct from certificate generation', () => {
  expect(ITEMS[7870]).toMatchObject({ level: 60, mount: { level: 100, generation: 10 } });
  expect(resolveLoadout('IOP', outfit(7870, { level: 59 })).valid).toBe(false);
  const summary = resolveLoadout('IOP', outfit(7870, { level: 60 }));
  expect(summary.errors).toEqual([]);
  expect(summary.bonuses).toEqual({ range: 1, pm: 1, vitalite: 200 });
  expect(resolveLoadout('IOP', outfit(9582)).bonuses).toEqual({ res_air: 5, res_terre: 5, res_feu: 5, res_eau: 5, res_neutre: 5, power: 50 });
  expect(resolveLoadout('IOP', outfit(7819)).bonuses).toEqual({ summons: 2, initiative: 1000 });
});

test('mount bonuses persist in combat and pet replacement removes all mount bonuses', () => {
  const mount = outfit(7870);
  let { state } = createGame({ seed: 71, fighters: [
    { id: 'A', classId: 'IOP', loadout: mount }, { id: 'B', classId: 'IOP', loadout: outfit(null) },
  ] });
  state.order = ['A', 'B']; state.currentIndex = 0;
  expect(state.fighters.A).toMatchObject({ hp: 851, basePa: 7, basePm: 4, permanent: { range: 1 } });
  state.fighters.A.pm = 0;
  state = applyAction(state, { type: 'PASS' }).state;
  state = applyAction(state, { type: 'PASS' }).state;
  expect(state.fighters.A.pm).toBe(4);
  const pet = replaceEquipment(mount, 'pet', 7519);
  const replaced = resolveLoadout('IOP', pet);
  expect(replaced.items).toHaveLength(1);
  expect(replaced).toMatchObject({ hp: 651, pa: 7, pm: 3, bonuses: { sagesse: 55 } });
  expect(replaced.bonuses.range).toBeUndefined();
});
