// Règle une classe complète: un CEM par classe adverse (12 matchups),
// avec écriture incrémentale du résultat (crash-safe) dans src/tuning/out/.
// Lancé en parallèle (un fichier jest par classe → un worker par classe).

/* eslint-disable no-console */
import fs from 'fs';
import path from 'path';
import { CLASS_IDS } from '../engine/classes';
import { cemTuneMatchup } from './harness';

export function tuneClass(myClass, opts = {}) {
  const outDir = path.join(__dirname, 'out');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${myClass}.json`);

  const result = {
    classId: myClass,
    vs: {},
    meta: { startedAt: new Date().toISOString(), matches: 0, opts },
  };

  for (const opp of CLASS_IDS) {
    const t0 = Date.now();
    const r = cemTuneMatchup({ myClass, oppClass: opp, ...opts });
    result.vs[opp] = {
      weights: r.weights,
      holdout: r.holdout,
      matches: r.matchesPlayed,
    };
    result.meta.matches += r.matchesPlayed;
    result.meta.updatedAt = new Date().toISOString();
    fs.writeFileSync(outFile, JSON.stringify(result, null, 1));
    console.log(
      `[${myClass}] vs ${opp}: holdout ${r.holdout.tuned.toFixed(3)} `
      + `(défaut ${r.holdout.base.toFixed(3)}) ${r.weights ? 'GARDÉ' : 'rejeté'} `
      + `— ${r.matchesPlayed} matchs en ${((Date.now() - t0) / 1000).toFixed(0)}s`,
    );
  }
  return result;
}
