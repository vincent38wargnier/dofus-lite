// Private, opt-in proof. No upload/publication and no changes to the user's browser.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const puppeteer=require('puppeteer-core'),{createApp}=require('../../server/app.cjs');
const out=process.env.PROOF_DIR||'/tmp/arena-legacy-import-proof',port=3196,origin=`http://127.0.0.1:${port}`;
const zip=process.env.LEGACY_LIBRARY||path.resolve('var/private-libraries/dofus-retro.arena-library.zip');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function click(page,text){await page.waitForFunction(text=>[...document.querySelectorAll('button')].some(b=>b.getClientRects().length&&!b.disabled&&b.innerText.trim()===text),{},text);await page.evaluate(text=>[...document.querySelectorAll('button')].find(b=>b.getClientRects().length&&!b.disabled&&b.innerText.trim()===text).click(),text);}
(async()=>{
 fs.mkdirSync(out,{recursive:true});const directory=fs.mkdtempSync(path.join(os.tmpdir(),'af-legacy-proof-')),profile=path.join(directory,'chrome');
 const service=createApp({directory:path.join(directory,'server'),origin}),server=service.app.listen(port,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 let browser;const errors=[],bad=[],audio=[];
 const launch=async()=>{browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,pipe:true,userDataDir:profile,protocolTimeout:180000});const page=await browser.newPage();await page.setViewport({width:1480,height:1024});page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)bad.push([r.status(),r.url()]);});await page.evaluateOnNewDocument(()=>{window.audioProof=[];const play=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){window.audioProof.push(this.src);return play.call(this);};});return page;};
 try{
  let page=await launch();await page.goto(origin+'/#/local',{waitUntil:'networkidle0'});assert.match(await page.$eval('body',e=>e.innerText),/Aucune bibliothèque installée/);
  const started=Date.now();await(await page.$('input[type=file]')).uploadFile(zip);
  await page.waitForFunction(()=>location.hash==='#/workspace/play'&&document.querySelector('[aria-label="Nouveau personnage"]'),{timeout:180000});console.log('Import complete',Date.now()-started,'ms');
  await page.click('[aria-label="Nouveau personnage"]');await page.waitForSelector('[aria-label="Choisir Osamodas"]');
  assert.equal(await page.$$eval('[role=dialog] button[aria-label^="Choisir"],dialog button[aria-label^="Choisir"]',b=>b.length),13);
  await page.screenshot({path:path.join(out,'classes.png')});await page.click('[aria-label="Choisir Iop"]');await page.select('select[aria-label="Niveau du personnage"]','200');
  await click(page,'Forgemager cet objet →');await page.waitForSelector('[aria-label^="Rune Ga Pa :"]');await page.waitForSelector('[aria-label^="Rune Ga Pme :"]');
  await page.click('[aria-label^="Rune Ga Pa :"]');const guaranteed=await page.$('[aria-label="Succès critique garanti"]');if(!await guaranteed.evaluate(e=>e.checked))await guaranteed.click();await click(page,'Fusionner');await page.waitForFunction(()=>document.body.innerText.includes('1 tentative'));await page.screenshot({path:path.join(out,'forgemagie.png')});
  const stored=await page.evaluate(()=>localStorage.getItem('arena-forge:dofus-lite-profiles-v1'));assert.ok(stored.includes('forgedItems'));
  await browser.close();browser=null;console.log('Browser closed completely.');
  page=await launch();await page.goto(origin+'/#/local',{waitUntil:'networkidle0'});assert.match(await page.$eval('body',e=>e.innerText),/Dofus Retro/);await page.screenshot({path:path.join(out,'library-after-reopen.png')});
  assert.equal(await page.evaluate(()=>localStorage.getItem('arena-forge:dofus-lite-profiles-v1')),stored);
  assert.equal(await page.evaluate(async()=>{const cache=await caches.open('arena-forge-user-media-v1');return(await cache.keys()).length;}),13457);
  await page.goto(origin+'/#/workspace/play',{waitUntil:'networkidle0'});await page.waitForSelector('[aria-label="Combat"]');await page.click('[aria-label="Combat"]');await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.innerText.startsWith('Donjon\n')).click());await page.screenshot({path:path.join(out,'dungeon-setup.png')});await click(page,'Lancer le combat');
  await page.waitForFunction(()=>document.querySelectorAll('.token ruffle-player').length===9&&[...document.querySelectorAll('.token ruffle-player')].every(p=>Object.hasOwn(p,'currentFrame')),{timeout:20000});
  const gear=await page.$eval('.token[data-fighter-id=A] ruffle-player',p=>p.ruffle().callExternalInterface('accessoryState'));assert.ok(gear.hat.width>0&&gear.cape.width>0,JSON.stringify(gear));
  await click(page,'Prêt');await page.click('button[aria-label^="Puissance —"]',{button:'right'});await page.waitForFunction(()=>document.body.innerText.includes('% dommages · Puissance'));await delay(150);
  const animation=await page.$eval('.token[data-fighter-id=A] ruffle-player',p=>p.ruffle().callExternalInterface('currentFrame'));assert.ok(animation>1,'Native cast animation changed frame');
  await page.click('button[aria-label^="Pression —"]');await page.click('[data-timeline-fighter=B][data-targetable=true]');await page.waitForFunction(()=>document.body.innerText.includes('PV · Pression'));
  await delay(800);audio.push(...await page.evaluate(()=>window.audioProof));assert.ok(audio.length>0,'Native sounds played');await page.screenshot({path:path.join(out,'combat.png')});
  await click(page,'Sorts du combat');await page.screenshot({path:path.join(out,'spell-library.png')});
  assert.deepEqual(errors,[]);assert.deepEqual(bad,[]);assert.equal(service.db.prepare('SELECT count(*) n FROM libraries').get().n,0);
  const report={ok:true,classes:12,monsters:325,items:6490,encounters:55,mediaFiles:13457,persistedAfterBrowserRestart:true,nativeAnimations:true,equippedHatAndCape:gear,sounds:audio,browserErrors:errors,failedRequests:bad,publishedLibraries:0};
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log('Full private import and browser restart proof passed.');
 }catch(e){if(browser)for(const page of await browser.pages())if(page.url().includes(origin)){console.error((await page.$eval('body',e=>e.innerText)).slice(-6000));await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});}throw e;}
 finally{if(browser)await browser.close();await new Promise(r=>server.close(r));service.db.close();fs.rmSync(directory,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
