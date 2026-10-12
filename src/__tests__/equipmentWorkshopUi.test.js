import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { CustomEquipmentProvider, CUSTOM_EQUIPMENT_STORAGE } from '../ui/CustomEquipmentContext';
import EquipmentWorkshop from '../ui/EquipmentWorkshop';
import { validateCustomEquipment } from '../engine/customEquipment';

const app = onEquip => <CustomEquipmentProvider><EquipmentWorkshop onEquip={onEquip} /></CustomEquipmentProvider>;
beforeEach(() => localStorage.clear());
test('edit, enforce budget, save, reload and explicitly equip a revision without changing an older item', () => {
  const equip = jest.fn(), view = render(app(equip));
  fireEvent.change(screen.getByLabelText('Nom de l’équipement'), { target: { value: 'Couronne boréale' } });
  fireEvent.click(screen.getByRole('button', { name: 'Apparence', exact: true }));
  fireEvent.click(screen.getByRole('button', { name: 'Forme Cristal' }));
  fireEvent.click(screen.getByRole('button', { name: 'Couleur Océan' }));
  fireEvent.click(screen.getByRole('button', { name: 'Bonus', exact: true }));
  fireEvent.change(screen.getByLabelText('Niveau requis'), { target: { value: '200' } });
  fireEvent.click(screen.getByRole('button', { name: 'Ajouter', exact: true }));
  fireEvent.change(screen.getByLabelText('Vitalité'), { target: { value: '10000' } });
  expect(screen.getByRole('button', { name: 'Enregistrer l’équipement' })).toBeDisabled();
  expect(localStorage.getItem(CUSTOM_EQUIPMENT_STORAGE)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Réduire les valeurs au budget' }));
  expect(screen.getByRole('button', { name: 'Enregistrer l’équipement' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Enregistrer et équiper' }));
  const item = equip.mock.calls[0][0];
  expect(validateCustomEquipment(item).valid).toBe(true);
  expect(item.appearance).toEqual({ shape: 'crystal', color: '#378bc2' });
  expect(JSON.parse(localStorage.getItem(CUSTOM_EQUIPMENT_STORAGE)).items[0]).toEqual(item);
  view.unmount(); render(app(equip));
  fireEvent.click(screen.getByRole('button', { name: /Couronne boréale/ }));
  expect(screen.getByLabelText('Nom de l’équipement')).toHaveValue('Couronne boréale');
  fireEvent.click(screen.getByRole('button', { name: 'Apparence', exact: true }));
  expect(screen.getByRole('button', { name: 'Forme Cristal' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'Couleur Océan' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Bonus', exact: true }));
  fireEvent.change(screen.getByLabelText('Vitalité'), { target: { value: '100' } });
  fireEvent.click(screen.getByRole('button', { name: 'Enregistrer l’équipement' }));
  const next = JSON.parse(localStorage.getItem(CUSTOM_EQUIPMENT_STORAGE)).items[0];
  expect(next.id).not.toBe(item.id);
  expect(next.stats.vitalite).toBe(100); expect(item.stats.vitalite).toBeGreaterThan(100);
  expect(equip).toHaveBeenCalledTimes(1);
});

test('new family resets incompatible stats and weapon lines while keeping the chosen name', () => {
  render(app());
  fireEvent.change(screen.getByLabelText('Nom de l’équipement'), { target: { value: 'Mon marteau' } });
  fireEvent.change(screen.getByLabelText('Famille'), { target: { value: 'weapon-7' } });
  expect(screen.getByLabelText('Nom de l’équipement')).toHaveValue('Mon marteau');
  fireEvent.click(screen.getByRole('button', { name: 'Arme', exact: true }));
  expect(screen.getByLabelText('Coût en PA')).toBeVisible();
  fireEvent.change(screen.getByLabelText('Famille'), { target: { value: 'cape' } });
  expect(screen.queryByLabelText('Coût en PA')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Nom de l’équipement')).toHaveValue('Mon marteau');
  expect(screen.getByLabelText('Famille').querySelector('option[value="dofus"]')).toBeNull();
});

test('a failed save reports the failure without equipping or claiming success', () => {
  const equip = jest.fn();
  render(app(equip));
  const spy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Quota dépassé'); });
  fireEvent.click(screen.getByRole('button', { name: 'Enregistrer et équiper' }));
  expect(equip).not.toHaveBeenCalled();
  expect(screen.queryByText('Équipement enregistré. Disponible dans Équipement → Mes équipements.')).not.toBeInTheDocument();
  spy.mockRestore();
  fireEvent.click(screen.getByRole('button', { name: 'Enregistrer et équiper' }));
  expect(equip).toHaveBeenCalledTimes(1);
});

test('opening the creator from a Dofus or unsupported tool uses a supported model', () => {
  const view = render(<CustomEquipmentProvider><EquipmentWorkshop initialReferenceId={6980} /></CustomEquipmentProvider>);
  expect(screen.getByLabelText('Famille')).toHaveValue('hat');
  expect(screen.getByRole('button', { name: 'Enregistrer l’équipement' })).toBeEnabled();
  view.unmount();
});
