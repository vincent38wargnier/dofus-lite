import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { ITEMS, emptyLoadout, resolveLoadout, rolledEffects } from '../engine/equipment';
import { createForgedItem, replaceEquipment } from '../engine/forgedItems';
import { canDropEquipment, dropEquipment } from '../ui/equipmentDrag';
import { DRAFT_STORAGE, isLoadout, emptyLibrary, libraryReducer } from '../ui/loadoutStore';
import LoadoutPicker from '../ui/LoadoutPicker';
import { LoadoutsProvider, useLoadouts } from '../ui/LoadoutsContext';

const outfit = slots => ({ ...emptyLoadout('IOP'), level: 200, slots, rollMode: 'random', rollSeed: 17 });
const payload = (itemId, fromSlot = null) => ({ itemId, fromSlot });

test('moving and swapping rings keeps their individual random jets, even with identical templates', () => {
  const draft = outfit({ ring1: 9128, ring2: 9128 });
  const a = rolledEffects(ITEMS[9128], draft, 'ring1'), b = rolledEffects(ITEMS[9128], draft, 'ring2');
  expect(a).not.toEqual(b);
  const swapped = dropEquipment(draft, payload(9128, 'ring1'), 'ring2');
  expect(rolledEffects(ITEMS[9128], swapped, 'ring1')).toEqual(b);
  expect(rolledEffects(ITEMS[9128], swapped, 'ring2')).toEqual(a);
  expect(resolveLoadout('IOP', swapped).bonuses).toEqual(resolveLoadout('IOP', draft).bonuses);
  const moved = dropEquipment(outfit({ dofus1: 694 }), payload(694, 'dofus1'), 'dofus6');
  expect(moved.slots.dofus1).toBeNull(); expect(moved.slots.dofus6).toBe(694);
  expect(rolledEffects(ITEMS[694], moved, 'dofus6')).toEqual(rolledEffects(ITEMS[694], outfit({ dofus1: 694 }), 'dofus1'));
});

test('FM snapshots follow both swapped items and survive named-build persistence', () => {
  const draft = outfit({ ring1: 2469, ring2: 9128, pet: 7520 });
  draft.petBonuses = { 7520: 213 };
  draft.forgedItems = Object.fromEntries(['ring1', 'ring2'].map(slot => [slot,
    createForgedItem(ITEMS[draft.slots[slot]], rolledEffects(ITEMS[draft.slots[slot]], draft, slot), 17)]));
  draft.forgedItems.ring1.stats.pm = 1;
  const original = JSON.stringify(draft);
  const swapped = dropEquipment(draft, payload(2469, 'ring1'), 'ring2');
  expect(swapped.forgedItems.ring2).toEqual(draft.forgedItems.ring1);
  expect(swapped.forgedItems.ring1).toEqual(draft.forgedItems.ring2);
  expect(swapped.petBonuses).toEqual(draft.petBonuses);
  expect(resolveLoadout('IOP', swapped).bonuses).toEqual(resolveLoadout('IOP', draft).bonuses);
  expect(JSON.stringify(draft)).toBe(original);
  const stored = libraryReducer(emptyLibrary(), { type: 'save', id: 'drag', name: 'Déplacé', classId: 'IOP', loadout: swapped, now: 1 });
  const restored = JSON.parse(JSON.stringify(stored)).builds[0].loadout;
  expect(isLoadout(restored)).toBe(true);
  expect(resolveLoadout('IOP', restored).bonuses).toEqual(resolveLoadout('IOP', draft).bonuses);
  const replaced = replaceEquipment(restored, 'ring2', 2419);
  expect(replaced.forgedItems.ring2).toBeUndefined();
  expect(replaced.rollOrigins.ring2).toBeUndefined();
  expect(isLoadout({ ...restored, rollOrigins: { ring2: {} } })).toBe(false);
});

