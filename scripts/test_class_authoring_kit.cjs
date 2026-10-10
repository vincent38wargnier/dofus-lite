const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const kitPath = path.join(root, 'skills/retro-class-designer');
const kit = require(path.join(kitPath, 'scripts/class-kit.cjs'));
const manifest = require(path.join(kitPath, 'assets/example/class.json'));
const clone = value => JSON.parse(JSON.stringify(value));
const files = () => kit.readFolder(path.join(kitPath, 'assets/example'));
const centralOffset = bytes => bytes.readUInt32LE(bytes.length - 6);

test('example validates all 19 images, round-trips stored/deflated ZIPs and keeps its balance warning', () => {
  for (const compress of [false, true]) {
    const source = files(), archive = kit.writeZip(source, { compress }), decoded = kit.readZip(archive), result = kit.validateFiles(decoded);
    assert.deepEqual(result.errors, []); assert.equal(result.imagesChecked, 19);
    assert(result.warnings.some(w => w.includes('last_flare')));
    for (const [name, value] of source) assert.deepEqual(decoded.get(name), value);
  }
});
test('11 spells, duplicate keys, arbitrary scripts, unimplemented initial cooldown and unsupported effects fail', () => {
  for (const mutate of [m => m.spells.push(clone(m.spells[0])), m => m.spells[1].key = m.spells[0].key,
    m => m.spells[0].script = 'alert(1)', m => m.spells[0].initialCooldown = 1,
    m => m.spells[0].effects[0].kind = 'kill', m => m.spells[0].effects[0].maxStacks = 1]) {
    const value = clone(manifest); mutate(value); assert(kit.validateManifest(value).errors.length > 0);
  }
});
test('semantics reject inverted ranges, contradictory targets, missing references, bad synergies and incomplete criticals', () => {
  for (const mutate of [m => m.spells[0].rangeMin = 12, m => m.spells[0].targetMode = 'self',
    m => m.spells[0].presentation.animationSpellId = 999999,
    m => m.spells[0].design.references[0].id = 999999,
    m => m.spells[0].design.synergies.push('missing'), m => m.spells[0].critRate = 50,
    m => m.spells[0].effects[0].min = 99, m => m.spells[0].emptyCellOnly = true]) {
    const value = clone(manifest); mutate(value); assert(kit.validateManifest(value).errors.length > 0);
  }
});
test('high output, same-turn AP generation and multi-hit/flat-damage combinations produce explicit review warnings', () => {
  const value = clone(manifest), hit = value.spells[0];
  hit.effects.push(clone(hit.effects[0]));
  value.spells[4].effects.push({ kind: 'buffDamage', target: 'self', zone: 'Pa', min: 30, max: 30, duration: 2 });
  value.spells[4].effects.push({ kind: 'buffPa', target: 'self', zone: 'Pa', min: 1, max: 1, duration: 1 });
  const result = kit.validateManifest(value); assert.deepEqual(result.errors, []);
  for (const text of ['multi-hit', 'AP generation', 'exceeds', 'Class combo']) assert(result.warnings.some(w => w.includes(text)));
});
test('missing icons, wrong dimensions, blank frames and corrupt PNGs fail package validation', () => {
  const missing = files(); missing.delete('icons/cinder_shard.png'); assert(kit.validateFiles(missing).errors.some(e => e.includes('Missing')));
  const wrong = files(); wrong.set('icons/cinder_shard.png', wrong.get('artwork/portrait.png')); assert(kit.validateFiles(wrong).errors.some(e => e.includes('64 × 64')));
  const blank = files(); blank.set('artwork/idle-front.png', fs.readFileSync(path.join(root, 'public/templates/character-artwork/blank/idle-front.png')));
  assert(kit.validateFiles(blank).errors.some(e => e.includes('empty animation frame')));
  const corrupt = files(), bytes = Buffer.from(corrupt.get('artwork/portrait.png')); bytes[50] ^= 1; corrupt.set('artwork/portrait.png', bytes);
  assert(kit.validateFiles(corrupt).errors.length > 0);
});
test('ZIP paths, duplicate files, symlinks, corruption, oversized entries and compressed expansion are rejected', () => {
  for (const name of ['../class.json', '/class.json', 'artwork/../class.json', 'icons\\evil.png']) assert.throws(() => kit.readZip(kit.writeZip(new Map([[name, Buffer.from('{}')]]))));
  const duplicate = kit.writeZip(files());
  const from = Buffer.from('icons/cauterize.png'), to = Buffer.from('icons/crossfire.png');
  for (let at = duplicate.indexOf(from); at >= 0; at = duplicate.indexOf(from, at + to.length)) to.copy(duplicate, at);
  assert.throws(() => kit.readZip(duplicate), /duplicate/);
  const symlink = kit.writeZip(files()); symlink.writeUInt32LE((0xa1ff << 16) >>> 0, centralOffset(symlink) + 38); assert.throws(() => kit.readZip(symlink), /symlink/);
  const bad = kit.writeZip(files()); bad[centralOffset(bad) + 16] ^= 1; assert.throws(() => kit.readZip(bad), /CRC/);
  const large = kit.writeZip(files()); large.writeUInt32LE(100 * 1024 * 1024, centralOffset(large) + 24); assert.throws(() => kit.readZip(large), /limits/);
  const bomb = kit.writeZip(new Map([['class.json', Buffer.alloc(4000, 65)]])); bomb.writeUInt32LE(4, centralOffset(bomb) + 24); assert.throws(() => kit.readZip(bomb));
  assert.throws(() => kit.readZip(Buffer.from('not zip')));
});
test('compiled logical IDs are stable, namespaced, independent of presentation, and preserve critical replacement order', () => {
  const value = clone(manifest); value.spells[0].critRate = 50; value.spells[0].critEffects = clone(value.spells[0].effects);
  const first = kit.compile(value), second = kit.compile({ ...value, version: '0.1.1' });
  assert.deepEqual(first.spells.map(s => s.id), second.spells.map(s => s.id));
  assert.equal(new Set(first.spells.map(s => s.id)).size, 10);
  assert(first.spells.every(s => s.id >= 10000000 && s.key.startsWith('custom_')));
  assert.equal(first.presentationBindings[0].animationSpellId, value.spells[0].presentation.animationSpellId);
  assert.deepEqual(first.spells[0].effects, first.spells[0].critEffects);
});

