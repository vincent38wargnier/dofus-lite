import React from 'react';
import '@testing-library/jest-dom';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { BUILTIN_BOTS } from '../bots/builtins';
import { emptyLoadout } from '../engine/equipment';
import * as runner from '../arena/runner';
import { CreationsProvider, useCreations } from '../ui/CreationsContext';
import { CREATIONS_STORAGE, emptyCreations } from '../ui/creationsStore';
import { CREATION_SPELLS_BY_ID } from '../ui/creationCatalogue';
import { LoadoutsProvider } from '../ui/LoadoutsContext';
import { DRAFT_STORAGE, LIBRARY_STORAGE, emptyLibrary, libraryReducer } from '../ui/loadoutStore';
import { SETUP_STORAGE } from '../ui/playerSetupState';
import PlayScreen from '../ui/PlayScreen';
import ArenaScreen from '../ui/ArenaScreen';
import { ProfilesProvider } from '../ui/ProfilesContext';
import { PROFILES_STORAGE } from '../ui/profileStore';
import WorkshopScreen from '../ui/WorkshopScreen';

const character = (id, name, level, spells) => ({ id, name, classId: 'IOP', loadout: {
  ...emptyLoadout('IOP'), level, base: {}, slots: { weapon: 2416 },
  spells: { custom: spells.map(id => CREATION_SPELLS_BY_ID[id].grades.at(-1)), order: spells },
} });
const first = character('guardian', 'Gardien des flammes', 200, [153, 202]);
const second = character('healer', 'Gardienne des soins', 150, [121, 305]);
const saved = () => JSON.parse(localStorage.getItem(CREATIONS_STORAGE));
const drafts = () => JSON.parse(localStorage.getItem(DRAFT_STORAGE));
const profiles = () => JSON.parse(localStorage.getItem(PROFILES_STORAGE));
const active = () => profiles().profiles.find(profile => profile.id === profiles().activeId);
const select = name => {
  fireEvent.click(screen.getByRole('button', { name: 'Nouveau personnage' }));
  fireEvent.click(screen.getByRole('button', { name: `Choisir ${name} (personnalisée)` }));
};
const summary = () => within(screen.getByLabelText('Résumé du personnage'));
function RemoveCreation() {
  const creations = useCreations();
  return <button onClick={() => creations.update(previous => ({ ...previous, characters: previous.characters.filter(entry => entry.id !== first.id) }))}>Supprimer la création sélectionnée</button>;
}
const mount = (children = <PlayScreen allBots={BUILTIN_BOTS} />) => render(
  <LoadoutsProvider><CreationsProvider><ProfilesProvider>{children}</ProfilesProvider></CreationsProvider></LoadoutsProvider>,
);

beforeAll(() => {
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
});
beforeEach(() => {
  jest.useFakeTimers(); localStorage.clear();
  localStorage.setItem(SETUP_STORAGE, JSON.stringify({ playerClass: 'IOP', mode: 'kanojedo', monsterGrade: 5 }));
  localStorage.setItem(DRAFT_STORAGE, JSON.stringify({ 'A:IOP': { ...emptyLoadout('IOP'), level: 100, base: {} } }));
  localStorage.setItem(CREATIONS_STORAGE, JSON.stringify({ ...emptyCreations(), characters: [first, second] }));
  const library = libraryReducer(emptyLibrary(), { type: 'save', id: 'gelano', name: 'Mon Gelano', now: 1,
    loadout: { ...emptyLoadout('IOP'), slots: { ring1: 2469 } } });
  localStorage.setItem(LIBRARY_STORAGE, JSON.stringify(library));
});
afterEach(() => { cleanup(); jest.useRealTimers(); jest.restoreAllMocks(); });

test('two profiles of the same custom class keep independent settings without modifying the class or portable stuff', () => {
  const view = mount();
  expect(screen.queryByRole('heading', { name: 'Choisissez votre classe' })).not.toBeInTheDocument();
  const standard = drafts();
  select(first.name);
  const firstProfile = active().id;
  expect(summary().getByRole('heading', { name: first.name })).toBeInTheDocument();
  fireEvent.change(screen.getByRole('combobox', { name: 'Niveau du personnage' }), { target: { value: '175' } });
  fireEvent.click(screen.getByRole('tab', { name: /Équipement/ }));
  fireEvent.click(document.querySelector('[data-stuff-id="gelano"]'));
  expect(active().loadout).toMatchObject({ level: 175, slots: { ring1: 2469 }, spells: first.loadout.spells });
  expect(saved().characters).toEqual([first, second]);
  expect(drafts()).toEqual(standard);
  expect(JSON.parse(localStorage.getItem(LIBRARY_STORAGE)).active).toEqual({ [`A:${firstProfile}`]: 'gelano' });
  select(first.name);
  expect(active().id).not.toBe(firstProfile);
  expect(active().name).toBe(`${first.name} (2)`);
  expect(active().loadout).toEqual(first.loadout);
  fireEvent.click(screen.getByRole('button', { name: 'Personnage précédent' }));
  expect(active().loadout.level).toBe(175);
  view.unmount(); mount();
  expect(active().id).toBe(firstProfile);
  expect(summary().getByRole('heading', { name: first.name })).toBeInTheDocument();
  expect(active().loadout.slots).toEqual({ ring1: 2469 });
});

