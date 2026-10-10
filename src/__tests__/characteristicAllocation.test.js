import React, { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CLASS_IDS } from '../engine/classes';
import { allocateCharacteristic, characteristicBudget, characteristicStep, maximumCharacteristic } from '../engine/characteristicAllocation';
import { allocatedPoints, emptyLoadout, equipSet, pointCost, resolveLoadout } from '../engine/equipment';
import CharacteristicAllocator from '../ui/CharacteristicAllocator';

test('capital is earned on level-up, starting at zero and ending at 995', () => {
  expect([1, 2, 100, 150, 200].map(characteristicBudget)).toEqual([0, 5, 495, 745, 995]);
});

// Boundary examples from classes_fr_1391, starting with 101 scrolled stats:
// [class, characteristic, value at the boundary, total spent, next point cost].
test.each([
  ['FECA', 'force', 49, 147, 4],
  ['OSAMODAS', 'chance', 99, 198, 3],
  ['ENUTROF', 'chance', 49, 98, 3],
  ['SRAM', 'agilite', 99, 198, 3],
  ['XELOR', 'agilite', 1, 5, 5],
  ['ECAFLIP', 'agilite', 49, 147, 4],
  ['ENIRIPSA', 'intelligence', 99, 198, 3],
  ['IOP', 'intelligence', 1, 5, 5],
  ['CRA', 'force', 49, 98, 3],
  ['SADIDA', 'force', 149, 298, 3],
  ['SACRIEUR', 'force', 49, 196, 5],
  ['PANDAWA', 'chance', 99, 198, 3],
])('%s %s charges the right cost after %i', (classId, stat, amount, spent, nextCost) => {
  expect(pointCost(classId, stat, amount)).toBe(spent);
  expect(pointCost(classId, stat, amount + 1)).toBe(spent + nextCost);
  expect(characteristicStep(classId, stat, amount)).toEqual({ cost: nextCost, gain: 1 });
});

test('one bulk edit can cross several tiers and a refund uses the original purchase costs', () => {
  expect(pointCost('IOP', 'force', 300)).toBe(903);
  expect(pointCost('IOP', 'force', 400)).toBe(1403);
  expect(pointCost('IOP', 'force', 401)).toBe(1408);
  expect(pointCost('IOP', 'force', 99) - pointCost('IOP', 'force', 98)).toBe(2);
  expect(pointCost('IOP', 'force', 100) - pointCost('IOP', 'force', 99)).toBe(3);
  expect(allocateCharacteristic('IOP', 'force', 300, { force: 99 }, 200).base.force).toBe(300);
});

test('wisdom always costs three; only Sacrieur gets two vitality per capital point', () => {
  for (const classId of CLASS_IDS) {
    expect(pointCost(classId, 'sagesse', 150)).toBe(450);
    expect(pointCost(classId, 'vitalite', 200)).toBe(classId === 'SACRIEUR' ? 100 : 200);
  }
  expect(maximumCharacteristic('SACRIEUR', 'vitalite', {}, 200)).toBe(1990);
  expect(allocateCharacteristic('SACRIEUR', 'vitalite', 101, {}, 200).error).toMatch(/pair/);
});

test('Max preserves a mixed allocation and leaves unaffordable leftover capital unspent', () => {
  const base = { force: 100, vitalite: 100, sagesse: 50 };
  const amount = maximumCharacteristic('IOP', 'force', base, 100);
  expect(amount).toBe(114); // 100 vitality + 150 wisdom + 243 strength = 493.
  const next = allocateCharacteristic('IOP', 'force', amount, base, 100).base;
  expect(next).toEqual({ force: 114, vitalite: 100, sagesse: 50 });
  expect(allocatedPoints('IOP', next)).toBe(493);
  expect(base).toEqual({ force: 100, vitalite: 100, sagesse: 50 });
  expect(allocateCharacteristic('IOP', 'force', 115, next, 100).error).toMatch(/manque 1 point/);
  expect(maximumCharacteristic('IOP', 'force', {}, 1)).toBe(0);
});

test.each([-1, 1.5, NaN, Infinity, 1991])('rejects invalid investment %s without changing the draft', amount => {
  expect(allocateCharacteristic('IOP', 'force', amount, { force: 100 }, 200)).toHaveProperty('error');
});

