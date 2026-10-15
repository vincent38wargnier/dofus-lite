const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { build } = require('./definition.cjs');
const { createGame, applyAction } = require('../../src/engine/engine');
const { runMatch } = require('../../src/arena/runner');
const { maisonDecide } = require('../../src/bots/maison');
const { spellBudgetErrors } = require('../../src/engine/spellBalance');
const { validateCustomEquipment } = require('../../src/engine/customEquipment');
const { validCreations } = require('../../src/ui/creationsStore');
const { dungeon, characters, equipment } = build({ artwork: false });
const output = path.resolve(__dirname, '../../public/adventures/winterfell');
fs.mkdirSync(output, { recursive: true });
const report = { fixtureCasts: [], scenarios: [], matches: [], scope: 'Local numerical and encounter testing, not competitive class certification.' };

assert(validCreations({ version: 1, characters, dungeons: [dungeon] }));
const owners = [...characters.map(c => ({ name: c.name, cfg: { classId: c.classId, loadout: c.loadout }, spells: c.loadout.spells.custom })),
  ...dungeon.members.map(m => ({ name: m.customMonster.name, cfg: { customMonster: m.customMonster }, spells: m.customMonster.spells }))];
for (const owner of owners) for (const raw of owner.spells) {
  const { state } = createGame({ mapId: 'arene', seed: raw.id % 100000, fighters: [
    { ...owner.cfg, id: 'A', team: 'A', name: owner.name }, { id: 'B', team: 'B', monsterId: 494, monsterGrade: 5 },
  ] });
  state.currentIndex = state.order.indexOf('A');
  state.fighters.A.pos = { x: 2, y: 5 }; state.fighters.A.pa = 20; state.fighters.A.hp -= 100;
  state.fighters.B.pos = { x: 2 + Math.max(1, raw.rangeMin), y: 5 };
  const target = raw.targetMode === 'self' || raw.targetMode === 'fighter' ? state.fighters.A.pos
    : raw.targetMode === 'freeCell' ? { x: 2, y: 6 } : state.fighters.B.pos;
  const result = applyAction(state, { type: 'CAST', spell: raw.key, target });
  assert(!result.events.some(e => e.t === 'invalid'), `${owner.name}: ${raw.name}: ${JSON.stringify(result.events)}`);
  assert.deepEqual(result.events.find(e => e.t === 'cast').visualEffect, raw.visualEffect);
  assert.equal(result.events.find(e => e.t === 'cast').visualSpellId, undefined);
  assert.equal(result.state.fighters.A.pa, 20 - raw.pa, `${raw.name}: PA`);
  if (raw.effects.some(e => e.kind === 'damage')) assert(result.events.some(e => e.t === 'damage' && e.amount > 0), `${raw.name}: real damage`);
  if (raw.effects.some(e => e.kind === 'heal')) assert(result.state.fighters.A.hp > state.fighters.A.hp, `${raw.name}: real healing`);
  if (raw.effects.some(e => e.kind === 'teleport')) assert.deepEqual(result.state.fighters.A.pos, target);
  report.fixtureCasts.push({ owner: owner.name, spell: raw.name, pa: raw.pa, events: [...new Set(result.events.map(e => e.t))] });
}
report.scenarios.push('All 29 authored spells cast through the real engine, consume their declared AP and apply damage/healing/teleport as appropriate.');

// Melisandre's fire is intentionally dangerous around allies; the empty-cell
// area attack must not secretly become an enemy-only attack.
{
  const mel = characters[2], { state } = createGame({ mapId: 'arene', seed: 928, fighters: [
    { id: 'A', team: 'A', classId: mel.classId, loadout: mel.loadout },
    { id: 'A2', team: 'A', classId: 'IOP', loadout: characters[0].loadout },
    { id: 'B', team: 'B', monsterId: 494, monsterGrade: 5 },
  ] });
  state.currentIndex = state.order.indexOf('A'); state.fighters.A.pos = { x: 1, y: 5 };
  state.fighters.A2.pos = { x: 3, y: 6 }; state.fighters.B.pos = { x: 4, y: 5 };
  const result = applyAction(state, { type: 'CAST', spell: mel.loadout.spells.custom[1].key, target: { x: 3, y: 5 } });
  assert(!result.events.some(e => e.t === 'invalid'));
  assert(result.state.fighters.A2.hp < state.fighters.A2.hp && result.state.fighters.B.hp < state.fighters.B.hp);
  report.scenarios.push('Empty-cell firewave hits both the nearby enemy and ally; friendly fire is real.');
}
{
  const copy = structuredClone(characters[0].loadout.spells.custom[0]); copy.pa = 1;
  copy.effects[0].min = 149; copy.effects[0].max = 150;
  assert(spellBudgetErrors(copy).length);
  const item = structuredClone(equipment[0]); item.stats.force = 10000;
  assert(!validateCustomEquipment(item).valid);
  report.scenarios.push('A 1 AP / 149–150 damage mutation and a +10,000 stat item remain rejected by the live budget checks.');
}

const seeds = [12101, 12102, 12103, 12104, 12105, 12106, 12107, 12108, 18101, 18102, 18103, 18104];
for (const seed of seeds) {
  const started = Date.now();
  const match = runMatch({ mode: 'custom', dungeon, seed, classes: { A: 'IOP', B: 'IOP' }, collectFrames: false,
    bots: { A: { name: 'IA Maison', decide: maisonDecide }, B: { name: 'IA Maison', decide: maisonDecide } } });
  const invalid = Object.values(match.stats).reduce((n, s) => n + s.invalid, 0), errors = Object.values(match.stats).reduce((n, s) => n + s.errors, 0);
  assert.equal(invalid, 0); assert.equal(errors, 0); assert(['ko', 'turn_limit'].includes(match.endReason));
  assert.equal(Object.keys(match.finalState.fighters).length, 9);
  const result = { seed, endReason: match.endReason, ms: Date.now() - started, winner: match.winner, winnerTeam: match.finalState.fighters[match.winner]?.team || null, rounds: match.turns, invalid, errors,
    heroes: Object.values(match.finalState.fighters).filter(f => f.team === 'A').map(f => ({ name: f.name, hp: f.hp, maxHp: f.maxHp })), stats: match.stats };
  report.matches.push(result); console.log(JSON.stringify({ seed, winner: result.winner, rounds: result.rounds, ms: result.ms }));
}
assert(report.matches.some(m => m.winnerTeam === 'A' && m.endReason === 'ko'), 'The adventure must be demonstrably winnable.');
report.summary = { spellCasts: report.fixtureCasts.length, encounters: report.matches.length,
  heroVictories: report.matches.filter(m => m.winnerTeam === 'A' && m.endReason === 'ko').length,
  turnLimits: report.matches.filter(m => m.endReason === 'turn_limit').length,
  allHeroesSurvive: report.matches.filter(m => m.winnerTeam === 'A' && m.heroes.every(h => h.hp > 0)).length,
  minRounds: Math.min(...report.matches.map(m => m.rounds)), maxRounds: Math.max(...report.matches.map(m => m.rounds)),
  illegalActions: 0, engineErrors: 0 };
fs.writeFileSync(path.join(output, 'combat-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.summary));
