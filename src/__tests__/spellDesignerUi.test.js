import React, { useState } from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { emptyLoadout } from '../engine/equipment';
import { newAuthoredSpell, duplicateAuthoredSpell, normalizeAuthoredSpell, newAuthoredEffect } from '../engine/authoredSpells';
import { spellbookBalance } from '../engine/spellBalance';
import { emptyCreations, readCreations, persistCreations, CREATIONS_STORAGE } from '../ui/creationsStore';
import CustomSpellPicker from '../ui/CustomSpellPicker';

const saved = () => JSON.parse(localStorage.getItem(CREATIONS_STORAGE)).characters[0].loadout;
function App({ initial = [] }) {
  const [loadout, setLoadout] = useState(() => readCreations(localStorage).value.characters[0]?.loadout
    || { ...emptyLoadout('IOP'), level: 200, spells: { custom: initial, order: initial.map(s => s.id) } });
  return <CustomSpellPicker loadout={loadout} change={change => {
    const next = change(loadout);
    persistCreations(localStorage, { ...emptyCreations(), characters: [{ id: 'ui', name: 'Astrale', classId: 'IOP', loadout: next }] });
    setLoadout(next);
  }} />;
}
const change = (scope, label, value) => fireEvent.change(scope.getByLabelText(label), { target: { value } });
const editor = () => within(screen.getByRole('form', { name: 'Créateur de sort' }));
beforeEach(() => localStorage.clear());

test('create, validate, save, reload and edit an invented spell without a JSON file', () => {
  let view = render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '+ Créer un sort' }));
  const form = editor();
  change(form, 'Nom du sort', '');
  expect(form.getByRole('button', { name: 'Ajouter à ma classe' })).toBeDisabled();
  change(form, 'Nom du sort', 'Éclat astral');
  change(form, 'Description', 'Une frappe d’air précise.');
  change(form, 'Élément', 'air');
  change(form, 'Minimum', 15); change(form, 'Maximum', 20);
  change(form, 'Portée minimale', 8);
  expect(form.getByRole('alert')).toHaveTextContent('minimum ≤ maximum');
  change(form, 'Portée minimale', 1);
  fireEvent.click(form.getByLabelText('Activer les coups critiques'));
  fireEvent.click(form.getByRole('button', { name: 'Effets critiques' }));
  change(form, 'Minimum', 22); change(form, 'Maximum', 25);
  fireEvent.click(form.getByRole('button', { name: 'Ajouter à ma classe' }));
  const first = saved().spells.custom[0];
  expect(first).toMatchObject({ name: 'Éclat astral', description: 'Une frappe d’air précise.', critRate: 50,
    effects: [{ kind: 'damage', element: 'air', min: 15, max: 20 }], critEffects: [{ min: 22, max: 25 }] });
  expect(screen.queryByRole('form')).not.toBeInTheDocument();
  view.unmount(); view = render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Modifier Éclat astral' }));
  expect(editor().getByLabelText('Nom du sort')).toHaveValue('Éclat astral');
  change(editor(), 'Coût en PA', 4);
  expect(saved().spells.custom[0].pa).toBe(3);
  fireEvent.click(editor().getByRole('button', { name: 'Enregistrer les modifications' }));
  expect(saved().spells.custom[0]).toMatchObject({ id: first.id, key: first.key, pa: 4 });
  fireEvent.click(screen.getByRole('button', { name: 'Dupliquer Éclat astral' }));
  change(editor(), 'Nom du sort', 'Éclat solaire');
  fireEvent.click(editor().getByRole('button', { name: 'Ajouter à ma classe' }));
  const spells = saved().spells.custom;
  expect(spells).toHaveLength(2); expect(spells[0].id).not.toBe(spells[1].id);
  expect(spells[0].effects).toEqual(spells[1].effects);
  fireEvent.click(screen.getByRole('button', { name: 'Modifier Éclat solaire' }));
  change(editor(), 'Minimum', 10);
  fireEvent.click(editor().getByRole('button', { name: 'Annuler' }));
  expect(saved().spells.custom).toEqual(spells);
});

test('ordered effects and critical lists are separately editable, with meaningful targeting checks', () => {
  render(<App />); fireEvent.click(screen.getByRole('button', { name: '+ Créer un sort' }));
  const form = editor();
  change(form, 'Nom du sort', 'Élan brûlant');
  fireEvent.click(form.getByRole('button', { name: '+ Ajouter un effet' }));
  const second = within(form.getByRole('group', { name: 'Effet 2' }));
  change(second, 'Action', 'buffDamage');
  fireEvent.click(second.getByRole('button', { name: 'Monter l’effet 2' }));
  fireEvent.click(form.getByLabelText('Activer les coups critiques'));
  fireEvent.click(form.getByRole('button', { name: 'Effets critiques' }));
  const criticalBoost = within(form.getByRole('group', { name: 'Effet 1' }));
  change(criticalBoost, 'Minimum', 10); change(criticalBoost, 'Maximum', 10);
  fireEvent.click(form.getByRole('button', { name: 'Effets normaux' }));
  expect(within(form.getByRole('group', { name: 'Effet 1' })).getByLabelText('Minimum')).toHaveValue(8);
  fireEvent.click(form.getByRole('button', { name: 'Ajouter à ma classe' }));
  expect(saved().spells.custom[0].effects.map(e => e.kind)).toEqual(['buffDamage', 'damage']);
  expect(saved().spells.custom[0].critEffects[0].min).toBe(10);
  fireEvent.click(screen.getByRole('button', { name: '+ Créer un sort' }));
  fireEvent.click(within(editor().getByRole('group', { name: 'Partir d’un modèle' })).getByRole('button', { name: 'Téléportation' }));
  expect(editor().getByLabelText('Cible du lancer')).toHaveValue('freeCell');
  fireEvent.click(editor().getByLabelText('Portée modifiable'));
  expect(editor().getByRole('button', { name: 'Ajouter à ma classe' })).toBeDisabled();
  expect(editor().getByRole('alert')).toHaveTextContent('portée fixe');
  fireEvent.click(editor().getByRole('button', { name: 'Annuler' }));
  expect(saved().spells.custom).toHaveLength(1);
});

