import fs from 'fs';
import { newAdventure, addAdventureHero, adventureTeam } from '../engine/adventures';
import { LiveMatch } from '../game/liveMatch';
import { TextEncoder, TextDecoder } from 'util';
import { inflateRawSync } from 'zlib';
import { buildAtelierArchive, prepareAtelierFiles, prepareWorkshopFile, importWorkshopFile, ATELIER_LIMITS } from '../ui/atelierArchive';
import { writeContentZip } from '../content/zip';
import { compileContentManifest, packageExample } from '../content/contentPackage';
import { ITEMS, resolveLoadout, rolledEffects } from '../engine/equipment';
import { createForgedItem, validateForgedItem } from '../engine/forgedItems';
import { newCustomEquipment, validateCustomEquipment } from '../engine/customEquipment';
import { characterShapeId } from '../visuals/customShapes';
import { CREATION_SPELLS } from '../ui/creationCatalogue';
import { newAuthoredSpell, normalizeAuthoredSpell } from '../engine/authoredSpells';
import { createGame, applyAction, spellsOf } from '../engine/engine';
import { customDungeonRoster } from '../engine/customDungeons';
import { withDungeonRooms, roomSnapshot } from '../engine/dungeonCampaign';
import { CREATIONS_STORAGE, emptyCreations, validCreations, persistCreationsTogether } from '../ui/creationsStore';
import { CHARACTER_ARTWORK_SPEC as SPEC } from '../ui/characterArtwork';

let serial = 0;
const newId = () => `archive-${++serial}`;
const entry = type => compileContentManifest(packageExample(type), { newId }).entry;
const nativeSpell = id => CREATION_SPELLS.find(spell => spell.id === id).grades.at(-1);
const item = () => ({ ...newCustomEquipment(7143), name: 'Couronne exportée', level: 200, stats: { intelligence: 30, vitalite: 100 } });
const file = bytes => new File([bytes], 'archive.zip', { type: 'application/zip' });
const options = { newId, equipmentId: () => 1000008000, verifyPixels: jest.fn() };
const prepare = bytes => prepareWorkshopFile(file(bytes), options);
const manifestFiles = manifest => new Map([['atelier.json', new TextEncoder().encode(JSON.stringify(manifest))]]);
const png = name => new Uint8Array(fs.readFileSync(`public/templates/character-artwork/example/${name}`));

beforeAll(() => {
  global.TextEncoder = TextEncoder; global.TextDecoder = TextDecoder;
  if (!File.prototype.arrayBuffer) File.prototype.arrayBuffer = function () { return new Promise(resolve => {
    const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsArrayBuffer(this);
  }); };
});
beforeEach(() => { localStorage.clear(); options.verifyPixels.mockClear(); });

test('future campaign rooms export their own characters, equipment and artwork into a fresh library', async () => {
  const first = entry('dungeon'), second = entry('dungeon'), character = entry('class'), equipment = item();
  character.loadout.artworkId = 'future-room-art'; character.loadout.slots.hat = equipment.id;
  character.loadout.customEquipment = { [equipment.id]: equipment };
  second.members = [{ character, count: 1 }];
  const dungeon = withDungeonRooms(first, [roomSnapshot(first), roomSnapshot(second)]);
  const images = Object.fromEntries(SPEC.files.map(spec => [spec.name, new File([png(spec.name)], spec.name)]));
  const archive = await buildAtelierArchive({ dungeons: [dungeon] }, { readArtwork: async id => ({ id, images }) });
  expect(archive.manifest.characters).toHaveLength(0); expect(archive.manifest.artwork).toHaveLength(1);
  const imported = await prepare(archive.bytes), future = imported.dungeons[0].rooms[1].members[0].character;
  expect(future.loadout.artworkId).toBe(imported.records[0].id);
  expect(future.loadout.customEquipment[future.loadout.slots.hat].stats).toEqual(equipment.stats);
  expect(future.loadout.slots.hat).not.toBe(equipment.id);
  expect(new LiveMatch({ mode: 'custom', dungeon: imported.dungeons[0], playerClass: 'IOP', roomIndex: 1, seed: 1 }).state.fighters.B.name).toBe(character.name);
  await expect(buildAtelierArchive({ dungeons: [dungeon] }, { readArtwork: async () => null })).rejects.toThrow();
});

