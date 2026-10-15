// Actual import and camera gestures in clean Chrome storage. Never user saves.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),puppeteer=require('puppeteer-core');
require('../../scripts/ai_runtime.cjs');
const { prepareWorkshopFile } = require('../../src/ui/atelierArchive');
const out=path.resolve(__dirname,'../../public/adventures/winterfell-last-stand/proof');fs.mkdirSync(out,{recursive:true});
const zip=path.resolve(out,'../../winterfell-last-stand.zip');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function click(page,selector,text=''){
  await page.waitForFunction(({selector,text})=>[...document.querySelectorAll(selector)].some(e=>e.checkVisibility()&&!e.disabled&&e.textContent.includes(text)),{},{selector,text});
  const h=await page.evaluateHandle(({selector,text})=>[...document.querySelectorAll(selector)].find(e=>e.checkVisibility()&&!e.disabled&&e.textContent.includes(text)),{selector,text});await h.asElement().click();await h.dispose();
}
(async()=>{
 const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,pipe:true});
 const page=await browser.newPage();page.setDefaultTimeout(45000);const report={checks:[],errors:[],layouts:[]},check=t=>{report.checks.push(t);console.log(t)};
 page.on('pageerror',e=>report.errors.push(e.message));
 try{
  await page.setViewport({width:1920,height:1080});await page.goto('http://127.0.0.1:3013',{waitUntil:'networkidle0'});
  await click(page,'.tabs > button','Atelier');await click(page,'.studio-transfer-tools button','Importer');
  await(await page.$('[aria-label="Importer un ZIP Atelier"]')).uploadFile(zip);await page.waitForSelector('.adventure-import-play');
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('dofus-lite-creations-v1')));
  assert.equal(saved.dungeons.length,1);assert.equal(saved.characters.length,0);
  const d=saved.dungeons[0];assert.equal(d.adventure.heroes.length,6);assert.equal(d.members.reduce((n,m)=>n+m.count,0),32);assert.equal(d.battlefield.width,32);
  assert.deepEqual(d.encounter,{version:1,mode:'army',commander:0});check('Fresh import restores 6 supplied heroes, 32 enemies, original 32×32 geometry and commander rules.');
  await click(page,'.adventure-import-play button','Jouer l’aventure');await page.waitForSelector('.combat-choice[open] .adventure-lobby');
  await click(page,'.combat-choice[open] .combat-choice-launch');
  await page.waitForFunction(()=>document.querySelectorAll('.board .token.side-A').length===6&&document.querySelectorAll('.board .token.side-B').length===32);
  await page.waitForFunction(()=>document.querySelectorAll('.board .custom-character-sprite').length===38);
  await page.waitForSelector('[data-custom-map]');assert.equal(await page.$$eval('.board ruffle-player',e=>e.length),0);
  await delay(500);await page.screenshot({path:path.join(out,'overview.png')});
  const position=()=>page.$eval('.board-camera-layer',e=>({transform:e.style.transform,rect:{w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height}}));
  const before=await position();await page.click('[aria-label="Zoomer la carte"]');await page.click('[aria-label="Zoomer la carte"]');
  const zoomed=await position();assert(Math.abs(zoomed.rect.w/before.rect.w-1.5625)<.01);
  const area=await page.$eval('.board-wrap',e=>{const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}});
  const beforeReady=await page.$$eval('.placement-chip',e=>e.map(x=>x.textContent));
  await page.mouse.move(area.x,area.y);await page.mouse.down();await page.mouse.move(area.x-180,area.y+110,{steps:14});await page.mouse.up();
  const dragged=await position();assert.notEqual(dragged.transform,zoomed.transform);
  assert.deepEqual(await page.$$eval('.placement-chip',e=>e.map(x=>x.textContent)),beforeReady);
  await page.click('[aria-label="Zoomer la carte"]'); // Controls must remain clickable after dragging.
  const gestureZoom=await position();assert(gestureZoom.rect.w>dragged.rect.w);
  await page.mouse.move(area.x,area.y);await page.mouse.wheel({deltaY:-160});await delay(150);
  assert((await position()).rect.w>gestureZoom.rect.w);
  await page.screenshot({path:path.join(out,'zoomed.png')});
  await page.click('[aria-label="Ajuster toute la carte"]');assert.equal((await position()).transform,'translate(0px, 0px) scale(1)');
  check('Zoom buttons and wheel enlarge the actual board; dragging pans without a placement click; reset and buttons still work after a drag.');
  for(const [width,height] of [[1366,768],[1024,768],[390,844]]){
   await page.setViewport({width,height});await delay(250);await page.click('[aria-label="Zoomer la carte"]');
   const layout=await page.evaluate(()=>({width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth+1||document.documentElement.scrollHeight>innerHeight+1,
    fighters:document.querySelectorAll('.board .token').length,rows:+document.querySelector('.combat-spellbar').style.getPropertyValue('--spell-rows')}));
   assert(!layout.overflow,JSON.stringify(layout));assert.equal(layout.fighters,38);report.layouts.push(layout);
   if(width===390)await page.screenshot({path:path.join(out,'mobile.png')});await page.click('[aria-label="Ajuster toute la carte"]');
  }
  await page.setViewport({width:390,height:844});await delay(250);
  const client=await page.createCDPSession();
  await client.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:2});
  const touchArea=await page.$eval('.board-wrap',e=>{const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}});
  const touches=(dx,dy)=>[{x:touchArea.x-dx,y:touchArea.y-dy,id:1},{x:touchArea.x+dx,y:touchArea.y+dy,id:2}];
  await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:touches(25,20)});
  for(let i=1;i<=6;i++)await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:touches(25+i*5,20+i*4)});
  await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await delay(150);
  assert(await page.$eval('[aria-label="Niveau de zoom"]',e=>parseInt(e.textContent,10)>180));
  await page.screenshot({path:path.join(out,'pinch.png')});await page.click('[aria-label="Ajuster toute la carte"]');
  await client.send('Emulation.setTouchEmulationEnabled',{enabled:false});await client.detach();check('Two-finger touch pinch zooms the actual board on a phone-sized viewport.');
  await page.setViewport({width:1920,height:1080});await delay(250);
  await page.click('.board-mode-toggle:not(.board-creature-toggle)');await page.click('[aria-label="Zoomer la carte"]');await page.click('.board-mode-toggle:not(.board-creature-toggle)');
  await page.click('[aria-label="Ajuster toute la carte"]');
  for(let i=0;i<6;i++){if(!await page.$('.placement-ready'))break;await click(page,'.placement-ready');await delay(150)}
  await page.waitForSelector('.end-turn:not([disabled])');
  await page.click('[aria-label="Zoomer la carte"]');await page.click('[aria-label="Zoomer la carte"]');await page.click('[aria-label="Centrer sur le personnage actif"]');
  const active=await page.$eval('.combat-turn-controls',e=>e.dataset.controlledFighter);const index=active==='A'?0:+active.slice(1)-1;
  const buffIndex=[2,5,3,3,1,2][index], spell=d.adventure.heroes[index].character.loadout.spells.custom[buffIndex];
  const pa=await page.$eval('.player-resources .pa strong',e=>+e.textContent);
  await page.click(`[data-spell-id="${spell.id}"] .spell-btn`,{button:'right'});
  await page.waitForFunction(pa=>+document.querySelector('.player-resources .pa strong').textContent===pa,{},pa-spell.pa);
  await page.waitForSelector('.original-spell-effect');await page.screenshot({path:path.join(out,'combat.png')});
  check('Manual original spell casts at zoom ×1.56 on the correctly centered hero and spends the expected AP.');
  // A real map click while zoomed: choose a highlighted legal free cell.
  const target=await page.evaluate(()=>[...document.querySelectorAll('[data-cell]')].filter(e=>e.classList.contains('hl-move')).map(e=>{
   const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2,cell:e.dataset.cell};
  }).find(p=>p.x>400&&p.y>180&&p.x<innerWidth-120&&p.y<innerHeight-280));
  assert(target, 'A visible legal movement cell is required');
  if(target){const pm=await page.$eval('.player-resources .pm strong',e=>+e.textContent);await page.mouse.click(target.x,target.y);await delay(300);assert(await page.$eval('.player-resources .pm strong',(e,pm)=>+e.textContent<pm,pm));check('A zoomed map cell click moves the active hero and spends PM.');}
  await click(page,'.fight-heading-actions button','Abandonner');await page.reload({waitUntil:'networkidle0'});await click(page,'.setup-play');
  assert.equal(await page.$$eval('.combat-choice[open] .adventure-heroes article',e=>e.length),6);
  await click(page,'.combat-choice[open] .combat-control-toggle button','Regarder l’IA');await click(page,'.combat-choice[open] .combat-choice-launch');
  await page.waitForSelector('[data-auto-dungeon]',{timeout:180000});await click(page,'.auto-result-button');await page.waitForSelector('.auto-result[data-outcome]');
  report.result=await page.$eval('.auto-result',e=>({outcome:e.dataset.outcome,text:e.textContent}));
  await page.screenshot({path:path.join(out,'result.png')});check('After reload the imported adventure runs to completion in the real browser AI mode.');
  await click(page,'.fight-heading-actions button','Retour à Combat');await click(page,'.tabs > button','Atelier');
  await click(page,'.studio-editor-tabs button','Prêt à jouer');
  const downloads=fs.mkdtempSync(path.join(out,'downloads-'));const downloadClient=await page.createCDPSession();
  await downloadClient.send('Page.setDownloadBehavior',{behavior:'allow',downloadPath:downloads});
  await click(page,'.adventure-share button','Exporter l’aventure');
  let download;for(let i=0;i<150;i++){download=fs.readdirSync(downloads).find(n=>n.endsWith('.zip'));if(download)break;await delay(100)}
  assert(download);let serial=0;
  const exported=await prepareWorkshopFile(new File([fs.readFileSync(path.join(downloads,download))],download),{newId:()=>`proof-${++serial}`,equipmentId:()=>1900000000+ ++serial,verifyPixels:async()=>{}});
  assert.equal(exported.dungeons[0].members.reduce((n,m)=>n+m.count,0),32);assert.equal(exported.dungeons[0].adventure.heroes.length,6);
  assert.equal(exported.records.reduce((n,r)=>n+Object.keys(r.images).length,0),51);assert.deepEqual(exported.dungeons[0].encounter,d.encounter);
  assert.equal(exported.dungeons[0].battlefield.width,32);await downloadClient.detach();
  check('UI re-export preserves all 51 images, both teams, equipment, 32×32 map and army objective.');
  await click(page,'.studio-editor-tabs button','Groupe');
  assert(await page.$eval('.creator-army-switch input',e=>e.checked&&e.disabled));
  assert.equal(await page.$eval('[aria-label="Commandant de l’armée"]',e=>e.value),'0');
  await page.screenshot({path:path.join(out,'army-editor.png')});
  const story=await browser.newPage();await story.setViewport({width:1366,height:900});
  await story.goto('http://127.0.0.1:3013/adventures/winterfell-last-stand/',{waitUntil:'networkidle0'});
  await story.waitForFunction(()=>document.querySelectorAll('.hero img').length===6&&[...document.querySelectorAll('.hero img')].every(i=>i.complete&&i.naturalWidth));
  await story.screenshot({path:path.join(out,'story.png')});await story.close();
  assert.deepEqual(report.errors,[]);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
 }catch(e){await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});fs.writeFileSync(path.join(out,'failure.txt'),e.stack);throw e}finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
