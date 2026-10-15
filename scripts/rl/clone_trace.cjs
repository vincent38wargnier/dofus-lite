// Trace UNE partie clone-vs-maison décision par décision (diagnostic): mêmes
// graines que policy_eval.cjs (mi:LK:CLS:(i>>1)+OFFSET, cloneId alterné).
//   node scripts/rl/clone_trace.cjs MODEL_DIR LK GAME_INDEX [OFFSET]
require('../ai_runtime.cjs');
const { createGame, applyAction, getView, currentFighter } = require('../../src/engine/engine');
const { createRng, hashSeed } = require('../../src/engine/rng');
const { makeBotApi } = require('../../src/bots/api');
const sb = require('./search_bot.cjs');
const { makePolicyBot } = require('./policy_net.cjs');

const [, , modelDir, lkArg, idxArg, offArg] = process.argv;
const LK = lkArg || 'l100';
const I = Number(idxArg || 0);
const OFFSET = Number(offArg || 0);
const CLS = 'CRA';
const clone = makePolicyBot(modelDir);
const seed = hashSeed(`mi:${LK}:${CLS}:${(I >> 1) + OFFSET}`);
const cloneId = I % 2 === 0 ? 'A' : 'B';
let { state } = createGame({ mapId: 'arene', seed, fighters: sb.makeFighters(LK, CLS, CLS) });
const rngs = {};
const dist = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const fmt = (a) => a.type === 'PASS' ? 'PASS' : a.type === 'MOVE' ? `MOVE→(${a.to.x},${a.to.y})`
  : `CAST ${a.spell}@(${a.target.x},${a.target.y})`;
let guard = 0;
while (!state.over && guard++ < 2000) {
  const actor = currentFighter(state);
  const view = getView(state, actor.id);
  const api = makeBotApi(view, rngs[actor.id] ||= createRng(hashSeed(`m:${seed}:${actor.id}`)));
  const isClone = actor.id === cloneId;
  let action;
  if (isClone) { try { action = clone(view, api) || { type: 'PASS' }; } catch { action = { type: 'PASS' }; } }
  else { try { action = api.maison() || { type: 'PASS' }; } catch { action = { type: 'PASS' }; } }
  const me = view.you; const foe = view.enemies[0];
  const line = `t${state.turn} ${isClone ? 'CLONE' : 'maison'} pa${me.pa} pm${me.pm} hp${me.hp}/${foe ? foe.hp : '?'} d${foe ? dist(me.pos, foe.pos) : '?'} ${fmt(action)}`;
  const r = applyAction(state, action);
  console.log(line + (r.ok ? '' : '  [INVALIDE→PASS]'));
  state = r.ok ? r.state : applyAction(state, { type: 'PASS' }).state;
}
console.log(`fin: ${state.over ? (state.winner === cloneId ? 'CLONE GAGNE' : 'CLONE PERD') : 'non terminé'} au tour ${state.turn} (clone=${cloneId}, seed=${seed})`);
