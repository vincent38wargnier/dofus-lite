import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import DuelComposer from '../ui/DuelComposer';
import { WorldsProvider } from '../ui/WorldsContext';
import { CreationsProvider } from '../ui/CreationsContext';
import { CREATIONS_STORAGE } from '../ui/creationsStore';
import { newWorkshopCreature } from '../ui/workshopStarters';
import { buildWorldCatalogue } from '../ui/worldCatalogue';
import { DUNGEONS } from '../engine/dungeons';

const nativeRoom = DUNGEONS.find(room => room.bossIds.includes(147));
const sentinel = { ...newWorkshopCreature(), name: 'Sentinelle du jardin' };
const rooms = [
  { id: 'garden', name: 'Le jardin', mapId: 'arene', members: [{ customMonster: sentinel, count: 1 }] },
  { id: 'tower', name: 'La tour', mapId: 'arene', members: [{ customMonster: { ...sentinel, name: 'Gardien de la tour' }, count: 1 }] },
];
const libraries = [
  { id: 'native-world', name: 'Dofus', release: '1.0.0', catalogue: {
    classData: { names: { IOP: 'Iop' } }, monsterData: { monsters: { 147: { grades: {} } } },
    dungeonData: { encounters: [nativeRoom] },
  } },
  { id: 'garden-world', name: 'Jardin magique', release: '1.0.0', imported: { dungeons: rooms.map(room => room.id) } },
];
const show = (props = {}, initialWorldId) => render(<CreationsProvider><WorldsProvider libraries={libraries} initialWorldId={initialWorldId}>
  <DuelComposer hideTerrain opponents={[{ kind: 'monster', monsterId: 147, grade: 1 }]} allBots={[]} onChange={jest.fn()} {...props} />
</WorldsProvider></CreationsProvider>);
const filters = () => within(screen.getByRole('group', { name: 'Filtres du catalogue' }));
const monsterTab = () => fireEvent.click(screen.getByRole('button', { name: 'Monstres', exact: true }));

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(CREATIONS_STORAGE, JSON.stringify({ version: 1, characters: [], dungeons: rooms }));
});

test.each([false, true])('world and dungeon filters narrow the catalogue without replacing the team (allied: %s)', allied => {
  const onChange = jest.fn();
  show({ allied, onChange }, 'native-world'); monsterTab();
  const world = filters().getByRole('combobox', { name: 'Monde' });
  const dungeon = filters().getByRole('combobox', { name: 'Donjon d’origine' });
  expect(world).toHaveValue('native-world');
  expect(screen.getByRole('button', { name: 'Ajouter Bouftou Royal' })).toBeInTheDocument();
  expect(within(dungeon).getByRole('option', { name: nativeRoom.name })).toBeInTheDocument();
  expect(within(dungeon).queryByRole('option', { name: 'Le jardin' })).not.toBeInTheDocument();
  fireEvent.change(dungeon, { target: { value: nativeRoom.id } });
  fireEvent.change(world, { target: { value: 'garden-world' } });
  expect(dungeon).toHaveValue('');
  expect(screen.queryByRole('button', { name: 'Ajouter Bouftou Royal' })).not.toBeInTheDocument();
  expect(within(dungeon).queryByRole('option', { name: nativeRoom.name })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Ajouter Sentinelle du jardin' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Ajouter Gardien de la tour' })).toBeInTheDocument();
  fireEvent.change(dungeon, { target: { value: 'custom-dungeon:garden' } });
  expect(screen.queryByRole('button', { name: 'Ajouter Gardien de la tour' })).not.toBeInTheDocument();
  fireEvent.change(world, { target: { value: 'all' } });
  expect(dungeon).toHaveValue('');
  expect(screen.getByRole('button', { name: 'Ajouter Bouftou Royal' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Ajouter Gardien de la tour' })).toBeInTheDocument();
  expect(screen.getByRole('region', { name: allied ? 'Mon équipe' : 'Camp adverse' })).toHaveTextContent('Bouftou Royal');
  expect(onChange).not.toHaveBeenCalled();
});

test('catalogue world selection is shared by tabs and restored on reopening', () => {
  const view = show({}, 'native-world'); monsterTab();
  fireEvent.change(filters().getByLabelText('Monde'), { target: { value: 'garden-world' } });
  fireEvent.click(screen.getByRole('button', { name: 'Classes', exact: true }));
  expect(filters().getByLabelText('Monde')).toHaveValue('garden-world');
  expect(screen.queryByRole('button', { name: 'Ajouter Iop' })).not.toBeInTheDocument();
  view.unmount(); show(); monsterTab();
  expect(filters().getByLabelText('Monde')).toHaveValue('garden-world');
  expect(screen.getByRole('button', { name: 'Ajouter Sentinelle du jardin' })).toBeInTheDocument();
});

test('a shared creature retains every dungeon origin without duplicating its card or crossing world filters', () => {
  const second = { ...rooms[0], id: 'other-garden', name: 'Autre jardin' };
  const catalogue = buildWorldCatalogue([...libraries, { id: 'second-world', imported: { dungeons: [second.id] } }], {
    dungeons: [rooms[0], second],
  });
  expect(catalogue.monsters).toHaveLength(1);
  expect(catalogue.monsters[0].rooms).toEqual([
    { id: 'custom-dungeon:garden', name: 'Le jardin' },
    { id: 'custom-dungeon:other-garden', name: 'Autre jardin' },
  ]);
  expect(catalogue.matches('monsterRooms', 'custom-dungeon:garden', 'garden-world')).toBe(true);
  expect(catalogue.matches('monsterRooms', 'custom-dungeon:other-garden', 'garden-world')).toBe(false);
  expect(catalogue.matches('customMonsters', catalogue.monsters[0].id, 'second-world')).toBe(true);
});
