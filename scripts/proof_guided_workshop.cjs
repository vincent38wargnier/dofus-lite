// Fresh Chrome profiles only. Creates real UI content, exports it and imports
// the downloaded archive in a second, empty browser context.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), puppeteer = require('puppeteer-core');
const out='/tmp/guided-workshop-proof';fs.mkdirSync(out,{recursive:true});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function click(page,selector,text='') {
  await page.waitForFunction(({selector,text})=>[...document.querySelectorAll(selector)].some(e=>e.checkVisibility()&&!e.disabled&&e.textContent.includes(text)),{}, {selector,text});
  const handle=await page.evaluateHandle(({selector,text})=>[...document.querySelectorAll(selector)].find(e=>e.checkVisibility()&&!e.disabled&&e.textContent.includes(text)),{selector,text});
  await handle.asElement().click();await handle.dispose();
}
async function field(page,label,value,tag='input') {
  const el=await page.evaluateHandle(({label,tag})=>[...document.querySelectorAll('label')].find(l=>l.checkVisibility()&&l.textContent.trim().startsWith(label))?.querySelector(tag),{label,tag});
  await el.asElement().evaluate(e=>{e.focus();e.select();});await page.keyboard.type(value);await el.dispose();
}
const saved=p=>p.evaluate(()=>JSON.parse(localStorage.getItem('dofus-lite-creations-v1')));
async function screenshot(page,selector,name){await (await page.$(selector)).screenshot({path:path.join(out,name)});}
async function artRecord(page,id){return page.evaluate(async id=>{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('dofus-lite-character-artwork',1);r.onsuccess=()=>resolve(r.result);r.onerror=reject;});const record=await new Promise((resolve,reject)=>{const r=db.transaction('artwork').objectStore('artwork').get(id);r.onsuccess=()=>resolve(r.result);r.onerror=reject;});return {keys:Object.keys(record.images), hashes:await Promise.all(Object.values(record.images).map(async b=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',await b.arrayBuffer()))].map(n=>n.toString(16).padStart(2,'0')).join('')))};},id);}
(async()=>{
  const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,pipe:true});
  const report={checks:[],errors:[]},ok=t=>{report.checks.push(t);console.log(t);};
  const page=await browser.newPage();page.setDefaultTimeout(60000);page.on('pageerror',e=>report.errors.push(e.message));await page.setViewport({width:1600,height:1000});
  try{
    await page.goto('http://127.0.0.1:3013',{waitUntil:'networkidle0'});await click(page,'.tabs > button','Atelier');await click(page,'.studio-new','Nouveau donjon');
    await field(page,'Nom du donjon','Le Passage des brumes');await click(page,'.workshop-map-choice .workshop-start-card');
    await field(page,'Nom du terrain','La Cour des veilleurs');await page.select('[aria-label="Ambiance du terrain"]','snow');
    for(const cell of ['5,4','5,5','5,7'])await page.click(`[data-map-cell="${cell}"]`);
    await click(page,'.workshop-map-tools button','Pilier');await page.click('[data-map-cell="7,8"]');
    await click(page,'.workshop-ground-art > summary');await(await page.$('[aria-label="Importer les trois décors"]')).uploadFile(path.resolve('public/adventures/winterfell-last-stand/assets/props.png'));
    await page.waitForSelector('.workshop-map-canvas .original-map-prop-image');
    await click(page,'.workshop-ground-art > summary');
    await screenshot(page,'.workshop-map-editor','terrain.png');await click(page,'.workshop-map-status button','Voir les collisions');await screenshot(page,'.workshop-map-editor','terrain-collisions.png');
    await click(page,'.workshop-step-footer button','Utiliser ce terrain');await page.waitForFunction(()=>!!JSON.parse(localStorage.getItem('dofus-lite-creations-v1')).dungeons[0].battlefield);
    let dungeon=(await saved(page)).dungeons[0];assert.equal(dungeon.battlefield.obstacles.length,4);assert.equal(dungeon.mapId,dungeon.battlefield.id);ok('Map painted by mouse, original floor saved, collision and scenery share four obstacle cells.');
    await screenshot(page,'.studio-editor','roles.png');await click(page,'.workshop-role-cards button','Créer un gardien');await field(page,'Nom de la créature','Veilleur des brumes');
    await page.$eval('[aria-label="Vie de la créature"]',e=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'125');e.dispatchEvent(new Event('change',{bubbles:true}));e.dispatchEvent(new Event('input',{bubbles:true}));});
    await screenshot(page,'.workshop-creature-editor','creature.png');await click(page,'.workshop-step-footer button','Étape suivante');
    await click(page,'button','Créer un sort');
    await click(page,'.workshop-spell-presets button','Soin');await field(page,'Nom du sort','Baume des brumes');
    await click(page,'.spell-designer-visual summary');await click(page,'.spell-designer-visual .workshop-ai-help summary');
    const iconPath=path.resolve('public/adventures/winterfell/assets/icons/shadow.png');
    await (await page.$('[aria-label="Importer l’icône du sort"]')).uploadFile(iconPath);
    await page.waitForFunction(()=>document.querySelector('.spell-designer-review .retro-spell-icon')?.getAttribute('src')?.startsWith('blob:'));
    await screenshot(page,'.spell-designer','spell.png');await click(page,'.spell-designer-save button','Ajouter');
    await click(page,'[aria-label="Étapes de la créature"] button','Apparence');await click(page,'.appearance-source button','Mes images');
    await (await page.$('[aria-label="Importer idle-front.png"]')).uploadFile(path.resolve('public/templates/character-artwork/example/idle-front.png'));
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem('dofus-lite-creations-v1')).dungeons[0].members[0].customMonster.artworkId?.startsWith('shape-')===false);
    const first=(await saved(page)).dungeons[0].members[0].customMonster.artworkId, before=await artRecord(page,first);
    await page.select('.workshop-image-step select','idle-back.png');await (await page.$('[aria-label="Importer idle-back.png"]')).uploadFile(path.resolve('public/templates/character-artwork/example/idle-back.png'));
    await page.waitForFunction(id=>JSON.parse(localStorage.getItem('dofus-lite-creations-v1')).dungeons[0].members[0].customMonster.artworkId!==id,{},first);
    const second=(await saved(page)).dungeons[0].members[0].customMonster.artworkId, after=await artRecord(page,second);
    assert.equal(before.hashes[before.keys.indexOf('idle-front.png')],after.hashes[after.keys.indexOf('idle-front.png')]);assert.deepEqual(await artRecord(page,first),before);
    await page.select('.workshop-image-step select','walk-front.png');await (await page.$('[aria-label="Importer walk-front.png"]')).uploadFile(path.resolve('public/templates/character-artwork/example/idle-front.png'));
    await page.waitForSelector('.creator-artwork [role="alert"]');assert.equal((await saved(page)).dungeons[0].members[0].customMonster.artworkId,second);
    await page.select('.workshop-image-step select','idle-front.png');await click(page,'.workshop-image-step .workshop-ai-help summary');await screenshot(page,'.character-custom-appearance','image-step.png');ok('Single-sheet imports preserve the other sheets and prior versions; a wrongly sized sheet preserves the current artwork.');
    await click(page,'.workshop-step-footer button','Terminer');await click(page,'.dungeon-room-heading button','Ajouter une salle');
    await click(page,'.workshop-map-choice .studio-terrain-card');await click(page,'.workshop-role-cards button','Créer un tireur');await click(page,'.workshop-creature-editor > button','Revenir');
    await page.reload({waitUntil:'networkidle0'});await click(page,'.tabs > button','Atelier');dungeon=(await saved(page)).dungeons[0];assert.equal(dungeon.rooms.length,2);assert.equal(dungeon.rooms[0].members[0].customMonster.spells.length,3);ok('Two rooms, original map, edited creature, three authored spells and PNG artwork persist after reload.');
    const client=await page.createCDPSession();await client.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:out});
    const downloadStarted=Date.now();
    await click(page,'.studio-editor-heading .atelier-single-export button').catch(()=>click(page,'.studio-editor .atelier-single-export button'));
    let zip;for(let i=0;i<100;i++){zip=fs.readdirSync(out).find(f=>f.endsWith('.zip')&&fs.statSync(path.join(out,f)).mtimeMs>=downloadStarted);if(zip)break;await delay(200);}assert(zip,'ZIP download');
    const context=await browser.createBrowserContext(), guest=await context.newPage();guest.setDefaultTimeout(60000);guest.on('pageerror',e=>report.errors.push(e.message));await guest.setViewport({width:1600,height:1000});await guest.goto('http://127.0.0.1:3013',{waitUntil:'networkidle0'});
    await click(guest,'.tabs > button','Atelier');await click(guest,'.studio-transfer-tools button','Importer');await(await guest.$('[aria-label="Importer un ZIP Atelier"]')).uploadFile(path.join(out,zip));await guest.waitForSelector('.atelier-import-result');await click(guest,'.atelier-import-result button','Ouvrir');
    const imported=(await saved(guest)).dungeons[0];assert.equal(imported.rooms.length,2);assert.equal(imported.rooms[0].members[0].customMonster.spells.length,3);assert.equal((await artRecord(guest,imported.rooms[0].members[0].customMonster.artworkId)).keys.length,3);assert((await artRecord(guest,imported.rooms[0].battlefield.background.artworkId)).keys.includes('props.png'));ok('Downloaded dungeon alone imports with two rooms, floor, props, creature artwork and authored spells in an empty browser.');
    await click(guest,'.studio-editor button','Tester');await guest.waitForSelector('.combat-choice[open]');await click(guest,'.combat-choice-launch');await guest.waitForSelector('dialog.campaign-brief[open]');await click(guest,'.campaign-brief button','Entrer dans la salle');await guest.waitForSelector('.fight-screen');await screenshot(guest,'.fight-screen','manual-fight.png');ok('Imported manual dungeon launches on its painted map.');
    await page.setViewport({width:390,height:844});await click(page,'[aria-label="Rubriques du donjon"] button','Terrain');await click(page,'.workshop-map-choice .workshop-start-card');await screenshot(page,'.workshop-map-editor','mobile.png');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));ok('Mobile editor fits 390px without horizontal scrolling.');
    assert.deepEqual(report.errors,[]);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
  }catch(e){await page.screenshot({path:path.join(out,'failure.png'),fullPage:true});throw e;}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
