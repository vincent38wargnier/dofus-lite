import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { CHARACTER_SHAPES, EQUIPMENT_SHAPES, equipmentShapeImage, characterShapeId } from '../visuals/customShapes';
import { builtInCharacterArtwork, CHARACTER_ARTWORK_SPEC } from '../ui/characterArtwork';
import { newCustomEquipment, customEquipmentItem, validateCustomEquipment, equipCustomItem } from '../engine/customEquipment';
import { emptyLoadout, itemIcon, weaponSpell, resolveLoadout } from '../engine/equipment';
import { EQUIPMENT_FAMILIES, EQUIPMENT_REFERENCES } from '../engine/equipmentBalance';
import { createGame } from '../engine/engine';
import { isLoadout } from '../ui/loadoutStore';
import CharacterArtworkEditor from '../ui/CharacterArtworkEditor';
import { RetroPortrait } from '../ui/RetroAssets';
import CustomCharacterSprite from '../ui/CustomCharacterSprite';

test('all equipment families have local shapes; colour survives combat and weapon icons without affecting budgets', () => {
  for (const family of EQUIPMENT_FAMILIES) {
    const reference = EQUIPMENT_REFERENCES.find(item => family.types.includes(item.type));
    const draft = newCustomEquipment(reference.id);
    for (const shape of EQUIPMENT_SHAPES) expect(equipmentShapeImage(reference.type, { shape: shape.id, color: '#12abef' })).toMatch(/^data:image\/svg\+xml,/);
    const legacy = { ...draft }; delete legacy.appearance;
    expect(itemIcon(customEquipmentItem(legacy))).toMatch(/dofus-local/);
    expect(validateCustomEquipment(draft).balance).toEqual(validateCustomEquipment(legacy).balance);
  }
  const weapon = { ...newCustomEquipment(2416), level: 200, appearance: { shape: 'rune', color: '#12abef' } };
  const loadout = equipCustomItem({ ...emptyLoadout('IOP'), level: 200, slots: { weapon: weapon.id } }, 'weapon', weapon);
  const state = createGame({ fighters: [{ id: 'A', classId: 'IOP', loadout }, { id: 'B', classId: 'IOP' }] }).state;
  expect(state.fighters.A.loadout.customEquipment[weapon.id].appearance).toEqual(weapon.appearance);
  const spell = weaponSpell(customEquipmentItem(weapon), state.fighters.A.loadout);
  expect(decodeURIComponent(spell.itemIcon)).toContain('#12abef');
  expect(isLoadout(JSON.parse(JSON.stringify(loadout)))).toBe(true);
});

test('saved equipment accepts only supported shapes and colours, with no SVG, external URL or extra properties', () => {
  for (const appearance of [{ shape: 'missing', color: '#12abef' }, { shape: 'rune', color: 'red' },
    { shape: 'rune', color: 'url(https://example.com)' }, { shape: 'rune', color: '#123456', svg: '<svg />' }]) {
    expect(validateCustomEquipment({ ...newCustomEquipment(), appearance }).valid).toBe(false);
    expect(equipmentShapeImage(16, appearance)).toBeNull();
  }
});

test('built-in classes render instantly without IndexedDB and carry the same small reference into combat', () => {
  for (const shape of CHARACTER_SHAPES) {
    const id = characterShapeId(shape.id, '#12abef'), artwork = builtInCharacterArtwork(id);
    const loadout = { ...emptyLoadout('IOP'), level: 200, artworkId: id };
    expect(isLoadout(loadout)).toBe(true);
    expect(resolveLoadout('IOP', loadout).bonuses).toEqual(resolveLoadout('IOP', { ...loadout, artworkId: null }).bonuses);
    const { state } = createGame({ fighters: [{ id: 'A', classId: 'IOP', loadout }, { id: 'B', classId: 'CRA' }] });
    expect(state.fighters.A.loadout.artworkId).toBe(id);
    for (const file of CHARACTER_ARTWORK_SPEC.files) {
      const svg = decodeURIComponent(artwork.images[file.name].split(',')[1]);
      const document = new DOMParser().parseFromString(svg, 'image/svg+xml');
      expect(document.querySelector('parsererror')).toBeNull();
      expect(document.documentElement.getAttribute('width')).toBe(String(file.frames * 256));
      expect(document.documentElement.getAttribute('height')).toBe('256');
    }
    const view = render(<><RetroPortrait classId="IOP" artworkId={id} /><CustomCharacterSprite artwork={artwork} direction={{ suffix: 'L', mirror: true }} /></>);
    expect(view.container.querySelector('img')).toHaveAttribute('src', artwork.images['portrait.png']);
    expect(view.container.querySelector('.custom-character-sprite')).toHaveAttribute('data-artwork-file', 'idle-back.png');
    expect(view.container.querySelector('.custom-character-sprite').style.transform).toBe('scaleX(-1)');
    view.unmount();
  }
});

test('choosing an import does not remove the current shape; source switches retain the selected colour', () => {
  const onChange = jest.fn(), id = characterShapeId('mystic', '#12abef');
  const view = render(<CharacterArtworkEditor artworkId={id} name="Ma classe" onChange={onChange} />);
  fireEvent.click(screen.getByRole('button', { name: 'Mes images' }));
  expect(onChange).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Importer les PNG' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Visuel Dofus' }));
  expect(onChange).toHaveBeenLastCalledWith(null);
  view.rerender(<CharacterArtworkEditor artworkId={null} name="Ma classe" onChange={onChange} />);
  fireEvent.click(screen.getByRole('button', { name: 'Forme personnalisée' }));
  expect(onChange).toHaveBeenLastCalledWith(id);
});
