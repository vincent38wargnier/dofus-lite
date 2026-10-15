// Real UI and real matches, isolated from the player's browser profile.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),puppeteer=require('puppeteer-core');
const out='/tmp/maison-stages-proof';fs.mkdirSync(out,{recursive:true});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function click(p,s,text=''){
 await p.waitForFunction(({s,text})=>[...document.querySelectorAll(s)].some(e=>e.checkVisibility()&&!e.disabled&&e.textContent.includes(text)),{}, {s,text});
 const h=await p.evaluateHandle(({s,text})=>[...document.querySelectorAll(s)].find(e=>e.checkVisibility()&&!e.disabled&&e.textContent.includes(text)),{s,text});await h.asElement().click();await h.dispose();
}
async function input(p,s,value){await p.$eval(s,e=>{e.focus();e.select();});await p.keyboard.type(String(value));await p.keyboard.press('Tab');}
const bots=p=>p.evaluate(()=>JSON.parse(localStorage.getItem('koliseum.bots.v1')||'[]'));
async function downloaded(since,prefix){for(let i=0;i<100;i++){const f=fs.readdirSync(out).find(f=>f.startsWith(prefix)&&f.endsWith('.json')&&fs.statSync(path.join(out,f)).mtimeMs>=since);if(f)return path.join(out,f);await delay(100);}throw Error('No download: '+prefix);}
(async()=>{
 const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,pipe:true});
 const page=await browser.newPage(),report={checks:[],errors:[]};page.setDefaultTimeout(120000);page.on('pageerror',e=>report.errors.push(e.message));await page.setViewport({width:1700,height:1220});
 const ok=text=>{report.checks.push(text);console.log(text);};
 try{
  await page.goto('http://127.0.0.1:3013',{waitUntil:'networkidle0'});await click(page,'.tabs > button','Studio IA');
  assert.equal(await page.$$eval('.type-maison-stage',n=>n.length),7);
  await click(page,'[aria-label="Configurer Anticiper les enchaînements"]');
  assert(await page.$eval('[aria-label="Anticiper les attaques suivantes"]',e=>e.matches(':disabled')));
  await page.evaluate(()=>scrollTo(0,110));await page.screenshot({path:path.join(out,'maison-graph.png')});ok('The protected Maison reference opens as seven real executable stages.');
  await click(page,'.ai-stage-intro button','Code de cette étape');await page.waitForSelector('dialog[open]');
  assert((await page.$eval('.ai-source-list',e=>e.textContent)).includes('bestBudget(options, boosted.pa)'));
  await page.screenshot({path:path.join(out,'maison-source.png')});await page.select('[aria-label="Étape du code Maison"]','target');
  assert((await page.$eval('.ai-source-list',e=>e.textContent)).includes('groupPower'));
  await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('dialog[open]'));
  ok('The source dialog shows actual combo and threat code, supports changing stages and closes with Escape.');
  await click(page,'.ai-document-actions button','Créer ma version');await input(page,'[aria-label="Nom de l’IA"]','Maison atelier');
  await click(page,'[aria-label="Configurer Évaluer les menaces"]');await page.select('[aria-label="Cible de placement"]','weakest');
  await click(page,'[aria-label="Configurer Comparer les placements"]');await input(page,'[aria-label="Cases vérifiées en détail"]',4);
  await click(page,'[aria-label="Configurer Anticiper les enchaînements"]');await input(page,'[aria-label="Poids des attaques suivantes"]',.65);
  await click(page,'.ai-document-actions button','Enregistrer');assert.equal((await bots(page)).length,1);let saved=(await bots(page))[0];
  assert(saved.code.includes('api.maisonPipeline'));assert.equal(saved.flow.nodes.find(n=>n.config?.stage==='movement').config.settings.moveCells,4);
  await page.reload({waitUntil:'networkidle0'});await click(page,'.tabs > button','Studio IA');assert.deepEqual((await bots(page))[0].flow,saved.flow);
  await click(page,'[aria-label="Configurer Anticiper les enchaînements"]');assert.equal(await page.$eval('[aria-label="Poids des attaques suivantes"]',e=>e.value),'0.65');
  ok('Duplicated Maison edits search rules and persists its executable graph and generated code after reload.');
  await page.select('.ai-lab-settings label:nth-child(3) select','brutus');await click(page,'.ai-lab-actions button','Analyser un combat');
  await page.waitForSelector('.ai-inspection-banner');await page.waitForFunction(()=>![...document.querySelectorAll('.ai-lab-actions button')].some(b=>b.textContent.includes('Arrêter')));
  assert(!(await page.$('.ai-lab > .ai-error')));assert.equal(await page.$$eval('.ai-trace-steps li',n=>n.length),8);
  await click(page,'.ai-trace-steps button','Anticiper les enchaînements');assert((await page.$eval('.ai-stage-result',e=>e.textContent)).includes('lancers légaux'));
  assert(await page.$('[data-flow-node="brain-combos"].active-trace'));
  await page.$eval('.ai-decision-inspector',e=>{e.scrollTop=440;});await page.evaluate(()=>scrollTo(0,210));await page.screenshot({path:path.join(out,'maison-trace.png')});
  const client=await page.createCDPSession();await client.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:out});
  let since=Date.now();await click(page,'.ai-benchmark-heading button','Rapport');const reportFile=await downloaded(since,'rapport-ia');const combat=JSON.parse(fs.readFileSync(reportFile));
  assert.equal(combat.games[0].stats.errors,0);assert.equal(combat.games[0].stats.invalid,0);
  assert(combat.games[0].entries.every(e=>e.steps.filter(s=>s.stage).length===7));
  assert(combat.games[0].entries.every(e=>e.plans[0].settings.moveCells===4&&e.plans[0].settings.continuationWeight===.65&&e.plans[0].settings.targetPolicy==='weakest'));
  report.combat={outcome:combat.games[0].outcome,turns:combat.games[0].turns,decisions:combat.games[0].entries.length,invalid:combat.games[0].stats.invalid,errors:combat.games[0].stats.errors};
  ok('A real combat records all seven stages per decision and uses the edited settings, with no action errors.');
  await click(page,'.ai-inspection-banner button','Revenir');await click(page,'[aria-label="Configurer Anticiper les enchaînements"]');
  await page.$eval('.ai-inspector',e=>{e.scrollTop=e.scrollHeight;});await click(page,'.ai-rule-note button','Replier');assert.equal(await page.$$eval('.type-maison-stage',n=>n.length),0);
  await click(page,'.ai-expand-maison','Déplier');assert.equal(await page.$$eval('.type-maison-stage',n=>n.length),7);
  await click(page,'.ai-document-actions button','Enregistrer');saved=(await bots(page))[0];since=Date.now();await click(page,'.ai-heading-actions button','Exporter');const exported=await downloaded(since,'Maison');
  const context=await browser.createBrowserContext(),guest=await context.newPage();guest.on('pageerror',e=>report.errors.push(e.message));await guest.setViewport({width:1500,height:1050});await guest.goto('http://127.0.0.1:3013',{waitUntil:'networkidle0'});await click(guest,'.tabs > button','Studio IA');
  await(await guest.$('[aria-label="Importer une IA visuelle"]')).uploadFile(exported);await guest.waitForFunction(()=>document.querySelector('[aria-label="Nom de l’IA"]').value==='Maison atelier');await click(guest,'.ai-document-actions button','Enregistrer');
  assert.deepEqual((await bots(guest))[0].flow,saved.flow);ok('Fold, expand, JSON export and import into an empty browser preserve the full logic and its settings.');
  await click(guest,'.tabs > button','Jouer');await click(guest,'[role="tab"][aria-label="Combat"]');await click(guest,'[aria-label="Modifier mon équipe"]');await guest.select('[aria-label="Contrôle du personnage principal"]','ai');
  await guest.select('[aria-label="IA du personnage principal"]',(await bots(guest))[0].id);ok('The imported expanded Maison AI is available for a normal combat participant.');
  await click(page,'[aria-label="Configurer Anticiper les enchaînements"]');await page.setViewport({width:390,height:844});
  await page.waitForFunction(()=>document.querySelector('[data-flow-node="brain-combos"]').getBoundingClientRect().width>=150);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await(await page.$('.ai-flow-layout')).screenshot({path:path.join(out,'maison-mobile.png')});
  await click(page,'.ai-stage-intro button','Code de cette étape');assert(await page.$eval('dialog',e=>e.getBoundingClientRect().width<=innerWidth));await page.screenshot({path:path.join(out,'maison-mobile-source.png')});
  ok('Mobile keeps nodes readable, controls accessible and source inside a 390px viewport.');
  assert.deepEqual(report.errors,[]);fs.writeFileSync(path.join(out,'proof.json'),JSON.stringify(report,null,2));
 }catch(e){await page.screenshot({path:path.join(out,'failure.png'),fullPage:true});throw e;}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
