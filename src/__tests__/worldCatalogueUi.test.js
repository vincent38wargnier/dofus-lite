import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { emptyLoadout, ITEMS, resolveLoadout } from '../engine/equipment';
import { newCustomEquipment } from '../engine/customEquipment';
import { newAdventure } from '../engine/adventures';
import { DUNGEONS } from '../engine/dungeons';
import { newWorkshopCreature, starterSpell } from '../ui/workshopStarters';
import { newWorkshopMap } from '../ui/workshopMapModel';
import { CustomEquipmentProvider, CUSTOM_EQUIPMENT_STORAGE } from '../ui/CustomEquipmentContext';
import { CreationsProvider } from '../ui/CreationsContext';
import { LoadoutsProvider } from '../ui/LoadoutsContext';
import { CREATIONS_STORAGE, validCreations } from '../ui/creationsStore';
import { WorldsProvider } from '../ui/WorldsContext';
import { buildWorldCatalogue } from '../ui/worldCatalogue';
import LoadoutPicker from '../ui/LoadoutPicker';
import LoadoutLibrary from '../ui/LoadoutLibrary';
import { LIBRARY_STORAGE } from '../ui/loadoutStore';
import EquipmentWorkshop from '../ui/EquipmentWorkshop';
import WorkshopScreen from '../ui/WorkshopScreen';
import { NewCharacterDialog } from '../ui/CharacterDialog';
import CombatMapGallery from '../ui/CombatMapGallery';

const nativeRoom = DUNGEONS.find(room => room.bossIds.includes(147));
const embeddedItem = { ...newCustomEquipment(7143), name: 'Couronne du jardin', stats: { vitalite: 100 } };
const personalItem = { ...newCustomEquipment(7143), name: 'Ma couronne privée', stats: { vitalite: 80 } };
const hero = { id: 'garden-hero', name: 'Héroïne du jardin', classId: 'IOP', loadout: { ...emptyLoadout('IOP'), level: 200,
  slots: { hat: embeddedItem.id }, customEquipment: { [embeddedItem.id]: embeddedItem }, spells: { custom: [starterSpell()] } } };
const battlefield = newWorkshopMap(12);
const room = { id: 'garden-room', name: 'Jardin magique', mapId: battlefield.id, battlefield,
  members: [{ customMonster: { ...newWorkshopCreature(), name: 'Gardien fleuri' }, count: 1 }],
  adventure: { ...newAdventure(), heroes: [{ id: 'provided', character: hero }] } };
const personalRoom = { id: 'private-room', name: 'Mon terrain privé', mapId: 'arene', members: [{ customMonster: newWorkshopCreature(), count: 1 }] };
const libraries = [
  { id: 'native', name: 'Dofus', release: '1.0.0', catalogue: { classData: { names: { IOP: 'Iop', CRA: 'Crâ' } },
    equipmentData: { items: { 7143: ITEMS[7143] }, sets: {} }, monsterData: { monsters: { 147: { grades: {} } } },
    dungeonData: { encounters: [nativeRoom] }, outdoorMaps: [{ id: 'muraille' }] } },
  { id: 'garden', name: 'Jardin', release: '1.0.0', imported: { dungeons: [room.id] } },
];
const wrap = (child, initial = 'garden') => <CustomEquipmentProvider><LoadoutsProvider><CreationsProvider><WorldsProvider libraries={libraries} initialWorldId={initial}>{child}</WorldsProvider></CreationsProvider></LoadoutsProvider></CustomEquipmentProvider>;
beforeAll(() => { HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); }; HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); }; });
beforeEach(() => {
  localStorage.clear();
  const creations = { version: 1, characters: [], dungeons: [room, personalRoom] };
  expect(validCreations(creations)).toBe(true);
  localStorage.setItem(CREATIONS_STORAGE, JSON.stringify(creations));
  localStorage.setItem(CUSTOM_EQUIPMENT_STORAGE, JSON.stringify({ version: 1, items: [personalItem] }));
});

test('equipment provenance includes library catalogues and embedded heroes without claiming personal creations', () => {
  const catalogue = buildWorldCatalogue(libraries, { dungeons: [room], equipment: [personalItem] });
  expect(catalogue.equipment.map(item => item.id)).toEqual(expect.arrayContaining([personalItem.id, embeddedItem.id]));
  expect(catalogue.matches('equipment', 7143, 'native')).toBe(true);
  expect(catalogue.matches('equipment', embeddedItem.id, 'garden')).toBe(true);
  expect(catalogue.matches('equipment', embeddedItem.id, 'personal')).toBe(false);
  expect(catalogue.matches('equipment', personalItem.id, 'garden')).toBe(false);
  expect(catalogue.matches('equipment', personalItem.id, 'personal')).toBe(true);
});

test('equipment world filters include embedded items and leave equipped gear untouched', () => {
  const loadout = { ...emptyLoadout('IOP'), level: 200, slots: { hat: 7143 } }, update = jest.fn();
  const view = render(wrap(<LoadoutPicker embedded fixedSide="A" classes={{ A: 'IOP' }} loadouts={{ A: loadout }} summaries={{ A: resolveLoadout('IOP', loadout) }} update={update} />));
  const inventory = within(view.container.querySelector('.equipment-inventory'));
  expect(inventory.getByRole('button', { name: /Couronne du jardin · Créé/ })).toBeInTheDocument();
  expect(inventory.queryByRole('button', { name: /Ma couronne privée · Créé/ })).not.toBeInTheDocument();
  expect(within(inventory.getByRole('list', { name: 'Objets disponibles' })).queryAllByRole('listitem')).toHaveLength(0);
  fireEvent.change(inventory.getByLabelText('Monde'), { target: { value: 'native' } });
  expect(inventory.queryByRole('button', { name: /Couronne du jardin · Créé/ })).not.toBeInTheDocument();
  expect(inventory.getByRole('list', { name: 'Objets disponibles' })).toHaveTextContent(ITEMS[7143].name);
  fireEvent.change(inventory.getByLabelText('Monde'), { target: { value: 'personal' } });
  expect(inventory.getByRole('button', { name: /Ma couronne privée · Créé/ })).toBeInTheDocument();
  expect(update).not.toHaveBeenCalled();
  expect(view.container.querySelector('[data-slot="hat"]')).toHaveAttribute('aria-label', `Coiffe : ${ITEMS[7143].name}`);
});

