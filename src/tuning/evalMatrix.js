// Tableau final: l'IA Maison évaluée après fusion des poids.
//   1. par classe: maison vs cerveau défaut (la barre de qualité)
//   2. matrice classe × classe en maison-vs-maison (équilibrage du jeu)
//   3. maison vs les builtins scriptés (brutus/plume/toubib)
// Écrit src/tuning/out/EVAL.json et log un rapport lisible.

/* eslint-disable no-console */
import fs from 'fs';
import path from 'path';
import { evaluateWeights, TUNE_MAPS } from './harness';
import { hashSeed } from '../engine/rng';
import { maisonWeightsFor, maisonDecide } from '../bots/maison';
import { CLASS_IDS } from '../engine/classes';
import { runMatch } from '../arena/runner';
import { compileBot } from '../bots/compile';
import { getBuiltinBot } from '../bots/builtins';

const seedsFor = (tag, n) => Array.from({ length: n }, (_, i) => hashSeed(`eval:${tag}:${i}`) % 1e9);

export function evalMaison({ seedsPerPair = 8 } = {}) {
  const report = { vsDefault: {}, matrix: {}, vsBuiltins: {}, matches: 0 };

  // 1. maison vs cerveau défaut, par classe (moyenne sur toutes les classes adverses)
  for (const cls of CLASS_IDS) {
    let sum = 0;
    let n = 0;
    for (const opp of CLASS_IDS) {
      const r = evaluateWeights({
        myClass: cls,
        oppClass: opp,
        myWeights: maisonWeightsFor(cls, opp),
        oppWeights: {},
        seeds: seedsFor(`d:${cls}:${opp}`, 3),
      });
      sum += r.score * r.matches;
      n += r.matches;
    }
    report.vsDefault[cls] = sum / n;
    report.matches += n;
    console.log(`maison ${cls.padEnd(10)} vs cerveau défaut: ${(sum / n).toFixed(3)}`);
  }

  // 2. matrice maison vs maison (win rate de la classe LIGNE contre la COLONNE)
  for (const a of CLASS_IDS) {
    report.matrix[a] = {};
    for (const b of CLASS_IDS) {
      const r = evaluateWeights({
        myClass: a,
        oppClass: b,
        myWeights: maisonWeightsFor(a, b),
        oppWeights: maisonWeightsFor(b, a),
        seeds: seedsFor(`m:${a}:${b}`, seedsPerPair / 2),
      });
      report.matrix[a][b] = Math.round(r.score * 1000) / 1000;
      report.matches += r.matches;
    }
  }

  // 3. maison vs les bots scriptés, sur leur classe fétiche
  const duels = [
    ['brutus', 'IOP'], ['plume', 'CRA'], ['toubib', 'ENIRIPSA'],
  ];
  const maisonBot = { name: 'Maison', decide: (v, a) => maisonDecide(v, a) };
  for (const [botId, botClass] of duels) {
    const b = getBuiltinBot(botId);
    const decide = compileBot(b.code);
    let wins = 0;
    let games = 0;
    for (const myClass of CLASS_IDS) {
      for (const [i, seed] of seedsFor(`b:${botId}:${myClass}`, 2).entries()) {
        const mySide = i % 2 === 0 ? 'A' : 'B';
        const bots = mySide === 'A'
          ? { A: maisonBot, B: { name: b.name, decide } }
          : { A: { name: b.name, decide }, B: maisonBot };
        const classes = mySide === 'A' ? { A: myClass, B: botClass } : { A: botClass, B: myClass };
        const r = runMatch({
          bots, classes, mapId: TUNE_MAPS[games % TUNE_MAPS.length], seed, collectFrames: false,
        });
        if (r.winner === mySide) wins += 1;
        else if (r.winner === null) wins += 0.5;
        games += 1;
      }
    }
    report.vsBuiltins[botId] = wins / games;
    report.matches += games;
    console.log(`maison (12 classes) vs ${botId} (${botClass}): ${(100 * wins / games).toFixed(0)}%`);
  }

  const out = path.join(__dirname, 'out', 'EVAL.json');
  fs.writeFileSync(out, JSON.stringify(report, null, 1));
  return report;
}
