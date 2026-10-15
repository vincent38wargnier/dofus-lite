// Duel CALCULATEUR contre CALCULATEUR — le nouveau mètre étalon (au-delà de
// maison). Chaque camp = recherche A1 (juge main); un SPEC décrit ce qui change:
//   maison | a1           champion A1 tel quel (budget SB_BUDGET)
//   DIR                   (ancien) rollouts simulés par le clone DIR = A2
//   clé=val[+clé=val…]    roll=DIR (rollouts clone, A2) · nom=DIR (candidat-
//                         politique: le tour du clone nommé finaliste, A3) ·
//                         b=N (budget de CE camp, sinon SB_BUDGET) · fc=1 (cibles
//                         focalisées du profil en jeu) · rv=1 (planifie sur l'état
//                         RECONSTRUIT de la vue, comme le jeu: mêmes dés simulés) ·
//                         k=N (échantillons de dés par finaliste, défaut 3) ·
//                         f=N (taille de la finale, défaut 6) · h=N (horizon de
//                         quiescence en tours simulés, défaut 3) · rs=DIR (riposte
//                         robuste: pire de {maison, clone DIR} pour LEUR tour) ·
//                         net=DIR (juge d'APRÈS-ÉTATS appris, model.onnx, loop 1) +
//                         nm=prelim|full (N0b: V classe les nominés, finale en
//                         ripostes réelles | N0a: V seul, aucune riposte)
//   ingame                le VRAI Stratège du jeu: src/bots/searchBrain.js avec
//                         WORKER_PROFILE (budget 600 + fastCasts), sur l'état
//                         reconstruit de la vue, comme dans le Web Worker
// Graines appariées: chaque graine jouée 2× sièges inversés.
//   node scripts/rl/calc_duel.cjs N LK SPEC_A SPEC_B [out.jsonl]
//   ex: SB_BUDGET=600 node scripts/rl/calc_duel.cjs 16 l100 nom=DIR_CLONE maison out.jsonl
require('../ai_runtime.cjs');
const fs = require('node:fs');
const { createGame, applyAction, currentFighter } = require('../../src/engine/engine');
const { hashSeed } = require('../../src/engine/rng');
const sb = require('./search_bot.cjs');

const [, , nArg, lkArg, specA, specB, outPath] = process.argv;
const N = Number(nArg) || 16;
const LK = lkArg || 'l100';
const CLS = 'CRA';
const OFFSET = Number(process.env.SB_SEED_OFFSET || 0);
const MAP = process.env.SB_MAP || 'arene';
const BASE_BUDGET = Number(process.env.SB_BUDGET || 8000);
if (!specA || !specB) { console.error('usage: N LK SPEC_A SPEC_B [out.jsonl]  (spec = maison | DIR | roll=DIR+nom=DIR+b=N)'); process.exit(1); }
process.env.CLONE_ORT = process.env.CLONE_ORT ?? '1';      // forward ONNX (~1 ms) si model.onnx
process.env.CLONE_NO_OSC = process.env.CLONE_NO_OSC ?? '1';
const { makePolicyBot } = require('./policy_net.cjs');
const { getView } = require('../../src/engine/engine');
const { makeBotApi, stateFromView } = require('../../src/bots/api');
const { makeSearchBrain } = require('../../src/bots/searchBrain');
// = WORKER_PROFILE de src/bots/api.js (non exporté): garde-fou si le jeu change.
const INGAME_PROFILE = { budget: 600, fastCasts: true };
if (!fs.readFileSync(require.resolve('../../src/bots/api.js'), 'utf8').includes('const WORKER_PROFILE = { budget: 600, fastCasts: true };')) {
  console.error('WORKER_PROFILE a changé dans src/bots/api.js — mettre INGAME_PROFILE à jour'); process.exit(1);
}
let ingameBrain = null;

function parseSpec(spec) {
  const o = { roll: null, nom: null, b: null, fc: null, rv: null, k: null, f: null, h: null, rs: null, net: null, nm: null, ingame: false };
  if (spec === 'maison' || spec === 'a1') return o;
  if (spec === 'ingame') { o.ingame = true; return o; }
  if (!spec.includes('=')) { o.roll = spec; return o; }
  for (const kv of spec.split('+')) {
    const [k, v] = kv.split('=');
    if (!(k in o) || k === 'ingame' || !v) { console.error(`spec invalide: ${spec} (clé ${k})`); process.exit(1); }
    o[k] = v;
  }
  return o;
}
// Instances PAR CAMP (mémoire anti-oscillation séparée).
const netModels = {};
const mkSide = (spec) => {
  const o = parseSpec(spec);
  if (o.ingame) ingameBrain ||= makeSearchBrain({ makeBotApi });
  if (o.nm && !['prelim', 'full'].includes(o.nm)) { console.error(`nm=${o.nm}: prelim|full`); process.exit(1); }
  const net = o.net ? { model: (netModels[o.net] ||= require('./value_net.cjs').loadValueOrt(o.net)), mode: o.nm || 'prelim' } : null;
  return { roll: o.roll ? makePolicyBot(o.roll) : null, nom: o.nom ? makePolicyBot(o.nom) : null,
    b: o.b == null ? null : Number(o.b), fc: o.fc === '1', rv: o.rv === '1',
    k: o.k == null ? null : Number(o.k), f: o.f == null ? null : Number(o.f),
    h: o.h == null ? null : Number(o.h), rs: o.rs ? [null, makePolicyBot(o.rs)] : null, net, ingame: o.ingame };
};
const cfg = { A: mkSide(specA), B: mkSide(specB) };

