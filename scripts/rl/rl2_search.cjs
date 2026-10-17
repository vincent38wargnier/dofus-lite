// RL2 (docs/selfplay-rl2.md) — opérateur de recherche GUIDÉ PAR LE RÉSEAU (esprit Gumbel
// AlphaZero / Expert Iteration, petit budget). Candidats = les k actions légales de plus
// haut logit du réseau (calculées par l'appelant sur la VRAIE vue). Chacune est jouée sur
// l'état RECONSTRUIT depuis la vue (comme C1 rv=1: pas d'info cachée), le réseau
// (argmax) finit MON tour, puis Q(a) = depth2Score de C1 à l'horizon 1 (riposte simulée
// par IA Maison, puis juge main; issue ±1000). Choix = argmax Q (égalité → logit).
// Le réseau seul joue vite; ce module sert de PROFESSEUR qui améliore ses coups.
const { applyAction, currentFighter } = require('../../src/engine/engine');
const { createRng, hashSeed } = require('../../src/engine/rng');
const { stateFromView } = require('../../src/bots/api');
const sb = require('./search_bot.cjs');
const { getView } = require('../../src/engine/engine');

const PASS = { type: 'PASS' };

// sampler = rl1_policy.makeSampler(dir) (partagé avec l'appelant: un seul modèle chargé).
function makeSearcher(sampler, { seed = 'rl2' } = {}) {
  const rng = createRng(hashSeed(seed));
  const rand = () => rng.next();
  const counters = { applies: 0, decisions: 0 };
  function finishTurn(s, me) { // même boucle que simTurn, politique = réseau en argmax
    let guard = 30;
    while (!s.over && currentFighter(s).id === me && guard-- > 0) {
      let a;
      try { a = sampler(getView(s, me), sb.freshApi(s, me), rand, 0).action || PASS; } catch { a = PASS; }
      const r = applyAction(s, a);
      counters.applies++;
      if (!r.ok) { s = applyAction(s, PASS).state; continue; }
      s = r.state;
      if (a.type === 'PASS') break;
    }
    return s;
  }
  // view = vue réelle du joueur au trait; top = [{label, action, logit}] (rl1_policy topK).
  function search(view, top) {
    const me = view.you.id;
    const myTeam = view.you.team;
    const root = stateFromView(view);
    const q = [];
    sb.setHorizon(1);
    try {
      for (const c of top) {
        const r = applyAction(root, c.action);
        if (!r.ok) { q.push(-Infinity); continue; }
        const end = c.action.type === 'PASS' ? r.state : finishTurn(r.state, me);
        q.push(sb.depth2Score(end, me, myTeam, counters));
      }
    } finally { sb.setHorizon(null); }
    let best = 0;
    for (let i = 1; i < top.length; i++) if (q[i] > q[best]) best = i; // égalité → ordre des logits
    counters.decisions++;
    return { action: top[best].action, label: top[best].label, q, best };
  }
  search.counters = counters;
  return search;
}

module.exports = { makeSearcher };
