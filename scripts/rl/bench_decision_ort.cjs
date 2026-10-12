// Copie de bench_decision.cjs avec le forward ONNX Runtime (bot_net_ort.cjs)
// à la place du forward JS pur — mêmes cartes, mêmes seeds, mêmes phases pour
// une comparaison à poids égaux. Convertir le dossier d'abord:
//   python3 scripts/rl/export_onnx.py <weightsDir>
//   node scripts/rl/bench_decision_ort.cjs <weightsDir> [matches=8]
require('../ai_runtime.cjs');
const { createGame, applyAction, getView, currentFighter } = require('../../src/engine/engine');
const { createRng, hashSeed } = require('../../src/engine/rng');
const { makeBotApi } = require('../../src/bots/api');
const { utilityDecide } = require('../../src/bots/utilityBrain');
const { CLASS_IDS } = require('../../src/engine/classes');
const enc = require('./encoder.cjs');
const { loadModel } = require('./bot_net_ort.cjs');

const TUNE_MAPS = ['arene', 'muraille', 'canyon', 'amakna_1571', 'territoire_des_dopeuls_5383'];
const weightsDir = process.argv[2];
const nMatches = Number(process.argv[3] || 8);
const model = loadModel(weightsDir);
const obs = new Float32Array(enc.OBS_DIM);
const mask = new Uint8Array(enc.ACTION_DIM);
const expv = new Float64Array(enc.ACTION_DIM);
const T = { encode: 0, forward: 0, maskMove: 0, maskCast: 0, sample: 0, engine: 0 };
let nDec = 0;
let legalSum = 0;

const weaponTargets = (view, api, w) => {
  const out = [];
  const r1 = w.range?.[1] ?? 2;
  const { x, y } = view.you.pos;
  for (let dy = -r1; dy <= r1; dy++) {
    const span = r1 - Math.abs(dy);
    for (let dx = -span; dx <= span; dx++) {
      const c = { x: x + dx, y: y + dy };
      if (c.x >= 0 && c.y >= 0 && c.x < view.board.width && c.y < view.board.height && api.canCast(w.key, c).ok) out.push(c);
    }
  }
  return out;
};

function decide(view, api, rnd) {
  let t = performance.now();
  enc.encodeSample({ view, board: view.board }, null, obs);
  T.encode += performance.now() - t;

  t = performance.now();
  const logits = model.forward(obs);
  T.forward += performance.now() - t;

  t = performance.now();
  mask.fill(0);
  mask[0] = 1;
  let legal = 1;
  for (const c of api.reachable()) { mask[1 + enc.cellIdx(c.pos)] = 1; legal++; }
  T.maskMove += performance.now() - t;

  t = performance.now();
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
  T.maskCast += performance.now() - t;

  t = performance.now();
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
  T.sample += performance.now() - t;
  nDec++;
  legalSum += legal;
  return enc.labelToAction(idx, view);
}

const rng = createRng(hashSeed('bench:jobs'));
const wall0 = performance.now();
for (let m = 0; m < nMatches; m++) {
  const classA = CLASS_IDS[rng.int(0, CLASS_IDS.length - 1)];
  const classB = CLASS_IDS[rng.int(0, CLASS_IDS.length - 1)];
  const seed = hashSeed(`bench:m${m}`);
  let { state } = createGame({
    mapId: TUNE_MAPS[m % TUNE_MAPS.length], seed,
    fighters: [{ id: 'A', name: 'A', classId: classA }, { id: 'B', name: 'B', classId: classB }],
  });
  const apiRngs = {};
  const smpRngs = { A: createRng(hashSeed(`${seed}:smpA`)), B: createRng(hashSeed(`${seed}:smpB`)) };
  let guard = 0;
  let steps = 0;
  let turnKey = '';
  while (!state.over && guard++ < 6000) {
    const actor = currentFighter(state);
    const nextKey = `${state.turn}:${actor.id}`;
    if (turnKey !== nextKey) { turnKey = nextKey; steps = 0; }
    let action = { type: 'PASS' };
    if (steps < 25) {
      try {
        const view = getView(state, actor.id);
        const api = makeBotApi(view, apiRngs[actor.id] ||= createRng(hashSeed(`${seed}:${actor.id}`)));
        action = actor.isSummon ? utilityDecide(view, api) : decide(view, api, smpRngs[actor.team]);
        if (!action || !action.type) action = { type: 'PASS' };
      } catch { action = { type: 'PASS' }; }
    }
    const t = performance.now();
    const result = applyAction(state, action);
    T.engine += performance.now() - t;
    state = result.state;
    if (result.ok) steps++;
  }
}
const wall = performance.now() - wall0;
const perPhase = Object.fromEntries(Object.entries(T).map(([k, v]) => [k, +(v / nDec).toFixed(2)]));
const totalDec = Object.values(T).reduce((s, v) => s + v, 0) / nDec;
console.log(JSON.stringify({
  weights: weightsDir, matches: nMatches, decisions: nDec,
  avgLegal: +(legalSum / nDec).toFixed(1),
  msPerDecision: perPhase,
  totalMsPerDecision: +totalDec.toFixed(2),
  sharePct: Object.fromEntries(Object.entries(T).map(([k, v]) => [k, +((100 * v) / nDec / totalDec).toFixed(1)])),
  wallSec: +(wall / 1000).toFixed(1),
}, null, 1));
