// IA Maison 2 — le même cerveau utilitaire que l'IA Maison (mêmes poids CEM
// par matchup), plus les leviers MÉCANIQUES que le CEM ne pouvait pas
// exprimer: des cas de scoreRows ajoutés dans utilityBrain, gardés par des
// poids à défaut inerte (maison reste bit-identique sans eux).
//
// Chaque levier vient d'une faille mesurée ou de docs/class-strategies.md:
//  - spellBoostValue : maison scorait les sorts « boost de sort » à ZÉRO
//    (aucun cas dans le switch) — Tir Puissant du Cra n'était jamais lancé.
//  - lethalDrive     : confiance accrue dans les enchaînements qui achèvent.
//  - pmLock          : le verrou de kite (leçon du playtest: cinglante en
//    boucle = un kit courte portée ne touche plus jamais).
//  - stealth         : discipline d'invisibilité du Sram (seuls arme/dégâts
//    directs révèlent — engine.js:988).
//  - punishTiming    : châtiment quand l'ennemi VA frapper, sinon Furie.
//  - summonBoost     : booster ses invocations (cœur du jeu Osamodas).

import { maisonWeightsFor } from './maison';
import { utilityDecide } from './utilityBrain';

export const MAISON2_CORE = {
  spellBoostValue: 1.0,
  lethalDrive: 1.15,
  pmLock: 1.1,
  stealth: 0.45,
  punishTiming: 0.8,
  // summonBoost retiré: mesuré CONTRE-PRODUCTIF sur sa propre cible (Osamodas
  // 18%, Sadida 6% vs maison au banc g1) — les poids CEM gèrent déjà les
  // invocations; un +0.3 brut sur les buffs d'invoc leur fait perdre du tempo.
};

// Connaissance de classe (docs/class-strategies.md): ajustements LÉGERS
// par-dessus les poids CEM. Chacun doit survivre au banc 12×12 — un
// ajustement qui fait perdre sa classe saute à l'itération suivante.
const CLASS_TWEAKS = {
  SACRIEUR: { retreatHp: 0.22 }, // ses PV sont une ressource, pas un score
  SRAM: { stealth: 0.55 },
  XELOR: { removePa: 0.85 },     // le retrait PA est son plan de jeu entier
  CRA: { removePm: 0.6 },        // entretien du verrou cinglante
  ENUTROF: { removePm: 0.6 },
};

// SB_M2_NOTWEAKS=1 → n'applique QUE les termes mécaniques globaux, sans les
// ajustements par classe (ablation: isole l'apport des termes globaux).
export function maison2WeightsFor(myClass, oppClass) {
  return {
    ...maisonWeightsFor(myClass, oppClass),
    ...MAISON2_CORE,
    ...(process.env.SB_M2_NOTWEAKS ? {} : (CLASS_TWEAKS[myClass] || {})),
  };
}

export function maison2Decide(view, api) {
  const oppClass = view.enemy ? view.enemy.classId : null;
  return utilityDecide(view, api, maison2WeightsFor(view.you.classId, oppClass));
}

export default maison2Decide;
