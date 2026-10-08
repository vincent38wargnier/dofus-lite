// Réglage des poids de l'IA Maison par CEM (Cross-Entropy Method).
//
// Méthode (cf. recherche utility-AI + pratique CEM):
//   - échantillonnage log-normal autour d'un vecteur moyen (poids > 0)
//   - évaluation par matchs appariés: MÊMES seeds pour tous les candidats
//     d'une génération (common random numbers), chaque seed joué des DEUX
//     côtés (A/B) et sur 3 cartes différentes → la variance vient des
//     candidats, pas du tirage
//   - refit moyenne/écart-type sur l'élite + bruit décroissant
//   - garde-fou anti-régression: le vecteur final n'est gardé que s'il bat
//     le cerveau par défaut sur des seeds JAMAIS vus pendant le réglage
//
// Tout est déterministe: même matchup → mêmes matchs → mêmes poids.

import { runMatch } from '../arena/runner';
import { utilityDecide, DEFAULT_WEIGHTS } from '../bots/utilityBrain';
import { createRng, hashSeed } from '../engine/rng';

// Les dimensions réglées par le CEM (le reste garde les défauts du cerveau).
export const TUNE_KEYS = [
  'damage', 'kill', 'heal', 'removePa', 'removePm', 'push', 'summon',
  'buff', 'armor', 'focusWeak', 'leader', 'antiSummon',
  'threat', 'rangeBand', 'aggression', 'retreatHp',
];

// Bornes de sécurité par clé (log-normal peut partir loin).
const CLAMP = { retreatHp: [0.05, 0.85] };
const clampKey = (k, v) => {
  const [lo, hi] = CLAMP[k] || [0.01, 8];
  return Math.min(hi, Math.max(lo, v));
};

// Rotation d'entraînement: les 3 arènes compactes + 2 vraies cartes Dofus
// (grandes, denses en obstacles) pour que les poids généralisent.
export const TUNE_MAPS = ['arene', 'muraille', 'canyon', 'amakna_1571', 'territoire_des_dopeuls_5383'];

export function weightBot(name, weights) {
  return { name, decide: (view, api) => utilityDecide(view, api, weights) };
}

// Un match noté du point de vue du candidat: 1 victoire, 0.5 nul, 0 défaite,
// + une marge de PV (±0.15) pour lisser le paysage de fitness.
export function playScored({ myClass, oppClass, myWeights, oppWeights, seed, mapId, mySide }) {
  const me = weightBot('cand', myWeights);
  const opp = weightBot('opp', oppWeights);
  const bots = mySide === 'A' ? { A: me, B: opp } : { A: opp, B: me };
  const classes = mySide === 'A'
    ? { A: myClass, B: oppClass }
    : { A: oppClass, B: myClass };
  const r = runMatch({ bots, classes, mapId, seed, collectFrames: false });
  const otherSide = mySide === 'A' ? 'B' : 'A';
  const my = r.finalState.fighters[mySide];
  const other = r.finalState.fighters[otherSide];
  const margin = my.hp / my.baseMaxHp - other.hp / other.baseMaxHp;
  const base = r.winner === mySide ? 1 : (r.winner === null ? 0.5 : 0);
  return base + 0.15 * margin;
}

// Moyenne de playScored sur seeds × 2 côtés, cartes en rotation.
export function evaluateWeights({ myClass, oppClass, myWeights, oppWeights, seeds, mapOffset = 0 }) {
  let sum = 0;
  let n = 0;
  seeds.forEach((seed, i) => {
    const mapId = TUNE_MAPS[(i + mapOffset) % TUNE_MAPS.length];
    for (const mySide of ['A', 'B']) {
      sum += playScored({ myClass, oppClass, myWeights, oppWeights, seed, mapId, mySide });
      n += 1;
    }
  });
  return { score: sum / n, matches: n };
}

