import fs from 'fs';
import path from 'path';
import { TextEncoder, TextDecoder } from 'util';
import { inflateRawSync } from 'zlib';
import { packageExample, validateContentManifest, compileContentManifest, expectedPackageFiles } from '../content/contentPackage';
import { buildContentPrompt, packageSpecDocument } from '../content/packagePrompt';
import { writeContentZip, readContentZip } from '../content/zip';
import { prepareContentFiles, importContentFile } from '../ui/contentPackageImport';
import { customDungeonRoster } from '../engine/customDungeons';
import { getMonster } from '../engine/monsters';
import { createGame, applyAction, spellsOf, getView } from '../engine/engine';
import { makeBotApi } from '../bots/api';
import { createRng } from '../engine/rng';
import { runMatch } from '../arena/runner';
import { emptyCreations, validCreations, persistCreations, readCreations } from '../ui/creationsStore';
import { decodePng, writeZip as legacyWriteZip } from '../../skills/retro-class-designer/scripts/class-kit.cjs';

let serial = 0;
const newId = () => `import-${++serial}`;
const encode = value => new Uint8Array(Buffer.from(JSON.stringify(value)));
const filesFor = value => new Map([['content.json', encode(value)]]);
const compile = type => compileContentManifest(packageExample(type), { newId }).entry;
const png = name => new Uint8Array(fs.readFileSync(path.join(process.cwd(), 'public/templates/character-artwork/example', name)));
beforeAll(() => {
  global.TextEncoder = TextEncoder; global.TextDecoder = TextDecoder;
  if (!File.prototype.arrayBuffer) File.prototype.arrayBuffer = function() { return new Promise(resolve => {
    const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsArrayBuffer(this);
  }); };
});

test.each(['class', 'dungeon'])('the %s prompt, schema, example, compiler, storage and ZIP agree', async type => {
  const manifest = packageExample(type);
  expect(validateContentManifest(manifest).errors).toEqual([]);
  const prompt = buildContentPrompt({ type, theme: 'A space opera with a knight and two guards' });
  expect(prompt.indexOf('A space opera')).toBeLessThan(100);
  expect(prompt).toContain(`PACKAGE TYPE: ${type}`);
  expect(prompt).toContain(JSON.stringify(packageSpecDocument().schema));
  expect(prompt).toContain(JSON.stringify(manifest, null, 2));
  const files = await readContentZip(writeContentZip(filesFor(manifest)));
  const prepared = await prepareContentFiles(files, { newId });
  const saved = { ...emptyCreations(), [prepared.tab]: [prepared.entry] };
  expect(validCreations(saved)).toBe(true);
  persistCreations(localStorage, saved);
  expect(readCreations(localStorage)).toEqual({ value: saved, error: '' });
  expect(prepared.records).toEqual([]);
  const copy = compileContentManifest(manifest, { newId });
  expect(copy.entry.id).not.toBe(prepared.entry.id);
  expect(copy.warnings.some(warning => warning.includes('équilibre prouvé'))).toBe(true);
});

