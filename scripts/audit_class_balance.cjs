// Reproduce the balance reference from the installed client's imported spells.
// This is a descriptive census, not a claim that every original spell is fair.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const source = path.join(root, 'src/engine/spellLibrary.json');
const library = JSON.parse(fs.readFileSync(source));
const output = path.resolve(process.argv[2] || path.join(root, 'skills/retro-class-designer/references/baseline.json'));
const damageKinds = new Set(['damage', 'lifeSteal']);
const rows = [];
const point = zone => !zone || zone[0] === 'P' || zone[1] === 'a';
for (const [classId, ids] of Object.entries(library.classes)) for (const id of ids) {
  const entry = library.spells[id];
  for (const grade of entry.grades.filter(g => [5, 6].includes(g.grade))) {
    const effects = grade.effects;
    const damage = effects.filter(e => damageKinds.has(e.kind));
    const reasons = [];
    if (effects.length !== 1 || effects[0]?.kind !== 'damage') reasons.push('not exactly one plain damage effect');
    if (effects.some(e => e.chance > 0 || e.duration > 0)) reasons.push('random branch or delayed effect');
    if (effects.some(e => (e.targetMask || 0) & 8)) reasons.push('summons only');
    if (grade.requiredStates?.length) reasons.push('requires a state');
    if (grade.cooldown > 1 || grade.initialCooldown > 0) reasons.push('long or initial cooldown');
    if (!(grade.pa > 0)) reasons.push('no positive AP cost');
    const rawMean = damage.reduce((sum, e) => sum + (e.min + e.max) / 2, 0);
    const area = damage.some(e => !point(e.zone));
    rows.push({ classId, id, name: entry.name, grade: grade.grade, requiredLevel: grade.requiredLevel,
      pa: grade.pa, rangeMin: grade.rangeMin, rangeMax: grade.rangeMax, lineOnly: grade.lineOnly,
      needsLos: grade.needsLos, adjustableRange: grade.adjustableRange,
      cooldown: grade.cooldown, maxPerTurn: grade.maxPerTurn, maxPerTarget: grade.maxPerTarget,
      critRate: grade.critRate, failRate: grade.failRate, requiredStates: grade.requiredStates || [],
      actions: [...new Set(effects.map(e => e.kind))], elements: [...new Set(damage.map(e => e.element))],
      area, damageLines: damage.length, rawMean: damage.length ? rawMean : null,
      rawPerAp: damage.length && grade.pa ? rawMean / grade.pa : null,
      routineSingleLineDamage: reasons.length === 0, exclusionReasons: reasons,
      effects, critEffects: grade.critEffects });
  }
}
function quantile(sorted, q) {
  const index = (sorted.length - 1) * q, lo = Math.floor(index), hi = Math.ceil(index);
  return sorted.length ? +(sorted[lo] + (sorted[hi] - sorted[lo]) * (index - lo)).toFixed(3) : null;
}
function distribution(subset) {
  const sorted = subset.map(r => r.rawPerAp).sort((a, b) => a - b);
  return { n: sorted.length, min: quantile(sorted, 0), p25: quantile(sorted, .25),
    median: quantile(sorted, .5), p75: quantile(sorted, .75), p90: quantile(sorted, .9), max: quantile(sorted, 1),
    spellIds: subset.map(r => r.id) };
}
const maxGrade = rows.filter(r => r.grade === 6);
const routine = maxGrade.filter(r => r.routineSingleLineDamage);
const groups = {
  routine: distribution(routine),
  point: distribution(routine.filter(r => !r.area)),
  meleePoint: distribution(routine.filter(r => !r.area && r.rangeMax <= 2)),
  rangedPoint: distribution(routine.filter(r => !r.area && r.rangeMax > 2)),
  areaPerTargetBeforeFalloff: distribution(routine.filter(r => r.area)),
};
const result = {
  version: 1, source: 'src/engine/spellLibrary.json', sourceSha256: crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex'),
  importedClientSources: library.sources,
  methodology: 'Grade 6, one immediate damage effect, positive AP cost, no random branch, summon-only mask, required state, cooldown > 1 or initial cooldown. Uniform mean (min+max)/2 divided by PA, before statistics, criticals, equipment, area coefficient or resistance. Percentiles use linear interpolation. Cast/target limits, line-only, LoS and range still differ: inspect each row before comparison.',
  coverage: { classes: Object.keys(library.classes).length, classSpellEntries: Object.values(library.classes).flat().length,
    grade5And6Rows: rows.length, grade6Rows: maxGrade.length }, groups,
  classes: Object.keys(library.classes).map(classId => {
    const spells = maxGrade.filter(r => r.classId === classId);
    const any = predicate => spells.filter(r => r.actions.some(predicate)).length;
    return { classId, spellCount: spells.length, directDamage: any(a => damageKinds.has(a)),
      healing: any(a => ['heal', 'fixedHeal', 'lifeSteal', 'lifeTransfer'].includes(a)),
      summoning: any(a => ['summon', 'staticSummon', 'double', 'revive'].includes(a)),
      positioning: any(a => ['push', 'pull', 'teleport', 'swap', 'carry', 'throw', 'fear', 'rollback'].includes(a)),
      boosts: any(a => /^(buff|armor|weaponMastery|punishment|resist.*Buff)/.test(a)),
      control: any(a => /^(removeP|debuff|stealP|dispel|skipTurn|resistDebuff)/.test(a)) };
  }), rows,
};
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
const columns = ['classId', 'id', 'name', 'grade', 'pa', 'rangeMin', 'rangeMax', 'lineOnly', 'needsLos', 'adjustableRange', 'cooldown', 'maxPerTurn', 'maxPerTarget', 'critRate', 'damageLines', 'rawMean', 'rawPerAp', 'area', 'routineSingleLineDamage'];
const csv = value => JSON.stringify(value === null || value === undefined ? '' : String(value));
fs.writeFileSync(output.replace(/\.json$/, '') + '.csv', [columns.join(','), ...rows.map(r => columns.map(k => csv(r[k])).join(','))].join('\n') + '\n');
console.log(JSON.stringify({ output, coverage: result.coverage, groups }, null, 2));