test('a mixed ZIP preserves spells, appearance, stats, exact FM rolls and immutable equipment versions', async () => {
  const equipment = item(), character = entry('class'), dungeon = entry('dungeon');
  const loadout = character.loadout;
  loadout.artworkId = characterShapeId('warden', '#378bc2');
  loadout.spells.custom.push(nativeSpell(142)); loadout.spells.order = loadout.spells.custom.map(s => s.id).reverse();
  loadout.customEquipment = { [equipment.id]: equipment }; loadout.slots.hat = equipment.id;
  loadout.slots.ring1 = 153;
  loadout.forgedItems = { ring1: createForgedItem(ITEMS[153], rolledEffects(ITEMS[153], loadout, 'ring1'), 71) };
  loadout.forgedItems.ring1.stats.pa = 1;
  expect(validateForgedItem(ITEMS[153], loadout.forgedItems.ring1)).toBe('');
  const original = JSON.stringify({ character, dungeon, equipment });
  const archive = await buildAtelierArchive({ characters: [character], dungeons: [dungeon], equipment: [equipment] });
  const result = await prepare(archive.bytes);
  expect(result.records).toEqual([]); expect(validCreations({ ...result, version: 1 })).toBe(true);
  const copy = result.characters[0];
  expect(copy.id).not.toBe(character.id); expect(result.dungeons[0].id).not.toBe(dungeon.id);
  expect(copy.loadout.spells).toEqual(loadout.spells);
  expect(copy.loadout.artworkId).toBe(loadout.artworkId);
  expect(copy.loadout.forgedItems).toEqual(loadout.forgedItems);
  expect(copy.loadout.slots.hat).toBe(result.equipment[0].id);
  expect(copy.loadout.customEquipment[copy.loadout.slots.hat]).toEqual(result.equipment[0]);
  expect(validateCustomEquipment(result.equipment[0]).valid).toBe(true);
  expect(resolveLoadout(copy.classId, copy.loadout).stats).toEqual(resolveLoadout(character.classId, loadout).stats);
  expect(result.dungeons[0].members).toEqual(dungeon.members);
  expect(JSON.stringify({ character, dungeon, equipment })).toBe(original);
});

test.each(['characters', 'dungeons', 'equipment'])('a single %s archive is independently importable', async key => {
  const value = key === 'characters' ? entry('class') : key === 'dungeons' ? entry('dungeon') : item();
  const { bytes } = await buildAtelierArchive({ [key]: [value] });
  const result = await prepare(bytes);
  expect(result[key]).toHaveLength(1); expect(result[key][0].name).toBe(value.name);
  expect(result[key][0].id).not.toBe(value.id);
});

test('equipped snapshots with the same old ID but different definitions stay independent', async () => {
  const equipment = item(), a = entry('class'), b = entry('class');
  for (const [i, character] of [a, b].entries()) {
    character.loadout.slots.hat = equipment.id;
    character.loadout.customEquipment = { [equipment.id]: { ...equipment, stats: { vitalite: 50 + i * 50 } } };
  }
  const result = await prepare((await buildAtelierArchive({ characters: [a, b], equipment: [equipment] })).bytes);
  const hats = result.characters.map(c => c.loadout.slots.hat);
  expect(new Set([...hats, result.equipment[0].id]).size).toBe(3);
  expect(result.characters.map((c, i) => c.loadout.customEquipment[hats[i]].stats.vitalite)).toEqual([50, 100]);
});