test.each([
  ['eleven spells', m => { m.class.spells = Array.from({ length: 11 }, (_, i) => ({ ...m.class.spells[0], key: `s${i}` })); }],
  ['no spells', m => { m.class.spells = []; }],
  ['duplicate spell keys', m => { m.class.spells[1].key = m.class.spells[0].key; }],
  ['unknown class', m => { m.class.baseClass = 'JEDI'; }],
  ['unknown visual', m => { m.class.spells[0].visualSpellId = 999999; }],
  ['injected code field', m => { m.class.spells[0].execute = 'alert(1)'; }],
  ['large damage/AP', m => { m.class.spells[0].effects[0].min = 200; m.class.spells[0].effects[0].max = 250; }],
  ['split damage bypass', m => { m.class.spells[0].effects = Array(4).fill(m.class.spells[0].effects[0]); }],
  ['high boost', m => { m.class.spells[1].effects[0].min = 100; m.class.spells[1].effects[0].max = 100; }],
  ['permanent buff stacking', m => { m.class.spells[1].cooldown = 0; }],
  ['AP refund loop', m => { m.class.spells[1].effects[0] = { kind: 'buffPa', min: 2, max: 2, duration: 2, zone: 'Pa', target: 'self' }; }],
  ['wrong self range', m => { m.class.spells[1].rangeMax = 4; }],
  ['wrong element', m => { m.class.spells[0].effects[0].element = 'lightning'; }],
  ['irrelevant element', m => { m.class.spells[1].effects[0].element = 'feu'; }],
  ['missing critical effects', m => { m.class.spells[0].critRate = 10; }],
  ['disabled critical effects', m => { m.class.spells[0].critEffects = m.class.spells[0].effects; }],
  ['unsupported summons', m => { m.class.spells[0].effects[0].kind = 'summon'; }],
  ['fifth effect', m => { m.class.spells[0].effects = Array(5).fill(m.class.spells[0].effects[0]); }],
  ['invalid masks', m => { m.class.spells[0].effects[0].target = 'ally'; }],
  ['icon traversal', m => { m.class.spells[0].icon = 'icons/../oops.png'; }],
  ['extra root', m => { m.dungeon = packageExample('dungeon').dungeon; }],
  ['negative damage', m => { m.class.spells[0].effects[0].min = -1; }],
  ['fractional AP', m => { m.class.spells[0].pa = 2.5; }],
])('rejects %s before producing any creation', async (_, mutate) => {
  const manifest = packageExample('class'); mutate(manifest);
  expect(validateContentManifest(manifest).errors.length).toBeGreaterThan(0);
  expect(() => compileContentManifest(manifest, { newId })).toThrow();
  await expect(prepareContentFiles(filesFor(manifest))).rejects.toThrow();
});

test.each([
  ['nine enemies', m => { m.dungeon.members[0].count = 8; }],
  ['unknown map', m => { m.dungeon.mapId = 'star-destroyer'; }],
  ['prototype map name', m => { m.dungeon.mapId = '__proto__'; }],
  ['unknown reference', m => { m.dungeon.monsters[0].reference.monsterId = 99999; }],
  ['unknown grade', m => { m.dungeon.monsters[0].reference.grade = 20; }],
  ['unknown roster key', m => { m.dungeon.members[0].monster = 'ghost'; }],
  ['unused monster', m => { m.dungeon.members.pop(); }],
  ['duplicate creature key', m => { m.dungeon.monsters[1].key = 'warden'; }],
  ['excessive HP', m => { m.dungeon.monsters[0].tuning.hpPercent = 151; }],
  ['excessive PM', m => { m.dungeon.monsters[0].tuning.pmBonus = 5; }],
  ['zero AP', m => { m.dungeon.monsters[0].reference = { monsterId: 494, grade: 1 }; }],
])('rejects dungeon with %s', (_, mutate) => {
  const manifest = packageExample('dungeon'); mutate(manifest);
  expect(validateContentManifest(manifest).errors.length).toBeGreaterThan(0);
});

test('accepts meaningful multi-effect and complete critical lists, movement and custom visuals', () => {
  const manifest = packageExample();
  const spell = manifest.class.spells[0];
  spell.effects.push({ kind: 'removePm', min: 1, max: 1, duration: 1, zone: 'Pa', target: 'enemy' });
  spell.critRate = 30; spell.critEffects = JSON.parse(JSON.stringify(spell.effects)); spell.critEffects[0].max = 23;
  expect(validateContentManifest(manifest).errors).toEqual([]);
  spell.targetMode = 'freeCell'; spell.effects = [{ kind: 'teleport', min: 0, max: 0, duration: 0, zone: 'Pa', target: 'self' }];
  spell.critEffects = JSON.parse(JSON.stringify(spell.effects));
  expect(validateContentManifest(manifest).errors).toEqual([]);
  spell.adjustableRange = true;
  expect(validateContentManifest(manifest).errors.join()).toContain('téléportation');
});

