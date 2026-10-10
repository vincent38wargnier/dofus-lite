import { act, renderHook } from '@testing-library/react';
import fs from 'fs';
import { castFallbackSound, criticalSound, movementSounds } from '../ui/combatSounds';
import useCombatSounds from '../ui/useCombatSounds';
import { resolveSound } from '../ui/RetroSound';
import MONSTERS from '../engine/monsterData.json';

const mockStopScope = jest.fn();
const mockPlayer = { stopScope: mockStopScope };
jest.mock('../ui/RetroAssets', () => ({
  useRetroSoundPlayer: () => mockPlayer,
  getActorId: (_assets, fighter) => fighter.actorId,
}));
const origin = { x: 0, y: 0 };
const fighter = { id: 'A', name: 'Vous', classId: 'IOP', team: 'A', actorId: '80', hp: 100, pos: origin };
const actor = { animations: ['anim1R', 'anim1L', 'walkR', 'staticR'], sounds: { anim1R: ['native'], anim1L: ['native'], walkR: ['step'] } };
const assets = { actors: { 80: actor }, spells: { 142: { animation: 'anim1', sounds: [] } },
  audio: { combat: { criticalHit: 'BIP', criticalFailure: 'COUP_CRITIQUE' },
    cues: Object.fromEntries(['native', 'step', 'BIP', 'COUP_CRITIQUE', 'CROCKETTE_206', 'GUERISON', 'GONFLE', 'PUNCH', 'BLOP_STEP', 'PAS_HOMME_NORMAL'].map(n => [n.toUpperCase(), { url: `${n}.mp3` }])) } };
const cast = { t: 'cast', fighter: 'A', spellId: 142, spell: 'puissance', from: origin, target: origin };

test('critical cues follow client events independently of damage or weapon rows', () => {
  expect(criticalSound({ ...cast, crit: true }, assets)).toBe('BIP');
  expect(criticalSound({ ...cast, itemId: 1, crit: true }, assets)).toBe('BIP');
  expect(criticalSound({ t: 'spell_fail' }, assets)).toBe('COUP_CRITIQUE');
  expect(criticalSound({ t: 'damage', crit: true }, assets)).toBeNull();
  expect(criticalSound(cast, assets)).toBeNull();
});

test('native caster/effect sound suppresses fallbacks; silent buffs, summons and heals differ', () => {
  const spell = { effects: [{ kind: 'summon' }] };
  expect(castFallbackSound(cast, spell, actor, assets)).toBeNull();
  const silent = { ...actor, sounds: {} };
  expect(castFallbackSound(cast, spell, silent, assets)).toBe('CROCKETTE_206');
  expect(castFallbackSound(cast, { effects: [{ kind: 'buffStat' }] }, silent, assets)).toBe('GONFLE');
  expect(castFallbackSound(cast, { effects: [{ kind: 'heal' }] }, silent, assets)).toBe('GUERISON');
  expect(castFallbackSound(cast, spell, silent, { ...assets, spells: { 142: { animation: 'anim1', sounds: ['native'] } } })).toBeNull();
  expect(castFallbackSound(cast, spell, silent, { ...assets, spells: { 142: { skipAnimation: true } } })).toBeNull();
});

test('movement prefers the creature recording and covers silent client sprites', () => {
  expect(movementSounds(actor, fighter, assets)).toEqual(['step']);
  expect(movementSounds({ sounds: {} }, { name: 'Blop Coco Royal' }, assets)).toEqual(['BLOP_STEP']);
  expect(movementSounds({ sounds: {} }, fighter, assets)).toEqual(['PAS_HOMME_NORMAL']);
});

