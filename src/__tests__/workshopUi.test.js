import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { BUILTIN_BOTS } from '../bots/builtins';
import { emptyLoadout } from '../engine/equipment';
import { CREATION_SPELLS } from '../ui/creationCatalogue';
import { CreationsProvider } from '../ui/CreationsContext';
import { LoadoutsProvider } from '../ui/LoadoutsContext';
import { CREATIONS_STORAGE, emptyCreations } from '../ui/creationsStore';
import WorkshopScreen from '../ui/WorkshopScreen';

const saved = () => JSON.parse(localStorage.getItem(CREATIONS_STORAGE));
const app = onLaunch => <LoadoutsProvider><CreationsProvider><WorkshopScreen allBots={BUILTIN_BOTS} onLaunch={onLaunch} /></CreationsProvider></LoadoutsProvider>;
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

test('name a new class, select ten spells, replace one, and keep the chosen name and spells after reload', () => {
  const onLaunch = jest.fn();
  const view = render(app(onLaunch));
  fireEvent.click(screen.getByRole('tab', { name: /Mes classes/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Nouvelle classe' }));
  expect(saved().characters[0].loadout.spells.custom).toEqual([]);
  fireEvent.change(screen.getByLabelText('Nom de la classe'), { target: { value: '   ' } });
  expect(screen.getByRole('button', { name: 'Jouer cette création' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Nom de la classe'), { target: { value: 'Gardien des flammes' } });
  const results = within(screen.getByLabelText('Résultats du catalogue de sorts'));
  const buttons = results.getAllByRole('button', { name: /^Ajouter / });
  for (const button of buttons.slice(0, 10)) fireEvent.click(button);
  expect(saved().characters[0].loadout.spells.custom).toHaveLength(10);
  expect(buttons[10]).toBeDisabled();
  fireEvent.click(buttons[10]);
  expect(saved().characters[0].loadout.spells.custom).toHaveLength(10);
  const before = saved().characters[0];
  fireEvent.click(screen.getByRole('button', { name: `Retirer ${before.loadout.spells.custom[0].name}` }));
  expect(buttons[10]).toBeEnabled();
  fireEvent.click(buttons[10]);
  fireEvent.change(screen.getByLabelText('Modèle du personnage'), { target: { value: 'CRA' } });
  const character = saved().characters[0];
  expect(character.name).toBe('Gardien des flammes');
  expect(character.classId).toBe('CRA');
  expect(character.loadout.spells.custom).toHaveLength(10);
  fireEvent.click(screen.getByRole('button', { name: 'Jouer cette création' }));
  expect(onLaunch).toHaveBeenCalledWith(expect.objectContaining({ character, automatic: false }));
  view.unmount();
  render(app(onLaunch));
  fireEvent.click(screen.getByRole('tab', { name: /Mes classes/ }));
  expect(screen.getByLabelText('Nom de la classe')).toHaveValue(character.name);
  expect(saved().characters[0]).toEqual(character);
});

test('an older oversized class can remove spells and save without losing the rest of the library', () => {
  const value = { ...emptyCreations(), characters: [{ id: 'old', name: 'Ancienne classe', classId: 'IOP',
    loadout: { ...emptyLoadout('IOP'), level: 200, spells: { custom: CREATION_SPELLS.slice(0, 11).map(entry => entry.grades.at(-1)) } } }] };
  localStorage.setItem(CREATIONS_STORAGE, JSON.stringify(value));
  render(app(jest.fn()));
  fireEvent.click(screen.getByRole('tab', { name: /Mes classes/ }));
  expect(screen.getByText(/Cette ancienne création contient/)).toHaveTextContent('11 sorts');
  expect(screen.getByRole('button', { name: 'Jouer cette création' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Tester avec l’IA' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: `Retirer ${value.characters[0].loadout.spells.custom[0].name}` }));
  expect(saved().characters[0].loadout.spells.custom).toHaveLength(10);
  expect(screen.getByRole('button', { name: 'Jouer cette création' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Tester avec l’IA' })).toBeEnabled();
});

test('drag monsters from different dungeons, keep their grades and duplicates, reject bad drops and a ninth monster', () => {
  const view = render(app(jest.fn()));
  fireEvent.click(screen.getByRole('button', { name: 'Nouveau donjon' }));
  fireEvent.change(screen.getByLabelText('Carte de combat'), { target: { value: 'dungeon_2083' } });
  const target = screen.getByRole('region', { name: 'Groupe du donjon' });
  const drag = (id, drop = true) => {
    const item = view.container.querySelector(`.creator-monster-card[data-monster-id="${id}"]`);
    const dataTransfer = transfer();
    fireEvent.dragStart(item, { dataTransfer });
    if (drop) { fireEvent.dragOver(target, { dataTransfer }); fireEvent.drop(target, { dataTransfer }); }
    fireEvent.dragEnd(item, { dataTransfer });
  };
  fireEvent.change(screen.getByLabelText('Niveau proposé pour Poutch Ingball'), { target: { value: '1' } });
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
  expect(screen.getByLabelText('Carte de combat')).toHaveValue('dungeon_2083');
  expect(screen.getByRole('region', { name: 'Groupe du donjon' })).toHaveTextContent('8 / 8');
});
