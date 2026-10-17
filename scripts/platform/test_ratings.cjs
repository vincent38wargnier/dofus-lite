const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createApp}=require('../../server/app.cjs'),{createStore}=require('../../server/store.cjs');
const mongo=process.env.TEST_MONGO==='1';if(mongo)process.loadEnvFile('.env');
const prefix='proof_ratings_'+Date.now()+'_',origin='http://127.0.0.1:3192';let service,server,url,folder,owner,alice,bob;
async function call(route,{who,method='GET',body,csrf=true}={}){const r=await fetch(url+'/api'+route,{method,headers:{Origin:origin,...(who?{Cookie:who.cookie,...(csrf?{'X-CSRF-Token':who.csrf}:{})}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
async function user(handle){const r=await call('/auth/register',{method:'POST',body:{handle,password:'ratings-proof-password-2026'}});assert.equal(r.status,201);return {...r.data,cookie:r.cookie};}
before(async()=>{folder=fs.mkdtempSync(path.join(os.tmpdir(),'af-ratings-'));service=createApp({directory:folder,uri:mongo?process.env.MONGODB_URI:'',prefix,origin});await service.ready;server=service.app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));url='http://127.0.0.1:'+server.address().port;owner=await user('rating_author');alice=await user('rating_alice');bob=await user('rating_bob');for(const [id,isDemo,demoOrder]of [['world',0,2],['other',1,0]])await service.store.insert('libraries',{id,owner:owner.user.id,name:id,description:'Rating test',release:'1.0.0',kind:'adventure',sha256:id,bytes:0,counts:{},arena:[],created:'2026-10-01T00:00:00.000Z',hidden:0,isDemo,demoOrder});});
after(async()=>{await new Promise(r=>server.close(r));if(mongo)for(const c of await service.db.listCollections({},{nameOnly:true}).toArray())if(c.name.startsWith(prefix))await service.db.collection(c.name).drop();await service.close();fs.rmSync(folder,{recursive:true,force:true});});
test('public visitors see empty ratings but cannot rate, and writes require CSRF',async()=>{
 assert.deepEqual((await call('/libraries/world')).data.rating,{average:null,count:0});
 assert.equal((await call('/libraries/world/rating',{method:'PUT',body:{value:5}})).status,401);
 assert.equal((await call('/libraries/world/rating',{who:alice,csrf:false,method:'PUT',body:{value:5}})).status,403);
 assert.equal((await call('/libraries/world/rating',{who:owner,method:'PUT',body:{value:5}})).status,403);
});
test('rejects non-integers, strings, missing values and absent worlds',async()=>{
 for(const value of [0,6,2.5,'5',null,{},true])assert.equal((await call('/libraries/world/rating',{who:alice,method:'PUT',body:{value}})).status,400);
 assert.equal((await call('/libraries/missing/rating',{who:alice,method:'PUT',body:{value:5}})).status,404);
});
test('one modifiable rating per account, persisted averages and private personal choice',async()=>{
 let r=await call('/libraries/world/rating',{who:alice,method:'PUT',body:{value:4}});assert.equal(r.status,200);assert.equal(r.data.myRating,4);
 await call('/libraries/world/rating',{who:bob,method:'PUT',body:{value:2}});r=await call('/libraries/world');assert.deepEqual(r.data.rating,{average:3,count:2});assert.equal(r.data.myRating,null);
 r=await call('/libraries/world/rating',{who:alice,method:'PUT',body:{value:5}});assert.deepEqual(r.data.rating,{average:3.5,count:2});assert.equal((await call('/libraries/world',{who:bob})).data.myRating,2);
 const other=createStore({directory:folder,uri:mongo?process.env.MONGODB_URI:'',prefix});await other.ready;try{assert.deepEqual(await other.ratingSummary('world'),{average:3.5,count:2});}finally{await other.close();}
});
test('concurrent identical writes are idempotent and cannot inflate totals',async()=>{
 const rows=await Promise.all(Array.from({length:8},()=>call('/libraries/world/rating',{who:alice,method:'PUT',body:{value:4}})));assert(rows.every(r=>r.status===200));assert.equal(await service.store.count('ratings',{library_id:'world'}),2);
});
test('best rated sorting ignores editorial demo ordering and fake activity',async()=>{
 await service.store.update('libraries',{id:'other'},{demoActivity:{likes:9000,downloads:60000}});
 const list=(await call('/libraries?sort=rated')).data.libraries;assert.equal(list[0].id,'world');assert.equal(list[1].rating.count,0);assert.equal(await service.store.count('votes'),0);assert.equal((await call('/leaderboard')).data.entries.length,0);
});
test('versioned file downloads use the installed immutable file, preserving the public identity',async()=>{
 const bytes=Buffer.from('PK immutable upgraded world');await service.store.putFile('other-v2',bytes);
 await service.store.update('libraries',{id:'other'},{file_id:'other-v2',bytes:bytes.length});
 const r=await fetch(url+'/api/libraries/other/download');assert.equal(r.status,200);assert.equal(Number(r.headers.get('content-length')),bytes.length);assert.deepEqual(Buffer.from(await r.arrayBuffer()),bytes);
 assert.equal(await service.store.count('downloads',{library_id:'other'}),1);assert.equal(await service.store.count('downloads',{library_id:'other-v2'}),0);
});
test('removal affects only the current account; hidden worlds cannot be rated',async()=>{
 let r=await call('/libraries/world/rating',{who:alice,method:'DELETE'});assert.equal(r.data.myRating,null);assert.deepEqual(r.data.rating,{average:2,count:1});
 await call('/libraries/world/rating',{who:alice,method:'DELETE'});assert.equal(await service.store.count('ratings'),1);
 await service.store.update('libraries',{id:'world'},{hidden:1});assert.equal((await call('/libraries/world/rating',{who:bob,method:'PUT',body:{value:5}})).status,404);
});
