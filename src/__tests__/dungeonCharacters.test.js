import fs from 'fs';
import { TextEncoder, TextDecoder } from 'util';
import { inflateRawSync } from 'zlib';
import { readContentZip } from '../content/zip';
import { addCustomDungeonCharacter, addCustomDungeonMonster, customDungeonErrors, customDungeonRoster } from '../engine/customDungeons';
import { emptyLoadout, resolveLoadout, ITEMS, rolledEffects } from '../engine/equipment';
import { newCustomEquipment } from '../engine/customEquipment';
import { createForgedItem } from '../engine/forgedItems';
import { newAuthoredSpell } from '../engine/authoredSpells';
import { buildAtelierArchive, prepareWorkshopFile } from '../ui/atelierArchive';
import { CREATIONS_STORAGE, emptyCreations, readCreations, persistCreations, validCreations } from '../ui/creationsStore';
import { CHARACTER_ARTWORK_SPEC as SPEC } from '../ui/characterArtwork';
import { createGame, spellsOf, applyAction } from '../engine/engine';
import { runMatch } from '../arena/runner';
import { LiveMatch } from '../game/liveMatch';

let next = 0;
const newId = () => `room-import-${++next}`;
const character = () => {
  const item = { ...newCustomEquipment(7143), name: 'Couronne du gardien', level: 200, stats: { vitalite: 80, intelligence: 25 } };
  const spell = newAuthoredSpell(); spell.name = 'Éclat du gardien';
  const loadout = { ...emptyLoadout('IOP'), level: 200, base: {}, rollSeed: 55, profile: { sex: 1 },
    slots: { hat: item.id, ring1: 2469, weapon: 2416 }, customEquipment: { [item.id]: item },
    spells: { custom: [spell], order: [spell.id] } };
  const forged = createForgedItem(ITEMS[2469], rolledEffects(ITEMS[2469], loadout, 'ring1'), 77); forged.stats.pm = 1;
  loadout.forgedItems = { ring1: forged };
  return { id: 'local-profile', customCharacterId: 'local-class', name: 'Gardienne', className: 'Astrale', classId: 'IOP', loadout };
};
const room = () => ({ id: 'custom-room', name: 'Le défi des gardiens', mapId: 'arene', members: [] });
const restored = async dungeon => {
  const archive = await buildAtelierArchive({ dungeons: [dungeon] });
  return prepareWorkshopFile(new File([archive.bytes], 'donjon.zip'), { newId });
};

beforeAll(() => {
  global.TextEncoder = TextEncoder; global.TextDecoder = TextDecoder;
  if (!File.prototype.arrayBuffer) File.prototype.arrayBuffer = function() { return new Promise(resolve => {
    const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsArrayBuffer(this);
  }); };
});
beforeEach(() => localStorage.clear());

test('a room stores an independent complete character snapshot and aggregates identical copies', () => {
  const profile = character(), original = room();
  const first = addCustomDungeonCharacter(original, profile);
  const second = addCustomDungeonCharacter(first, profile);
  expect(original.members).toEqual([]); expect(first.members[0].count).toBe(1); expect(second.members[0].count).toBe(2);
  const npc = second.members[0].character;
  expect(npc).toMatchObject({ name: profile.name, className: profile.className, classId: profile.classId, loadout: profile.loadout });
  expect(npc.id).toBeUndefined(); expect(npc.customCharacterId).toBeUndefined();
  expect(npc.loadout).not.toBe(profile.loadout);
  profile.loadout.base.force = 500; profile.loadout.spells.custom[0].name = 'Autre sort'; profile.name = 'Renommé';
  expect(npc.name).toBe('Gardienne'); expect(npc.loadout.base).toEqual({});
  expect(npc.loadout.spells.custom[0].name).toBe('Éclat du gardien');
  expect(customDungeonErrors(second)).toEqual([]);
  const saved = { ...emptyCreations(), dungeons: [second] }; persistCreations(localStorage, saved);
  expect(readCreations(localStorage).value).toEqual(saved);
});

