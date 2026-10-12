// Ancre "kiteur": le cerveau utilitaire avec des poids orientés distance,
// retrait et dénis de PM. Née du playtest Claude-vs-champion (2026-10-11,
// matchs g1/g2): le champion n'a jamais appris l'anti-kite parce que le
// self-play n'en produit jamais — cette ancre injecte le style manquant
// (bande de portée stricte, retrait permanent, verrou removePm façon
// fleche_cinglante) dans le pool d'adversaires et dans l'évaluation.
require('../ai_runtime.cjs');
const { utilityDecide } = require('../../src/bots/utilityBrain');

const KITER_WEIGHTS = {
  threat: 2.2,      // fuit les cases où l'ennemi peut punir
  rangeBand: 1.3,   // colle à la distance idéale du kit
  aggression: 0.08, // n'avance presque jamais
  removePm: 1.3,    // valorise fort le retrait de PM (le verrou anti-mêlée)
  removePa: 0.9,
  losHide: 0.6,
  retreatHp: 0.6,   // prudence doublée plus tôt
};

const kiterDecide = (view, api) => utilityDecide(view, api, KITER_WEIGHTS);

module.exports = { KITER_WEIGHTS, kiterDecide };