test('at ten spells creation and duplication are disabled, but editing an existing spell still works', () => {
  const spells = [newAuthoredSpell()];
  while (spells.length < 10) spells.push(duplicateAuthoredSpell(spells[0], spells.map(s => s.id)));
  spells.forEach((spell, i) => { spell.name = `Sort ${i + 1}`; });
  render(<App initial={spells} />);
  expect(screen.getByRole('button', { name: '+ Créer un sort' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Dupliquer Sort 1' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Modifier Sort 1' }));
  change(editor(), 'Nom du sort', 'Premier sort');
  fireEvent.click(editor().getByRole('button', { name: 'Enregistrer les modifications' }));
  expect(saved().spells.custom).toHaveLength(10);
  expect(saved().spells.custom[0].name).toBe('Premier sort');
});

test('normal edits keep untouched criticals synchronized, but a weaker custom critical blocks saving', () => {
  render(<App />); fireEvent.click(screen.getByRole('button', { name: '+ Créer un sort' }));
  const form = editor();
  fireEvent.click(form.getByLabelText('Activer les coups critiques'));
  change(form, 'Minimum', 24); change(form, 'Maximum', 24);
  fireEvent.click(form.getByRole('button', { name: 'Effets critiques' }));
  expect(form.getByLabelText('Minimum')).toHaveValue(24);
  change(form, 'Minimum', 10); change(form, 'Maximum', 10);
  expect(form.getByRole('alert')).toHaveTextContent('inférieures');
  expect(form.getByRole('button', { name: 'Ajouter à ma classe' })).toBeDisabled();
  fireEvent.click(form.getByRole('button', { name: 'Aligner sur les effets normaux' }));
  expect(form.getByLabelText('Minimum')).toHaveValue(24);
  fireEvent.click(form.getByRole('button', { name: 'Ajouter à ma classe' }));
  expect(saved().spells.custom[0].critEffects).toEqual(saved().spells.custom[0].effects);
});

test('budget updates live, blocks a nuke, and offers a reviewable repair before saving', () => {
  render(<App />); fireEvent.click(screen.getByRole('button', { name: '+ Créer un sort' }));
  const form = editor();
  change(form, 'Nom du sort', 'Argent russe'); change(form, 'Coût en PA', 1);
  change(form, 'Minimum', 150); change(form, 'Maximum', 150);
  expect(form.getByRole('region', { name: 'Budget du sort' })).toHaveTextContent('points à retirer');
  expect(form.getByRole('button', { name: 'Ajouter à ma classe' })).toBeDisabled();
  fireEvent.click(form.getByRole('button', { name: 'Rééquilibrer les valeurs' }));
  expect(form.getByRole('status')).toHaveTextContent('Vérifiez les valeurs');
  expect(form.getByRole('button', { name: 'Ajouter à ma classe' })).toBeEnabled();
  expect(localStorage.getItem(CREATIONS_STORAGE)).toBeNull();
  fireEvent.click(form.getByRole('button', { name: 'Ajouter à ma classe' }));
  expect(spellbookBalance(saved().spells.custom).valid).toBe(true);
});

test('total kit budget blocks adding another strong spell and permits gradual legacy repairs', () => {
  const first = normalizeAuthoredSpell({ ...newAuthoredSpell(), name: 'Frappe', effects: [{ ...newAuthoredEffect(), min: 30, max: 30 }] });
  const spells = Array.from({ length: 7 }, (_, i) => ({ ...first, id: 1000000000000 + i, key: `custom_${1000000000000 + i}`, name: `Frappe ${i}` }));
  const view = render(<App initial={spells} />);
  fireEvent.click(screen.getByRole('button', { name: '+ Créer un sort' }));
  change(editor(), 'Minimum', 30); change(editor(), 'Maximum', 30);
  expect(editor().getByRole('button', { name: 'Ajouter à ma classe' })).toBeDisabled();
  expect(editor().getByRole('alert')).toHaveTextContent('Budget de la classe dépassé');
  view.unmount();
  const over = [...spells, { ...first, id: 1000000000010, key: 'custom_1000000000010' }];
  render(<App initial={over} />);
  fireEvent.click(screen.getByRole('button', { name: 'Modifier Frappe 0' }));
  change(editor(), 'Minimum', 18); change(editor(), 'Maximum', 18);
  expect(editor().getByRole('button', { name: 'Enregistrer les modifications' })).toBeEnabled();
  fireEvent.click(editor().getByRole('button', { name: 'Enregistrer les modifications' }));
  expect(saved().spells.custom).toHaveLength(8);
  expect(saved().spells.custom[0].effects[0].max).toBe(18);
  expect(spellbookBalance(saved().spells.custom).valid).toBe(false);
});