test('equipment creator filters saved definitions, including equipment supplied inside a world', () => {
  const view = render(wrap(<EquipmentWorkshop />));
  const library = within(view.container.querySelector('.equipment-design-library'));
  expect(library.getByRole('button', { name: /Couronne du jardin/ })).toBeInTheDocument();
  expect(library.queryByRole('button', { name: /Ma couronne privée/ })).not.toBeInTheDocument();
  fireEvent.change(library.getByLabelText('Monde'), { target: { value: 'personal' } });
  expect(library.getByRole('button', { name: /Ma couronne privée/ })).toBeInTheDocument();
  expect(library.queryByRole('button', { name: /Couronne du jardin/ })).not.toBeInTheDocument();
});

test('saved outfits containing mixed-world items remain findable from either world without equipping them', () => {
  const native = { ...emptyLoadout('IOP'), slots: { hat: 7143 } };
  const mixed = { ...hero.loadout, slots: { hat: 7143, amulet: embeddedItem.id } };
  const builds = [{ id: 'native-stuff', name: 'Stuff natif', loadout: native },
    { id: 'garden-stuff', name: 'Stuff jardin', loadout: hero.loadout }, { id: 'mixed-stuff', name: 'Stuff mélangé', loadout: mixed }];
  const saved = JSON.stringify({ version: 1, builds, active: {} });
  localStorage.setItem(LIBRARY_STORAGE, saved);
  const update = jest.fn();
  render(wrap(<LoadoutLibrary side="A" classId="IOP" loadout={native} update={update} />));
  expect(screen.getByRole('button', { name: 'Équiper le stuff Stuff jardin' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Équiper le stuff Stuff mélangé' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Équiper le stuff Stuff natif' })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Monde'), { target: { value: 'native' } });
  expect(screen.getByRole('button', { name: 'Équiper le stuff Stuff natif' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Équiper le stuff Stuff mélangé' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Équiper le stuff Stuff jardin' })).not.toBeInTheDocument();
  expect(update).not.toHaveBeenCalled();
  expect(localStorage.getItem(LIBRARY_STORAGE)).toBe(saved);
});

test('class templates filter both native classes and heroes embedded in adventures', () => {
  const choose = jest.fn();
  render(wrap(<NewCharacterDialog onClose={jest.fn()} onChooseClass={choose} onChooseCustom={choose} />, 'native'));
  const dialog = within(screen.getByRole('dialog'));
  expect(dialog.getByRole('button', { name: /Choisir Cr[aâ]/ })).toBeInTheDocument();
  fireEvent.change(dialog.getByLabelText('Monde'), { target: { value: 'garden' } });
  expect(dialog.queryByRole('button', { name: /Choisir Cr[aâ]/ })).not.toBeInTheDocument();
  expect(dialog.getByRole('button', { name: /Héroïne du jardin/ })).toBeInTheDocument();
  expect(choose).not.toHaveBeenCalled();
});

test('Atelier filters its dungeon library and creature catalogue while preserving the edited room', () => {
  const view = render(wrap(<WorkshopScreen active allBots={[]} />));
  const library = within(screen.getByRole('complementary', { name: 'Mes donjons enregistrés' }));
  expect(library.getByRole('button', { name: 'Modifier Jardin magique' })).toBeInTheDocument();
  expect(library.queryByRole('button', { name: 'Modifier Mon terrain privé' })).not.toBeInTheDocument();
  const before = localStorage.getItem(CREATIONS_STORAGE);
  const creatures = within(view.container.querySelector('.creator-monster-catalogue'));
  expect(creatures.getByRole('button', { name: 'Ajouter une copie de Gardien fleuri' })).toBeInTheDocument();
  fireEvent.change(creatures.getByLabelText('Monde'), { target: { value: 'native' } });
  expect(creatures.queryByRole('button', { name: 'Ajouter une copie de Gardien fleuri' })).not.toBeInTheDocument();
  fireEvent.click(creatures.getByRole('button', { name: /Bestiaire du jeu/ }));
  expect(creatures.getByRole('button', { name: 'Ajouter Bouftou Royal' })).toBeInTheDocument();
  fireEvent.change(library.getByLabelText('Monde'), { target: { value: 'personal' } });
  expect(library.getByRole('button', { name: 'Modifier Mon terrain privé' })).toBeInTheDocument();
  expect(creatures.queryByRole('button', { name: 'Ajouter Bouftou Royal' })).not.toBeInTheDocument();
  expect(localStorage.getItem(CREATIONS_STORAGE)).toBe(before);
});

test('map world changes clear an incompatible type without changing the selected battlefield', () => {
  const choose = jest.fn();
  render(wrap(<CombatMapGallery mapId="muraille" onChoose={choose} />, 'native'));
  fireEvent.click(screen.getByRole('button', { name: 'Arènes', exact: true }));
  fireEvent.change(screen.getByLabelText('Monde'), { target: { value: 'garden' } });
  expect(screen.getByRole('button', { name: 'Tous', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(document.querySelectorAll('.duel-map-card')).toHaveLength(1);
  expect(choose).not.toHaveBeenCalled();
});
