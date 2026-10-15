import fs from 'fs';
import { TextEncoder, TextDecoder } from 'util';
import { customMapErrors, resolveCustomMap } from '../engine/customMaps';
import { createGame, applyAction, spellsOf, getView } from '../engine/engine';
import { customDungeonErrors } from '../engine/customDungeons';
import { emptyLoadout, weaponSpell } from '../engine/equipment';
import { newAuthoredSpell, authoredSpellErrors } from '../engine/authoredSpells';
import { newCustomEquipment, customEquipmentItem } from '../engine/customEquipment';
import { validSpellVisual, ORIGINAL_EFFECTS } from '../visuals/spellVisuals';
import { buildAtelierArchive, prepareAtelierFiles } from '../ui/atelierArchive';
import { readContentZip } from '../content/zip';
import { PeerMatch, peerSettings, stateHash } from '../game/peerMatch';
import { LiveMatch } from '../game/liveMatch';
import { runMatch } from '../arena/runner';
global.TextEncoder = TextEncoder; global.TextDecoder = TextDecoder;
const battlefield = require('../../examples/winterfell/battlefield.cjs');
const copy = value => JSON.parse(JSON.stringify(value));
const fx = { version: 1, kind: 'ice-lance', color: '#66bde6', accent: '#e3fbff', durationMs: 1000 };
const room = () => ({ id: 'original-test', name: 'Cour du Nord', mapId: battlefield.id, battlefield: copy(battlefield), members: [{ monsterId: 494, grade: 1, count: 1 }] });
const cast = (visual = fx) => {
  const raw = { ...newAuthoredSpell(), visualEffect: visual }; delete raw.visualSpellId;
  return raw;
};
const fighter = { id: 'A', team: 'A', classId: 'IOP', loadout: { ...emptyLoadout('IOP'), level: 200, spells: { custom: [cast()] } } };

test('an embedded battlefield owns its exact geometry, blockers, placements and display name', () => {
  expect(customMapErrors(battlefield)).toEqual([]);
  expect(customDungeonErrors(room())).toEqual([]);
  const { state } = createGame({ mapId: battlefield.id, battlefield, fighters: [fighter, { id: 'B', team: 'B', monsterId: 494, monsterGrade: 1 }], placement: true });
  expect(state.board.name).toBe(battlefield.name);
  expect(state.board.originalVisuals).toBe(true);
  expect(state.placement.cells.A).toEqual(battlefield.startingCells[0]);
  expect(state.placement.cells.B).toEqual(battlefield.startingCells[1]);
  expect(state.board.obstacles['6,6']).toMatchObject({ blocksMove: true, blocksLos: false, prop: 'brazier' });
  expect(state.board.obstacles['4,4']).toMatchObject({ blocksMove: true, blocksLos: true });
  expect(() => createGame({ mapId: 'arene', battlefield, fighters: [] })).toThrow('identity');
  const other = copy(battlefield); other.obstacles = [];
  expect(Object.keys(resolveCustomMap(other).obstacles)).toHaveLength(0);
  expect(Object.keys(resolveCustomMap(battlefield).obstacles)).toHaveLength(5);
});

test.each([
  map => { map.startingCells[1][0] = map.startingCells[0][0]; },
  map => { map.startingCells[0][0] = { x: 6, y: 6 }; },
  map => { map.background.file = '../courtyard.png'; },
  map => { map.background.width = 4096; },
  map => { map.background.hw = 128; },
  map => { map.obstacles[0].type = 'lava'; },
  map => { map.obstacles[0].prop = 'external-url'; },
  map => { map.width = 100; },
  map => { map.obstacles = Array.from({ length: 13 }, (_, x) => ({ x, y: 6, type: 'WALL' })); },
])('invalid or disconnected geometry cannot reach the combat engine (%#)', mutate => {
  const map = copy(battlefield); mutate(map);
  expect(customMapErrors(map).length).toBeGreaterThan(0);
  expect(() => resolveCustomMap(map)).toThrow();
});

