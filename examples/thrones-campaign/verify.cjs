// Reproducible pacing benchmark. Never reads or changes a player's saves.
require('../../scripts/ai_runtime.cjs');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const { build } = require('./definition.cjs');
const { runMatch } = require('../../src/arena/runner');
const { maisonDecide } = require('../../src/bots/maison');
const { advanceCampaign, roomVictory } = require('../../src/engine/dungeonCampaign');
const { validCreations } = require('../../src/ui/creationsStore');
const dungeon = process.env.CAMPAIGN_INPUT ? JSON.parse(fs.readFileSync(process.env.CAMPAIGN_INPUT)) : build().dungeon;
assert(validCreations({ version: 1, characters: [], dungeons: [dungeon] }));
const output = process.env.CAMPAIGN_REPORT || path.resolve(__dirname, '../../public/adventures/thrones-campaign/calibration-combat-report.json');
fs.mkdirSync(path.dirname(output), { recursive: true });
const seeds = (process.env.CAMPAIGN_SEEDS || '26101,26102,26103,26104').split(',').map(Number);
const selectedRooms = (process.env.CAMPAIGN_ROOMS || '1,2,3,4,5,6,7,8').split(',').map(Number);
const report = { scope: 'Real engine and supplied six-hero team; Maison for heroes, normal monster AI for enemies. One round means a complete initiative cycle, not one fighter. Casts include weapons and failed casts; moves are commands, not cells. Static and AI checks do not certify human enjoyment.', seeds, matches: [], summary: [] };
const designHash = d => crypto.createHash('sha256').update(JSON.stringify({ heroes: d.adventure.heroes,
  rooms: d.rooms.map(({ battlefield, members, encounter }) => ({ battlefield, members, encounter })) })).digest('hex');
report.designSha256 = designHash(dungeon);
const round1 = n => Math.round(n * 10) / 10;
const median = values => { const a = values.slice().sort((a, b) => a - b), mid = Math.floor(a.length / 2); return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2; };
function metrics(result) {
  const fighters = Object.values(result.finalState.fighters), side = id => result.finalState.fighters[id]?.team;
  const teams = Object.fromEntries(['A', 'B'].map(team => [team, { turns: 0, casts: 0, moves: 0, damageTaken: 0, healingReceived: 0 }]));
  let round = 1, firstDamageRound = null, lastEnemyCount = fighters.filter(f => f.team === 'B').length, collapse = null;
  const rounds = {};
  for (const e of result.events) {
    if (e.t === 'turn_start') round = e.turn;
    rounds[round] ||= { heroCasts: 0, enemyCasts: 0, heroDamage: 0, enemyDamage: 0, kills: 0 };
    const who = teams[side(e.fighter)];
    if (e.t === 'turn_start' && who) who.turns++;
    if (['cast', 'spell_fail'].includes(e.t) && who) { who.casts++; rounds[round][side(e.fighter) === 'A' ? 'heroCasts' : 'enemyCasts']++; }
    if (e.t === 'move' && who) who.moves++;
    if (e.t === 'damage' && teams[side(e.target)]) {
      teams[side(e.target)].damageTaken += e.amount;
      if (e.amount && side(e.source) && side(e.source) !== side(e.target)) {
        firstDamageRound ??= round;
        rounds[round][side(e.source) === 'A' ? 'heroDamage' : 'enemyDamage'] += e.amount;
      }
    }
    if (e.t === 'heal' && teams[side(e.target)]) teams[side(e.target)].healingReceived += e.amount;
    if (e.t === 'death' && side(e.fighter) === 'B') { lastEnemyCount--; rounds[round].kills++; }
    if (e.t === 'death' && e.fighter === result.finalState.encounter?.commanderId) collapse = { round, remaining: lastEnemyCount };
  }
  const heroes = fighters.filter(f => f.team === 'A' && !f.isSummon), baseHp = heroes.reduce((sum, f) => sum + f.baseMaxHp, 0);
  return { rounds: result.turns, firstDamageRound, heroTurns: teams.A.turns, enemyTurns: teams.B.turns,
    heroCommands: teams.A.casts + teams.A.moves, enemyCommands: teams.B.casts + teams.B.moves,
    casts: { heroes: teams.A.casts, enemies: teams.B.casts }, moves: { heroes: teams.A.moves, enemies: teams.B.moves },
    damageToHeroes: teams.A.damageTaken, healingToHeroes: teams.A.healingReceived,
    heroHpRemainingPercent: round1(100 * heroes.reduce((sum, f) => sum + f.hp, 0) / baseHp),
    survivors: heroes.filter(f => f.hp > 0).length, collapse, byRound: rounds };
}
function summary(allMatches = report.matches) {
  return selectedRooms.map(room => {
    const matches = allMatches.filter(m => m.room === room);
    const range = key => { const values = matches.map(m => m[key]); return { min: Math.min(...values), median: round1(median(values)), max: Math.max(...values) }; };
    return { room, name: dungeon.rooms[room - 1].name, samples: matches.length, wins: matches.filter(m => m.victory).length,
      rounds: range('rounds'), heroCommands: range('heroCommands'), heroTurns: range('heroTurns'), enemyCommands: range('enemyCommands'),
      firstDamageRound: range('firstDamageRound'), heroHpRemainingPercent: range('heroHpRemainingPercent'), survivors: range('survivors') };
  });
}
if (require.main === module) {
for (const seed of seeds) {
  let progress;
  for (const room of selectedRooms) {
    const roomIndex = room - 1, started = Date.now();
    const result = runMatch({ mode: 'custom', dungeon, roomIndex, seed, collectFrames: false,
      classes: { A: 'IOP', B: 'IOP' }, bots: { A: { name: 'Maison', decide: maisonDecide }, B: { name: 'Monstres', decide: maisonDecide } } });
    const invalid = Object.values(result.stats).reduce((n, s) => n + s.invalid, 0), errors = Object.values(result.stats).reduce((n, s) => n + s.errors, 0);
    assert.equal(invalid, 0); assert.equal(errors, 0);
    assert(!result.events.some(e => e.t === 'forfeit_turn'), 'AI action budget exhausted');
    progress = advanceCampaign(dungeon, progress, roomIndex, result.finalState);
    const entry = { seed, room, name: dungeon.rooms[roomIndex].name, ms: Date.now() - started,
      victory: roomVictory(result.finalState), reason: result.endReason, ...metrics(result), invalid, errors };
    report.matches.push(entry);
    console.log(JSON.stringify({ seed, room, win: entry.victory, rounds: entry.rounds, commands: entry.heroCommands, hp: entry.heroHpRemainingPercent, survivors: entry.survivors }));
    fs.writeFileSync(output, JSON.stringify(report, null, 2));
  }
}
report.summary = summary();
fs.writeFileSync(output, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ report: output, summary: report.summary }));
}
module.exports = { metrics, summary, designHash };
