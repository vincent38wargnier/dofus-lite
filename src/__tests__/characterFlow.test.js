import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { BUILTIN_BOTS } from '../bots/builtins';
import { emptyLoadout } from '../engine/equipment';
import { LoadoutsProvider } from '../ui/LoadoutsContext';
import { CreationsProvider } from '../ui/CreationsContext';
import { ProfilesProvider } from '../ui/ProfilesContext';
import { PROFILES_STORAGE, makeProfile } from '../ui/profileStore';
import { SETUP_STORAGE } from '../ui/playerSetupState';
import { ALLIES_STORAGE } from '../ui/allyTeamStore';
import { CREATIONS_STORAGE } from '../ui/creationsStore';
import PlayScreen from '../ui/PlayScreen';
import WorkshopScreen from '../ui/WorkshopScreen';

const wrap = node => <LoadoutsProvider><CreationsProvider><ProfilesProvider>{node}</ProfilesProvider></CreationsProvider></LoadoutsProvider>;
const saved = () => JSON.parse(localStorage.getItem(PROFILES_STORAGE));
const allies = () => JSON.parse(localStorage.getItem(ALLIES_STORAGE)).entries;
const launch = props => render(wrap(<PlayScreen allBots={BUILTIN_BOTS} {...props} />));
const open = () => { fireEvent.click(document.querySelector('.setup-play')); return within(screen.getByRole('dialog', { name: 'Choisir un combat' })); };
const done = () => fireEvent.click(screen.getByRole('button', { name: 'C’est prêt' }));
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(CREATIONS_STORAGE, JSON.stringify({ version: 1, characters: [], dungeons: [] }));
  const main = makeProfile('CRA', { name: 'Lina', loadout: { ...emptyLoadout('CRA'), level: 200 } });
  localStorage.setItem(PROFILES_STORAGE, JSON.stringify({ version: 1, profiles: [main], activeId: main.id }));
  localStorage.setItem(SETUP_STORAGE, JSON.stringify({ playerClass: 'CRA', mode: 'boss', bossId: 147, bossGrade: 1, mapId: 'canyon', seed: '53' }));
});

