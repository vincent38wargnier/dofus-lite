// Explicit, opt-in demo seed. Never run at boot. No real accounts are invented,
// no fake votes/downloads/results, no login is possible for a demo identity.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const {createStore}=require('../../server/store.cjs'),{WorkerPool}=require('../../server/workerPool.cjs'),themes=require('./demo_themes.cjs');
const conversations=require('./demo_conversations.cjs');
const {refreshDemoText}=require('./refresh_demo_text.cjs');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function dataset(){
 const start=Date.parse('2026-06-01T08:00:00.000Z'),stamp=(day,hour=0)=>new Date(start+day*86400000+hour*3600000).toISOString();
 const nouns=['Biscotte','Myrtille','Navet','Chataigne','Marmotte','Belette','Caramel','Flocon','Pistache','Cactus','Galet','Bambou','Mouette','Cerise','Patate','Ciboulette','Moustache','Tartine','Chardon','Praline'];
 const tails=['DuNord','EnBottes','DuCanape','Tactique','SansPM','DuDimanche','DuBocal','DeMinuit','AuCarre','EnRetard','DesBois','EnCarton','DuGrenier','EnCape','DuQuai'];
 const users=Array.from({length:300},(_,i)=>({id:'demo-player-'+String(i+1).padStart(3,'0'),handle:i<themes.length?themes[i].author:nouns[i%20]+tails[Math.floor(i/20)],password:'demo-login-disabled',recovery:'demo-recovery-disabled',admin:0,isDemo:1,created:stamp(0),bio:['Profil de démonstration. Aime les petites équipes et les combats courts.','Profil de démonstration. Bricole des IA, rate des placements, recommence.','Profil de démonstration. Préfère construire des salles pour ses amis.','Profil de démonstration. Joue surtout le soir, avec le grimoire ouvert.'][i%4]}));
 const topics=[],replies=[];let cursor=14;const next=()=>users[(cursor++)%users.length];
 function add(t,index,round,title,lines,category='general',owner){const day=round===0?14+index*3:round===1?48+index*2:round===2?80+index*2:122+index;
   const at=stamp(day,1),id='demo-topic-'+(t?.key||'general-'+index)+'-'+round,writer=owner||next();
   const record={id,owner:writer.id,library_id:t?'demo-library-'+t.key:null,title,body:lines[0],category,created:at,updated:at,hidden:0,locked:0,isDemo:1};topics.push(record);
   lines.slice(1).forEach((body,j)=>{const respondent=next(),created=stamp(day,2+(j%7)*1.6);replies.push({id:id+'-reply-'+j,topic_id:id,owner:respondent.id,body,created,hidden:0,isDemo:1,reply_to:null});record.updated=created;});
 }
 themes.forEach((t,i)=>{
  conversations.worlds[t.key].forEach(({title,lines},round)=>add(t,i,round,title,lines,['strategy','ai','looking','feedback'][round],round===0?users[i]:undefined));
 });
 conversations.general.forEach(({title,lines},i)=>add(null,i,3,title,lines,['help','help','general','ai','looking','help'][i]));
 // Assign dates preceding each identity's first simulated activity.
 for(const u of users){const own=[...topics,...replies].filter(p=>p.owner===u.id).map(p=>Date.parse(p.created));const themeIndex=themes.findIndex((_,i)=>users[i].id===u.id);if(themeIndex>=0)own.push(Date.parse(stamp(3+themeIndex*3)));const first=Math.min(...own);assert(Number.isFinite(first),'Every demo profile participates');u.created=new Date(Math.max(start,first-86400000*(1+Number(u.id.slice(-3))%8))).toISOString();}
 return {users,topics,replies,stamp};
}
async function seed({store,directory=path.resolve('var/demo-libraries'),includeFiles=true,refreshText=false}={}){
 const data=dataset(),report=JSON.parse(fs.readFileSync(path.join(directory,'report.json'))),pool=new WorkerPool({concurrency:1});await store.ready;
 for(const u of data.users)await store.once('users',{id:u.id},store.kind==='mongodb'?{...u,handleKey:u.handle.toLowerCase()}:u);
 for(let i=0;i<themes.length;i++){const t=themes[i],r=report.find(r=>r.key===t.key),id='demo-library-'+t.key;assert(r&&fs.existsSync(r.file),t.key+' ZIP missing');let record=await store.one('libraries',{id});
  if(!record){const valid=await pool.run({type:'validate',file:r.file},180000);assert.equal(valid.warnings.length,0,JSON.stringify(valid.warnings));const digest=hash(fs.readFileSync(r.file));if(includeFiles&&!await store.hasFile(id)){console.log('Storing demo ZIP:',t.key,Math.round(r.bytes/1048576)+' MiB');await store.putFile(id,r.file);}
   record={id,owner:data.users[i].id,name:t.name,description:valid.metadata.description,release:valid.metadata.release,kind:valid.metadata.kind,sha256:digest,bytes:r.bytes,counts:valid.counts,arena:valid.arena,created:data.stamp(3+i*3),hidden:0,isDemo:1,demoOrder:i,theme:t.key};await store.insert('libraries',record);
  }else{assert.equal(record.isDemo,1,'Refusing to replace real library');if(includeFiles&&!await store.hasFile(record.file_id||id))await store.putFile(record.file_id||id,r.file);}
 }
 for(const t of data.topics)await store.once('topics',{id:t.id},t);
 for(const r of data.replies)await store.once('replies',{id:r.id},r);
 if(refreshText)await refreshDemoText({store,data,apply:true,backupDirectory:path.join(directory,'text-backups')});
 const summary={database:store.db.databaseName||'local',demoProfiles:await store.count('users',{isDemo:1}),demoLibraries:await store.count('libraries',{isDemo:1}),demoTopics:await store.count('topics',{isDemo:1}),demoReplies:await store.count('replies',{isDemo:1}),simulatedDates:{from:'2026-06-01',to:'2026-10-15'},fakeVotes:0,fakeDownloads:0,fakeRankedResults:0};fs.writeFileSync(path.join(directory,'seed-report.json'),JSON.stringify(summary,null,2));return summary;
}
module.exports={dataset,seed};
if(require.main===module){if(fs.existsSync('.env'))process.loadEnvFile('.env');const directory=process.env.DATA_DIR||path.resolve('var/community'),store=createStore({directory});const run=process.argv.includes('--refresh-text')?refreshDemoText({store,data:dataset(),apply:true,backupDirectory:path.join(directory,'demo-text-backups')}):seed({store});run.then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error('Demo seeding failed:',e.name);process.exitCode=1;}).finally(()=>store.close());}
