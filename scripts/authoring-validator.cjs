// Bundled by build_authoring_validator.cjs. All numerical decisions come from
// the live game modules, not a second transcription of their formulas.
const fs = require('node:fs');
const path = require('node:path');
const { File } = require('node:buffer');
const { inflateRawSync } = require('node:zlib');
const { createHash } = require('node:crypto');
const { readContentZip } = require('../src/content/zip');
const { PACKAGE_LIMITS, schemaErrors } = require('../src/content/packageSchema');
const { compilePackageSpell, validateContentManifest } = require('../src/content/contentPackage');
const { prepareContentFiles } = require('../src/ui/contentPackageImport');
const { ATELIER_LIMITS, atelierArchivePath, prepareAtelierFiles } = require('../src/ui/atelierArchive');
const { CLASSES } = require('../src/engine/classes');
const { resolveLoadout } = require('../src/engine/equipment');
const { validateCustomEquipment } = require('../src/engine/customEquipment');
const { MAX_ITEM_SCORE, MAX_EQUIPMENT_SCORE, EQUIPMENT_BUDGET_VERSION } = require('../src/engine/equipmentBalance');
const { spellbookBalance, SPELL_BALANCE_VERSION, MAX_SPELL_SCORE, MAX_KIT_SCORE } = require('../src/engine/spellBalance');
const { customDungeonErrors } = require('../src/engine/customDungeons');
const { validCustomMonster, resolveCustomMonster } = require('../src/engine/customMonsters');
const { isLoadout } = require('../src/ui/loadoutStore');
const { decodePng } = require('../skills/retro-class-designer/scripts/class-kit.cjs');

const LIMITS = { spellsPerOwner: 10, enemiesPerRoom: 8, armyEnemiesPerRoom: 32, customMapMaxSide: 40, spell: MAX_SPELL_SCORE, spellbook: MAX_KIT_SCORE,
  item: MAX_ITEM_SCORE, outfit: MAX_EQUIPMENT_SCORE, dofusScored: false };
const check = (condition, message) => { if (!condition) throw new Error(message); };
const unique = values => [...new Set(values)];
const warning = 'Numerical admission only. Competitive balance, difficulty and visual alignment remain untested.';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

function safeJson(bytes) {
  const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  const visit = (obj, depth = 0) => {
    check(depth <= 32, 'JSON nesting exceeds 32 levels.');
    if (!obj || typeof obj !== 'object') return;
    for (const [key, child] of Object.entries(obj)) {
      check(!['__proto__', 'prototype', 'constructor'].includes(key), `Forbidden JSON key: ${key}.`);
      visit(child, depth + 1);
    }
  };
  visit(value); return value;
}

function itemReport(definition) {
  const { valid, errors, balance } = validateCustomEquipment(definition);
  return { name: definition?.name, requiredLevel: definition?.level, valid, errors,
    budget: balance && { score: balance.score, limit: MAX_ITEM_SCORE, total: balance.totalScore,
      passive: balance.passiveScore, attack: balance.attackScore,
      allowances: balance.limits && { total: balance.limits.total, passive: balance.limits.passive,
        attack: balance.limits.attack, statLimits: balance.limits.statLimits }, comparisons: balance.comparisons } };
}

function characterReport(character) {
  check(character && Object.prototype.hasOwnProperty.call(CLASSES, character.classId), 'Unknown character classId.');
  check(typeof character.name === 'string' && !!character.name.trim(), 'Character name is required.');
  check(isLoadout(character.loadout), `${character.name}: malformed loadout.`);
  const resolved = resolveLoadout(character.classId, character.loadout);
  const custom = character.loadout.spells?.custom;
  const equipment = Object.values(character.loadout.customEquipment || {}).map(itemReport);
  const errors = unique([...resolved.errors, ...equipment.flatMap(item => item.errors.map(e => `${item.name}: ${e}`))]);
  return { name: character.name, classId: character.classId, level: resolved.level, valid: !errors.length, errors,
    spellbook: custom ? { enforced: true, count: custom.length, ...spellbookBalance(custom) }
      : { enforced: false, reason: 'Unmodified native class spellbook uses its existing game rules.' },
    equipment, outfit: resolved.equipmentBudget,
    stats: { hp: resolved.hp, pa: resolved.pa, pm: resolved.pm, characteristics: resolved.stats } };
}

