// Sonde du MODÈLE DE RIPOSTE (diagnostic A2): sur des tours RÉELS du champion
// (A1 contre A1, budget SB_BUDGET), compare ce que l'acteur fait vraiment de son
// tour à ce que feraient maison et le clone depuis le MÊME état (mêmes dés).
// Question: lequel prédit le mieux la menace réelle d'un calculateur ?
//   node scripts/rl/reply_probe.cjs N LK CLONE_DIR out.jsonl
require('../ai_runtime.cjs');
const fs = require('node:fs');
const { createGame, applyAction, getView, currentFighter } = require('../../src/engine/engine');
const { createRng, hashSeed } = require('../../src/engine/rng');
const { makeBotApi } = require('../../src/bots/api');
const sb = require('./search_bot.cjs');

process.env.CLONE_ORT = process.env.CLONE_ORT ?? '1';
process.env.CLONE_NO_OSC = process.env.CLONE_NO_OSC ?? '1';
const { makePolicyBot } = require('./policy_net.cjs');

const [, , nArg, lkArg, dir, outPath] = process.argv;
const N = Number(nArg) || 4;
const LK = lkArg || 'l100';
const OFFSET = Number(process.env.SB_SEED_OFFSET || 0);
if (!dir || !outPath) { console.error('usage: N LK CLONE_DIR out.jsonl'); process.exit(1); }
const clone = makePolicyBot(dir);

// Joue le tour ENTIER de l'acteur courant avec `decide`; état de fin de tour.
function playTurn(s0, decide) {
  let s = s0; const team = currentFighter(s).team; let g = 20; let acts = 0;
  if (decide.reset) decide.reset();
  while (!s.over && currentFighter(s).team === team && g-- > 0) {
    const f = currentFighter(s);
    const view = getView(s, f.id);
    const api = makeBotApi(view, createRng(hashSeed(`rp:${sb.stateKeyOf(s)}`)));
    let a;
    try { a = decide(view, api, s) || { type: 'PASS' }; } catch { a = { type: 'PASS' }; }
    const r = applyAction(s, a);
    if (!r.ok) { s = applyAction(s, { type: 'PASS' }).state; break; }
    s = r.state;
    if (a.type === 'PASS') break;
    acts++;
  }
  if (!s.over && currentFighter(s).team === team) s = applyAction(s, { type: 'PASS' }).state;
  return { s, acts };
}
const counters = { applies: 0, ms: 0, decisions: 0, endsSum: 0, invalid: 0 };
const policies = {
  a1: (view, api, s) => sb.searchDecide(s, counters),
  maison: (view, api) => api.maison(),
  clone: (view, api) => clone(view, api),
};
policies.clone.reset = clone.reset;

const metrics = (s0, s1, actorId) => {
  const foe = Object.values(s0.fighters).find((f) => f.id !== actorId);
  const me0 = s0.fighters[actorId]; const me1 = s1.fighters[actorId]; const foe1 = s1.fighters[foe.id];
  return { dealt: Math.max(0, foe.hp) - Math.max(0, foe1.hp), taken: Math.max(0, me0.hp) - Math.max(0, me1.hp),
    dist: Math.abs(me1.pos.x - foe1.pos.x) + Math.abs(me1.pos.y - foe1.pos.y), kill: foe1.hp <= 0 ? 1 : 0 };
};

for (let i = 0; i < N; i++) {
  const seed = hashSeed(`rp:${LK}:CRA:${i + OFFSET}`);
  let { state } = createGame({ mapId: sb.MAP, seed, fighters: sb.makeFighters(LK, 'CRA', 'CRA') });
  let turns = 0;
  while (!state.over && turns++ < 60) {
    const actorId = currentFighter(state).id;
    const row = { game: i, seed, lk: LK, turn: state.turn, actor: actorId,
      foeHp0: Math.max(0, Object.values(state.fighters).find((f) => f.id !== actorId).hp) };
    for (const k of ['maison', 'clone']) { const t = playTurn(state, policies[k]); row[k] = { ...metrics(state, t.s, actorId), acts: t.acts }; }
    const real = playTurn(state, policies.a1); // le vrai tour du champion (= la partie)
    row.a1 = { ...metrics(state, real.s, actorId), acts: real.acts };
    fs.appendFileSync(outPath, JSON.stringify(row) + '\n');
    state = real.s;
  }
  console.log(`game ${i + 1}/${N} done (${turns} turns, winner ${state.winner})`);
}