test('incompatible, unavailable, stale and cancelled drops do not modify the draft', () => {
  const draft = outfit({ ring1: 2469 });
  for (const [drag, slot] of [[payload(6980), 'hat'], [payload(999999), 'dofus1'],
    [payload(6980, 'ring1'), 'dofus1'], [payload(2469, 'ring1'), 'ring1'], [null, 'dofus1']]) {
    expect(canDropEquipment(draft, drag, slot)).toBe(false);
    expect(dropEquipment(draft, drag, slot)).toBe(draft);
  }
  const low = { ...draft, level: 1 };
  expect(dropEquipment(low, payload(2469), 'ring2')).toBe(low);
  const unsupported = Object.values(ITEMS).find(i => i.name === 'Dofus Tacheté');
  expect(dropEquipment(draft, payload(unsupported.id), 'dofus1')).toBe(draft);
});

function Builder() {
  const props = useLoadouts('IOP', 'CRA');
  return <LoadoutPicker {...props} classes={{ A: 'IOP', B: 'CRA' }} embedded fixedSide="A" />;
}
const saved = () => JSON.parse(localStorage.getItem(DRAFT_STORAGE));
const transfer = () => ({ setData: jest.fn(), setDragImage: jest.fn() });
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(DRAFT_STORAGE, JSON.stringify({ 'A:IOP': outfit({ ring1: 2469 }), 'B:CRA': emptyLoadout('CRA') }));
});

test('catalogue drops equip the actual destination, update stats and persist after remount', () => {
  const opponent = saved()['B:CRA'];
  const { container, unmount } = render(<LoadoutsProvider><Builder /></LoadoutsProvider>);
  fireEvent.click(container.querySelector('[data-slot="dofus1"]'));
  fireEvent.change(screen.getByLabelText('Rechercher un équipement'), { target: { value: 'Vulbis' } });
  const item = container.querySelector('[data-item-id="6980"]'), dataTransfer = transfer();
  expect(item).toHaveAttribute('draggable', 'true');
  fireEvent.dragStart(item, { dataTransfer });
  expect(container.querySelectorAll('.equipment-slot.drop-compatible')).toHaveLength(6);
  expect(container.querySelector('[data-slot="hat"]')).toHaveClass('drop-blocked');
  fireEvent.dragOver(container.querySelector('[data-slot="dofus6"]'), { dataTransfer });
  expect(container.querySelector('[data-slot="dofus6"]')).toHaveClass('drop-target');
  fireEvent.drop(container.querySelector('[data-slot="dofus6"]'), { dataTransfer });
  expect(saved()['A:IOP'].slots.dofus6).toBe(6980);
  expect(saved()['A:IOP'].slots.dofus1).toBeUndefined();
  expect(saved()['B:CRA']).toEqual(opponent);
  expect(container.querySelector('.equipment-dragging')).toBeNull();
  expect(screen.getByLabelText('Caractéristiques totales')).toHaveTextContent('4 PM');
  unmount();
  const restored = render(<LoadoutsProvider><Builder /></LoadoutsProvider>);
  expect(restored.container.querySelector('[data-slot="dofus6"]')).toHaveAccessibleName('Dofus 6 : Dofus Vulbis');
});

test('an equipped ring moves once; an incompatible drop and a cancelled drag leave it intact', () => {
  const { container } = render(<LoadoutsProvider><Builder /></LoadoutsProvider>);
  const dataTransfer = transfer(), ring = container.querySelector('[data-slot="ring1"]');
  fireEvent.dragStart(ring, { dataTransfer });
  fireEvent.drop(container.querySelector('[data-slot="ring2"]'), { dataTransfer });
  expect(saved()['A:IOP'].slots).toEqual({ ring1: null, ring2: 2469 });
  const before = JSON.stringify(saved());
  fireEvent.dragStart(container.querySelector('[data-slot="ring2"]'), { dataTransfer });
  fireEvent.drop(container.querySelector('[data-slot="hat"]'), { dataTransfer });
  expect(JSON.stringify(saved())).toBe(before);
  fireEvent.dragStart(container.querySelector('[data-slot="ring2"]'), { dataTransfer });
  fireEvent.dragEnd(container.querySelector('[data-slot="ring2"]'), { dataTransfer });
  fireEvent.drop(container.querySelector('[data-slot="ring1"]'), { dataTransfer });
  expect(JSON.stringify(saved())).toBe(before);
  expect(container.querySelector('.equipment-dragging')).toBeNull();
});
