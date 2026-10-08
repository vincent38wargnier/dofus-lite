// Entraînement RL en auto-jeu par ROUNDS (inspiré du harnais DQN/PBT de
// jarvio/rl: population parallèle, rounds checkpointés, sélection, reprise).
// Ici la politique est le cerveau utilitaire, ses paramètres sont les poids
// (16 dims tactiques + 1 multiplicateur PAR SORT du kit) — et l'optimiseur
// est un CEM court par round (de la famille des evolution strategies).
//
// Ce qui en fait de l'auto-jeu adaptatif, façon « adaptive rounds »:
//   - chaque classe s'entraîne dans SON worker, en continu
//   - l'adversaire n'est pas figé: à chaque round on relit le POOL des
//     autres classes (leurs derniers meilleurs poids) → la méta évolue
//   - une ancre « cerveau défaut » (40%) évite le sur-ajustement au pool
//   - le fitness d'exploration est FAÇONNÉ vers l'exploitation du kit
//     (bonus PA/PM utilisés) — mais la SÉLECTION (duel candidat vs tenant)
//     se fait au winrate pur: le shaping guide, il ne corrompt pas
//   - checkpoints par round (rl/round_<n>_<classe>.json), pool atomique
//
// Un pool par classe (fichier séparé) → 12 writers sans course; les
// lectures croisées tolèrent un fichier en cours d'écriture (tmp+rename).

/* eslint-disable no-console */
import fs from 'fs';
import path from 'path';
import { CLASSES, CLASS_IDS } from '../engine/classes';
import { runMatch } from '../arena/runner';
import { createRng, hashSeed } from '../engine/rng';
import { DEFAULT_WEIGHTS } from '../bots/utilityBrain';
import { TUNE_KEYS, TUNE_MAPS, weightBot } from './harness';
import { compileBot } from '../bots/compile';
import { getBuiltinBot } from '../bots/builtins';
import MAISON from '../bots/maisonWeights.json';

// Sparring scripté: quand la classe ADVERSE est la classe fétiche d'un bot
// intégré, une partie des matchs se joue contre lui — l'auto-jeu ne voit
// jamais ces styles-là tout seul (Brutus le rusher reste le boss à battre).
const SCRIPTED_BY_CLASS = {};
for (const [botId, cls] of [['brutus', 'IOP'], ['plume', 'CRA'], ['toubib', 'ENIRIPSA']]) {
  const b = getBuiltinBot(botId);
  SCRIPTED_BY_CLASS[cls] = { name: b.name, decide: compileBot(b.code) };
}

const RL_DIR = path.join(__dirname, 'rl');
const POOL_DIR = path.join(RL_DIR, 'pool');

// ---------------------------------------------------------------- pool I/O

function readPool(cls) {
  try {
    return JSON.parse(fs.readFileSync(path.join(POOL_DIR, `${cls}.json`), 'utf8'));
  } catch (e) {
    return null; // absent ou en cours d'écriture: l'appelant a un repli
  }
}

function writePool(cls, data) {
  fs.mkdirSync(POOL_DIR, { recursive: true });
  const file = path.join(POOL_DIR, `${cls}.json`);
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 1));
  fs.renameSync(tmp, file); // atomique sur le même volume
}

// Meilleurs poids CONNUS de `cls` contre `opp`: pool d'abord (la méta la
// plus récente), sinon maisonWeights (round 1), sinon défauts du cerveau.
export function currentBest(cls, opp) {
  const p = readPool(cls);
  if (p && p.vs && p.vs[opp] && p.vs[opp].weights) return p.vs[opp].weights;
  const m = MAISON[cls] || {};
  return { ...(m.base || {}), ...((m.vs || {})[opp] || {}) };
}

// ---------------------------------------------------------------- fitness

