#!/usr/bin/env node
// Fusionne les sorties du réglage CEM (src/tuning/out/<CLASSE>.json) en
// src/bots/maisonWeights.json — le fichier chargé par l'IA Maison.
//
//   node scripts/merge_maison.js
//
// Format produit: { CLASSE: { base: {...}, vs: { ADVERSAIRE: {...} } } }
//   - vs.X   = vecteur réglé pour le matchup (seulement s'il a battu le
//              cerveau par défaut en validation)
//   - base   = médiane par clé des vecteurs gardés (repli des matchups
//              non réglés)

const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '..', 'src', 'tuning', 'out');
const POOL_DIR = path.join(__dirname, '..', 'src', 'tuning', 'rl', 'pool');
const TARGET = path.join(__dirname, '..', 'src', 'bots', 'maisonWeights.json');

const round3 = (x) => Math.round(x * 1000) / 1000;
const median = (arr) => {
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

const files = fs.readdirSync(OUT_DIR).filter((f) => f.endsWith('.json') && f !== 'EVAL.json');
const merged = {};
let kept = 0;
let rejected = 0;
let refined = 0;
const lines = [];

for (const file of files.sort()) {
  const data = JSON.parse(fs.readFileSync(path.join(OUT_DIR, file), 'utf8'));
  const cls = data.classId;
  // Pool d'auto-jeu RL (rounds adaptatifs): ses vecteurs, gagnants de leurs
  // duels de sélection round après round, remplacent le round 1.
  let rl = { vs: {} };
  const fp = path.join(POOL_DIR, file);
  if (fs.existsSync(fp)) rl = JSON.parse(fs.readFileSync(fp, 'utf8'));
  const vs = {};
  const keptVectors = [];

  for (const [opp, r] of Object.entries(data.vs || {})) {
    const r2 = rl.vs && rl.vs[opp];
    const weights = (r2 && r2.weights) || r.weights;
    if (r2 && r2.weights) refined += 1;
    if (weights) {
      vs[opp] = Object.fromEntries(
        Object.entries(weights).map(([k, v]) => [k, round3(v)]),
      );
      keptVectors.push(weights);
      kept += 1;
    } else {
      rejected += 1;
    }
    lines.push({
      cls, opp, tuned: r.holdout.tuned, base: r.holdout.base, kept: !!weights,
    });
  }

  const base = {};
  if (keptVectors.length > 0) {
    const allKeys = new Set(keptVectors.flatMap((w) => Object.keys(w)));
    for (const k of allKeys) {
      const vals = keptVectors.map((w) => w[k]).filter((v) => typeof v === 'number');
      if (vals.length > 0) base[k] = round3(median(vals));
    }
  }
  merged[cls] = { base, vs };
}

fs.writeFileSync(TARGET, `${JSON.stringify(merged, null, 1)}\n`);

console.log(`maisonWeights.json écrit: ${Object.keys(merged).length} classes, `
  + `${kept} matchups réglés (${refined} issus de l'auto-jeu RL), ${rejected} restés au défaut.`);
console.log('\nMoyenne holdout réglé vs défaut par classe:');
for (const cls of Object.keys(merged).sort()) {
  const rows = lines.filter((l) => l.cls === cls);
  const t = rows.reduce((s, l) => s + l.tuned, 0) / rows.length;
  const b = rows.reduce((s, l) => s + l.base, 0) / rows.length;
  console.log(`  ${cls.padEnd(10)} réglé ${t.toFixed(3)}  défaut ${b.toFixed(3)}  (+${(t - b).toFixed(3)}) — ${rows.filter((r) => r.kept).length}/12 gardés`);
}