let W = 0; let L = 0; let D = 0;
const ms = { A: 0, B: 0 }; const dec = { A: 0, B: 0 };
const nom = { A: 0, B: 0 }; const chg = { A: 0, B: 0 };
for (let i = 0; i < N; i++) {
  const seatA = i % 2 === 0 ? 'A' : 'B'; // combattant piloté par SPEC_A
  const seed = hashSeed(`cd:${LK}:${CLS}:${(i >> 1) + OFFSET}`);
  let { state } = createGame({ mapId: MAP, seed, fighters: sb.makeFighters(LK, CLS, CLS) });
  const counters = { A: { applies: 0, ms: 0, decisions: 0, endsSum: 0, invalid: 0 },
    B: { applies: 0, ms: 0, decisions: 0, endsSum: 0, invalid: 0 } }; // par CAMP de spec
  let guard = 0;
  const gms = { A: 0, B: 0 }; // temps de réflexion de CETTE partie, par camp de spec
  while (!state.over && guard++ < 800) {
    const actor = currentFighter(state);
    const side = actor.id === seatA ? 'A' : 'B';
    const P = cfg[side];
    const t0 = Date.now();
    let action;
    if (P.ingame) {
      action = ingameBrain.searchDecide(stateFromView(getView(state, actor.id)), INGAME_PROFILE) || { type: 'PASS' };
      counters[side].decisions++;
    } else {
      sb.setRolloutPolicy(P.roll); sb.setNominatorPolicy(P.nom); sb.setBudget(P.b); sb.setFastCasts(P.fc);
      sb.setSampling({ samples: P.k, finalists: P.f }); sb.setHorizon(P.h); sb.setReplySet(P.rs); sb.setNetJudge(P.net);
      action = sb.searchDecide(P.rv ? stateFromView(getView(state, actor.id)) : state, counters[side]) || { type: 'PASS' };
      sb.setRolloutPolicy(null); sb.setNominatorPolicy(null); sb.setBudget(null); sb.setFastCasts(false);
      sb.setSampling(); sb.setHorizon(null); sb.setReplySet(null); sb.setNetJudge(null);
    }
    ms[side] += Date.now() - t0; dec[side]++; gms[side] += Date.now() - t0;
    const r = applyAction(state, action);
    state = r.ok ? r.state : applyAction(state, { type: 'PASS' }).state;
  }
  const result = !state.over || state.winner == null ? 'D' : state.winner === seatA ? 'W' : 'L';
  if (result === 'W') W++; else if (result === 'L') L++; else D++;
  for (const s of ['A', 'B']) { nom[s] += counters[s].polNom || 0; chg[s] += counters[s].polChanged || 0; }
  if (outPath) fs.appendFileSync(outPath, JSON.stringify({ i, seatA, seed, lk: LK, result, turns: state.turn,
    specA, specB, budget: BASE_BUDGET, budgetA: cfg.A.ingame ? INGAME_PROFILE.budget : cfg.A.b ?? BASE_BUDGET,
    budgetB: cfg.B.ingame ? INGAME_PROFILE.budget : cfg.B.b ?? BASE_BUDGET,
    decA: counters.A.decisions, decB: counters.B.decisions, msA: gms.A, msB: gms.B,
    nomA: counters.A.polNom || 0, chgA: counters.A.polChanged || 0,
    nomB: counters.B.polNom || 0, chgB: counters.B.polChanged || 0,
    offset: OFFSET, version: sb.SEARCH_VERSION }) + '\n');
  console.log(`${i + 1}/${N} ${result} W${W} L${L} D${D}`);
}
console.log(JSON.stringify({ mode: 'calc-duel', lk: LK, n: N, W, L, D, winRateA: +(W / N).toFixed(3),
  msPerDecA: +(ms.A / Math.max(1, dec.A)).toFixed(0), msPerDecB: +(ms.B / Math.max(1, dec.B)).toFixed(0),
  nomA: nom.A, chgA: chg.A, nomB: nom.B, chgB: chg.B,
  specA, specB, budget: BASE_BUDGET, offset: OFFSET }));