describe('combat sound lifetime', () => {
  beforeEach(() => { jest.useFakeTimers(); window.dofusLiteSound = jest.fn(); mockStopScope.mockClear(); });
  afterEach(() => { jest.useRealTimers(); delete window.dofusLiteSound; });
  const setup = () => renderHook(({ frame, events, scene = 'map:1' }) =>
    useCombatSounds(frame, events, { A: fighter, B: { ...fighter, id: 'B' } }, assets, {}, scene),
  { initialProps: { frame: 0, events: [] } });
  const names = () => window.dofusLiteSound.mock.calls.map(c => c[0]);

  test('one critical sound per action, with no repeat on rerender or damage rows', () => {
    const { rerender } = setup();
    const events = [{ ...cast, crit: true }, ...Array.from({ length: 3 }, () => ({ t: 'damage', target: 'B', amount: 20 }))];
    rerender({ frame: 1, events }); rerender({ frame: 1, events: [...events] });
    expect(names()).toEqual(['BIP']);
    rerender({ frame: 2, events: [{ t: 'spell_fail', fighter: 'B' }] });
    expect(names()).toEqual(['BIP', 'COUP_CRITIQUE']);
  });

  test('one-cell movement is audible; unrelated frames do not interrupt a longer path', () => {
    const { rerender } = setup();
    rerender({ frame: 1, events: [{ t: 'move', fighter: 'A', path: [origin, { x: 1, y: 0 }] }] });
    act(() => jest.advanceTimersByTime(1000));
    expect(names()).toEqual(['step']);
    rerender({ frame: 2, events: [{ t: 'move', fighter: 'A', path: [origin, { x: 1, y: 0 }, { x: 2, y: 0 }] }] });
    rerender({ frame: 3, events: [{ t: 'cast', fighter: 'B', spellId: 142, from: origin, target: origin }] });
    act(() => jest.advanceTimersByTime(500));
    expect(names()).toEqual(['step', 'step', 'step']);
  });

  test('new actions, rewinds and leaving combat cancel scheduled steps', () => {
    const { rerender, unmount } = setup();
    const move = [{ t: 'move', fighter: 'A', path: [origin, { x: 1, y: 0 }, { x: 2, y: 0 }] }];
    rerender({ frame: 1, events: move });
    rerender({ frame: 2, events: [cast] });
    act(() => jest.advanceTimersByTime(500)); expect(names()).toEqual(['step']);
    rerender({ frame: 3, events: move }); rerender({ frame: 0, events: [] });
    act(() => jest.advanceTimersByTime(500)); expect(names()).toHaveLength(2);
    rerender({ frame: 1, events: move }); unmount();
    act(() => jest.advanceTimersByTime(500)); expect(names()).toHaveLength(3);
    expect(mockStopScope).toHaveBeenCalled();
  });
});

(fs.existsSync('public/dofus-local/manifest.json') ? test : test.skip)('every imported dungeon monster has audible casts and movement in both directions', () => {
  const manifest = JSON.parse(fs.readFileSync('public/dofus-local/manifest.json', 'utf8'));
  let spells = 0, native = 0, fallback = 0;
  for (const monster of Object.values(MONSTERS.monsters)) {
    const sprite = manifest.actors[manifest.monsters[monster.id]];
    expect(sprite?.sounds).toBeDefined();
    if (Object.values(monster.grades).some(g => g.basePm > 0)) {
      expect(movementSounds(sprite, monster, manifest).some(c => resolveSound(manifest.audio, c))).toBe(true);
    }
    const unique = new Map(Object.values(monster.grades).flatMap(g => g.spells).map(s => [s.id, s]));
    for (const spell of unique.values()) {
      const info = manifest.spells[spell.id];
      if (info?.skipAnimation) continue;
      for (const suffix of ['R', 'L']) {
        const label = `${info?.animation || 'anim0'}${suffix}`;
        const hasNative = [...(sprite.sounds[label] || []), ...(info?.sounds || [])].some(c => resolveSound(manifest.audio, c));
        const cue = castFallbackSound({ ...cast, spellId: spell.id }, spell, sprite, manifest, { suffix, mirror: false });
        expect(hasNative || !!resolveSound(manifest.audio, cue)).toBe(true);
        if (hasNative) native++; else fallback++;
        spells++;
      }
    }
  }
  expect(spells).toBeGreaterThan(1000);
  expect(native).toBeGreaterThan(0);
  expect(fallback).toBeGreaterThan(0);
});
