import React from 'react';
import fs from 'fs';
import path from 'path';
import { act, render } from '@testing-library/react';
import { CHARACTER_ARTWORK_SPEC as spec, validateArtworkFiles, validateArtworkPng, characterArtworkFrame } from '../ui/characterArtwork';
import CustomCharacterSprite from '../ui/CustomCharacterSprite';
import { facing } from '../ui/retroAnimation';
import { isLoadout } from '../ui/loadoutStore';
import { emptyLoadout } from '../engine/equipment';
import { createGame } from '../engine/engine';
import { customActorCastSound } from '../ui/combatSounds';

const artwork = { id: 'test-skin', images: Object.fromEntries(spec.files.map(file => [file.name, `blob:${file.name}`])) };
const minimal = { ...artwork, images: Object.fromEntries(spec.files.filter(file => file.required).map(file => [file.name, artwork.images[file.name]])) };
const files = spec.files.map(file => ({ name: file.name, size: 1000 }));

test('the delivered PNG canvases and example images match every importer size and frame requirement', () => {
  expect(spec.files.filter(file => file.required)).toHaveLength(3);
  expect(spec.files).toHaveLength(9);
  for (const directory of ['blank', 'example']) for (const file of spec.files) {
    const data = fs.readFileSync(path.join(process.cwd(), 'public/templates/character-artwork', directory, file.name));
    expect(validateArtworkPng(file.name, Uint8Array.from(data).buffer)).toEqual(file);
  }
  expect(() => validateArtworkFiles(files)).not.toThrow();
  expect(() => validateArtworkFiles(files.filter(file => file.name.startsWith('idle') || file.name === 'portrait.png'))).not.toThrow();
});

test('reject missing images, duplicate names, unknown files, huge files and wrong PNG dimensions before storing', () => {
  expect(() => validateArtworkFiles(files.slice(1))).toThrow('portrait.png');
  expect(() => validateArtworkFiles([...files, files[0]])).toThrow('unique');
  expect(() => validateArtworkFiles([...files, { name: 'script.svg', size: 10 }])).toThrow('Fichier inconnu');
  expect(() => validateArtworkFiles(files.map(file => ({ ...file, size: 3 * 1024 * 1024 })))).toThrow('2 Mio');
  expect(() => validateArtworkFiles(files.map(file => ({ ...file, size: 2 * 1024 * 1024 })))).toThrow('12 Mio');
  expect(() => validateArtworkPng('portrait.png', new Uint8Array(24).buffer)).toThrow('PNG invalide');
  const portrait = Uint8Array.from(fs.readFileSync(path.join(process.cwd(), 'public/templates/character-artwork/example/portrait.png')));
  expect(() => validateArtworkPng('walk-front.png', portrait.buffer)).toThrow('1536 × 256');
});

test('each combat direction picks the matching front/back image and mirrors correctly, with same-direction idle fallback', () => {
  const from = { x: 2, y: 2 };
  const targets = [[{ x: 3, y: 2 }, 'front', false], [{ x: 2, y: 3 }, 'front', true],
    [{ x: 1, y: 2 }, 'back', false], [{ x: 2, y: 1 }, 'back', true]];
  for (const [to, view, mirrored] of targets) {
    const direction = facing(from, to);
    expect(direction.mirror).toBe(mirrored);
    expect(characterArtworkFrame(artwork, 'anim12', direction.suffix).name).toBe(`cast-${view}.png`);
    expect(characterArtworkFrame(artwork, 'walk', direction.suffix).name).toBe(`walk-${view}.png`);
    expect(characterArtworkFrame(artwork, 'hit', direction.suffix).name).toBe(`hit-${view}.png`);
    expect(characterArtworkFrame(minimal, 'walk', direction.suffix).name).toBe(`idle-${view}.png`);
    expect(characterArtworkFrame(minimal, 'anim12', direction.suffix).name).toBe(`idle-${view}.png`);
  }
});

test('walking loops, casts hold their last frame, and a new action restarts without replaying on hover', () => {
  jest.useFakeTimers();
  window.dofusLiteSound = jest.fn();
  const props = { artwork, direction: { suffix: 'L', mirror: true } };
  const view = render(<CustomCharacterSprite {...props} pose="walk" />);
  const sprite = () => view.container.querySelector('.custom-character-sprite');
  expect(sprite().style.transform).toBe('scaleX(-1)');
  act(() => jest.advanceTimersByTime(260));
  expect(sprite().dataset.artworkFrame).toBe('3');
  act(() => jest.advanceTimersByTime(250));
  expect(sprite().dataset.artworkFrame).toBe('0');
  view.rerender(<CustomCharacterSprite {...props} pose="anim0" restart={1} castSound="CAST" />);
  expect(sprite().dataset.artworkFrame).toBe('0');
  act(() => jest.advanceTimersByTime(900));
  expect(sprite().dataset.artworkFrame).toBe('5');
  view.rerender(<CustomCharacterSprite {...props} pose="anim0" restart={1} castSound="CAST" />);
  expect(sprite().dataset.artworkFrame).toBe('5');
  expect(window.dofusLiteSound).toHaveBeenCalledTimes(1);
  view.rerender(<CustomCharacterSprite {...props} pose="anim0" restart={2} castSound="CAST" />);
  expect(sprite().dataset.artworkFrame).toBe('0');
  expect(window.dofusLiteSound).toHaveBeenCalledTimes(2);
  view.unmount();
  expect(jest.getTimerCount()).toBe(0);
  jest.useRealTimers(); delete window.dofusLiteSound;
});

test('combat snapshots retain immutable artwork references without image data or changes to equipment bonuses', () => {
  const loadout = { ...emptyLoadout('IOP'), level: 200, artworkId: 'unique-artwork', slots: { hat: 2411 } };
  expect(isLoadout(loadout)).toBe(true);
  expect(isLoadout({ ...loadout, artworkId: {} })).toBe(false);
  const { state } = createGame({ fighters: [{ id: 'A', classId: 'IOP', loadout }, { id: 'B', classId: 'IOP', loadout: { ...loadout, artworkId: null } }] });
  expect(state.fighters.A.loadout.artworkId).toBe('unique-artwork');
  expect(state.fighters.B.loadout.artworkId).toBeNull();
  expect(state.fighters.A.maxHp).toBe(state.fighters.B.maxHp);
  loadout.artworkId = 'replacement';
  expect(state.fighters.A.loadout.artworkId).toBe('unique-artwork');
});

test('PNG actors can use their native model cast cue without replaying sounds for idle and walking', () => {
  const actor = { animations: ['staticR', 'anim0R', 'anim0L'], sounds: { anim0R: ['right'], anim0L: ['left'] } };
  const assets = { audio: { cues: { RIGHT: { url: 'one.mp3' }, LEFT: { url: 'two.mp3' } } } };
  expect(customActorCastSound(actor, 'anim0', 'R', assets)).toBe('right');
  expect(customActorCastSound(actor, 'anim0', 'L', assets)).toBe('left');
  expect(customActorCastSound(actor, 'static', 'R', assets)).toBeNull();
  expect(customActorCastSound(actor, 'walk', 'L', assets)).toBeNull();
  expect(customActorCastSound(null, 'anim0', 'L', assets)).toBeNull();
});
