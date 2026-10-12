// Génère un dataset d'imitation pour l'IA neuronale: des matchs IA Maison vs
// IA Maison headless, en parallèle (worker_threads), qui enregistrent CHAQUE
// décision (vue → action choisie) plus l'issue du match. Même squelette de
// boucle que scripts/benchmark_ai.cjs, mêmes garde-fous que l'arbitre.
//
//   node scripts/rl/gen_dataset.cjs --out local-observations/rl/ds-v1 \
//     --seedsPerPair 6 --workers 16 [--pairs IOP:CRA,...] [--runSeed bc1]
//
// Sortie: shard_<i>.jsonl.gz (1 ligne JSON par décision), catalog.json
// (statiques des sorts + cartes, retirés des vues), manifest.json (comptes,
// winrates par classe, débit). Déterministe à runSeed fixé.
require('../ai_runtime.cjs');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const os = require('node:os');
const { Worker, isMainThread, parentPort, workerData } = require('node:worker_threads');
const { createGame, applyAction, getView, currentFighter } = require('../../src/engine/engine');
const { createRng, hashSeed } = require('../../src/engine/rng');
const { makeBotApi } = require('../../src/bots/api');
const { maisonDecide } = require('../../src/bots/maison');
const { utilityDecide } = require('../../src/bots/utilityBrain');
const { CLASS_IDS } = require('../../src/engine/classes');
const { MAPS } = require('../../src/engine/maps');

const TUNE_MAPS = ['arene', 'muraille', 'canyon', 'amakna_1571', 'territoire_des_dopeuls_5383'];
const MAX_ACTIONS_PER_TURN = 25;
const MAX_INVALID_PER_TURN = 3;

// Champs d'un sort qui dépendent du combat en cours; tout le reste est
// identique pour un même (key, grade) et part dans catalog.json.
const SPELL_DYNAMIC = ['key', 'grade', 'pa', 'range', 'cooldownLeft', 'usesLeft'];

function slimSpell(spell, catalog) {
  const id = `${spell.key}:${spell.grade}`;
  if (!catalog.has(id)) {
    const statics = { ...spell };
    for (const k of SPELL_DYNAMIC) delete statics[k];
    catalog.set(id, statics);
  }
  return Object.fromEntries(SPELL_DYNAMIC.map((k) => [k, spell[k]]));
}

function slimFighter(f, catalog) {
  const out = { ...f };
  out.spells = f.spells.map((s) => slimSpell(s, catalog));
  if (f.weaponSpell) out.weaponSpell = slimSpell(f.weaponSpell, catalog);
  return out;
}

// La vue est déjà un clone frais (getView) — on peut la remodeler sur place.
function slimView(view, catalog) {
  return {
    phase: view.phase,
    turn: view.turn,
    maxTurns: view.maxTurns,
    you: slimFighter(view.you, catalog),
    enemies: view.enemies.map((f) => slimFighter(f, catalog)),
    allies: view.allies.map((f) => slimFighter(f, catalog)),
    hazards: view.hazards,
    // board statique → catalog (clé map:<id>), on ne garde que la référence.
  };
}

function playMatch(job, catalog, rows) {
  const { classA, classB, mapId, seed } = job;
  let { state } = createGame({
    mapId,
    seed,
    fighters: [
      { id: 'A', name: 'maison-A', classId: classA },
      { id: 'B', name: 'maison-B', classId: classB },
    ],
  });
  const rngs = {};
  const stats = { decisions: 0, invalid: 0, forced: 0, errors: 0, turns: 0 };
  const pending = [];
  let turnKey = '';
  let steps = 0;
  let invalidThisTurn = 0;
  let guard = 0;
  while (!state.over && guard++ < 10000) {
    const actor = currentFighter(state);
    const id = actor.id;
    const nextKey = `${state.turn}:${id}`;
    if (turnKey !== nextKey) { turnKey = nextKey; steps = 0; invalidThisTurn = 0; stats.turns++; }
    const rng = rngs[id] ||= createRng(hashSeed(`${seed}:${id}`));
    let action = { type: 'PASS' };
    let view = null;
    let errored = false;
    try {
      view = getView(state, id);
      const api = makeBotApi(view, rng);
      action = actor.isSummon ? utilityDecide(view, api) : maisonDecide(view, api);
      if (!action || !action.type) action = { type: 'PASS' };
    } catch (error) {
      stats.errors++; errored = true; action = { type: 'PASS' };
    }
    const forced = steps >= MAX_ACTIONS_PER_TURN;
    if (forced) { action = { type: 'PASS' }; stats.forced++; }
    const result = applyAction(state, action);
    state = result.state;
    if (!errored && !forced && view) {
      stats.decisions++;
      if (!result.ok) stats.invalid++;
      pending.push({
        map: mapId, cls: { A: classA, B: classB }, seed,
        turn: view.turn, fid: id, summon: actor.isSummon ? 1 : 0,
        team: actor.team, act: action, ok: result.ok ? 1 : 0,
        view: slimView(view, catalog),
      });
    }
    if (!result.ok && ++invalidThisTurn >= MAX_INVALID_PER_TURN) {
      state = applyAction(state, { type: 'PASS' }).state;
      invalidThisTurn = 0;
    }
    if (result.ok) steps++;
  }
  const winner = state.winner || null;
  for (const row of pending) {
    row.out = winner === null ? 0.5 : (winner === row.team ? 1 : 0);
    rows.push(JSON.stringify(row));
  }
  return { stats, winner, turns: state.turn };
}

