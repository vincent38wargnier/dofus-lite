import React from 'react';
import '@testing-library/jest-dom';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { emptyLoadout } from '../engine/equipment';
import { LiveMatch } from '../game/liveMatch';
import { spellsOf } from '../engine/engine';
import { ProfilesProvider } from '../ui/ProfilesContext';
import { PROFILES_STORAGE } from '../ui/profileStore';
import { ALLIES_STORAGE } from '../ui/allyTeamStore';
import { OPPONENT_DRAG_TYPE } from '../ui/opponentTeamStore';
import { SETUP_STORAGE } from '../ui/playerSetupState';
import { LoadoutsProvider } from '../ui/LoadoutsContext';
import { CreationsProvider } from '../ui/CreationsContext';
import PlayScreen from '../ui/PlayScreen';

const bots = [{ id: 'maison', name: 'IA de test', code: 'function decide(v,a) {return a.endTurn();}' },
  { id: 'other', name: 'Autre IA', code: 'function decide(v,a) {return a.endTurn();}' }];
const profiles = ['IOP', 'CRA'].map((classId, i) => ({ id: classId, name: i ? 'Archer allié' : 'Principal', classId, className: classId,
  loadout: { ...emptyLoadout(classId), level: 200, base: {}, spells: { order: i ? [171, 161, 164] : [153, 141] } } }));
const done = () => fireEvent.click(screen.getByRole('button', { name: 'C’est prêt' }));
const saved = () => JSON.parse(localStorage.getItem(ALLIES_STORAGE)).entries;
const app = props => <LoadoutsProvider><CreationsProvider><ProfilesProvider><PlayScreen allBots={bots} {...props} /></ProfilesProvider></CreationsProvider></LoadoutsProvider>;
const open = () => { fireEvent.click(document.querySelector('.setup-play')); fireEvent.click(screen.getByRole('button', { name: 'Modifier mon équipe' })); };
const drag = (container, profile) => {
  const data = {}, dataTransfer = { types: [OPPONENT_DRAG_TYPE], setData: (key, value) => { data[key] = value; }, getData: key => data[key] };
  fireEvent.dragStart(container.querySelector(`[data-candidate-id="profile:${profile}"]`), { dataTransfer });
  fireEvent.dragOver(container.querySelector('[data-ally-drop]'), { dataTransfer });
  fireEvent.drop(container.querySelector('[data-ally-drop]'), { dataTransfer });
};
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
beforeEach(() => {
  jest.useFakeTimers(); localStorage.clear();
  localStorage.setItem(PROFILES_STORAGE, JSON.stringify({ version: 1, activeId: 'IOP', profiles }));
  localStorage.setItem(SETUP_STORAGE, JSON.stringify({ playerClass: 'IOP', mode: 'kanojedo', botId: 'maison' }));
});
afterEach(() => { cleanup(); jest.restoreAllMocks(); jest.useRealTimers(); });

test('drag allies, select manual or a specific AI, customize an independent copy and reload the whole team', () => {
  const original = localStorage.getItem(PROFILES_STORAGE), view = render(app()); open();
  drag(view.container, 'CRA');
  fireEvent.click(screen.getByRole('button', { name: 'Ajouter Principal' }));
  fireEvent.change(screen.getByLabelText('Contrôle de Principal (2)'), { target: { value: 'ai' } });
  fireEvent.change(screen.getByLabelText('IA de Principal (2)'), { target: { value: 'other' } });
  expect(saved()[0]).toMatchObject({ classId: 'CRA', controller: 'player', loadout: profiles[1].loadout });
  expect(saved()[1]).toMatchObject({ controller: 'ai', botId: 'other' });
  fireEvent.click(within(view.container.querySelector('[data-ally-index="0"]')).getByRole('button', { name: 'Personnaliser' }));
  expect(screen.getByText('Vous équipez l’allié :')).toBeInTheDocument();
  fireEvent.change(screen.getByRole('combobox', { name: 'Niveau du personnage' }), { target: { value: '190' } });
  expect(saved()[0].loadout.level).toBe(190);
  expect(localStorage.getItem(PROFILES_STORAGE)).toBe(original);
  view.unmount(); render(app()); open();
  expect(screen.getByLabelText('Contrôle de Archer allié (1)')).toHaveValue('player');
  expect(screen.getByLabelText('IA de Principal (2)')).toHaveValue('other');
  expect(screen.getByRole('region', { name: 'Mon équipe' })).toHaveTextContent('Niv. 190');
});

