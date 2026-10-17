import React from 'react';
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { LoadoutsProvider } from '../ui/LoadoutsContext';
import { ProfilesProvider } from '../ui/ProfilesContext';
import { CreationsProvider } from '../ui/CreationsContext';
import { PROFILES_STORAGE } from '../ui/profileStore';
import { CREATIONS_STORAGE } from '../ui/creationsStore';
import { emptyLoadout } from '../engine/equipment';
import { BUILTIN_BOTS } from '../bots/builtins';
import * as runner from '../arena/runner';
import PlayScreen from '../ui/PlayScreen';
import ArenaScreen from '../ui/ArenaScreen';
import WorkshopScreen from '../ui/WorkshopScreen';

const rooms = [{ id: 'room', name: 'Mon entraînement', mapId: 'dungeon_2083', members: [{ monsterId: 494, grade: 1, count: 2 }] },
  { id: 'draft', name: 'Salle à terminer', mapId: 'arene', members: [] }];
const wrap = node => <LoadoutsProvider><CreationsProvider><ProfilesProvider>{node}</ProfilesProvider></CreationsProvider></LoadoutsProvider>;
const value = () => JSON.parse(localStorage.getItem(PROFILES_STORAGE));
const current = () => value().profiles.find(entry => entry.id === value().activeId);
beforeAll(() => {
  Object.defineProperty(window, 'crypto', { configurable: true, value: { getRandomValues: values => { values[0] = 12345; return values; } } });
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
});
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('dofus-lite-loadouts-v1', JSON.stringify({ 'A:IOP': { ...emptyLoadout('IOP'), level: 200, base: {}, slots: { weapon: 2416 } } }));
  localStorage.setItem(CREATIONS_STORAGE, JSON.stringify({ version: 1, characters: [], dungeons: rooms }));
});
afterEach(() => jest.restoreAllMocks());

test('equipment, characteristics and spells have independent direct access and persist the same character', () => {
  const view = render(wrap(<PlayScreen allBots={BUILTIN_BOTS} />));
  const nav = within(screen.getByRole('tablist', { name: 'Préparer mon personnage' }));
  expect(nav.getAllByRole('tab').map(tab => tab.textContent)).toHaveLength(4);
  expect(nav.getByRole('tab', { name: 'Équipement' })).toHaveAttribute('aria-selected', 'true');
  fireEvent.click(nav.getByRole('tab', { name: 'Équipement' }));
  expect(screen.getByRole('tab', { name: 'Inventaire' })).toHaveAttribute('aria-selected', 'true');
  fireEvent.click(screen.getByRole('tab', { name: 'Forgemagie' }));
  expect(screen.getByRole('region', { name: 'Atelier de forgemagie' })).toBeVisible();
  expect(nav.getByRole('tab', { name: 'Équipement' })).toHaveAttribute('aria-selected', 'true');
  fireEvent.click(nav.getByRole('tab', { name: 'Caractéristiques' }));
  expect(screen.queryByRole('region', { name: 'Atelier de forgemagie' })).toBeNull();
  expect(screen.queryByRole('combobox', { name: 'Qualité des jets' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Enregistrer ce stuff' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Augmenter Force' }));
  const allocation = current().loadout.base.force;
  expect(allocation).toBe(1);
  fireEvent.click(nav.getByRole('tab', { name: 'Sorts' }));
  expect(screen.queryByRole('button', { name: 'Augmenter Force' })).toBeNull();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Apprendre Flamiche' }));
  expect(current().loadout.spells.common).toContain(350);
  const stored = current();
  view.unmount();
  render(wrap(<PlayScreen allBots={BUILTIN_BOTS} />));
  expect(current()).toEqual(stored);
  fireEvent.click(screen.getByRole('tab', { name: 'Caractéristiques' }));
  expect(screen.getByRole('spinbutton', { name: 'Force de base' })).toHaveValue(allocation);
  fireEvent.click(screen.getByRole('tab', { name: 'Sorts' }));
  expect(screen.getByRole('checkbox', { name: 'Apprendre Flamiche' })).toBeChecked();
});

