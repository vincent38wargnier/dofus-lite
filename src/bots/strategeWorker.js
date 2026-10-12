/* eslint-env worker */
// Worker du Stratège: la recherche PLEINE FORCE tourne ici, HORS du thread
// principal — l'interface ne gèle jamais, quel que soit le temps de
// réflexion. Reçoit { key, view, profile }, répond { key, action, judge }.
// La vue est un objet simple (structured-clone), l'état est reconstruit ici
// même (stateFromView) — le worker ne voit jamais l'état réel du moteur.
//
// Deux juges: 'hand' (heuristique, défaut) et 'v4' (réseau de valeur entraîné,
// profile.judge === 'v4'). Les poids (2.6 Mo) sont fetchés UNE fois au premier
// besoin depuis /models/stratege-v4/. Échec de chargement → repli LOYAL sur le
// juge main, signalé dans la réponse (error) — jamais un PASS silencieux.
import { stateFromView, makeBotApi } from './api';
import { makeSearchBrain } from './searchBrain';
import { getView } from '../engine/engine';
import { buildValueModel, makeStateEvaluator } from './valueNet';

const brainHand = makeSearchBrain({ makeBotApi });
let netLoad = null; // Promise<{ brain } | { error }>
function loadNetBrain() {
  return netLoad ||= (async () => {
    try {
      const [shapes, weights] = await Promise.all([
        fetch('/models/stratege-v4/shapes.json').then((r) => { if (!r.ok) throw new Error(`shapes.json HTTP ${r.status}`); return r.json(); }),
        fetch('/models/stratege-v4/weights.bin').then((r) => { if (!r.ok) throw new Error(`weights.bin HTTP ${r.status}`); return r.arrayBuffer(); }),
      ]);
      const netV = makeStateEvaluator(buildValueModel(shapes, new Uint8Array(weights)), getView);
      return { brain: makeSearchBrain({ makeBotApi, netV }) };
    } catch (err) {
      return { error: String(err && err.message ? err.message : err) };
    }
  })();
}

// eslint-disable-next-line no-restricted-globals
self.onmessage = async (e) => {
  const { key, view, profile } = e.data || {};
  let action = { type: 'PASS' };
  let judge = 'hand';
  let error = null;
  try {
    let brain = brainHand;
    if (profile && profile.judge === 'v4') {
      const net = await loadNetBrain();
      if (net.brain) { brain = net.brain; judge = 'v4'; } else { error = net.error; }
    }
    action = brain.searchDecide(stateFromView(view), profile) || { type: 'PASS' };
  } catch (err) {
    // PASS propre: le référent du match gère, l'app ne crashe jamais.
    error = String(err && err.message ? err.message : err);
  }
  // eslint-disable-next-line no-restricted-globals
  self.postMessage({ key, action, judge, error });
};