test('changed versions of the same profile and mixed monster/character groups keep their own details and eight-slot limit', () => {
  const profile = character(); let dungeon = addCustomDungeonCharacter(room(), profile);
  profile.loadout.base.intelligence = 20;
  dungeon = addCustomDungeonCharacter(dungeon, profile);
  expect(dungeon.members).toHaveLength(2);
  for (let i = 0; i < 6; i++) dungeon = addCustomDungeonMonster(dungeon, { monsterId: 494, grade: 1 });
  expect(dungeon.members.reduce((sum, m) => sum + m.count, 0)).toBe(8);
  expect(addCustomDungeonCharacter(dungeon, character())).toBe(dungeon);
  expect(addCustomDungeonMonster(dungeon, { monsterId: 147, grade: 1 })).toBe(dungeon);
  expect(customDungeonErrors(dungeon)).toEqual([]);
  const roster = customDungeonRoster(dungeon);
  expect(roster.map(f => f.id)).toEqual(['B', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8']);
  expect(roster[0].loadout.base).toEqual({}); expect(roster[1].loadout.base.intelligence).toBe(20);
  expect(roster.every(f => f.team === 'B')).toBe(true);
});

test('exporting only the dungeon carries custom equipment, exact FM, spell order and appearance without any source library', async () => {
  const profile = character(); profile.loadout.artworkId = 'shape-v1-warden-378bc2';
  const dungeon = addCustomDungeonCharacter(room(), profile);
  const archive = await restored(dungeon);
  expect(archive.characters).toEqual([]); expect(archive.equipment).toEqual([]);
  const imported = archive.dungeons[0], npc = imported.members[0].character;
  expect(npc.loadout.slots.hat).not.toBe(profile.loadout.slots.hat);
  expect(npc.loadout.customEquipment[npc.loadout.slots.hat].name).toBe('Couronne du gardien');
  expect(npc.loadout.forgedItems).toEqual(profile.loadout.forgedItems);
  expect(npc.loadout.spells).toEqual(profile.loadout.spells);
  expect(npc.loadout.artworkId).toBe(profile.loadout.artworkId);
  expect(resolveLoadout(npc.classId, npc.loadout).stats).toEqual(resolveLoadout(profile.classId, profile.loadout).stats);
  persistCreations(localStorage, { ...emptyCreations(), dungeons: [imported] });
  expect(Object.keys(localStorage)).toEqual([CREATIONS_STORAGE]);
  expect(customDungeonErrors(readCreations(localStorage).value.dungeons[0])).toEqual([]);
});

test('PNG assets used only by an embedded character are bundled and remapped on fresh import', async () => {
  const profile = character(); profile.loadout.artworkId = 'only-in-room';
  Object.assign(profile.loadout.spells.custom[0], { iconArtworkId: 'only-in-spell', iconFile: 'icons/ember.png' });
  const images = Object.fromEntries(SPEC.files.map(file => [file.name, new File([fs.readFileSync(`public/templates/character-artwork/example/${file.name}`)], file.name)]));
  const template = await readContentZip(fs.readFileSync('public/templates/content-packages/example-class-with-artwork.zip'), packed => new Uint8Array(inflateRawSync(packed)));
  const icons = { 'icons/ember.png': new File([template.get('icons/ember.png')], 'icons/ember.png') };
  const dungeon = addCustomDungeonCharacter(room(), profile);
  const archive = await buildAtelierArchive({ dungeons: [dungeon] }, { readArtwork: async id => {
    expect(['only-in-room', 'only-in-spell']).toContain(id); return { id, name: 'Gardienne', images: id === 'only-in-room' ? images : icons };
  } });
  const verifyPixels = jest.fn();
  const imported = await prepareWorkshopFile(new File([archive.bytes], 'donjon.zip'), { newId, verifyPixels });
  expect(imported.records).toHaveLength(2); expect(verifyPixels).toHaveBeenCalledTimes(10);
  expect(imported.dungeons[0].members[0].character.loadout.artworkId).toBe(imported.records[0].id);
  expect(imported.records[0].id).not.toBe('only-in-room');
  expect(imported.dungeons[0].members[0].character.loadout.spells.custom[0].iconArtworkId).toBe(imported.records[1].id);
  expect(imported.records[1].images['icons/ember.png']).toBeDefined();
});

test('reimporting a room with characters preserves actual attacks, gear stats and separate runtime copies', async () => {
  const profile = character();
  const dungeon = addCustomDungeonCharacter(addCustomDungeonCharacter(room(), profile), profile);
  const imported = (await restored(dungeon)).dungeons[0];
  const play = room => {
    const roster = customDungeonRoster(room);
    expect(roster[0].loadout).not.toBe(roster[1].loadout);
    const { state } = createGame({ mapId: room.mapId, seed: 16, fighters: [{ id: 'A', team: 'A', monsterId: 494, monsterGrade: 5 }, ...roster] });
    state.board.obstacles = {}; state.currentIndex = state.order.indexOf('B');
    state.fighters.B.pos = { x: 3, y: 3 }; state.fighters.A.pos = { x: 4, y: 3 }; state.fighters.B.pa = 20;
    const spell = Object.values(spellsOf(state.fighters.B)).find(s => !s.isWeapon);
    const result = applyAction(state, { type: 'CAST', spell: spell.key, target: state.fighters.A.pos });
    expect(result.ok).toBe(true); expect(result.events.some(e => e.t === 'damage')).toBe(true);
    expect(state.fighters.B.isMonster).toBe(false);
    return { damage: result.events.filter(e => e.t === 'damage'), stats: state.fighters.B.stats, hp: state.fighters.B.maxHp };
  };
  expect(play(imported)).toEqual(play(dungeon));
});

test('both manual and automatic fights give room characters a working default AI without an external bot', () => {
  const dungeon = addCustomDungeonCharacter(room(), character());
  const pass = () => ({ type: 'PASS' });
  const match = new LiveMatch({ mode: 'custom', dungeon, seed: 15, playerClass: 'IOP', botDecide: pass });
  match.ready(); match.state.currentIndex = match.state.order.indexOf('B'); match.state.board.obstacles = {};
  match.state.fighters.B.pos = { x: 3, y: 3 }; match.state.fighters.A.pos = { x: 4, y: 3 };
  const events = [];
  for (let i = 0; i < 8 && match.current().id === 'B' && !match.over; i++) events.push(...match.botStep().events);
  expect(events.some(e => e.t === 'damage' && e.source === 'B')).toBe(true);
  expect(events.some(e => e.t === 'bot_error')).toBe(false);
  const result = runMatch({ mode: 'custom', dungeon, seed: 16, classes: { A: 'IOP' }, bots: { A: { name: 'Testeur', decide: pass } }, collectFrames: false });
  expect(result.events.some(e => e.t === 'cast' && e.fighter === 'B')).toBe(true);
  expect(result.stats.B.errors).toBe(0); expect(result.stats.B.invalid).toBe(0);
  expect(result.events.filter(e => e.t === 'bot_error')).toEqual([]);
  expect(result.config.dungeon).toEqual(dungeon);
});

test.each([
  ['missing snapshot', member => { member.character.loadout = null; }],
  ['unknown class', member => { member.character.classId = 'UNKNOWN'; }],
  ['ambiguous member', member => { member.monsterId = 494; member.grade = 1; }],
  ['nine copies', member => { member.count = 9; }],
])('invalid member fails storage and combat validation: %s', (_, edit) => {
  const dungeon = addCustomDungeonCharacter(room(), character()); edit(dungeon.members[0]);
  expect(validCreations({ ...emptyCreations(), dungeons: [dungeon] })).toBe(false);
  expect(customDungeonErrors(dungeon).length).toBeGreaterThan(0);
  expect(() => customDungeonRoster(dungeon)).toThrow();
});

test('over-budget embedded equipment stays editable but cannot enter a fight', async () => {
  const profile = character(); profile.loadout.customEquipment[profile.loadout.slots.hat].stats.pa = 20;
  const dungeon = addCustomDungeonCharacter(room(), profile);
  expect(validCreations({ ...emptyCreations(), dungeons: [dungeon] })).toBe(true);
  expect(customDungeonErrors(dungeon).length).toBeGreaterThan(0);
  expect(() => customDungeonRoster(dungeon)).toThrow();
  const archive = await restored(dungeon);
  expect(archive.warnings.length).toBeGreaterThan(0);
  expect(() => customDungeonRoster(archive.dungeons[0])).toThrow();
});