test('Combat is inline, preserves keyboard navigation and shares saved choices with the Jouer dialog', () => {
  const { container } = render(wrap(<PlayScreen allBots={BUILTIN_BOTS} />));
  const tab = screen.getByRole('tab', { name: 'Équipement' });
  tab.focus(); fireEvent.keyDown(tab, { key: 'End' });
  const combatTab = screen.getByRole('tab', { name: 'Combat' });
  expect(combatTab).toHaveFocus();
  expect(combatTab).toHaveAttribute('aria-selected', 'true');
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.body.style.overflow).toBe('');
  const combat = within(screen.getByRole('region', { name: 'Choisir un combat' }));
  fireEvent.click(combat.getByRole('button', { name: 'Entraînement Testez vos combos' }));
  fireEvent.change(combat.getByLabelText('Niveau du Poutch'), { target: { value: '2' } });
  fireEvent.click(container.querySelector('.setup-play'));
  expect(screen.queryByRole('region', { name: 'Choisir un combat' })).toBeNull();
  const dialog = within(screen.getByRole('dialog', { name: 'Choisir un combat' }));
  expect(dialog.getByLabelText('Niveau du Poutch')).toHaveValue('2');
  fireEvent.change(dialog.getByLabelText('Niveau du Poutch'), { target: { value: '3' } });
  fireEvent.click(dialog.getByRole('button', { name: 'Fermer le choix du combat' }));
  const inline = within(screen.getByRole('region', { name: 'Choisir un combat' }));
  expect(inline.getByLabelText('Niveau du Poutch')).toHaveValue('3');
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.body.style.overflow).toBe('');
  fireEvent.click(inline.getByRole('button', { name: 'Lancer le combat' }));
  expect(container.querySelector('.fight-heading')).toHaveTextContent('Kanojedo');
});