// Gaussienne déterministe (Box-Muller sur notre PRNG seedé).
function makeGauss(seedText) {
  const rng = createRng(hashSeed(seedText));
  return () => {
    const u = Math.max(1e-12, rng.next());
    const v = rng.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
}

const toWeights = (vec) => Object.fromEntries(
  TUNE_KEYS.map((k, i) => [k, clampKey(k, Math.exp(vec[i]))]),
);

// CEM complet pour UN matchup. Retourne { weights|null, holdout, matchesPlayed }.
export function cemTuneMatchup({
  myClass,
  oppClass,
  oppWeights = {},          // le sparring (défaut: cerveau générique)
  startWeights = null,      // point de départ (défaut: DEFAULT_WEIGHTS)
  seedBase = 20260704,
  pop = 16,
  elite = 4,
  gens = 6,
  seedsPerGen = 6,          // × 2 côtés = 12 matchs par candidat
  holdoutSeeds = 12,        // × 2 côtés = 24 matchs de validation par vecteur
  tag = '',
}) {
  const start = startWeights || DEFAULT_WEIGHTS;
  let mu = TUNE_KEYS.map((k) => Math.log(Math.max(0.02, start[k] ?? DEFAULT_WEIGHTS[k])));
  let sigma = TUNE_KEYS.map(() => 0.45);
  const gauss = makeGauss(`cem:${myClass}:${oppClass}:${tag}`);
  let matchesPlayed = 0;
  let bestEver = { score: -Infinity, vec: [...mu] };

  for (let g = 0; g < gens; g++) {
    // seeds partagés par toute la génération (CRN), renouvelés à chaque gen
    const seeds = Array.from(
      { length: seedsPerGen },
      (_, i) => hashSeed(`${seedBase}:${myClass}:${oppClass}:${tag}:g${g}:s${i}`) % 1e9,
    );
    const scored = [];
    for (let p = 0; p < pop; p++) {
      // le 1er candidat de chaque gen = la moyenne courante (élitisme doux)
      const vec = p === 0 ? [...mu] : mu.map((m, i) => m + sigma[i] * gauss());
      const w = toWeights(vec);
      const r = evaluateWeights({
        myClass, oppClass, myWeights: w, oppWeights, seeds, mapOffset: g,
      });
      matchesPlayed += r.matches;
      scored.push({ vec, score: r.score });
    }
    scored.sort((a, b) => b.score - a.score);
    if (scored[0].score > bestEver.score) bestEver = { ...scored[0] };
    const el = scored.slice(0, elite);
    mu = TUNE_KEYS.map((_, i) => el.reduce((s, e) => s + e.vec[i], 0) / el.length);
    const decay = Math.max(0, 1 - g / gens);
    sigma = TUNE_KEYS.map((_, i) => {
      const m = mu[i];
      const varr = el.reduce((s, e) => s + (e.vec[i] - m) ** 2, 0) / el.length;
      return Math.max(0.06, Math.sqrt(varr) + 0.1 * decay);
    });
  }

  const tuned = toWeights(mu);

  // holdoutSeeds = 0: pas de garde-fou interne, l'appelant fait sa propre
  // validation (round 2 duelle round 2 vs round 1 lui-même).
  if (holdoutSeeds <= 0) {
    return { weights: tuned, tuned, holdout: null, matchesPlayed };
  }

  // Validation sur des seeds jamais vus: le réglé doit battre le défaut.
  const seeds = Array.from(
    { length: holdoutSeeds },
    (_, i) => hashSeed(`${seedBase}:holdout:${myClass}:${oppClass}:${tag}:h${i}`) % 1e9,
  );
  const evalTuned = evaluateWeights({ myClass, oppClass, myWeights: tuned, oppWeights, seeds });
  const evalBase = evaluateWeights({ myClass, oppClass, myWeights: {}, oppWeights, seeds });
  matchesPlayed += evalTuned.matches + evalBase.matches;

  const keep = evalTuned.score >= evalBase.score - 0.005;
  return {
    weights: keep ? tuned : null,
    tuned,
    holdout: { tuned: evalTuned.score, base: evalBase.score },
    matchesPlayed,
  };
}
