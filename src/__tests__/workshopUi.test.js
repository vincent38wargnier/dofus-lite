import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { BUILTIN_BOTS } from '../bots/builtins';
import { emptyLoadout } from '../engine/equipment';
import { CREATION_SPELLS } from '../ui/creationCatalogue';
import { spellBalance } from '../engine/spellBalance';
import { CreationsProvider } from '../ui/CreationsContext';
import { LoadoutsProvider } from '../ui/LoadoutsContext';
import { CREATIONS_STORAGE, emptyCreations } from '../ui/creationsStore';
import WorkshopScreen from '../ui/WorkshopScreen';

const saved = () => JSON.parse(localStorage.getItem(CREATIONS_STORAGE));
const modestSpells = CREATION_SPELLS.filter(entry => spellBalance(entry.grades.at(-1)).score <= 40).slice(0, 11);
const app = (onLaunch, onTestDungeon) => <LoadoutsProvider><CreationsProvider><WorkshopScreen allBots={BUILTIN_BOTS} onLaunch={onLaunch} onTestDungeon={onTestDungeon} /></CreationsProvider></LoadoutsProvider>;
const section = name => fireEvent.click(within(screen.getByRole('navigation', { name: 'Rubriques de la classe' })).getByRole('button', { name, exact: true }));
const openTest = () => fireEvent.click(screen.getByRole('button', { name: 'Tester', exact: true }));
const closeDialog = () => fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Fermer', exact: true }));
const transfer = () => {
  const values = {};
  return { get types() { return Object.keys(values); }, setData: (type, value) => { values[type] = value; },
    getData: type => values[type] || '', setDragImage() {} };
};
beforeEach(() => localStorage.clear());
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function() { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function() { this.removeAttribute('open'); };
});

test.each([false, true])('Tester forwards the current dungeon to the shared combat menu without a second test dialog (draft: %s)', draft => {
  const dungeon = { id: 'test-room', name: 'Salle à tester', mapId: 'dungeon_2083', members: draft ? [] : [{ monsterId: 494, grade: 1, count: 2 }] };
  localStorage.setItem(CREATIONS_STORAGE, JSON.stringify({ ...emptyCreations(), dungeons: [dungeon] }));
  const launch = jest.fn(), prepare = jest.fn();
  render(app(launch, prepare));
  fireEvent.change(screen.getByRole('textbox', { name: 'Nom du donjon' }), { target: { value: 'Dernière version de ma salle' } });
  openTest();
  expect(prepare).toHaveBeenCalledWith(saved().dungeons[0]);
  expect(prepare.mock.calls[0][0]).not.toBe(dungeon);
  expect(launch).not.toHaveBeenCalled();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Votre personnage')).not.toBeInTheDocument();
});

