// Shared asynchronous repository. SQLite is an offline development option;
// Configured deployments use MongoDB metadata and persistent files or optional GridFS.
const fs = require('node:fs'), path = require('node:path');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { openDatabase } = require('./db.cjs');
const tables = ['users','sessions','libraries','votes','ratings','downloads','topics','replies','reports','bots','matches','post_votes','subscriptions','notifications'];
const jsonFields = new Set(['counts','arena','result','demoActivity']);
const duplicates = error => error?.code === 11000 || /UNIQUE constraint/.test(error?.message || '');
const ident = name => { if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) throw Error('Invalid field'); return '"'+name+'"'; };
function sqlWhere(query = {}, args = []) {
  const clauses = Object.entries(query).map(([key,value]) => {
    if (key === '$or' || key === '$and') return '('+value.map(q=>sqlWhere(q,args)).join(key==='$or'?' OR ':' AND ')+')';
    const field=ident(key);
    if(value===null)return field+' IS NULL';
    if(value && typeof value==='object') return Object.entries(value).map(([op,v])=>{
      if(op==='$in'){if(!v.length)return '0';args.push(...v);return field+' IN ('+v.map(()=>'?').join(',')+')';}
      if(op==='$regex'){args.push('%'+v.replace(/\\(.)/g,'$1').replace(/[\\%_]/g,m=>'\\'+m)+'%');return field+" LIKE ? ESCAPE '\\'";}
      const sign={$gte:'>=',$gt:'>',$lt:'<',$lte:'<=',$ne:'!='}[op];if(!sign)throw Error('Unsupported filter');
      if(v===null)return field+' IS NOT NULL';args.push(typeof v==='boolean'?+v:v);return field+sign+'?';
    }).join(' AND ');
    args.push(typeof value==='boolean'?+value:value);return field+'=?';
  });
  return clauses.join(' AND ') || '1';
}
const unpack=row=>row && Object.fromEntries(Object.entries(row).map(([k,v])=>[k,jsonFields.has(k)&&typeof v==='string'?JSON.parse(v):v]));
const pack=(k,v)=>jsonFields.has(k)&&v!=null?JSON.stringify(v):typeof v==='boolean'?+v:v;
function sqliteStore(directory) {
  const db=openDatabase(directory), uploads=path.join(directory,'uploads');fs.mkdirSync(uploads,{recursive:true,mode:0o700});
  const table=t=>{if(!tables.includes(t))throw Error('Unknown collection');return ident(t);};
  const api={kind:'sqlite',db,ready:Promise.resolve(),
    async ratingSummary(libraryId) { const row=db.prepare('SELECT count(*) count,avg(value) average FROM ratings WHERE library_id=?').get(libraryId);return {count:row.count,average:row.average}; },
    async setRating(userId,libraryId,value,updated) { db.prepare('INSERT INTO ratings(user_id,library_id,value,updated) VALUES(?,?,?,?) ON CONFLICT(user_id,library_id) DO UPDATE SET value=excluded.value,updated=excluded.updated').run(userId,libraryId,value,updated); },
    async forumFeed(filter,{sort='active',userId=null,limit=30,skip=0}={}) {
      const args=[],where=sqlWhere(filter,args);
      const order=sort==='top'?'likes DESC,created DESC,id DESC':sort==='new'?'created DESC,id DESC':'COALESCE(updated,created) DESC,created DESC,id DESC';
      return db.prepare(`SELECT topics.*,
        (SELECT count(*) FROM post_votes WHERE kind='topic' AND target=topics.id) likes,
        (SELECT count(*) FROM replies WHERE topic_id=topics.id AND hidden=0) replies,
        EXISTS(SELECT 1 FROM post_votes WHERE kind='topic' AND target=topics.id AND user_id=?) liked,
        EXISTS(SELECT 1 FROM subscriptions WHERE topic_id=topics.id AND user_id=?) following
        FROM topics WHERE ${where} ORDER BY ${order} LIMIT ? OFFSET ?`).all(userId,userId,...args,limit,skip).map(row=>({...unpack(row),liked:!!row.liked,following:!!row.following}));
    },
    async all(t,q={},options={}){const a=[],where=sqlWhere(q,a),sort=options.sort?' ORDER BY '+Object.entries(options.sort).map(([k,v])=>ident(k)+(v<0?' DESC':' ASC')).join(','):'';
      return db.prepare(`SELECT * FROM ${table(t)} WHERE ${where}${sort} LIMIT ? OFFSET ?`).all(...a,options.limit??10000,options.skip??0).map(unpack);},
    async one(t,q={}){return (await api.all(t,q,{limit:1}))[0]||null;},
    async count(t,q={}){const a=[],where=sqlWhere(q,a);return db.prepare(`SELECT count(*) n FROM ${table(t)} WHERE ${where}`).get(...a).n;},
    async insert(t,record){const entries=Object.entries(record);db.prepare(`INSERT INTO ${table(t)} (${entries.map(([k])=>ident(k)).join(',')}) VALUES (${entries.map(()=>'?').join(',')})`).run(...entries.map(([k,v])=>pack(k,v)));return record;},
    async update(t,q,changes){const entries=Object.entries(changes),a=[],where=sqlWhere(q,a);const r=db.prepare(`UPDATE ${table(t)} SET ${entries.map(([k])=>ident(k)+'=?').join(',')} WHERE ${where}`).run(...entries.map(([k,v])=>pack(k,v)),...a);return r.changes;},
    async remove(t,q){const a=[],where=sqlWhere(q,a);return db.prepare(`DELETE FROM ${table(t)} WHERE ${where}`).run(...a).changes;},
    async once(t,q,record){try{return await api.insert(t,{...q,...record}),true;}catch(e){if(duplicates(e))return false;throw e;}},
    async putFile(id,input){const file=path.join(uploads,id+'.zip');await pipeline(typeof input==='string'?fs.createReadStream(input):Readable.from([input]),fs.createWriteStream(file,{flags:'wx',mode:0o600}));},
    async hasFile(id){return fs.existsSync(path.join(uploads,id+'.zip'));},
    async deleteFile(id){await fs.promises.rm(path.join(uploads,id+'.zip'),{force:true});},
    async file(id){return path.join(uploads,id+'.zip');},
    async sendFile(id,res){await pipeline(fs.createReadStream(await api.file(id)),res);},
    async close(){db.close();},
  };return api;
}
function mongoStore({uri,database='arenaforge',directory,prefix='',fileStorage='filesystem'}) {
  const {MongoClient,GridFSBucket}=require('mongodb');
  if(!/^[a-zA-Z0-9_-]+$/.test(database)||!(/^[a-zA-Z0-9_]*$/).test(prefix))throw Error('Invalid database namespace');
  const client=new MongoClient(uri,{maxPoolSize:20,serverSelectionTimeoutMS:15000,appName:'ArenaForge'}),db=client.db(database);
  const bucket=new GridFSBucket(db,{bucketName:prefix+'library_files',chunkSizeBytes:1024*1024});
  const collection=t=>{if(!tables.includes(t))throw Error('Unknown collection');return db.collection(prefix+t);};
  const cache=path.join(directory,'worker-cache');fs.mkdirSync(cache,{recursive:true,mode:0o700});
  const uploads=path.join(directory,prefix+'uploads');fs.mkdirSync(uploads,{recursive:true,mode:0o700});
  const filePath=id=>{if(!/^[a-zA-Z0-9_-]+$/.test(id))throw Error('Invalid file id');return path.join(uploads,id+'.zip');};
  const normalize=r=>{if(!r)return null;const {_id,...record}=r;return record;};
  const query=q=>Array.isArray(q)?q.map(query):q&&typeof q==='object'?Object.fromEntries([...Object.entries(q).map(([k,v])=>[k,query(v)]),...(q.$regex?[['$options','i']]:[])]):q;
  const api={kind:'mongodb',db,client,bucket,collection,
    async ratingSummary(libraryId) { await api.ready;const [row]=await collection('ratings').aggregate([{$match:{library_id:libraryId}},{$group:{_id:null,count:{$sum:1},average:{$avg:'$value'}}}]).toArray();return {count:row?.count||0,average:row?.average??null}; },
    async setRating(userId,libraryId,value,updated) { await api.ready;const key={user_id:userId,library_id:libraryId};try{await collection('ratings').updateOne(key,{$set:{value,updated}},{upsert:true});}catch(error){if(!duplicates(error))throw error;await collection('ratings').updateOne(key,{$set:{value,updated}});} },
    async forumFeed(filter,{sort='active',userId=null,limit=30,skip=0}={}) {
      await api.ready;
      const votes=[{$lookup:{from:prefix+'post_votes',localField:'id',foreignField:'target',pipeline:[
        {$match:{kind:'topic'}},{$group:{_id:null,count:{$sum:1},mine:{$max:{$cond:[{$eq:['$user_id',userId]},1,0]}}}},
      ],as:'_votes'}},{$set:{likes:{$ifNull:[{$first:'$_votes.count'},0]},liked:{$eq:[{$first:'$_votes.mine'},1]}}}];
      const pipeline=[{$match:query(filter)},{$set:{_activity:{$ifNull:['$updated','$created']}}}];
      if(sort==='top')pipeline.push(...votes);
      pipeline.push({$sort:sort==='top'?{likes:-1,created:-1,id:-1}:sort==='new'?{created:-1,id:-1}:{_activity:-1,created:-1,id:-1}},{$skip:skip},{$limit:limit});
      if(sort!=='top')pipeline.push(...votes);
      pipeline.push(
        {$lookup:{from:prefix+'replies',localField:'id',foreignField:'topic_id',pipeline:[{$match:{hidden:0}},{$count:'count'}],as:'_replies'}},
        {$lookup:{from:prefix+'subscriptions',localField:'id',foreignField:'topic_id',pipeline:[{$match:{user_id:userId}},{$limit:1},{$project:{_id:0,topic_id:1}}],as:'_following'}},
        {$set:{replies:{$ifNull:[{$first:'$_replies.count'},0]},following:{$gt:[{$size:'$_following'},0]}}},
        {$unset:['_votes','_replies','_following','_activity','_id']},
      );
      return collection('topics').aggregate(pipeline).toArray();
    },
    ready:(async()=>{await client.connect();await db.command({ping:1});
      for(const t of tables)if(!['votes','ratings','downloads','sessions','post_votes','subscriptions'].includes(t))await collection(t).createIndex({id:1},{unique:true});
      await collection('ratings').createIndex({user_id:1,library_id:1},{unique:true});
      await collection('ratings').createIndex({library_id:1});
      const indexes={users:[[{handleKey:1},{unique:true}]],sessions:[[{token:1},{unique:true}],[{expiresAt:1},{expireAfterSeconds:0}]],libraries:[[{owner:1,sha256:1},{unique:true,partialFilterExpression:{hidden:0}}],[{hidden:1,created:-1},{}]],votes:[[{user_id:1,library_id:1},{unique:true}]],downloads:[[{library_id:1,visitor:1,day:1},{unique:true}]],topics:[[{library_id:1,hidden:1,updated:-1},{}]],replies:[[{topic_id:1,hidden:1,created:1},{}]],post_votes:[[{user_id:1,kind:1,target:1},{unique:true}],[{target:1,kind:1},{}]],subscriptions:[[{user_id:1,topic_id:1},{unique:true}]],notifications:[[{user_id:1,seen:1,created:-1},{}]],bots:[[{owner:1,library_id:1,fighter:1,sha256:1},{unique:true}]],matches:[[{library_id:1,fighter:1,status:1,completed:-1},{}],[{duelKey:1},{unique:true,partialFilterExpression:{status:{$in:['running','complete']},duelKey:{$type:'string'}}}]]};
      for(const [t,items] of Object.entries(indexes))for(const [keys,options] of items)await collection(t).createIndex(keys,options);
    })(),
    async all(t,q={},options={}){await api.ready;let c=collection(t).find(query(q));if(options.sort)c=c.sort(options.sort);return (await c.skip(options.skip||0).limit(options.limit??10000).toArray()).map(normalize);},
    async one(t,q={}){await api.ready;return normalize(await collection(t).findOne(query(q)));},
    async count(t,q={}){await api.ready;return collection(t).countDocuments(query(q));},
    async insert(t,record){await api.ready;const doc={...record};if(t==='users')doc.handleKey=doc.handle.toLowerCase();if(t==='sessions')doc.expiresAt=new Date(doc.expires);await collection(t).insertOne(doc);return record;},
    async update(t,q,changes){await api.ready;return (await collection(t).updateMany(q,{$set:changes})).modifiedCount;},
    async remove(t,q){await api.ready;return (await collection(t).deleteMany(q)).deletedCount;},
    async once(t,q,record){await api.ready;try{return !!(await collection(t).updateOne(q,{$setOnInsert:{...q,...record}},{upsert:true})).upsertedCount;}catch(e){if(duplicates(e))return false;throw e;}},
    async putFile(id,input){await api.ready;if(fileStorage==='filesystem'){const target=filePath(id),temp=target+'.'+require('node:crypto').randomUUID()+'.part';try{if(fs.existsSync(target))throw Error('Library file already exists');await pipeline(typeof input==='string'?fs.createReadStream(input):Readable.from([input]),fs.createWriteStream(temp,{mode:0o600,flags:'wx'}));await fs.promises.rename(temp,target);return;}catch(e){await fs.promises.rm(temp,{force:true});throw e;}}const upload=bucket.openUploadStreamWithId(id,id+'.zip');try{await pipeline(typeof input==='string'?fs.createReadStream(input):Readable.from([input]),upload);}catch(e){await upload.abort().catch(()=>{});throw e;}},
    async hasFile(id){await api.ready;return fileStorage==='filesystem'?fs.existsSync(filePath(id)):!!(await bucket.find({_id:id}).limit(1).next());},
    async deleteFile(id){await api.ready;if(fileStorage==='filesystem')await fs.promises.rm(filePath(id),{force:true});else if(await api.hasFile(id))await bucket.delete(id);await fs.promises.rm(path.join(cache,id+'.zip'),{force:true});},
    async file(id){await api.ready;if(fileStorage==='filesystem')return filePath(id);if(!/^[a-zA-Z0-9_-]+$/.test(id))throw Error('Invalid file id');const target=path.join(cache,id+'.zip');if(fs.existsSync(target))return target;
      const temp=target+'.'+require('node:crypto').randomUUID()+'.part';try{await pipeline(bucket.openDownloadStream(id),fs.createWriteStream(temp,{mode:0o600,flags:'wx'}));await fs.promises.rename(temp,target);return target;}catch(e){await fs.promises.rm(temp,{force:true});throw e;}},
    async sendFile(id,res){await api.ready;await pipeline(fileStorage==='filesystem'?fs.createReadStream(filePath(id)):bucket.openDownloadStream(id),res);},
    async close(){await client.close();},
  };return api;
}
function createStore({directory,uri=process.env.MONGODB_URI,database=process.env.MONGODB_DB||'arenaforge',prefix='',fileStorage=process.env.LIBRARY_FILE_STORE||'filesystem'}={}){if(!['filesystem','gridfs'].includes(fileStorage))throw Error('Unsupported library storage');return uri?mongoStore({directory,uri,database,prefix,fileStorage}):sqliteStore(directory);}
module.exports={createStore,duplicates,tables};