test('customize the leader directly, preserve the fight, and return to the same dungeon', () => {
  const view = launch();
  const before = JSON.parse(localStorage.getItem(SETUP_STORAGE));
  fireEvent.click(open().getByRole('button', { name: 'Personnaliser Lina' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(view.container.querySelector('.setup-editor-heading')).toHaveTextContent('Lina');
  fireEvent.click(screen.getByRole('button', { name: 'Nom, niveau et apparence' }));
  fireEvent.change(screen.getByLabelText('Nom du personnage'), { target: { value: 'Lina feu' } });
  fireEvent.change(within(screen.getByRole('dialog')).getByLabelText('Niveau du personnage'), { target: { value: '150' } });
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Enregistrer' }));
  fireEvent.click(screen.getByRole('tab', { name: 'Sorts' }));
  expect(saved().profiles[0]).toMatchObject({ name: 'Lina feu', classId: 'CRA', loadout: { level: 150 } });
  expect(saved().profiles[0].loadout.spells?.custom).toBeUndefined();
  fireEvent.click(screen.getByRole('button', { name: 'Retour au combat' }));
  expect(screen.getByRole('dialog', { name: 'Choisir un combat' })).toHaveTextContent('Donjon des Bouftous');
  expect(screen.getByRole('button', { name: 'Personnaliser Lina feu' })).toBeInTheDocument();
  const after = JSON.parse(localStorage.getItem(SETUP_STORAGE));
  for (const key of ['mode', 'mapId', 'bossId', 'bossGrade', 'seed']) expect(after[key]).toEqual(before[key]);
});

test('choosing a class from the team saves a new character without replacing the leader; customization survives reload', () => {
  const view = launch();
  const main = saved().profiles[0];
  fireEvent.click(open().getByRole('button', { name: 'Modifier mon équipe' }));
  fireEvent.click(screen.getByRole('button', { name: 'Classes', exact: true }));
  fireEvent.click(screen.getByRole('button', { name: 'Ajouter Iop' }));
  const member = allies()[0];
  expect(saved().activeId).toBe(main.id);
  expect(saved().profiles.find(p => p.id === member.editableProfileId)).toMatchObject({ classId: 'IOP', name: 'Iop' });
  done(); fireEvent.click(screen.getByRole('button', { name: 'Personnaliser Iop' }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Niveau du personnage' }), { target: { value: '180' } });
  expect(allies()[0].loadout.level).toBe(180);
  expect(saved().profiles.find(p => p.id === member.editableProfileId).loadout.level).toBe(180);
  expect(saved().profiles[0]).toEqual(main);
  view.unmount(); launch();
  expect(allies()[0].loadout.level).toBe(180);
  expect(open().getByRole('button', { name: 'Personnaliser Iop' })).toBeInTheDocument();
});

test('creating from the allied catalogue adds the named character to that team and opens its editor', () => {
  const view = launch(), main = saved().activeId;
  fireEvent.click(open().getByRole('button', { name: 'Modifier mon équipe' }));
  fireEvent.click(screen.getByRole('button', { name: 'Créer un personnage' }));
  fireEvent.change(screen.getByLabelText('Nom du personnage'), { target: { value: 'Mon invocateur' } });
  fireEvent.click(screen.getByRole('button', { name: 'Choisir Osamodas' }));
  expect(saved().activeId).toBe(main);
  expect(allies()).toHaveLength(1);
  expect(allies()[0]).toMatchObject({ classId: 'OSAMODAS', name: 'Mon invocateur', controller: 'player' });
  expect(saved().profiles.find(p => p.id === allies()[0].editableProfileId)).toMatchObject({ name: 'Mon invocateur', className: 'Osamodas' });
  expect(view.container.querySelector('.setup-editor-heading')).toHaveTextContent('Mon invocateur');
  fireEvent.click(screen.getByRole('button', { name: 'Retour au combat' }));
  expect(screen.getByRole('button', { name: 'Personnaliser Mon invocateur' })).toBeInTheDocument();
});

test('an existing profile remains an independent combat copy until explicitly saved as a new character', () => {
  const view = launch(), original = saved().profiles[0];
  fireEvent.click(open().getByRole('button', { name: 'Modifier mon équipe' }));
  fireEvent.click(screen.getByRole('button', { name: 'Ajouter Lina' }));
  fireEvent.click(within(view.container.querySelector('[data-ally-index="0"]')).getByRole('button', { name: 'Personnaliser' }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Niveau du personnage' }), { target: { value: '170' } });
  expect(saved().profiles).toEqual([original]);
  fireEvent.click(screen.getByRole('button', { name: 'Garder dans Mes personnages' }));
  expect(saved().profiles).toHaveLength(2);
  const variant = saved().profiles[1];
  expect(variant).toMatchObject({ name: 'Lina (2)', loadout: { level: 170 } });
  expect(allies()[0].editableProfileId).toBe(variant.id);
  expect(saved().activeId).toBe(original.id);
});

test('the existing Atelier list contains saved native characters, and browsing creates no extra class', () => {
  const done = jest.fn();
  render(wrap(<WorkshopScreen allBots={BUILTIN_BOTS} onDone={done} editorRequest={{ id: 'browse', tab: 'characters', browse: true, returnTo: 'play' }} />));
  expect(screen.getByRole('tab', { name: /Mes personnages/ })).toHaveAttribute('aria-selected', 'true');
  expect(JSON.parse(localStorage.getItem(CREATIONS_STORAGE)).characters).toEqual([]);
  fireEvent.click(screen.getByRole('button', { name: 'Personnaliser Lina' }));
  expect(done).toHaveBeenCalledWith('profiles', saved().profiles[0]);
});

test('a new native character from the existing Atelier class picker is saved with its full class, not a ten-spell template', () => {
  const done = jest.fn();
  render(wrap(<WorkshopScreen allBots={BUILTIN_BOTS} onDone={done} editorRequest={{ id: 'browse', tab: 'characters', browse: true, returnTo: 'play' }} />));
  fireEvent.click(screen.getByRole('button', { name: 'Nouveau personnage' }));
  fireEvent.change(screen.getByLabelText('Nom du personnage'), { target: { value: 'Iop du matin' } });
  fireEvent.click(screen.getByRole('button', { name: 'Choisir Iop' }));
  const next = saved().profiles.find(p => p.id === saved().activeId);
  expect(next).toMatchObject({ name: 'Iop du matin', className: 'Iop', classId: 'IOP' });
  expect(next.loadout.spells?.custom).toBeUndefined();
  expect(JSON.parse(localStorage.getItem(CREATIONS_STORAGE)).characters).toEqual([]);
  expect(done).toHaveBeenCalledWith('profiles', next);
});

test('sorting a newly saved ally’s spell bar in combat also persists its reusable character', () => {
  const view = launch();
  fireEvent.click(open().getByRole('button', { name: 'Entraînement Testez vos combos' }));
  fireEvent.click(screen.getByRole('button', { name: 'Modifier mon équipe' }));
  fireEvent.click(screen.getByRole('button', { name: 'Classes', exact: true }));
  fireEvent.click(screen.getByRole('button', { name: 'Ajouter Iop' }));
  const id = allies()[0].editableProfileId;
  fireEvent.click(screen.getByRole('button', { name: 'Retirer Lina de mon équipe' }));
  done(); fireEvent.click(screen.getByRole('button', { name: 'Lancer le combat' }));
  fireEvent.click(screen.getByRole('button', { name: 'Prêt' }));
  fireEvent.click(screen.getByRole('button', { name: 'Trier par type' }));
  const order = [...view.container.querySelectorAll('.spell-slot')].map(e => Number(e.dataset.spellId));
  expect(order.length).toBeGreaterThan(10);
  expect(allies()[0].loadout.spells.order).toEqual(order);
  expect(saved().profiles.find(p => p.id === id).loadout.spells.order).toEqual(order);
});
