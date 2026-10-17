// Exercise the runtime filesystem used by Docker without relying on a local Docker daemon.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {spawnSync,spawn}=require('node:child_process');
const root=path.resolve(__dirname,'../..');
async function main(){
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'arena-deploy-'));let child;
 try{
  for(const file of ['package.json','package-lock.json'])fs.copyFileSync(path.join(root,'server',file),path.join(temp,file));
  fs.cpSync(path.join(root,'server'),path.join(temp,'server'),{recursive:true,filter:p=>!p.split(path.sep).includes('node_modules')});
  fs.cpSync(path.join(root,'build-platform'),path.join(temp,'build-platform'),{recursive:true});
  fs.mkdirSync(path.join(temp,'src/platform'),{recursive:true});
  fs.copyFileSync(path.join(root,'src/platform/sandboxCore.js'),path.join(temp,'src/platform/sandboxCore.js'));
  const install=spawnSync('npm',['ci','--omit=dev','--ignore-scripts','--no-audit','--no-fund'],{cwd:temp,encoding:'utf8'});
  assert.equal(install.status,0,install.stderr);console.log('Clean runtime dependencies installed outside repository.');
  const {fixture}=require('./fixture.cjs');fs.writeFileSync(path.join(temp,'test.zip'),(await fixture()).bytes);
  const worker=spawnSync(process.execPath,['-e',`
   const assert=require('node:assert/strict'),{WorkerPool}=require('./server/workerPool.cjs');
   (async()=>{const p=new WorkerPool(),v=await p.run({type:'validate',file:'test.zip'});assert.equal(v.arena.length,1);
   const result=await p.run({type:'match',file:'test.zip',fighter:0,seed:10,
    a:{id:'a',name:'Planner',code:'function decide(v,a){return a.maison();}'},
    b:{id:'b',name:'Pass',code:'function decide(v,a){return a.endTurn();}'}},120000);
   assert.equal(result.games.length,4);assert.ok(result.games.every(g=>g.winner==='a'));
   console.log('Standalone validation and four sandboxed server matches passed.');})().catch(e=>{console.error(e);process.exitCode=1;});
  `],{cwd:temp,encoding:'utf8',timeout:150000});
  assert.equal(worker.status,0,worker.stderr);process.stdout.write(worker.stdout);
  child=spawn(process.execPath,['-e',`const {createApp}=require('./server/app.cjs');const {app}=createApp();const server=app.listen(0,'127.0.0.1',()=>console.log('PORT='+server.address().port));`],{cwd:temp,env:{...process.env,DATA_DIR:path.join(temp,'data')},stdio:['ignore','pipe','pipe']});
  const port=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Server startup timed out')),15000);let output='';child.stdout.on('data',b=>{output+=b;const m=/PORT=(\d+)/.exec(output);if(m){clearTimeout(timer);resolve(Number(m[1]));}});child.once('error',reject);child.once('exit',code=>reject(new Error('Server exited '+code)));});
  const base='http://127.0.0.1:'+port;
  assert.equal((await fetch(base+'/api/health')).status,200);
  assert.deepEqual((await(await fetch(base+'/api/libraries')).json()).libraries,[]);
  assert.ok((await(await fetch(base)).text()).includes('Arena Forge'));
  for(const url of ['/server/app.cjs','/src/platform/sandboxCore.js','/dofus-local/manifest.json','/templates/custom-class-authoring-kit.zip'])assert.equal((await fetch(base+url)).status,404,url);
  console.log('Standalone website starts empty; private server code and old content remain inaccessible.');
 }finally{if(child&&!child.killed){child.kill();await new Promise(r=>child.once('exit',r));}fs.rmSync(temp,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
