const fs=require('node:fs'),path=require('node:path'),{createHash,randomUUID}=require('node:crypto'),{PNG}=require('pngjs');
const {inspectCover}=require('./generated/library.cjs');
function verifyCover(bytes){
  const info=inspectCover(bytes),png=PNG.sync.read(Buffer.from(bytes),{checkCRC:true});
  let visible=false;for(let i=3;i<png.data.length;i+=4)if(png.data[i]){visible=true;break;}
  if(!visible)throw Error('Couverture : image vide.');
  return info;
}
function coverStore(directory){
  const root=path.join(directory,'covers');fs.mkdirSync(root,{recursive:true,mode:0o700});
  const file=hash=>{if(!/^[a-f0-9]{64}$/.test(hash))throw Error('Invalid cover hash');return path.join(root,hash+'.png');};
  return {file,async put(input){
    const bytes=Buffer.from(input),info=verifyCover(bytes),coverHash=createHash('sha256').update(bytes).digest('hex'),target=file(coverHash);
    if(!fs.existsSync(target)){const temp=target+'.'+randomUUID()+'.part';try{await fs.promises.writeFile(temp,bytes,{mode:0o600,flag:'wx'});await fs.promises.rename(temp,target);}catch(e){await fs.promises.rm(temp,{force:true});throw e;}}
    return {coverHash,coverWidth:info.width,coverHeight:info.height};
  }};
}
module.exports={verifyCover,coverStore};
