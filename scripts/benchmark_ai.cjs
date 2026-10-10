// Reproducible, paired evaluation against a frozen source snapshot. Each side's
// own policy ALSO controls its summons, preventing a stronger summon AI from
// silently helping the baseline. No training data is uploaded anywhere.
require('./ai_runtime.cjs');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { Worker, isMainThread, parentPort, workerData } = require('node:worker_threads');
const { createGame, applyAction, getView, currentFighter } = require('../src/engine/engine');
const { createRng, hashSeed } = require('../src/engine/rng');
const { makeBotApi } = require('../src/bots/api');
const { monsterDecide } = require('../src/engine/monsters');
const { CLASS_IDS } = require('../src/engine/classes');
const { emptyLoadout } = require('../src/engine/equipment');
const { dungeonRoster, dungeonMapId } = require('../src/engine/dungeons');
const baseline = path.resolve(process.env.AI_BASELINE || 'local-observations/ai-20261010/baseline/src');
const current = { utility: require('../src/bots/utilityBrain').utilityDecide, maison: require('../src/bots/maison').maisonDecide, api: makeBotApi };
const profileDefaults = { ...require('../src/bots/utilityBrain').DEFAULT_WEIGHTS, ...require('../src/bots/cortexWeights.json') };
const trainedProfiles = require('../src/bots/maisonWeights.json');
const policyHash = crypto.createHash('sha256').update(['src/bots/api.js', 'src/bots/utilityBrain.js', 'src/bots/tactics.js',
  'src/bots/maison.js', 'src/bots/maisonWeights.json', 'src/bots/policyCalibration.json'].map(p => fs.readFileSync(p)).join('\n')).digest('hex');
function blendedProfile(view, blend) {
  const profile = trainedProfiles[view.you.classId] || {};
  const weights = { ...(profile.base || {}), ...(profile.vs?.[view.enemy.classId] || {}) };
  return Object.fromEntries(Object.entries(weights).map(([k, value]) => {
    const fallback = profileDefaults[k] ?? 1; return [k, fallback + (value - fallback) * blend];
  }));
}
const previous = { utility: require(path.join(baseline, 'bots/utilityBrain')).utilityDecide, maison: require(path.join(baseline, 'bots/maison')).maisonDecide,
  api: require(path.join(baseline, 'bots/api')).makeBotApi };

