import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { emptyLoadout, ITEMS, resolveLoadout, rolledEffects } from '../engine/equipment';
import { createForgedItem, replaceEquipment, validateForgedItem } from '../engine/forgedItems';
import { newCustomEquipment } from '../engine/customEquipment';
import { LoadoutsProvider, useLoadouts } from '../ui/LoadoutsContext';
import { ProfilesProvider } from '../ui/ProfilesContext';
import { CustomEquipmentProvider, CUSTOM_EQUIPMENT_STORAGE } from '../ui/CustomEquipmentContext';
import { collectForgedEquipment, rememberForgedEquipment, personalEquipmentCollection, personalEquipmentDrag, readPersonalEquipment, PERSONAL_EQUIPMENT_STORAGE } from '../ui/personalEquipmentStore';
import { canDropEquipment, dropEquipment } from '../ui/equipmentDrag';
import { DRAFT_STORAGE, LIBRARY_STORAGE, emptyLibrary, libraryReducer } from '../ui/loadoutStore';
import LoadoutPicker from '../ui/LoadoutPicker';

const outfit = slots => ({ ...emptyLoadout('IOP'), level: 200, slots, rollMode: 'random', rollSeed: 17 });
const forged = (bonus = 'pm', slot = 'ring1', itemId = 2469) => {
  const loadout = outfit({ [slot]: itemId });
  loadout.forgedItems = { [slot]: createForgedItem(ITEMS[itemId], rolledEffects(ITEMS[itemId], loadout, slot), 71) };
  loadout.forgedItems[slot].stats[bonus] = (loadout.forgedItems[slot].stats[bonus] || 0) + 1;
  return loadout;
};
const source = (key, loadout) => ({ key, name: key, loadout });
const stored = () => JSON.parse(localStorage.getItem(DRAFT_STORAGE));
beforeEach(() => localStorage.clear());

test('the personal collection finds created and FM items in every source, deduplicates identical jets and keeps variants', () => {
  const custom = { ...newCustomEquipment(7143), name: 'Couronne astrale', stats: { vitalite: 100 } };
  const a = forged(), b = forged('range'), sameJet = JSON.parse(JSON.stringify(a));
  sameJet.forgedItems.ring1.attempts = 40;
  const sources = [source('personnage', a), source('stuff', b), source('ancien brouillon', sameJet),
    source('ancien objet créé', { ...outfit({ hat: custom.id }), customEquipment: { [custom.id]: custom } })];
  expect(personalEquipmentCollection([custom], sources)).toHaveLength(3);
  expect(personalEquipmentCollection([], sources).find(entry => entry.item.id === custom.id).item.name).toBe(custom.name);
  const wrongSlot = { ...a, slots: { ring1: 9128 } };
  expect(collectForgedEquipment([source('stale', wrongSlot)])).toHaveLength(0);
});

test('automatic collection keeps the latest forge per source after unequipping, without one entry per rune', () => {
  const loadout = forged(), snapshots = collectForgedEquipment([source('character', loadout)]);
  const saved = rememberForgedEquipment([], snapshots);
  expect(rememberForgedEquipment(saved, snapshots)).toBe(saved);
  loadout.forgedItems.ring1.puits = 5;
  expect(saved[0].forge.puits).toBe(0);
  const next = rememberForgedEquipment(saved, collectForgedEquipment([source('character', loadout)]));
  expect(next).toHaveLength(1); expect(next[0].forge.puits).toBe(5);
  const naked = replaceEquipment(loadout, 'ring1', null);
  expect(rememberForgedEquipment(next, collectForgedEquipment([source('character', naked)]))).toBe(next);
  localStorage.setItem(PERSONAL_EQUIPMENT_STORAGE, JSON.stringify({ version: 1, entries: next }));
  expect(readPersonalEquipment(localStorage).entries).toEqual(next);
  expect(personalEquipmentCollection([], [source('character', naked)], next)[0].forge.stats.pm).toBe(1);
});

test('copying a personal FM item replaces a different jet of the same template, preserves history, and never mutates its source', () => {
  const original = forged(), destination = forged('range', 'ring2');
  const entry = personalEquipmentCollection([], [source('saved', original)])[0];
  const payload = personalEquipmentDrag(entry), before = JSON.stringify(original);
  const result = dropEquipment(destination, payload, 'ring2');
  expect(result.forgedItems.ring2).toEqual(original.forgedItems.ring1);
  expect(rolledEffects(ITEMS[2469], result, 'ring2')).toEqual(rolledEffects(ITEMS[2469], original, 'ring1'));
  expect(resolveLoadout('IOP', result).pm).toBe(4);
  expect(resolveLoadout('IOP', result).bonuses.range || 0).toBe(0);
  result.forgedItems.ring2.stats.pm = 0;
  expect(JSON.stringify(original)).toBe(before);
  expect(dropEquipment(destination, payload, 'hat')).toBe(destination);
  expect(canDropEquipment({ ...destination, level: 1 }, payload, 'ring2')).toBe(false);
  const invalid = { ...payload, forgedItem: { ...entry.forge, stats: { pa: 100 } } };
  expect(dropEquipment(destination, invalid, 'ring2')).toBe(destination);
});