test('dungeon stats, own spellbooks, skins and AI legality survive the combat boundary', () => {
  const room = compile('dungeon'), character = compile('class');
  const roster = customDungeonRoster(room);
  expect(roster).toHaveLength(3);
  expect(roster.map(f => f.name)).toEqual(['Gardien des braises', 'Sentinelle de cendre 1', 'Sentinelle de cendre 2']);
  const { state } = createGame({ mapId: room.mapId, seed: 1, fighters: [
    { id: 'A', team: 'A', classId: character.classId, loadout: character.loadout }, ...roster,
  ] });
  const enemy = state.fighters.B, reference = getMonster(147, 1);
  expect(enemy.monsterId).toBe(null);
  expect(enemy.appearanceMonsterId).toBe(147);
  expect(enemy.hp).toBe(Math.round(reference.baseHp * .75));
  expect(enemy.stats).toEqual(reference.stats);
  expect(Object.values(spellsOf(enemy)).map(spell => spell.name)).toEqual(['Braise vive', 'Résolution']);
  state.board.obstacles = {}; state.currentIndex = state.order.indexOf('B');
  enemy.pos = { x: 3, y: 3 }; state.fighters.A.pos = { x: 4, y: 3 }; enemy.pa = 10;
  const book = Object.values(spellsOf(enemy));
  const api = makeBotApi(getView(state, 'B'), createRng(1));
  expect(api.canCast(book[0].key, state.fighters.A.pos).ok).toBe(true);
  const boosted = applyAction(state, { type: 'CAST', spell: book[1].key, target: enemy.pos });
  expect(boosted.ok).toBe(true);
  const hit = applyAction(boosted.state, { type: 'CAST', spell: book[0].key, target: state.fighters.A.pos });
  expect(hit.ok).toBe(true);
  expect(hit.events.find(event => event.t === 'damage').calculation.flatDamage).toBe(8);
  expect(hit.events.find(event => event.t === 'cast')).toMatchObject({ spellName: 'Braise vive', visualSpellId: 161 });
});

test('the general AI plays imported creatures to completion with their own spells', () => {
  const room = compile('dungeon'); room.mapId = 'arene';
  const result = runMatch({ mode: 'custom', dungeon: room, seed: 16, collectFrames: false, classes: { A: 'IOP' },
    bots: { A: { name: 'Testeur', decide: () => ({ type: 'PASS' }) } } });
  expect(result.winner).toBe('B');
  expect(result.endReason).toBe('ko');
  expect(result.events.some(event => event.t === 'cast' && event.spellName === 'Braise vive')).toBe(true);
  expect(result.events.some(event => event.t === 'cast' && event.spellName === 'Étincelle')).toBe(true);
  expect(result.events.filter(event => ['bot_error', 'unsupported_effects'].includes(event.t))).toEqual([]);
}, 30000);

test('PNG artwork and icons are checked and bound to immutable assets before any write', async () => {
  const manifest = packageExample(); manifest.class.artwork = 'artwork/warden'; manifest.class.spells[0].icon = 'icons/ember.png';
  const files = filesFor(manifest);
  for (const name of ['portrait.png', 'idle-front.png', 'idle-back.png']) files.set(`artwork/warden/${name}`, png(name));
  files.set('icons/ember.png', new Uint8Array(fs.readFileSync(path.join(process.cwd(), 'skills/retro-class-designer/assets/example/icons/flare_lance.png'))));
  const verifyPixels = jest.fn(async (file, definition) => {
    const size = definition.frameSize || 256;
    decodePng(Buffer.from(await file.arrayBuffer()), file.name, size * definition.frames, size, definition.frames, definition.pose !== 'portrait');
  });
  const result = await prepareContentFiles(files, { verifyPixels, newId });
  expect(verifyPixels).toHaveBeenCalledTimes(4);
  expect(result.records).toHaveLength(2);
  expect(result.entry.loadout.artworkId).toBe(result.records[0].id);
  expect(result.entry.loadout.spells.custom[0].iconArtworkId).toBe(result.records[1].id);
  expect(expectedPackageFiles(manifest).required.has('icons/ember.png')).toBe(true);
  const fighter = createGame({ mapId: 'arene', fighters: [{ id: 'A', classId: 'IOP', loadout: result.entry.loadout }, { id: 'B', classId: 'CRA' }] }).state.fighters.A;
  expect(Object.values(spellsOf(fighter))[0].iconFile).toBe('icons/ember.png');
  files.delete('artwork/warden/idle-back.png');
  await expect(prepareContentFiles(files, { verifyPixels, newId })).rejects.toThrow('idle-back.png');
});

