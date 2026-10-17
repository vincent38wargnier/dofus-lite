// Real UI and isolated persistent Chrome storage. Never modifies player saves.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),puppeteer=require('puppeteer-core');
const worlds=require('../../examples/worlds-v2/worlds.cjs');
const origin='http://127.0.0.1:3013',out='/tmp/arena-play-worlds-proof',sleep=ms=>new Promise(r=>setTimeout(r,ms));
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'arena-worlds-browser-'));
const report={worlds:[],errors:[]};let browser,page,userId;
async function launch(){browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,pipe:true,userDataDir:profile});page=await browser.newPage();page.setDefaultTimeout(60000);await page.setViewport({width:1480,height:1000});page.on('pageerror',e=>report.errors.push(e.message));}
async function click(label,selector='button'){await page.waitForFunction(({label,selector})=>[...document.querySelectorAll(selector)].some(e=>e.getClientRects().length&&!e.disabled&&e.innerText.trim()===label),{},{label,selector});await page.evaluate(({label,selector})=>[...document.querySelectorAll(selector)].find(e=>e.getClientRects().length&&!e.disabled&&e.innerText.trim()===label).click(),{label,selector});}
async function shot(name){await page.evaluate(()=>document.fonts.ready);await sleep(200);await page.screenshot({path:path.join(out,name+'.png')});}
async function go(route){await page.goto(origin+'/#/'+route);}
const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('arena-forge:dofus-lite-creations-v1')));
async function chooseWorld(key){await go('library/demo-library-'+key);await page.waitForFunction(()=>document.querySelector('.af-library-detail .af-button.primary')&&!document.querySelector('.af-library-detail .af-button.primary').disabled);await page.click('.af-library-detail .af-button.primary');await page.waitForSelector('.combat-choice[open]',{timeout:120000});}
(async()=>{fs.mkdirSync(out,{recursive:true});try{
 await launch();if(!process.argv.includes('--ratings-only')){await go('explore');await page.waitForFunction(()=>document.querySelector('.af-featured-game img')?.naturalWidth>0);await shot('play-first-home');
 await page.setViewport({width:390,height:844});await shot('play-first-mobile');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.setViewport({width:1480,height:1000});
 for(const w of worlds){
  await chooseWorld(w.key);const local=await saved(),d=local.dungeons.find(d=>d.name===w.title);assert(d,w.key);assert.equal(d.rooms.length,3);assert.equal(d.adventure.heroes.length,3);
  assert.equal(await page.$$eval('.combat-choice .adventure-hero',e=>e.length),3);
  assert((await page.$eval('.combat-choice',e=>e.innerText)).includes(w.heroes[0][0]));
  if(w.key==='potter'){
   await shot('ready-party');await page.setViewport({width:390,height:844});assert(await page.$eval('.combat-choice',e=>e.scrollWidth<=e.clientWidth+1));assert(await page.$eval('.combat-choice-launch',e=>e.getBoundingClientRect().bottom<=innerHeight));await shot('ready-party-mobile');await page.setViewport({width:1480,height:1000});
  }
  await click('Lancer le combat');await click('Entrer dans la salle','.campaign-brief button');await page.waitForSelector('.fight-screen');await page.waitForFunction(()=>document.querySelectorAll('.original-map-prop-image').length>0);
  await click('Prêt');await page.waitForFunction(()=>!document.querySelector('.fight-screen')?.innerText.includes('Placement ·'));
  assert.equal(await page.$$eval('.token.side-A',e=>e.length),3);assert.equal(await page.$$eval('.token.side-B',e=>e.length),4);
  await page.waitForFunction(()=>[...document.querySelectorAll('.token img')].every(e=>e.naturalWidth>0));
  const spells=await page.$$eval('.spell-btn',e=>e.length);assert(spells>=8);
  const present=await page.$$eval('.spell-slot',els=>els.map(e=>Number(e.dataset.spellId)));
  const boost=d.adventure.heroes.map(h=>h.character.loadout.spells.custom[5]).find(s=>present.includes(s.id));assert(boost,'The current hero has its own protection spell');
  const button=`.spell-slot[data-spell-id="${boost.id}"] .spell-btn`;
  await page.waitForFunction(selector=>document.querySelector(selector)&&!document.querySelector(selector).disabled,{},button);
  await page.click(button,{button:'right'});await page.waitForFunction(id=>document.querySelector(`.spell-slot[data-spell-id="${id}"] .spell-cost.on-cooldown`),{},boost.id);
  if(['potter','brice','starwars','pokemon'].includes(w.key)){await shot(w.key+'-combat');await click('Sorts du combat');await page.waitForSelector('[role="dialog"],dialog[open]');await shot(w.key+'-spellbook');await page.keyboard.press('Escape');}
  report.worlds.push({key:w.key,import:true,rooms:d.rooms.length,heroes:3,spells:24,images:true,manualLaunch:true,boostCast:true});console.log(w.key,'import and manual cast passed');
 }
 const before=await saved();assert.equal(before.dungeons.length,12);assert.equal(before.characters.length,36);
 await browser.close();browser=null;await launch();await go('local');await page.waitForFunction(()=>document.querySelectorAll('.af-installed-game').length===12);await shot('my-games');assert.equal((await saved()).dungeons.length,12);report.browserRestart=true;
 for(const key of ['potter','starwars','brice']){
  await chooseWorld(key);assert.equal((await saved()).dungeons.length,12,'Playing installed worlds must not duplicate imports');await click('Regarder l’IA');await click('Lancer le combat');
  for(let room=0;room<3;room++){
   await page.waitForSelector('.campaign-brief[open]');await click('Entrer dans la salle','.campaign-brief button');await page.waitForSelector('.auto-result-button',{timeout:120000});await page.click('.auto-result-button');await page.waitForSelector('.auto-result[data-outcome="victory"]',{timeout:120000});
   if(room<2)await click('Salle suivante');else await shot(key+'-campaign-victory');
  }console.log(key,'three-room campaign won');
 }
 report.campaignsCompleted=3;
 await go('create');await page.waitForSelector('.af-creator-choices');await click('Ouvrir l’Atelier');await page.waitForSelector('.workshop-screen, .studio-editor, .workshop-studio');report.creationAvailable=true;
 fs.writeFileSync(path.join(out,'play-report.json'),JSON.stringify(report,null,2));}
 await go('library/demo-library-potter');await page.waitForSelector('.af-world-rating');assert.equal(await page.$('.af-rating-stars'),null);await click('Se connecter pour noter');await click('Créer un compte');
 await page.type('input[name=handle]','WorldProof_'+Date.now());await page.type('input[name=password]','temporary-rating-proof-password');await click('Créer mon compte');await page.waitForSelector('.af-recovery');userId=await page.evaluate(async()=>((await(await fetch('/api/auth/me')).json()).user.id));await page.click('dialog [aria-label=Fermer]');
 await page.waitForFunction(()=>document.querySelector('.af-rating-stars input')&&!document.querySelector('.af-rating-stars input').matches(':disabled'));await page.click('.af-rating-stars input[value="4"]');await page.waitForFunction(()=>document.querySelector('.af-rating-stars input[value="4"]')?.checked);await click('Enregistrer ma note');await page.waitForFunction(()=>document.querySelector('.af-world-rating legend')?.innerText==='Votre note'&&!document.querySelector('.af-rating-stars input').matches(':disabled'));await page.evaluate(()=>document.querySelector('.af-world-rating').scrollIntoView({block:'center'}));await shot('signed-in-rating');
 await page.reload();await page.waitForFunction(()=>document.querySelector('.af-rating-stars input[value="4"]')?.checked&&!document.querySelector('.af-rating-stars input').matches(':disabled'));await page.click('.af-rating-stars input[value="5"]');await click('Modifier ma note');await page.waitForFunction(()=>document.querySelector('.af-world-rating button')?.disabled&&!document.querySelector('.af-rating-stars input').matches(':disabled'));await page.reload();await page.waitForFunction(()=>document.querySelector('.af-rating-stars input[value="5"]')?.checked&&!document.querySelector('.af-rating-stars input').matches(':disabled'));
 await page.setViewport({width:390,height:844});await page.evaluate(()=>document.querySelector('.af-world-rating').scrollIntoView({block:'center'}));assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await shot('rating-mobile');await click('Retirer ma note');await page.waitForFunction(()=>document.querySelector('.af-world-rating legend')?.innerText==='Notez ce monde');report.ratings={signedInOnly:true,persisted:true,update:true,delete:true,mobile:true};
 assert.deepEqual(report.errors,[]);fs.writeFileSync(path.join(out,process.argv.includes('--ratings-only')?'rating-report.json':'report.json'),JSON.stringify(report,null,2));console.log('Play-first browser proof passed.');
 }catch(e){if(page&&!page.isClosed()){await shot('failure');console.error((await page.$eval('body',e=>e.innerText)).slice(-2200));}throw e;}
 finally{if(browser)await browser.close();fs.rmSync(profile,{recursive:true,force:true});if(userId){if(fs.existsSync('.env'))process.loadEnvFile('.env');const {createStore}=require('../../server/store.cjs'),s=createStore({directory:path.resolve('var/community')});try{await s.ready;for(const t of ['ratings','sessions'])await s.remove(t,{user_id:userId});await s.remove('users',{id:userId});}finally{await s.close();}}}
})().catch(e=>{console.error(e);process.exitCode=1;});