test('a personal converted weapon keeps its element, base rolls and forge state on another character', () => {
  const loadout = outfit({ weapon: 3652 });
  const forge = createForgedItem(ITEMS[3652], rolledEffects(ITEMS[3652], loadout, 'weapon'), 17);
  forge.weaponPotion = 1345; loadout.forgedItems = { weapon: forge };
  expect(validateForgedItem(ITEMS[3652], forge)).toBe('');
  const entry = personalEquipmentCollection([], [source('weapon', loadout)])[0];
  const result = dropEquipment({ ...emptyLoadout('CRA'), level: 200 }, personalEquipmentDrag(entry), 'weapon');
  expect(rolledEffects(ITEMS[3652], result, 'weapon')).toEqual(rolledEffects(ITEMS[3652], loadout, 'weapon'));
  expect(result.forgedItems.weapon).toEqual(forge);
});

function Builder() {
  const equipment = useLoadouts('IOP', 'CRA');
  return <LoadoutPicker {...equipment} classes={{ A: 'IOP', B: 'CRA' }} embedded fixedSide="A" />;
}
const app = () => <CustomEquipmentProvider><LoadoutsProvider><ProfilesProvider><Builder /></ProfilesProvider></LoadoutsProvider></CustomEquipmentProvider>;

test('visible shelves equip precise FM jets by drag and click, recover all saved sources, and persist after removal/reload', () => {
  const savedFM = forged(), current = forged('range');
  const custom = { ...newCustomEquipment(7143), name: 'Couronne astrale', level: 200, stats: { vitalite: 100 } };
  localStorage.setItem(CUSTOM_EQUIPMENT_STORAGE, JSON.stringify({ version: 1, items: [custom] }));
  localStorage.setItem(DRAFT_STORAGE, JSON.stringify({ 'A:IOP': current, 'B:CRA': outfit({}) }));
  const library = libraryReducer(emptyLibrary(), { type: 'save', id: 'air', name: 'Air FM', loadout: savedFM, now: 1 });
  localStorage.setItem(LIBRARY_STORAGE, JSON.stringify(library));
  const profileFM = forged('damage', 'ring1', 9128);
  localStorage.setItem('dofus-lite-profiles-v1', JSON.stringify({ version: 1, activeId: 'other', profiles: [{ id: 'other', name: 'Autre perso', className: 'Crâ', classId: 'CRA', loadout: profileFM }] }));
  let view = render(app());
  expect(screen.queryByRole('combobox', { name: 'Charger un stuff' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Équiper le stuff Air FM' })).toBeVisible();
  let shelf = screen.getByRole('region', { name: 'Mes équipements personnalisés' });
  expect(shelf).toBeVisible();
  expect(shelf.querySelectorAll('[data-personal-item]')).toHaveLength(4);
  expect(within(shelf).getByRole('button', { name: /Couronne astrale/ })).toBeVisible();
  expect(view.container.querySelectorAll(`.equipment-results [data-item-id="${custom.id}"]`)).toHaveLength(0);
  fireEvent.click(view.container.querySelector('[data-slot="ring1"]'));
  fireEvent.click(within(shelf).getByRole('button', { name: /Gelano · FM · \+1 PM/ }));
  const inspector = screen.getByRole('complementary', { name: 'Détails de l’objet' });
  expect(inspector.querySelector('.equipment-effects')).toHaveTextContent('+1 PM');
  expect(within(inspector).getByRole('table')).toHaveTextContent('PM');
  fireEvent.click(within(inspector).getByRole('button', { name: 'Remplacer · Anneau 1' }));
  expect(stored()['A:IOP'].forgedItems.ring1).toEqual(savedFM.forgedItems.ring1);
  const dataTransfer = { setData: jest.fn(), setDragImage: jest.fn() };
  fireEvent.dragStart(within(shelf).getByRole('button', { name: /Couronne astrale/ }), { dataTransfer });
  fireEvent.drop(view.container.querySelector('[data-slot="hat"]'), { dataTransfer });
  expect(stored()['A:IOP'].customEquipment[custom.id]).toEqual(custom);
  fireEvent.pointerDown(view.container.querySelector('[data-slot="ring1"]'));
  fireEvent.click(view.container.querySelector('[data-slot="ring1"]'));
  fireEvent.click(screen.getByRole('button', { name: 'Retirer Gelano' }));
  expect(stored()['A:IOP'].slots.ring1).toBeNull();
  view.unmount(); view = render(app());
  shelf = screen.getByRole('region', { name: 'Mes équipements personnalisés' });
  fireEvent.doubleClick(within(shelf).getByRole('button', { name: /Gelano · FM · \+1 PM/ }));
  expect(stored()['A:IOP'].forgedItems.ring1).toEqual(savedFM.forgedItems.ring1);
  expect(JSON.parse(localStorage.getItem(LIBRARY_STORAGE))).toEqual(library);
  expect(JSON.parse(localStorage.getItem('dofus-lite-profiles-v1')).profiles[0].loadout).toEqual(profileFM);
});

test('an unreadable FM collection is reported and never overwritten', () => {
  const raw = '{bad json'; localStorage.setItem(PERSONAL_EQUIPMENT_STORAGE, raw);
  localStorage.setItem(DRAFT_STORAGE, JSON.stringify({ 'A:IOP': forged() }));
  render(app());
  expect(screen.getByText('La collection FM est illisible. Sa sauvegarde est conservée.')).toBeVisible();
  expect(localStorage.getItem(PERSONAL_EQUIPMENT_STORAGE)).toBe(raw);
});

test('an obsolete FM snapshot stays readable but cannot be equipped', () => {
  const obsolete = forged();
  obsolete.forgedItems.ring1.baseEffects.push({ row: [800, 1, 0], value: 1 });
  const entry = personalEquipmentCollection([], [source('old', obsolete)])[0];
  expect(entry).toBeDefined();
  expect(canDropEquipment(outfit({}), personalEquipmentDrag(entry), 'ring1')).toBe(false);
});