// Match noté + exploitation du kit (PA dépensés, PM parcourus) du leader.
// L'adversaire est soit un jeu de poids (oppWeights), soit un bot scripté
// complet (oppBot: { name, decide }).
function playShaped({ myClass, oppClass, myWeights, oppWeights, oppBot, seed, mapId, mySide, shaped }) {
  const opp = oppBot || weightBot('opp', oppWeights);
  const bots = mySide === 'A'
    ? { A: weightBot('cand', myWeights), B: opp }
    : { A: opp, B: weightBot('cand', myWeights) };
  const classes = mySide === 'A'
    ? { A: myClass, B: oppClass }
    : { A: oppClass, B: myClass };
  const r = runMatch({ bots, classes, mapId, seed, collectFrames: false });

  const other = mySide === 'A' ? 'B' : 'A';
  const my = r.finalState.fighters[mySide];
  const en = r.finalState.fighters[other];
  const margin = my.hp / my.baseMaxHp - en.hp / en.baseMaxHp;
  let score = (r.winner === mySide ? 1 : r.winner === null ? 0.5 : 0) + 0.15 * margin;

  if (shaped) {
    let paAvail = 0; let paSpent = 0; let pmAvail = 0; let pmMoved = 0;
    for (const e of r.events) {
      if (e.t === 'turn_start' && e.fighter === mySide) { paAvail += e.pa; pmAvail += e.pm; }
      if (e.t === 'cast' && e.fighter === mySide) paSpent += e.paCost;
      if (e.t === 'move' && e.fighter === mySide) pmMoved += e.cost;
    }
    score += 0.05 * (paSpent / Math.max(1, paAvail)) + 0.03 * (pmMoved / Math.max(1, pmAvail));
  }
  return score;
}

// Moyenne vs pool adaptatif + ancre cerveau défaut (anchorShare sur 5).
// Si un bot scripté existe pour la classe adverse, il prend un cran sur 5.
function evalMixed({ myClass, oppClass, myWeights, oppPoolW, seeds, shaped, mapOffset = 0, anchorShare = 2 }) {
  const scripted = SCRIPTED_BY_CLASS[oppClass] || null;
  let sum = 0;
  let n = 0;
  seeds.forEach((seed, i) => {
    const mapId = TUNE_MAPS[(i + mapOffset) % TUNE_MAPS.length];
    const slot = i % 5;
    let oppWeights = oppPoolW;
    let oppBot = null;
    if (scripted && slot === 4) oppBot = scripted;
    else if (slot >= 5 - anchorShare) oppWeights = {};
    for (const mySide of ['A', 'B']) {
      sum += playShaped({ myClass, oppClass, myWeights, oppWeights, oppBot, seed, mapId, mySide, shaped });
      n += 1;
    }
  });
  return { score: sum / n, matches: n };
}

// ---------------------------------------------------------------- CEM court

const clampKey = (k, v) => {
  if (k.startsWith('spell_')) return Math.min(4, Math.max(0.05, v));
  if (k === 'retreatHp') return Math.min(0.85, Math.max(0.05, v));
  return Math.min(8, Math.max(0.01, v));
};

function cemStep({ myClass, oppClass, start, keys, tag, pop, gens, seedsPerGen, oppPoolW, anchorShare = 2 }) {
  const rng = createRng(hashSeed(`rl:${tag}`));
  const gauss = () => {
    const u = Math.max(1e-12, rng.next());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng.next());
  };
  const startVal = (k) => start[k] ?? DEFAULT_WEIGHTS[k] ?? 1; // sorts: 1 par défaut
  let mu = keys.map((k) => Math.log(Math.max(0.02, startVal(k))));
  let sigma = keys.map((k) => (k.startsWith('spell_') ? 0.35 : 0.25));
  const toW = (vec) => Object.fromEntries(keys.map((k, i) => [k, clampKey(k, Math.exp(vec[i]))]));
  let matches = 0;

  for (let g = 0; g < gens; g++) {
    const seeds = Array.from(
      { length: seedsPerGen },
      (_, i) => hashSeed(`${tag}:g${g}:s${i}`) % 1e9,
    );
    const scored = [];
    for (let p = 0; p < pop; p++) {
      const vec = p === 0 ? [...mu] : mu.map((m, i) => m + sigma[i] * gauss());
      const r = evalMixed({
        myClass, oppClass, myWeights: toW(vec), oppPoolW, seeds, shaped: true, mapOffset: g, anchorShare,
      });
      matches += r.matches;
      scored.push({ vec, score: r.score });
    }
    scored.sort((a, b) => b.score - a.score);
    const el = scored.slice(0, Math.max(2, Math.floor(pop / 4)));
    mu = keys.map((_, i) => el.reduce((s, e) => s + e.vec[i], 0) / el.length);
    sigma = keys.map((_, i) => {
      const m = mu[i];
      const varr = el.reduce((s, e) => s + (e.vec[i] - m) ** 2, 0) / el.length;
      return Math.max(0.05, Math.sqrt(varr) + 0.08 * (1 - g / gens));
    });
  }
  return { weights: toW(mu), matches };
}