test('the reimported class and creatures keep identical buffs, damage and legal casts in combat', async () => {
  const character = entry('class'), dungeon = entry('dungeon');
  const result = await prepare((await buildAtelierArchive({ characters: [character], dungeons: [dungeon] })).bytes);
  const play = (hero, room) => {
    const { state } = createGame({ mapId: room.mapId, seed: 1, fighters: [
      { id: 'A', team: 'A', classId: hero.classId, loadout: hero.loadout }, ...customDungeonRoster(room),
    ] });
    state.board.obstacles = {}; state.currentIndex = state.order.indexOf('B');
    state.fighters.B.pos = { x: 3, y: 3 }; state.fighters.A.pos = { x: 4, y: 3 }; state.fighters.B.pa = 10;
    const book = Object.values(spellsOf(state.fighters.B));
    const boost = applyAction(state, { type: 'CAST', spell: book[1].key, target: state.fighters.B.pos });
    expect(boost.ok).toBe(true);
    const hit = applyAction(boost.state, { type: 'CAST', spell: book[0].key, target: state.fighters.A.pos });
    expect(hit.ok).toBe(true);
    return { playerSpells: spellsOf(state.fighters.A), targetHp: hit.state.fighters.A.hp, events: hit.events };
  };
  expect(play(result.characters[0], result.dungeons[0])).toEqual(play(character, dungeon));
});

test('artwork is deduplicated and its portrait and nine animation files travel with all owners', async () => {
  const a = entry('class'), b = entry('class'), dungeon = entry('dungeon');
  a.loadout.artworkId = b.loadout.artworkId = dungeon.members[0].customMonster.artworkId = 'shared-art';
  const images = Object.fromEntries(SPEC.files.map(spec => [spec.name, new File([png(spec.name)], spec.name)]));
  const readArtwork = jest.fn(async () => ({ id: 'shared-art', name: 'Héroïne', images }));
  const archive = await buildAtelierArchive({ characters: [a, b], dungeons: [dungeon] }, { readArtwork });
  expect(readArtwork).toHaveBeenCalledTimes(1); expect(archive.manifest.artwork).toHaveLength(1);
  const result = await prepare(archive.bytes);
  expect(result.records).toHaveLength(1); expect(options.verifyPixels).toHaveBeenCalledTimes(9);
  const id = result.records[0].id;
  expect(result.characters.map(c => c.loadout.artworkId)).toEqual([id, id]);
  expect(result.dungeons[0].members[0].customMonster.artworkId).toBe(id);
  for (const name of Object.keys(images)) expect(new Uint8Array(await result.records[0].images[name].arrayBuffer())).toEqual(png(name));
  const second = await prepare(archive.bytes);
  expect(second.records[0].id).not.toBe(id); expect(second.characters[0].id).not.toBe(result.characters[0].id);
});

test('imported class and dungeon packages retain custom spell icons across another export', async () => {
  // AI templates include actual PNG spell icons; use their established reader.
  const { readContentZip } = require('../content/zip');
  const { prepareContentFiles } = require('../ui/contentPackageImport');
  const bytes = new Uint8Array(fs.readFileSync('public/templates/content-packages/example-class-with-artwork.zip'));
  const imported = await prepareContentFiles(await readContentZip(bytes, packed => new Uint8Array(inflateRawSync(packed))), options);
  const source = new Map(imported.records.map(record => [record.id, record]));
  const archive = await buildAtelierArchive({ characters: [imported.entry] }, { readArtwork: id => source.get(id) });
  const result = await prepare(archive.bytes);
  const spell = result.characters[0].loadout.spells.custom.find(s => s.iconArtworkId);
  expect(spell).toBeDefined();
  expect(result.records.find(record => record.id === spell.iconArtworkId).images[spell.iconFile]).toBeDefined();
});

test('archives preserve unfinished or old over-budget drafts without bypassing admission checks', async () => {
  const character = entry('class'), equipment = { ...item(), stats: { pa: 15 } };
  const spell = newAuthoredSpell(); spell.effects[0].min = 100; spell.effects[0].max = 100;
  spell.pa = 1;
  character.loadout.spells = { custom: [normalizeAuthoredSpell(spell)] };
  const dungeon = { id: newId(), name: 'Salle à terminer', mapId: 'kanojedo', members: [] };
  // Use a map already present in the actual template.
  dungeon.mapId = entry('dungeon').mapId;
  const archive = await buildAtelierArchive({ characters: [character], dungeons: [dungeon], equipment: [equipment] });
  const result = await prepare(archive.bytes);
  expect(result.warnings).toHaveLength(3);
  expect(resolveLoadout(character.classId, result.characters[0].loadout).valid).toBe(false);
  expect(validateCustomEquipment(result.equipment[0]).valid).toBe(false);
});

