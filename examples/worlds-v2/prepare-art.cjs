// Framing and atlas extraction only. Generated illustration pixels are preserved.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),puppeteer=require('puppeteer-core');
const worlds=require('./worlds.cjs');const root=__dirname;
const kinds=['slash','thrust','arrow','ice-lance','shatter','fireball','fire-wave','shield','embers','raven-step','fang','rally','bell'];
const data=file=>'data:image/png;base64,'+fs.readFileSync(file).toString('base64');
async function main(){const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,pipe:true});const report=[];
 try{const page=await browser.newPage();for(const w of worlds){if(process.argv[2]&&process.argv[2]!==w.key)continue;
 const source=path.join(root,'art',w.key+'-sprites.png'),icons=path.join(root,'art',w.key+'-icons.png'),map=path.join(root,'art',w.key+'-map.png');assert(fs.existsSync(source)&&fs.existsSync(icons)&&fs.existsSync(map),'Missing finished illustrations: '+w.key);
 const output=await page.evaluate(async({sprite,icons,map,kinds})=>{
   const load=async source=>{const img=new Image();img.src=source;await img.decode();return img;},atlas=await load(sprite),iconAtlas=await load(icons),floor=await load(map);
   const crop=(image,col,row)=>{const x=Math.round(col*image.width/4),y=Math.round(row*image.height/4),right=Math.round((col+1)*image.width/4),bottom=Math.round((row+1)*image.height/4);const canvas=document.createElement('canvas');canvas.width=right-x;canvas.height=bottom-y;canvas.getContext('2d').drawImage(image,x,y,canvas.width,canvas.height,0,0,canvas.width,canvas.height);return canvas;};
   const encode=c=>c.toDataURL('image/png').split(',')[1],result=[],positions=[[0,0],[1,0],[2,0],[3,0],[0,2],[1,2],[2,2]];
   const bounds=c=>{const pixels=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let left=c.width,right=0,top=c.height,bottom=0,transparent=0;
     for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){const a=pixels[(y*c.width+x)*4+3];if(a<12)transparent++;if(a>40){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}}
     if(transparent/(c.width*c.height)<.12||left>=right)throw Error('Sprite needs transparent margins and visible pixels.');
     let footL=c.width,footR=0;for(let y=Math.round(bottom-(bottom-top)*.08);y<=bottom;y++)for(let x=left;x<=right;x++)if(pixels[(y*c.width+x)*4+3]>90){footL=Math.min(footL,x);footR=Math.max(footR,x);}
     return {left,right,top,bottom,anchor:(footL+footR)/2};};
   positions.forEach(([col,row],owner)=>{
     const poses=[crop(atlas,col,row),crop(atlas,col,row+1)],bs=poses.map(bounds),scale=Math.min(...bs.map(b=>Math.min(200/(b.bottom-b.top+1),110/Math.max(b.anchor-b.left,b.right-b.anchor,1))));
     poses.forEach((pose,i)=>{const b=bs[i],canvas=document.createElement('canvas');canvas.width=canvas.height=256;const ctx=canvas.getContext('2d');ctx.imageSmoothingQuality='high';ctx.drawImage(pose,b.left,b.top,b.right-b.left+1,b.bottom-b.top+1,128+(b.left-b.anchor)*scale,224-(b.bottom-b.top)*scale,(b.right-b.left+1)*scale,(b.bottom-b.top+1)*scale);result.push({file:owner+'/'+(i?'idle-back':'idle-front')+'.png',data:encode(canvas),bounds:b});});
     const b=bs[0],portrait=document.createElement('canvas');portrait.width=portrait.height=256;const ctx=portrait.getContext('2d');ctx.imageSmoothingQuality='high';const h=(b.bottom-b.top+1)*.69,sz=Math.max(h,(b.right-b.left+1)*.7),center=(b.left+b.right)/2;ctx.drawImage(poses[0],center-sz/2,b.top,sz,sz,0,0,256,256);result.push({file:owner+'/portrait.png',data:encode(portrait)});
   });
   kinds.forEach((kind,i)=>{const part=crop(iconAtlas,i%4,Math.floor(i/4)),c=document.createElement('canvas');c.width=c.height=64;c.getContext('2d').drawImage(part,0,0,64,64);result.push({file:'icons/'+kind+'.png',data:encode(c)});});
   const c=document.createElement('canvas');c.width=1536;c.height=1024;c.getContext('2d').drawImage(floor,0,0,1536,1024);result.push({file:'map/floor.png',data:encode(c)});
   return result;
 },{sprite:data(source),icons:data(icons),map:data(map),kinds});
 for(const asset of output){const file=path.join(root,'assets',w.key,asset.file);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,Buffer.from(asset.data,'base64'));}report.push({world:w.key,images:output.length,anchors:output.filter(a=>a.bounds).map(a=>({file:a.file,bounds:a.bounds}))});console.log(w.key,output.length,'framed images');}
 fs.writeFileSync(path.join(root,'artwork-report'+(process.argv[2]?'-'+process.argv[2]:'')+'.json'),JSON.stringify(report,null,2));
 }finally{await browser.close();}}
main().catch(e=>{console.error(e);process.exitCode=1;});
