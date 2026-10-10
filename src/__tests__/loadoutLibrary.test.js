import React from 'react';
import '@testing-library/jest-dom';
import { act, render, screen, fireEvent, within } from '@testing-library/react';
import { CLASS_IDS } from '../engine/classes';
import { ITEMS, emptyLoadout, equipSet, resolveLoadout, rolledEffects } from '../engine/equipment';
import { createForgedItem } from '../engine/forgedItems';
import { LoadoutsProvider, useLoadouts } from '../ui/LoadoutsContext';
import LoadoutLibrary from '../ui/LoadoutLibrary';
import { DRAFT_STORAGE, LIBRARY_STORAGE, emptyLibrary, readLibrary, libraryReducer, persistLibrary, sameLoadout, isLoadout, equipmentSnapshot, applySavedEquipment, sameEquipment } from '../ui/loadoutStore';

const config = () => ({ ...equipSet(emptyLoadout('IOP'), 1), level: 143, rollMode: 'random', rollSeed: 17,
  spells: { common: [350, 367], grades: { 350: 3 }, order: [350, 0, 367] } });
const save = (id, loadout = config(), extra = {}) => ({ type: 'save', id, classId: 'IOP', name: 'Terre', loadout, now: 1, key: 'A:IOP', ...extra });
beforeEach(() => localStorage.clear());

test('named equipment snapshots preserve rolls independently of character settings without sharing objects', () => {
  const draft = config();
  const library = persistLibrary(localStorage, emptyLibrary(), save('earth', draft));
  draft.slots.hat = null; draft.spells.common.push(368); draft.spells.order.reverse();
  const build = library.builds[0];
  expect(build.loadout.slots.hat).toBe(2411);
  expect(build).not.toHaveProperty('classId');
  expect(build.loadout).toEqual({ version: 1, base: {}, ...equipmentSnapshot(config()) });
  expect(readLibrary(localStorage)).toEqual({ library, error: '' });
  expect(resolveLoadout('IOP', applySavedEquipment(config(), readLibrary(localStorage).library.builds[0].loadout))).toEqual(resolveLoadout('IOP', config()));
});

test('many named builds remain independent when one is changed, renamed or duplicated', () => {
  let library = libraryReducer(emptyLibrary(), save('earth'));
  const second = { ...config(), slots: { ring2: 2469, dofus1: 6980 } };
  library = libraryReducer(library, save('mobility', second, { name: 'Mobilité' }));
  library = libraryReducer(library, save('earth', { ...config(), rollSeed: 81 }, { replace: true, now: 3 }));
  expect(library.builds).toHaveLength(2);
  expect(equipmentSnapshot(library.builds.find(b => b.id === 'mobility').loadout)).toEqual(equipmentSnapshot(second));
  expect(library.builds.find(b => b.id === 'earth')).toMatchObject({ createdAt: 1, updatedAt: 3, loadout: { rollSeed: 81 } });
  library = libraryReducer(library, { type: 'rename', id: 'earth', name: '  Terre   critique  ', now: 4 });
  library = libraryReducer(library, save('copy', config(), { name: 'Terre critique', key: undefined }));
  expect(library.builds.map(b => b.name)).toContain('Terre critique (2)');
  expect(library.active['A:IOP']).toBe('earth');
  expect(() => libraryReducer(library, save('earth'))).toThrow();
  expect(() => libraryReducer(library, save('missing', config(), { replace: true }))).toThrow();
});

test('any stuff can be activated on either combatant without a class restriction', () => {
  let library = libraryReducer(emptyLibrary(), save('earth'));
  library = libraryReducer(library, save('air', emptyLoadout('CRA'), { classId: 'CRA', key: 'B:CRA' }));
  expect(library.active).toEqual({ 'A:IOP': 'earth', 'B:CRA': 'air' });
  library = libraryReducer(library, { type: 'activate', id: 'air', classId: 'IOP', key: 'A:IOP' });
  expect(library.active).toEqual({ 'A:IOP': 'air', 'B:CRA': 'air' });
  library = libraryReducer(library, { type: 'activate', id: 'earth', classId: 'IOP', key: 'B:IOP' });
  expect(library.active['A:IOP']).toBe('air');
  expect(library.active['B:IOP']).toBe('earth');
  expect(() => libraryReducer(library, { type: 'activate', id: 'missing', key: 'A:IOP' })).toThrow();
});

