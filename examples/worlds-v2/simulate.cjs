const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {build,worlds}=require('./build.cjs'),e=require('../../server/generated/runtime.cjs');
const chosen=process.argv.includes('--all')?worlds:worlds.filter(w=>[process.argv[2]||'potter'].includes(w.key));
const seeds=process.argv.includes('--validation')?[211,397,809,1297]:[19,41];
const report=[];
for(const w of chosen){const {dungeon}=build(w);for(let roomIndex=0;roomIndex<3;roomIndex++)for(const seed of seeds){const t=Date.now();const r=e.runMatch({mode:'custom',dungeon,roomIndex,classes:{A:'CREATOR'},bots:{A:{name:'Maison',decide:(_v,api)=>api.maison()}},seed,collectFrames:false,maxRounds:25});
 const stats=Object.values(r.stats),heroes=Object.values(r.finalState.fighters).filter(f=>f.team==='A'&&!f.isSummon),row={world:w.key,room:roomIndex+1,seed,winner:r.finalState.fighters[r.winner]?.team||null,endReason:r.endReason,turns:r.turns,survivors:heroes.filter(f=>f.hp>0).length,hpRemaining:heroes.reduce((n,f)=>n+Math.max(0,f.hp),0),invalid:stats.reduce((s,x)=>s+x.invalid+x.errors,0),actions:stats.reduce((s,x)=>s+x.actions,0),milliseconds:Date.now()-t};assert.equal(row.invalid,0,JSON.stringify(row));report.push(row);console.log(JSON.stringify(row));}}
fs.writeFileSync(path.join(__dirname,process.argv.includes('--validation')?'validation-combats.json':'calibration-combats.json'),JSON.stringify(report,null,2));