require('./ai_runtime.cjs');
const { createGame, applyAction, spellsOf } = require('../src/engine/engine');
const { emptyLoadout } = require('../src/engine/equipment');
const { effectiveStat } = require('../src/engine/formulas');
function setup(value = manifest) {
  const compiled = kit.compile(value);
  const loadout = { ...emptyLoadout(value.baseClass), level: 200, base: {}, spells: { custom: compiled.spells, order: compiled.spells.map(s => s.id) } };
  const { state } = createGame({ mapId: 'arene', seed: 73, fighters: [
    { id: 'A', team: 'A', classId: value.baseClass, loadout }, { id: 'B', team: 'B', classId: 'IOP' },
  ] });
  state.currentIndex = state.order.indexOf('A'); state.board.obstacles = {};
  for (const f of Object.values(state.fighters)) { f.hp = f.maxHp = f.baseMaxHp = 3000; f.resistances = {}; f.resistancesFixed = {}; }
  state.fighters.A.pos = { x: 3, y: 3 }; state.fighters.B.pos = { x: 6, y: 3 };
  state.fighters.A.pa = state.fighters.A.basePa = 12; state.fighters.A.stats.intelligence = 600;
  state.fighters.A.permanent = { damage: 30 }; return state;
}
const cast = (state, key, target) => applyAction(state, { type: 'CAST', spell: `custom_${manifest.id.replaceAll('-', '_')}_${key}`, target: target || state.fighters.A.pos });
test('all ten compiled spells resolve and execute their declared mechanics in the real engine', () => {
  for (const s of manifest.spells) {
    const state = setup(); assert.equal(Object.values(spellsOf(state.fighters.A)).length, 10);
    let target = state.fighters.B.pos;
    if (s.key === 'hearth_strike' || s.key === 'ember_wake') state.fighters.B.pos = target = { x: 4, y: 3 };
    if (s.targetMode === 'self' || s.key === 'cauterize') { target = state.fighters.A.pos; state.fighters.A.hp -= 1000; }
    if (s.key === 'ash_step') target = { x: 3, y: 5 };
    const result = cast(state, s.key, target); assert.equal(result.ok, true, s.key);
    assert.equal(result.state.fighters.A.pa, 12 - s.pa, s.key);
    if (s.effects.some(e => e.kind === 'damage')) assert(result.events.some(e => e.t === 'damage' && e.target === 'B' && e.amount > 0), s.key);
    if (s.key === 'cauterize') assert(result.state.fighters.A.hp > state.fighters.A.hp);
    if (s.key === 'ash_step') assert.deepEqual(result.state.fighters.A.pos, target);
    if (s.key === 'ember_wake') assert.equal(result.state.fighters.B.pos.x, 6);
    if (s.key === 'heat_focus') assert(result.state.fighters.A.effects.some(e => e.stat === 'power' && e.value === 60));
    if (s.key === 'ember_ward') assert(result.state.fighters.A.effects.some(e => e.stat === 'res_feu' && e.value === 10));
  }
});
test('boost applies immediately; AP, target limit, range, line-of-sight and cooldown cannot be bypassed', () => {
  const value = clone(manifest); value.spells[0].effects[0].min = value.spells[0].effects[0].max = 20;
  const plain = setup(value), before = cast(plain, 'cinder_shard', plain.fighters.B.pos);
  assert.equal(before.events.find(e => e.t === 'damage').amount, 170);
  const boost = cast(plain, 'heat_focus'); const after = cast(boost.state, 'cinder_shard', plain.fighters.B.pos);
  assert.equal(after.events.find(e => e.t === 'damage').amount, 182);
  assert.equal(cast(boost.state, 'heat_focus').ok, false);
  let twice = cast(before.state, 'cinder_shard', plain.fighters.B.pos); assert.equal(twice.ok, true);
  assert.equal(cast(twice.state, 'cinder_shard', plain.fighters.B.pos).ok, false);
  const empty = setup(); empty.fighters.A.pa = 0; assert.equal(cast(empty, 'cinder_shard', empty.fighters.B.pos).ok, false);
  const far = setup(); far.fighters.B.pos = { x: 12, y: 12 }; assert.equal(cast(far, 'cinder_shard', far.fighters.B.pos).ok, false);
  const blocked = setup(); blocked.board.obstacles['4,3'] = { blocksMove: true, blocksLos: true }; assert.equal(cast(blocked, 'cinder_shard', blocked.fighters.B.pos).ok, false);
});
test('area spell hits from an empty center with correct falloff and real friendly fire', () => {
  const value = clone(manifest), effect = value.spells[2].effects[0]; effect.min = effect.max = 14;
  const state = setup(value); state.fighters.B.pos = { x: 5, y: 3 };
  const result = cast(state, 'crossfire', { x: 4, y: 3 }); assert.equal(result.ok, true);
  const damages = result.events.filter(e => e.t === 'damage');
  assert(damages.some(e => e.target === 'A' && e.amount === 128)); assert(damages.some(e => e.target === 'B' && e.amount === 128));
  assert.equal(result.events.find(e => e.t === 'cast').aoe.length, 5);
});
test('self boost duration expires through real turn transitions and the compiler does not promise initial cooldown', () => {
  let state = cast(setup(), 'heat_focus').state;
  assert.equal(effectiveStat(state.fighters.A, 'power'), 60);
  for (let i = 0; i < 6; i++) state = applyAction(state, { type: 'PASS' }).state;
  assert.equal(effectiveStat(state.fighters.A, 'power'), 0);
  const value = clone(manifest); value.spells[9].initialCooldown = 1; assert.throws(() => kit.compile(value));
});
