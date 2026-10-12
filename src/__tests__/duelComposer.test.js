import React from 'react';
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { emptyLoadout } from '../engine/equipment';
import { BUILTIN_BOTS } from '../bots/builtins';
import { ProfilesProvider } from '../ui/ProfilesContext';
import { PROFILES_STORAGE } from '../ui/profileStore';
import { CreationsProvider } from '../ui/CreationsContext';
import { LoadoutsProvider } from '../ui/LoadoutsContext';
import { OPPONENTS_STORAGE, OPPONENT_DRAG_TYPE } from '../ui/opponentTeamStore';
import PlayScreen from '../ui/PlayScreen';
import ArenaScreen from '../ui/ArenaScreen';
import * as runner from '../arena/runner';

const first = { id: 'iop', name: 'Iop feu', classId: 'IOP', className: 'Iop', loadout: { ...emptyLoadout('IOP'), level: 200, base: { intelligence: 100 }, slots: { weapon: 2416 } } };
const second = { id: 'sram', name: 'Mon Sram', classId: 'SRAM', className: 'Sram', loadout: { ...emptyLoadout('SRAM'), level: 180, base: { force: 100 } } };
const wrap = node => <LoadoutsProvider><CreationsProvider><ProfilesProvider>{node}</ProfilesProvider></CreationsProvider></LoadoutsProvider>;
const setup = props => {
  const view = render(wrap(<PlayScreen allBots={BUILTIN_BOTS} {...props} />));
  fireEvent.click(view.container.querySelector('.setup-play'));
  fireEvent.click(screen.getByRole('button', { name: 'Modifier les adversaires' }));
  return view;
};
const done = () => fireEvent.click(screen.getByRole('button', { name: 'C’est prêt' }));
const saved = () => JSON.parse(localStorage.getItem(OPPONENTS_STORAGE)).entries;
beforeAll(() => {
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
});
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(PROFILES_STORAGE, JSON.stringify({ version: 1, activeId: first.id, profiles: [first, second] }));
});
afterEach(() => jest.restoreAllMocks());

