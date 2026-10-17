const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {build,worlds}=require('./build.cjs'),e=require('../../server/generated/runtime.cjs'),{WorkerPool}=require('../../server/workerPool.cjs');
const root=__dirname,out=path.resolve('var/demo-libraries'),assetRoot=path.join(root,'assets');
const kinds=['slash','thrust','arrow','ice-lance','shatter','fireball','fire-wave','shield','embers','raven-step','fang','rally','bell'];
async function packageWorld(w){
 const {characters,equipment,dungeon,report}=build(w),records=new Map();
 const image=(world,file)=>new File([fs.readFileSync(path.join(assetRoot,world,file))],path.basename(file),{type:'image/png'});
 for(let i=0;i<7;i++)records.set(`world-${w.key}-${i}-v2`,{name:i<3?w.heroes[i][0]:w.enemies[i-3],images:Object.fromEntries(['portrait.png','idle-front.png','idle-back.png'].map(f=>[f,image(w.key,i+'/'+f)]))});
 records.set(`world-${w.key}-icons-v2`,{name:w.title+' : capacités',images:Object.fromEntries(kinds.map(k=>['icons/'+k+'.png',image(w.key,'icons/'+k+'.png')]))});
 records.set(`world-${w.key}-map-v2`,{name:w.title+' : terrain',images:{'floor.png':image(w.key,'map/floor.png'),'props.png':image(w.key,'map/props.png')}});
 const archive=await e.buildAtelierArchive({characters,dungeons:[dungeon],equipment},{readArtwork:async id=>{assert(records.has(id),'Missing artwork '+id);return records.get(id);}});
 const description=w.premise+'\n\n3 salles progressives, 3 héros équipés à 8 sorts, 4 familles ennemies, 24 équipements. Portraits, personnages face/dos, icônes et terrain illustrés inclus. Les capacités ont des effets originaux du moteur. Les positions et les histoires sont des adaptations ludiques, pas une reconstitution officielle.\n\nBibliothèque d’exemple : auteur et échanges associés fictifs. Les notes des joueurs sont réelles et indépendantes.';
 let bytes=e.wrapLibrary(archive.bytes,{name:w.title,description,release:'2.0.0',kind:'adventure'});
 bytes=await e.withLibraryCover(bytes,fs.readFileSync(path.resolve('examples/community-covers',w.key+'.png')),(b,n)=>new Uint8Array(require('node:zlib').inflateRawSync(b,{maxOutputLength:n})));
 const file=path.join(out,w.key+'-v2.zip');fs.writeFileSync(file,Buffer.from(bytes));
 const designFile=path.join(root,'reports',w.key+'-design.json');fs.mkdirSync(path.dirname(designFile),{recursive:true});fs.writeFileSync(designFile,JSON.stringify(report,null,2));
 return {key:w.key,file,bytes:bytes.length,images:archive.manifest.artwork.reduce((n,a)=>n+Object.keys(a.images).length,0),release:'2.0.0'};
}
async function main(){fs.mkdirSync(out,{recursive:true});const pool=new WorkerPool({concurrency:1}),report=[];
 for(const w of worlds){if(process.argv[2]&&process.argv[2]!==w.key)continue;const r=await packageWorld(w);const v=await pool.run({type:'validate',file:r.file},120000);assert.equal(v.warnings.length,0,JSON.stringify(v.warnings));report.push({...r,counts:v.counts,arena:v.arena});console.log(w.key,r.images+' images',JSON.stringify(v.counts));}
 fs.writeFileSync(path.join(root,process.argv[2]?'package-report-'+process.argv[2]+'.json':'package-report.json'),JSON.stringify(report,null,2));
}
module.exports={packageWorld};if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