function workerMain() {
  const { jobs, shardPath } = workerData;
  const catalog = new Map();
  const gzip = zlib.createGzip({ level: 6 });
  gzip.pipe(fs.createWriteStream(shardPath));
  const totals = { matches: 0, decisions: 0, invalid: 0, forced: 0, errors: 0, draws: 0 };
  const wins = {};
  const t0 = performance.now();
  let chain = Promise.resolve();
  for (const job of jobs) {
    const rows = [];
    const { stats, winner, turns } = playMatch(job, catalog, rows);
    totals.matches++;
    totals.decisions += stats.decisions;
    totals.invalid += stats.invalid;
    totals.forced += stats.forced;
    totals.errors += stats.errors;
    if (winner === null) totals.draws++;
    else {
      const cls = winner === 'A' ? job.classA : job.classB;
      wins[cls] = (wins[cls] || 0) + 1;
    }
    const block = rows.join('\n') + '\n';
    chain = chain.then(() => new Promise((resolve) => gzip.write(block, resolve)));
    if (totals.matches % 25 === 0) parentPort.postMessage({ t: 'progress', matches: totals.matches });
  }
  chain.then(() => new Promise((resolve) => gzip.end(resolve))).then(() => {
    parentPort.postMessage({
      t: 'done', totals, wins, ms: performance.now() - t0,
      catalog: Object.fromEntries(catalog),
    });
  });
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => (a.startsWith('--') ? [a.slice(2), arr[i + 1]] : null)).filter(Boolean));
  const outDir = path.resolve(args.out || 'local-observations/rl/ds-v1');
  const seedsPerPair = Number(args.seedsPerPair || 6);
  const nWorkers = Number(args.workers || Math.max(1, os.cpus().length - 2));
  const runSeed = args.runSeed || 'bc1';
  const pairs = args.pairs
    ? args.pairs.split(',').map((p) => p.split(':'))
    : CLASS_IDS.flatMap((a) => CLASS_IDS.map((b) => [a, b]));

  const jobs = [];
  for (const [classA, classB] of pairs) {
    for (let k = 0; k < seedsPerPair; k++) {
      const mapId = TUNE_MAPS[(k + jobs.length) % TUNE_MAPS.length];
      jobs.push({ classA, classB, mapId, seed: hashSeed(`${runSeed}:${classA}:${classB}:${k}`) });
    }
  }
  // Mélange déterministe pour équilibrer la charge entre workers.
  const rng = createRng(hashSeed(`${runSeed}:shuffle`));
  for (let i = jobs.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [jobs[i], jobs[j]] = [jobs[j], jobs[i]];
  }

  fs.mkdirSync(outDir, { recursive: true });
  const buckets = Array.from({ length: nWorkers }, () => []);
  jobs.forEach((job, i) => buckets[i % nWorkers].push(job));

  console.log(`${jobs.length} matchs (${pairs.length} paires × ${seedsPerPair} seeds), ${nWorkers} workers → ${outDir}`);
  const t0 = performance.now();
  let doneMatches = 0;
  const results = await Promise.all(buckets.map((bucket, i) => new Promise((resolve, reject) => {
    const worker = new Worker(__filename, {
      workerData: { jobs: bucket, shardPath: path.join(outDir, `shard_${String(i).padStart(2, '0')}.jsonl.gz`) },
    });
    worker.on('message', (msg) => {
      if (msg.t === 'progress') {
        doneMatches += 25;
        if (doneMatches % 500 === 0) console.log(`  ~${doneMatches}/${jobs.length} matchs, ${(doneMatches / ((performance.now() - t0) / 1000)).toFixed(1)}/s`);
      } else if (msg.t === 'done') resolve(msg);
    });
    worker.on('error', reject);
  })));

  const catalog = { spells: {}, maps: {} };
  const totals = { matches: 0, decisions: 0, invalid: 0, forced: 0, errors: 0, draws: 0 };
  const wins = {};
  for (const r of results) {
    Object.assign(catalog.spells, r.catalog);
    for (const k of Object.keys(totals)) totals[k] += r.totals[k];
    for (const [cls, n] of Object.entries(r.wins)) wins[cls] = (wins[cls] || 0) + n;
  }
  for (const id of new Set(jobs.map((j) => j.mapId))) {
    const m = MAPS[id];
    catalog.maps[id] = { width: m.width, height: m.height, obstacles: Object.values(m.obstacles) };
  }
  const wallSec = (performance.now() - t0) / 1000;
  const manifest = {
    createdAt: new Date().toISOString(), runSeed, seedsPerPair,
    pairs: pairs.length, workers: nWorkers, ...totals, wins,
    wallSec: +wallSec.toFixed(1), matchesPerSec: +(totals.matches / wallSec).toFixed(1),
    shards: results.length, maps: [...new Set(jobs.map((j) => j.mapId))],
  };
  fs.writeFileSync(path.join(outDir, 'catalog.json'), JSON.stringify(catalog));
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify(manifest, null, 2));
}

if (isMainThread) main().catch((e) => { console.error(e); process.exit(1); });
else workerMain();