test('eight slots include the principal; monsters keep their chosen grade and AI simulations receive the whole team', () => {
  const automatic = jest.fn(), view = render(app({ onAutomaticLaunch: automatic })); open();
  fireEvent.click(screen.getByRole('button', { name: 'Monstres', exact: true }));
  fireEvent.change(screen.getByLabelText('Rechercher un allié'), { target: { value: 'Poutch' } });
  fireEvent.change(screen.getByLabelText('Niveau proposé pour Poutch Ingball'), { target: { value: '2' } });
  for (let i = 0; i < 7; i++) fireEvent.click(screen.getByRole('button', { name: 'Ajouter Poutch Ingball' }));
  expect(saved()).toHaveLength(7); expect(saved()[0]).toMatchObject({ monsterId: 494, grade: 2, controller: 'ai' });
  expect(screen.getByRole('button', { name: 'Ajouter Poutch Ingball' })).toBeDisabled();
  expect(view.container.querySelector('.duel-team-heading')).toHaveTextContent('8/8');
  fireEvent.click(screen.getByRole('button', { name: 'Retirer Poutch Ingball (1)' }));
  expect(saved()).toHaveLength(6);
  done();
  fireEvent.click(screen.getByRole('button', { name: 'Duel Inventez votre rencontre' }));
  fireEvent.click(screen.getByRole('button', { name: 'Tout en IA' }));
  fireEvent.click(screen.getByRole('button', { name: 'Lancer le combat' }));
  expect(automatic.mock.calls[0][0].allies).toEqual(saved());
});

test('principal AI and manual ally persist independently; all-AI mode follows the actual team without a global switch', () => {
  const automatic = jest.fn(), props = { onAutomaticLaunch: automatic };
  const first = render(app(props)); open(); drag(first.container, 'CRA');
  fireEvent.change(screen.getByLabelText('Contrôle du personnage principal'), { target: { value: 'ai' } });
  fireEvent.change(screen.getByLabelText('IA du personnage principal'), { target: { value: 'other' } });
  expect(screen.getByLabelText('Contrôle de Archer allié (1)')).toHaveValue('player');
  done();
  expect(first.container.querySelector('.combat-play-style')).toHaveTextContent('Équipe mixte');
  const members = first.container.querySelectorAll('.friends .combat-member');
  expect(members[0]).toHaveTextContent('IA'); expect(members[1]).toHaveTextContent('Vous');
  expect(first.container.querySelector('.combat-choice-recap')).not.toHaveTextContent('IA contre IA');
  first.unmount();
  const restored = render(app(props)); open();
  expect(screen.getByLabelText('Contrôle du personnage principal')).toHaveValue('ai');
  expect(screen.getByLabelText('IA du personnage principal')).toHaveValue('other');
  expect(screen.getByLabelText('Contrôle de Archer allié (1)')).toHaveValue('player');
  fireEvent.change(screen.getByLabelText('Contrôle de Archer allié (1)'), { target: { value: 'ai' } });
  expect(restored.container.querySelector('.duel-team-bottom')).toHaveTextContent('IA contre IA');
  // Fully automatic must still expose every selector so a member can return to manual.
  expect(screen.getByLabelText('Contrôle du personnage principal')).toHaveValue('ai');
  fireEvent.change(screen.getByLabelText('Contrôle de Archer allié (1)'), { target: { value: 'player' } });
  expect(restored.container.querySelector('.duel-team-bottom')).not.toHaveTextContent('IA contre IA');
  fireEvent.change(screen.getByLabelText('Contrôle de Archer allié (1)'), { target: { value: 'ai' } });
  done();
  expect(restored.container.querySelector('.combat-play-style')).toHaveTextContent('IA contre IA');
  fireEvent.click(screen.getByRole('button', { name: 'Lancer le combat' }));
  expect(automatic).toHaveBeenCalledTimes(1);
  expect(automatic.mock.calls[0][0]).toMatchObject({ botId: 'other', allies: [{ controller: 'ai', botId: 'maison' }] });
});

