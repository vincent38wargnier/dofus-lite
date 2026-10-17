import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { newAdventure, addAdventureHero } from '../engine/adventures';
import { emptyLoadout } from '../engine/equipment';
import { KANOJEDO_MAP_ID, POUTCH_ID } from '../engine/monsters';
import { BUILTIN_BOTS } from '../bots/builtins';
import { LoadoutsProvider } from '../ui/LoadoutsContext';
import { ProfilesProvider } from '../ui/ProfilesContext';
import { CreationsProvider } from '../ui/CreationsContext';
import { CREATIONS_STORAGE, emptyCreations } from '../ui/creationsStore';
import { PROFILES_STORAGE } from '../ui/profileStore';
import { SETUP_STORAGE } from '../ui/playerSetupState';
import { ALLIES_STORAGE } from '../ui/allyTeamStore';
import { OPPONENTS_STORAGE } from '../ui/opponentTeamStore';
import { WorldsProvider } from '../ui/WorldsContext';
import { LiveMatch } from '../game/liveMatch';
import { runMatch } from '../arena/runner';
import PlayScreen from '../ui/PlayScreen';
import WorkshopScreen from '../ui/WorkshopScreen';

const character = (name, classId = 'IOP') => ({ id: name, classId, className: name, name,
  loadout: { ...emptyLoadout(classId), level: 200, base: {}, slots: { weapon: 2416 } } });
const dungeon = () => ({ id: 'ready', name: 'Le passage des brumes', mapId: KANOJEDO_MAP_ID,
  members: [{ monsterId: POUTCH_ID, grade: 1, count: 1 }],
  adventure: addAdventureHero(addAdventureHero(newAdventure(), character('Gardien'), 'h1'), character('Éclaireur', 'CRA'), 'h2') });
const libraries = [{ id: 'potter', name: 'Harry Potter', release: '1.0', imported: { dungeons: ['ready'] } }];
const wrap = child => <LoadoutsProvider><CreationsProvider><WorldsProvider libraries={libraries} initialWorldId="potter"><ProfilesProvider>{child}</ProfilesProvider></WorldsProvider></CreationsProvider></LoadoutsProvider>;
const open = container => { fireEvent.click(container.querySelector('.setup-play')); return within(screen.getByRole('dialog', { name: 'Choisir un combat' })); };
const seed = room => {
  localStorage.setItem(CREATIONS_STORAGE, JSON.stringify({ ...emptyCreations(), dungeons: [room] }));
  localStorage.setItem(SETUP_STORAGE, JSON.stringify({ mode: 'boss', customDungeonId: room.id }));
};
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
beforeEach(() => localStorage.clear());

