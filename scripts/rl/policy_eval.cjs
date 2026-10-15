// Banc de FORCE du clone (politique) vs maison, miroir CRA, graines APPARIÉES
// identiques à search_bot.mirror (mi:LK:CLS:i, searchId alterné A/B, offset via
// SB_SEED_OFFSET) → comparable aux références prof (l200gear main 30-2, V5 29-3).
//   node scripts/rl/policy_eval.cjs N cls lk MODEL_DIR [out.jsonl]
require('../ai_runtime.cjs');
const fs = require('node:fs');
const { createGame, applyAction, getView, currentFighter } = require('../../src/engine/engine');
const { createRng, hashSeed } = require('../../src/engine/rng');
const { makeBotApi } = require('../../src/bots/api');
const sb = require('./search_bot.cjs');
const { makePolicyBot } = require('./policy_net.cjs');

const [, , nArg, clsArg, lkArg, modelDir, outPath] = process.argv;
const N = Number(nArg) || 32;
const CLS = clsArg || 'CRA';
const LK = lkArg || 'l200gear';
if (!modelDir) { console.error('usage: N cls lk MODEL_DIR [out.jsonl]'); process.exit(1); }
const OFFSET = Number(process.env.SB_SEED_OFFSET || 0);
// OPP=search: l'adversaire est le CALCULATEUR (recherche A1, juge main, budget
// SB_BUDGET — 600 = profil Stratège en jeu, 4000 = profil prof) au lieu de maison.
const OPP = process.env.OPP || 'maison';
if (OPP !== 'maison' && OPP !== 'search') { console.error(`OPP inconnu: ${OPP}`); process.exit(1); }
const MAP = process.env.SB_MAP || 'arene';
const clone = makePolicyBot(modelDir);

function playMatch(seed, cloneId) {
  let { state } = createGame({ mapId: MAP, seed, fighters: sb.makeFighters(LK, CLS, CLS) });
  const rngs = {};
  let guard = 0; let inv = 0; let dec = 0; let t0 = Date.now();
  const oppCounters = { applies: 0, ms: 0, decisions: 0, endsSum: 0, invalid: 0 };
  while (!state.over && guard++ < 2000) {
    const actor = currentFighter(state);
    const view = getView(state, actor.id);
    const api = makeBotApi(view, rngs[actor.id] ||= createRng(hashSeed(`m:${seed}:${actor.id}`)));
    let action;
    if (actor.id === cloneId) {
      try { action = clone(view, api) || { type: 'PASS' }; } catch (e) { action = { type: 'PASS' }; }
      dec++;
    } else if (OPP === 'search') {
      action = sb.searchDecide(state, oppCounters) || { type: 'PASS' };
    } else {
      try { action = api.maison() || { type: 'PASS' }; } catch { action = { type: 'PASS' }; }
    }
    const r = applyAction(state, action);
    if (!r.ok) { inv++; state = applyAction(state, { type: 'PASS' }).state; continue; }
    state = r.state;
  }
  const result = !state.over || state.winner == null ? 'D' : state.winner === cloneId ? 'W' : 'L';
  return { result, turns: state.turn, inv, ms: (Date.now() - t0) / Math.max(1, dec),
    opp: OPP === 'search' ? `search:${process.env.SB_BUDGET || 8000}` : 'maison' };
}

let W = 0; let D = 0; let L = 0; let invTot = 0; let msSum = 0;
for (let i = 0; i < N; i++) {
  const cloneId = i % 2 === 0 ? 'A' : 'B';
  const seed = hashSeed(`mi:${LK}:${CLS}:${(i >> 1) + OFFSET}`);
  const r = playMatch(seed, cloneId);
  if (r.result === 'W') W++; else if (r.result === 'L') L++; else D++;
  invTot += r.inv; msSum += r.ms;
  if (outPath) fs.appendFileSync(outPath, JSON.stringify({ i, cloneId, seed, ...r }) + '\n');
  console.log(`${i + 1}/${N} ${r.result} (clone=${cloneId}) W${W} D${D} L${L} | ${r.ms.toFixed(1)}ms/déc`);
}
console.log(JSON.stringify({ mode: `clone-vs-${OPP}`, cls: CLS, lk: LK, n: N, W, D, L,
  winRate: +(W / N).toFixed(3), invalid: invTot, msPerDecision: +(msSum / N).toFixed(2),
  model: modelDir, offset: OFFSET, map: MAP }));