test('reject missing, unreferenced, wrong-size or corrupt PNGs', async () => {
  const manifest = packageExample(); manifest.class.spells[0].icon = 'icons/ember.png';
  const files = filesFor(manifest);
  await expect(prepareContentFiles(files)).rejects.toThrow('absent');
  files.set('icons/ember.png', png('portrait.png'));
  await expect(prepareContentFiles(files)).rejects.toThrow('64 × 64');
  const bad = png('portrait.png'); bad[40] ^= 1; files.set('icons/ember.png', bad);
  await expect(prepareContentFiles(files)).rejects.toThrow('corrompu');
  files.set('readme.txt', new Uint8Array([1]));
  await expect(prepareContentFiles(files)).rejects.toThrow('non déclaré');
});

test('failed localStorage commit rolls back the new image batch and preserves existing creations', async () => {
  const prepared = { tab: 'characters', entry: compile('class'), records: [{ id: 'asset' }] };
  const write = jest.fn().mockResolvedValue(), remove = jest.fn().mockResolvedValue(), commit = jest.fn(() => { throw new Error('Quota exceeded'); });
  const file = { size: 10, arrayBuffer: async () => new ArrayBuffer(10) };
  await expect(importContentFile(file, commit, { readZip: async () => new Map(), prepare: async () => prepared, write, remove })).rejects.toThrow('non enregistré');
  expect(write).toHaveBeenCalledWith(prepared.records); expect(remove).toHaveBeenCalledWith(['asset']);
  expect(commit).toHaveBeenCalledTimes(1);
  write.mockClear(); remove.mockClear(); commit.mockClear();
  await expect(importContentFile(file, commit, { readZip: async () => { throw new Error('Bad ZIP'); }, write, remove })).rejects.toThrow('Bad ZIP');
  expect(write).not.toHaveBeenCalled(); expect(commit).not.toHaveBeenCalled();
});

test('a creature spellbook may be saved empty while editing but cannot start a fight', () => {
  const room = compile('dungeon'); room.members[0].customMonster.spells = [];
  expect(validCreations({ ...emptyCreations(), dungeons: [room] })).toBe(true);
  expect(() => customDungeonRoster(room)).toThrow('invalide');
});

test('reads real DEFLATE and directory entries and rejects traversal, duplicates, corruption, encryption and oversized entries', async () => {
  const original = filesFor(packageExample());
  const compressed = legacyWriteZip(new Map([...original].map(([key, value]) => [key, Buffer.from(value)])));
  const decoded = await readContentZip(new Uint8Array(compressed), (bytes, size) => new Uint8Array(inflateRawSync(bytes, { maxOutputLength: size })));
  expect(decoded.get('content.json')).toEqual(original.get('content.json'));
  const withDir = new Map([...original, ['icons/', new Uint8Array()]]);
  expect((await readContentZip(writeContentZip(withDir))).size).toBe(1);
  for (const name of ['../content.json', '/content.json', 'folder/content.json', 'icons/../../x.png', 'evil.js']) {
    await expect(readContentZip(writeContentZip(new Map([[name, new Uint8Array([1])]])))).rejects.toThrow('chemin');
  }
  const bad = writeContentZip(original); bad[60] ^= 1;
  await expect(readContentZip(bad)).rejects.toThrow('corrompu');
  const encrypted = writeContentZip(original), ev = new DataView(encrypted.buffer), central = ev.getUint32(encrypted.length - 6, true);
  ev.setUint16(central + 8, 1, true);
  await expect(readContentZip(encrypted)).rejects.toThrow('chiffré');
  const oversized = writeContentZip(new Map([['content.json', new Uint8Array(513 * 1024)]]));
  await expect(readContentZip(oversized)).rejects.toThrow('taille');
  const symlink = writeContentZip(original), sv = new DataView(symlink.buffer);
  sv.setUint32(sv.getUint32(symlink.length - 6, true) + 38, 0xa0000000, true);
  await expect(readContentZip(symlink)).rejects.toThrow('symbolique');
  const duplicate = writeContentZip(new Map([['icons/a.png', new Uint8Array([1])], ['icons/b.png', new Uint8Array([1])]]));
  const needle = new TextEncoder().encode('icons/b.png');
  for (let i = 0; i <= duplicate.length - needle.length; i++) if (needle.every((byte, j) => duplicate[i + j] === byte)) duplicate[i + 6] = 97;
  await expect(readContentZip(duplicate)).rejects.toThrow('dupliqué');
  await expect(readContentZip(writeContentZip(new Map([['content.json', new Uint8Array(1)]]))).then(files => prepareContentFiles(files))).rejects.toThrow('JSON');
});
