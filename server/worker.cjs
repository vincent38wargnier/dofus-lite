const { parentPort, workerData: task } = require('node:worker_threads');
const fs = require('node:fs'), { inflateRawSync } = require('node:zlib'), { randomUUID } = require('node:crypto');
const { readLibrary, mergeCatalogues, readContentZip, summarizeLibraryContents } = require('./generated/library.cjs');
const inflate = (bytes, size) => new Uint8Array(inflateRawSync(bytes, { maxOutputLength: size }));
async function run() {
  const library = await readLibrary(task.bytes || fs.readFileSync(task.file), inflate);
  const cover = library.metadata.cover ? Buffer.from(library.files.get(library.metadata.cover)) : null;
  if (cover) require('./covers.cjs').verifyCover(cover);
  globalThis.__ARENA_CATALOGUE__ = mergeCatalogues([library]);
  const engine = require('./generated/runtime.cjs');
  let contents = { characters: [], dungeons: [], equipment: [], records: [], warnings: [] };
  if (library.atelier) {
    const files = await readContentZip(library.atelier, inflate, { limits: engine.ATELIER_LIMITS, allowName: engine.atelierArchivePath });
    if (!files.has('atelier.json')) throw new Error('Exportez les créations au format Atelier avant publication.');
    contents = await engine.prepareAtelierFiles(files, { newId: randomUUID, verifyPixels: require('./png.cjs').verifyPixels });
  }
  const catalogueCharacters = Object.keys(library.catalogue?.classData.builds || {}).map(classId => ({
    name: engine.CLASSES[classId]?.name || classId, classId,
    loadout: {...engine.emptyLoadout(classId),level:200},
  }));
  const candidates = [...contents.characters, ...contents.dungeons.flatMap(d => (d.adventure?.heroes || []).map(h => h.character)), ...catalogueCharacters];
  const seen = new Set();
  const fighters = candidates.filter(c => {
    const key=JSON.stringify({name:c.name,classId:c.classId,loadout:c.loadout});
    if(seen.has(key) || !Object.keys(engine.resolveSpellLoadout(c.classId,c.loadout).spells).length || !engine.resolveLoadout(c.classId,c.loadout).valid)return false;
    seen.add(key);return true;
  });
  const arena = fighters.map((c, index) => ({ index, name: c.name, spells: Object.keys(engine.resolveSpellLoadout(c.classId,c.loadout).spells).length, level: c.loadout.level || 100 }));
  if (task.type === 'validate') return { metadata: library.metadata, cover,
    counts: summarizeLibraryContents(contents, library.catalogue), arena, warnings: contents.warnings };
  if (task.type === 'check-bot') {
    const result = engine.inspectAiSource(task.code);
    if (!result.ok) throw new Error(result.error || result.errors?.join(' ') || 'Code invalide.');
    const { sandboxBot } = require('./sandbox.cjs'); const bot = await sandboxBot(task.code); bot.close(); return { ok: true };
  }
  const fighter = fighters[task.fighter];
  if (!fighter) throw new Error('Personnage de compétition introuvable.');
  const { sandboxBot } = require('./sandbox.cjs'), results = [];
  for (const offset of [0,1]) for (const reversed of [false,true]) {
    const one = await sandboxBot(reversed ? task.b.code : task.a.code), two = await sandboxBot(reversed ? task.a.code : task.b.code);
    try {
      const match = engine.runMatch({ mapId: 'arene', seed: task.seed + offset, collectFrames: false,
        classes: { A: fighter.classId, B: fighter.classId }, loadouts: { A: fighter.loadout, B: fighter.loadout },
        bots: { A: { name: reversed ? task.b.name : task.a.name, decide: one.decide }, B: { name: reversed ? task.a.name : task.b.name, decide: two.decide } } });
      const winner = match.winner || match.state?.winner;
      const sideA = reversed ? task.b.id : task.a.id, sideB = reversed ? task.a.id : task.b.id;
      results.push({ seed: task.seed + offset, a: sideA, b: sideB, winner: winner === 'A' ? sideA : winner === 'B' ? sideB : null,
        turns: match.turns ?? match.state?.turn, stats: match.stats, events: match.events });
    } finally { one.close(); two.close(); }
  }
  return { games: results, engine: 1, rule: 'Identical fighter; two seeds; both starting sides', verified: true };
}
run().then(value => parentPort.postMessage({ value }), error => parentPort.postMessage({ error: error.message }));
