// Round 2: raffinage des matchups faibles après fusion du round 1.
//   - warm start sur le vecteur round 1
//   - sparring RÉALISTE: l'adversaire joue avec SES poids maison round 1
//     (au tableau final, tout le monde est maison — pas le cerveau défaut)
//   - budget plus gros, seeds distincts (tag r2)
//   - on garde round 2 seulement s'il bat round 1 contre CE sparring
//
// Écrit dans src/tuning/out2/<CLASSE>.json, fusionné par merge_maison.js.

/* eslint-disable no-console */
import fs from 'fs';
import path from 'path';
import { cemTuneMatchup, evaluateWeights } from './harness';
import { hashSeed } from '../engine/rng';
import { maisonWeightsFor } from '../bots/maison';

export function refineMatchups(myClass, oppClasses, opts = {}) {
  const outDir = path.join(__dirname, 'out2');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${myClass}.json`);
  const result = { classId: myClass, vs: {}, meta: { matches: 0 } };

  for (const opp of oppClasses) {
    const t0 = Date.now();
    const r1 = maisonWeightsFor(myClass, opp);       // vecteur actuel (round 1)
    const oppW = maisonWeightsFor(opp, myClass);      // sparring maison round 1
    const r = cemTuneMatchup({
      myClass,
      oppClass: opp,
      oppWeights: oppW,
      startWeights: Object.keys(r1).length ? r1 : null,
      tag: 'r2',
      pop: 20,
      elite: 5,
      gens: 10,
      seedsPerGen: 10,
      holdoutSeeds: 0, // on fait notre propre duel r2 vs r1 ci-dessous
      ...opts,
    });
    let matches = r.matchesPlayed;

    // Duel de validation: r2 et r1 contre le MÊME sparring, seeds neufs.
    const seeds = Array.from(
      { length: 20 },
      (_, i) => hashSeed(`duel:${myClass}:${opp}:d${i}`) % 1e9,
    );
    const e2 = evaluateWeights({ myClass, oppClass: opp, myWeights: r.tuned, oppWeights: oppW, seeds });
    const e1 = evaluateWeights({ myClass, oppClass: opp, myWeights: r1, oppWeights: oppW, seeds });
    matches += e2.matches + e1.matches;

    const better = e2.score > e1.score + 0.005;
    result.vs[opp] = {
      weights: better ? r.tuned : null, // null = round 1 conservé
      duel: { r2: e2.score, r1: e1.score },
      matches,
    };
    result.meta.matches += matches;
    fs.writeFileSync(outFile, JSON.stringify(result, null, 1));
    console.log(
      `[r2 ${myClass}] vs ${opp}: r2 ${e2.score.toFixed(3)} vs r1 ${e1.score.toFixed(3)} `
      + `→ ${better ? 'ROUND 2 gardé' : 'round 1 conservé'} — ${matches} matchs, ${((Date.now() - t0) / 1000).toFixed(0)}s`,
    );
  }
  return result;
}
