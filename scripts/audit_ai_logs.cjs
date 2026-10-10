// Read-only audit of exported fights. Historical events are observations, not
// a claim that the original state can be replayed under today's engine rules.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const directory = process.argv[2] || path.join(os.homedir(), 'Downloads');
const output = process.argv[3] || path.resolve('local-observations/ai-20261010/log-audit.json');
const increment = (object, key, n = 1) => { object[key] = (object[key] || 0) + n; };
const report = { files: 0, unique: 0, duplicates: 0, unreadable: [], rulesVersions: {}, events: {}, fights: [],
  actors: {}, notes: [
    'Only exported fights available on disk are included. The app did not automatically archive every fight.',
    'Damage to summons while their owner is alive is not necessarily a mistake: reach, blocking and danger matter.',
    'Older rule versions and scripted browser checks are retained and labelled; they are not training labels.',
  ] };
const seen = new Set();
for (const file of fs.readdirSync(directory).filter(name => /^combat-.*\.json$/.test(name)).sort()) {
  report.files++;
  const raw = fs.readFileSync(path.join(directory, file));
  const digest = crypto.createHash('sha256').update(raw).digest('hex');
  if (seen.has(digest)) { report.duplicates++; continue; }
  seen.add(digest);
  let fight;
  try { fight = JSON.parse(raw); } catch (error) { report.unreadable.push({ file, reason: error.message }); continue; }
  report.unique++;
  const state = fight.state || fight.finalState || {}, fighters = state.fighters || {};
  const events = fight.events || [], dead = new Set();
  const summary = { file, sha256: digest, rulesVersion: fight.rulesVersion ?? state.rulesVersion,
    seed: fight.seed ?? fight.config?.seed, mapId: fight.mapId || fight.config?.mapId,
    events: events.length, casts: 0, summons: 0, damage: 0, summonDamage: 0, ownerAliveSummonDamage: 0,
    errors: 0, forfeits: 0, turns: 0, idleTurns: 0 };
  increment(report.rulesVersions, summary.rulesVersion || 'unknown');
  let turn;
  for (const event of events) {
    increment(report.events, event.t);
    if (event.t === 'turn_start') { turn = { fighter: event.fighter, casts: 0, moves: 0 }; summary.turns++; }
    if (event.t === 'turn_end' && turn?.fighter === event.fighter && !turn.casts && !turn.moves) summary.idleTurns++;
    if (event.t === 'cast') { summary.casts++; if (turn) turn.casts++; }
    if (event.t === 'move' && turn) turn.moves++;
    if (event.t === 'summon_add') { summary.summons++; dead.delete(event.id); }
    if (event.t === 'death') dead.add(event.fighter);
    if (event.t === 'bot_error' || event.t === 'invalid') summary.errors++;
    if (event.t === 'forfeit_turn') summary.forfeits++;
    if (event.t !== 'damage' || !event.amount || /Mort de l.invocateur|Fin de Laisse Spirituelle/.test(event.label || '')) continue;
    const source = fighters[event.source], target = fighters[event.target];
    if (!source || !target || source.team === target.team) continue;
    const kind = source.isMonster ? 'monster' : source.isSummon ? 'summon' : /Vous/.test(source.name) ? 'human' : 'character';
    const actorKey = `${kind}:${source.monsterId || source.classId || source.id}`;
    const actor = report.actors[actorKey] ||= { kind, name: source.name, damage: 0, hits: 0, summonDamage: 0, ownerAliveSummonHits: 0 };
    summary.damage += event.amount; actor.damage += event.amount; actor.hits++;
    if (target.isSummon) {
      summary.summonDamage += event.amount; actor.summonDamage += event.amount;
      if (target.ownerId && !dead.has(target.ownerId)) { summary.ownerAliveSummonDamage += event.amount; actor.ownerAliveSummonHits++; }
    }
  }
  report.fights.push(summary);
}
report.totals = {};
for (const f of report.fights) for (const k of ['events', 'casts', 'summons', 'damage', 'summonDamage', 'ownerAliveSummonDamage', 'errors', 'forfeits', 'turns', 'idleTurns']) increment(report.totals, k, f[k]);
fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ...report, fights: report.fights.filter(f => f.summons).map(({ file, rulesVersion, casts, summonDamage, ownerAliveSummonDamage }) => ({ file, rulesVersion, casts, summonDamage, ownerAliveSummonDamage })) }, null, 2));
