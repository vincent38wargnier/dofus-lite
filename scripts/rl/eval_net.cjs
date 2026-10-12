// Évaluation du bot réseau contre l'IA Maison (ou le cerveau par défaut):
// matchs appariés — même seed joué des DEUX côtés (A puis B) pour annuler
// l'avantage de côté — sur la rotation de cartes d'entraînement.
//
//   node scripts/rl/eval_net.cjs --model local-observations/rl/model-bc \
//     --seedsPerPair 3 [--pairs IOP:CRA,...] [--vs maison|utility] [--workers 14]
require('../ai_runtime.cjs');
const os = require('node:os');
const { Worker, isMainThread, parentPort, workerData } = require('node:worker_threads');
const { createGame, applyAction, getView, currentFighter } = require('../../src/engine/engine');
const { createRng, hashSeed } = require('../../src/engine/rng');
const { makeBotApi } = require('../../src/bots/api');
const { maisonDecide } = require('../../src/bots/maison');
const { utilityDecide } = require('../../src/bots/utilityBrain');
const { kiterDecide } = require('./kiter.cjs');
const { CLASS_IDS } = require('../../src/engine/classes');
const { makeNetBot } = require('./bot_net.cjs');

const TUNE_MAPS = ['arene', 'muraille', 'canyon', 'amakna_1571', 'territoire_des_dopeuls_5383'];
const MAX_ACTIONS_PER_TURN = 25;
const MAX_INVALID_PER_TURN = 3;

function playMatch({ classA, classB, mapId, seed, decideA, decideB, netSummons, netSide }) {
  let { state } = createGame({
    mapId, seed,
    fighters: [
      { id: 'A', name: 'A', classId: classA },
      { id: 'B', name: 'B', classId: classB },
    ],
  });
  const rngs = {};
  let turnKey = '';
  let steps = 0;
  let invalidThisTurn = 0;
  let guard = 0;
  let invalid = 0;
  while (!state.over && guard++ < 10000) {
    const actor = currentFighter(state);
    const id = actor.id;
    const nextKey = `${state.turn}:${id}`;
    if (turnKey !== nextKey) { turnKey = nextKey; steps = 0; invalidThisTurn = 0; }
    const rng = rngs[id] ||= createRng(hashSeed(`${seed}:${id}`));
    let action = { type: 'PASS' };
    try {
      const view = getView(state, id);
      const api = makeBotApi(view, rng);
      // Invocations: cerveau utilitaire par défaut. En --net-summons (phase 1.5),
      // SEUL le camp du net pilote ses invocations avec le net (le camp maison
      // reste utilitaire — maison ne pilote pas via le net).
      const teamDecide = actor.team === 'A' ? decideA : decideB;
      if (actor.isSummon) {
        action = (netSummons && actor.team === netSide) ? teamDecide(view, api) : utilityDecide(view, api);
      } else {
        action = teamDecide(view, api);
      }
      if (!action || !action.type) action = { type: 'PASS' };
    } catch { action = { type: 'PASS' }; }
    if (steps >= MAX_ACTIONS_PER_TURN) action = { type: 'PASS' };
    const result = applyAction(state, action);
    state = result.state;
    if (!result.ok) {
      invalid++;
      if (++invalidThisTurn >= MAX_INVALID_PER_TURN) {
        state = applyAction(state, { type: 'PASS' }).state;
        invalidThisTurn = 0;
      }
    } else steps++;
  }
  return { winner: state.winner || null, turns: state.turn, invalid };
}

function workerMain() {
  const { jobs, modelDir, vs, netSummons } = workerData;
  const net = makeNetBot(modelDir);
  const opponent = vs === 'utility' ? utilityDecide : vs === 'kiter' ? kiterDecide : maisonDecide;
  const results = [];
  for (const job of jobs) {
    // Même seed, réseau côté A puis côté B. netSide = le camp du net (ses
    // invocations sont pilotées par le net en --net-summons).
    const asA = playMatch({ ...job, decideA: net.decide, decideB: opponent, netSummons, netSide: 'A' });
    const asB = playMatch({ ...job, decideA: opponent, decideB: net.decide, netSummons, netSide: 'B' });
    results.push({
      ...job,
      // scoreAsA: le réseau jouait classA; scoreAsB: il jouait classB.
      scoreAsA: asA.winner === 'A' ? 1 : asA.winner === null ? 0.5 : 0,
      scoreAsB: asB.winner === 'B' ? 1 : asB.winner === null ? 0.5 : 0,
      turns: asA.turns + asB.turns,
    });
  }
  parentPort.postMessage({ results, stats: net.stats });
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => (a.startsWith('--') ? [a.slice(2), arr[i + 1]] : null)).filter(Boolean));
  const modelDir = require('node:path').resolve(args.model || 'local-observations/rl/model-bc');
  const vs = args.vs || 'maison';
  const seedsPerPair = Number(args.seedsPerPair || 3);
  const nWorkers = Number(args.workers || Math.max(1, os.cpus().length - 2));
  const pairs = args.pairs
    ? args.pairs.split(',').map((p) => p.split(':'))
    : CLASS_IDS.flatMap((a) => CLASS_IDS.map((b) => [a, b]));

  const jobs = [];
  for (const [classA, classB] of pairs) {
    for (let k = 0; k < seedsPerPair; k++) {
      jobs.push({
        classA, classB,
        mapId: TUNE_MAPS[(k + jobs.length) % TUNE_MAPS.length],
        seed: hashSeed(`evalnet:${classA}:${classB}:${k}`),
      });
    }
  }
  const buckets = Array.from({ length: Math.min(nWorkers, jobs.length) }, () => []);
  jobs.forEach((job, i) => buckets[i % buckets.length].push(job));
  console.log(`${jobs.length} duels appariés (×2 côtés) vs ${vs}, ${buckets.length} workers`);
  const t0 = performance.now();

  const netSummons = 'net-summons' in args;
  const all = await Promise.all(buckets.map((bucket) => new Promise((resolve, reject) => {
    const worker = new Worker(__filename, { workerData: { jobs: bucket, modelDir, vs, netSummons } });
    worker.on('message', resolve);
    worker.on('error', reject);
  })));

  const results = all.flatMap((r) => r.results);
  const stats = { decisions: 0, fallbackSum: 0, illegalArgmax: 0, ms: 0 };
  for (const r of all) for (const k of Object.keys(stats)) stats[k] += r.stats[k];

  const total = results.length * 2;
  const score = results.reduce((s, r) => s + r.scoreAsA + r.scoreAsB, 0);
  const byClass = {};
  for (const r of results) {
    const a = byClass[r.classA] ||= { score: 0, n: 0 };
    a.score += r.scoreAsA; a.n += 1;
    const b = byClass[r.classB] ||= { score: 0, n: 0 };
    b.score += r.scoreAsB; b.n += 1;
  }
  console.log(JSON.stringify({
    model: modelDir, vs, matches: total,
    netWinRate: +(score / total).toFixed(3),
    avgDecisionMs: +(stats.ms / stats.decisions).toFixed(2),
    illegalArgmaxRate: +(stats.illegalArgmax / stats.decisions).toFixed(3),
    avgFallbackDepth: +(stats.fallbackSum / stats.decisions).toFixed(2),
    wallSec: +((performance.now() - t0) / 1000).toFixed(1),
    winRateByClass: Object.fromEntries(Object.entries(byClass).map(([c, b]) => [c, +(b.score / b.n).toFixed(3)])),
  }, null, 2));
}

if (isMainThread) main().catch((e) => { console.error(e); process.exit(1); });
else workerMain();
