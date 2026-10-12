// Self-play PPO — génère UNE itération de données: le réseau COURANT
// (--weights) joue contre lui-même (miroir: les DEUX camps enregistrés) ou
// contre un checkpoint passé du pool (--pool, côté apprenant alterné).
// L'IA Maison n'apparaît jamais ici — elle ne sert qu'à l'évaluation.
//
// Chaque décision du camp apprenant est TIRÉE de la politique (softmax sur
// les actions légales uniquement, T=1) et enregistrée: obs f32, masque légal
// packé en bits (little-endian), action u32. Les pas d'un épisode sont
// contigus dans l'ordre d'écriture. Récompense terminale: win +1 / loss −1 /
// nul 0, + 0.25 × marge de PV des racines (signée par camp).
//
//   node scripts/rl/selfplay_iter.cjs --weights DIR --out DIR --matches 448 \
//     [--pool d1,d2,...] [--poolP 0.35] [--workers 13] [--tag ppo:0]
require('../ai_runtime.cjs');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { Worker, isMainThread, parentPort, workerData } = require('node:worker_threads');
const { createGame, applyAction, getView, currentFighter } = require('../../src/engine/engine');
const { createRng, hashSeed } = require('../../src/engine/rng');
const { makeBotApi } = require('../../src/bots/api');
const { utilityDecide } = require('../../src/bots/utilityBrain');
const { monsterDecide } = require('../../src/engine/monsters');
const { kiterDecide } = require('./kiter.cjs');
const { CLASS_IDS } = require('../../src/engine/classes');
const enc = require('./encoder.cjs');
const { loadModel: loadModelJs } = require('./bot_net.cjs');

// Forward ORT (natif) quand model.onnx est présent dans le dossier de poids
// (export_onnx.py), sinon forward JS pur — parité argmax 100%, |Δlogit|<1e-4.
let loadModelOrt = null;
try { ({ loadModel: loadModelOrt } = require('./bot_net_ort.cjs')); } catch { /* onnxruntime absent */ }
const loadModel = (dir) => {
  if (loadModelOrt && fs.existsSync(path.join(dir, 'model.onnx'))) {
    try { return loadModelOrt(dir); } catch { /* fallback JS */ }
  }
  return loadModelJs(dir);
};

const TUNE_MAPS = ['arene', 'muraille', 'canyon', 'amakna_1571', 'territoire_des_dopeuls_5383'];
const MAX_ACTIONS_PER_TURN = 25;
const MAX_INVALID_PER_TURN = 3;
const MASK_BYTES = Math.ceil(enc.ACTION_DIM / 8);

// Politique d'échantillonnage: forward JS pur + masque des actions légales
// construit via l'api officielle (reachable/castTargets/canCast).
function makeSampler(dir) {
  const model = loadModel(dir);
  const obs = new Float32Array(enc.OBS_DIM);
  const mask = new Uint8Array(enc.ACTION_DIM);
  const expv = new Float64Array(enc.ACTION_DIM);
  const stats = { decisions: 0, ms: 0, legalSum: 0 };

  // castTargets ne connaît que you.spells — l'arme passe par canCast sur le
  // losange de portée.
  const weaponTargets = (view, api, w) => {
    const out = [];
    const r1 = w.range?.[1] ?? 2;
    const { x, y } = view.you.pos;
    const bw = view.board.width;
    const bh = view.board.height;
    for (let dy = -r1; dy <= r1; dy++) {
      const span = r1 - Math.abs(dy);
      for (let dx = -span; dx <= span; dx++) {
        const c = { x: x + dx, y: y + dy };
        if (c.x >= 0 && c.y >= 0 && c.x < bw && c.y < bh && api.canCast(w.key, c).ok) out.push(c);
      }
    }
    return out;
  };

  const decide = (view, api, rnd, rec) => {
    const t0 = performance.now();
    enc.encodeSample({ view, board: view.board }, null, obs);
    const logits = model.forward(obs);
    mask.fill(0);
    mask[0] = 1;
    let legal = 1;
    for (const c of api.reachable()) { mask[1 + enc.cellIdx(c.pos)] = 1; legal++; }
    const you = view.you;
    const castable = (s) => s && (s.pa || 0) <= you.pa && (s.cooldownLeft || 0) <= 0 && (s.usesLeft ?? 99) > 0;
    const spells = you.spells || [];
    for (let slot = 0; slot < Math.min(spells.length, enc.SPELL_SLOTS - 1); slot++) {
      if (!castable(spells[slot])) continue;
      for (const c of api.castTargets(spells[slot].key)) {
        mask[1 + enc.CELLS + slot * enc.CELLS + enc.cellIdx(c)] = 1;
        legal++;
      }
    }
    if (castable(you.weaponSpell)) {
      for (const c of weaponTargets(view, api, you.weaponSpell)) {
        mask[1 + enc.CELLS + enc.WEAPON_SLOT * enc.CELLS + enc.cellIdx(c)] = 1;
        legal++;
      }
    }
    // Softmax masqué (T=1), tirage par la rng du camp.
    let max = -Infinity;
    for (let i = 0; i < enc.ACTION_DIM; i++) if (mask[i] && logits[i] > max) max = logits[i];
    let sum = 0;
    for (let i = 0; i < enc.ACTION_DIM; i++) {
      expv[i] = mask[i] ? Math.exp(logits[i] - max) : 0;
      sum += expv[i];
    }
    let r = rnd.next() * sum;
    let idx = 0;
    for (let i = 0; i < enc.ACTION_DIM; i++) {
      if (!mask[i]) continue;
      idx = i;
      r -= expv[i];
      if (r <= 0) break;
    }
    if (rec) {
      const packed = new Uint8Array(MASK_BYTES);
      for (let i = 0; i < enc.ACTION_DIM; i++) if (mask[i]) packed[i >> 3] |= 1 << (i & 7);
      rec.obs.push(obs.slice());
      rec.mask.push(packed);
      rec.act.push(idx);
    }
    stats.decisions++;
    stats.legalSum += legal;
    stats.ms += performance.now() - t0;
    return enc.labelToAction(idx, view);
  };
  return { decide, stats };
}