test('profiles are the default catalogue, drag and drop copies a profile, and click adds an exact monster grade', () => {
  const before = localStorage.getItem(PROFILES_STORAGE);
  const view = setup();
  const dialog = within(screen.getByRole('dialog', { name: 'Choisir un combat' }));
  expect(dialog.getByRole('button', { name: 'Mes personnages 2' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(dialog.getByRole('button', { name: 'Vider le camp adverse' }));
  done();
  expect(dialog.getByRole('button', { name: 'Lancer le combat' })).toBeDisabled();
  fireEvent.click(dialog.getByRole('button', { name: 'Modifier les adversaires' }));
  const data = {}; const transfer = { types: [OPPONENT_DRAG_TYPE], setData: (key, value) => { data[key] = value; }, getData: key => data[key] };
  fireEvent.dragStart(view.container.querySelector('[data-candidate-id="profile:sram"]'), { dataTransfer: transfer });
  fireEvent.dragOver(view.container.querySelector('[data-opponent-drop]'), { dataTransfer: transfer });
  fireEvent.drop(view.container.querySelector('[data-opponent-drop]'), { dataTransfer: transfer });
  expect(saved()[0]).toMatchObject({ classId: 'SRAM', name: 'Mon Sram', loadout: second.loadout });
  fireEvent.click(dialog.getByRole('button', { name: 'Monstres', exact: true }));
  fireEvent.change(dialog.getByLabelText('Rechercher un adversaire'), { target: { value: 'Poutch' } });
  fireEvent.change(dialog.getByLabelText('Niveau proposé pour Poutch Ingball'), { target: { value: '2' } });
  fireEvent.click(dialog.getByRole('button', { name: 'Ajouter Poutch Ingball' }));
  expect(saved()[1]).toEqual({ kind: 'monster', monsterId: 494, grade: 2 });
  expect(localStorage.getItem(PROFILES_STORAGE)).toBe(before);
  done();
  fireEvent.click(dialog.getByRole('button', { name: 'Lancer le combat' }));
  expect(view.container.querySelectorAll('.token.side-B')).toHaveLength(2);
  expect(view.container.querySelector('.token[data-fighter-id="B"]')).toHaveAttribute('aria-label', expect.stringContaining('Mon Sram'));
});

test('personalizing an opponent changes only its copy and survives reloading with the selected map', () => {
  const before = localStorage.getItem(PROFILES_STORAGE);
  const view = setup();
  fireEvent.click(screen.getByRole('button', { name: 'Vider le camp adverse' }));
  fireEvent.click(screen.getByRole('button', { name: 'Ajouter Mon Sram' }));
  fireEvent.click(screen.getByRole('button', { name: 'Personnaliser', exact: true }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Niveau du personnage' }), { target: { value: '170' } });
  expect(saved()[0].loadout.level).toBe(170);
  const force = saved()[0].loadout.base.force || 0;
  fireEvent.click(screen.getByRole('tab', { name: 'Caractéristiques' }));
  fireEvent.click(screen.getByRole('button', { name: 'Augmenter Force' }));
  expect(saved()[0].loadout.base.force).toBe(force + 1);
  fireEvent.click(screen.getByRole('tab', { name: 'Sorts' }));
  expect(view.container.querySelector('.opponent-edit-banner')).toHaveTextContent('Mon Sram');
  expect(localStorage.getItem(PROFILES_STORAGE)).toBe(before);
  fireEvent.click(screen.getByRole('button', { name: 'Revenir au choix du combat' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Changer de carte' }));
  fireEvent.change(screen.getByLabelText('Rechercher une carte'), { target: { value: 'Bouftou' } });
  fireEvent.click(view.container.querySelector('[data-map-id="dungeon_2083"]'));
  expect(view.container.querySelector('.combat-terrain')).toHaveTextContent('Donjon des Bouftous');
  view.unmount();
  const restored = setup();
  expect(restored.container.querySelector('.duel-team')).toHaveTextContent('Niv. 170');
  done();
  expect(restored.container.querySelector('.combat-terrain')).toHaveTextContent('Donjon des Bouftous');
});

test('group capacity, empty searches, removal and automatic launch preserve the visible composition', () => {
  const automatic = jest.fn();
  const view = setup({ onAutomaticLaunch: automatic });
  fireEvent.click(screen.getByRole('button', { name: 'Vider le camp adverse' }));
  for (let i = 0; i < 8; i++) fireEvent.click(screen.getByRole('button', { name: 'Ajouter Iop feu' }));
  expect(screen.getByRole('button', { name: 'Ajouter Mon Sram' })).toBeDisabled();
  expect(saved()).toHaveLength(8);
  fireEvent.click(screen.getByRole('button', { name: 'Retirer Iop feu (1)' }));
  expect(saved()).toHaveLength(7);
  fireEvent.change(screen.getByLabelText('Rechercher un adversaire'), { target: { value: 'inexistant' } });
  expect(screen.getByText('Aucun résultat')).toBeInTheDocument();
  expect(saved()).toHaveLength(7);
  done();
  fireEvent.click(screen.getByRole('button', { name: 'Tout en IA' }));
  fireEvent.click(screen.getByRole('button', { name: 'Lancer le combat' }));
  expect(automatic.mock.calls[0][0].opponents).toEqual(saved());
  expect(view.container.querySelector('.combat-choice')).toBeNull();
});

test('each adversary has its own saved AI; reload and removing another member keep its choice attached', () => {
  const original = localStorage.getItem(PROFILES_STORAGE), view = setup();
  fireEvent.click(screen.getByRole('button', { name: 'Vider le camp adverse' }));
  fireEvent.click(screen.getByRole('button', { name: 'Ajouter Iop feu' }));
  fireEvent.click(screen.getByRole('button', { name: 'Ajouter Mon Sram' }));
  fireEvent.change(screen.getByLabelText('IA de Iop feu (1)'), { target: { value: 'pantin' } });
  fireEvent.change(screen.getByLabelText('IA de Mon Sram (2)'), { target: { value: 'cortex' } });
  expect(saved().map(e => e.botId)).toEqual(['pantin', 'cortex']);
  expect(screen.queryByLabelText('Bot adverse')).not.toBeInTheDocument();
  view.unmount();
  setup();
  expect(screen.getByLabelText('IA de Iop feu (1)')).toHaveValue('pantin');
  expect(screen.getByLabelText('IA de Mon Sram (2)')).toHaveValue('cortex');
  fireEvent.click(screen.getByRole('button', { name: 'Retirer Iop feu (1)' }));
  expect(screen.getByLabelText('IA de Mon Sram (1)')).toHaveValue('cortex');
  expect(saved()[0]).toMatchObject({ name: second.name, botId: 'cortex', loadout: second.loadout });
  expect(localStorage.getItem(PROFILES_STORAGE)).toBe(original);
});

test('a monster can use its native AI or an individually selected AI without changing other opponents', () => {
  setup();
  fireEvent.click(screen.getByRole('button', { name: 'Monstres', exact: true }));
  fireEvent.change(screen.getByLabelText('Rechercher un adversaire'), { target: { value: 'Poutch' } });
  fireEvent.click(screen.getByRole('button', { name: 'Ajouter Poutch Ingball' }));
  expect(screen.getByLabelText('IA de Poutch Ingball (2)')).toHaveValue('');
  fireEvent.change(screen.getByLabelText('IA de Poutch Ingball (2)'), { target: { value: 'cortex' } });
  expect(saved().map(e => e.botId)).toEqual(['maison', 'cortex']);
  fireEvent.change(screen.getByLabelText('IA de Poutch Ingball (2)'), { target: { value: '' } });
  expect(saved()[1].botId).toBeNull();
  expect(screen.getByLabelText('IA de Cra (1)')).toHaveValue('maison');
});

test('missing or broken enemy AI blocks both launch modes and can be corrected on the affected card', () => {
  localStorage.setItem(OPPONENTS_STORAGE, JSON.stringify({ version: 1, entries: [{ kind: 'character', ...second, botId: 'deleted' }] }));
  const broken = { id: 'broken', name: 'IA cassée', code: '!!! invalid syntax', custom: true };
  const automatic = jest.fn(), view = setup({ allBots: [...BUILTIN_BOTS, broken], onAutomaticLaunch: automatic });
  expect(screen.getByLabelText('IA de Mon Sram (1)')).toHaveValue('deleted');
  expect(screen.getByRole('option', { name: 'IA indisponible · À remplacer' })).toBeInTheDocument();
  done(); fireEvent.click(screen.getByRole('button', { name: 'Lancer le combat' }));
  expect(within(screen.getByRole('dialog')).getByRole('alert')).toHaveTextContent('Mon Sram : choisissez une IA disponible');
  fireEvent.click(screen.getByRole('button', { name: 'Modifier les adversaires' }));
  fireEvent.change(screen.getByLabelText('IA de Mon Sram (1)'), { target: { value: 'broken' } });
  done(); fireEvent.click(screen.getByRole('button', { name: 'Tout en IA' }));
  fireEvent.click(screen.getByRole('button', { name: 'Lancer le combat' }));
  expect(within(screen.getByRole('dialog')).getByRole('alert')).toHaveTextContent('Mon Sram · IA cassée');
  expect(automatic).not.toHaveBeenCalled(); expect(view.container.querySelector('.fight-screen')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Modifier les adversaires' }));
  fireEvent.change(screen.getByLabelText('IA de Mon Sram (1)'), { target: { value: 'pantin' } });
  done(); fireEvent.click(screen.getByRole('button', { name: 'Lancer le combat' }));
  expect(automatic).toHaveBeenCalledWith(expect.objectContaining({ opponents: [expect.objectContaining({ botId: 'pantin' })] }));
});

test('the automatic launcher compiles each saved opponent choice, including a personal AI', async () => {
  const personal = { id: 'custom-test', name: 'Ma tactique', code: 'function decide() { return {type: "PASS", proof: "personal"}; }', custom: true };
  const allBots = [...BUILTIN_BOTS, personal], automatic = jest.fn(), view = setup({ allBots, onAutomaticLaunch: automatic });
  fireEvent.click(screen.getByRole('button', { name: 'Vider le camp adverse' }));
  fireEvent.click(screen.getByRole('button', { name: 'Ajouter Iop feu' }));
  fireEvent.click(screen.getByRole('button', { name: 'Ajouter Mon Sram' }));
  fireEvent.change(screen.getByLabelText('IA de Iop feu (1)'), { target: { value: 'pantin' } });
  fireEvent.change(screen.getByLabelText('IA de Mon Sram (2)'), { target: { value: personal.id } });
  done(); fireEvent.click(screen.getByRole('button', { name: 'Tout en IA' }));
  fireEvent.click(screen.getByRole('button', { name: 'Lancer le combat' }));
  const request = automatic.mock.calls[0][0];
  expect(request.opponents.map(e => e.botId)).toEqual(['pantin', personal.id]);
  view.unmount();
  const simulate = jest.spyOn(runner, 'runMatchAsync').mockImplementation(() => new Promise(() => {}));
  render(wrap(<ArenaScreen allBots={allBots} matchLaunch={request} onMatchConsumed={jest.fn()} />));
  await act(async () => {});
  const config = simulate.mock.calls[0][0];
  expect(config.bots.B.name).toBe('Pantin'); expect(config.bots.B2.name).toBe(personal.name);
  expect(config.bots.B2.decide()).toMatchObject({ type: 'PASS', proof: 'personal' });
  expect(config.opponents).toEqual(request.opponents);
});
