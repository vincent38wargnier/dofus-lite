const {test,before,after}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createApp}=require('../../server/app.cjs');
const mongo=process.env.TEST_MONGO==='1',prefix='proof_forum_'+Date.now()+'_',origin='http://127.0.0.1:3194';
if(mongo)process.loadEnvFile('.env');
let service,server,base,directory,author,reader;
async function call(route,{who,body,method=body?'POST':'GET'}={}) {
  const response=await fetch(base+'/api'+route,{method,headers:{Origin:origin,...(who?{Cookie:who.cookie,'X-CSRF-Token':who.csrf}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
}
async function register(handle) { const response=await call('/auth/register',{body:{handle,password:'forum-proof-long-password'}});assert.equal(response.status,201);return {...response.data,cookie:response.cookie}; }
async function topic(id,changes={}) { await service.store.insert('topics',{id,owner:author.user.id,library_id:null,title:id,body:'Un placement à discuter.',category:'strategy',created:'2026-10-01T12:00:00Z',updated:'2026-10-01T12:00:00Z',hidden:0,locked:0,isDemo:0,...changes}); }
before(async()=>{
  directory=fs.mkdtempSync(path.join(os.tmpdir(),'af-forum-feed-'));
  service=createApp({directory,origin,uri:mongo?process.env.MONGODB_URI:'',prefix});await service.ready;
  server=service.app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));base='http://127.0.0.1:'+server.address().port;
  author=await register('forum_author');reader=await register('forum_reader');
  await topic('active',{updated:'2026-10-16T12:00:00Z'});
  await topic('new',{created:'2026-10-14T12:00:00Z',updated:'2026-10-14T12:00:00Z'});
  await topic('popular');
  await topic('fiction',{isDemo:1,demoLikes:99999});
  await call('/topics/popular/like',{who:reader,method:'POST'});
});
after(async()=>{
  await new Promise(resolve=>server.close(resolve));
  if(mongo)for(const collection of await service.db.listCollections({},{nameOnly:true}).toArray())if(collection.name.startsWith(prefix))await service.db.collection(collection.name).drop();
  await service.close();fs.rmSync(directory,{recursive:true,force:true});
});
test('three feed sorts use activity, publication date and real likes respectively',async()=>{
  for(const [sort,expected] of [['active','active'],['new','new'],['top','popular']]) {
    const result=await call('/topics?scope=all&sort='+sort);
    assert.equal(result.status,200);assert.equal(result.data.topics[0].id,expected);assert.equal(result.data.total,4);
  }
});
test('simulated likes do not count toward votes or popular ranking',async()=>{
  const rows=(await call('/topics?scope=all&sort=top')).data.topics;
  const fictional=rows.find(row=>row.id==='fiction');assert.equal(fictional.demoLikes,99999);assert.equal(fictional.likes,0);assert.ok(fictional.isDemo);
  assert.equal((await call('/topics?scope=all&source=members')).data.total,3);
});
test('following is private to the authenticated reader and feed rows report current state',async()=>{
  assert.equal((await call('/topics?scope=all&following=1')).status,401);
  await call('/topics/active/follow',{who:reader,method:'POST'});
  const followed=(await call('/topics?scope=all&following=1',{who:reader})).data;
  assert.deepEqual(followed.topics.map(row=>row.id),['active']);assert.equal(followed.topics[0].following,true);
  assert.equal((await call('/topics?scope=all&following=1',{who:author})).data.total,0);
  const popular=(await call('/topics?scope=all&sort=top',{who:reader})).data.topics[0];
  assert.equal(popular.liked,true);assert.equal(popular.likes,1);
  assert.equal((await call('/topics?scope=all&sort=top')).data.topics[0].liked,false);
  assert.equal(popular._votes,undefined);assert.equal(popular._following,undefined);
});
test('following and source filter combine without leaking hidden library discussions',async()=>{
  await service.store.insert('libraries',{id:'removed-world',owner:author.user.id,name:'Removed world',description:'Test',release:'1',kind:'mixed',sha256:'removed-world',bytes:1,counts:{},arena:[],created:'2026-10-01T00:00:00Z',hidden:1,isDemo:0});
  await topic('removed-topic',{library_id:'removed-world'});
  await service.store.once('subscriptions',{user_id:reader.user.id,topic_id:'removed-topic'},{created:new Date().toISOString()});
  const response=await call('/topics?scope=all&following=1&source=members',{who:reader});
  assert.deepEqual(response.data.topics.map(row=>row.id),['active']);
  assert.equal((await call('/topics?scope=all')).data.total,4);
});
test('pagination is stable across tied dates, sorts all rows and never counts hidden replies',async()=>{
  for(let index=0;index<35;index++)await topic('page-'+String(index).padStart(2,'0'),{category:'help'});
  const a=(await call('/topics?scope=all&category=help&page=1&sort=new')).data;
  const b=(await call('/topics?scope=all&category=help&page=2&sort=new')).data;
  assert.equal(a.total,35);assert.equal(a.topics.length,30);assert.equal(b.topics.length,5);assert.equal(new Set([...a.topics,...b.topics].map(row=>row.id)).size,35);
  await call('/topics/page-00/like',{who:reader,method:'POST'});
  assert.equal((await call('/topics?scope=all&category=help&sort=top')).data.topics[0].id,'page-00');
  await service.store.insert('replies',{id:'hidden-reply',topic_id:'active',owner:author.user.id,body:'hidden',created:new Date().toISOString(),hidden:1,isDemo:0});
  assert.equal((await call('/topics?scope=all&q=active')).data.topics[0].replies,0);
});
test('new replies return their saved parent, author and real counters for immediate display',async()=>{
  const first=await call('/topics/active/replies',{who:reader,body:{body:'Je couvre le soigneur.'}});
  assert.equal(first.status,201);assert.equal(first.data.reply.id,first.data.id);assert.equal(first.data.reply.author,reader.user.handle);
  const child=await call('/topics/active/replies',{who:author,body:{body:'Merci pour le placement.',replyTo:first.data.id}});
  assert.equal(child.data.reply.reply_to,first.data.id);assert.equal(child.data.reply.likes,0);assert.equal(child.data.reply.isDemo,0);
  const rows=(await call('/topics?scope=all&q=active')).data.topics;assert.equal(rows[0].replies,2);
  await call('/replies/'+first.data.id,{who:reader,method:'DELETE'});
  const thread=(await call('/topics/active')).data;assert.equal(thread.replyCount,1);assert.equal(thread.replies[0].id,child.data.id);
});
test('cross-topic parents and replies to locked discussions are rejected',async()=>{
  const first=await call('/topics/new/replies',{who:reader,body:{body:'Autre discussion.'}});
  assert.equal((await call('/topics/active/replies',{who:reader,body:{body:'Wrong parent',replyTo:first.data.id}})).status,400);
  await service.store.update('topics',{id:'popular'},{locked:1});
  assert.equal((await call('/topics/popular/replies',{who:reader,body:{body:'Locked'}})).status,409);
});