function playMatch(job, samplers, netSummons, marginCoef) {
  const { classA, classB, mapId, seed } = job;
  // Curriculum (stage A): miroir monstre-vs-monstre — même moteur, mêmes
  // règles, kit simple (ex. Bouftou 101: 1 sort). Le net pilote les deux.
  let { state } = createGame({
    mapId, seed,
    fighters: job.monster
      ? [
        { id: 'A', name: 'A', monsterId: job.monster.id, monsterGrade: job.monster.grade },
        { id: 'B', name: 'B', monsterId: job.monster.id, monsterGrade: job.monster.grade },
      ]
      : [
        { id: 'A', name: 'A', classId: classA },
        { id: 'B', name: 'B', classId: classB },
      ],
  });
  const apiRngs = {};
  const recs = {};
  for (const side of job.learnerSides) recs[side] = { obs: [], mask: [], act: [] };
  const smpRngs = { A: createRng(hashSeed(`${seed}:smpA`)), B: createRng(hashSeed(`${seed}:smpB`)) };
  let turnKey = '';
  let steps = 0;
  let invalidThisTurn = 0;
  let guard = 0;
  let invalid = 0;
  let forced = 0;
  while (!state.over && guard++ < 10000) {
    const actor = currentFighter(state);
    const id = actor.id;
    const nextKey = `${state.turn}:${id}`;
    if (turnKey !== nextKey) { turnKey = nextKey; steps = 0; invalidThisTurn = 0; }
    let action = { type: 'PASS' };
    if (steps >= MAX_ACTIONS_PER_TURN) {
      forced++; // garde-fou référent: on ne passe PAS par la politique (rien d'enregistré)
    } else {
      try {
        const view = getView(state, id);
        const api = makeBotApi(view, apiRngs[id] ||= createRng(hashSeed(`${seed}:${id}`)));
        if (actor.isSummon && !netSummons) {
          // Invocations: cerveau utilitaire (défaut, phase 1).
          action = utilityDecide(view, api);
        } else {
          // Phase 1.5 (--net-summons): le MÊME net pilote aussi ses invocations
          // (une invoc = une unité, même view/action), décisions enregistrées
          // côté apprenant → apprises par récompense d'équipe en self-play.
          const side = actor.team;
          action = samplers[side].decide(view, api, smpRngs[side], recs[side] || null);
        }
        if (!action || !action.type) action = { type: 'PASS' };
      } catch { action = { type: 'PASS' }; }
    }
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
  const roots = {};
  for (const f of Object.values(state.fighters || {})) if (f.id === 'A' || f.id === 'B') roots[f.id] = f;
  const frac = (f) => (f && f.maxHp > 0 ? Math.max(0, f.hp) / f.maxHp : 0);
  const margin = frac(roots.A) - frac(roots.B);
  const base = (side) => (state.winner === side ? 1 : state.winner ? -1 : 0);
  const episodes = [];
  for (const side of job.learnerSides) {
    const r = recs[side];
    if (!r.act.length) continue;
    episodes.push({
      side,
      steps: r.act.length,
      reward: base(side) + marginCoef * (side === 'A' ? margin : -margin),
      win: state.winner === side ? 1 : 0,
      draw: state.winner ? 0 : 1,
      mirror: job.oppDir || job.oppKind ? 0 : 1,
      oppKind: job.oppKind || (job.oppDir ? 'pool' : 'mirror'),
      classMe: job.monster ? `monstre:${job.monster.id}` : (side === 'A' ? classA : classB),
      classOpp: job.monster ? `monstre:${job.monster.id}` : (side === 'A' ? classB : classA),
      map: mapId,
      turns: state.turn,
    });
  }
  return { episodes, recs, invalid, forced };
}

function workerMain() {
  const { jobs, weightsDir, outDir, widx, netSummons, marginCoef } = workerData;
  const learner = makeSampler(weightsDir);
  const oppCache = new Map();
  const kiter = { decide: kiterDecide };
  // Ancre/jauge du curriculum monstre: le cerveau utilitaire version monstre
  // (agressif, peur réduite) — même rôle que l'ancre kiteur côté classes.
  const mbrain = { decide: (view, api) => monsterDecide(view, api, utilityDecide) };
  const obsBufs = [];
  const maskBufs = [];
  const actList = [];
  const episodes = [];
  let invalid = 0;
  let forced = 0;
  const t0 = performance.now();
  for (const job of jobs) {
    let opp = learner;
    if (job.oppKind === 'kiter') {
      opp = kiter;
    } else if (job.oppKind === 'mbrain') {
      opp = mbrain;
    } else if (job.oppDir) {
      if (!oppCache.has(job.oppDir)) oppCache.set(job.oppDir, makeSampler(job.oppDir));
      opp = oppCache.get(job.oppDir);
    }
    const samplers = {
      A: job.learnerSides.includes('A') ? learner : opp,
      B: job.learnerSides.includes('B') ? learner : opp,
    };
    const res = playMatch(job, samplers, netSummons, marginCoef);
    invalid += res.invalid;
    forced += res.forced;
    for (const ep of res.episodes) {
      const r = res.recs[ep.side];
      for (const o of r.obs) obsBufs.push(Buffer.from(o.buffer, o.byteOffset, o.length * 4));
      for (const m of r.mask) maskBufs.push(Buffer.from(m.buffer, m.byteOffset, m.length));
      for (const a of r.act) actList.push(a);
      episodes.push(ep);
    }
  }
  fs.writeFileSync(path.join(outDir, `obs_w${widx}.f32`), Buffer.concat(obsBufs));
  fs.writeFileSync(path.join(outDir, `mask_w${widx}.bin`), Buffer.concat(maskBufs));
  const acts = new Uint32Array(actList);
  fs.writeFileSync(path.join(outDir, `act_w${widx}.u32`), Buffer.from(acts.buffer, 0, acts.length * 4));
  parentPort.postMessage({
    widx,
    episodes,
    steps: actList.length,
    matches: jobs.length,
    invalid,
    forced,
    stats: learner.stats,
    sec: (performance.now() - t0) / 1000,
  });
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2)
    .map((a, i, arr) => (a.startsWith('--') ? [a.slice(2), arr[i + 1]] : null))
    .filter(Boolean));
  const weightsDir = path.resolve(args.weights);
  const outDir = path.resolve(args.out);
  const matches = Number(args.matches || 448);
  const poolP = Number(args.poolP || 0.35);
  const kiterP = Number(args.kiterP || 0);
  // Curriculum monstre (stage A: bouftou 101 grade 5 sur canyon — trous/rochers)
  const monsterP = Number(args.monsterP || 0);
  const monsterId = Number(args.monsterId || 101);
  const monsterGrade = Number(args.monsterGrade || 5);
  const monsterMap = args.monsterMap || null;
  const mbrainP = Number(args.mbrainP || 0);
  const marginCoef = args.marginCoef != null ? Number(args.marginCoef) : 0.25;
  const pool = (args.pool || '').split(',').map((s) => s.trim()).filter(Boolean).map((p) => path.resolve(p));
  const nWorkers = Number(args.workers || Math.max(1, os.cpus().length - 4));
  const tag = args.tag || `sp:${Date.now()}`;
  const netSummons = 'net-summons' in args; // phase 1.5: net pilote ses invocations

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  const rng = createRng(hashSeed(`${tag}:jobs`));
  const jobs = [];
  for (let i = 0; i < matches; i++) {
    if (rng.next() < monsterP) {
      const isMbrain = rng.next() < mbrainP;
      const oppDir = !isMbrain && pool.length && rng.next() < poolP ? pool[rng.int(0, pool.length - 1)] : null;
      jobs.push({
        monster: { id: monsterId, grade: monsterGrade },
        mapId: monsterMap || TUNE_MAPS[rng.int(0, TUNE_MAPS.length - 1)],
        seed: hashSeed(`${tag}:m${i}`),
        oppDir,
        oppKind: isMbrain ? 'mbrain' : undefined,
        learnerSides: oppDir || isMbrain ? [i % 2 ? 'B' : 'A'] : ['A', 'B'],
      });
      continue;
    }
    const isKiter = rng.next() < kiterP;
    const oppDir = !isKiter && pool.length && rng.next() < poolP ? pool[rng.int(0, pool.length - 1)] : null;
    jobs.push({
      classA: CLASS_IDS[rng.int(0, CLASS_IDS.length - 1)],
      classB: CLASS_IDS[rng.int(0, CLASS_IDS.length - 1)],
      mapId: TUNE_MAPS[rng.int(0, TUNE_MAPS.length - 1)],
      seed: hashSeed(`${tag}:m${i}`),
      oppDir,
      oppKind: isKiter ? 'kiter' : undefined,
      learnerSides: oppDir || isKiter ? [i % 2 ? 'B' : 'A'] : ['A', 'B'],
    });
  }
  const buckets = Array.from({ length: Math.min(nWorkers, jobs.length) }, () => []);
  jobs.forEach((job, i) => buckets[i % buckets.length].push(job));
  const t0 = performance.now();
  const all = await Promise.all(buckets.map((bucket, widx) => new Promise((resolve, reject) => {
    const worker = new Worker(__filename, { workerData: { jobs: bucket, weightsDir, outDir, widx, netSummons, marginCoef } });
    worker.on('message', resolve);
    worker.on('error', reject);
  })));
  all.sort((a, b) => a.widx - b.widx);

  const shards = all.map((r) => ({
    obs: `obs_w${r.widx}.f32`,
    mask: `mask_w${r.widx}.bin`,
    act: `act_w${r.widx}.u32`,
    steps: r.steps,
    episodes: r.episodes,
  }));
  const eps = all.flatMap((r) => r.episodes);
  const vsPool = eps.filter((e) => e.oppKind === 'pool');
  const vsKiter = eps.filter((e) => e.oppKind === 'kiter');
  const vsMbrain = eps.filter((e) => e.oppKind === 'mbrain');
  const agg = { decisions: 0, ms: 0, legalSum: 0 };
  for (const r of all) for (const k of Object.keys(agg)) agg[k] += r.stats[k];
  const manifest = {
    featureVersion: enc.FEATURE_VERSION,
    obsDim: enc.OBS_DIM,
    actionDim: enc.ACTION_DIM,
    maskBytes: MASK_BYTES,
    tag,
    weights: weightsDir,
    pool,
    poolP,
    matches,
    steps: shards.reduce((s, x) => s + x.steps, 0),
    episodes: eps.length,
    winVsPool: vsPool.length ? +(vsPool.reduce((s, e) => s + e.win + 0.5 * e.draw, 0) / vsPool.length).toFixed(3) : null,
    winVsKiter: vsKiter.length ? +(vsKiter.reduce((s, e) => s + e.win + 0.5 * e.draw, 0) / vsKiter.length).toFixed(3) : null,
    winVsMbrain: vsMbrain.length ? +(vsMbrain.reduce((s, e) => s + e.win + 0.5 * e.draw, 0) / vsMbrain.length).toFixed(3) : null,
    kiterP,
    monsterP,
    marginCoef,
    rewardMean: +(eps.reduce((s, e) => s + e.reward, 0) / Math.max(1, eps.length)).toFixed(3),
    drawRate: +(eps.reduce((s, e) => s + e.draw, 0) / Math.max(1, eps.length)).toFixed(3),
    invalid: all.reduce((s, r) => s + r.invalid, 0),
    forced: all.reduce((s, r) => s + r.forced, 0),
    avgDecisionMs: +(agg.ms / Math.max(1, agg.decisions)).toFixed(2),
    avgLegal: +(agg.legalSum / Math.max(1, agg.decisions)).toFixed(1),
    wallSec: +((performance.now() - t0) / 1000).toFixed(1),
    shards,
  };
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest));
  const { shards: _s, ...summary } = manifest;
  console.log(JSON.stringify(summary));
}

if (isMainThread) main().catch((e) => { console.error(e); process.exit(1); });
else workerMain();
