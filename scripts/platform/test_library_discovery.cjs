const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), { createHash } = require('node:crypto');
const { summarizeLibraryContents, libraryCategories, libraryMatchesCategory, libraryCategoryCounts, libraryContentLabels } = require('../../server/generated/library.cjs');
const { WorkerPool } = require('../../server/workerPool.cjs');
const { fixture } = require('./fixture.cjs');

test('a published adventure is discoverable by its classes and equipment, including embedded definitions', async () => {
  const source = await fixture(), validated = await new WorkerPool().run({ type: 'validate', bytes: source.bytes });
  const row = { ...validated.metadata, counts: validated.counts, arena: validated.arena };
  assert.deepEqual(validated.counts, { characters: 1, dungeons: 1, equipment: 1, monsters: 1, maps: 1, spells: 2, images: 2, rooms: 1 });
  for (const section of ['all', 'characters', 'equipment', 'adventure', 'mixed']) assert(libraryMatchesCategory(row, section), section);
  assert.equal(libraryContentLabels(row, 'equipment')[0].text, '1 équipement');
});

test('an adventure-only export inventories heroes, every room and nested loadouts without duplicate copies', async () => {
  const { room, character, item } = await fixture();
  const second = structuredClone(room);
  second.id = 'second'; second.battlefield.id = 'second-map'; second.battlefield.name = 'Second map';
  second.members[0].customMonster.name = 'Second guardian';
  const campaign = { ...room, rooms: [room, second] };
  const counts = summarizeLibraryContents({ dungeons: [campaign], characters: [], equipment: [] });
  assert.equal(counts.characters, 1); assert.equal(counts.equipment, 1);
  assert.equal(counts.dungeons, 1); assert.equal(counts.rooms, 2); assert.equal(counts.maps, 2); assert.equal(counts.monsters, 2);
  assert.deepEqual(summarizeLibraryContents({ dungeons: [campaign], characters: [character], equipment: [item] }), counts);
});

test('characters placed as enemies contribute their spells and equipment', async () => {
  const { room, character } = await fixture();
  delete room.adventure; room.members = [{ character, count: 1 }, { character: structuredClone(character), count: 1 }];
  const counts = summarizeLibraryContents({ dungeons: [room] });
  assert.equal(counts.characters, 1); assert.equal(counts.equipment, 1); assert.equal(counts.spells, 1);
});

test('an inaccurate publication label cannot conceal contents or manufacture categories', () => {
  assert.deepEqual(libraryCategories({ kind: 'adventure', counts: { equipment: 2 } }), ['equipment']);
  assert.deepEqual(libraryCategories({ kind: 'mixed', counts: { characters: 1, spells: 4 } }), ['characters']);
  assert.deepEqual(libraryCategories({ kind: 'characters', counts: {} }), []);
  assert.deepEqual(libraryCategories({ kind: 'catalogue' }), ['mixed']);
  const rows = [{ counts: { characters: 1 } }, { counts: { equipment: 2 } }, { counts: { dungeons: 1 } }];
  assert.deepEqual(libraryCategoryCounts(rows), { all: 3, adventure: 1, characters: 1, equipment: 1, mixed: 0 });
});

test('complete catalogues appear in every applicable section, shared maps are counted once', () => {
  const counts = summarizeLibraryContents({}, { classData: { builds: { ONE: {} } }, equipmentData: { items: { 1: {} } },
    monsterData: { monsters: { 2: {} } }, spellLibrary: { spells: { 3: {} } },
    dungeonData: { encounters: [{ id: 'one' }] }, dungeonMaps: [{ id: 'shared' }], outdoorMaps: [{ id: 'shared' }] });
  assert.equal(counts.maps, 1);
  assert.deepEqual(libraryCategories({ kind: 'catalogue', counts }), ['adventure', 'characters', 'equipment', 'mixed']);
});

test('reindexing updates only derived counts and preserves the published archive and activity', async () => {
  const { reindex } = require('./reindex_libraries.cjs'), { createStore } = require('../../server/store.cjs');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'af-index-')), store = createStore({ directory, uri: '' });
  try {
    const { bytes } = await fixture();
    await store.insert('users', { id: 'author', handle: 'original_author', password: 'test-only', recovery: 'test-only', created: '2026-10-16T12:00:00.000Z', admin: 0, isDemo: 0 });
    const record = { id: 'original', owner: 'author', name: 'Original', description: 'Description', kind: 'adventure', release: '1.0.0',
      sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length, counts: { dungeons: 1 }, arena: [],
      created: '2026-10-16T12:00:00.000Z', hidden: 0, isDemo: 0 };
    await store.insert('libraries', record); await store.putFile(record.id, bytes);
    await reindex({ store });
    const saved = await store.one('libraries', { id: record.id });
    for (const key of Object.keys(record).filter(key => key !== 'counts')) assert.deepEqual(saved[key], record[key], key);
    assert.equal(saved.counts.characters, 1); assert.equal(saved.counts.equipment, 1);
    assert.deepEqual(fs.readFileSync(await store.file(record.id)), bytes);
    for (const table of ['votes', 'downloads', 'matches']) assert.equal(await store.count(table), 0);
    assert.equal(await store.count('users'), 1);
    await reindex({ store }); assert.deepEqual((await store.one('libraries', { id: record.id })).counts, saved.counts);
  } finally { await store.close(); fs.rmSync(directory, { recursive: true, force: true }); }
});

test('help, feedback and the other forum sections all have correctly categorized example discussions', () => {
  const { topics } = require('./seed_demo_community.cjs').dataset();
  for (const category of ['general', 'help', 'feedback', 'strategy', 'ai', 'looking']) assert(topics.some(t => t.category === category), category);
  assert.equal(topics.find(t => t.id === 'demo-topic-general-0-3').category, 'help');
  assert(topics.every(t => t.isDemo === 1));
});