test('name a new class, select ten spells, replace one, and keep the chosen name and spells after reload', () => {
  const onLaunch = jest.fn();
  const view = render(app(onLaunch));
  fireEvent.click(screen.getByRole('tab', { name: /Mes personnages/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Nouvelle classe' }));
  expect(saved().characters[0].loadout.spells.custom).toEqual([]);
  fireEvent.change(screen.getByRole('textbox', { name: 'Nom de la classe' }), { target: { value: '   ' } });
  openTest();
  expect(screen.getByRole('button', { name: 'Jouer cette création' })).toBeDisabled();
  closeDialog();
  fireEvent.change(screen.getByRole('textbox', { name: 'Nom de la classe' }), { target: { value: 'Gardien des flammes' } });
  section('Apparence');
  fireEvent.click(screen.getByRole('button', { name: 'Forme Gardien' }));
  fireEvent.click(screen.getByRole('button', { name: 'Couleur Corail' }));
  expect(saved().characters[0].loadout.artworkId).toBe('shape-v1-warden-d87558');
  section('Sorts');
  fireEvent.click(screen.getByRole('button', { name: /Ajouter un sort du catalogue/ }));
  const results = within(view.container.querySelector('[aria-label="Résultats du catalogue de sorts"]'));
  const find = entry => { fireEvent.change(screen.getByRole('searchbox', { name: 'Rechercher dans tous les sorts' }), { target: { value: entry.name } }); return results.getByRole('button', { name: `Ajouter ${entry.name} (${entry.id})` }); };
  for (const entry of modestSpells.slice(0, 10)) fireEvent.click(find(entry));
  expect(saved().characters[0].loadout.spells.custom).toHaveLength(10);
  expect(find(modestSpells[10])).toBeDisabled();
  fireEvent.click(find(modestSpells[10]));
  expect(saved().characters[0].loadout.spells.custom).toHaveLength(10);
  const before = saved().characters[0];
  fireEvent.click(screen.getByRole('button', { name: `Retirer ${before.loadout.spells.custom[0].name}` }));
  expect(find(modestSpells[10])).toBeEnabled();
  fireEvent.click(find(modestSpells[10]));
  section('Caractéristiques');
  fireEvent.change(screen.getByRole('combobox', { name: 'Classe de référence' }), { target: { value: 'CRA' } });
  const character = saved().characters[0];
  expect(character.name).toBe('Gardien des flammes');
  expect(character.classId).toBe('CRA');
  expect(character.loadout.spells.custom).toHaveLength(10);
  openTest();
  fireEvent.click(screen.getByRole('button', { name: 'Jouer cette création' }));
  expect(onLaunch).toHaveBeenCalledWith(expect.objectContaining({ character, automatic: false }));
  view.unmount();
  render(app(onLaunch));
  fireEvent.click(screen.getByRole('tab', { name: /Mes personnages/ }));
  expect(screen.getByRole('textbox', { name: 'Nom de la classe' })).toHaveValue(character.name);
  section('Apparence');
  expect(screen.getByRole('button', { name: 'Forme Gardien' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'Couleur Corail' })).toHaveAttribute('aria-pressed', 'true');
  expect(saved().characters[0]).toEqual(character);
});

test('an older oversized class can remove spells and save without losing the rest of the library', () => {
  const value = { ...emptyCreations(), characters: [{ id: 'old', name: 'Ancienne classe', classId: 'IOP',
    loadout: { ...emptyLoadout('IOP'), level: 200, spells: { custom: modestSpells.map(entry => entry.grades.at(-1)) } } }] };
  localStorage.setItem(CREATIONS_STORAGE, JSON.stringify(value));
  render(app(jest.fn()));
  fireEvent.click(screen.getByRole('tab', { name: /Mes personnages/ }));
  expect(screen.getByText(/Cette ancienne création contient/)).toHaveTextContent('11 sorts');
  openTest();
  expect(screen.getByRole('button', { name: 'Jouer cette création' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Tester avec l’IA' })).toBeDisabled();
  closeDialog();
  fireEvent.click(screen.getByRole('button', { name: `Retirer ${value.characters[0].loadout.spells.custom[0].name}` }));
  openTest();
  expect(saved().characters[0].loadout.spells.custom).toHaveLength(10);
  expect(screen.getByRole('button', { name: 'Jouer cette création' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Tester avec l’IA' })).toBeEnabled();
});

test('drag monsters from different dungeons, keep their grades and duplicates, reject bad drops and a ninth monster', () => {
  const view = render(app(jest.fn()));
  fireEvent.click(screen.getByRole('button', { name: 'Nouveau donjon' }));
  fireEvent.click(screen.getByText('Choisir dans les cartes du jeu'));
  fireEvent.click(view.container.querySelector('[data-map-id="dungeon_2083"]'));
  fireEvent.click(screen.getByRole('button', { name: /Bestiaire du jeu/ }));
  const target = screen.getByRole('region', { name: 'Groupe du donjon' });
  const drag = (id, drop = true) => {
    const item = view.container.querySelector(`.creator-monster-card[data-monster-id="${id}"]`);
    const dataTransfer = transfer();
    fireEvent.dragStart(item, { dataTransfer });
    if (drop) { fireEvent.dragOver(target, { dataTransfer }); fireEvent.drop(target, { dataTransfer }); }
    fireEvent.dragEnd(item, { dataTransfer });
  };
  fireEvent.change(view.container.querySelector('[aria-label="Niveau proposé pour Poutch Ingball"]'), { target: { value: '1' } });
  drag(494);
  drag(147);
  drag(494);
  expect(saved().dungeons[0]).toMatchObject({ mapId: 'dungeon_2083', members: [
    { monsterId: 494, grade: 1, count: 2 }, { monsterId: 147, count: 1 },
  ] });
  expect(target).not.toHaveClass('accepting', 'drop-over');
  const original = saved();
  drag(494, false);
  for (const data of ['{bad', JSON.stringify({ monsterId: 999999, grade: 1 })]) {
    const dataTransfer = transfer(); dataTransfer.setData('application/x-dofus-dungeon-monster', data);
    fireEvent.drop(target, { dataTransfer });
  }
  fireEvent.drop(target, { dataTransfer: transfer() });
  expect(saved()).toEqual(original);
  for (let n = 0; n < 5; n++) drag(494);
  expect(saved().dungeons[0].members[0].count).toBe(7);
  expect(screen.getByRole('button', { name: 'Ajouter Poutch Ingball' })).toBeDisabled();
  const payload = transfer(); payload.setData('application/x-dofus-dungeon-monster', JSON.stringify({ monsterId: 494, grade: 1 }));
  fireEvent.drop(target, { dataTransfer: payload });
  expect(saved().dungeons[0].members[0].count).toBe(7);
  const complete = saved();
  view.unmount();
  render(app(jest.fn()));
  expect(saved()).toEqual(complete);
  fireEvent.click(screen.getByRole('button', { name: 'Changer de carte' }));
  fireEvent.click(screen.getByText('Choisir dans les cartes du jeu'));
  expect(document.querySelector('[data-map-id="dungeon_2083"]')).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: /2. Créatures/ }));
  expect(screen.getByRole('region', { name: 'Groupe du donjon' })).toHaveTextContent('8 / 8');
});
