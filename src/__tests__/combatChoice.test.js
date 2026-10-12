import React from 'react';
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { emptyLoadout } from '../engine/equipment';
import { KANOJEDO_MAP_ID, POUTCH_ID } from '../engine/monsters';
import { BUILTIN_BOTS } from '../bots/builtins';
import * as runner from '../arena/runner';
import { LoadoutsProvider } from '../ui/LoadoutsContext';
import { ProfilesProvider } from '../ui/ProfilesContext';
import { CreationsProvider } from '../ui/CreationsContext';
import { CREATIONS_STORAGE } from '../ui/creationsStore';
import { SETUP_STORAGE } from '../ui/playerSetupState';
import PlayScreen from '../ui/PlayScreen';
import ArenaScreen from '../ui/ArenaScreen';

const loadout = { ...emptyLoadout('IOP'), level: 200, base: { force: 100 }, slots: { weapon: 2416 } };
const room = { id: 'room', name: 'Mon donjon', mapId: 'dungeon_2083', members: [{ monsterId: 494, grade: 1, count: 2 }] };
const wrap = node => <LoadoutsProvider><CreationsProvider><ProfilesProvider>{node}</ProfilesProvider></CreationsProvider></LoadoutsProvider>;
const done = () => fireEvent.click(screen.getByRole('button', { name: 'C’est prêt' }));
const saved = () => JSON.parse(localStorage.getItem(SETUP_STORAGE));
const open = container => { fireEvent.click(container.querySelector('.setup-play')); return within(screen.getByRole('dialog', { name: 'Choisir un combat' })); };
beforeAll(() => {
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
});
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('dofus-lite-loadouts-v1', JSON.stringify({ 'A:IOP': loadout }));
  localStorage.setItem(CREATIONS_STORAGE, JSON.stringify({ version: 1, characters: [], dungeons: [room] }));
});
afterEach(() => jest.restoreAllMocks());