test('after lowering the level, over-budget drafts can be reduced in several steps', () => {
  const base = { force: 200, vitalite: 200 };
  expect(allocateCharacteristic('IOP', 'force', 201, base, 50).error).toMatch(/Capital insuffisant/);
  const first = allocateCharacteristic('IOP', 'force', 100, base, 50).base;
  expect(first).toEqual({ force: 100, vitalite: 200 }); // Still over budget.
  const second = allocateCharacteristic('IOP', 'vitalite', 40, first, 50).base;
  expect(allocatedPoints('IOP', second)).toBe(241);
});

function Editor({ classId = 'IOP', base = { force: 100, sagesse: 50 }, level = 100 }) {
  const [loadout, setLoadout] = useState({ ...equipSet(emptyLoadout(classId), 1), base, level });
  return <CharacteristicAllocator classId={classId} summary={resolveLoadout(classId, loadout)} onChange={setLoadout} />;
}

const edit = (label, value) => {
  const input = screen.getByLabelText(`${label} de base`);
  fireEvent.change(input, { target: { value: String(value) } });
  fireEvent.blur(input);
  return input;
};

test('manual entry, +/−, budget and equipment totals stay consistent', () => {
  render(<Editor />);
  expect(screen.getByRole('status')).toHaveTextContent('144');
  const strength = screen.getByLabelText('Force de base').closest('tr');
  expect(strength.querySelector('.allocation-cost')).toHaveTextContent('3 pour +1');
  expect(strength.querySelector('.allocation-parchment')).toHaveTextContent('+101');
  expect(strength.querySelector('.allocation-gear')).toHaveTextContent('+100');
  expect(strength.querySelector('.allocation-total')).toHaveTextContent('301');
  edit('Force', 120);
  expect(screen.getByRole('status')).toHaveTextContent('84');
  expect(screen.getByLabelText('Sagesse de base')).toHaveValue(50);
  fireEvent.click(screen.getByLabelText('Augmenter Force'));
  expect(screen.getByRole('status')).toHaveTextContent('81');
  fireEvent.click(screen.getByLabelText('Diminuer Force'));
  expect(screen.getByLabelText('Force de base')).toHaveValue(120);
  fireEvent.click(screen.getByLabelText('Maximum en Vitalité'));
  expect(screen.getByLabelText('Vitalité de base')).toHaveValue(84);
  expect(screen.getByRole('status').querySelector('strong')).toHaveTextContent(/^0$/);
  expect(screen.getByLabelText('Augmenter Force')).toBeDisabled();
  expect(edit('Force', 200)).toHaveValue(120);
  expect(screen.getByRole('alert')).toHaveTextContent('Capital insuffisant');
  expect(within(strength).getByLabelText('Force de base')).toHaveValue(120);
});

test('reset can be undone and does not remove equipment bonuses', () => {
  render(<Editor />);
  fireEvent.click(screen.getByRole('button', { name: 'Tout remettre à zéro' }));
  for (const input of screen.getAllByRole('spinbutton')) expect(input).toHaveValue(0);
  expect(screen.getByLabelText('Force de base').closest('tr').querySelector('.allocation-total')).toHaveTextContent('201');
  fireEvent.click(screen.getByRole('button', { name: 'Annuler la remise à zéro' }));
  expect(screen.getByLabelText('Force de base')).toHaveValue(100);
  expect(screen.getByLabelText('Sagesse de base')).toHaveValue(50);
});

test('Sacrieur inputs and step buttons respect the two-vitality increment', () => {
  render(<Editor classId="SACRIEUR" base={{}} level={2} />);
  fireEvent.click(screen.getByLabelText('Augmenter Vitalité'));
  expect(screen.getByLabelText('Vitalité de base')).toHaveValue(2);
  expect(screen.getByRole('status').querySelector('strong')).toHaveTextContent(/^4$/);
  expect(edit('Vitalité', 3)).toHaveValue(2);
  expect(screen.getByRole('alert')).toHaveTextContent('nombre pair');
  edit('Vitalité', 10);
  expect(screen.getByLabelText('Augmenter Vitalité')).toBeDisabled();
  fireEvent.click(screen.getByLabelText('Diminuer Vitalité'));
  expect(screen.getByLabelText('Vitalité de base')).toHaveValue(8);
  expect(screen.getByRole('status').querySelector('strong')).toHaveTextContent(/^1$/);
});
