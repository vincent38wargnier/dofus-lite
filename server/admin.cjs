const fs=require('node:fs'),path=require('node:path'),{createStore}=require('./store.cjs');
if(fs.existsSync('.env'))process.loadEnvFile('.env');
const [command,handle,...rest]=process.argv.slice(2);
if(!['grant','revoke'].includes(command)||!handle||rest.length){console.error('Usage: node server/admin.cjs grant|revoke HANDLE');process.exit(1);}
const store=createStore({directory:process.env.DATA_DIR||path.resolve('var/community')});
(async()=>{try{await store.ready;const user=await store.one('users',store.kind==='mongodb'?{handleKey:handle.toLowerCase()}:{handle});if(!user||user.isDemo)throw Error('Register a real account first.');await store.update('users',{id:user.id},{admin:command==='grant'?1:0});console.log(command==='grant'?'Moderator access granted.':'Moderator access revoked.');}finally{await store.close();}})().catch(e=>{console.error(e.name);process.exitCode=1;});