test('a lone principal switched to AI launches simulation directly, and the bulk shortcut updates every companion', () => {
  const automatic = jest.fn(), view = render(app({ onAutomaticLaunch: automatic })); open();
  fireEvent.change(screen.getByLabelText('Contrôle du personnage principal'), { target: { value: 'ai' } });
  done(); fireEvent.click(screen.getByRole('button', { name: 'Lancer le combat' }));
  expect(automatic).toHaveBeenCalledWith(expect.objectContaining({ allies: [], botId: 'maison' }));
  open(); drag(view.container, 'CRA'); done();
  expect(view.container.querySelector('.combat-play-style')).toHaveTextContent('Équipe mixte');
  fireEvent.click(screen.getByRole('button', { name: 'Tout en IA' }));
  expect(saved()[0].controller).toBe('ai');
  fireEvent.click(screen.getByRole('button', { name: 'Modifier mon équipe' }));
  expect(screen.getByLabelText('Contrôle de Archer allié (1)')).toHaveValue('ai');
  fireEvent.change(screen.getByLabelText('Contrôle du personnage principal'), { target: { value: 'player' } });
  done(); fireEvent.click(screen.getByRole('button', { name: 'Lancer le combat' }));
  expect(automatic).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Prêt' })).toBeInTheDocument();
});

test('a principal played by AI hands live controls to the manual ally instead of forcing an automatic replay', () => {
  const ready = LiveMatch.prototype.ready;
  const readySpy = jest.spyOn(LiveMatch.prototype, 'ready').mockImplementation(function () {
    const result = ready.call(this);
    this.state.order = ['A', 'A2', 'B']; this.state.currentIndex = 0;
    return { ...result, state: this.state };
  });
  const automatic = jest.fn(), view = render(app({ onAutomaticLaunch: automatic })); open(); drag(view.container, 'CRA');
  fireEvent.change(screen.getByLabelText('Contrôle du personnage principal'), { target: { value: 'ai' } });
  fireEvent.change(screen.getByLabelText('IA du personnage principal'), { target: { value: 'other' } });
  done(); fireEvent.click(screen.getByRole('button', { name: 'Lancer le combat' }));
  expect(automatic).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Prêt' }));
  const match = readySpy.mock.instances[0];
  expect(match.allyBots.A.name).toBe('Autre IA');
  expect(match.isHumanTurn()).toBe(false);
  act(() => jest.advanceTimersByTime(3000));
  expect(match.current().id).toBe('A2'); expect(match.isHumanTurn()).toBe(true);
  expect(view.container.querySelector('[data-controlled-fighter]')).toHaveAttribute('data-controlled-fighter', 'A2');
  expect(screen.getByRole('button', { name: 'Fin de tour' })).toBeEnabled();
  const boost = spellsOf(match.state.fighters.A2).tir_eloigne;
  const principalPa = match.state.fighters.A.pa, allyPa = match.state.fighters.A2.pa;
  fireEvent.contextMenu(view.container.querySelector(`.spell-slot[data-spell-id="${boost.id}"]`));
  expect(match.state.fighters.A2.effects.some(e => e.stat === 'range')).toBe(true);
  expect(match.state.fighters.A2.pa).toBe(allyPa - boost.pa);
  expect(match.state.fighters.A.pa).toBe(principalPa);
});