function play(job) {
  const bots = { A: job.newSide === 'A' ? current : previous, B: job.newSide === 'B' ? current : previous };
  if (job.baselineOnly) bots.A = bots.B = previous;
  let { state } = createGame({ mapId: job.mapId, seed: job.seed, fighters: job.fighters });
  const randoms = {}, counts = {}, stats = { decisions: 0, decisionMs: 0, maxDecisionMs: 0, damage: { A: 0, B: 0 },
    summonDamage: { A: 0, B: 0 }, invalid: 0, invalidByPolicy: { current: 0, previous: 0 }, hiddenInvalidByPolicy: { current: 0, previous: 0 },
    invalidExamples: [], errors: 0, forfeits: 0, idle: 0, turns: 0,
    timing: Object.fromEntries(['current', 'previous'].map(p => [p, { decisions: 0, ms: 0, maxMs: 0, over50Ms: 0, over100Ms: 0 }])) };
  let turnKey = '', steps = 0, invalidThisTurn = 0, turnCasts = 0, turnMoves = 0, guard = 0;
  const trace = job.trace ? [] : null;
  const start = performance.now();
  while (!state.over && guard++ < 10000) {
    const actor = currentFighter(state), id = actor.id, policy = bots[actor.team];
    const nextKey = `${state.turn}:${id}`;
    if (turnKey !== nextKey) { turnKey = nextKey; steps = 0; invalidThisTurn = 0; turnCasts = 0; turnMoves = 0; stats.turns++; }
    const rng = randoms[id] ||= createRng(hashSeed(`${job.seed}:${id}`));
    let action, view;
    try {
      const t = performance.now(); view = getView(state, id); const api = policy.api(view, rng);
      action = actor.isMonster ? monsterDecide(view, api, policy.utility)
        : actor.isSummon ? policy.utility(view, api) : policy === current && job.profileBlend !== undefined
          ? policy.utility(view, api, blendedProfile(view, job.profileBlend)) : policy.maison(view, api);
      const elapsed = performance.now() - t;
      stats.decisionMs += elapsed; stats.maxDecisionMs = Math.max(stats.maxDecisionMs, elapsed); stats.decisions++;
      const timing = stats.timing[policy === current ? 'current' : 'previous'];
      timing.decisions++; timing.ms += elapsed; timing.maxMs = Math.max(timing.maxMs, elapsed);
      timing.over50Ms += elapsed > 50; timing.over100Ms += elapsed > 100;
    } catch (error) { stats.errors++; action = { type: 'PASS' }; stats.lastError = error.stack; }
    if (steps >= 25) { stats.forfeits++; action = { type: 'PASS' }; }
    if (action.type === 'PASS' && !turnCasts && !turnMoves) stats.idle++;
    const result = applyAction(state, action); state = result.state;
    if (trace) trace.push({ turn: state.turn, actor: id, action, hp: Object.fromEntries(Object.values(state.fighters).map(f => [f.id, f.hp])), events: result.events });
    if (!result.ok) {
      stats.invalid++; stats.invalidByPolicy[policy === current ? 'current' : 'previous']++;
      const hidden = view?.enemies.some(e => e.hidden);
      if (hidden) stats.hiddenInvalidByPolicy[policy === current ? 'current' : 'previous']++;
      if (stats.invalidExamples.length < 5) stats.invalidExamples.push({ fighter: id, policy: policy === current ? 'current' : 'previous', hidden, turn: state.turn, action, events: result.events });
      if (++invalidThisTurn >= 3) { stats.forfeits++; state = applyAction(state, { type: 'PASS' }).state; }
    } else {
      steps++;
      if (action.type === 'CAST') { turnCasts++; counts[action.spell] = (counts[action.spell] || 0) + 1; }
      if (action.type === 'MOVE') turnMoves++;
    }
    for (const event of result.events) if (event.t === 'damage' && event.amount > 0 && !/Mort de l.invocateur|Fin de Laisse Spirituelle/.test(event.label || '')) {
      const source = state.fighters[event.source], target = state.fighters[event.target];
      if (!source || !target || source.team === target.team) continue;
      stats.damage[source.team] += event.amount;
      if (target.isSummon) stats.summonDamage[source.team] += event.amount;
    }
  }
  const winner = state.fighters[state.winner]?.team || null;
  const hp = Object.fromEntries(['A', 'B'].map(team => [team, Object.values(state.fighters).filter(f => f.team === team && !f.isSummon)
    .reduce((n, f) => n + Math.max(0, f.hp) / f.baseMaxHp, 0)]));
  const cleared = hp.B === 0, playerDead = hp.A === 0;
  // A points victory at the turn limit is not a cleared dungeon.
  const score = job.family === 'duel' ? winner === job.newSide ? 1 : winner ? 0 : .5
    : job.newSide === 'A' ? cleared ? 1 : playerDead ? 0 : .5 : playerDead ? 1 : cleared ? 0 : .5;
  return { ...job, policyHash, winner, score, cleared, playerDead, hp,
    turns: state.turn, reason: state.endReason, elapsedMs: Math.round(performance.now() - start), stats, spells: counts, ...(trace ? { trace } : {}) };
}

function jobsFor(mode, seedBase) {
  if (mode === 'calibrate') return [1, .5, 0].flatMap(profileBlend => jobsFor('duel', seedBase).map(job => ({ ...job,
    id: `${profileBlend}:${job.id}`, profileBlend })));
  const ids = CLASS_IDS || Object.keys(require('../src/engine/classes').CLASSES);
  const maps = ['arene', 'muraille', 'canyon', 'amakna_1571'];
  const jobs = [];
  if (mode === 'duel' || mode === 'smoke') for (let a = 0; a < ids.length; a++) {
    for (let n = 0; n < (mode === 'smoke' ? 2 : ids.length); n++) {
      const b = mode === 'smoke' ? (a + n * 5) % ids.length : n;
      for (const side of ['A', 'B']) {
        const classes = side === 'A' ? [ids[a], ids[b]] : [ids[b], ids[a]];
        jobs.push({ id: `${ids[a]}-${ids[b]}-${side}`, family: 'duel', candidateClass: ids[a], opponentClass: ids[b], newSide: side,
          seed: seedBase + a * 101 + b * 31, mapId: maps[(a + b) % maps.length],
          fighters: classes.map((classId, i) => ({ id: i ? 'B' : 'A', classId })) });
      }
    }
  }
  if (mode === 'dungeon' || mode === 'monsters') for (const [i, bossId] of [147, 173, 289, 478, 827, 85].entries()) {
    for (const classId of ids) for (const baselineOnly of [false, true]) {
      const seed = seedBase + i * 101 + ids.indexOf(classId) * 31;
      // Fixed equipment fixture from an exported combat (combat-31000), with
      // each class's own maximum-level spellbook. No personal browser state.
      const loadout = { ...emptyLoadout(classId), level: 200, slots: { hat: 8267, cape: 8265,
        amulet: 8262, ring1: 8263, ring2: 2469, belt: 8266, boots: 8264, weapon: 2416 } };
      jobs.push({ id: `${classId}-${bossId}-${baselineOnly ? 'old' : 'new'}`, family: mode, candidateClass: classId,
        bossId, newSide: mode === 'monsters' ? 'B' : 'A', baselineOnly, seed, mapId: dungeonMapId(bossId), fighters: [
          { id: 'A', classId, loadout }, ...dungeonRoster(bossId, 1, seed),
        ] });
    }
  }
  return jobs;
}

