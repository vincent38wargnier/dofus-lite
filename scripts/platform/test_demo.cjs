const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{dataset}=require('./seed_demo_community.cjs'),themes=require('./demo_themes.cjs');
const data=dataset();
test('300 invented identities are labelled, unloginable, unique and active',()=>{assert.equal(data.users.length,300);assert.equal(new Set(data.users.map(u=>u.handle.toLowerCase())).size,300);const active=new Set([...data.topics,...data.replies].map(p=>p.owner));for(const u of data.users){assert.equal(u.isDemo,1);assert.equal(u.admin,0);assert.equal(u.password,'demo-login-disabled');assert(active.has(u.id));}});
test('every conversation is labelled, dated after its participants joined and before cutoff',()=>{const users=new Map(data.users.map(u=>[u.id,u])),topics=new Map(data.topics.map(t=>[t.id,t]));for(const p of [...data.topics,...data.replies]){assert.equal(p.isDemo,1);assert(p.created>=users.get(p.owner).created);assert(p.created<'2026-10-16');assert(p.created>='2026-06-01');if(p.topic_id)assert(p.created>=topics.get(p.topic_id).created);}assert.equal(new Set([...data.topics,...data.replies].map(p=>p.body)).size,419);assert.ok(!JSON.stringify(data).includes('\u2014'));assert.equal(data.topics.length,62);assert.equal(data.replies.length,357);});
test('14 themes with Game of Thrones first and Dofus in the middle have real packages',()=>{assert.equal(themes.length,14);assert.equal(themes[0].key,'thrones');assert.equal(themes[7].key,'dofus');const report=JSON.parse(fs.readFileSync('var/demo-libraries/report.json'));for(const t of themes){const r=report.find(r=>r.key===t.key);assert(r,t.key);assert.equal(fs.statSync(r.file).size,r.bytes);assert.equal(data.topics.filter(p=>p.library_id==='demo-library-'+t.key).length,4);}});
test('the twelve illustrated campaigns have complete teams, three rooms and validated budgets',()=>{
 const report=JSON.parse(fs.readFileSync('examples/worlds-v2/package-report.json'));assert.equal(report.length,12);
 for(const r of report){assert.equal(r.counts.characters,3);assert.equal(r.counts.rooms,3);assert.equal(r.counts.equipment,24);assert.equal(r.counts.spells,42);assert(r.images>=34);assert.equal(fs.statSync(r.file).size,r.bytes);}
});
test('held-out combat trials check pacing, survival and legal actions in all 36 rooms',()=>{
 const report=JSON.parse(fs.readFileSync('examples/worlds-v2/validation-combats.json'));assert.equal(report.length,144);
 for(const r of report){assert.equal(r.invalid,0);assert.equal(r.endReason,'ko');assert.equal(r.winner,'A');assert(r.turns<=12);if(r.room===1)assert(r.turns<=4);assert(r.hpRemaining>0);}
 assert.equal(new Set(report.map(r=>r.world)).size,12);
});
test('converted standalone Thrones campaign completed its eight rooms',()=>{const report=JSON.parse(fs.readFileSync('var/demo-libraries/thrones-combat-report.json'));assert.equal(report.length,8);assert(report.every(r=>r.winner==='A'&&r.invalid===0));});
