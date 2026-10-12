// Full census of the imported class baseline and the current design budgets.
require('./ai_runtime.cjs');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { classBalanceReference, spellbookBalance, SPELL_BALANCE_VERSION } = require('../src/engine/spellBalance');
const references = classBalanceReference();
const output = path.resolve(process.argv[2] || 'local-observations/spell-balance/reference.json');
const rows = references.map(spell => ({ classId: spell.classId, id: spell.id, name: spell.name, pa: spell.pa,
  range: [spell.rangeMin, spell.rangeMax], cooldown: spell.cooldown, maxPerTurn: spell.maxPerTurn,
  maxPerTarget: spell.maxPerTarget, lineOnly: spell.lineOnly, needsLos: spell.needsLos,
  score: spell.balance.score, normalEstimate: spell.balance.normal, criticalEstimate: spell.balance.critical,
  nativeException: spell.balance.exception, kinds: [...new Set(spell.effects.map(e => e.kind))] }));
const ordinary = references.filter(s => s.effects.length === 1 && s.effects[0].kind === 'damage'
  && !s.effects[0].duration && !s.effects[0].chance && !(s.effects[0].targetMask & 8)
  && !s.requiredStates.length && s.cooldown <= 1);
const byEfficiency = ordinary.map(s => ({ name: s.name, id: s.id, pa: s.pa, range: [s.rangeMin, s.rangeMax],
  zone: s.effects[0].zone, rawMeanPerPa: (s.effects[0].min + s.effects[0].max) / 2 / s.pa, score: s.balance.score }))
  .sort((a, b) => a.rawMeanPerPa - b.rawMeanPerPa);
const report = { version: SPELL_BALANCE_VERSION, source: 'src/engine/spellLibrary.json',
  sourceSha256: crypto.createHash('sha256').update(fs.readFileSync('src/engine/spellLibrary.json')).digest('hex'),
  scope: 'Static design budget. Not win rates, not an official formula, not a certification of balance.',
  coverage: { classes: new Set(rows.map(r => r.classId)).size, grade6Spells: rows.length, comparableDirectSpells: ordinary.length },
  ordinaryDamage: { weakestPerPa: byEfficiency.slice(0, 5), strongestPerPa: byEfficiency.slice(-5).reverse() },
  originalClasses: [...new Set(rows.map(r => r.classId))].map(classId => {
    const spells = references.filter(s => s.classId === classId).sort((a, b) => b.balance.score - a.balance.score);
    return { classId, spells: spells.length, highestTenBudget: spellbookBalance(spells.slice(0, 10)).score,
      note: 'Original full class kits are not subject to custom-kit admission.' };
  }), rows };
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ output, coverage: report.coverage, ordinaryDamage: report.ordinaryDamage }, null, 2));
