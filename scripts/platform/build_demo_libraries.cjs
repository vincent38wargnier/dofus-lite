const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{inflateRawSync}=require('node:zlib');
const e=require('../../server/generated/runtime.cjs'),lib=require('../../server/generated/library.cjs'),{WorkerPool}=require('../../server/workerPool.cjs'),themes=require('./demo_themes.cjs');
const root=path.resolve('var/demo-libraries');fs.mkdirSync(root,{recursive:true});
const inflate=(bytes,size)=>new Uint8Array(inflateRawSync(bytes,{maxOutputLength:size}));
const report=[];
async function convertThrones(){
 const files=await lib.readContentZip(fs.readFileSync('public/adventures/thrones-eight-memories.zip'),inflate,{limits:e.ATELIER_LIMITS,allowName:e.atelierArchivePath}),manifest=JSON.parse(new TextDecoder().decode(files.get('atelier.json')));
 const equipment=require('../../src/engine/equipmentData.json'),monsters=require('../../src/engine/monsterData.json');
 function walk(o){if(!o||typeof o!=='object')return;if(o.classId)o.classId='CREATOR';
  if(o.referenceId>0&&o.version===1&&o.stats){const model=equipment.items[o.referenceId];assert(model,'Missing equipment reference');o.referenceId=-100000-model.type;}
  if(o.reference?.monsterId&&o.tuning&&o.spells){const m=monsters.monsters[o.reference.monsterId],g=m.grades[o.reference.grade];assert(g,'Missing monster reference');o.base={name:o.name,level:Math.min(200,g.level),baseHp:Math.min(10000,g.baseHp),basePa:g.basePa,basePm:g.basePm,maxSummons:8,stats:{force:0,intelligence:0,chance:0,agilite:0,sagesse:0,vitalite:0,...g.stats},resistances:Object.fromEntries(Object.entries(g.resistances).map(([k,v])=>[k,Math.min(50,v)])),resistancesFixed:g.resistancesFixed||{neutre:0,terre:0,feu:0,eau:0,air:0},spells:{}};o.reference={};assert(e.validCreatureBase(o.base),JSON.stringify(o.base));}
  for(const [k,v] of Object.entries(o)){if(typeof v==='string'&&k!=='id'&&k!=='artworkId')o[k]=v.replace(/\u2014/g,':');else walk(v);}
 }walk(manifest);
 files.set('atelier.json',Buffer.from(JSON.stringify(manifest)));const archive=lib.writeContentZip(files);
 const parsed=await e.prepareAtelierFiles(files,{newId:(()=>{let n=0;return()=>`demo-thrones-${++n}`;})(),verifyPixels:require('../../server/png.cjs').verifyPixels});
 for(const d of parsed.dungeons)assert.deepEqual(e.customDungeonErrors(d),[]);
 return {archive,rooms:parsed.dungeons[0].rooms.length,images:manifest.artwork.length};
}
async function main(){const pool=new WorkerPool({concurrency:1});
 for(let index=0;index<themes.length;index++){const t=themes[index],file=path.join(root,t.key+'.zip');if(t.key==='dofus'){const source=path.resolve('var/private-libraries/dofus-retro.arena-library.zip');assert(fs.existsSync(source));report.push({key:t.key,file:source,bytes:fs.statSync(source).size,completeCatalogue:true});continue;}
  let archive,simulations=[];
  if(t.key==='thrones'){const converted=await convertThrones();archive=converted.archive;}
  else{const {packageWorld}=require('../../examples/worlds-v2/package.cjs'),world=require('../../examples/worlds-v2/worlds.cjs').find(w=>w.key===t.key);const packaged=await packageWorld(world);const validation=await pool.run({type:'validate',file:packaged.file},120000);assert.deepEqual(validation.warnings,[]);report.push({...packaged,counts:validation.counts,arena:validation.arena});console.log(t.key,packaged.bytes,'illustrated campaign');continue;}
  const bytes=Buffer.from(e.wrapLibrary(archive,{name:t.name,description:(t.story||t.tagline)+'\n\nBibliothèque de démonstration. Le profil auteur et les discussions associés sont fictifs. Contenu jouable, à installer uniquement si vous le choisissez.',release:'1.0.0',kind:'adventure'}));fs.writeFileSync(file,bytes);const validation=await pool.run({type:'validate',file},120000);assert.equal(validation.warnings.length,0,JSON.stringify(validation.warnings));report.push({key:t.key,file,bytes:bytes.length,counts:validation.counts,arena:validation.arena,simulations});console.log(t.key,bytes.length,simulations.map(s=>s.winner+':'+s.turns).join(' '));
 }
 fs.writeFileSync(path.join(root,'report.json'),JSON.stringify(report,null,2));fs.writeFileSync('examples/worlds-v2/package-report.json',JSON.stringify(report.filter(r=>!['thrones','dofus'].includes(r.key)),null,2));console.log('All 14 demo libraries prepared.');}
module.exports={convertThrones};
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