test.each(['kanojedo', 'boss', 'duel'])('a selected custom class enters %s with its own name, weapon and class/monster spellbook', mode => {
  localStorage.setItem(SETUP_STORAGE, JSON.stringify({ playerClass: 'IOP', customCharacterId: first.id, mode }));
  const { container } = mount();
  fireEvent.click(container.querySelector('.setup-play'));
  fireEvent.click(container.querySelector('.combat-choice-launch'));
  expect(container.querySelector('.fight-heading')).toHaveTextContent(first.name);
  expect(container.querySelector('.combat-stats[data-inspected-fighter="A"]')).toHaveTextContent(first.name);
  expect([...container.querySelectorAll('.combat-spellbar .spell-slot')].map(e => Number(e.dataset.spellId))).toEqual([0, 153, 202]);
  fireEvent.click(screen.getByRole('button', { name: 'Préparation', exact: true }));
  expect(summary().getByRole('heading', { name: first.name })).toBeInTheDocument();
});

test('the dungeon simulation receives the selected creation, including its name and spell grades', async () => {
  localStorage.setItem(SETUP_STORAGE, JSON.stringify({ playerClass: 'IOP', customCharacterId: first.id, mode: 'boss-auto' }));
  const run = jest.spyOn(runner, 'runMatchAsync').mockImplementation(() => new Promise(() => {}));
  mount(<ArenaScreen allBots={BUILTIN_BOTS} />);
  fireEvent.click(screen.getByRole('button', { name: /Contre un donjon/ }));
  await act(async () => fireEvent.click(screen.getByRole('button', { name: /Simuler le donjon/ })));
  expect(run).toHaveBeenCalledTimes(1);
  expect(run.mock.calls[0][0]).toMatchObject({ classes: { A: 'IOP' }, bots: { A: { name: first.name } }, loadouts: { A: first.loadout } });
});

test('a saved profile remains playable after deleting its original class definition', () => {
  localStorage.setItem(SETUP_STORAGE, JSON.stringify({ playerClass: 'IOP', customCharacterId: first.id, mode: 'kanojedo' }));
  const { container } = mount(<><PlayScreen allBots={BUILTIN_BOTS} /><RemoveCreation /></>);
  fireEvent.click(screen.getByRole('button', { name: 'Supprimer la création sélectionnée' }));
  expect(screen.queryByRole('button', { name: `Choisir ${first.name} (personnalisée)` })).not.toBeInTheDocument();
  expect(active().loadout).toEqual(first.loadout);
  expect(summary().getByRole('heading', { name: first.name })).toBeInTheDocument();
  fireEvent.click(container.querySelector('.setup-play'));
  fireEvent.click(container.querySelector('.combat-choice-launch'));
  expect(screen.getByRole('button', { name: 'Prêt' })).toBeEnabled();
  expect(saved().characters).toEqual([second]);
});

test('testing a dungeon returns its snapshot to the shared combat menu and preserves the selected custom character', () => {
  localStorage.setItem(SETUP_STORAGE, JSON.stringify({ playerClass: 'IOP', customCharacterId: first.id }));
  const onLaunch = jest.fn(), onTestDungeon = jest.fn();
  mount(<WorkshopScreen allBots={BUILTIN_BOTS} onLaunch={onLaunch} onTestDungeon={onTestDungeon} />);
  fireEvent.click(screen.getByRole('button', { name: 'Nouveau donjon' }));
  fireEvent.click(screen.getByRole('button', { name: 'Ajouter Poutch Ingball' }));
  fireEvent.click(screen.getByRole('button', { name: 'Tester', exact: true }));
  expect(onTestDungeon).toHaveBeenCalledWith(saved().dungeons[0]);
  expect(onLaunch).not.toHaveBeenCalled();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(active().name).toBe(first.name);
});
