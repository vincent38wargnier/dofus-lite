// Fit one shared confidence factor in historical matchup weights, without
// inventing class-specific exceptions. Evaluation is performed by benchmark_ai.
const fs = require('node:fs');
const path = require('node:path');
const source = path.resolve(process.argv[2] || 'local-observations/ai-20261010/calibration.json');
const report = JSON.parse(fs.readFileSync(source, 'utf8'));
if (report.mode !== 'calibrate' || report.failures.length || report.errors || report.invalidByPolicy.current > report.hiddenInvalidByPolicy.current || report.calibration?.length !== 3
  || report.calibration.some(row => row.matches !== 288)) throw new Error('Complete, error-free calibration required (3 × 288 paired matches).');
const best = [...report.calibration].sort((a, b) => b.objective - a.objective)[0];
const result = { version: 1, profileBlend: best.blend, meta: { rulesVersion: 9,
  seed: report.seed, matches: report.matches,
  objective: '0.8 × overall win score + 0.2 × weakest class win score',
  candidates: report.calibration,
  source: path.relative(process.cwd(), source),
  note: 'Development matches only; validate on untouched seeds before shipping.' } };
fs.writeFileSync('src/bots/policyCalibration.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
