const { PNG } = require('pngjs');
async function verifyPixels(file, definition) {
  const bytes=Buffer.from(await file.arrayBuffer());
  if(bytes.length<24)throw Error(`${file.name} : PNG tronqué.`);
  const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);
  if(width<1||height<1||width>4096||height>4096||width*height>8*1048576)throw Error(`${file.name} : dimensions hors limites.`);
  const png=PNG.sync.read(bytes,{checkCRC:true});
  const frames=definition.frames||1,fw=definition.width?definition.width/frames:definition.frameSize||256,fh=definition.height||definition.frameSize||256;
  if(fw*frames!==png.width||fh!==png.height)throw Error(`${file.name} : dimensions incohérentes.`);
  for(let frame=0;frame<frames;frame++){
    let visible=false,transparent=false;
    for(let y=0;y<fh;y++)for(let x=0;x<fw;x++){const alpha=png.data[(y*png.width+frame*fw+x)*4+3];if(alpha)visible=true;if(alpha===0)transparent=true;}
    if(!visible)throw Error(`${file.name} : image ${frame+1} vide.`);
    if(definition.pose!=='portrait'&&!transparent)throw Error(`${file.name} : fond transparent requis.`);
  }
}
module.exports={verifyPixels};