if (!isMainThread) {
  parentPort.on('message', job => { try { parentPort.postMessage({ result: play(job) }); }
    catch (error) { parentPort.postMessage({ failure: error.stack, job }); } });
} else if (require.main === module) {
  const mode = process.argv[2] || 'smoke';
  const seed = Number(process.env.AI_SEED || 731000);
  const output = path.resolve(process.env.AI_OUTPUT || `local-observations/ai-20261010/${mode}-${seed}`);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const jobs = jobsFor(mode, seed), results = [], failures = [];
  fs.writeFileSync(output + '.jsonl', '');
  const workers = Array.from({ length: Math.min(Number(process.env.AI_WORKERS || 4), os.cpus().length, jobs.length) }, () => new Worker(__filename, { workerData: {} }));
  let index = 0, completed = 0;
  const finish = () => {
    const byClass = {};
    for (const r of results) { const c = byClass[r.candidateClass] ||= { matches: 0, score: 0, wins: 0, losses: 0, draws: 0 };
      c.matches++; c.score += r.score; c.wins += r.score === 1; c.losses += r.score === 0; c.draws += r.score === .5; }
    const byVersion = Object.fromEntries([false, true].map(old => [old ? 'previous' : 'current', {
      matches: results.filter(r => !!r.baselineOnly === old).length,
      wins: results.filter(r => !!r.baselineOnly === old && r.score === 1).length,
      damage: results.filter(r => !!r.baselineOnly === old).reduce((n, r) => n + r.stats.damage[r.newSide], 0),
    }]));
    const calibration = mode === 'calibrate' ? [1, .5, 0].map(blend => {
      const rows = results.filter(r => r.profileBlend === blend);
      const classes = Object.fromEntries([...new Set(rows.map(r => r.candidateClass))].map(c => {
        const subset = rows.filter(r => r.candidateClass === c); return [c, subset.reduce((n, r) => n + r.score, 0) / subset.length];
      }));
      const mean = rows.reduce((n, r) => n + r.score, 0) / rows.length;
      return { blend, matches: rows.length, score: mean, byClass: classes, objective: .8 * mean + .2 * Math.min(...Object.values(classes)) };
    }).sort((a, b) => b.objective - a.objective) : undefined;
    const timing = Object.fromEntries(['current', 'previous'].map(p => {
      const samples = results.map(r => r.stats.timing[p]);
      const decisions = samples.reduce((n, s) => n + s.decisions, 0);
      return [p, { decisions, meanMs: samples.reduce((n, s) => n + s.ms, 0) / Math.max(1, decisions),
        maxMs: Math.max(...samples.map(s => s.maxMs)), over50Ms: samples.reduce((n, s) => n + s.over50Ms, 0), over100Ms: samples.reduce((n, s) => n + s.over100Ms, 0) }];
    }));
    const summary = { mode, seed, policyHash, timing, matches: results.length, failures, calibration, byVersion, wins: results.filter(r => r.score === 1).length,
      losses: results.filter(r => r.score === 0).length, draws: results.filter(r => r.score === .5).length,
      score: results.reduce((n, r) => n + r.score, 0) / results.length,
      invalid: results.reduce((n, r) => n + r.stats.invalid, 0), errors: results.reduce((n, r) => n + r.stats.errors, 0),
      invalidByPolicy: Object.fromEntries(['current', 'previous'].map(p => [p, results.reduce((n, r) => n + r.stats.invalidByPolicy[p], 0)])),
      hiddenInvalidByPolicy: Object.fromEntries(['current', 'previous'].map(p => [p, results.reduce((n, r) => n + r.stats.hiddenInvalidByPolicy[p], 0)])),
      forfeits: results.reduce((n, r) => n + r.stats.forfeits, 0),
      meanDecisionMs: results.reduce((n, r) => n + r.stats.decisionMs, 0) / results.reduce((n, r) => n + r.stats.decisions, 0),
      byClass };
    fs.writeFileSync(output + '.json', JSON.stringify(summary, null, 2));
    console.log(JSON.stringify(summary, null, 2));
    if (failures.length || summary.errors || summary.invalidByPolicy.current > summary.hiddenInvalidByPolicy.current) process.exitCode = 1;
  };
  for (const worker of workers) {
    worker.on('message', message => {
      if (message.result) { results.push(message.result); fs.appendFileSync(output + '.jsonl', JSON.stringify(message.result) + '\n'); }
      else failures.push(message);
      completed++; if (completed % 12 === 0) console.log(`${completed}/${jobs.length} matches`);
      if (index < jobs.length) worker.postMessage(jobs[index++]); else worker.terminate();
      if (completed === jobs.length) finish();
    });
    worker.on('error', error => { console.error(error); process.exitCode = 1; });
    worker.postMessage(jobs[index++]);
  }
}
module.exports = { play, jobsFor };
