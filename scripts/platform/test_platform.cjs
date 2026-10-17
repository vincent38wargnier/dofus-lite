const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createApp}=require('../../server/app.cjs'),{WorkerPool}=require('../../server/workerPool.cjs'),{sandboxBot}=require('../../server/sandbox.cjs');
const engine=require('../../server/generated/runtime.cjs');
const mongo=process.env.TEST_MONGO==='1',prefix='proof_platform_'+Date.now()+'_';if(mongo)process.loadEnvFile('.env');
let service,store,server,base,db,dir,clock='2026-10-15T12:00:00.000Z',a,b,library,bytes,botA,botB,match;
const origin='http://127.0.0.1:3198';
async function request(url,{who,body,method=body?'POST':'GET',headers={}}={}){const response=await fetch(base+url,{method,headers:{Origin:origin,...(who?{Cookie:who.cookie,'X-CSRF-Token':who.csrf}:{}),...(body?{'Content-Type':Buffer.isBuffer(body)?'application/zip':'application/json'}:{}),...headers},body:body?Buffer.isBuffer(body)?body:JSON.stringify(body):undefined});const type=response.headers.get('content-type');return {status:response.status,data:type?.includes('json')?await response.json():Buffer.from(await response.arrayBuffer()),cookie:response.headers.get('set-cookie'),headers:response.headers};}
async function account(handle){const r=await request('/api/auth/register',{body:{handle,password:'a-very-long-test-password'}});assert.equal(r.status,201,JSON.stringify(r.data));return {...r.data,cookie:r.cookie.split(';')[0]};}
before(async()=>{dir=fs.mkdtempSync(path.join(os.tmpdir(),'arena-platform-test-'));service=createApp({directory:dir,origin,clock:()=>clock,uri:mongo?process.env.MONGODB_URI:'',prefix});store=service.store;await service.ready;db=service.db;server=service.app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base='http://127.0.0.1:'+server.address().port;
 const spell=engine.newAuthoredSpell();spell.name='Lueur du prisme';const character={id:'hero',name:'Veilleur',classId:'CREATOR',loadout:{...engine.emptyLoadout('CREATOR'),level:200,artworkId:engine.characterShapeId(),spells:{custom:[spell],order:[]}}};
 const archive=await engine.buildAtelierArchive({characters:[character]});bytes=Buffer.from(engine.wrapLibrary(archive.bytes,{name:'Univers original de test',description:'Un laboratoire original pour vérifier les imports et les matchs.',release:'1.0.0',kind:'characters'}));
});
after(async()=>{await new Promise(r=>server.close(r));if(mongo)for(const c of await db.listCollections({},{nameOnly:true}).toArray())if(c.name.startsWith(prefix))await db.collection(c.name).drop();await service.close();fs.rmSync(dir,{recursive:true,force:true});});
test('fresh engine and community contain no themed catalogue or seeded publication',async()=>{assert.deepEqual(engine.CLASS_IDS,['CREATOR']);assert.equal(Object.keys(engine.ITEMS).length,0);assert.deepEqual((await request('/api/libraries')).data.libraries,[]);assert.deepEqual((await request('/api/leaderboard')).data.entries,[]);});
test('anonymous users can read but cannot publish',async()=>{assert.equal((await request('/api/libraries',{body:bytes})).status,401);assert.equal((await request('/api/topics')).status,200);});
test('accounts have private sessions, hashed credentials and recovery keys',async()=>{a=await account('maker_one');b=await account('maker_two');assert.equal(a.recovery.length,48);const saved=await store.one('users',{id:a.user.id});assert.ok(!saved.password.includes('a-very'));assert.notEqual(saved.recovery,a.recovery);assert.equal((await request('/api/auth/me',{who:a})).data.user.id,a.user.id);assert.equal((await request('/api/auth/login',{body:{handle:'maker_one',password:'wrong'}})).status,401);});
test('cross-origin and missing CSRF writes are rejected',async()=>{assert.equal((await request('/api/topics',{who:a,body:{title:'Test',body:'Text'},headers:{Origin:'https://evil.example'}})).status,403);assert.equal((await request('/api/topics',{who:a,body:{title:'Test',body:'Text'},headers:{'X-CSRF-Token':''}})).status,403);});
test('publication validates package on server and does not trust claimed metadata',async()=>{const r=await request('/api/libraries',{who:a,body:bytes,headers:{'X-Publication-Rights':'confirmed'}});assert.equal(r.status,201,JSON.stringify(r.data));library=r.data;assert.equal(library.counts.characters,1);assert.equal(library.arena.length,1);assert.equal(library.author,'maker_one');assert.equal((await request('/api/libraries',{who:a,body:bytes,headers:{'X-Publication-Rights':'confirmed'}})).status,409);});
test('corrupt archive is rejected without a database row',async()=>{const malformed=Buffer.from(bytes);malformed[80]^=1;const before=await store.count('libraries');assert.equal((await request('/api/libraries',{who:b,body:malformed,headers:{'X-Publication-Rights':'confirmed'}})).status,400);assert.equal(await store.count('libraries'),before);});
test('public download is byte identical and daily duplicate downloads do not inflate counts',async()=>{const r=await request('/api/libraries/'+library.id+'/download',{who:b});assert.equal(r.status,200);assert.deepEqual(r.data,bytes);await request('/api/libraries/'+library.id+'/download',{who:b});assert.equal((await request('/api/libraries/'+library.id)).data.downloads,1);});
test('authors cannot upvote themselves; each visitor has one reversible vote',async()=>{assert.equal((await request('/api/libraries/'+library.id+'/like',{who:a,method:'POST'})).status,400);assert.equal((await request('/api/libraries/'+library.id+'/like',{who:b,method:'POST'})).data.likes,1);assert.equal((await request('/api/libraries/'+library.id+'/like',{who:b,method:'POST'})).data.likes,0);});
test('library comments and general discussions persist as plain text',async()=>{const t=await request('/api/topics',{who:b,body:{libraryId:library.id,title:'Une idée de stratégie',body:'<script>window.attack=true</script>'}});assert.equal(t.status,201);assert.equal((await request('/api/topics/'+t.data.id+'/replies',{who:a,body:{body:'Merci, testons cette idée.'}})).status,201);const thread=(await request('/api/topics/'+t.data.id)).data;assert.equal(thread.replies.length,1);assert.equal(thread.body,'<script>window.attack=true</script>');assert.equal((await request('/api/topics')).data.topics.length,0);assert.equal((await request('/api/topics?library='+library.id)).data.topics.length,1);});
test('sandbox cannot reach Node, host globals, files or the network',async()=>{const bot=await sandboxBot('function decide(){return {type:"SAY",text:[typeof process,typeof require,typeof fetch,typeof window,typeof document].join(",")};}');try{assert.equal(bot.decide({},{ }).text,'undefined,undefined,undefined,undefined,undefined');}finally{bot.close();}});
test('infinite loops terminate inside sandbox',async()=>{await assert.rejects(()=>sandboxBot('while(true){};function decide(){return {type:"PASS"};}'),/interrupted/i);});
test('JSON bridge does not leak host constructors or prototypes',async()=>{const bot=await sandboxBot('function decide(v,api){return {type:"SAY",text:api.endTurn.constructor("return typeof process")()};}');try{assert.equal(bot.decide({},{endTurn:()=>({type:'PASS'})}).text,'undefined');}finally{bot.close();}});
test('public AIs are immutable, private-source versions associated with a fixed character',async()=>{const ra=await request('/api/bots',{who:a,body:{libraryId:library.id,fighter:0,name:'Lumière',code:'function decide(v,api){return api.maison();}'}}),rb=await request('/api/bots',{who:b,body:{libraryId:library.id,fighter:0,name:'Repos',code:'function decide(v,api){return api.endTurn();}'}});assert.equal(ra.status,201,JSON.stringify(ra.data));assert.equal(rb.status,201);botA=ra.data.id;botB=rb.data.id;const listed=(await request('/api/bots?library='+library.id)).data.bots;assert.equal(listed.length,2);assert.ok(listed.every(bot=>!bot.code&&bot.sha256.length===64));});
test('a player cannot submit results or challenge using someone else’s AI',async()=>{assert.equal((await request('/api/matches',{who:b,body:{a:botA,b:botB,winner:botA}})).status,403);assert.equal((await request('/api/matches/fake',{who:a,method:'POST',body:{winner:botA}})).status,404);});
test('server plays four mirrored matches and publishes real legal actions',async()=>{const r=await request('/api/matches',{who:a,body:{a:botA,b:botB}});assert.equal(r.status,202,JSON.stringify(r.data));for(let i=0;i<120;i++){match=(await request('/api/matches/'+r.data.id)).data;if(match.status!=='running')break;await new Promise(r=>setTimeout(r,50));}assert.equal(match.status,'complete',JSON.stringify(match));assert.equal(match.result.games.length,4);for(const g of match.result.games){assert.equal(g.winner,botA);assert.ok(g.turns>0);assert.ok(g.events.some(e=>e.t==='damage'));assert.ok(Object.values(g.stats).every(s=>s.invalid===0&&s.errors===0));}});
test('repeat farming and self matches do not enter rankings',async()=>{assert.equal((await request('/api/matches',{who:a,body:{a:botA,b:botB}})).status,409);assert.equal((await request('/api/matches',{who:a,body:{a:botA,b:botA}})).status,400);});
test('daily, monthly and yearly leaderboards use completion times in UTC',async()=>{for(const period of ['day','month','year']){const data=(await request('/api/leaderboard?period='+period+'&library='+library.id)).data;assert.equal(data.entries[0].points,12);assert.equal(data.entries[0].wins,4);assert.equal(data.timezone,'UTC');}clock='2026-10-16T12:00:00.000Z';assert.equal((await request('/api/leaderboard?period=day')).data.entries.length,0);assert.equal((await request('/api/leaderboard?period=month')).data.entries.length,2);clock='2026-11-01T12:00:00.000Z';assert.equal((await request('/api/leaderboard?period=month')).data.entries.length,0);assert.equal((await request('/api/leaderboard?period=year')).data.entries.length,2);clock='2027-01-01T12:00:00.000Z';assert.equal((await request('/api/leaderboard?period=year')).data.entries.length,0);});
test('historical rankings use a bounded UTC period',async()=>{const result=await request('/api/leaderboard?period=day&at=2026-10-15');assert.equal(result.data.entries[0].wins,4);assert.equal(result.data.until,'2026-10-16T00:00:00.000Z');assert.equal((await request('/api/leaderboard?at=2026-02-30')).status,400);});
test('reporting and authorized moderation remove discovery, downloads and ranking',async()=>{assert.equal((await request('/api/moderation',{who:b})).status,403);assert.equal((await request('/api/reports',{who:b,body:{kind:'library',target:library.id,reason:'Une demande de vérification de publication.'}})).status,201);await store.update('users',{id:a.user.id},{admin:1});const report=(await request('/api/moderation',{who:a})).data.reports[0];assert.equal((await request('/api/moderation/'+report.id,{who:a,body:{action:'remove'}})).status,200);assert.equal((await request('/api/libraries/'+library.id+'/download')).status,404);assert.equal((await request('/api/libraries')).data.libraries.length,0);});
test('account recovery rotates secrets and invalidates old sessions',async()=>{const r=await request('/api/auth/recover',{body:{handle:'maker_two',recovery:b.recovery,password:'a-new-long-test-password'}});assert.equal(r.status,200);assert.notEqual(r.data.recovery,b.recovery);assert.equal((await request('/api/auth/me',{who:b})).data.user,null);assert.equal((await request('/api/auth/recover',{body:{handle:'maker_two',recovery:b.recovery,password:'another-new-long-password'}})).status,400);});
test('source code, original libraries and private database are not served',async()=>{for(const url of ['/server/app.cjs','/src/App.js','/var/community/community.sqlite','/dofus-local/manifest.json','/adventures/winterfell-adventure.zip','/templates/custom-class-authoring-kit.zip','/templates/ai-coding/runtime.cjs'])assert.equal((await request(url)).status,404,url);});

