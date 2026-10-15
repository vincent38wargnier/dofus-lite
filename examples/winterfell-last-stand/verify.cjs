const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { build } = require('./definition.cjs');
const { runMatchAsync } = require('../../src/arena/runner');
const { maisonDecide } = require('../../src/bots/maison');
const { validCreations } = require('../../src/ui/creationsStore');
const { dungeon, characters } = build();
assert(validCreations({ version: 1, characters, dungeons: [dungeon] }));
const output = path.resolve(__dirname, '../../public/adventures/winterfell-last-stand');
const report = { matches: [], scope: 'Seeded simulations of the real 6 vs 32 encounter. Static budgets are not competitive balance certification.' };
(async () => {
  for (const seed of (process.env.ARMY_SEEDS || '25101,25102,25103,25104').split(',').map(Number)) {
    const started = Date.now(); let last = 0, slowest = 0, decisions = 0;
    const decide = (view, api) => { const t = performance.now(); const action = maisonDecide(view, api); slowest = Math.max(slowest, performance.now()-t); decisions++; return action; };
    const match = await runMatchAsync({ mode: 'custom', dungeon, seed, classes: { A: 'IOP', B: 'IOP' }, collectFrames: false,
      bots: { A: { name: 'IA Maison', decide }, B: { name: 'IA Maison', decide } } }, { onProgress: p => {
        if (Date.now()-last > 15000) { console.log(JSON.stringify({ seed, turn:p.turn, elapsed:Date.now()-started })); last=Date.now(); }
    } });
    const invalid = Object.values(match.stats).reduce((n,s)=>n+s.invalid,0), errors = Object.values(match.stats).reduce((n,s)=>n+s.errors,0);
    assert.equal(invalid,0);assert.equal(errors,0);assert(['ko','turn_limit'].includes(match.endReason));
    assert.equal(Object.keys(match.finalState.fighters).length,38);
    const r={ seed, ms:Date.now()-started, turns:match.turns, winner:match.finalState.fighters[match.winner]?.team,
      reason:match.endReason, survivors:Object.values(match.finalState.fighters).filter(f=>f.hp>0&&f.team==='A').map(f=>({name:f.name,hp:f.hp})),
      bossHp:match.finalState.fighters.B.hp, collapses:match.events?.filter(e=>e.t==='damage'&&e.label==='Chute du commandant').length,
      slowestHeroDecisionMs:Math.round(slowest), decisions, invalid, errors };
    report.matches.push(r);console.log(JSON.stringify(r));
    fs.writeFileSync(path.join(output,'combat-report.json'),JSON.stringify(report,null,2));
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