test('delete and undo preserve the snapshot and do not delete another stuff', () => {
  let library = libraryReducer(libraryReducer(emptyLibrary(), save('a')), save('b'));
  const build = library.builds.find(b => b.id === 'b');
  library = libraryReducer(library, { type: 'delete', id: 'b' });
  expect(library.builds.map(b => b.id)).toEqual(['a']);
  expect(library.active['A:IOP']).toBeUndefined();
  library = libraryReducer(library, { type: 'restore', build, active: { 'A:IOP': 'b' } });
  expect(library.builds[0]).toEqual(build);
  expect(library.active['A:IOP']).toBe('b');
  expect(libraryReducer(library, { type: 'restore', build }).builds).toHaveLength(2);
});

test('storage failure never commits or changes the old in-memory library', () => {
  const library = persistLibrary(localStorage, emptyLibrary(), save('a'));
  const raw = localStorage.getItem(LIBRARY_STORAGE);
  const fullStorage = { setItem() { throw new DOMException('full', 'QuotaExceededError'); } };
  expect(() => persistLibrary(fullStorage, library, save('b'))).toThrow();
  expect(library.builds.map(b => b.id)).toEqual(['a']);
  expect(localStorage.getItem(LIBRARY_STORAGE)).toBe(raw);
});

test.each(['{bad json', JSON.stringify({ version: 2, builds: [], active: {} }), JSON.stringify({ version: 1, builds: [{}], active: {} })])('unreadable libraries are reported without overwriting the source: %s', raw => {
  localStorage.setItem(LIBRARY_STORAGE, raw);
  expect(readLibrary(localStorage).error).toBeTruthy();
  expect(localStorage.getItem(LIBRARY_STORAGE)).toBe(raw);
});

test('loadout validation rejects corrupt nested data but retains unfinished equipment', () => {
  expect(isLoadout({ ...config(), slots: { ring1: 2469, ring2: 2469 } })).toBe(true);
  expect(isLoadout({ ...config(), spells: { common: 'bad' } })).toBe(false);
  expect(isLoadout({ ...config(), spells: { grades: { 350: {} } } })).toBe(false);
  expect(isLoadout({ ...config(), base: [] })).toBe(false);
  expect(isLoadout({ ...config(), base: { force: -1 } })).toBe(true); // Engine reports the invalid budget without replacing the draft.
  expect(isLoadout({ ...config(), base: { force: NaN } })).toBe(false);
  expect(isLoadout({ ...config(), level: 201 })).toBe(false);
});

test('dirty checking ignores key insertion order and notices nested spell and roll changes', () => {
  const a = config();
  const b = { ...a, slots: Object.fromEntries(Object.entries(a.slots).reverse()) };
  expect(sameLoadout(a, b)).toBe(true);
  expect(sameLoadout(a, { ...b, rollSeed: 18 })).toBe(false);
  expect(sameLoadout(a, { ...b, spells: { ...b.spells, order: [0, 350, 367] } })).toBe(false);
  expect(sameEquipment(a, { ...b, level: 200, base: {}, profile: { sex: 1 }, spells: { common: [] } })).toBe(true);
  expect(sameEquipment(a, { ...b, rollSeed: 18 })).toBe(false);
});

