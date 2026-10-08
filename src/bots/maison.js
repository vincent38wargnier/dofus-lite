// IA Maison — le champion de référence du Koliséum.
//
// Même cerveau utilitaire que api.suggest(), mais avec un jeu de poids par
// MATCHUP: pour chaque classe jouée, un profil de base + un ajustement par
// classe adverse (un Iop ne joue pas un Cra comme il joue un Sacrieur).
// Les poids sont réglés par CEM en auto-jeu massif (voir src/tuning/) et
// vivent dans maisonWeights.json — régénérés, jamais édités à la main.
//
// Battre l'IA Maison avec votre propre bot, c'est ça le défi du Koliséum.

import MAISON from './maisonWeights.json';
import { utilityDecide } from './utilityBrain';

// Poids effectifs pour (ma classe, classe adverse). Repli propre:
// matchup inconnu → profil de base de la classe → défauts du cerveau.
export function maisonWeightsFor(myClass, oppClass) {
  const mine = MAISON[myClass] || {};
  return { ...(mine.base || {}), ...((mine.vs || {})[oppClass] || {}) };
}

export function maisonDecide(view, api) {
  const oppClass = view.enemy ? view.enemy.classId : null;
  return utilityDecide(view, api, maisonWeightsFor(view.you.classId, oppClass));
}

export default maisonDecide;
