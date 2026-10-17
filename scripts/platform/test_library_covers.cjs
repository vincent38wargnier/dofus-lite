const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{inflateRawSync}=require('node:zlib'),{PNG}=require('pngjs');
const {readLibrary,writeContentZip,withLibraryCover,inspectCover}=require('../../server/generated/library.cjs');
const {verifyCover}=require('../../server/covers.cjs'),{createApp}=require('../../server/app.cjs'),{fixture}=require('./fixture.cjs');
const inflate=(bytes,size)=>new Uint8Array(inflateRawSync(bytes,{maxOutputLength:size}));
function cover(color=[25,110,80,255]){const p=new PNG({width:640,height:320});for(let i=0;i<p.data.length;i++)p.data[i]=color[i%4];return PNG.sync.write(p);}
let original,withCover,image,service,server,base,folder,alice,bob,published;
const mongo=process.env.TEST_MONGO==='1',prefix='proof_covers_'+Date.now()+'_',origin='http://127.0.0.1:3195';
if(mongo)process.loadEnvFile('.env');
async function call(url,{who,method='GET',body,type}={}){const response=await fetch(base+'/api'+url,{method:body&&method==='GET'?'POST':method,headers:{Origin:origin,...(who?{Cookie:who.cookie,'X-CSRF-Token':who.csrf}:{}),...(body?{'Content-Type':type||'application/json'}:{})},...(body?{body:Buffer.isBuffer(body)?body:JSON.stringify(body)}:{})});return {status:response.status,data:response.headers.get('content-type')?.includes('json')?await response.json():Buffer.from(await response.arrayBuffer()),headers:response.headers,cookie:response.headers.get('set-cookie')?.split(';')[0]};}
async function user(name){const r=await call('/auth/register',{body:{handle:name,password:'cover-proof-long-password'}});assert.equal(r.status,201);return {...r.data,cookie:r.cookie};}
before(async()=>{original=(await fixture()).bytes;image=cover();withCover=Buffer.from(await withLibraryCover(original,image,inflate));folder=fs.mkdtempSync(path.join(os.tmpdir(),'af-covers-'));service=createApp({directory:folder,origin,uri:mongo?process.env.MONGODB_URI:'',prefix});await service.ready;server=service.app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base='http://127.0.0.1:'+server.address().port;alice=await user('cover_author');bob=await user('cover_reader');});
after(async()=>{await new Promise(r=>server.close(r));if(mongo)for(const c of await service.db.listCollections({},{nameOnly:true}).toArray())if(c.name.startsWith(prefix))await service.db.collection(c.name).drop();await service.close();fs.rmSync(folder,{recursive:true,force:true});});
test('adding, replacing and removing a cover preserves every game dependency',async()=>{
 const a=await readLibrary(original,inflate),b=await readLibrary(withCover,inflate);assert.equal(b.metadata.cover,'cover.png');assert.deepEqual(Buffer.from(b.files.get('cover.png')),image);
 for(const [name,bytes]of a.files)if(name!=='library.json')assert.deepEqual(b.files.get(name),bytes);
 const replaced=await readLibrary(await withLibraryCover(withCover,cover([90,35,140,255]),inflate),inflate);assert.equal(replaced.files.size,b.files.size);
 const removed=await readLibrary(await withLibraryCover(withCover,null,inflate),inflate);assert.equal(removed.metadata.cover,undefined);assert.equal(removed.files.has('cover.png'),false);
});
test('cover validation rejects corruption, executable formats, absent files and oversized dimensions',async()=>{
 assert.equal(inspectCover(image).width,640);assert.throws(()=>inspectCover(Buffer.from('<svg onload="bad()"/>')),/PNG/);
 const corrupt=Buffer.from(image);corrupt[corrupt.length-20]^=1;assert.throws(()=>inspectCover(corrupt),/corrompu/);
 const huge=Buffer.from(image);huge.writeUInt32BE(9000,16);assert.throws(()=>inspectCover(huge),/dimensions/);
 assert.throws(()=>verifyCover(cover([0,0,0,0])),/vide/);
 const files=(await readLibrary(original,inflate)).files,m=JSON.parse(Buffer.from(files.get('library.json')).toString());
 files.set('library.json',JSON.stringify({...m,cover:'https://example.com/a.png'}));await assert.rejects(()=>readLibrary(writeContentZip(files),inflate),/Couverture/);
 files.set('library.json',JSON.stringify({...m,cover:'cover.png'}));await assert.rejects(()=>readLibrary(writeContentZip(files),inflate),/présente/);
});
test('publication extracts a validated cover and serves it as an inert PNG',async()=>{
 const response=await fetch(base+'/api/libraries',{method:'POST',headers:{Origin:origin,Cookie:alice.cookie,'X-CSRF-Token':alice.csrf,'Content-Type':'application/zip','X-Publication-Rights':'confirmed'},body:withCover});assert.equal(response.status,201);published=await response.json();assert.ok(published.coverUrl);assert.equal(published.coverWidth,640);
 const actual=await call('/libraries/'+published.id+'/cover');assert.equal(actual.status,200);assert.equal(actual.headers.get('content-type'),'image/png');assert.match(actual.headers.get('content-security-policy'),/sandbox/);assert.deepEqual(actual.data,image);
 assert.deepEqual((await call('/libraries/'+published.id+'/download')).data,withCover);
});
test('only the author can replace the cover, and invalid images preserve the current one',async()=>{
 const url='/libraries/'+published.id+'/cover',next=cover([80,30,160,255]);
 assert.equal((await call(url,{who:bob,method:'PUT',body:next,type:'image/png'})).status,403);
 assert.equal((await call(url,{who:alice,method:'PUT',body:Buffer.from('not an image'),type:'image/png'})).status,400);
 assert.deepEqual((await call(url)).data,image);
 assert.equal((await call(url,{who:alice,method:'PUT',body:next,type:'image/png'})).status,200);
 assert.deepEqual((await call(url)).data,next);assert.deepEqual((await call('/libraries/'+published.id+'/download')).data,withCover);
});
test('demo traction is separate from real votes, downloads and rankings',async()=>{
 const row=await service.store.one('libraries',{id:published.id});await service.store.insert('libraries',{...row,id:'demo-cover',owner:bob.user.id,sha256:'demo-cover-version',isDemo:1,demoActivity:{simulated:true,likes:200,downloads:1500}});
 const t=await call('/topics',{who:alice,body:{libraryId:'demo-cover',title:'A real discussion',body:'I can find the comments from the card.'}});assert.equal(t.status,201);
 await call('/topics/'+t.data.id+'/replies',{who:bob,body:{body:'And the totals match the actual thread.'}});
 const demo=(await call('/libraries/demo-cover')).data;assert.equal(demo.likes,0);assert.equal(demo.downloads,0);assert.equal(demo.demoActivity.downloads,1500);assert.equal(demo.messageCount,2);assert.equal(demo.discussionCount,1);assert.equal(demo.latestDiscussion.id,t.data.id);
 assert.deepEqual((await call('/leaderboard')).data.entries,[]);assert.equal(await service.store.count('votes'),0);
 await service.store.update('libraries',{id:published.id},{demoActivity:{likes:999,downloads:999}});assert.equal((await call('/libraries/'+published.id)).data.demoActivity,null);
});
test('cover metadata and bytes survive a new repository connection',async()=>{
 const {createStore}=require('../../server/store.cjs'),{coverStore}=require('../../server/covers.cjs');const other=createStore({directory:folder,uri:mongo?process.env.MONGODB_URI:'',prefix});await other.ready;
 try{const saved=await other.one('libraries',{id:published.id});assert.equal(saved.coverWidth,640);assert.deepEqual(fs.readFileSync(coverStore(folder).file(saved.coverHash)),cover([80,30,160,255]));}finally{await other.close();}
});
test('removing a publication also hides its cover image',async()=>{
 assert.equal((await call('/libraries/'+published.id,{who:alice,method:'DELETE'})).status,200);assert.equal((await call('/libraries/'+published.id+'/cover')).status,404);
});
