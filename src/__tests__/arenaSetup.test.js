import React from 'react';
import '@testing-library/jest-dom';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import ArenaScreen from '../ui/ArenaScreen';
import { LoadoutsProvider } from '../ui/LoadoutsContext';
import { DRAFT_STORAGE, LIBRARY_STORAGE, emptyLibrary, libraryReducer } from '../ui/loadoutStore';
import { emptyLoadout, resolveLoadout } from '../engine/equipment';
import { listAllBots } from '../ui/botsStore';
import { CreationsProvider } from '../ui/CreationsContext';
import { CREATIONS_STORAGE } from '../ui/creationsStore';
import { CREATION_SPELLS_BY_ID } from '../ui/creationCatalogue';
import * as runner from '../arena/runner';

const personalBot = { id: 'custom-duel', name: 'Mon IA', emoji: '🤖', custom: true, code: `
  let owner = null;
  let announced = false;
  function decide(view) {
    if (owner === null) owner = view.you.id;
    if (owner !== view.you.id) throw new Error('Mémoire partagée entre les camps');
    if (!announced) {
      announced = true;
      return { type: 'SAY', text: view.you.classId };
    }
    return { type: 'PASS' };
  }
` };
const allBots = listAllBots([personalBot]);
const draft = (classId, level) => ({ ...emptyLoadout(classId), level, base: {}, spells: { common: [367] } });
const select = (label, value) => fireEvent.change(screen.getByRole('combobox', { name: label, exact: true }), { target: { value } });
const drafts = () => JSON.parse(localStorage.getItem(DRAFT_STORAGE));
const mount = props => render(<LoadoutsProvider><ArenaScreen allBots={allBots} {...props} /></LoadoutsProvider>);
let match;

beforeAll(() => {
  // jsdom does not implement the native dialog methods used by MapPicker.
  HTMLDialogElement.prototype.close = function close() { this.removeAttribute('open'); };
  HTMLDialogElement.prototype.showModal = function showModal() { this.setAttribute('open', ''); };
});
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(DRAFT_STORAGE, JSON.stringify({ 'A:IOP': draft('IOP', 120), 'B:CRA': draft('CRA', 170), 'B:IOP': draft('IOP', 99) }));
  let library = emptyLibrary();
  for (const [id, name, slots] of [['hammer', 'Marteau', { weapon: 2416 }], ['mobility', 'Mobilité', { ring1: 2469, dofus1: 6980 }]]) {
    library = libraryReducer(library, { type: 'save', id, name, loadout: { ...draft('SACRIEUR', 200), slots }, now: 1 });
  }
  localStorage.setItem(LIBRARY_STORAGE, JSON.stringify(library));
  match = jest.spyOn(runner, 'runMatchAsync');
});
afterEach(() => { cleanup(); jest.restoreAllMocks(); });

test('one personal AI plays both sides with independent memory, classes, levels, equipment and spells', async () => {
  mount();
  select('Stuff A', 'hammer'); select('Stuff B', 'mobility');
  select('IA A', personalBot.id);
  const before = drafts();
  fireEvent.click(screen.getByRole('button', { name: 'Même IA que A' }));
  expect(screen.getByRole('combobox', { name: 'IA B', exact: true })).toHaveValue(personalBot.id);
  expect(drafts()).toEqual(before);
  expect(screen.getByText(/La même IA pilote les deux personnages/)).toBeInTheDocument();
  let result;
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /Lancer le combat/ }));
    expect(match).toHaveBeenCalledTimes(1);
    result = await match.mock.results[0].value;
  });
  expect(result.config.classes).toEqual({ A: 'IOP', B: 'CRA' });
  const initial = result.frames[0].state;
  for (const [side, classId] of [['A', 'IOP'], ['B', 'CRA']]) {
    const loadout = before[`${side}:${classId}`], summary = resolveLoadout(classId, loadout);
    expect(initial.fighters[side]).toMatchObject({ classId, level: loadout.level,
      basePa: summary.pa, basePm: summary.pm, stats: summary.stats, loadout: summary.snapshot });
    expect(result.config.botNames[side]).toContain(`${side} · Mon IA`);
  }
  expect(initial.fighters.A.level).toBe(120);
  expect(initial.fighters.B.level).toBe(170);
  expect(result.events.filter(e => e.t === 'say').map(e => [e.fighter, e.text]).sort()).toEqual([['A', 'IOP'], ['B', 'CRA']]);
  expect(result.stats.A.errors + result.stats.B.errors).toBe(0);
  expect(result.finalState.over).toBe(true);
  expect(screen.getByRole('slider', { name: 'Progression du combat' })).toHaveAttribute('max', String(result.frames.length - 1));
  expect(drafts()).toEqual(before);
});

