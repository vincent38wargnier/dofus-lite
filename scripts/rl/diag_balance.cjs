// Diagnostic d'équilibrage: le bot de RÉFÉRENCE (maison) joue une classe donnée
// contre maison sur tous les adversaires, seeds appariés (2 côtés). Si maison
// lui-même gagne ~0% avec SADIDA, le problème est l'ÉQUILIBRAGE 1v1, pas l'IA —
// aucun entraînement ne le corrige.
//   node scripts/rl/diag_balance.cjs SADIDA,PANDAWA,IOP [seedsPerPair=3]
require('../ai_runtime.cjs');
const { createGame, applyAction, getView, currentFighter } = require('../../src/engine/engine');
const { createRng, hashSeed } = require('../../src/engine/rng');
const { makeBotApi } = require('../../src/bots/api');
const { maisonDecide } = require('../../src/bots/maison');
const { utilityDecide } = require('../../src/bots/utilityBrain');
const { CLASS_IDS } = require('../../src/engine/classes');

const TUNE_MAPS = ['arene', 'muraille', 'canyon', 'amakna_1571', 'territoire_des_dopeuls_5383'];
const MAX = 25;

function play(classA, classB, seed, mapId) {
  let { state } = createGame({ mapId, seed, fighters: [
    { id: 'A', name: 'A', classId: classA }, { id: 'B', name: 'B', classId: classB }] });
  const rngs = {}; let turnKey = ''; let steps = 0; let bad = 0; let guard = 0;
  while (!state.over && guard++ < 10000) {
    const actor = currentFighter(state); const id = actor.id;
    const key = `${state.turn}:${id}`; if (turnKey !== key) { turnKey = key; steps = 0; }
    let action = { type: 'PASS' };
    try {
      const view = getView(state, id);
      const api = makeBotApi(view, rngs[id] ||= createRng(hashSeed(`${seed}:${id}`)));
      action = actor.isSummon ? utilityDecide(view, api) : maisonDecide(view, api);
      if (!action || !action.type) action = { type: 'PASS' };
    } catch { action = { type: 'PASS' }; }
    if (steps >= MAX) action = { type: 'PASS' };
    const r = applyAction(state, action); state = r.state;
    if (!r.ok) { if (++bad % 3 === 0) state = applyAction(state, { type: 'PASS' }).state; } else steps++;
  }
  return state.winner;
}

const classes = (process.argv[2] || 'SADIDA,PANDAWA,IOP').split(',');
const seedsPerPair = Number(process.argv[3] || 3);
for (const cls of classes) {
  let score = 0, n = 0;
  const per = {};
  for (const opp of CLASS_IDS) {
    let s = 0, c = 0;
    for (let k = 0; k < seedsPerPair; k++) {
      const seed = hashSeed(`diag:${cls}:${opp}:${k}`);
      const map = TUNE_MAPS[(k + c) % TUNE_MAPS.length];
      // cls en A puis en B (apparié)
      const wA = play(cls, opp, seed, map); s += wA === 'A' ? 1 : wA === null ? 0.5 : 0; c++;
      const wB = play(opp, cls, seed, map); s += wB === 'B' ? 1 : wB === null ? 0.5 : 0; c++;
    }
    per[opp] = +(100 * s / c).toFixed(0); score += s; n += c;
  }
  console.log(`${cls}: ${(100 * score / n).toFixed(1)}% (maison-vs-maison, ${n} matchs) | ` +
    Object.entries(per).map(([k, v]) => `${k.slice(0, 3)} ${v}`).join(' '));
}