test('legacy class-bound saves remain readable and unchanged until an explicit equipment update', () => {
  const legacy = { version: 1, builds: [{ id: 'old', classId: 'IOP', name: 'Ancien', createdAt: 1, updatedAt: 1, loadout: config() }], active: { 'A:IOP': 'old' } };
  const raw = JSON.stringify(legacy);
  localStorage.setItem(LIBRARY_STORAGE, raw);
  const restored = readLibrary(localStorage);
  expect(restored).toEqual({ library: legacy, error: '' });
  expect(localStorage.getItem(LIBRARY_STORAGE)).toBe(raw);
  const other = { ...emptyLoadout('CRA'), level: 200, base: { intelligence: 80 }, profile: { sex: 1 }, spells: { order: [161, 0], common: [367] } };
  const applied = applySavedEquipment(other, restored.library.builds[0].loadout);
  expect(applied).toMatchObject({ level: 200, base: other.base, profile: other.profile, spells: other.spells });
  expect(sameEquipment(applied, legacy.builds[0].loadout)).toBe(true);
  const updated = persistLibrary(localStorage, restored.library, { type: 'save', id: 'old', replace: true, name: 'Ancien', loadout: { ...applied, rollSeed: 23 }, now: 2 });
  expect(updated.builds[0]).not.toHaveProperty('classId');
  expect(updated.builds[0].loadout).toMatchObject({ level: 143, base: config().base, spells: config().spells, rollSeed: 23 });
  expect(legacy.builds[0].loadout.rollSeed).toBe(17);
});

test.each(CLASS_IDS)('equipment, FM and pet bonuses transfer to %s while its character settings stay intact', classId => {
  const source = { ...config(), level: 200, slots: { ring1: 2469, ring2: 9128, pet: 7520 },
    rollOrigins: { ring2: 'ring1' }, petBonuses: { 7520: 213 } };
  source.forgedItems = { ring1: createForgedItem(ITEMS[2469], rolledEffects(ITEMS[2469], source, 'ring1'), 17) };
  source.forgedItems.ring1.stats.pm = 1;
  const target = { ...emptyLoadout(classId), level: 200, base: {}, profile: { sex: 1, alignment: 2, rank: 3 }, spells: { common: [367], order: [0, 367] } };
  const original = JSON.stringify({ source, target });
  const result = applySavedEquipment(target, source);
  for (const key of ['level', 'base', 'profile', 'spells']) expect(result[key]).toEqual(target[key]);
  const summary = resolveLoadout(classId, result);
  expect(summary.valid).toBe(true);
  expect(summary.bonuses).toEqual(resolveLoadout('IOP', source).bonuses);
  expect(summary.bonuses.pm).toBe(1);
  expect(summary.bonuses.res_feu).toBe(26);
  expect(rolledEffects(ITEMS[9128], result, 'ring2')).toEqual(rolledEffects(ITEMS[9128], source, 'ring2'));
  expect(JSON.stringify({ source, target })).toBe(original);
  result.forgedItems.ring1.stats.pm = 0;
  expect(source.forgedItems.ring1.stats.pm).toBe(1);
  const clean = applySavedEquipment(result, { ...emptyLoadout(classId), slots: { ring1: 2469 } });
  expect(clean.forgedItems).toBeUndefined();
  expect(clean.rollOrigins).toBeUndefined();
  expect(clean.petBonuses).toBeUndefined();
});

test('cross-class loading still checks equipment requirements on the current character', () => {
  const source = { ...config(), slots: { ring1: 2469 } };
  const low = { ...emptyLoadout('CRA'), level: 1, base: {} };
  expect(resolveLoadout('CRA', applySavedEquipment(low, source)).errors).toContain('Gelano nécessite le niveau 60.');
  const classItem = Object.values(ITEMS).find(item => item.condition === 'PG=1');
  expect(classItem).toBeDefined();
  const wrongClass = applySavedEquipment({ ...emptyLoadout('IOP'), level: 200, base: {} }, { ...config(), slots: { weapon: classItem.id } });
  expect(resolveLoadout('IOP', wrongClass).errors.some(error => error.includes('conditions non remplies'))).toBe(true);
});

function LibraryHarness({ side = 'A', onClassChange }) {
  const equipment = useLoadouts('CRA', 'SACRIEUR');
  return <LoadoutLibrary side={side} classId={side === 'A' ? 'CRA' : 'SACRIEUR'} loadout={equipment.loadouts[side]}
    update={equipment.update} onClassChange={onClassChange} />;
}