test('original effects survive engine casts, AI views and weapon construction without a client visual ID', () => {
  for (const kind of ORIGINAL_EFFECTS) expect(validSpellVisual({ ...fx, kind })).toBe(true);
  expect(authoredSpellErrors(cast())).toEqual([]);
  for (const visualEffect of [{ ...fx, kind: 'javascript' }, { ...fx, color: 'url(x)' }, { ...fx, durationMs: 999999 }, { ...fx, url: 'https://example.org' }]) {
    expect(validSpellVisual(visualEffect)).toBe(false); expect(authoredSpellErrors(cast(visualEffect)).length).toBeGreaterThan(0);
  }
  const { state } = createGame({ fighters: [fighter, { id: 'B', team: 'B', monsterId: 494, monsterGrade: 1 }] });
  state.currentIndex = state.order.indexOf('A'); state.fighters.A.pos = { x: 3, y: 3 }; state.fighters.B.pos = { x: 4, y: 3 };
  const spell = Object.values(spellsOf(state.fighters.A)).find(s => s.visualEffect);
  const result = applyAction(state, { type: 'CAST', spell: spell.key, target: state.fighters.B.pos });
  expect(result.ok).toBe(true);
  const event = result.events.find(e => e.t === 'cast');
  expect(event.visualEffect).toEqual(fx); expect(event.visualSpellId).toBeUndefined();
  expect(getView(state, 'A').you.spells.find(s => s.key === spell.key).visualEffect).toEqual(fx);
  const item = newCustomEquipment(7195); item.weapon.visualEffect = fx;
  expect(weaponSpell(customEquipmentItem(item)).visualEffect).toEqual(fx);
});

test('manual, automated and host-authoritative entry points all use the supplied battlefield', () => {
  const dungeon = room(), decide = () => ({ type: 'PASS' });
  const live = new LiveMatch({ mode: 'custom', dungeon, playerClass: 'IOP', botClass: 'IOP', botName: 'IA', botDecide: decide, seed: 3 });
  const auto = runMatch({ mode: 'custom', dungeon, classes: { A: 'IOP', B: 'IOP' }, bots: { A: { name: 'A', decide }, B: { name: 'B', decide } }, collectFrames: false, seed: 3 });
  const settings = peerSettings({ mode: 'custom', mapId: battlefield.id, battlefield, seed: 3 });
  const units = [{ id: 'u1', team: 'A', owner: 'host', controller: 'player', member: { character: { name: 'Héros', classId: 'IOP', loadout: emptyLoadout('IOP') }, count: 1 } },
    { id: 'u2', team: 'B', owner: 'host', controller: 'ai', member: dungeon.members[0] }];
  const host = new PeerMatch(settings, units, 'host');
  const guest = new PeerMatch(settings, units, 'guest', { state: copy(host.state), events: host.initialEvents });
  for (const state of [live.state, auto.finalState, host.state, guest.state]) {
    expect(state.mapId).toBe(battlefield.id); expect(state.board.background).toEqual(battlefield.background);
    expect(state.board.obstacles).toEqual(resolveCustomMap(battlefield).obstacles);
  }
  expect(stateHash(guest.state)).toBe(stateHash(host.state));
});

test('a map PNG is included once, dimension-checked, independently remapped and re-exportable', async () => {
  global.TextEncoder = TextEncoder; global.TextDecoder = TextDecoder;
  const bytes = new Uint8Array(fs.readFileSync('public/adventures/winterfell/assets/battlefield/courtyard.png'));
  const dungeon = room(); delete dungeon.battlefield.background.propsFile;
  const image = { arrayBuffer: async () => bytes.buffer };
  const zip = await buildAtelierArchive({ dungeons: [dungeon] }, { readArtwork: async id => ({ id, images: { 'courtyard.png': image } }) });
  const files = await readContentZip(zip.bytes, undefined, { limits: { zipBytes: 10000000, expandedBytes: 10000000, pngBytes: 8000000, jsonBytes: 1000000, files: 10 }, allowName: () => true });
  let id = 0; const verifyPixels = jest.fn();
  const prepared = await prepareAtelierFiles(files, { newId: () => `original-${++id}`, verifyPixels });
  expect(prepared.warnings).toEqual([]); expect(prepared.records).toHaveLength(1);
  expect(verifyPixels).toHaveBeenCalledWith(expect.any(File), { width: 1536, height: 1024, frames: 1, pose: 'portrait' });
  expect(prepared.dungeons[0].battlefield.background.artworkId).toBe(prepared.records[0].id);
  expect(dungeon.battlefield.background.artworkId).toBe('winterfell-battlefield-v2');
  const bad = JSON.parse(new TextDecoder().decode(files.get('atelier.json'))); bad.dungeons[0].battlefield.background.width = 1537;
  files.set('atelier.json', new TextEncoder().encode(JSON.stringify(bad)));
  await expect(prepareAtelierFiles(files, { verifyPixels })).rejects.toThrow('dimensions');
});
