// Isolated browser profile: never changes the player's open match or saved loadouts.
const puppeteer=require('puppeteer-core');
const path=require('node:path');
const fs=require('node:fs'),assert=require('node:assert/strict');
const out=process.env.PLACEMENT_PROOF_DIR || '/tmp/dofus-starting-cells';
const root=path.resolve(__dirname,'..');
const idleMs=Number(process.env.PLACEMENT_PROOF_IDLE_MS ?? 31000);
fs.mkdirSync(out,{recursive:true});
const raw=JSON.parse(fs.readFileSync(root+'/src/engine/dofusMaps.js','utf8').split('export const DOFUS_MAPS_RAW = ')[1].trim().replace(/;$/,''));
(async()=>{
 const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,pipe:true,protocolTimeout:30000});
 let page;
 try{
  page=await browser.newPage();await page.setViewport({width:1600,height:1150});
  const errors=[],badRequests=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)badRequests.push(`${r.status()} ${r.url()}`);});
  const cdp=await page.createCDPSession();await cdp.send('Page.setDownloadBehavior',{behavior:'deny'});
  await page.evaluateOnNewDocument(()=>{
   if(!localStorage.getItem('placement-proof-init')){
    localStorage.setItem('placement-proof-init','true');
    localStorage.setItem('dofus-lite-player-setup-v1',JSON.stringify({playerClass:'OSAMODAS',botClass:'CRA',botId:'placement-proof',mapId:'astrub_7423'}));
    localStorage.setItem('koliseum.bots.v1',JSON.stringify([{id:'placement-proof',name:'Cra entraînement',custom:true,code:'function decide(v,a){return a.endTurn();}'}]));
    localStorage.setItem('dofus-lite-loadouts-v1',JSON.stringify({
     'A:OSAMODAS':{version:1,level:200,base:{intelligence:100,vitalite:200},slots:{ring1:2469,hat:6797},rollMode:'max',rollSeed:1},
     'B:CRA':{version:1,level:200,base:{},slots:{},rollMode:'max',rollSeed:1}
    }));
   }
   Math.random=()=>0.000007;
   const original=URL.createObjectURL;URL.createObjectURL=function(blob){window.placementExport=blob;return original.call(this,blob);};
  });
  const click=async(selector,text='')=>{
   const h=await page.evaluateHandle(({selector,text})=>[...document.querySelectorAll(selector)].find(e=>e.checkVisibility()&&e.textContent.includes(text)),{selector,text});
   assert(h.asElement(),`Missing ${selector}: ${text}`);assert(!await h.asElement().evaluate(e=>e.disabled),`Disabled ${selector}: ${text}`);await h.asElement().click();await h.dispose();
  };
  const exportState=async()=>{await click('.combat-log-heading button','Exporter');return page.evaluate(async()=>JSON.parse(await window.placementExport.text()));};
  const mode=async enabled=>{if(await page.$eval('.board-mode-toggle',e=>e.getAttribute('aria-pressed'))!==String(enabled))await click('.board-mode-toggle');};
  const stable=()=>page.waitForFunction(()=>[...document.querySelectorAll('.board .token')].every(e=>{
   const s=getComputedStyle(e);return Math.abs(parseFloat(s.left)-parseFloat(e.style.left))<.1&&Math.abs(parseFloat(s.top)-parseFloat(e.style.top))<.1;
  }));
  const ready=()=>page.waitForFunction(()=>[...document.querySelectorAll('.play-controls button')].some(e=>e.checkVisibility()&&e.textContent.includes('Fin de tour')&&!e.disabled),{timeout:30000});
  await page.goto(process.env.PROOF_URL || 'http://127.0.0.1:3013',{waitUntil:'networkidle0'});await click('.tab','Jouer');
  const results=[];
  const maps=[{id:'astrub_7423',file:'astrub'},{id:'amakna_952',file:'amakna'},{id:'amakna_1571',file:'amakna-13-wide'},
    {id:'territoire_des_dopeuls_5383',file:'dopeuls-local'},{id:'canyon',file:'canyon'}];
  for(const map of maps){
   await click('.setup-navigation button','Combat');
   const select=await page.evaluateHandle(()=>[...document.querySelectorAll('select[aria-label="Carte de combat"]')].find(e=>e.checkVisibility()));
   await select.asElement().select(map.id);await select.dispose();
   await click('.setup-play');await page.waitForSelector('.placement-ready');await mode(false);
   if(map.id!=='canyon')await page.waitForFunction(()=>document.querySelectorAll('.retro-map-layer').length>0&&[...document.querySelectorAll('.retro-map-layer')].every(e=>e.complete&&e.naturalWidth));
   const start=await exportState();assert.equal(start.rulesVersion,6);assert.equal(start.state.phase,'placement');assert.equal(start.state.turn,0);
   assert.deepEqual(start.state.placement.ready,{A:false,B:true});assert(!start.events.some(e=>e.t==='turn_start'||e.t==='match_start'));
   assert.equal(await page.$$eval('.turn-timer',es=>es.filter(e=>e.checkVisibility()).length),0);
   assert.equal(await page.$$eval('.spellbar',es=>es.filter(e=>e.checkVisibility()).length),0);
   const expected=raw.find(r=>r.id===map.id);
   const own=start.state.placement.cells.A,enemy=start.state.placement.cells.B;
   assert.equal(await page.$$eval('.placement-cell.yours',es=>es.length),own.length);
   assert.equal(await page.$$eval('.placement-cell.enemy',es=>es.length),enemy.length);
   if(expected){
    const actualTeams=[own.map(c=>c.cellId),enemy.map(c=>c.cellId)].sort();
    assert.deepEqual(actualTeams,expected.startingCells.map(team=>team.map(c=>c.cellId)).sort());
   }
   // Clicking a red cell or ordinary floor cannot change either fighter or consume RNG/points.
   await click('.cell[data-cell="'+enemy[0].x+','+enemy[0].y+'"]');
   assert.deepEqual((await exportState()).state,start.state);
   const free=await page.$$eval('.grid-layer .cell:not(.rock):not(.water):not(.wall):not(.hole):not(.bush)',es=>es.map(e=>e.dataset.cell).find(k=>!document.querySelector('[data-placement-cell="'+k+'"]')));
   await click('.cell[data-cell="'+free+'"]');assert.deepEqual((await exportState()).state,start.state);
   // Selecting another blue square changes only the chosen start; keyboard works too.
   const chosen=own[Math.min(2,own.length-1)];
   await click('[data-placement-cell="'+chosen.x+','+chosen.y+'"][data-team="A"]');await stable();
   let moved=await exportState();assert.deepEqual(moved.state.fighters.A.pos,{x:chosen.x,y:chosen.y});
   assert.equal(moved.state.fighters.A.pm,start.state.fighters.A.pm);assert.equal(moved.state.fighters.A.pa,start.state.fighters.A.pa);
   assert.equal(moved.state.rngState,start.state.rngState);assert.equal(moved.state.turn,0);
   if(own.length>1){
    const last=own.at(-1);const h=await page.$('[data-placement-cell="'+last.x+','+last.y+'"][data-team="A"]');
    await h.evaluate(e=>e.focus());await page.keyboard.press('Enter');moved=await exportState();
    assert.deepEqual(moved.state.fighters.A.pos,{x:last.x,y:last.y});
   }
   const geom=await page.$$eval('.placement-cell',es=>es.map(e=>[e.dataset.placementCell,e.getAttribute('points')]));
   await page.mouse.move(2,2);await page.keyboard.press('Escape');await stable();
   const layerOrder=await page.$eval('.board',e=>({layer:Number(getComputedStyle(e.querySelector('.placement-layer')).zIndex),actors:[...e.querySelectorAll('.token')].map(t=>Number(getComputedStyle(t).zIndex))}));
   assert(layerOrder.actors.every(z=>z>layerOrder.layer),'Characters must render above the placement overlay');
   await (await page.$('.fight-screen .arena-center')).screenshot({path:out+'/'+map.file+'-normal.png'});
   await mode(true);assert.deepEqual(await page.$$eval('.placement-cell',es=>es.map(e=>[e.dataset.placementCell,e.getAttribute('points')])),geom);
   assert.deepEqual((await exportState()).state,moved.state);await page.mouse.move(2,2);await page.keyboard.press('Escape');
   await (await page.$('.fight-screen .arena-center')).screenshot({path:out+'/'+map.file+'-tactical.png'});
   if(map.file==='astrub'){
    await page.setViewport({width:390,height:1000});
    await page.waitForFunction(()=>{const r=document.querySelector('.board-wrap').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;});
    await stable();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    const touchCell=await page.$('.placement-cell.yours');await touchCell.click();await stable();
    await (await page.$('.fight-screen .arena-center')).screenshot({path:out+'/placement-mobile.png'});
    await page.setViewport({width:1600,height:1150});
    await page.waitForFunction(()=>document.querySelector('.board-wrap').getBoundingClientRect().width>500);
    moved=await exportState();
    // A complete turn duration passes during placement; neither timer nor bot may start.
    if(idleMs){
     console.log(`Checking ${idleMs/1000} seconds of idle placement`);
     await new Promise(r=>setTimeout(r,idleMs));
    }
    assert.deepEqual((await exportState()).state,moved.state);
   }
   await click('.placement-ready');await ready();
   const fighting=await exportState();assert.equal(fighting.state.phase,'combat');assert.equal(fighting.state.turn,1);
   assert.deepEqual(fighting.events.find(e=>e.t==='match_start').startingPositions.A,moved.state.fighters.A.pos);
   assert.equal(await page.$$eval('.placement-cell',es=>es.length),0);assert.equal(await page.$$eval('.placement-ready',es=>es.length),0);
   assert(await page.$('.turn-timer'));
   const beforeMove=fighting.state.fighters.A;
   const destination=await page.$$eval('.cell.hl-move',(es,p)=>es.map(e=>e.dataset.cell).find(k=>{const [x,y]=k.split(',').map(Number);return Math.abs(x-p.x)+Math.abs(y-p.y)===1;}),beforeMove.pos);
   assert(destination,'Available move from restricted start');await click('.cell[data-cell="'+destination+'"]');await ready();
   const afterMove=await exportState();assert.equal(afterMove.state.fighters.A.pm,beforeMove.pm-1);
   await click('.spell-btn','Invocation de Bouftou');assert(await page.$('.cell.hl-target'));await click('.cell.hl-target');await ready();
   assert(Object.values((await exportState()).state.fighters).some(f=>f.isSummon));
   results.push({map:map.id,status:start.state.placement.source.status,starts:[own.length,enemy.length],placement:true,keyboard:own.length>1,modes:true,combatMove:true,summon:true});
   console.log('Verified',JSON.stringify(results.at(-1)));
   await click('.fight-heading button','Abandonner');
  }
  assert.deepEqual(errors,[]);assert.deepEqual(badRequests,[]);
  fs.writeFileSync(out+'/browser-proof.json',JSON.stringify({results,errors,badRequests},null,2));
  console.log('Placement, rejected cells, modes, mobile, idle timer, Ready, combat movement and summons passed.');
 }catch(e){console.error(e);if(page)await page.screenshot({path:out+'/failure.png'}).catch(()=>{});process.exitCode=1;}
 finally{await browser.disconnect();browser.process()?.kill('SIGKILL');}
})().finally(()=>process.exit(process.exitCode||0));