test.each([
  ['version', manifest => { manifest.version = 99; }],
  ['duplicate class', manifest => { manifest.characters.push(manifest.characters[0]); }],
  ['unknown equipment', manifest => { manifest.equipment[0].referenceId = 123456789; }],
  ['unknown map', manifest => { manifest.dungeons[0].mapId = 'missing-map'; }],
  ['missing images', manifest => { manifest.characters[0].loadout.artworkId = 'not-in-zip'; }],
  ['unlisted images', manifest => { manifest.artwork.push({ id: 'unused', images: {} }); }],
  ['prototype', manifest => { manifest.characters[0].package = JSON.parse('{"__proto__":{"polluted":true}}'); }],
])('rejects malformed archive: %s', async (_, change) => {
  const { manifest } = await buildAtelierArchive({ characters: [entry('class')], dungeons: [entry('dungeon')], equipment: [item()] });
  change(manifest);
  await expect(prepareAtelierFiles(manifestFiles(manifest), options)).rejects.toThrow();
});

test('rejects path traversal, extra files, corrupted bytes and incomplete artwork', async () => {
  const { bytes, manifest } = await buildAtelierArchive({ equipment: [item()] });
  await expect(prepare(writeContentZip(new Map([['../atelier.json', '{}']])))).rejects.toThrow(/chemin/);
  const files = manifestFiles(manifest); files.set('assets/a1/unused.png', png('portrait.png'));
  await expect(prepare(writeContentZip(files))).rejects.toThrow(/non déclaré/);
  const broken = bytes.slice(); broken[50] ^= 1;
  await expect(prepare(broken)).rejects.toThrow();
  const character = entry('class'); character.loadout.artworkId = 'incomplete';
  await expect(buildAtelierArchive({ characters: [character] }, { readArtwork: async () => ({ images: {} }) })).rejects.toThrow(/incomplète/);
});

test('empty or oversized selections and archives fail with actionable errors', async () => {
  await expect(buildAtelierArchive({})).rejects.toThrow(/1 à 200/);
  await expect(buildAtelierArchive({ characters: Array.from({ length: 201 }, () => entry('class')) })).rejects.toThrow(/1 à 200/);
  await expect(prepareWorkshopFile({ size: ATELIER_LIMITS.zipBytes + 1 })).rejects.toThrow(/128/);
});

test.each(['class', 'dungeon'])('the same import entry point accepts existing AI %s ZIPs', async type => {
  const bytes = writeContentZip(new Map([['content.json', JSON.stringify(packageExample(type))]]));
  const result = await prepare(bytes);
  expect(result[type === 'class' ? 'characters' : 'dungeons']).toHaveLength(1);
});

test('failed mixed save restores previous storage and deletes newly staged images', async () => {
  const prior = JSON.stringify(emptyCreations()); localStorage.setItem(CREATIONS_STORAGE, prior);
  const prepared = { characters: [entry('class')], dungeons: [], equipment: [item()], records: [{ id: 'staged-art' }], warnings: [] };
  const write = jest.fn(), remove = jest.fn().mockResolvedValue();
  const commitCreations = (change, other) => persistCreationsTogether(localStorage, change(emptyCreations()), other);
  await expect(importWorkshopFile({}, { commitCreations, importEquipment: () => { throw new Error('Quota dépassé'); } },
    { prepare: async () => prepared, write, remove })).rejects.toThrow(/Import non enregistré.*Quota/);
  expect(localStorage.getItem(CREATIONS_STORAGE)).toBe(prior);
  expect(remove).toHaveBeenCalledWith(['staged-art']); expect(write).toHaveBeenCalledTimes(1);
});