test('switching preparation tabs leaves a custom equipment draft intact', () => {
  render(wrap(<PlayScreen allBots={BUILTIN_BOTS} />));
  fireEvent.click(screen.getByRole('tab', { name: 'Équipement' }));
  fireEvent.click(screen.getByRole('button', { name: /Créer un équipement/ }));
  fireEvent.change(screen.getByLabelText('Nom de l’équipement'), { target: { value: 'Coiffe en préparation' } });
  fireEvent.click(screen.getByRole('tab', { name: 'Caractéristiques' }));
  expect(screen.queryByRole('region', { name: 'Créateur d’équipements' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Augmenter Force' })).toBeVisible();
  fireEvent.click(screen.getByRole('tab', { name: 'Sorts' }));
  expect(screen.getByRole('heading', { name: 'Grimoire' })).toBeVisible();
  fireEvent.click(screen.getByRole('tab', { name: 'Équipement' }));
  expect(screen.getByLabelText('Nom de l’équipement')).toHaveValue('Coiffe en préparation');
  fireEvent.click(screen.getByRole('button', { name: /Retour au stuff/ }));
  expect(screen.getByRole('tab', { name: 'Inventaire' })).toHaveAttribute('aria-selected', 'true');
});

test('rename, duplicate, delete and undo profiles without losing the first character', () => {
  render(wrap(<PlayScreen allBots={BUILTIN_BOTS} />));
  const original = current();
  fireEvent.click(screen.getByRole('button', { name: 'Modifier le personnage' }));
  fireEvent.change(screen.getByLabelText('Nom du personnage'), { target: { value: ' Iop feu ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Enregistrer', exact: true }));
  expect(current().name).toBe('Iop feu');
  fireEvent.click(screen.getByRole('button', { name: 'Dupliquer' }));
  const copy = current();
  expect(copy.id).not.toBe(original.id); expect(copy.loadout).toEqual(original.loadout);
  fireEvent.click(screen.getByRole('button', { name: `Supprimer le personnage ${copy.name}` }));
  expect(value().profiles).toHaveLength(1);
  expect(current().id).toBe(original.id);
  fireEvent.click(screen.getByRole('button', { name: 'Annuler', exact: true }));
  expect(current()).toEqual(copy);
});

test('shared dungeon filters show custom and Dofus rooms, validate drafts and use the selected room map', () => {
  const onOpenCreator = jest.fn();
  const { container } = render(wrap(<PlayScreen allBots={BUILTIN_BOTS} onOpenCreator={onOpenCreator} />));
  fireEvent.click(screen.getByRole('tab', { name: /Combat/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Donjon Défiez une salle entière' }));
  fireEvent.click(screen.getByRole('button', { name: 'Choisir un donjon' }));
  const filters = within(screen.getByRole('group', { name: 'Origine des donjons' }));
  fireEvent.click(filters.getByRole('button', { name: 'Personnalisés' }));
  expect(container.querySelectorAll('[data-boss-id]')).toHaveLength(0);
  expect(container.querySelectorAll('[data-dungeon-id]')).toHaveLength(2);
  fireEvent.click(container.querySelector('[data-dungeon-id="draft"]'));
  expect(screen.getByRole('alert')).toHaveTextContent('terminez votre donjon');
  fireEvent.click(container.querySelector('[data-dungeon-id="room"]'));
  expect(filters.getByRole('button', { name: 'Personnalisés' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  fireEvent.click(filters.getByRole('button', { name: 'Dofus', exact: true }));
  expect(container.querySelectorAll('[data-dungeon-id]')).toHaveLength(0);
  expect(container.querySelectorAll('[data-boss-id]').length).toBeGreaterThan(50);
  fireEvent.click(screen.getByRole('button', { name: 'C’est prêt' }));
  expect(container.querySelector('.combat-choice-launch')).toBeEnabled();
  fireEvent.click(container.querySelector('.combat-choice-launch'));
  expect(container.querySelector('.fight-heading')).toHaveTextContent('Donjon des Bouftous');
  expect(container.querySelectorAll('.token.side-B')).toHaveLength(2);
});

test('a creator navigation request makes one draft and returns the completed room', () => {
  const onDone = jest.fn();
  const request = { id: 'request', tab: 'dungeons', returnTo: 'play' };
  const view = render(wrap(<WorkshopScreen allBots={BUILTIN_BOTS} editorRequest={request} onDone={onDone} />));
  expect(JSON.parse(localStorage.getItem(CREATIONS_STORAGE)).dungeons).toHaveLength(3);
  view.rerender(wrap(<WorkshopScreen allBots={BUILTIN_BOTS} editorRequest={{ ...request }} onDone={onDone} />));
  expect(JSON.parse(localStorage.getItem(CREATIONS_STORAGE)).dungeons).toHaveLength(3);
  expect(screen.getByRole('button', { name: 'Choisir ce donjon' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Nom du donjon'), { target: { value: 'Ma nouvelle salle' } });
  fireEvent.click(screen.getByRole('button', { name: /2\. Créatures/ }));
  fireEvent.click(screen.getByRole('button', { name: /Bestiaire du jeu/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Ajouter Poutch Ingball' }));
  fireEvent.click(screen.getByRole('button', { name: 'Choisir ce donjon' }));
  expect(onDone).toHaveBeenCalledWith('dungeons', expect.objectContaining({ name: 'Ma nouvelle salle', members: [{ monsterId: 494, grade: 5, count: 1 }] }));
});

test('Arena copies one saved profile to both camps and simulations never edit the saved profile', async () => {
  const simulate = jest.spyOn(runner, 'runMatchAsync').mockImplementation(() => new Promise(() => {}));
  const { container } = render(wrap(<ArenaScreen allBots={BUILTIN_BOTS} />));
  const original = current();
  fireEvent.change(screen.getByLabelText('Profil B'), { target: { value: original.id } });
  fireEvent.click(within(screen.getByRole('region', { name: 'Personnage B' })).getByText('Ajuster pour ce combat', { selector: 'summary' }));
  fireEvent.change(screen.getByLabelText('Niveau B'), { target: { value: '100' } });
  await act(async () => fireEvent.click(screen.getByRole('button', { name: /Lancer le combat/ })));
  expect(simulate.mock.calls[0][0]).toMatchObject({ classes: { A: 'IOP', B: 'IOP' }, loadouts: { A: { level: 200 }, B: { level: 100 } } });
  expect(current()).toEqual(original);
  expect(container.querySelector('.arena-setup')).toHaveAttribute('aria-busy', 'true');
});

test('profile write failure is visible and the previous save stays intact', () => {
  render(wrap(<PlayScreen allBots={BUILTIN_BOTS} />));
  const before = localStorage.getItem(PROFILES_STORAGE);
  const originalSet = Storage.prototype.setItem;
  jest.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, val) {
    if (key === PROFILES_STORAGE) throw new DOMException('Full', 'QuotaExceededError');
    return originalSet.call(this, key, val);
  });
  fireEvent.click(screen.getByRole('button', { name: 'Dupliquer' }));
  expect(screen.getByText(/Profil non sauvegardé/)).toBeInTheDocument();
  expect(localStorage.getItem(PROFILES_STORAGE)).toBe(before);
});

test('sidebar arrows cycle through profiles without changing tabs or mixing their equipment and spells', () => {
  const second = { id: 'archer', name: 'Crâ éclaireur', classId: 'CRA', className: 'Crâ', loadout: { ...emptyLoadout('CRA'), level: 150, spells: { common: [350], order: [350, 161] } } };
  const first = { id: 'warrior', name: 'Iop terre', classId: 'IOP', className: 'Iop', loadout: { ...emptyLoadout('IOP'), level: 200, slots: { weapon: 2416 }, base: { force: 100 } } };
  localStorage.setItem(PROFILES_STORAGE, JSON.stringify({ version: 1, activeId: first.id, profiles: [first, second] }));
  const view = render(wrap(<PlayScreen allBots={BUILTIN_BOTS} />));
  expect(screen.queryByRole('tab', { name: 'Personnages' })).toBeNull();
  fireEvent.click(screen.getByRole('tab', { name: 'Sorts' }));
  fireEvent.click(screen.getByRole('button', { name: 'Personnage suivant' }));
  expect(current()).toEqual(second);
  expect(screen.getByRole('tab', { name: 'Sorts' })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('checkbox', { name: 'Apprendre Flamiche' })).toBeChecked();
  expect(screen.getByLabelText('Personnage sélectionné')).toHaveTextContent('2 / 2');
  fireEvent.click(screen.getByRole('button', { name: 'Personnage suivant' }));
  expect(current()).toEqual(first);
  expect(screen.getByRole('checkbox', { name: 'Apprendre Flamiche' })).not.toBeChecked();
  fireEvent.click(screen.getByRole('button', { name: 'Personnage précédent' }));
  expect(current()).toEqual(second);
  view.unmount(); render(wrap(<PlayScreen allBots={BUILTIN_BOTS} />));
  expect(current()).toEqual(second);
  expect(value().profiles).toEqual([first, second]);
});

test('sidebar plus opens a cancellable class picker and creates a profile; settings save name, level and appearance together', () => {
  const openCreator = jest.fn();
  render(wrap(<PlayScreen allBots={BUILTIN_BOTS} onOpenCreator={openCreator} />));
  const original = current();
  const plus = screen.getByRole('button', { name: 'Nouveau personnage' }); plus.focus();
  fireEvent.click(plus);
  expect(screen.getByRole('dialog', { name: 'Nouveau personnage' })).toBeInTheDocument();
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  expect(plus).toHaveFocus(); expect(value().profiles).toHaveLength(1);
  fireEvent.click(plus); fireEvent.click(screen.getByRole('button', { name: 'Choisir Cra' }));
  expect(current().classId).toBe('CRA'); expect(value().profiles).toHaveLength(2);
  expect(screen.queryByRole('dialog')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Modifier le personnage' }));
  const settings = within(screen.getByRole('dialog', { name: 'Modifier le personnage' }));
  fireEvent.change(settings.getByLabelText('Nom du personnage'), { target: { value: 'Crâ feu' } });
  fireEvent.change(settings.getByLabelText('Niveau du personnage'), { target: { value: '150' } });
  fireEvent.change(settings.getByLabelText('Apparence du joueur'), { target: { value: '1' } });
  fireEvent.click(settings.getByRole('button', { name: 'Enregistrer' }));
  expect(current()).toMatchObject({ name: 'Crâ feu', loadout: { level: 150, profile: { sex: 1 } } });
  expect(value().profiles.find(p => p.id === original.id)).toEqual(original);
  fireEvent.click(screen.getByRole('button', { name: 'Modifier le personnage' }));
  fireEvent.change(within(screen.getByRole('dialog')).getByLabelText('Nom du personnage'), { target: { value: 'Annulé' } });
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Annuler' }));
  expect(current().name).toBe('Crâ feu');
  fireEvent.click(plus); fireEvent.click(screen.getByRole('button', { name: 'Inventer une classe' }));
  expect(openCreator).toHaveBeenCalledWith('characters'); expect(screen.queryByRole('dialog')).toBeNull();
});

test('single-profile arrows and delete are disabled; undo restores the full removed preparation', () => {
  render(wrap(<PlayScreen allBots={BUILTIN_BOTS} />));
  const original = current();
  expect(screen.getByRole('button', { name: 'Personnage précédent' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Personnage suivant' })).toBeDisabled();
  expect(screen.getByRole('button', { name: `Supprimer le personnage ${original.name}` })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Dupliquer' }));
  const copy = current();
  fireEvent.click(screen.getByRole('button', { name: `Supprimer le personnage ${copy.name}` }));
  expect(current()).toEqual(original);
  expect(screen.getByRole('button', { name: 'Personnage suivant' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Annuler', exact: true }));
  expect(current()).toEqual(copy); expect(value().profiles).toEqual([original, copy]);
});
