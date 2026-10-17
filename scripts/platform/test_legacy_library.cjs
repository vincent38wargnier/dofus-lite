const {test,before}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const root=path.resolve(__dirname,'../..'),file=process.env.LEGACY_LIBRARY||path.join(root,'var/private-libraries/dofus-retro.arena-library.zip');
const lib=require('../../server/generated/library.cjs');
let parsed,engine;
before(async()=>{
 const bytes=fs.readFileSync(file);
 parsed=await lib.readLibrary(bytes,(b,size)=>new Uint8Array(zlib.inflateRawSync(b,{maxOutputLength:size})),lib.LOCAL_LIBRARY_LIMITS);
 globalThis.__ARENA_CATALOGUE__=lib.mergeCatalogues([parsed]);
 engine=require('../../server/generated/runtime.cjs');
});
test('private archive restores every original catalogue collection exactly',()=>{
 for(const [key,name]of Object.entries({spellLibrary:'spellLibrary',monsterData:'monsterData',equipmentData:'equipmentData',dungeonData:'dungeonData',dungeonMaps:'dungeonMaps',classData:'legacyClassData'}))assert.deepEqual(parsed.catalogue[key],JSON.parse(fs.readFileSync(path.join(root,'src/engine/'+name+'.json'))),key);
 const original=JSON.parse(fs.readFileSync(path.join(root,'src/engine/forgemagieData.json')));
 for(const key of ['runes','potions','nonMageableIds'])assert.deepEqual(parsed.catalogue.forging[key],original[key]);
 assert.equal(parsed.metadata.kind,'catalogue');assert.equal(Object.keys(engine.ITEMS).length,6490);
});
test('all imported classes compile their complete spellbook and enter a fight',()=>{
 for(const classId of Object.keys(parsed.catalogue.classData.builds)){
  const loadout={...engine.emptyLoadout(classId),level:200};
  const {state}=engine.createGame({mapId:'arene',fighters:[{id:'A',classId,loadout},{id:'B',classId:'IOP'}]});
  assert.ok(Object.keys(engine.spellsOf(state.fighters.A)).length>=21,classId);
  assert.equal(state.fighters.A.basePa,7,classId);
 }
});
test('every available native dungeon has its full group and valid own map',()=>{
 for(const room of parsed.catalogue.dungeonData.encounters){
  const enemies=room.members.flatMap(m=>Array.from({length:m.count},()=>({monsterId:m.monsterId,monsterGrade:Number(Object.keys(parsed.catalogue.monsterData.monsters[m.monsterId].grades).at(-1))}))).map((m,i)=>({...m,id:i?'B'+(i+1):'B',team:'B'}));
  const {state}=engine.createGame({mapId:room.combatMapId,fighters:[{id:'A',classId:'IOP'},...enemies]});
  assert.equal(Object.keys(state.fighters).length,enemies.length+1,room.id);
  assert.equal(new Set(Object.values(state.fighters).map(f=>`${f.pos.x},${f.pos.y}`)).size,enemies.length+1,room.id);
 }
});
test('manifest, scenery, actors, accessories, spell icons and audio are self-contained',()=>{
 const manifest=JSON.parse(Buffer.from(parsed.files.get('assets/manifest.json')));
 const present=url=>assert.ok(parsed.files.has('assets/'+url),url);
 for(const actor of Object.values(manifest.actors))present(actor.url);
 for(const map of Object.values(manifest.maps))for(const layer of map.layers){present(layer.image);present(layer.swf);}
 for(const id of manifest.renderedSpellIcons)present(manifest.spells[id].icon);
 for(const url of Object.keys(manifest.accessories.libraries))present('raw/'+url);
 for(const url of [...Object.values(manifest.audio.effects),...Object.values(manifest.audio.musics)])present(url);
 present('spell-catalogue.json');present('spell-audit.json');
});
test('complete catalogues fit both private import and explicit publication limits',async()=>{
 assert.equal(lib.LIBRARY_LIMITS.zipBytes,512*1048576);assert.equal(lib.LOCAL_LIBRARY_LIMITS.zipBytes,512*1048576);
 assert.equal((await lib.readLibrary(fs.readFileSync(file))).metadata.kind,'catalogue');
});
test('reinstalling identical catalogue definitions does not duplicate content',()=>{
 const once=lib.mergeCatalogues([parsed]),twice=lib.mergeCatalogues([parsed,parsed]);
 for(const key of ['classData','equipmentData','spellLibrary','forgemagieData'])assert.deepEqual(once[key],twice[key]);
 assert.equal(twice.dungeonData.encounters.length,55);
});
test('limited movie bridge plays cues but cannot evaluate code or call page functions',()=>{
 const {SAFE_CALL,limitedRuffle}=require('./limited_ruffle.cjs'),calls=[];
 const bridge=new Function('e','_','globalThis','return '+SAFE_CALL);
 const page={dofusLiteSound:(...args)=>calls.push(args),alert:()=>assert.fail('arbitrary callback')};
 bridge('dofusLiteSound',['PUNCH','scope'],page);assert.deepEqual(calls,[['PUNCH','scope']]);
 for(const name of ['eval','alert','globalThis.alert','(()=>{globalThis.alert()})'])assert.equal(bridge(name,['attack','scope'],page),null);
 assert.equal(bridge('dofusLiteSound',[{}],page),null);
 const vendor=path.dirname(require.resolve('@ruffle-rs/ruffle/package.json'));
 for(const name of fs.readdirSync(vendor).filter(n=>/^core.*\.js$/.test(n))){const safe=limitedRuffle(name,fs.readFileSync(path.join(vendor,name),'utf8'));assert.ok(!safe.includes('new Function(`return (${e})'));}
 assert.throws(()=>limitedRuffle('ruffle.js','changed vendor'),/Vendor bridge changed/);
});
