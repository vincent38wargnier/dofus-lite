// Explicit maintenance command, never run at startup. Preserve community history
// and old ZIPs. A validated immutable file is installed before its row is switched.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const {createStore}=require('../../server/store.cjs'),{WorkerPool}=require('../../server/workerPool.cjs');
async function upgrade({store,apply=false,directory=path.resolve('var/demo-libraries')}={}){
  await store.ready;
  const releases=JSON.parse(fs.readFileSync('examples/worlds-v2/package-report.json')),pool=new WorkerPool({concurrency:1});
  assert.equal(releases.length,12);const updates=[];
  for(const release of releases){
    const id='demo-library-'+release.key,row=await store.one('libraries',{id});
    assert(row?.isDemo===1&&row.theme===release.key,'Only the twelve existing example worlds may be upgraded');
    const sourceBytes=fs.readFileSync(release.file),sha256=createHash('sha256').update(sourceBytes).digest('hex');
    if(row.sha256===sha256){updates.push({key:release.key,unchanged:true});continue;}
    assert.equal(await store.count('bots',{library_id:id}),0,'Ranked AI versions must remain immutable: '+id);
    assert.equal(await store.count('matches',{library_id:id}),0,'Ranked results must remain immutable: '+id);
    const valid=await pool.run({type:'validate',bytes:sourceBytes},120000);assert.deepEqual(valid.warnings,[]);
    assert.equal(valid.counts.rooms,3);assert.equal(valid.counts.characters,3);assert.equal(valid.counts.equipment,24);
    const file_id=id+'-v2-'+sha256.slice(0,16),patch={name:valid.metadata.name,description:valid.metadata.description,release:valid.metadata.release,sha256,bytes:sourceBytes.length,counts:valid.counts,arena:valid.arena,file_id};
    updates.push({key:release.key,row,patch,sourceBytes});
  }
  if(apply){
    const backup=path.join(directory,'version-backups');fs.mkdirSync(backup,{recursive:true,mode:0o700});
    fs.writeFileSync(path.join(backup,Date.now()+'.json'),JSON.stringify(updates.filter(u=>u.row).map(u=>u.row),null,2),{mode:0o600});
    // Prepare all files first. A failure leaves every published row unchanged.
    for(const u of updates.filter(u=>u.patch))await store.putFile(u.patch.file_id,u.sourceBytes);
    for(const u of updates.filter(u=>u.patch)){
      const counts=await Promise.all(['topics','votes','ratings','downloads'].map(table=>store.count(table,{library_id:u.row.id})));
      await store.update('libraries',{id:u.row.id,sha256:u.row.sha256,isDemo:1},u.patch);
      assert.deepEqual(await Promise.all(['topics','votes','ratings','downloads'].map(table=>store.count(table,{library_id:u.row.id}))),counts);
      assert.equal((await store.one('libraries',{id:u.row.id})).sha256,u.patch.sha256);
    }
    const existing=JSON.parse(fs.readFileSync(path.join(directory,'report.json')));
    const next=existing.map(r=>releases.find(n=>n.key===r.key)||r);
    fs.writeFileSync(path.join(directory,'report.json'),JSON.stringify(next,null,2));
  }
  return updates.map(u=>({key:u.key,changed:!!u.patch,applied:apply&&!!u.patch}));
}
module.exports={upgrade};
if(require.main===module){if(fs.existsSync('.env'))process.loadEnvFile('.env');const store=createStore({directory:process.env.DATA_DIR||path.resolve('var/community')});upgrade({store,apply:process.argv.includes('--apply')}).then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>store.close());}