function dungeonReport(dungeon) {
  if (dungeon.rooms) {
    const { dungeonRoom } = require('../src/engine/dungeonCampaign');
    const errors = customDungeonErrors(dungeon);
    if (errors.length) return { name: dungeon.name, valid: false, errors };
    const rooms = dungeon.rooms.map((_, index) => dungeonReport(dungeonRoom(dungeon, index)));
    return { name: dungeon.name, valid: rooms.every(room => room.valid), errors: unique(rooms.flatMap(room => room.errors)),
      roomCount: rooms.length, rooms };
  }
  const errors = customDungeonErrors(dungeon), characters = [], monsters = [];
  for (const member of dungeon.members || []) {
    if (member.character) characters.push(characterReport(member.character));
    if (member.customMonster) {
      const monster = member.customMonster, valid = validCustomMonster(monster);
      const resolved = valid ? resolveCustomMonster(monster) : null;
      monsters.push({ name: monster.name, count: member.count, valid, reference: monster.reference,
        spellbook: { enforced: true, count: monster.spells.length, ...spellbookBalance(monster.spells) },
        stats: resolved && { hp: resolved.baseHp, pa: resolved.basePa, pm: resolved.basePm, characteristics: resolved.stats } });
    }
  }
  const heroes = (dungeon.adventure?.heroes || []).map(hero => characterReport(hero.character));
  errors.push(...[...characters, ...heroes].flatMap(c => c.errors.map(e => `${c.name}: ${e}`)));
  return { name: dungeon.name, mapId: dungeon.mapId, valid: !errors.length, errors: unique(errors),
    enemyCount: (dungeon.members || []).reduce((n, m) => n + m.count, 0), characters, monsters,
    adventure: dungeon.adventure ? { mode: dungeon.adventure.mode, partySize: dungeon.adventure.partySize,
      allowAI: dungeon.adventure.allowAI, heroes } : null };
}

function inspectContentManifest(manifest) {
  const report = validateContentManifest(manifest);
  // Never score arbitrary malformed objects. Schema-valid over-budget spells
  // still get numerical reports to make correction possible.
  const owners = schemaErrors(manifest).length ? [] : manifest.type === 'class'
    ? [{ name: manifest.name, spells: manifest.class.spells }] : manifest.dungeon.monsters;
  return { errors: report.errors, warnings: report.warnings, spellbooks: owners.map(owner => ({ name: owner.name,
    count: owner.spells.length, ...spellbookBalance(owner.spells.map(spell => compilePackageSpell(spell))) })) };
}

async function verifyPixels(file, definition) {
  const bytes = Buffer.from(await file.arrayBuffer());
  check(bytes[24] === 8 && bytes[25] === 6 && bytes[28] === 0,
    `${file.name}: the portable checker needs non-interlaced RGBA 8-bit PNG. Re-export this image in that format (the browser accepts additional PNG encodings).`);
  const size = definition.frameSize || 256;
  decodePng(bytes, file.name, definition.width || size * definition.frames, definition.height || size, definition.frames, definition.pose !== 'portrait',
    { maxBytes: definition.width ? 8 * 1048576 : 2 * 1048576 });
}

const inflate = (bytes, size) => new Uint8Array(inflateRawSync(bytes, { maxOutputLength: Math.max(1, size) }));

async function readPackage(input) {
  const stat = fs.lstatSync(input);
  check(!stat.isSymbolicLink(), 'Symbolic links are not accepted.');
  if (!stat.isDirectory()) {
    check(stat.isFile() && stat.size <= ATELIER_LIMITS.zipBytes, 'Maximum ZIP size: 128 MiB.');
    const bytes = new Uint8Array(fs.readFileSync(input));
    const files = await readContentZip(bytes, inflate, { limits: ATELIER_LIMITS, allowName: atelierArchivePath });
    if (!files.has('atelier.json')) return { files: await readContentZip(bytes, inflate), sha256: hash(bytes) };
    return { files, sha256: hash(bytes) };
  }
  const limits = fs.existsSync(path.join(input, 'atelier.json')) ? ATELIER_LIMITS : PACKAGE_LIMITS;
  const files = new Map(); let total = 0, entries = 0;
  const walk = (directory, prefix = '') => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const relative = prefix + entry.name, file = path.join(directory, entry.name);
      check(++entries <= limits.files, 'Too many package entries.');
      check(!entry.isSymbolicLink(), `Symbolic link: ${relative}.`);
      check(atelierArchivePath(relative + (entry.isDirectory() ? '/' : '')), `Unaccepted path: ${relative}.`);
      if (entry.isDirectory()) walk(file, relative + '/');
      else {
        const stat = fs.statSync(file); total += stat.size;
        check(stat.isFile() && stat.size <= (relative.endsWith('.json') ? limits.jsonBytes : limits.pngBytes)
          && total <= limits.expandedBytes, `Package/file size limit exceeded: ${relative}.`);
        files.set(relative, new Uint8Array(fs.readFileSync(file)));
      }
    }
  };
  walk(input); return { files };
}

