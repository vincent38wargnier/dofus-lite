// Merge independent worker reports and check the published encounter's pace.
// Usage: node pacing-report.cjs report-a.json report-b.json [...]
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { summary, designHash } = require('./verify.cjs');
const { build } = require('./definition.cjs');
const directory = path.resolve(__dirname, '../../public/adventures/thrones-campaign');
const calibration = JSON.parse(fs.readFileSync(path.join(directory, 'calibration-combat-report.json')));
const inputs = process.argv.length > 2 ? process.argv.slice(2) : [path.join(directory, 'validation-combat-report.json')];
const validation = inputs.map(file => JSON.parse(fs.readFileSync(file)));
assert(validation.length, 'Supply independent validation reports.');
const dungeon = build().dungeon, hash = designHash(dungeon);
assert.equal(calibration.designSha256, hash, 'Stale calibration report');
const calibrationSeeds = new Set(calibration.seeds), seen = new Set();
for (const report of validation) {
  assert.equal(report.designSha256, hash, 'Stale validation report');
  for (const seed of report.seeds) assert(!calibrationSeeds.has(seed), 'Validation seed reused during calibration');
  for (const match of report.matches) { const key = `${match.seed}:${match.room}`; assert(!seen.has(key), `Duplicate match ${key}`); seen.add(key); }
}
const heldOut = validation.flatMap(r => r.matches), matches = [...calibration.matches, ...heldOut];
assert(heldOut.length >= 64, 'Validate at least eight new full-campaign seeds.');
const maxRounds = [5, 6, 7, 7, 8, 10, 10, 12];
for (let room = 1; room <= 8; room++) {
  const entries = matches.filter(m => m.room === room);
  assert.equal(entries.length, matches.length / 8, 'Each seed must cover every room.');
  for (const m of entries) {
    assert(m.victory && m.invalid === 0 && m.errors === 0, `Fight failed: ${m.seed}/${room}`);
    assert(m.rounds <= maxRounds[room - 1], `Slow room ${room}: ${m.rounds} rounds (${m.seed})`);
    assert(m.firstDamageRound <= 2, 'Too many empty approach rounds');
    if (room === 1) assert(m.heroCommands <= 75 && m.survivors === 6, 'Opening is too demanding');
  }
}
const allSummary = summary(matches), independentSummary = summary(heldOut);
// More dangerous final encounters should not rely on inflated HP alone.
assert(independentSummary[7].heroHpRemainingPercent.median < independentSummary[6].heroHpRemainingPercent.median);
assert(independentSummary[6].heroHpRemainingPercent.median < independentSummary[4].heroHpRemainingPercent.median);
assert(independentSummary[4].heroHpRemainingPercent.median < independentSummary[0].heroHpRemainingPercent.median);
const report = { scope: calibration.scope, designSha256: hash,
  calibrationSeeds: calibration.seeds, validationSeeds: validation.flatMap(r => r.seeds),
  roundsDefinition: 'A complete initiative cycle; six heroes may each take a turn. Last round can end early.',
  humanDuration: 'Not measured: these are AI decisions, not minutes of human play.',
  testedLimits: { maximumRounds: maxRounds, firstRoomMaximumHeroCommands: 75 },
  matches: matches.map(m => ({ ...m, sample: calibrationSeeds.has(m.seed) ? 'calibration' : 'validation' })),
  summary: allSummary, independentSummary };
fs.writeFileSync(path.join(directory, 'combat-report.json'), JSON.stringify(report, null, 2));
const baseline = JSON.parse(fs.readFileSync(path.join(directory, 'baseline-combat-report.json')));
const pacing = { samples: matches.length, independentSamples: heldOut.length, heroes: 6,
  scope: 'Tours observés avec l’IA et l’équipe fournie. Vos décisions peuvent changer ces durées.',
  rooms: allSummary.map((s, i) => ({ season: s.room, enemies: dungeon.rooms[i].members.reduce((n, m) => n + m.count, 0),
    rounds: s.rounds, heroCommands: s.heroCommands, heroHpRemainingPercent: s.heroHpRemainingPercent,
    baselineRounds: baseline.summary[i].rounds, baselineHeroCommands: baseline.summary[i].heroCommands,
    survivors: s.survivors, wins: s.wins, samples: s.samples })) };
fs.writeFileSync(path.join(directory, 'pacing-report.json'), JSON.stringify(pacing, null, 2));
console.table(pacing.rooms.map(r => ({ room: r.season, enemies: r.enemies, rounds: `${r.rounds.min}–${r.rounds.max}`,
  median: r.rounds.median, commands: r.heroCommands.median, remainingHP: r.heroHpRemainingPercent.median })));
console.log(`${matches.length} matches, ${heldOut.length} held out; all pacing checks passed.`);