test('original adventure validates its standalone creatures, equipment and four PNGs',async()=>{
 const {fixture}=require('./fixture.cjs'),f=await fixture();
 const result=await new WorkerPool().run({type:'validate',bytes:f.bytes});
 assert.equal(result.counts.dungeons,1);assert.equal(result.counts.images,2);assert.equal(result.arena.length,1);
 assert.deepEqual(engine.customDungeonErrors(f.room),[]);
 assert.ok(engine.validateCustomEquipment(f.item).valid);
 const {state}=engine.createGame({mapId:f.room.mapId,battlefield:f.room.battlefield,fighters:[{...f.character,id:'A',team:'A'},...engine.customDungeonRoster(f.room)]});
 assert.ok(Number.isFinite(state.fighters.B.initiative));assert.equal(state.fighters.B.permanent.dodgePa,12);
 const bot=await sandboxBot('function decide(v,a){return a.maison();}');
 try{const match=engine.runMatch({mode:'custom',dungeon:f.room,classes:{A:'CREATOR'},bots:{A:{name:'Test',decide:bot.decide}},seed:8,collectFrames:false});
 assert.equal(match.winner,'A');assert.ok(match.turns<=10);assert.ok(Object.values(match.stats).every(s=>s.invalid===0&&s.errors===0));}finally{bot.close();}

});
test('PNG validation rejects corrupt pixels, blank frames, wrong sizes and opaque character frames',async()=>{
 const {verifyPixels}=require('../../server/png.cjs'),{png}=require('./fixture.cjs');
 const spec={frames:1,frameSize:256,pose:'static'};
 await verifyPixels(new File([png(256,256,[1,2,3],true)],'idle-front.png'),spec);
 await assert.rejects(()=>verifyPixels(new File([png(256,256,[1,2,3])],'idle-front.png'),spec),/transparent/);
 await assert.rejects(()=>verifyPixels(new File([png(64,64,[1,2,3])],'idle-front.png'),spec),/dimensions/);
 const corrupt=Buffer.from(png(256,256,[1,2,3],true));corrupt[corrupt.length-20]^=123;
 await assert.rejects(()=>verifyPixels(new File([corrupt],'idle-front.png'),spec));
});
test('catalog conflicts are rejected and imports cannot replace balance rules',async()=>{
 const {mergeCatalogues}=require('../../server/generated/library.cjs');
 const source=mergeCatalogues([]);delete source.forgemagieData;
 source.classData.names.FREE='Original scholar';source.classData.builds.FREE=source.classData.builds.CREATOR;
 source.spellLibrary.classes.FREE=[];source.equipmentData.caps.FREE=source.equipmentData.caps.CREATOR;
 const merged=mergeCatalogues([{catalogue:source}]);assert.equal(merged.classData.names.FREE,'Original scholar');
 assert.equal(Object.keys(merged.equipmentData.items).length,0);
 const conflicting=structuredClone(source);conflicting.classData.names.FREE='Different scholar';
 assert.throws(()=>mergeCatalogues([{catalogue:source},{catalogue:conflicting}]),/conflit/);
 const bad=engine.wrapLibrary(null,{name:'Invalid override'}, {...source,forgemagieData:{stats:{}}});
 await assert.rejects(()=>new WorkerPool().run({type:'validate',bytes:bad}),/Champ de catalogue/);
});
test('catalogue reagents round-trip while numeric balance rules stay fixed',async()=>{
 const {mergeCatalogues,readLibrary}=require('../../server/generated/library.cjs');
 const catalogue=mergeCatalogues([]),rules=catalogue.forgemagieData;delete catalogue.forgemagieData;
 catalogue.forging={runes:[...rules.runes,{id:800001,name:'Prisme de sagesse',power:3,type:78,gfx:0,supported:true,stat:'sagesse'}],potions:[{id:800002,name:'Teinture de braise',type:26,gfx:0,element:'feu',effect:99,level:50,ratio:85}],nonMageableIds:[]};
 const zip=engine.wrapLibrary(null,{name:'Réactifs originaux',kind:'catalogue'},catalogue);
 const parsed=await readLibrary(zip),merged=mergeCatalogues([parsed]);
 assert.equal(merged.forgemagieData.runes.find(r=>r.id===800001).power,3);
 assert.equal(merged.forgemagieData.potions[0].ratio,85);assert.deepEqual(merged.forgemagieData.stats,rules.stats);
 await new WorkerPool().run({type:'validate',bytes:zip});
 catalogue.forging.runes.at(-1).stat='unknown';
 await assert.rejects(()=>readLibrary(engine.wrapLibrary(null,{name:'Invalid reagents'},catalogue)),/Réactifs/);
});
test('a catalogue class can compete without an authored character snapshot',async()=>{
 const {mergeCatalogues}=require('../../server/generated/library.cjs'),catalogue=mergeCatalogues([]);delete catalogue.forgemagieData;
 catalogue.classData.names.SCHOLAR='Érudit des prismes';catalogue.classData.builds.SCHOLAR=catalogue.classData.builds.CREATOR;
 catalogue.equipmentData.caps.SCHOLAR=catalogue.equipmentData.caps.CREATOR;
 const spell=engine.newAuthoredSpell();catalogue.spellLibrary.classes.SCHOLAR=[spell.id];
 catalogue.spellLibrary.spells[spell.id]={name:'Trait du prisme',grades:[spell],auditNotes:[]};
 const bytes=engine.wrapLibrary(null,{name:'Les érudits',kind:'catalogue'},catalogue),pool=new WorkerPool();
 const valid=await pool.run({type:'validate',bytes});assert.equal(valid.arena.length,1);assert.equal(valid.arena[0].name,'Érudit des prismes');assert.equal(valid.arena[0].spells,1);
 const result=await pool.run({type:'match',bytes,fighter:0,seed:21,a:{id:'a',name:'Planner',code:'function decide(v,a){return a.maison();}'},b:{id:'b',name:'Pass',code:'function decide(v,a){return a.endTurn();}'}},120000);
 assert.equal(result.games.length,4);assert.ok(result.games.every(g=>g.winner==='a'));
});
test('expanded Maison runs in the same sandbox with real pipeline stages and diagnostics',async()=>{
 const spell=engine.newAuthoredSpell(),loadout={...engine.emptyLoadout('CREATOR'),level:200,spells:{custom:[spell],order:[]}};
 const {state}=engine.createGame({mapId:'arene',seed:7,fighters:[{id:'A',classId:'CREATOR',loadout},{id:'B',classId:'CREATOR',loadout}]}),view=engine.getView(state,'A');
 const bot=await sandboxBot(engine.flowToCode(engine.makeMaisonFlow()));
 const api=engine.makeBotApi(view,engine.createRng(7)),steps=[],plans=[];api.flowTrace=s=>steps.push(s);api.flowInspect=p=>plans.push(p);
 try{const action=bot.decide(view,api);assert.ok(['CAST','MOVE','PASS'].includes(action.type));assert.ok(steps.length>=7);assert.equal(plans.length,1);}finally{bot.close();}
});
test('sandbox clock is deterministic and decision loops stop without blocking the referee',async()=>{
 const bot=await sandboxBot('function decide(){return {type:"SAY",text:String(new Date().getTime())+":"+Date.now()};}');
 try{assert.equal(bot.decide({},{}).text,'0:0');}finally{bot.close();}
 const loop=await sandboxBot('function decide(){while(true){};}');
 try{assert.throws(()=>loop.decide({},{}),/interrupted/);}finally{loop.close();}
});
test('server database survives restart without adding default data',async()=>{
 const {openDatabase}=require('../../server/db.cjs');const temp=fs.mkdtempSync(path.join(os.tmpdir(),'af-persist-'));
 try{let db=openDatabase(temp);db.prepare('INSERT INTO users(id,handle,password,recovery,created,admin) VALUES(?,?,?,?,?,0)').run('test','persisted','hash','key','2026-10-15');db.close();db=openDatabase(temp);assert.equal(db.prepare('SELECT count(*) n FROM users').get().n,1);assert.equal(db.prepare('SELECT count(*) n FROM libraries').get().n,0);db.close();}finally{fs.rmSync(temp,{recursive:true,force:true});}
});
