// Deterministic crop/registration of generated illustrations; no pixel synthesis.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),puppeteer=require('puppeteer-core');
const worlds=require('./worlds.cjs');
(async()=>{const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,pipe:true});try{
 const page=await browser.newPage();
 for(let group=0;group<4;group++){
  const source=path.join(__dirname,'art','props-'+group+'.png');assert(fs.existsSync(source));
  const outputs=await page.evaluate(async src=>{
   const img=new Image();img.src=src;await img.decode();const output=[];
   for(let row=0;row<3;row++){
    const atlas=document.createElement('canvas');atlas.width=768;atlas.height=256;const ctx=atlas.getContext('2d');
    for(let col=0;col<3;col++){
     const left=Math.round(col*img.width/4),right=Math.round((col+1)*img.width/4),top=Math.round(row*img.height/3),bottom=Math.round((row+1)*img.height/3);
     const c=document.createElement('canvas');c.width=right-left;c.height=bottom-top;c.getContext('2d').drawImage(img,left,top,c.width,c.height,0,0,c.width,c.height);
     const pix=c.getContext('2d').getImageData(0,0,c.width,c.height).data,seen=new Uint8Array(c.width*c.height);let largest=null;
     // The generated atlas can spill a few pixels from an adjacent row into
     // this cell. Find the main object's crop rather than framing those crumbs.
     for(let i=0;i<seen.length;i++)if(!seen[i]&&pix[i*4+3]>40){
      const queue=[i];seen[i]=1;let x0=c.width,x1=0,y0=c.height,y1=0;
      for(let q=0;q<queue.length;q++){const n=queue[q],x=n%c.width,y=Math.floor(n/c.width);x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);
       for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const xx=x+dx,yy=y+dy,j=yy*c.width+xx;if(xx>=0&&xx<c.width&&yy>=0&&yy<c.height&&!seen[j]&&pix[j*4+3]>40){seen[j]=1;queue.push(j);}}
      }if(!largest||queue.length>largest.n)largest={x0,x1,y0,y1,n:queue.length};
     }
     if(!largest)throw Error('Empty prop frame');const {x0,x1,y0,y1}=largest;
     if(x0>=x1||y0>=y1)throw Error('Empty prop frame');
     // Front edge extends 17 px below the footprint centre. Preserve all alpha
     // pixels inside the original crop and fit to the exact renderer anchor.
     const anchor=[208,204,196][col],scale=Math.min(218/(x1-x0+1),(anchor+17-12)/(y1-y0+1));
     ctx.drawImage(c,x0,y0,x1-x0+1,y1-y0+1,col*256+128-(x1-x0+1)*scale/2,anchor+17-(y1-y0+1)*scale,(x1-x0+1)*scale,(y1-y0+1)*scale);
    }
    output.push(atlas.toDataURL('image/png').split(',')[1]);
   }return output;
  },'data:image/png;base64,'+fs.readFileSync(source).toString('base64'));
  outputs.forEach((bytes,row)=>{const world=worlds[group*3+row],file=path.join(__dirname,'assets',world.key,'map','props.png');fs.writeFileSync(file,Buffer.from(bytes,'base64'));console.log(world.key,'props framed');});
 }
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
