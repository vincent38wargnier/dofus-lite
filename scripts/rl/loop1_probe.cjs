// Loop 1 — sondes AVANT génération (aucune donnée écrite):
//   identity LK SEED0 N  : parties C1 vs C1 jouées par (a) l'ancien search_bot
//                          (copie figée), (b) le nouveau sans hook, (c) le nouveau
//                          AVEC l'enregistreur → les 3 suites d'actions doivent
//                          être IDENTIQUES (l'enregistreur ne change aucun choix).
//   cost LK SEED0 N      : coût par décision (ms), nombre d'après-états gratuits,
//                          coût d'encodage, coût d'une riposte+juge (profil C1).
// C1 = { budget: 1200, fastCasts, horizon: 1 } sur l'état reconstruit de la vue
// (rv=1), exactement la spec `fc=1+rv=1+b=1200+h=1` de calc_duel.
require('../ai_runtime.cjs');
const path = require('node:path');
const { createGame, applyAction, getView, currentFighter } = require('../../src/engine/engine');
const { hashSeed } = require('../../src/engine/rng');
const { stateFromView } = require('../../src/bots/api');
const enc = require('./encoder.cjs');

const [, , mode, lkArg, seedArg, nArg, beforePath] = process.argv;
const LK = lkArg || 'l100';
const SEED0 = Number(seedArg || 0);
const N = Number(nArg || 1);

function withC1(sb, fn) {
  sb.setBudget(1200); sb.setFastCasts(true); sb.setSampling({}); sb.setHorizon(1);
  sb.setRolloutPolicy(null); sb.setNominatorPolicy(null); sb.setReplySet(null);
  try { return fn(); } finally {
    sb.setBudget(null); sb.setFastCasts(false); sb.setSampling(); sb.setHorizon(null);
  }
}

function playSelf(sb, seed, hook) {
  let { state } = createGame({ mapId: 'arene', seed, fighters: sb.makeFighters(LK, 'CRA', 'CRA') });
  const counters = { A: { applies: 0, ms: 0, decisions: 0, endsSum: 0, invalid: 0 },
    B: { applies: 0, ms: 0, decisions: 0, endsSum: 0, invalid: 0 } };
  const acts = [];
  let guard = 0;
  while (!state.over && guard++ < 800) {
    const actor = currentFighter(state);
    if (hook) { sb.setAfterstateHook(hook); hook.beginDecision(actor.id); }
    const action = withC1(sb, () => sb.searchDecide(stateFromView(getView(state, actor.id)), counters[actor.id])) || { type: 'PASS' };
    if (hook) sb.setAfterstateHook(null);
    acts.push(JSON.stringify(action));
    const r = applyAction(state, action);
    state = r.ok ? r.state : applyAction(state, { type: 'PASS' }).state;
  }
  return { acts, winner: state.winner, turns: state.turn, counters };
}

function makeRecorder(sb, opts = {}) {
  const buf = new Float32Array(enc.OBS_DIM_V3);
  const rec = { samples: 0, terminal: 0, encMs: 0, perDecision: [], cur: 0, d2ms: 0, d2n: 0 };
  return {
    rec,
    beginDecision() { if (rec.cur) rec.perDecision.push(rec.cur); rec.cur = 0; },
    onSample({ after, v, meId, myTeam }) {
      rec.samples++; rec.cur++;
      if (after.over) { rec.terminal++; return; }
      const t0 = performance.now();
      const opp = currentFighter(after).id;
      const view = getView(after, opp);
      enc.encodeSampleV3({ view, board: view.board }, null, buf);
      rec.encMs += performance.now() - t0;
      if (opts.timeRollout && rec.samples % 7 === 0) {
        // coût d'UNE riposte+juge sur cet après-état (profil courant = C1, h=1)
        const t1 = performance.now();
        const v2 = sb.depth2Score(after, meId, myTeam, { applies: 0 }, null);
        rec.d2ms += performance.now() - t1; rec.d2n++;
        if (v2 !== v) rec.mismatch = (rec.mismatch || 0) + 1; // déterminisme: même score attendu
      }
    },
  };
}

if (mode === 'identity') {
  const sbNew = require('./search_bot.cjs');
  const sbOld = require(path.resolve(beforePath));
  let allSame = true;
  for (let g = 0; g < N; g++) {
    const seed = hashSeed(`loop1-id:${LK}:${SEED0 + g}`);
    const a = playSelf(sbOld, seed, null);
    const b = playSelf(sbNew, seed, null);
    const hook = makeRecorder(sbNew);
    const c = playSelf(sbNew, seed, hook);
    const same = (x, y) => x.acts.length === y.acts.length && x.acts.every((s, i) => s === y.acts[i]);
    const ok = same(a, b) && same(a, c) && a.winner === b.winner && a.winner === c.winner;
    allSame &&= ok;
    console.log(JSON.stringify({ g, LK, actions: a.acts.length, winner: a.winner, turns: a.turns,
      oldVsNew: same(a, b), oldVsHooked: same(a, c), recordedSamples: hook.rec.samples }));
  }
  console.log(JSON.stringify({ identity: allSame ? 'PASS' : 'FAIL', LK, games: N }));
  process.exit(allSame ? 0 : 1);
} else if (mode === 'cost') {
  const sb = require('./search_bot.cjs');
  for (let g = 0; g < N; g++) {
    const seed = hashSeed(`loop1-cost:${LK}:${SEED0 + g}`);
    const hook = makeRecorder(sb, { timeRollout: true });
    const t0 = Date.now();
    const r = playSelf(sb, seed, hook);
    hook.beginDecision();
    const dec = r.counters.A.decisions + r.counters.B.decisions;
    const ms = r.counters.A.ms + r.counters.B.ms;
    const pd = hook.rec.perDecision;
    console.log(JSON.stringify({ g, LK, decisions: dec, msPerDecision: +(ms / dec).toFixed(0),
      samplesPerDecision: +(hook.rec.samples / dec).toFixed(1),
      minMaxSamples: [Math.min(...pd), Math.max(...pd)], terminalShare: +(hook.rec.terminal / hook.rec.samples).toFixed(3),
      encodeMsPerSample: +(hook.rec.encMs / Math.max(1, hook.rec.samples - hook.rec.terminal)).toFixed(2),
      riposteMs: +(hook.rec.d2ms / Math.max(1, hook.rec.d2n)).toFixed(1), riposteTimed: hook.rec.d2n,
      scoreMismatch: hook.rec.mismatch || 0, winner: r.winner, turns: r.turns, wallSec: Math.round((Date.now() - t0) / 1000) }));
  }
} else {
  console.log('usage: identity LK SEED0 N BEFORE_PATH | cost LK SEED0 N');
}