test('library and quick load reuse a legacy Iop stuff on Cra and Sacrieur, with undo and persistence', () => {
  const cra = { ...emptyLoadout('CRA'), level: 200, base: { intelligence: 200 }, profile: { sex: 1 }, spells: { common: [367], order: [0, 367, 161] } };
  const sacri = { ...emptyLoadout('SACRIEUR'), level: 180, base: { vitalite: 1000 } };
  const legacy = { version: 1, builds: [{ id: 'old-iop', name: 'Terre', classId: 'IOP', loadout: config() }], active: {} };
  localStorage.setItem(LIBRARY_STORAGE, JSON.stringify(legacy));
  localStorage.setItem(DRAFT_STORAGE, JSON.stringify({ 'A:CRA': cra, 'B:SACRIEUR': sacri }));
  const onClassChange = jest.fn();
  const renderLibrary = side => render(<LoadoutsProvider><LibraryHarness side={side} onClassChange={onClassChange} /></LoadoutsProvider>);
  let view = renderLibrary('A');
  fireEvent.click(screen.getByRole('button', { name: /Mes stuffs/ }));
  expect(screen.queryByRole('combobox', { name: 'Classes de la bibliothèque' })).not.toBeInTheDocument();
  const card = view.container.querySelector('.stuff-card');
  const preview = resolveLoadout('CRA', applySavedEquipment(cra, config()));
  expect(card).toHaveTextContent(`${preview.hp} PV`);
  expect(card).not.toHaveTextContent('Iop');
  fireEvent.click(within(card).getByRole('button', { name: 'Charger ce stuff' }));
  let stored = JSON.parse(localStorage.getItem(DRAFT_STORAGE));
  expect(stored['A:CRA']).toEqual(applySavedEquipment(cra, config()));
  expect(stored['B:SACRIEUR']).toEqual(sacri);
  expect(onClassChange).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Mettre à jour' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Annuler l’action' }));
  expect(JSON.parse(localStorage.getItem(DRAFT_STORAGE))['A:CRA']).toEqual(cra);
  fireEvent.change(screen.getByRole('combobox', { name: 'Charger un stuff' }), { target: { value: 'old-iop' } });
  view.unmount();
  view = renderLibrary('B');
  fireEvent.change(screen.getByRole('combobox', { name: 'Charger un stuff' }), { target: { value: 'old-iop' } });
  stored = JSON.parse(localStorage.getItem(DRAFT_STORAGE));
  expect(stored['A:CRA']).toEqual(applySavedEquipment(cra, config()));
  expect(stored['B:SACRIEUR']).toEqual(applySavedEquipment(sacri, config()));
  expect(JSON.parse(localStorage.getItem(LIBRARY_STORAGE)).active).toEqual({ 'A:CRA': 'old-iop', 'B:SACRIEUR': 'old-iop' });
  expect(JSON.parse(localStorage.getItem(LIBRARY_STORAGE)).builds).toEqual(legacy.builds);
});

function Harness() {
  const { loadouts, update } = useLoadouts('IOP', 'CRA');
  return <><output data-testid="loadout">{JSON.stringify(loadouts)}</output><button onClick={() => {
    update('A', current => ({ ...current, slots: { ...current.slots, ring2: 2469 } }));
    update('A', current => ({ ...current, slots: { ...current.slots, dofus1: 6980 } }));
  }}>Equip</button></>;
}

test('legacy per-class drafts survive the upgrade and queued changes do not overwrite each other', () => {
  const oldDraft = config();
  const oldOtherClass = emptyLoadout('FECA');
  localStorage.setItem(DRAFT_STORAGE, JSON.stringify({ 'A:IOP': oldDraft, 'B:FECA': oldOtherClass }));
  render(<LoadoutsProvider><Harness /></LoadoutsProvider>);
  expect(JSON.parse(screen.getByTestId('loadout').textContent).A).toEqual(oldDraft);
  act(() => fireEvent.click(screen.getByText('Equip')));
  const stored = JSON.parse(localStorage.getItem(DRAFT_STORAGE));
  expect(stored['A:IOP'].slots).toMatchObject({ ring2: 2469, dofus1: 6980, hat: 2411 });
  expect(stored['A:IOP'].spells).toEqual(oldDraft.spells);
  expect(stored['B:FECA']).toEqual(oldOtherClass);
  expect(localStorage.getItem(LIBRARY_STORAGE)).toBeNull();
});