test('Jouer opens a modal without starting combat, cancellation restores focus and keeps the selection', () => {
  const { container } = render(wrap(<PlayScreen allBots={BUILTIN_BOTS} onAutomaticLaunch={jest.fn()} />));
  const button = container.querySelector('.setup-play'); button.focus();
  const dialog = open(container);
  expect(dialog.getByRole('group', { name: 'Type de combat' }).querySelectorAll('button')).toHaveLength(3);
  expect(dialog.queryByRole('searchbox')).not.toBeInTheDocument();
  expect(dialog.queryByLabelText('Bot adverse')).not.toBeInTheDocument();
  expect(container.querySelector('.fight-screen')).toBeNull();
  fireEvent.click(dialog.getByRole('button', { name: 'Entraînement Testez vos combos' }));
  fireEvent.change(dialog.getByLabelText('Niveau du Poutch'), { target: { value: '2' } });
  fireEvent.click(dialog.getByRole('button', { name: 'Fermer le choix du combat' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(button);
  expect(document.body.style.overflow).toBe('');
  expect(saved()).toMatchObject({ mode: 'kanojedo', monsterGrade: 2, controller: 'player' });
  const reopened = open(container);
  expect(reopened.getByLabelText('Niveau du Poutch')).toHaveValue('2');
  fireEvent.click(reopened.getByRole('button', { name: 'Lancer le combat' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(container.querySelector('.fight-heading')).toHaveTextContent('Kanojedo');
});

test('reload restores the dungeon, its level, and both AI choices without resetting the PvP map', () => {
  const props = { allBots: BUILTIN_BOTS, onAutomaticLaunch: jest.fn() };
  const view = render(wrap(<PlayScreen {...props} />));
  const dialog = open(view.container);
  fireEvent.click(dialog.getByRole('button', { name: 'Changer de carte' }));
  fireEvent.click(view.container.querySelector('[data-map-id="canyon"]'));
  fireEvent.click(dialog.getByRole('button', { name: 'Modifier les adversaires' }));
  fireEvent.click(dialog.getByRole('button', { name: 'Vider le camp adverse' }));
  fireEvent.click(dialog.getByRole('button', { name: 'Classes', exact: true }));
  fireEvent.click(dialog.getByRole('button', { name: 'Ajouter Féca' }));
  fireEvent.change(dialog.getByLabelText('IA de Féca (1)'), { target: { value: 'cortex' } });
  done();
  fireEvent.click(dialog.getByRole('button', { name: 'Tout en IA' }));
  fireEvent.click(dialog.getByRole('button', { name: 'Réglages' }));
  fireEvent.change(dialog.getByLabelText('IA de votre personnage'), { target: { value: 'cortex' } });
  done();
  fireEvent.click(dialog.getByRole('button', { name: 'Donjon Défiez une salle entière' }));
  fireEvent.click(dialog.getByRole('button', { name: 'Choisir un donjon' }));
  fireEvent.click(dialog.getByRole('button', { name: /Choisir Bouftou Royal/ }));
  done();
  fireEvent.change(dialog.getByLabelText('Niveau du boss'), { target: { value: '1' } });
  view.unmount();
  const next = render(wrap(<PlayScreen {...props} />));
  const restored = open(next.container);
  expect(restored.getByRole('button', { name: 'Tout en IA' })).toHaveAttribute('aria-pressed', 'true');
  expect(restored.getByRole('button', { name: 'Donjon Défiez une salle entière' })).toHaveAttribute('aria-pressed', 'true');
  expect(restored.getByText(/Chaque combattant utilise son IA/)).toBeInTheDocument();
  expect(restored.getByLabelText('Niveau du boss')).toHaveValue('1');
  expect(saved()).toMatchObject({ controller: 'ai', mode: 'boss', bossId: 147, bossGrade: 1, mapId: 'canyon', botClass: 'FECA' });
  expect(JSON.parse(localStorage.getItem('dofus-lite-opponent-team-v1')).entries[0].botId).toBe('cortex');
  fireEvent.click(restored.getByRole('button', { name: 'Lancer le combat' }));
  expect(props.onAutomaticLaunch).toHaveBeenCalledWith(expect.objectContaining({ mode: 'boss', bossId: 147, bossGrade: 1, dungeon: null, botId: 'cortex', character: expect.objectContaining({ classId: 'IOP', loadout }) }));
  expect(screen.queryByRole('dialog')).toBeNull();
});

test('an invalid saved room never prevents opening Jouer and switching to a playable mode', () => {
  localStorage.setItem(SETUP_STORAGE, JSON.stringify({ mode: 'boss', bossId: 2891, bossGrade: 6 }));
  const { container } = render(wrap(<PlayScreen allBots={BUILTIN_BOTS} />));
  expect(container.querySelector('.setup-play')).toBeEnabled();
  const dialog = open(container);
  expect(dialog.getByRole('button', { name: 'Lancer le combat' })).toBeDisabled();
  fireEvent.click(dialog.getByRole('button', { name: 'Entraînement Testez vos combos' }));
  expect(dialog.getByRole('button', { name: 'Lancer le combat' })).toBeEnabled();
});

test('custom room creation closes the modal and returning selects that room in the inline Combat tab', () => {
  const onOpenCreator = jest.fn();
  const view = render(wrap(<PlayScreen allBots={BUILTIN_BOTS} onOpenCreator={onOpenCreator} />));
  const dialog = open(view.container);
  fireEvent.click(dialog.getByRole('button', { name: 'Donjon Défiez une salle entière' }));
  fireEvent.click(dialog.getByRole('button', { name: 'Choisir un donjon' }));
  fireEvent.click(dialog.getByRole('button', { name: 'Créer un donjon' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(onOpenCreator).toHaveBeenCalledWith('dungeons', undefined);
  view.rerender(wrap(<PlayScreen allBots={BUILTIN_BOTS} onOpenCreator={onOpenCreator} selectionRequest={{ id: 'return-room', tab: 'dungeons', entry: room }} />));
  expect(screen.queryByRole('dialog')).toBeNull();
  const returned = screen.getByRole('region', { name: 'Choisir un combat' });
  expect(returned.querySelector('.combat-dungeon-title')).toHaveTextContent(room.name);
  fireEvent.click(within(returned).getByRole('button', { name: 'Lancer le combat' }));
  expect(view.container.querySelector('.fight-heading')).toHaveTextContent('Donjon des Bouftous');
  expect(view.container.querySelectorAll('.token.side-B')).toHaveLength(2);
});

test.each(['player', 'ai'])('testing a dungeon opens the main lobby with the saved %s team, room and AI choices', controller => {
  const allies = [{ kind: 'character', name: 'Mon compagnon', classId: 'IOP', loadout, controller, botId: 'cortex' }];
  const savedTeam = { version: 1, includePlayer: false, entries: allies };
  localStorage.setItem('dofus-lite-ally-team-v1', JSON.stringify(savedTeam));
  localStorage.setItem(SETUP_STORAGE, JSON.stringify({ mode: 'duel', mapId: 'canyon', controller, playerBotId: 'cortex' }));
  const automatic = jest.fn();
  const { container } = render(wrap(<PlayScreen allBots={BUILTIN_BOTS} onAutomaticLaunch={automatic}
    selectionRequest={{ id: 'test-dungeon', tab: 'dungeons', entry: room, openDialog: true }} />));
  const dialog = within(screen.getByRole('dialog', { name: 'Choisir un combat' }));
  expect(dialog.getByRole('button', { name: 'Donjon Défiez une salle entière' })).toHaveAttribute('aria-pressed', 'true');
  expect(dialog.getByRole('region', { name: 'Aperçu des adversaires' })).toHaveTextContent(room.name);
  expect(dialog.getByRole('region', { name: 'Aperçu de mon équipe' }).querySelectorAll('.combat-member')).toHaveLength(1);
  expect(dialog.getByRole('region', { name: 'Aperçu de mon équipe' })).toHaveTextContent('Mon compagnon');
  expect(container.querySelector('.fight-screen')).toBeNull();
  expect(container.querySelector('.studio-test-dialog')).toBeNull();
  expect(saved()).toMatchObject({ mode: 'boss', customDungeonId: room.id, mapId: 'canyon', controller, playerBotId: 'cortex' });
  expect(JSON.parse(localStorage.getItem('dofus-lite-ally-team-v1'))).toEqual(savedTeam);
  fireEvent.click(dialog.getByRole('button', { name: 'Lancer le combat' }));
  if (controller === 'ai') {
    expect(automatic).toHaveBeenCalledWith(expect.objectContaining({ mode: 'custom', dungeon: room, team: allies, botId: 'cortex' }));
  } else {
    expect(automatic).not.toHaveBeenCalled();
    expect(container.querySelector('.fight-heading')).toHaveTextContent('Donjon des Bouftous');
    expect(container.querySelectorAll('.token.side-B')).toHaveLength(2);
    expect(container.querySelector('.token.side-A')).toHaveAttribute('aria-label', 'Mon compagnon');
  }
});

test('testing from Atelier returns from a mounted fight and can reopen the same room after cancelling', () => {
  const props = { allBots: BUILTIN_BOTS, onAutomaticLaunch: jest.fn() };
  const view = render(wrap(<PlayScreen {...props} />));
  fireEvent.click(open(view.container).getByRole('button', { name: 'Lancer le combat' }));
  expect(view.container.querySelector('.fight-screen')).toBeInTheDocument();
  const request = { id: 'first-test', tab: 'dungeons', entry: room, openDialog: true };
  view.rerender(wrap(<PlayScreen {...props} selectionRequest={request} />));
  expect(view.container.querySelector('.fight-screen')).toBeNull();
  let dialog = within(screen.getByRole('dialog', { name: 'Choisir un combat' }));
  expect(dialog.getByRole('region', { name: 'Aperçu des adversaires' })).toHaveTextContent(room.name);
  fireEvent.click(dialog.getByRole('button', { name: 'Fermer le choix du combat' }));
  view.rerender(wrap(<PlayScreen {...props} selectionRequest={request} />));
  expect(screen.queryByRole('dialog')).toBeNull();
  view.rerender(wrap(<PlayScreen {...props} selectionRequest={{ ...request, id: 'second-test' }} />));
  dialog = within(screen.getByRole('dialog', { name: 'Choisir un combat' }));
  expect(dialog.getByRole('button', { name: 'Lancer le combat' })).toBeEnabled();
});

test('compilation errors stay inside the modal instead of starting a match', () => {
  const invalid = { id: 'invalid', name: 'IA invalide', code: '!!! invalid syntax' };
  const onAutomaticLaunch = jest.fn();
  const { container } = render(wrap(<PlayScreen allBots={[...BUILTIN_BOTS, invalid]} onAutomaticLaunch={onAutomaticLaunch} />));
  const dialog = open(container);
  fireEvent.click(dialog.getByRole('button', { name: 'Modifier les adversaires' }));
  fireEvent.change(dialog.getByLabelText('IA de Cra (1)'), { target: { value: 'invalid' } });
  done();
  fireEvent.click(dialog.getByRole('button', { name: 'Lancer le combat' }));
  expect(dialog.getByRole('alert')).toHaveTextContent('IA invalide');
  fireEvent.click(dialog.getByRole('button', { name: 'Tout en IA' }));
  fireEvent.click(dialog.getByRole('button', { name: 'Lancer le combat' }));
  expect(dialog.getByRole('alert')).toHaveTextContent('IA invalide');
  expect(onAutomaticLaunch).not.toHaveBeenCalled();
});

test('Escape and the backdrop close the modal without starting combat', () => {
  const { container } = render(wrap(<PlayScreen allBots={BUILTIN_BOTS} />));
  open(container);
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { bubbles: true, cancelable: true }));
  expect(screen.queryByRole('dialog')).toBeNull();
  open(container);
  const dialog = screen.getByRole('dialog');
  fireEvent.mouseDown(dialog); fireEvent.click(dialog);
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(container.querySelector('.fight-screen')).toBeNull();
});

test('focused editors return to the overview with Escape and restore focus without losing the selected map', () => {
  const { container } = render(wrap(<PlayScreen allBots={BUILTIN_BOTS} />));
  const dialog = open(container);
  fireEvent.click(dialog.getByRole('button', { name: 'Changer de carte' }));
  fireEvent.click(container.querySelector('[data-map-id="canyon"]'));
  expect(container.querySelector('.combat-terrain')).toHaveTextContent('Canyon');
  expect(document.activeElement).toBe(dialog.getByRole('button', { name: 'Changer de carte' }));
  fireEvent.click(dialog.getByRole('button', { name: 'Modifier les adversaires' }));
  expect(dialog.queryByRole('group', { name: 'Type de combat' })).not.toBeInTheDocument();
  expect(dialog.getByRole('searchbox', { name: 'Rechercher un adversaire' })).toBeInTheDocument();
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { bubbles: true, cancelable: true }));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(dialog.queryByRole('searchbox')).not.toBeInTheDocument();
  expect(document.activeElement).toBe(dialog.getByRole('button', { name: 'Modifier les adversaires' }));
  expect(saved().mapId).toBe('canyon');
});

test('automatic control stays selected across duel, dungeon and training; training uses its chosen Poutch and map', () => {
  const automatic = jest.fn();
  const { container } = render(wrap(<PlayScreen allBots={BUILTIN_BOTS} onAutomaticLaunch={automatic} />));
  const dialog = open(container);
  fireEvent.click(dialog.getByRole('button', { name: 'Tout en IA' }));
  fireEvent.click(dialog.getByRole('button', { name: 'Donjon Défiez une salle entière' }));
  expect(saved()).toMatchObject({ controller: 'ai', mode: 'boss' });
  fireEvent.click(dialog.getByRole('button', { name: 'Duel Inventez votre rencontre' }));
  expect(saved()).toMatchObject({ controller: 'ai', mode: 'duel' });
  fireEvent.click(dialog.getByRole('button', { name: 'Entraînement Testez vos combos' }));
  expect(saved()).toMatchObject({ controller: 'ai', mode: 'kanojedo' });
  expect(dialog.getByRole('button', { name: 'Tout en IA' })).toHaveAttribute('aria-pressed', 'true');
  expect(dialog.getByRole('button', { name: 'Lancer le combat' })).toBeEnabled();
  fireEvent.change(dialog.getByLabelText('Niveau du Poutch'), { target: { value: '2' } });
  fireEvent.click(dialog.getByRole('button', { name: 'Lancer le combat' }));
  expect(automatic).toHaveBeenCalledWith(expect.objectContaining({ mode: 'duel', mapId: KANOJEDO_MAP_ID,
    opponents: [{ kind: 'monster', monsterId: POUTCH_ID, grade: 2 }] }));
});

test.each(['duel', 'boss', 'custom'])('Arena launches the complete %s configuration from the popup once, independent of previous settings', async mode => {
  const simulate = jest.spyOn(runner, 'runMatchAsync').mockImplementation(() => new Promise(() => {}));
  // A stale custom room must not override a newly requested official dungeon.
  localStorage.setItem(SETUP_STORAGE, JSON.stringify({ mode: 'boss', bossId: 2891, bossGrade: 6, customDungeonId: room.id }));
  const request = { id: 'launch', mode, character: { classId: 'IOP', name: 'Mon Iop', loadout },
    opponent: { classId: 'CRA', name: 'Mon adversaire', loadout: { ...emptyLoadout('CRA'), level: 180 } },
    botId: 'cortex', botB: 'cortex', bossId: 147, bossGrade: 1, dungeon: mode === 'custom' ? room : null, mapId: 'canyon', seed: 17 };
  const consumed = jest.fn();
  const view = render(wrap(<ArenaScreen allBots={BUILTIN_BOTS} matchLaunch={request} onMatchConsumed={consumed} />));
  await act(async () => {});
  const config = simulate.mock.calls[0][0];
  expect(config).toMatchObject({ classes: { A: 'IOP' }, loadouts: { A: loadout }, seed: 17 });
  if (mode === 'duel') expect(config).toMatchObject({ classes: { B: 'CRA' }, loadouts: { B: request.opponent.loadout }, mapId: 'canyon' });
  else expect(config).toMatchObject({ mode, bossId: 147, bossGrade: 1, controllerName: 'Cortex' });
  if (mode === 'boss') expect(config.dungeon).toBeUndefined();
  if (mode === 'custom') expect(config.dungeon).toEqual(room);
  view.rerender(wrap(<ArenaScreen allBots={BUILTIN_BOTS} matchLaunch={{ ...request }} onMatchConsumed={consumed} />));
  expect(simulate).toHaveBeenCalledTimes(1);
  expect(consumed).toHaveBeenCalledTimes(1);
});