test('an initial or equipment-only import does not clobber unrelated storage', async () => {
  expect(() => persistCreationsTogether(localStorage, { ...emptyCreations(), characters: [entry('class')] }, () => { throw new Error('full'); })).toThrow('full');
  expect(localStorage.getItem(CREATIONS_STORAGE)).toBeNull();
  const commitCreations = jest.fn(), importEquipment = jest.fn(), equipment = [item()];
  await importWorkshopFile({}, { commitCreations, importEquipment }, { prepare: async () => ({ equipment, characters: [], dungeons: [], records: [], warnings: [] }), write: jest.fn() });
  expect(commitCreations).not.toHaveBeenCalled(); expect(importEquipment).toHaveBeenCalledWith(equipment);
});

test('image write failure never modifies either creation library', async () => {
  const commitCreations = jest.fn(), importEquipment = jest.fn();
  await expect(importWorkshopFile({}, { commitCreations, importEquipment }, { prepare: async () => ({ records: [] }),
    write: async () => { throw new Error('Stockage images plein'); } })).rejects.toThrow(/images plein/);
  expect(commitCreations).not.toHaveBeenCalled(); expect(importEquipment).not.toHaveBeenCalled();
});


test('a dungeon-only adventure ZIP carries every hero dependency into an empty game', async () => {
  const dungeon = entry('dungeon'), character = entry('class'), equipment = item();
  character.loadout.artworkId = 'adventure-only-art';
  character.loadout.customEquipment = { [equipment.id]: equipment }; character.loadout.slots.hat = equipment.id;
  character.loadout.slots.ring1 = 100;
  character.loadout.forgedItems = { ring1: createForgedItem(ITEMS[100], rolledEffects(ITEMS[100], character.loadout, 'ring1'), 9) };
  character.loadout.forgedItems.ring1.stats.pa = 1;
  const images = Object.fromEntries(SPEC.files.map(spec => [spec.name, new File([png(spec.name)], spec.name)]));
  dungeon.adventure = addAdventureHero(newAdventure(), character, 'hero-in-package');
  const original = JSON.stringify(dungeon);
  const archive = await buildAtelierArchive({ dungeons: [dungeon] }, { readArtwork: async () => ({ id: 'adventure-only-art', images }) });
  expect(archive.manifest.characters).toEqual([]); expect(archive.manifest.equipment).toEqual([]);
  const imported = await prepare(archive.bytes);
  const copy = imported.dungeons[0], hero = adventureTeam(copy)[0];
  expect(imported.records).toHaveLength(1);
  expect(hero.loadout.artworkId).toBe(imported.records[0].id);
  expect(hero.loadout.slots.hat).not.toBe(equipment.id);
  expect(hero.loadout.customEquipment[hero.loadout.slots.hat].stats).toEqual(equipment.stats);
  expect(hero.loadout.forgedItems).toEqual(character.loadout.forgedItems);
  expect(hero.loadout.spells).toEqual(character.loadout.spells);
  const match = new LiveMatch({ mode: 'custom', dungeon: copy, seed: 6 });
  expect(match.state.fighters.A.hp).toBe(resolveLoadout(character.classId, character.loadout).hp);
  expect(spellsOf(match.state.fighters.A)).toBeDefined();
  const records = new Map(imported.records.map(record => [record.id, record]));
  const roundtrip = await prepare((await buildAtelierArchive({ dungeons: [copy] }, { readArtwork: id => records.get(id) })).bytes);
  expect(adventureTeam(roundtrip.dungeons[0])[0].loadout.forgedItems).toEqual(character.loadout.forgedItems);
  expect(JSON.stringify(dungeon)).toBe(original);
});

test('ready packages reject invalid rules and incomplete heroes before exporting or importing', async () => {
  const dungeon = entry('dungeon'); dungeon.adventure = newAdventure();
  await expect(buildAtelierArchive({ dungeons: [dungeon] })).rejects.toThrow(/héros/);
  dungeon.adventure = addAdventureHero(newAdventure(), entry('class'), 'hero');
  const { manifest } = await buildAtelierArchive({ dungeons: [dungeon] });
  manifest.dungeons[0].adventure.heroes[0].character.loadout.slots.weapon = 999999;
  await expect(prepareAtelierFiles(manifestFiles(manifest), options)).rejects.toThrow();
  manifest.dungeons[0].adventure = { version: 99 };
  await expect(prepareAtelierFiles(manifestFiles(manifest), options)).rejects.toThrow();
});
