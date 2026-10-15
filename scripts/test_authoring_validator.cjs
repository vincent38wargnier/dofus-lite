// End-to-end CLI checks: the subprocess receives only the three portable files.
require('./ai_runtime.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { File } = require('node:buffer');
const { packageExample, compilePackageSpell } = require('../src/content/contentPackage');
const { writeContentZip } = require('../src/content/zip');
const { spellbookBalance } = require('../src/engine/spellBalance');
const { newAuthoredSpell, newAuthoredEffect, normalizeAuthoredSpell } = require('../src/engine/authoredSpells');
const { newCustomEquipment, validateCustomEquipment, equipCustomItem } = require('../src/engine/customEquipment');
const { equipmentStats } = require('../src/engine/equipmentBalance');
const { ITEMS, emptyLoadout, resolveLoadout, rolledEffects } = require('../src/engine/equipment');
const { replaceEquipment, createForgedItem } = require('../src/engine/forgedItems');
const { buildAtelierArchive } = require('../src/ui/atelierArchive');
global.File = File;

const root = path.resolve(__dirname, '..'), temp = fs.mkdtempSync(path.join(os.tmpdir(), 'dofus-portable-validation-'));
const entry = process.env.AUTHORING_VALIDATOR || path.join(temp, 'validate.cjs');
if (!process.env.AUTHORING_VALIDATOR) for (const file of ['validate.cjs', 'validation-runtime.cjs', 'validation-build.json']) {
  fs.copyFileSync(path.join(root, 'skills/retro-class-designer/scripts', file), path.join(temp, file));
}
test.after(() => fs.rmSync(temp, { recursive: true, force: true }));
let count = 0;
const copy = value => JSON.parse(JSON.stringify(value));
const jsonFile = object => {
  const file = path.join(temp, `fixture-${count++}.json`);
  fs.writeFileSync(file, JSON.stringify(object)); return file;
};
const zipFile = files => {
  const file = path.join(temp, `fixture-${count++}.zip`);
  fs.writeFileSync(file, writeContentZip(files)); return file;
};
const archive = (characters = [], dungeons = [], equipment = []) =>
  ({ format: 'dofus-lite-atelier', version: 1, characters, dungeons, equipment, artwork: [] });
const archiveFile = manifest => zipFile(new Map([['atelier.json', JSON.stringify(manifest)]]));
const item = (stats = { vitalite: 200, force: 40, damage: 5 }, referenceId = 7143) =>
  ({ ...newCustomEquipment(referenceId), level: 200, name: 'Coiffe test', stats });
const character = spells => ({ id: 'hero', name: 'Héroïne test', classId: 'IOP',
  loadout: { ...emptyLoadout('IOP'), level: 200, base: {}, ...(spells ? { spells: { custom: spells } } : {}) } });
const spell = () => compilePackageSpell(packageExample('class').class.spells[0]);
const equip = (loadout, slot, definition) => replaceEquipment(equipCustomItem(loadout, slot, definition), slot, definition.id);
function cli(mode, file, pass) {
  const result = spawnSync(process.execPath, [entry, mode, file], { cwd: temp, encoding: 'utf8', maxBuffer: 5 * 1048576,
    env: { ...process.env, NODE_PATH: '', NODE_OPTIONS: '' } });
  assert.equal(result.signal, null, result.stderr);
  assert.equal(result.stderr, '', result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(result.status, pass ? 0 : 1, JSON.stringify(report.errors));
  assert.equal(report.valid, pass);
  assert.equal(report.balanceTesting, 'not-run');
  return report;
}

test('portable equipment numbers equal the engine; required level changes admission', () => {
  const definition = item();
  const report = cli('equipment', jsonFile(definition), true);
  assert.equal(report.budget.score, validateCustomEquipment(definition).balance.score);
  const low = cli('equipment', jsonFile({ ...definition, level: 1 }), false);
  assert.ok(low.budget.score > report.budget.score);
  assert.ok(low.errors.length);
});

test('individual stat caps, forbidden Dofus and weapon/critical damage are checked', () => {
  const cap = cli('equipment', jsonFile(item({ pa: 2 })), false);
  assert.match(cap.errors.join(' '), /maximum|budget/i);
  cli('equipment', jsonFile({ ...item(), referenceId: 6980 }), false);
  const weapon = { ...item({}, 2416), weapon: { pa: 2, range: [1, 1], critRate: 20, critBonus: 20,
    lines: Array.from({ length: 4 }, () => ({ id: 94, min: 79, max: 80 })) } };
  const report = cli('equipment', jsonFile(weapon), false);
  assert.ok(report.budget.attack > 100);
});

test('native classes retain their native spellbook while a custom book gets exact scores', () => {
  assert.equal(cli('character', jsonFile(character()), true).spellbook.enforced, false);
  const hero = character([spell()]);
  const report = cli('character', jsonFile(hero), true);
  assert.equal(report.spellbook.score, spellbookBalance(hero.loadout.spells.custom).score);
  assert.equal(report.spellbook.count, 1);
});

test('too many spells and independent legal AP generators exceed whole-class guards', () => {
  const spells = Array.from({ length: 10 }, (_, i) => normalizeAuthoredSpell({ ...newAuthoredSpell([], 'boost'),
    id: 1000000000100 + i, key: `custom_${1000000000100 + i}`, pa: 2, cooldown: 2, effects: [newAuthoredEffect('buffPa')] }));
  const result = cli('character', jsonFile(character(spells)), false);
  assert.ok(result.spellbook.entries.every(spell => spell.valid));
  assert.ok(result.spellbook.score > 650);
  assert.ok(result.spellbook.synergy > 0);
  const tooMany = Array.from({ length: 11 }, (_, i) => ({ ...spell(), id: 1000000000500 + i, key: `custom_${1000000000500 + i}` }));
  assert.match(cli('character', jsonFile(character(tooMany)), false).errors.join(' '), /10/);
});

test('Argent russe-style excess and weak criticals cannot pass as a playable draft', () => {
  const raw = normalizeAuthoredSpell({ ...newAuthoredSpell(), name: 'Argent russe', pa: 1, rangeMax: 12, needsLos: false,
    adjustableRange: true, targetMode: 'cell', maxPerTurn: 3, maxPerTarget: 3, critRate: 2,
    effects: [{ ...newAuthoredEffect('lifeSteal'), min: 149, max: 150, zone: 'Cc' },
      ...Array.from({ length: 3 }, () => ({ ...newAuthoredEffect(), min: 149, max: 150 }))], critEffects: [newAuthoredEffect()] });
  const result = cli('package', archiveFile(archive([character([raw])])), false);
  assert.equal(result.importable, true);
  assert.equal(result.readyForCombat, false);
  assert.match(result.errors.join(' '), /critique/);
  assert.ok(result.characters[0].spellbook.entries[0].score > 1000);
});

function optimized() {
  let loadout = { ...emptyLoadout('CRA'), level: 200, base: { vitalite: 2, intelligence: 288 }, rollMode: 'max',
    slots: { hat: 11548, cape: 8876, amulet: 11546, ring1: 11544, ring2: 8877, boots: 9182,
      pet: 7830, belt: 9143, weapon: 8993, dofus1: 7114, dofus2: 737, dofus3: 7115, dofus4: 7754, dofus5: 694, dofus6: 739 }, forgedItems: {} };
  for (const [slot, stat] of Object.entries({ hat: 'pa', cape: 'pa', amulet: 'pm', weapon: 'pa', ring1: 'pa', ring2: 'pa', belt: 'pa' })) {
    const base = ITEMS[loadout.slots[slot]], forged = createForgedItem(base, rolledEffects(base, loadout, slot));
    forged.stats[stat] = (forged.stats[stat] || 0) + 1; loadout.forgedItems[slot] = forged;
  }
  loadout = equip(loadout, 'pet', item(equipmentStats(ITEMS[7830]), 7830));
  return { id: 'archer', name: 'Archer FM', classId: 'CRA', loadout };
}

test('the calibrated 1606.5-point outfit passes; Dofus do not count; further AP stacking fails', () => {
  const hero = optimized(), result = cli('character', jsonFile(hero), true);
  assert.equal(result.outfit.score, 1606.5);
  assert.equal(result.outfit.enforced, true);
  assert.deepEqual(result.outfit, resolveLoadout('CRA', hero.loadout).equipmentBudget);
  const noDofus = copy(hero);
  Object.keys(noDofus.loadout.slots).filter(key => key.startsWith('dofus')).forEach(key => delete noDofus.loadout.slots[key]);
  assert.deepEqual(cli('character', jsonFile(noDofus), true).outfit, result.outfit);
  const boots = ITEMS[hero.loadout.slots.boots];
  hero.loadout.forgedItems.boots = createForgedItem(boots, rolledEffects(boots, hero.loadout, 'boots'));
  hero.loadout.forgedItems.boots.stats.pa = 1;
  const excessive = cli('character', jsonFile(hero), false);
  assert.ok(excessive.outfit.score > 1650);
  assert.match(excessive.errors.join(' '), /Budget du stuff/);
});

test('forged-item legality, item requirements and missing custom definitions remain enforced', () => {
  const hero = optimized(); hero.loadout.forgedItems.hat.stats.pa = 10;
  assert.match(cli('character', jsonFile(hero), false).errors.join(' '), /surjets et exotiques dépasse 101/);
  const low = character(); low.loadout.level = 1; low.loadout = equip(low.loadout, 'hat', item());
  assert.match(cli('character', jsonFile(low), false).errors.join(' '), /niveau 200/);
  const missing = character(); missing.loadout.slots.hat = 1000000099;
  assert.match(cli('character', jsonFile(missing), false).errors.join(' '), /inconnu/);
});

test('supplied heroes and enemy character snapshots are validated inside a dungeon-only archive', () => {
  const hero = optimized(), foe = character([spell()]);
  const room = { id: 'room', name: 'Portable room', mapId: 'arene', members: [{ character: foe, count: 1 }],
    adventure: { version: 1, mode: 'fixed', partySize: 1, allowAI: true, description: '', heroes: [{ id: 'hero', character: hero }] } };
  const result = cli('package', archiveFile(archive([], [room])), true);
  assert.equal(result.dungeons[0].adventure.heroes[0].outfit.score, 1606.5);
  assert.equal(result.dungeons[0].characters[0].spellbook.count, 1);
  room.adventure.heroes[0].character.loadout.slots.hat = 1000000099;
  assert.match(cli('package', archiveFile(archive([], [room])), false).errors.join(' '), /inconnu/);
});

test('the current AI content contract checks numbers before accepting JSON or ZIP', () => {
  const manifest = packageExample('class'); manifest.class.spells[0].pa = 1;
  manifest.class.spells[0].effects[0].min = 149; manifest.class.spells[0].effects[0].max = 150;
  const result = cli('manifest', jsonFile(manifest), false);
  assert.ok(result.spellbooks[0].entries[0].score > 100);
  assert.equal(result.scope, 'manifest-only');
  assert.equal(result.importable, undefined);
  cli('package', zipFile(new Map([['content.json', JSON.stringify(manifest)]])), false);
});

test('real class and dungeon examples decode every supplied image outside the repository', () => {
  for (const type of ['class', 'dungeon']) {
    const file = path.join(temp, `${type}.zip`);
    fs.copyFileSync(path.join(root, `public/templates/content-packages/example-${type}-with-artwork.zip`), file);
    const result = cli('package', file, true);
    assert.equal(result.imagesChecked, 10);
    assert.equal(result.importable, true);
    assert.equal(result.readyForCombat, true);
  }
});

test('Atelier assets, duplicate paths, missing images and corrupt archives are checked', async () => {
  const hero = character([spell()]); hero.loadout.artworkId = 'test-art';
  const images = Object.fromEntries(['portrait.png', 'idle-front.png', 'idle-back.png'].map(name => [name,
    new File([fs.readFileSync(path.join(root, 'public/templates/character-artwork/example', name))], name, { type: 'image/png' })]));
  const ready = await buildAtelierArchive({ characters: [hero] }, { readArtwork: async () => ({ name: 'Images', images }) });
  const file = path.join(temp, 'atelier-art.zip'); fs.writeFileSync(file, ready.bytes);
  assert.equal(cli('package', file, true).imagesChecked, 3);
  cli('package', archiveFile({ ...ready.manifest, artwork: [] }), false);
  cli('package', zipFile(new Map([['../content.json', JSON.stringify(packageExample('class'))]])), false);
  cli('package', zipFile(new Map([['content.json', JSON.stringify(packageExample('class'))], ['icons/unused.png', Buffer.from('broken')]])), false);
  const damaged = Buffer.from(ready.bytes); damaged[50] ^= 1; fs.writeFileSync(file, damaged);
  cli('package', file, false);
});

test('bad PNG pixels and missing files never pass because the dimensions look correct', () => {
  const manifest = packageExample('class'); manifest.class.artwork = 'artwork/hero';
  const files = new Map([['content.json', JSON.stringify(manifest)]]);
  cli('package', zipFile(files), false);
  for (const name of ['portrait.png', 'idle-front.png', 'idle-back.png']) files.set(`artwork/hero/${name}`,
    fs.readFileSync(path.join(root, 'public/templates/character-artwork/blank', name)));
  assert.match(cli('package', zipFile(files), false).errors.join(' '), /empty|vide/);
});

test('folder packages and malformed JSON fail cleanly without importing anything', () => {
  const folder = path.join(temp, 'folder'); fs.mkdirSync(folder);
  fs.writeFileSync(path.join(folder, 'content.json'), JSON.stringify(packageExample('class')));
  assert.equal(cli('package', folder, true).files, 1);
  fs.symlinkSync(path.join(folder, 'content.json'), path.join(folder, 'secret.json'));
  assert.match(cli('package', folder, false).errors.join(' '), /Symbolic/);
  const invalid = jsonFile({ __proto__: null }); fs.writeFileSync(invalid, '{"__proto__": {}}');
  assert.match(cli('manifest', invalid, false).errors.join(' '), /Forbidden/);
});