// ---------------------------------------------------------------- rounds

export function selfplayClass(myClass, {
  rounds = 4, pop = 12, gens = 3, seedsPerGen = 5, duelSeeds = 8, anchorShare = 2,
} = {}) {
  fs.mkdirSync(POOL_DIR, { recursive: true });
  let pool = readPool(myClass) || { classId: myClass, vs: {}, meta: { round: 0, matches: 0 } };
  for (const opp of CLASS_IDS) {
    if (!pool.vs[opp]) pool.vs[opp] = { weights: currentBest(myClass, opp), score: null };
  }
  writePool(myClass, pool);

  const spellKeys = Object.values(CLASSES[myClass].spells).map((s) => `spell_${s.key}`);
  const keys = [...TUNE_KEYS, ...spellKeys];

  const startRound = (pool.meta.round || 0) + 1;
  for (let round = startRound; round < startRound + rounds; round++) {
    const t0 = Date.now();
    let replaced = 0;
    for (const opp of CLASS_IDS) {
      const incumbent = pool.vs[opp].weights;
      const oppPoolW = currentBest(opp, myClass); // la méta adverse LA PLUS RÉCENTE
      const tag = `${myClass}:${opp}:r${round}:a${anchorShare}`;
      const cand = cemStep({
        myClass, oppClass: opp, start: incumbent, keys, tag, pop, gens, seedsPerGen, oppPoolW, anchorShare,
      });
      pool.meta.matches += cand.matches;

      // Duel de sélection SANS shaping: le winrate décide, seeds neufs.
      const seeds = Array.from(
        { length: duelSeeds },
        (_, i) => hashSeed(`duel:${tag}:d${i}`) % 1e9,
      );
      const eC = evalMixed({ myClass, oppClass: opp, myWeights: cand.weights, oppPoolW, seeds, shaped: false, anchorShare });
      const eI = evalMixed({ myClass, oppClass: opp, myWeights: incumbent, oppPoolW, seeds, shaped: false, anchorShare });
      pool.meta.matches += eC.matches + eI.matches;

      if (eC.score > eI.score + 0.005) {
        pool.vs[opp] = { weights: cand.weights, score: eC.score };
        replaced += 1;
      } else {
        pool.vs[opp].score = eI.score;
      }
      pool.meta.round = round;
      writePool(myClass, pool);
    }
    const avg = CLASS_IDS.reduce((s, o) => s + (pool.vs[o].score || 0), 0) / CLASS_IDS.length;
    fs.writeFileSync(
      path.join(RL_DIR, `round_${round}_${myClass}.json`),
      JSON.stringify(pool, null, 1),
    );
    console.log(
      `[RL ${myClass}] round ${round}: ${replaced}/12 matchups remplacés, `
      + `score moyen ${avg.toFixed(3)}, ${pool.meta.matches} matchs cumulés, `
      + `${((Date.now() - t0) / 1000).toFixed(0)}s`,
    );
  }
  return pool;
}