test('the author can enable ready-to-play, include equipped copies and keep the option after reload', () => {
  const room = dungeon(); delete room.adventure; seed(room);
  const hero = character('Héros personnel');
  localStorage.setItem(PROFILES_STORAGE, JSON.stringify({ version: 1, activeId: hero.id, profiles: [hero] }));
  const view = render(wrap(<WorkshopScreen allBots={BUILTIN_BOTS} />));
  fireEvent.click(screen.getByRole('button', { name: /3. Prêt à jouer/ }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Prêt à jouer' }));
  fireEvent.change(within(view.container.querySelector('.adventure-add')).getByLabelText('Monde'), { target: { value: 'personal' } });
  fireEvent.click(screen.getByRole('button', { name: 'Ajouter ce héros' }));
  const saved = JSON.parse(localStorage.getItem(CREATIONS_STORAGE));
  expect(saved.dungeons[0].adventure.heroes[0].character.loadout).toEqual(hero.loadout);
  expect(saved.dungeons[0].adventure.mode).toBe('fixed');
  fireEvent.click(screen.getByRole('button', { name: /Héros au choix/ }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Autoriser le jeu automatique' }));
  view.unmount(); render(wrap(<WorkshopScreen allBots={BUILTIN_BOTS} />));
  fireEvent.click(screen.getByRole('button', { name: /3. Prêt à jouer/ }));
  expect(screen.getByRole('checkbox', { name: 'Autoriser le jeu automatique' })).not.toBeChecked();
  expect(screen.getByRole('button', { name: /Héros au choix/ })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'Exporter l’aventure' })).toBeInTheDocument();
});

test('every world uses the shared editor and validates the actual personal team', () => {
  const room = dungeon(); seed(room);
  const own = character('Mon personnage habituel'); own.loadout.slots.weapon = 999999;
  localStorage.setItem(PROFILES_STORAGE, JSON.stringify({ version: 1, activeId: own.id, profiles: [own] }));
  const { container } = render(wrap(<PlayScreen allBots={BUILTIN_BOTS} />));
  const before = localStorage.getItem(PROFILES_STORAGE), modal = open(container);
  expect(modal.getByRole('heading', { name: 'Combat libre' })).toBeInTheDocument();
  expect(modal.queryByText('Votre équipe est prête')).not.toBeInTheDocument();
  expect(modal.getByRole('button', { name: 'Réglages' })).toBeInTheDocument();
  expect(modal.getByRole('button', { name: 'Lancer le combat' })).toBeDisabled();
  fireEvent.click(modal.getByRole('button', { name: 'Modifier mon équipe' }));
  fireEvent.click(modal.getByRole('button', { name: `Retirer ${own.name} de mon équipe` }));
  fireEvent.click(modal.getByRole('button', { name: 'Classes' }));
  fireEvent.click(modal.getByRole('button', { name: 'Ajouter Éclaireur' }));
  fireEvent.click(modal.getByRole('button', { name: 'C’est prêt' }));
  expect(modal.getByRole('button', { name: 'Lancer le combat' })).toBeEnabled();
  fireEvent.click(modal.getByRole('button', { name: 'Lancer le combat' }));
  expect(container.querySelector('.fight-screen')).toBeInTheDocument();
  expect(container.querySelector('[data-fighter-id="A"]')).toBeInTheDocument();
  expect(JSON.parse(localStorage.getItem(PROFILES_STORAGE)).profiles.find(p => p.id === own.id)).toEqual(JSON.parse(before).profiles[0]);
});

test('a chosen mixed-world team and independent AI choices persist and reach the real referee', () => {
  const room = dungeon(); room.adventure.allowAI = false; seed(room);
  const own = character('Mon Féca', 'FECA');
  localStorage.setItem(PROFILES_STORAGE, JSON.stringify({ version: 1, activeId: own.id, profiles: [own] }));
  const onAutomaticLaunch = jest.fn();
  let view = render(wrap(<PlayScreen allBots={BUILTIN_BOTS} onAutomaticLaunch={onAutomaticLaunch} />));
  let modal = open(view.container);
  fireEvent.click(modal.getByRole('button', { name: 'Modifier mon équipe' }));
  fireEvent.click(modal.getByRole('button', { name: 'Classes' }));
  fireEvent.click(modal.getByRole('button', { name: 'Ajouter Éclaireur' }));
  fireEvent.change(modal.getByLabelText('Contrôle de Éclaireur (1)'), { target: { value: 'ai' } });
  fireEvent.change(modal.getByLabelText('IA de Éclaireur (1)'), { target: { value: 'cortex' } });
  fireEvent.click(modal.getByRole('button', { name: 'C’est prêt' }));
  fireEvent.click(modal.getByRole('button', { name: 'Tout en IA' }));
  expect(JSON.parse(localStorage.getItem(ALLIES_STORAGE)).entries[0]).toMatchObject({ name: 'Éclaireur', controller: 'ai', botId: 'cortex' });
  view.unmount(); view = render(wrap(<PlayScreen allBots={BUILTIN_BOTS} onAutomaticLaunch={onAutomaticLaunch} />));
  modal = open(view.container);
  expect(modal.getByRole('button', { name: 'Tout en IA' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(modal.getByRole('button', { name: 'Lancer le combat' }));
  expect(onAutomaticLaunch).toHaveBeenCalledTimes(1);
  const request = onAutomaticLaunch.mock.calls[0][0];
  expect(request.team).toHaveLength(2); expect(request.team[0].name).toBe('Mon Féca');
  expect(request.team[1]).toMatchObject({ name: 'Éclaireur', controller: 'ai', botId: 'cortex' });
  expect(request.dungeon).toEqual(room);
  const pass = { name: 'Pass', decide: () => ({ type: 'PASS' }) };
  const result = runMatch({ ...request, classes: { A: 'FECA' }, bots: { A: pass, A2: pass }, collectFrames: false });
  expect(result.finalState.fighters.A.name).toBe('Mon Féca');
  expect(result.finalState.fighters.A2.name).toBe('Éclaireur');
  expect(Object.values(result.stats).every(s => !s.errors && !s.invalid)).toBe(true);
});

test('changing worlds never replaces the team or its controls with authored adventure rules', () => {
  const room = dungeon(); room.adventure.allowAI = false; seed(room);
  const { container } = render(wrap(<PlayScreen allBots={BUILTIN_BOTS} onAutomaticLaunch={jest.fn()} />));
  const modal = open(container);
  fireEvent.click(modal.getByRole('button', { name: 'Tout en IA' }));
  fireEvent.change(modal.getByLabelText('Monde'), { target: { value: 'all' } });
  fireEvent.change(modal.getByLabelText('Monde'), { target: { value: 'potter' } });
  expect(modal.getByRole('heading', { name: 'Combat libre' })).toBeInTheDocument();
  expect(modal.getByRole('button', { name: 'Tout en IA' })).toHaveAttribute('aria-pressed', 'true');
  expect(modal.getByRole('group', { name: 'Type de combat' })).toBeInTheDocument();
  expect(modal.getByRole('button', { name: 'Réglages' })).toBeInTheDocument();
  fireEvent.click(modal.getByRole('button', { name: 'Duel Inventez votre rencontre' }));
  fireEvent.click(modal.getByRole('button', { name: 'Donjon Défiez une salle entière' }));
  expect(JSON.parse(localStorage.getItem(SETUP_STORAGE))).toMatchObject({ mode: 'boss', customDungeonId: room.id });
});

test('changing a dungeon map keeps its enemies, uses the free team and leaves the library untouched', () => {
  const room = dungeon(); seed(room);
  const view = render(wrap(<PlayScreen allBots={BUILTIN_BOTS} />));
  const modal = open(view.container), before = localStorage.getItem(CREATIONS_STORAGE);
  fireEvent.click(modal.getByRole('button', { name: 'Changer de carte' }));
  fireEvent.change(modal.getByLabelText('Monde'), { target: { value: 'all' } });
  fireEvent.click(view.container.querySelector('[data-map-id="canyon"]'));
  const settings = JSON.parse(localStorage.getItem(SETUP_STORAGE));
  expect(settings).toMatchObject({ mode: 'duel', mapId: 'canyon', customDungeonId: null });
  const opponents = JSON.parse(localStorage.getItem(OPPONENTS_STORAGE)).entries;
  expect(opponents).toMatchObject([{ kind: 'monster', monsterId: POUTCH_ID, grade: 1 }]);
  expect(localStorage.getItem(CREATIONS_STORAGE)).toBe(before);
  const live = new LiveMatch({ ...settings, opponents, seed: 1 });
  expect(live.state.mapId).toBe('canyon'); expect(live.state.fighters.B.hp).toBe(100);
  fireEvent.click(modal.getByRole('button', { name: 'Lancer le combat' }));
  expect(view.container.querySelector('.fight-screen')).toBeInTheDocument();
});