async function packageReport(input) {
  global.File = File;
  const { files, sha256 } = await readPackage(input);
  const atelier = files.has('atelier.json'), filename = atelier ? 'atelier.json' : 'content.json';
  check(files.has(filename), 'Use content.json or atelier.json at the ZIP root. Legacy class.json is not browser-importable.');
  const manifest = safeJson(files.get(filename));
  const result = { scope: 'complete-package', format: manifest.format, name: manifest.name, sha256, files: files.size,
    importable: false, readyForCombat: false, imagesChecked: 0, errors: [], warnings: [], characters: [], dungeons: [], equipment: [] };
  let serial = 0;
  const dependencies = { newId: () => `validation-${++serial}`, equipmentId: () => 9000000000 + ++serial,
    verifyPixels: async (...args) => { await verifyPixels(...args); result.imagesChecked++; } };
  if (!atelier) {
    const inspection = inspectContentManifest(manifest);
    Object.assign(result, inspection);
    if (inspection.errors.length) return result;
  }
  try {
    const prepared = atelier ? await prepareAtelierFiles(files, dependencies) : await prepareContentFiles(files, dependencies);
    result.importable = true;
    const content = atelier ? prepared : { characters: [], dungeons: [], equipment: [], [prepared.tab]: [prepared.entry] };
    result.characters = content.characters.map(characterReport);
    result.dungeons = content.dungeons.map(dungeonReport);
    result.equipment = content.equipment.map(itemReport);
    result.warnings = unique([...result.warnings, ...prepared.warnings]);
    result.errors = [...result.characters, ...result.dungeons, ...result.equipment].flatMap(entry => entry.errors.map(e => `${entry.name}: ${e}`));
    result.readyForCombat = !result.errors.length;
  } catch (error) { result.errors.push(error.message); }
  return result;
}

const usage = `Usage (Node.js 20+; no npm install):
  node scripts/validate.cjs package creation.zip|folder
  node scripts/validate.cjs equipment item.json
  node scripts/validate.cjs character character.json
  node scripts/validate.cjs manifest content.json

All commands print a JSON report; exit 0 = checks passed, exit 1 = failed.
Only package checks images and archive integrity. Other modes check definitions.
character expects {name, classId, loadout}, including all equipped custom definitions.
equipment expects the custom item definition exported by the Atelier.
manifest checks the AI content.json schema and budgets without any assets.
Numerical validity does not certify competitive balance. Read references/validation.md.`;

async function validate(command, input) {
  if (command === 'package' || command === 'validate') return packageReport(input);
  const stat = fs.lstatSync(input);
  check(stat.isFile() && !stat.isSymbolicLink() && stat.size <= ATELIER_LIMITS.jsonBytes, 'Provide one JSON file, maximum 8 MiB.');
  const value = safeJson(fs.readFileSync(input));
  if (command === 'equipment') return { scope: 'definition-only', ...itemReport(value) };
  if (command === 'character') return { scope: 'definition-only', ...characterReport(value) };
  if (command === 'manifest') return { scope: 'manifest-only', ...inspectContentManifest(value) };
  throw new Error(usage);
}

async function main(args = process.argv.slice(2), build = null) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) { console.log(usage); return; }
  const report = { validator: 'dofus-lite-runtime', version: 1, build,
    rules: { spells: SPELL_BALANCE_VERSION, equipment: EQUIPMENT_BUDGET_VERSION }, limits: LIMITS,
    balanceTesting: 'not-run', warnings: [warning] };
  try {
    check(Number(process.versions.node.split('.')[0]) >= 20, 'Node.js 20 or newer is required.');
    check(args.length === 2 && ['package', 'validate', 'equipment', 'character', 'manifest'].includes(args[0]), usage);
    const result = await validate(args[0], args[1]);
    Object.assign(report, result, { warnings: unique([warning, ...(result.warnings || [])]) });
    report.valid = !report.errors.length && (report.valid ?? true) && (report.readyForCombat ?? true);
  } catch (error) { Object.assign(report, { valid: false, errors: [error.message] }); }
  console.log(JSON.stringify(report, null, 2));
  if (!report.valid) process.exitCode = 1;
  return report;
}

module.exports = { main, validate, itemReport, characterReport, dungeonReport, readPackage };
