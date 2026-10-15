// Keep the Studio's readable source synchronized with the executed planner.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const file='src/bots/utilityBrain.js',source=read(file),marks=[...source.matchAll(/^  \/\/ @maison-stage:([a-z]+)$/gm)];
const chunk=(file,code,line=1)=>({file,line,code:code.trimEnd()});
const stages={};
for(let i=0;i<marks.length-1;i++){
 const m=marks[i],start=m.index+m[0].length+1;
 stages[m[1]]={chunks:[chunk(file,source.slice(start,marks[i+1].index),source.slice(0,start).split('\n').length)]};
}
stages.profile.chunks.unshift(chunk('src/bots/maison.js',read('src/bots/maison.js')));
stages.helpers={chunks:[chunk(file,source.slice(0,source.indexOf('// Une décision:'))),chunk('src/bots/tactics.js',read('src/bots/tactics.js'))]};
const data=JSON.stringify({version:1,sha256:crypto.createHash('sha256').update(source+read('src/bots/maison.js')+read('src/bots/tactics.js')).digest('hex'),stages},null,2)+'\n';
const output=path.join(root,'src/bots/maisonSource.json');
if(process.argv.includes('--check')){if(!fs.existsSync(output)||fs.readFileSync(output,'utf8')!==data)throw Error('Run node scripts/build_maison_source.cjs to refresh Maison source.');}
else fs.writeFileSync(output,data);
console.log('Maison source: seven executable stages + scoring helpers synchronized.');