test('even two characters of the same class keep separate loadouts and enforce equipment requirements', () => {
  mount();
  select('Classe B', 'IOP');
  select('Stuff A', 'hammer'); select('Stuff B', 'mobility');
  const a = drafts()['A:IOP'];
  select('Niveau B', '1');
  expect(screen.getByRole('button', { name: /Lancer le combat/ })).toBeDisabled();
  expect(screen.getByRole('alert')).toHaveTextContent('Gelano nécessite le niveau 60');
  select('Niveau B', '100');
  expect(screen.getByRole('button', { name: /Lancer le combat/ })).toBeEnabled();
  expect(drafts()['B:IOP']).toMatchObject({ level: 100, slots: { ring1: 2469, dofus1: 6980 } });
  expect(drafts()['A:IOP']).toEqual(a);
  expect(screen.getByRole('combobox', { name: 'Niveau A', exact: true })).toHaveValue('120');
});

test('tournament replays still use the requested participants, map and seed', async () => {
  const consumed = jest.fn();
  const replay = { botA: personalBot.id, botB: personalBot.id, classA: 'ENUTROF', classB: 'FECA', mapId: 'arene', seed: 741 };
  mount({ replay, onReplayConsumed: consumed });
  let result;
  await act(async () => { result = await match.mock.results[0].value; });
  expect(consumed).toHaveBeenCalledTimes(1);
  expect(result.config).toMatchObject({ classes: { A: 'ENUTROF', B: 'FECA' }, mapId: 'arene', seed: 741, loadouts: {} });
  expect(screen.getByRole('combobox', { name: 'Classe A', exact: true })).toHaveValue('ENUTROF');
  expect(screen.getByRole('combobox', { name: 'IA B', exact: true })).toHaveValue(personalBot.id);
  expect(result.finalState.over).toBe(true);
});

test('one saved custom character can play both sides with independent changes and monster spells', async () => {
  const character = { id: 'hybrid', name: 'Mon hybride', classId: 'ENUTROF', loadout: {
    ...draft('ENUTROF', 200), spells: { custom: [202, 305].map(id => CREATION_SPELLS_BY_ID[id].grades.at(-1)) },
  } };
  const saved = { version: 1, characters: [character], dungeons: [] };
  localStorage.setItem(CREATIONS_STORAGE, JSON.stringify(saved));
  render(<LoadoutsProvider><CreationsProvider><ArenaScreen allBots={allBots} /></CreationsProvider></LoadoutsProvider>);
  const before = drafts();
  select('Personnage personnalisé A', character.id); select('Personnage personnalisé B', character.id);
  select('Niveau B', '100');
  select('Stuff A', 'hammer');
  expect(screen.getByRole('combobox', { name: 'Niveau A', exact: true })).toHaveValue('200');
  expect(screen.getByRole('combobox', { name: 'Classe A', exact: true })).toBeDisabled();
  select('IA A', personalBot.id); select('IA B', personalBot.id);
  let result;
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /Lancer le combat/ }));
    result = await match.mock.results[0].value;
  });
  expect(result.config.classes).toEqual({ A: 'ENUTROF', B: 'ENUTROF' });
  expect(result.config.loadouts.A.level).toBe(200);
  expect(result.config.loadouts.B.level).toBe(100);
  expect(result.config.loadouts.A.slots.weapon).toBe(2416);
  expect(result.config.loadouts.B.slots).toEqual({});
  expect(result.config.loadouts.B.spells.custom.map(spell => spell.id)).toEqual([202, 305]);
  expect(result.config.botNames.A).toContain('Mon hybride');
  expect(JSON.parse(localStorage.getItem(CREATIONS_STORAGE))).toEqual(saved);
  expect(drafts()).toEqual(before);
});
