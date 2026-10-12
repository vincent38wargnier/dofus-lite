// Parité numérique bot_net.cjs (JS pur) vs bot_net_ort.cjs (ONNX Runtime)
// sur des observations RÉELLES. PASS = max |Δlogit| ≤ 1e-3 ET argmax
// identique ≥ 99.5%.
//
//   node scripts/rl/parity_ort.cjs <weightsDir> [obsFile.f32] [n=256]
//
// weightsDir: dossier weights.bin + shapes.json + model.onnx (converti via
//             python3 scripts/rl/export_onnx.py <weightsDir>).
// obsFile:    shard d'observations (lignes de obsDim float32), p.ex. une COPIE
//             d'un obs_w*.f32 de rollout. Sans fichier: observations générées
//             en jouant des matchs moteur (utilityBrain des deux côtés).
const fs = require('node:fs');
const enc = require('./encoder.cjs');
const jsNet = require('./bot_net.cjs');
const ortNet = require('./bot_net_ort.cjs');

const weightsDir = process.argv[2];
const obsFile = process.argv[3];
const nWanted = Number(process.argv[4] || 256);
if (!weightsDir) {
  console.error('usage: node scripts/rl/parity_ort.cjs <weightsDir> [obsFile.f32] [n=256]');
  process.exit(2);
}

const mj = jsNet.loadModel(weightsDir);
const mo = ortNet.loadModel(weightsDir);
const obsDim = mj.shapes.obsDim;

function obsFromFile(file, n) {
  const raw = fs.readFileSync(file);
  const rowBytes = obsDim * 4;
  const rows = Math.floor(raw.byteLength / rowBytes);
  if (rows < 1) throw new Error(`${file}: ${raw.byteLength} octets < 1 ligne de ${rowBytes}`);
  if (raw.byteLength % rowBytes !== 0) {
    console.error(`note: ${file} non aligné (${raw.byteLength % rowBytes} octets orphelins), on garde ${rows} lignes entières`);
  }
  const take = Math.min(n, rows);
  const step = rows / take;
  const out = [];
  for (let k = 0; k < take; k++) {
    const r = Math.floor(k * step);
    out.push(new Float32Array(raw.buffer, raw.byteOffset + r * rowBytes, obsDim).slice());
  }
  return out;
}

function obsFromEngine(n) {
  require('../ai_runtime.cjs');
  const { createGame, applyAction, getView, currentFighter } = require('../../src/engine/engine');
  const { createRng, hashSeed } = require('../../src/engine/rng');
  const { makeBotApi } = require('../../src/bots/api');
  const { utilityDecide } = require('../../src/bots/utilityBrain');
  const { CLASS_IDS } = require('../../src/engine/classes');
  const maps = ['arene', 'muraille', 'canyon', 'amakna_1571', 'territoire_des_dopeuls_5383'];
  const rng = createRng(hashSeed('parity:obs'));
  const out = [];
  for (let m = 0; out.length < n && m < 200; m++) {
    const seed = hashSeed(`parity:m${m}`);
    let { state } = createGame({
      mapId: maps[m % maps.length], seed,
      fighters: [
        { id: 'A', name: 'A', classId: CLASS_IDS[rng.int(0, CLASS_IDS.length - 1)] },
        { id: 'B', name: 'B', classId: CLASS_IDS[rng.int(0, CLASS_IDS.length - 1)] },
      ],
    });
    const apiRngs = {};
    let guard = 0;
    while (!state.over && guard++ < 600 && out.length < n) {
      const actor = currentFighter(state);
      let action = { type: 'PASS' };
      try {
        const view = getView(state, actor.id);
        const api = makeBotApi(view, apiRngs[actor.id] ||= createRng(hashSeed(`${seed}:${actor.id}`)));
        const obs = new Float32Array(obsDim);
        enc.encodeSample({ view, board: view.board }, null, obs);
        out.push(obs);
        action = utilityDecide(view, api) || { type: 'PASS' };
        if (!action.type) action = { type: 'PASS' };
      } catch { action = { type: 'PASS' }; }
      state = applyAction(state, action).state;
    }
  }
  return out;
}

const samples = obsFile ? obsFromFile(obsFile, nWanted) : obsFromEngine(nWanted);

let maxDiff = 0;
let maxDiffIdx = -1;
let maxDiffRow = -1;
let agree = 0;
let sumAbs = 0;
let count = 0;
for (let r = 0; r < samples.length; r++) {
  const a = mj.forward(samples[r]); // buffer interne réutilisé → consommer avant l'appel suivant
  const b = mo.forward(samples[r]);
  let ai = 0;
  let bi = 0;
  for (let i = 0; i < a.length; i++) {
    const d = Math.abs(a[i] - b[i]);
    sumAbs += d;
    count++;
    if (d > maxDiff) { maxDiff = d; maxDiffIdx = i; maxDiffRow = r; }
    if (a[i] > a[ai]) ai = i;
    if (b[i] > b[bi]) bi = i;
  }
  if (ai === bi) agree++;
}

const agreePct = (100 * agree) / samples.length;
const pass = maxDiff <= 1e-3 && agreePct >= 99.5;
console.log(JSON.stringify({
  weights: weightsDir,
  obsSource: obsFile || 'engine-generated',
  samples: samples.length,
  maxAbsLogitDiff: maxDiff,
  maxDiffAt: { row: maxDiffRow, logit: maxDiffIdx },
  meanAbsLogitDiff: sumAbs / count,
  argmaxAgreementPct: +agreePct.toFixed(3),
  criteria: { maxDiffLte: 1e-3, agreementGtePct: 99.5 },
  result: pass ? 'PASS' : 'FAIL',
}, null, 1));
process.exit(pass ? 0 : 1);
