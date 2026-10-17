// Explicit fictional activity, kept outside real votes, downloads and rankings.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const themes=require('./demo_themes.cjs'),{createStore}=require('../../server/store.cjs'),{coverStore}=require('../../server/covers.cjs');
const activity=[ [247,2316],[198,1684],[84,647],[167,1252],[183,1439],[211,1923],[176,1327],
  [223,2068],[194,1725],[181,1563],[205,1847],[92,738],[139,1089],[152,1176] ];
const demoActivity=index=>({likes:activity[index][0],downloads:activity[index][1],from:'2026-06-01',to:'2026-10-15',simulated:true});
async function decorate({store,directory=path.resolve('var/community'),images=path.resolve('examples/community-covers'),withCovers=true}={}){
  await store.ready;const covers=coverStore(directory),report=[];
  for(let i=0;i<themes.length;i++){
    const t=themes[i],id='demo-library-'+t.key,row=await store.one('libraries',{id});
    assert(row?.isDemo===1,'Only existing explicitly fictional libraries can be decorated: '+id);
    const cover=withCovers?await covers.put(fs.readFileSync(path.join(images,t.key+'.png'))):{};
    await store.update('libraries',{id,isDemo:1},{...cover,demoActivity:demoActivity(i)});
    const topics=await store.all('topics',{library_id:id,isDemo:1});
    for(let j=0;j<topics.length;j++){
      await store.update('topics',{id:topics[j].id,isDemo:1},{demoLikes:12+(i*17+j*13)%61});
      const replies=await store.all('replies',{topic_id:topics[j].id,isDemo:1});
      for(let k=0;k<replies.length;k++)await store.update('replies',{id:replies[k].id,isDemo:1},{demoLikes:2+(i*5+j*11+k*7)%28});
    }
    report.push({id,cover:!!cover.coverHash,simulated:demoActivity(i)});
  }
  return report;
}
module.exports={decorate,demoActivity};
if(require.main===module){if(fs.existsSync('.env'))process.loadEnvFile('.env');const directory=process.env.DATA_DIR||path.resolve('var/community'),store=createStore({directory});decorate({store,directory,withCovers:!process.argv.includes('--activity-only')}).then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>store.close());}
