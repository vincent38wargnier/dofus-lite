// Smoke every imported monster with the real engine, including custom rooms.
require('./ai_runtime.cjs');
const fs = require('node:fs');
const { createGame, getView, applyAction, currentFighter } = require('../src/engine/engine');
const { createRng } = require('../src/engine/rng');
const { makeBotApi } = require('../src/bots/api');
const { utilityDecide } = require('../src/bots/utilityBrain');
const { monsterDecide } = require('../src/engine/monsters');
const catalogue = require('../src/engine/monsterData.json').monsters;
const report = { monsters: 0, scenarios: 0, decisions: 0, invalid: [], errors: [], casts: {}, decisionMs: 0, maxDecisionMs: 0 };
for (const [id, monster] of Object.entries(catalogue)) {
  report.monsters++;
  for (const distance of [1, 4, 9]) {
    report.scenarios++; const rng = createRng(519 + Number(id));
    try {
      let { state } = createGame({ mapId: 'arene', seed: Number(id), fighters: [
        { id: 'A', monsterId: Number(id), monsterGrade: Number(Object.keys(monster.grades).at(-1)) },
        { id: 'B', classId: 'SADIDA' }, { id: 'S', team: 'B', monsterId: 52, monsterGrade: 1 },
      ] });
      state.currentIndex = state.order.indexOf('A'); state.board.obstacles = {};
      state.fighters.A.pos = { x: 2, y: 3 }; state.fighters.A.hp = Math.ceil(state.fighters.A.hp * .6);
      state.fighters.A.pa = state.fighters.A.basePa; state.fighters.A.pm = state.fighters.A.basePm;
      state.fighters.B.pos = { x: 2 + distance, y: 3 };
      Object.assign(state.fighters.S, { pos: { x: 2, y: 5 }, ownerId: 'B', isSummon: true, leader: false });
      for (let step = 0; step < 8 && !state.over && currentFighter(state).id === 'A'; step++) {
        const view = getView(state, 'A'), api = makeBotApi(view, rng), t = performance.now();
        const action = monsterDecide(view, api, utilityDecide), elapsed = performance.now() - t;
        report.decisions++; report.decisionMs += elapsed; report.maxDecisionMs = Math.max(report.maxDecisionMs, elapsed);
        const result = applyAction(state, action);
        if (!result.ok) { report.invalid.push({ id, name: monster.name, distance, action, events: result.events }); break; }
        if (action.type === 'CAST') report.casts[action.spell] = (report.casts[action.spell] || 0) + 1;
        state = result.state;
        if (action.type === 'PASS') break;
      }
    } catch (error) { report.errors.push({ id, name: monster.name, distance, error: error.stack }); }
  }
}
report.meanDecisionMs = report.decisionMs / report.decisions;
const output = process.env.AI_OUTPUT || 'local-observations/ai-20261010/catalogue.json';
fs.writeFileSync(output, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ...report, casts: Object.keys(report.casts).length }, null, 2));
if (report.errors.length || report.invalid.length) process.exitCode = 1;
