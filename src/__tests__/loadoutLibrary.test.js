import React from 'react';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { emptyLoadout, equipSet, resolveLoadout } from '../engine/equipment';
import { LoadoutsProvider, useLoadouts } from '../ui/LoadoutsContext';
import { DRAFT_STORAGE, LIBRARY_STORAGE, emptyLibrary, readLibrary, libraryReducer, persistLibrary, sameLoadout, isLoadout } from '../ui/loadoutStore';

const config = () => ({ ...equipSet(emptyLoadout('IOP'), 1), level: 143, rollMode: 'random', rollSeed: 17,
  spells: { common: [350, 367], grades: { 350: 3 }, order: [350, 0, 367] } });
const save = (id, loadout = config(), extra = {}) => ({ type: 'save', id, classId: 'IOP', name: 'Terre', loadout, now: 1, key: 'A:IOP', ...extra });
beforeEach(() => localStorage.clear());

test('named snapshots preserve level, rolls, profile, base stats and spell order without sharing objects', () => {
  const draft = config();
  const library = persistLibrary(localStorage, emptyLibrary(), save('earth', draft));
  draft.slots.hat = null; draft.spells.common.push(368); draft.spells.order.reverse();
  const build = library.builds[0];
  expect(build.loadout.slots.hat).toBe(2411);
  expect(build.loadout.spells).toEqual({ common: [350, 367], grades: { 350: 3 }, order: [350, 0, 367] });
  expect(readLibrary(localStorage)).toEqual({ library, error: '' });
  expect(resolveLoadout('IOP', readLibrary(localStorage).library.builds[0].loadout)).toEqual(resolveLoadout('IOP', config()));
});

test('many named builds remain independent when one is changed, renamed or duplicated', () => {
  let library = libraryReducer(emptyLibrary(), save('earth'));
  const second = { ...config(), slots: { ring2: 2469, dofus1: 6980 } };
  library = libraryReducer(library, save('mobility', second, { name: 'Mobilité' }));
  library = libraryReducer(library, save('earth', { ...config(), rollSeed: 81 }, { replace: true, now: 3 }));
  expect(library.builds).toHaveLength(2);
  expect(library.builds.find(b => b.id === 'mobility').loadout).toEqual(second);
  expect(library.builds.find(b => b.id === 'earth')).toMatchObject({ createdAt: 1, updatedAt: 3, loadout: { rollSeed: 81 } });
  library = libraryReducer(library, { type: 'rename', id: 'earth', name: '  Terre   critique  ', now: 4 });
  library = libraryReducer(library, save('copy', config(), { name: 'Terre critique', key: undefined }));
  expect(library.builds.map(b => b.name)).toContain('Terre critique (2)');
  expect(library.active['A:IOP']).toBe('earth');
  expect(() => libraryReducer(library, save('earth'))).toThrow();
  expect(() => libraryReducer(library, save('missing', config(), { replace: true }))).toThrow();
});

test('activation stays separate for each combatant and checks the class', () => {
  let library = libraryReducer(emptyLibrary(), save('earth'));
  library = libraryReducer(library, save('air', emptyLoadout('CRA'), { classId: 'CRA', key: 'B:CRA' }));
  expect(library.active).toEqual({ 'A:IOP': 'earth', 'B:CRA': 'air' });
  expect(() => libraryReducer(library, { type: 'activate', id: 'air', classId: 'IOP', key: 'A:IOP' })).toThrow();
  library = libraryReducer(library, { type: 'activate', id: 'earth', classId: 'IOP', key: 'B:IOP' });
  expect(library.active['A:IOP']).toBe('earth');
  expect(library.active['B:IOP']).toBe('earth');
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
