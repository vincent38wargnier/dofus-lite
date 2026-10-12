// Isolated Chrome storage. Creates gear through the real editor, then equips it.
require('./ai_runtime.cjs');
const fs = require('node:fs'), path=require('node:path'), assert=require('node:assert/strict');
const puppeteer=require('puppeteer-core');
const { emptyLoadout,resolveLoadout }=require('../src/engine/equipment');
const { validateCustomEquipment }=require('../src/engine/customEquipment');
const out=process.env.PROOF_DIR || '/tmp/dofus-custom-equipment';
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,pipe:true});
 let page;const report={errors:[]};
 try {
  page=await browser.newPage();page.setDefaultTimeout(30000);
  await page.setViewport({width:1580,height:1080}); await page.setDragInterception(true);
  page.on('pageerror',e=>report.errors.push(e.message));
  await page.evaluateOnNewDocument(loadout=>{
   if(localStorage.getItem('equipment-creator-proof'))return;
   localStorage.setItem('equipment-creator-proof','1');
   localStorage.setItem('dofus-lite-loadouts-v1',JSON.stringify({'A:IOP':loadout}));
  },{...emptyLoadout(),level:200,base:{force:200},slots:{}});
  const handle=async(selector,text='')=>{
   const h=await page.evaluateHandle(({selector,text})=>[...document.querySelectorAll(selector)].find(e=>e.checkVisibility()&&e.textContent.includes(text)),{selector,text});
   assert(h.asElement(),`Missing ${selector}: ${text}`); return h.asElement();
  };
  const click=async(selector,text='')=>{const e=await handle(selector,text);await e.click();await e.dispose();};
  const field=async(label,value)=>{
   const h=await page.evaluateHandle(label=>[...document.querySelectorAll('.equipment-designer label')].find(e=>e.checkVisibility()&&e.childNodes[0]?.textContent.trim()===label)?.control,label);
   const e=h.asElement();assert(e,`Missing field ${label}`);
   if(await e.evaluate(e=>e.tagName==='SELECT'))await e.select(String(value));else{await e.focus();await e.evaluate(e=>e.select());await page.keyboard.press('Backspace');await e.type(String(value));}await e.dispose();
  };
  const bonus=async(key,value,label)=>{await field('Ajouter un bonus',key);await click('.equipment-design-add button');await field(label,value);};
  const library=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('dofus-lite-custom-equipment-v1'))?.items||[]);
  const profile=()=>page.evaluate(()=>{const d=JSON.parse(localStorage.getItem('dofus-lite-profiles-v1'));return d.profiles.find(p=>p.id===d.activeId);});
  await page.goto(process.env.PROOF_URL||'http://127.0.0.1:3013',{waitUntil:'networkidle0'});
  await click('.tabs > button','Atelier');await click('.creator-tabs button','Mes équipements');
  await field('Nom de l’équipement','Couronne boréale');await field('Niveau requis',200);
  await bonus('vitalite',300,'Vitalité');await bonus('force',60,'Force');await bonus('sagesse',35,'Sagesse');await bonus('damage',8,'Dommages');await bonus('crit',3,'Coups critiques');
  assert(!await page.$eval('.equipment-designer button[type=submit]',e=>e.disabled));
  await field('Force',10000);
  assert(await page.$eval('.equipment-designer button[type=submit]',e=>e.disabled));
  assert.equal((await library()).length,0);
  await field('Force',60);await click('.equipment-designer button[type=submit]');
  const hat=(await library())[0];assert(validateCustomEquipment(hat).valid);
  await page.$eval('.equipment-workshop-census',e=>e.scrollIntoView({block:'start'}));await page.screenshot({path:path.join(out,'creator-desktop.png')});
  await click('[aria-label="Nouvel équipement"]');await field('Famille','weapon-7');await field('Nom de l’équipement','Marteau boréal');await field('Niveau requis',200);
  if(await page.$('.equipment-design-errors'))await click('.equipment-design-errors button');
  assert(!await page.$eval('.equipment-designer button[type=submit]',e=>e.disabled));
  await click('.equipment-designer button[type=submit]');
  const hammer=(await library()).find(i=>i.name==='Marteau boréal');assert(validateCustomEquipment(hammer).valid);
  await page.reload({waitUntil:'networkidle0'});await click('.tabs > button','Atelier');await click('.creator-tabs button','Mes équipements');
  assert.equal((await library()).length,2);
  await click('.equipment-design-saved-card','Couronne boréale');
  assert.equal(await page.$eval('.equipment-design-stat input[aria-label="Force"]',e=>e.value),'60');
  await page.setViewport({width:390,height:844});await page.evaluate(()=>scrollTo(0,0));
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile horizontal overflow');
  await page.$eval('.equipment-budget-card',e=>e.scrollIntoView({block:'start'}));await page.screenshot({path:path.join(out,'creator-mobile.png')});
  await page.$eval('.equipment-designer',e=>e.scrollIntoView({block:'start'}));await page.screenshot({path:path.join(out,'creator-mobile-form.png')});
  await page.setViewport({width:1580,height:1080});await click('.tabs > button','Jouer');
  await click('.setup-navigation button','Équipement');
  const drag=async(id,slot)=>{
   await click(`.loadout-picker [data-slot="${slot}"]`);await click('.equipment-origin-filter button','Mes créations');
   const source=await handle(`.equipment-result[data-item-id="${id}"]`),target=await handle(`.loadout-picker [data-slot="${slot}"]`);
   const data=await source.drag(target);await target.dragEnter(data);await target.dragOver(data);await target.drop(data);await page.mouse.up();await source.dispose();await target.dispose();
  };
  await drag(hat.id,'hat');await drag(hammer.id,'weapon');
  let equipped=await profile();assert.equal(equipped.loadout.slots.hat,hat.id);assert.equal(equipped.loadout.slots.weapon,hammer.id);
  const summary=resolveLoadout(equipped.classId,equipped.loadout);assert(summary.valid,summary.errors.join(' '));assert.equal(summary.bonuses.damage,8);assert.equal(summary.bonuses.force,60);
  report.equipment={hat:hat.id,weapon:hammer.id,budget:summary.equipmentBudget.score,bonuses:summary.bonuses};
  await page.reload({waitUntil:'networkidle0'});assert.deepEqual((await profile()).loadout,equipped.loadout);
  await click('.setup-play');await click('.combat-choice-modes button','Entraînement');await click('.combat-choice-launch');
  await page.waitForSelector('.placement-ready');await click('.placement-ready');await page.waitForSelector('.combat-spellbar');
  assert(await page.$eval('.combat-spellbar',e=>e.textContent.includes('Marteau boréal')),'Weapon in combat spell bar');
  const image=await page.$('.combat-spellbar img[src^="data:image/svg+xml"]');assert(image,'Custom weapon graphic available');
  await page.screenshot({path:path.join(out,'combat.png')});
  assert.deepEqual(report.errors,[]); report.checks=['create two items from UI','reject excessive stats','save + reload','drag hat and hammer','correct engine bonuses','mobile fits','equipment in Kanojedo'];
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 } catch(e){if(page){await page.screenshot({path:path.join(out,'failure.png')});fs.writeFileSync(path.join(out,'failure.txt'),await page.evaluate(()=>document.body.innerText));}throw e;}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
