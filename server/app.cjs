const express = require('express'), fs = require('node:fs'), path = require('node:path');
const { randomUUID, randomBytes, createHash, scrypt, timingSafeEqual } = require('node:crypto');
const { promisify } = require('node:util');
const { coverStore } = require('./covers.cjs');
const { createStore, duplicates } = require('./store.cjs'), { WorkerPool } = require('./workerPool.cjs');
const derive = promisify(scrypt), hash = value => createHash('sha256').update(value).digest('hex');
const now = () => new Date().toISOString();
const fail = (status, message) => Object.assign(new Error(message), { status });
const text = (value, min, max, label) => { if (typeof value !== 'string' || value.trim().length < min || value.length > max) throw fail(400, `${label} : ${min} à ${max} caractères.`); return value.trim(); };
const route = fn => (req,res,next) => Promise.resolve().then(()=>fn(req,res,next)).catch(next);
const search = value => String(value||'').slice(0,100).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const categories=['general','help','feedback','strategy','ai','looking'];
const category = value => categories.includes(value)?value:'general';
async function passwordHash(password) { const salt=randomBytes(16).toString('hex');return `${salt}:${Buffer.from(await derive(password,salt,64)).toString('hex')}`; }
async function matches(password,saved) { const [salt,hex]=saved.split(':');const actual=await derive(password,salt,64),expected=Buffer.from(hex,'hex');return expected.length===actual.length&&timingSafeEqual(actual,expected); }
function createApp({directory=process.env.DATA_DIR||path.resolve('var/community'),origin=process.env.PUBLIC_ORIGIN||'http://127.0.0.1:3013',build=path.resolve('build-platform'),pool=new WorkerPool(),clock=now,uri=process.env.MONGODB_URI,database=process.env.MONGODB_DB||'arenaforge',prefix='',repository}={}) {
  const store=repository||createStore({directory,uri,database,prefix}), covers=coverStore(directory);
  const ready=store.ready.then(async()=>{await store.update('matches',{status:'running'},{status:'failed',result:{error:'Calcul interrompu par le redémarrage du serveur.'}});await store.remove('sessions',{expires:{$lt:Date.now()}});});
  const app=express(),secure=origin.startsWith('https:');app.disable('x-powered-by');if(process.env.TRUST_PROXY==='1')app.set('trust proxy',1);
  const rates=new Map();
  app.use(route(async(req,res,next)=>{
    res.set({'X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','X-Frame-Options':'DENY','Permissions-Policy':'camera=(), microphone=(), geolocation=()',
      'Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"});
    if(secure)res.set('Strict-Transport-Security','max-age=31536000');
    if(req.path.startsWith('/api/'))res.set('Cache-Control','no-store');else return next();
    await ready;
    if(!['GET','HEAD','OPTIONS'].includes(req.method)&&req.get('origin')!==origin)throw fail(403,'Origine de la requête refusée.');
    const key=`${req.ip}:${req.path.startsWith('/api/auth/')?'auth':'general'}`,time=Date.now(),limit=req.path.startsWith('/api/auth/')?30:600;
    let rate=rates.get(key);if(!rate||rate.until<time)rates.set(key,rate={n:0,until:time+60000});
    if(++rate.n>limit)throw fail(429,'Trop de requêtes. Réessayez dans une minute.');
    if(rates.size>10000)for(const [k,v]of rates)if(v.until<time)rates.delete(k);
    const token=/(?:^|;\s*)arena_session=([a-f0-9]{64})(?:;|$)/.exec(req.get('cookie')||'')?.[1];
    if(token){const session=await store.one('sessions',{token:hash(token),expires:{$gt:time}});if(session){const owner=await store.one('users',{id:session.user_id});if(owner&&!owner.isDemo)req.session={...session,handle:owner.handle,admin:owner.admin};}}
    next();
  }));
  let uploadsInFlight=0;
  app.use('/api/libraries',(req,res,next)=>{if(req.method!=='POST'||req.path!=='/')return next();if(!req.session)return next(fail(401,'Connectez-vous pour continuer.'));if(req.get('x-csrf-token')!==req.session.csrf)return next(fail(403,'Session expirée.'));if(uploadsInFlight)return next(fail(429,'Une publication est en cours. Réessayez dans un instant.'));uploadsInFlight++;res.once('close',()=>{uploadsInFlight--;});next();},express.raw({type:'application/zip',limit:'512mb'}));
  app.use(express.json({limit:'128kb'}));
  const auth=(req,res,next)=>req.session?next():next(fail(401,'Connectez-vous pour continuer.'));
  const csrf=(req,res,next)=>req.session&&req.get('x-csrf-token')===req.session.csrf?next():next(fail(403,'Session expirée. Rechargez la page.'));
  const user=s=>s?{id:s.user_id,handle:s.handle,admin:!!s.admin}:null;
  async function login(res,record){const token=randomBytes(32).toString('hex'),csrf=randomBytes(24).toString('hex');await store.insert('sessions',{token:hash(token),user_id:record.id,csrf,expires:Date.now()+7*86400000});res.cookie('arena_session',token,{httpOnly:true,secure,sameSite:'strict',path:'/',maxAge:7*86400000});return {user:{id:record.id,handle:record.handle,admin:!!record.admin},csrf};}
  async function byHandle(handle){return store.one('users',store.kind==='mongodb'?{handleKey:handle.toLowerCase()}:{handle});}
  app.get('/api/health',route(async(req,res)=>res.json({ok:true,engine:1,storage:store.kind})));
  app.get('/api/auth/me',(req,res)=>res.json({user:user(req.session),csrf:req.session?.csrf||null}));
  app.post('/api/auth/register',route(async(req,res)=>{const handle=text(req.body.handle,3,30,'Pseudo');if(!/^[a-zA-Z0-9_-]+$/.test(handle))throw fail(400,'Pseudo : lettres, chiffres, tirets ou underscore.');
    const password=text(req.body.password,12,200,'Mot de passe'),recovery=randomBytes(24).toString('hex');
    const record={id:randomUUID(),handle,password:await passwordHash(password),recovery:hash(recovery),created:clock(),admin:0,isDemo:0,bio:''};
    try{await store.insert('users',record);}catch(e){if(duplicates(e))throw fail(409,'Ce pseudo est déjà utilisé.');throw e;}
    res.status(201).json({...await login(res,record),recovery});}));
  app.post('/api/auth/login',route(async(req,res)=>{const handle=text(req.body.handle,3,30,'Pseudo'),password=text(req.body.password,1,200,'Mot de passe'),record=await byHandle(handle);
    const ok=await matches(password,record&&!record.isDemo?record.password:'00000000000000000000000000000000:'+ '00'.repeat(64));if(!record||record.isDemo||!ok)throw fail(401,'Pseudo ou mot de passe incorrect.');res.json(await login(res,record));}));
  app.post('/api/auth/recover',route(async(req,res)=>{const handle=text(req.body.handle,3,30,'Pseudo'),recovery=text(req.body.recovery,48,48,'Clé de récupération'),password=text(req.body.password,12,200,'Mot de passe'),record=await byHandle(handle);
    if(!record||record.isDemo||record.recovery!==hash(recovery))throw fail(400,'Pseudo ou clé incorrecte.');const next=randomBytes(24).toString('hex');await store.update('users',{id:record.id},{password:await passwordHash(password),recovery:hash(next)});await store.remove('sessions',{user_id:record.id});res.json({...await login(res,record),recovery:next});}));
  app.post('/api/auth/logout',auth,csrf,route(async(req,res)=>{await store.remove('sessions',{token:req.session.token});res.clearCookie('arena_session',{path:'/'});res.json({ok:true});}));
  const author=async id=>{const u=await store.one('users',{id});return {author:u?.handle||'Compte retiré',authorDemo:!!u?.isDemo};};
  async function libraryRow(row){
    const discussions=await store.all('topics',{library_id:row.id,hidden:0},{sort:{updated:-1,created:-1}}),topicIds=discussions.map(t=>t.id);
    const replies=topicIds.length?await store.count('replies',{topic_id:{$in:topicIds},hidden:0}):0;
    return {...row,...await author(row.owner),coverUrl:row.coverHash?`/api/libraries/${row.id}/cover?v=${row.coverHash}`:null,
      demoActivity:row.isDemo?row.demoActivity||null:null,discussionCount:discussions.length,messageCount:discussions.length+replies,
      latestDiscussion:discussions[0]?{id:discussions[0].id,title:discussions[0].title,isDemo:!!discussions[0].isDemo}:null,
      rating:await store.ratingSummary(row.id),likes:await store.count('votes',{library_id:row.id}),downloads:await store.count('downloads',{library_id:row.id})};}

  async function visibleLibrary(id){const row=await store.one('libraries',{id,hidden:0});if(!row)throw fail(404,'Bibliothèque introuvable.');return libraryRow(row);}
  app.get('/api/libraries',route(async(req,res)=>{const q=search(req.query.q),filter={hidden:0};if(q)filter.$or=[{name:{$regex:q}},{description:{$regex:q}}];
    const rows=await store.all('libraries',filter,{sort:{created:-1},limit:100});const libraries=await Promise.all(rows.map(libraryRow));
    libraries.sort(req.query.sort==='rated'?(a,b)=>(b.rating.average||0)-(a.rating.average||0)||b.rating.count-a.rating.count||a.name.localeCompare(b.name):req.query.sort==='recent'?(a,b)=>b.created.localeCompare(a.created):(a,b)=>{
      if(a.isDemo&&b.isDemo)return (a.demoOrder??999)-(b.demoOrder??999);
      if(a.isDemo!==b.isDemo)return Number(a.isDemo)-Number(b.isDemo);
      return b.likes-a.likes||b.downloads-a.downloads||b.created.localeCompare(a.created);
    });res.json({libraries});}));
  async function ratedLibrary(id,session) { return {...await visibleLibrary(id),myRating:session?(await store.one('ratings',{library_id:id,user_id:session.user_id}))?.value??null:null}; }
  app.get('/api/libraries/:id',route(async(req,res)=>res.json(await ratedLibrary(req.params.id,req.session))));
  app.put('/api/libraries/:id/rating',auth,csrf,route(async(req,res)=>{
    const row=await visibleLibrary(req.params.id),value=req.body.value;
    if(row.owner===req.session.user_id)throw fail(403,'Vous ne pouvez pas noter votre propre monde.');
    if(!Number.isInteger(value)||value<1||value>5)throw fail(400,'Choisissez une note entière de 1 à 5 étoiles.');
    await store.setRating(req.session.user_id,row.id,value,clock());res.json(await ratedLibrary(row.id,req.session));
  }));
  app.delete('/api/libraries/:id/rating',auth,csrf,route(async(req,res)=>{
    const row=await visibleLibrary(req.params.id);await store.remove('ratings',{user_id:req.session.user_id,library_id:row.id});res.json(await ratedLibrary(row.id,req.session));
  }));
  app.get('/api/libraries/:id/cover',route(async(req,res)=>{const row=await store.one('libraries',{id:req.params.id,hidden:0});if(!row?.coverHash)throw fail(404,'Couverture introuvable.');
    res.set({'Content-Security-Policy':"default-src 'none'; sandbox",'Cache-Control':'public, max-age=300','ETag':'"'+row.coverHash+'"'});res.type('image/png');res.sendFile(covers.file(row.coverHash));}));
  app.put('/api/libraries/:id/cover',auth,csrf,express.raw({type:'image/png',limit:'4mb'}),route(async(req,res)=>{
    const row=await store.one('libraries',{id:req.params.id,hidden:0});if(!row)throw fail(404,'Bibliothèque introuvable.');if(row.owner!==req.session.user_id)throw fail(403,'Seul l’auteur peut changer la couverture.');
    if(!Buffer.isBuffer(req.body))throw fail(400,'Image PNG attendue.');const cover=await covers.put(req.body);await store.update('libraries',{id:row.id},cover);res.json(await visibleLibrary(row.id));}));
  app.post('/api/libraries',auth,csrf,route(async(req,res)=>{if(!Buffer.isBuffer(req.body)||req.body.length<22)throw fail(400,'Envoyez un ZIP de bibliothèque.');if(req.get('x-publication-rights')!=='confirmed')throw fail(400,'Confirmez votre autorisation de partager ces contenus.');
    const bytes=req.body,sha256=hash(bytes);if(await store.one('libraries',{owner:req.session.user_id,sha256,hidden:0}))throw fail(409,'Cette version est déjà publiée.');
    if(await store.count('libraries',{owner:req.session.user_id,created:{$gte:clock().slice(0,10)}})>=10)throw fail(429,'Limite de 10 publications par jour.');
    const valid=await pool.run({type:'validate',bytes},120000),id=randomUUID();await store.putFile(id,bytes);
    try{const m=valid.metadata,cover=valid.cover?await covers.put(valid.cover):{};await store.insert('libraries',{id,owner:req.session.user_id,name:m.name,description:m.description,release:m.release,kind:m.kind,sha256,bytes:bytes.length,counts:valid.counts,arena:valid.arena,created:clock(),hidden:0,isDemo:0,...cover});}
    catch(e){await store.deleteFile(id);if(duplicates(e))throw fail(409,'Cette version est déjà publiée.');throw e;}
    res.status(201).json({...await visibleLibrary(id),warnings:valid.warnings});}));
  app.get('/api/libraries/:id/download',route(async(req,res)=>{const row=await visibleLibrary(req.params.id),visitor=hash(req.session?.user_id||`${req.ip}:${req.get('user-agent')||''}`);
    const fileId=row.file_id||row.id;if(!await store.hasFile(fileId))throw fail(404,'Fichier indisponible.');await store.once('downloads',{library_id:row.id,visitor,day:clock().slice(0,10)},{});
    res.set('Content-Security-Policy',"default-src 'none'; sandbox");res.attachment(row.name.replace(/[^\p{L}\p{N}-]/gu,'-')+'.zip');res.type('application/zip');res.set('Content-Length',String(row.bytes));await store.sendFile(fileId,res);}));
  app.post('/api/libraries/:id/like',auth,csrf,route(async(req,res)=>{const row=await visibleLibrary(req.params.id);if(row.owner===req.session.user_id)throw fail(400,'Vous ne pouvez pas noter votre propre bibliothèque.');const key={user_id:req.session.user_id,library_id:row.id};
    const existing=await store.one('votes',key);if(existing)await store.remove('votes',key);else await store.once('votes',key,{created:clock()});res.json({...await visibleLibrary(row.id),liked:!existing});}));
  app.delete('/api/libraries/:id',auth,csrf,route(async(req,res)=>{const row=await visibleLibrary(req.params.id);if(row.owner!==req.session.user_id&&!req.session.admin)throw fail(403,'Seul l’auteur peut retirer cette publication.');await store.update('libraries',{id:row.id},{hidden:1});res.json({ok:true});}));
  async function visibleTopic(id){const t=await store.one('topics',{id,hidden:0});if(!t)throw fail(404,'Discussion introuvable.');if(t.library_id)await visibleLibrary(t.library_id);return t;}
  async function postRow(row,kind,session){return {...row,demoLikes:row.isDemo?row.demoLikes||0:0,...await author(row.owner),likes:await store.count('post_votes',{kind,target:row.id}),liked:!!(session&&await store.one('post_votes',{user_id:session.user_id,kind,target:row.id}))};}
  async function topicRow(row,session){return {...await postRow(row,'topic',session),replies:await store.count('replies',{topic_id:row.id,hidden:0}),following:!!(session&&await store.one('subscriptions',{user_id:session.user_id,topic_id:row.id}))};}
  app.get('/api/community',route(async(req,res)=>{
    const categoryCounts=Object.fromEntries(await Promise.all(categories.map(async category=>[category,await store.count('topics',{hidden:0,category})])));
    res.json({members:await store.count('users',{isDemo:0}),demoMembers:await store.count('users',{isDemo:1}),topics:await store.count('topics',{hidden:0,isDemo:0}),demoTopics:await store.count('topics',{hidden:0,isDemo:1}),categories,categoryCounts});
  }));
  app.get('/api/topics',route(async(req,res)=>{const library=req.query.library?String(req.query.library):null;if(library)await visibleLibrary(library);
    const filter={hidden:0};if(library||req.query.scope!=='all')filter.library_id=library;
    if(categories.includes(req.query.category))filter.category=req.query.category;
    if(req.query.source==='members')filter.isDemo=0;
    if(req.query.following==='1'){
      if(!req.session)throw fail(401,'Connectez-vous pour retrouver vos discussions suivies.');
      filter.id={$in:(await store.all('subscriptions',{user_id:req.session.user_id})).map(s=>s.topic_id)};
    }
    const q=search(req.query.q);if(q)filter.$or=[{title:{$regex:q}},{body:{$regex:q}}];
    const hidden=await store.all('libraries',{hidden:1});if(hidden.length)filter.$and=[{$or:[{library_id:null},...((await store.all('libraries',{hidden:0})).map(l=>({library_id:l.id})))]}];
    const page=Math.min(1000,Math.max(1,Math.floor(Number(req.query.page)||1))),limit=30;
    const sort=['active','new','top'].includes(req.query.sort)?req.query.sort:'active';
    const rows=await store.forumFeed(filter,{sort,userId:req.session?.user_id||null,limit,skip:(page-1)*limit});
    res.json({topics:await Promise.all(rows.map(async t=>({...t,...await author(t.owner),demoLikes:t.isDemo?t.demoLikes||0:0}))),total:await store.count('topics',filter),page,sort});}));
  app.post('/api/topics',auth,csrf,route(async(req,res)=>{const title=text(req.body.title,3,150,'Titre'),body=text(req.body.body,1,10000,'Message'),library=req.body.libraryId||null;if(library)await visibleLibrary(library);
    const id=randomUUID();await store.insert('topics',{id,owner:req.session.user_id,library_id:library,title,body,category:category(req.body.category),created:clock(),updated:clock(),hidden:0,locked:0,isDemo:0});await store.once('subscriptions',{user_id:req.session.user_id,topic_id:id},{created:clock()});res.status(201).json({id});}));
  app.get('/api/topics/:id',route(async(req,res)=>{const t=await visibleTopic(req.params.id),page=Math.min(1000,Math.max(1,Number(req.query.page)||1));
    res.json({...await postRow(t,'topic',req.session),following:!!(req.session&&await store.one('subscriptions',{user_id:req.session.user_id,topic_id:t.id})),replies:await Promise.all((await store.all('replies',{topic_id:t.id,hidden:0},{sort:{created:1,id:1},limit:100,skip:(page-1)*100})).map(r=>postRow(r,'reply',req.session))),replyCount:await store.count('replies',{topic_id:t.id,hidden:0}),page});}));
  app.post('/api/topics/:id/replies',auth,csrf,route(async(req,res)=>{const t=await visibleTopic(req.params.id);if(t.locked&&!req.session.admin)throw fail(409,'Cette discussion est fermée.');
    const replyTo=req.body.replyTo||null;if(replyTo&&!await store.one('replies',{id:String(replyTo),topic_id:t.id,hidden:0}))throw fail(400,'Réponse citée introuvable.');
    const id=randomUUID(),created=clock();const reply={id,topic_id:t.id,owner:req.session.user_id,body:text(req.body.body,1,10000,'Message'),created,hidden:0,isDemo:0,reply_to:replyTo};await store.insert('replies',reply);await store.update('topics',{id:t.id},{updated:created});
    for(const sub of await store.all('subscriptions',{topic_id:t.id,user_id:{$ne:req.session.user_id}},{limit:500}))if(!(await store.one('users',{id:sub.user_id}))?.isDemo)await store.insert('notifications',{id:randomUUID(),user_id:sub.user_id,topic_id:t.id,actor:req.session.user_id,created,seen:0});
    res.status(201).json({id,reply:await postRow(reply,'reply',req.session)});}));
  app.post('/api/topics/:id/follow',auth,csrf,route(async(req,res)=>{const t=await visibleTopic(req.params.id),key={user_id:req.session.user_id,topic_id:t.id},had=await store.one('subscriptions',key);if(had)await store.remove('subscriptions',key);else await store.once('subscriptions',key,{created:clock()});res.json({following:!had});}));
  for(const [routeName,kind,table] of [['topics','topic','topics'],['replies','reply','replies']]){
    const get=async id=>{if(kind==='topic')return visibleTopic(id);const r=await store.one(table,{id,hidden:0});if(!r)throw fail(404,'Message introuvable.');await visibleTopic(r.topic_id);return r;};
    app.patch('/api/'+routeName+'/:id',auth,csrf,route(async(req,res)=>{const r=await get(req.params.id);if(r.owner!==req.session.user_id&&!req.session.admin)throw fail(403,'Vous pouvez modifier uniquement vos messages.');if(r.isDemo)throw fail(403,'Le scénario de démonstration se modifie depuis son script.');const changes={body:text(req.body.body,1,10000,'Message'),edited:clock()};if(kind==='topic')changes.title=text(req.body.title,3,150,'Titre');await store.update(table,{id:r.id},changes);res.json({ok:true});}));
    app.delete('/api/'+routeName+'/:id',auth,csrf,route(async(req,res)=>{const r=await get(req.params.id);if(r.owner!==req.session.user_id&&!req.session.admin)throw fail(403,'Vous pouvez retirer uniquement vos messages.');await store.update(table,{id:r.id},{hidden:1});res.json({ok:true});}));
    app.post('/api/'+routeName+'/:id/like',auth,csrf,route(async(req,res)=>{const r=await get(req.params.id);if(r.owner===req.session.user_id)throw fail(400,'Vous ne pouvez pas aimer votre propre message.');const key={user_id:req.session.user_id,kind,target:r.id},had=await store.one('post_votes',key);if(had)await store.remove('post_votes',key);else await store.once('post_votes',key,{created:clock()});res.json({liked:!had,likes:await store.count('post_votes',{kind,target:r.id})});}));
  }
  app.get('/api/players/:id',route(async(req,res)=>{const u=await store.one('users',{id:req.params.id});if(!u)throw fail(404,'Joueur introuvable.');
    const topics=[];for(const t of await store.all('topics',{owner:u.id,hidden:0},{sort:{created:-1},limit:20}))if(!t.library_id||await store.one('libraries',{id:t.library_id,hidden:0}))topics.push(await topicRow(t,req.session));
    res.json({id:u.id,handle:u.handle,isDemo:!!u.isDemo,bio:u.bio||'',created:u.created,libraries:await Promise.all((await store.all('libraries',{owner:u.id,hidden:0},{sort:{created:-1}})).map(libraryRow)),topics});}));
  app.patch('/api/account',auth,csrf,route(async(req,res)=>{await store.update('users',{id:req.session.user_id},{bio:text(req.body.bio,0,600,'Présentation')});res.json({ok:true});}));
  app.get('/api/notifications',auth,route(async(req,res)=>{const rows=await store.all('notifications',{user_id:req.session.user_id},{sort:{created:-1},limit:30}),notifications=[];for(const n of rows){try{const t=await visibleTopic(n.topic_id);notifications.push({...n,title:t.title,...await author(n.actor)});}catch(e){if(e.status!==404)throw e;}}res.json({notifications,unread:await store.count('notifications',{user_id:req.session.user_id,seen:0})});}));
  app.post('/api/notifications/read',auth,csrf,route(async(req,res)=>{await store.update('notifications',{user_id:req.session.user_id,seen:0},{seen:1});res.json({ok:true});}));
  app.post('/api/reports',auth,csrf,route(async(req,res)=>{const {kind,target}=req.body,table={library:'libraries',topic:'topics',reply:'replies',bot:'bots'}[kind];if(!table)throw fail(400,'Type inconnu.');if(!await store.one(table,{id:String(target)}))throw fail(404,'Contenu introuvable.');await store.insert('reports',{id:randomUUID(),owner:req.session.user_id,kind,target,reason:text(req.body.reason,10,3000,'Motif'),created:clock(),resolved:0});res.status(201).json({ok:true});}));
  app.get('/api/moderation',auth,route(async(req,res)=>{if(!req.session.admin)throw fail(403,'Accès réservé à la modération.');res.json({reports:await store.all('reports',{resolved:0},{sort:{created:1}})});}));
  app.post('/api/moderation/:id',auth,csrf,route(async(req,res)=>{if(!req.session.admin)throw fail(403,'Accès réservé à la modération.');const r=await store.one('reports',{id:req.params.id});if(!r)throw fail(404,'Signalement introuvable.');if(req.body.action==='remove'){const table={library:'libraries',topic:'topics',reply:'replies'}[r.kind];if(!table)throw fail(400,'Retirez la bibliothèque associée à cette IA.');await store.update(table,{id:r.target},{hidden:1});}else if(req.body.action!=='dismiss')throw fail(400,'Action inconnue.');await store.update('reports',{id:r.id},{resolved:1});res.json({ok:true});}));
  app.post('/api/bots',auth,csrf,route(async(req,res)=>{const l=await visibleLibrary(req.body.libraryId),fighter=Number(req.body.fighter);if(!Number.isSafeInteger(fighter)||!l.arena[fighter])throw fail(400,'Choisissez un personnage valide de cette bibliothèque.');const name=text(req.body.name,2,80,'Nom'),code=text(req.body.code,10,60000,'Code');await pool.run({type:'check-bot',code,file:await store.file(l.file_id||l.id)},45000);
    const id=randomUUID();try{await store.insert('bots',{id,owner:req.session.user_id,library_id:l.id,fighter,name,code,sha256:hash(code),created:clock(),isDemo:0});}catch(e){if(duplicates(e))throw fail(409,'Cette version de votre IA est déjà inscrite.');throw e;}res.status(201).json({id});}));
  async function publicBot(b){if(!b)return null;const {code,...rest}=b;return {...rest,...await author(b.owner)};}
  app.get('/api/bots',route(async(req,res)=>{const id=String(req.query.library||'');if(id)await visibleLibrary(id);const rows=await store.all('bots',id?{library_id:id}:{},{sort:{created:-1},limit:100}),bots=[];for(const b of rows)if(await store.one('libraries',{id:b.library_id,hidden:0}))bots.push(await publicBot(b));res.json({bots});}));
  app.post('/api/matches',auth,csrf,route(async(req,res)=>{const a=await store.one('bots',{id:String(req.body.a)}),b=await store.one('bots',{id:String(req.body.b)});if(!a||!b)throw fail(400,'Choisissez deux IA publiées.');if(a.owner!==req.session.user_id)throw fail(403,'Votre IA doit être le challenger.');if(a.owner===b.owner)throw fail(400,'Les matchs classés opposent deux auteurs différents.');if(a.isDemo||b.isDemo)throw fail(400,'Les IA de démonstration ne participent pas aux classements publics.');
    if(a.library_id!==b.library_id||a.fighter!==b.fighter)throw fail(400,'Les IA doivent jouer le même personnage de la même version de bibliothèque.');const library=await visibleLibrary(a.library_id);
    if(await store.one('matches',{status:'running',$or:[{a:a.id},{b:a.id}]}))throw fail(409,'Cette IA participe déjà à un match.');const duelKey=[a.id,b.id].sort().join(':')+':'+clock().slice(0,10),id=randomUUID(),seed=randomBytes(4).readUInt32BE(0)%100000000;
    try{await store.insert('matches',{id,library_id:a.library_id,fighter:a.fighter,a:a.id,b:b.id,seed,status:'running',result:null,created:clock(),completed:null,isDemo:0,duelKey});}catch(e){if(duplicates(e))throw fail(409,'Ce duel compte déjà pour aujourd’hui.');throw e;}
    (async()=>{try{const result=await pool.run({type:'match',file:await store.file(library.file_id||library.id),a,b,fighter:a.fighter,seed},120000);await store.update('matches',{id},{status:'complete',result,completed:clock()});}catch(e){await store.update('matches',{id},{status:'failed',result:{error:e.message},completed:clock()});}})().catch(()=>console.error('Could not persist match result.'));
    res.status(202).json({id,status:'running'});}));
  app.get('/api/matches/:id',route(async(req,res)=>{const r=await store.one('matches',{id:req.params.id});if(!r)throw fail(404,'Combat introuvable.');await visibleLibrary(r.library_id);res.json(r);}));
  app.get('/api/leaderboard',route(async(req,res)=>{const period=['day','month','year'].includes(req.query.period)?req.query.period:'month',at=String(req.query.at||clock().slice(0,10));
    if(!/^\d{4}-\d{2}-\d{2}$/.test(at)||Number.isNaN(Date.parse(at))||new Date(at).toISOString().slice(0,10)!==at)throw fail(400,'Date de classement invalide.');
    const date=new Date(at),y=date.getUTCFullYear(),m=date.getUTCMonth(),d=date.getUTCDate(),since=new Date(Date.UTC(y,period==='year'?0:m,period==='day'?d:1)).toISOString(),until=new Date(Date.UTC(y+(period==='year'?1:0),period==='year'?0:m+(period==='month'?1:0),period==='day'?d+1:1)).toISOString();
    const library=String(req.query.library||''),fighter=Number(req.query.fighter||0);if(library)await visibleLibrary(library);
    const rows=await store.all('matches',{status:'complete',isDemo:0,completed:{$gte:since,$lt:until},...(library?{library_id:library,fighter}:{})},{sort:{completed:-1},limit:10000}),entries=new Map(),visible=[];
    for(const r of rows){const l=await store.one('libraries',{id:r.library_id,hidden:0});if(!l)continue;for(const id of [r.a,r.b])if(!entries.has(id)){const b=await publicBot(await store.one('bots',{id}));entries.set(id,{...b,libraryName:l.name,wins:0,losses:0,draws:0,points:0,games:0});}
      for(const game of r.result.games)for(const id of [r.a,r.b]){const e=entries.get(id);e.games++;if(game.winner===id){e.wins++;e.points+=3;}else if(!game.winner){e.draws++;e.points++;}else e.losses++;}visible.push({...r,libraryName:l.name});}
    res.json({period,at,since,until,timezone:'UTC',entries:[...entries.values()].sort((a,b)=>b.points-a.points||b.wins-a.wins||a.name.localeCompare(b.name)),matches:visible.slice(0,30)});}));
  app.use('/api',(_req,_res,next)=>next(fail(404,'Route inconnue.')));
  app.use(express.static(build,{index:false,dotfiles:'deny'}));app.get('*',(req,res,next)=>{if(path.extname(req.path))return next(fail(404,'Fichier introuvable.'));res.sendFile(path.join(build,'index.html'));});
  app.use((error,req,res,_next)=>{if(res.headersSent)return res.destroy();const internal=/Mongo|SQLITE|ENOENT|EACCES|ENOSPC/.test(error.name+' '+error.code),status=error.status||(error.type==='entity.too.large'?413:internal?500:400);
    if(status>=500)console.error('Request failed:',error.name,error.code||'');res.status(status).json({error:status>=500?'Le service n’a pas pu terminer cette opération. Réessayez plus tard.':status===413?'Le fichier dépasse 512 Mio.':error.message||'Requête impossible.'});});
  return {app,db:store.db,store,ready,pool,close:()=>store.close()};
}
if(require.main===module){if(fs.existsSync('.env'))process.loadEnvFile('.env');const service=createApp();service.ready.then(()=>{const port=Number(process.env.PORT||3013);const server=service.app.listen(port,process.env.HOST||'127.0.0.1',()=>console.log(`Arena Forge: http://${process.env.HOST||'127.0.0.1'}:${port} (${service.store.kind})`));const stop=()=>server.close(()=>service.close().then(()=>process.exit()));process.once('SIGTERM',stop);process.once('SIGINT',stop);}).catch(e=>{console.error('Database startup failed:',e.name);process.exitCode=1;service.close();});}
module.exports={createApp};
