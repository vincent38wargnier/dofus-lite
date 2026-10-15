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
import { ADVENTURE_CHOICES_STORAGE } from '../ui/useAdventureChoice';
import PlayScreen from '../ui/PlayScreen';
import WorkshopScreen from '../ui/WorkshopScreen';

const character = (name, classId = 'IOP') => ({ id: name, classId, className: name, name,
  loadout: { ...emptyLoadout(classId), level: 200, base: {}, slots: { weapon: 2416 } } });
const dungeon = () => ({ id: 'ready', name: 'Le passage des brumes', mapId: KANOJEDO_MAP_ID,
  members: [{ monsterId: POUTCH_ID, grade: 1, count: 1 }],
  adventure: addAdventureHero(addAdventureHero(newAdventure(), character('Gardien'), 'h1'), character('Éclaireur', 'CRA'), 'h2') });
const wrap = child => <LoadoutsProvider><CreationsProvider><ProfilesProvider>{child}</ProfilesProvider></CreationsProvider></LoadoutsProvider>;
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

test('ready combat ignores an invalid personal build and does not overwrite it when playing', () => {
  const room = dungeon(); seed(room);
  const own = character('Mon personnage habituel'); own.loadout.slots.weapon = 999999;
  localStorage.setItem(PROFILES_STORAGE, JSON.stringify({ version: 1, activeId: own.id, profiles: [own] }));
  const { container } = render(wrap(<PlayScreen allBots={BUILTIN_BOTS} />));
  const before = localStorage.getItem(PROFILES_STORAGE), modal = open(container);
  expect(modal.getByText('Votre équipe est prête')).toBeInTheDocument();
  expect(modal.queryByRole('button', { name: 'Modifier' })).toBeNull();
  expect(modal.queryByRole('button', { name: 'Réglages' })).toBeNull();
  expect(modal.getByRole('button', { name: 'Lancer le combat' })).toBeEnabled();
  fireEvent.click(modal.getByRole('button', { name: 'Lancer le combat' }));
  expect(container.querySelector('.fight-screen')).toBeInTheDocument();
  expect(within(screen.getByRole('group', { name: 'Placer votre équipe' })).getByRole('button', { name: 'Éclaireur' })).toBeInTheDocument();
  expect(localStorage.getItem(PROFILES_STORAGE)).toBe(before);
});

test('choosing a provided hero persists; AI launch receives only the package team and rules', () => {
  const room = dungeon(); room.adventure.mode = 'choice'; seed(room);
  const onAutomaticLaunch = jest.fn();
  let view = render(wrap(<PlayScreen allBots={BUILTIN_BOTS} onAutomaticLaunch={onAutomaticLaunch} />));
  let modal = open(view.container);
  fireEvent.click(within(modal.getByText('Éclaireur', { selector: 'strong' }).closest('article')).getByRole('button', { name: 'Choisir ce héros' }));
  fireEvent.click(modal.getByRole('button', { name: 'Regarder l’IA' }));
  expect(JSON.parse(localStorage.getItem(ADVENTURE_CHOICES_STORAGE)).ready.heroIds).toEqual(['h2']);
  view.unmount(); view = render(wrap(<PlayScreen allBots={BUILTIN_BOTS} onAutomaticLaunch={onAutomaticLaunch} />));
  modal = open(view.container);
  expect(modal.getByRole('button', { name: 'Regarder l’IA' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(modal.getByRole('button', { name: 'Lancer le combat' }));
  expect(onAutomaticLaunch).toHaveBeenCalledTimes(1);
  const request = onAutomaticLaunch.mock.calls[0][0];
  expect(request.team).toHaveLength(1); expect(request.team[0].name).toBe('Éclaireur');
  expect(request.adventureChoice.heroIds).toEqual(['h2']); expect(request.dungeon).toEqual(room);
});

test('a manual-only adventure hides AI and a free duel restores normal team editing', () => {
  const room = dungeon(); room.adventure.allowAI = false; seed(room);
  const { container } = render(wrap(<PlayScreen allBots={BUILTIN_BOTS} onAutomaticLaunch={jest.fn()} />));
  const modal = open(container);
  expect(modal.queryByRole('button', { name: 'Regarder l’IA' })).toBeNull();
  fireEvent.click(modal.getByRole('button', { name: 'Revenir aux combats libres' }));
  expect(modal.getByRole('group', { name: 'Type de combat' })).toBeInTheDocument();
  expect(modal.getByRole('button', { name: 'Réglages' })).toBeInTheDocument();
});