test('a broken principal AI cannot launch a mixed team and its error stays in the combat chooser', () => {
  const invalid = { id: 'broken', name: 'IA cassée', code: '!!! invalid syntax' };
  const automatic = jest.fn(), view = render(app({ allBots: [...bots, invalid], onAutomaticLaunch: automatic })); open(); drag(view.container, 'CRA');
  fireEvent.change(screen.getByLabelText('Contrôle du personnage principal'), { target: { value: 'ai' } });
  fireEvent.change(screen.getByLabelText('IA du personnage principal'), { target: { value: 'broken' } });
  done(); fireEvent.click(screen.getByRole('button', { name: 'Lancer le combat' }));
  expect(within(screen.getByRole('dialog')).getByRole('alert')).toHaveTextContent('Principal · IA cassée');
  expect(automatic).not.toHaveBeenCalled();
  expect(view.container.querySelector('.fight-screen')).toBeNull();
});

test('commands and fresh timer follow manual allies; right-click and shortcuts cast from the ally, with independent saved order', () => {
  const realReady = LiveMatch.prototype.ready;
  jest.spyOn(LiveMatch.prototype, 'ready').mockImplementation(function () {
    const result = realReady.call(this);
    this.state.order = ['A', 'A2', 'A3', 'B']; this.state.currentIndex = 0;
    return { ...result, state: this.state };
  });
  const actions = jest.spyOn(LiveMatch.prototype, 'humanAct');
  const view = render(app()); open(); drag(view.container, 'CRA');
  fireEvent.click(screen.getByRole('button', { name: 'Ajouter Principal' }));
  fireEvent.change(screen.getByLabelText('Contrôle de Principal (2)'), { target: { value: 'ai' } });
  done();
  fireEvent.click(screen.getByRole('button', { name: 'Lancer le combat' }));
  expect(view.container.querySelectorAll('.token.side-A')).toHaveLength(3);
  expect(screen.getByRole('group', { name: 'Placer votre équipe' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Prêt' }));
  act(() => jest.advanceTimersByTime(10000));
  fireEvent.click(screen.getByRole('button', { name: 'Fin de tour' }));
  expect(view.container.querySelector('[data-controlled-fighter]')).toHaveAttribute('data-controlled-fighter', 'A2');
  expect(view.container.querySelector('.turn-dial')).toHaveTextContent('30 s');
  expect(view.container.querySelector('.turn-status')).toHaveTextContent('Archer allié');
  const match = actions.mock.instances[0], boost = spellsOf(match.state.fighters.A2).tir_eloigne;
  fireEvent.contextMenu(view.container.querySelector(`.spell-slot[data-spell-id="${boost.id}"]`));
  expect(actions.mock.calls.at(-1)[0]).toMatchObject({ type: 'CAST', spell: 'tir_eloigne', target: match.state.fighters.A2.pos });
  expect(match.state.fighters.A2.effects.some(e => e.stat === 'range')).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Trier par type' }));
  expect(saved()[0].loadout.spells.order).toEqual([...view.container.querySelectorAll('.spell-slot')].map(e => Number(e.dataset.spellId)));
  const slot = view.container.querySelector('.spell-slot .spell-btn:not(:disabled)');
  const index = [...view.container.querySelectorAll('.spell-slot')].indexOf(slot.closest('.spell-slot'));
  fireEvent.keyDown(window, { code: `Digit${index + 1}`, key: String(index + 1) });
  expect(view.container.querySelector('.spell-btn.selected') || actions.mock.calls.length > 2).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Fin de tour' }));
  act(() => jest.advanceTimersByTime(3000));
  expect(match.state.fighters.A3).toBeDefined();
  expect(match.state.currentIndex).not.toBe(match.state.order.indexOf('A3'));
  expect(JSON.parse(localStorage.getItem(PROFILES_STORAGE)).profiles[1].loadout).toEqual(profiles[1].loadout);
});

test('remove the principal in the composer, reload an empty team, and fight with a replacement without changing profiles', () => {
  const original = localStorage.getItem(PROFILES_STORAGE);
  const first = render(app()); open();
  fireEvent.click(screen.getByRole('button', { name: 'Retirer Principal de mon équipe' }));
  expect(first.container.querySelector('.team-leader')).toBeNull();
  expect(first.container.querySelector('.duel-team-heading')).toHaveTextContent('0/8');
  done(); expect(screen.getByRole('button', { name: 'Lancer le combat' })).toBeDisabled();
  expect(screen.getByRole('alert')).toHaveTextContent('Ajoutez au moins');
  first.unmount(); const view = render(app()); open();
  expect(view.container.querySelector('.team-leader')).toBeNull();
  drag(view.container, 'CRA'); done();
  expect(screen.getByRole('button', { name: 'Lancer le combat' })).toBeEnabled();
  const readySpy = jest.spyOn(LiveMatch.prototype, 'ready');
  fireEvent.click(screen.getByRole('button', { name: 'Lancer le combat' }));
  fireEvent.click(screen.getByRole('button', { name: 'Prêt' }));
  const match = readySpy.mock.instances[0];
  expect(match.state.fighters.A.name).toBe('Archer allié');
  expect(match.state.fighters.A.classId).toBe('CRA');
  expect(Object.values(match.state.fighters).filter(f => f.team === 'A')).toHaveLength(1);
  expect([...match.humanIds]).toEqual(['A']);
  expect(view.container.querySelector('.fight-heading')).toHaveTextContent('Archer allié');
  fireEvent.click(screen.getByRole('button', { name: 'Trier par type' }));
  expect(saved()[0].loadout.spells.order).toEqual([...view.container.querySelectorAll('.spell-slot')].map(e => Number(e.dataset.spellId)));
  expect(localStorage.getItem(PROFILES_STORAGE)).toBe(original);
});

test('overview removes any friendly or duel opponent and automatically follows the remaining controllers', () => {
  const automatic = jest.fn(), view = render(app({ onAutomaticLaunch: automatic })); open(); drag(view.container, 'CRA');
  fireEvent.change(screen.getByLabelText('Contrôle de Archer allié (1)'), { target: { value: 'ai' } });
  fireEvent.change(screen.getByLabelText('IA de Archer allié (1)'), { target: { value: 'other' } });
  done();
  fireEvent.click(screen.getByRole('button', { name: 'Retirer Principal de mon équipe' }));
  expect(view.container.querySelector('.combat-play-style')).toHaveTextContent('IA contre IA');
  expect(view.container.querySelectorAll('.friends .combat-member')).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Lancer le combat' }));
  expect(automatic.mock.calls[0][0].team).toEqual([expect.objectContaining({ name: 'Archer allié', botId: 'other', controller: 'ai' })]);
  fireEvent.click(document.querySelector('.setup-play'));
  fireEvent.click(screen.getByRole('button', { name: 'Je joue' }));
  expect(saved()[0].controller).toBe('player');
  expect(view.container.querySelector('.combat-play-style')).not.toHaveTextContent('IA contre IA');
  fireEvent.click(screen.getByRole('button', { name: 'Retirer Archer allié de mon équipe (1)' }));
  expect(screen.getByRole('button', { name: 'Lancer le combat' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Duel Inventez votre rencontre' }));
  const foes = screen.getByRole('region', { name: 'Aperçu des adversaires' });
  fireEvent.click(within(foes).getByRole('button', { name: /Retirer .* des adversaires/ }));
  expect(foes.querySelectorAll('.combat-member')).toHaveLength(0);
});

test('clearing the team removes the principal too and frees all eight slots', () => {
  const view = render(app()); open();
  fireEvent.click(screen.getByRole('button', { name: 'Retirer tous les alliés' }));
  expect(view.container.querySelector('.team-leader')).toBeNull();
  for (let i = 0; i < 8; i++) fireEvent.click(screen.getByRole('button', { name: 'Ajouter Archer allié' }));
  expect(saved()).toHaveLength(8);
  expect(screen.getByRole('button', { name: 'Ajouter Archer allié' })).toBeDisabled();
  expect(view.container.querySelector('.duel-team-heading')).toHaveTextContent('8/8');
  expect(localStorage.getItem(PROFILES_STORAGE)).toBe(JSON.stringify({ version: 1, activeId: 'IOP', profiles }));
});
