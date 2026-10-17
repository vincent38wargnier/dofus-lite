// Original integration fixture, never installed or published by the application.
const engine = require('../../server/generated/runtime.cjs');
const {PNG}=require('pngjs');
function png(width,height,color,transparent=false) {
 const p=new PNG({width,height});
 for(let y=0;y<height;y++)for(let x=0;x<width;x++) {const i=(y*width+x)*4;p.data[i]=color[0];p.data[i+1]=color[1];p.data[i+2]=color[2];p.data[i+3]=transparent&&(x%256<45||x%256>210||y<25||y>230)?0:255;}
 return PNG.sync.write(p);
}
async function fixture() {
 const spell=engine.newAuthoredSpell();spell.name='Lueur du prisme';
 const item={...engine.newCustomEquipment(-100016),id:1000000001,name:'Couronne du veilleur',level:200,stats:{vitalite:80,intelligence:35}};
 const character={id:'hero',name:'Veilleur du prisme',classId:'CREATOR',loadout:{...engine.emptyLoadout('CREATOR'),level:200,artworkId:'prism-hero',spells:{custom:[spell],order:[]},customEquipment:{[item.id]:item}}};
 character.loadout.slots.hat=item.id;
 const creature={key:'prism-guard',name:'Gardien de verre',reference:{},base:{...engine.creatureBase(),baseHp:180},tuning:{hpPercent:100,statsPercent:100,paBonus:0,pmBonus:0},artworkId:engine.characterShapeId('warden','#ac84ef'),spells:[{...spell,name:'Éclat du gardien'}]};
 const battlefield={version:1,id:'custom-prism',name:'Cour du prisme',description:'Un terrain original de vérification.',width:8,height:8,background:{artworkId:'prism-map',file:'floor.png',width:512,height:320,hw:32,top:0,originX:8},obstacles:[],startingCells:[Array.from({length:8},(_,y)=>({x:1,y})),Array.from({length:8},(_,y)=>({x:6,y}))]};
 const room={id:'prism-room',name:'Le gardien du prisme',mapId:battlefield.id,battlefield,members:[{customMonster:creature,count:1}],adventure:{version:1,mode:'fixed',partySize:1,allowAI:true,description:'Retrouvez la lumière perdue. Écartez le gardien pour ouvrir la cour.',heroes:[{id:'hero-one',character}]}};
 const images={portrait:new File([png(256,256,[73,160,145])],'portrait.png'),front:new File([png(256,256,[73,160,145],true)],'idle-front.png'),back:new File([png(256,256,[37,80,73],true)],'idle-back.png')};
 const records={'prism-hero':{id:'prism-hero',name:'Veilleur',images:Object.fromEntries(Object.values(images).map(f=>[f.name,f]))},'prism-map':{id:'prism-map',name:'Cour',images:{'floor.png':new File([png(512,320,[32,54,48])],'floor.png')}}};
 const archive=await engine.buildAtelierArchive({characters:[character],dungeons:[room],equipment:[item]},{readArtwork:id=>records[id]});
 return {bytes:Buffer.from(engine.wrapLibrary(archive.bytes,{name:'Les Veilleurs du Prisme',description:'Une aventure originale de test : retrouvez la lumière perdue dans la cour du prisme. Un héros équipé, un gardien et une carte indépendante.',release:'1.0.0',kind:'adventure'})),character,room,records,item};
}
module.exports={fixture,png};
if(require.main===module)fixture().then(({bytes})=>{require('node:fs').writeFileSync(process.argv[2]||'/tmp/arena-original-adventure.zip',bytes);console.log('Original fixture created:',bytes.length,'bytes');}).catch(e=>{console.error(e);process.exitCode=1;});
