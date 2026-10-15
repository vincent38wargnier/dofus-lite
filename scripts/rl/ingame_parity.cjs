// Parité DÉCISION PAR DÉCISION: le Stratège en jeu (src/bots/searchBrain.js,
// WORKER_PROFILE, état reconstruit de la vue) contre le banc search_bot.cjs
// avec setFastCasts(true) + budget 600. Parties pilotées par le jeu; à chaque
// décision on compare les deux actions (égalité JSON).
//   node scripts/rl/ingame_parity.cjs N LK
require('../ai_runtime.cjs');
const { createGame, applyAction, currentFighter, getView } = require('../../src/engine/engine');
const { hashSeed } = require('../../src/engine/rng');
const { makeBotApi, stateFromView } = require('../../src/bots/api');
const { makeSearchBrain } = require('../../src/bots/searchBrain');
const sb = require('./search_bot.cjs');

const N = Number(process.argv[2]) || 2;
const LK = process.argv[3] || 'l100';
const brain = makeSearchBrain({ makeBotApi });
// PROFILE_JSON: autre profil du jeu à vérifier (budget/fastCasts/horizon/samples/finalists).
const PROFILE = JSON.parse(process.env.PROFILE_JSON || '{"budget":600,"fastCasts":true}');
let same = 0; let diff = 0; const firstDiffs = [];
for (let i = 0; i < N; i++) {
  let { state } = createGame({ mapId: sb.MAP, seed: hashSeed(`cd:${LK}:CRA:${i}`), fighters: sb.makeFighters(LK, 'CRA', 'CRA') });
  let guard = 0;
  while (!state.over && guard++ < 800) {
    const actor = currentFighter(state);
    const game = brain.searchDecide(stateFromView(getView(state, actor.id)), PROFILE) || { type: 'PASS' };
    sb.setFastCasts(!!PROFILE.fastCasts); sb.setBudget(PROFILE.budget);
    sb.setHorizon(PROFILE.horizon ?? null); sb.setSampling({ samples: PROFILE.samples ?? null, finalists: PROFILE.finalists ?? null });
    // REBUILT=1: le banc planifie sur l'état RECONSTRUIT de la vue, comme le jeu
    // (même ordre des combattants ⇒ même clé d'état ⇒ mêmes dés simulés).
    const planState = process.env.REBUILT === '1' ? stateFromView(getView(state, actor.id)) : state;
    const bench = sb.searchDecide(planState, { applies: 0, ms: 0, decisions: 0, endsSum: 0, invalid: 0 }) || { type: 'PASS' };
    sb.setFastCasts(false); sb.setBudget(null); sb.setHorizon(null); sb.setSampling();
    if (JSON.stringify(game) === JSON.stringify(bench)) same++;
    else { diff++; if (firstDiffs.length < 5) firstDiffs.push({ game: i, turn: state.turn, actor: actor.id, ingame: game, bench }); }
    const r = applyAction(state, game);
    state = r.ok ? r.state : applyAction(state, { type: 'PASS' }).state;
  }
  console.log(`game ${i + 1}/${N}: winner ${state.winner}, turns ${state.turn}, same ${same} diff ${diff}`);
}
console.log(JSON.stringify({ mode: 'ingame-parity', profile: PROFILE, rebuilt: process.env.REBUILT === '1', lk: LK, n: N, same, diff, firstDiffs }));
