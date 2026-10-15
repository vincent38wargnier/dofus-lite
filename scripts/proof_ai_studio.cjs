// Isolated Chrome contexts only; never reads or modifies the player's saves.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),puppeteer=require('puppeteer-core');
const out='/tmp/ai-studio-proof';fs.mkdirSync(out,{recursive:true});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function click(p,s,text=''){
  await p.waitForFunction(({s,text})=>[...document.querySelectorAll(s)].some(e=>e.checkVisibility()&&!e.disabled&&e.textContent.includes(text)),{}, {s,text});
  const h=await p.evaluateHandle(({s,text})=>[...document.querySelectorAll(s)].find(e=>e.checkVisibility()&&!e.disabled&&e.textContent.includes(text)),{s,text});await h.asElement().click();await h.dispose();
}
async function input(p,s,value){await p.$eval(s,e=>{e.focus();e.select();});await p.keyboard.type(value);}
const bots=p=>p.evaluate(()=>JSON.parse(localStorage.getItem('koliseum.bots.v1')||'[]'));
const graph=p=>p.evaluate(()=>{const w=JSON.parse(localStorage.getItem('koliseum.ai-studio.v1'));return w.drafts[w.active].graph;});
async function connect(p,port,target,drag){const a=await p.$(port),b=await p.$(`[data-flow-input="${target}"]`);const ar=await a.boundingBox(),br=await b.boundingBox();
  if(drag){await p.mouse.move(ar.x+ar.width/2,ar.y+ar.height/2);await p.mouse.down();await p.mouse.move(br.x+br.width/2,br.y+br.height/2,{steps:10});await p.mouse.up();}
  else{await a.click();await b.click();}}
(async()=>{
  const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,pipe:true});
  const page=await browser.newPage(),report={checks:[],errors:[]};page.setDefaultTimeout(120000);page.on('pageerror',e=>report.errors.push(e.message));await page.setViewport({width:1700,height:1100});
  const ok=text=>{report.checks.push(text);console.log(text);};
  try{
    await page.goto('http://127.0.0.1:3013',{waitUntil:'networkidle0'});await click(page,'.tabs > button','Studio IA');
    await click(page,'.ai-library > button','Créer mon IA');await click(page,'.ai-new-choices button','Sentinelle');await input(page,'[aria-label="Nom de l’IA"]','Sentinelle du Nord');
    await click(page,'[aria-label="Configurer Un allié en danger ?"]');
    const threshold=await page.evaluateHandle(()=>[...document.querySelectorAll('.ai-inspector label')].find(l=>l.textContent==='Seuil').querySelector('input'));
    await threshold.asElement().evaluate(e=>{e.focus();e.select();});await page.keyboard.type('60');await threshold.dispose();
    const before=(await graph(page)).nodes.find(n=>n.id==='health');const node=await page.$('[data-flow-node="health"] .ai-node-content'),rect=await node.boundingBox();
    await page.mouse.move(rect.x+rect.width*.4,rect.y+20);await page.mouse.down();await page.mouse.move(rect.x+rect.width*.4+35,rect.y+35,{steps:8});await page.mouse.up();
    assert((await graph(page)).nodes.find(n=>n.id==='health').x>before.x);ok('Nodes move by drag; threshold editing persists in the draft.');
    await connect(page,'[data-flow-node="health"] .port-no','end',true);assert.equal((await graph(page)).nodes.find(n=>n.id==='health').links.no,'end');
    await connect(page,'[data-flow-node="health"] .port-no','brain',false);assert.equal((await graph(page)).nodes.find(n=>n.id==='health').links.no,'brain');ok('Real pointer connections work by dragging and by clicking ports.');
    await click(page,'.ai-document-actions button','Enregistrer');assert.equal((await bots(page)).length,1);assert.equal((await bots(page))[0].flow.nodes.find(n=>n.id==='health').config.value,60);
    const original=(await bots(page))[0];await click(page,'.ai-view-tabs button','Code généré');assert((await page.$eval('.ai-source',e=>e.value)).includes('value < 60'));await click(page,'.ai-view-tabs button','Logique visuelle');
    await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(out,'flow.png')});
    await page.reload({waitUntil:'networkidle0'});await click(page,'.tabs > button','Studio IA');assert.deepEqual((await bots(page))[0].flow,original.flow);ok('Published flow and generated JavaScript survive reload unchanged.');
    await page.select('.ai-lab-settings label:nth-child(1) select','ENIRIPSA');await page.select('.ai-lab-settings label:nth-child(3) select','brutus');
    await click(page,'.ai-lab-actions button','Analyser un combat');await page.waitForSelector('.ai-inspection-banner');await page.waitForFunction(()=>![...document.querySelectorAll('.ai-lab-actions button')].some(b=>b.textContent.includes('Arrêter')));
    assert(!(await page.$('.ai-lab > .ai-error')));assert(await page.$('.ai-trace-steps li'));await click(page,'[aria-label="Étape suivante"]');assert(await page.$('.ai-flow-node.active-trace'));
    await page.evaluate(()=>scrollTo(0,230));await page.screenshot({path:path.join(out,'decision.png')});
    await click(page,'.ai-trace-steps button','IA Maison');await page.$eval('.ai-decision-inspector',e=>{e.scrollTop=e.scrollHeight;});
    await page.screenshot({path:path.join(out,'scores.png')});ok('Real combat produces inspectable branch traces and planner scores; stepping highlights the executed node.');
    await click(page,'.ai-inspection-banner button','Revenir');await page.select('.ai-lab-settings label:nth-child(1) select','IOP');
    await click(page,'.ai-lab-actions button','Comparer sur 6 duels');
    await page.waitForFunction(()=>document.querySelectorAll('.ai-games-table tbody tr').length===6,{timeout:300000});await page.waitForFunction(()=>![...document.querySelectorAll('.ai-lab-actions button')].some(b=>b.textContent.includes('Arrêter')));
    assert(!(await page.$('.ai-lab > .ai-error')));report.benchmark=await page.$eval('.ai-lab-results',e=>e.innerText);await(await page.$('.ai-lab')).screenshot({path:path.join(out,'benchmark.png')});ok('Six real mirrored duels finish, with wins, turns, damage and action errors reported.');
    await click(page,'.ai-inspection-banner button','Revenir');const client=await page.createCDPSession();await client.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:out});const started=Date.now();await click(page,'.ai-heading-actions button','Exporter');
    let json;for(let i=0;i<100;i++){json=fs.readdirSync(out).find(f=>f.endsWith('.json')&&f.startsWith('Sentinelle')&&fs.statSync(path.join(out,f)).mtimeMs>=started);if(json)break;await delay(100);}assert(json);
    const context=await browser.createBrowserContext(),guest=await context.newPage();guest.on('pageerror',e=>report.errors.push(e.message));await guest.goto('http://127.0.0.1:3013',{waitUntil:'networkidle0'});await click(guest,'.tabs > button','Studio IA');
    await(await guest.$('[aria-label="Importer une IA visuelle"]')).uploadFile(path.join(out,json));await guest.waitForFunction(()=>document.querySelector('[aria-label="Nom de l’IA"]').value==='Sentinelle du Nord');await click(guest,'.ai-document-actions button','Enregistrer');
    assert.deepEqual((await bots(guest))[0].flow,original.flow);ok('Exported graph imports in an empty browser and registers an independent playable AI.');
    const invalid=JSON.parse(fs.readFileSync(path.join(out,json)));invalid.graph.nodes.find(n=>n.id==='brain').links.fallback='start';const bad=path.join(out,'invalid-cycle.json');fs.writeFileSync(bad,JSON.stringify(invalid));
    await(await guest.$('[aria-label="Importer une IA visuelle"]')).uploadFile(bad);await guest.waitForSelector('.ai-notice.error');assert.equal((await bots(guest)).length,1);ok('Invalid cyclic imports are rejected without replacing the current AI.');
    await click(guest,'.tabs > button','Jouer');await click(guest,'[role="tab"][aria-label="Combat"]');await click(guest,'[aria-label="Modifier mon équipe"]');
    await guest.select('[aria-label="Contrôle du personnage principal"]','ai');const importedId=(await bots(guest))[0].id;
    await guest.select('[aria-label="IA du personnage principal"]',importedId);assert.equal(await guest.$eval('[aria-label="IA du personnage principal"]',e=>e.value),importedId);
    await guest.reload({waitUntil:'networkidle0'});await click(guest,'[role="tab"][aria-label="Combat"]');await click(guest,'[aria-label="Modifier mon équipe"]');
    assert.equal(await guest.$eval('[aria-label="IA du personnage principal"]',e=>e.value),importedId);ok('Published visual AI can control the main fighter in Combat; its assignment survives reload.');
    await page.setViewport({width:390,height:844});await page.waitForFunction(()=>document.querySelector('.ai-flow-node.selected').getBoundingClientRect().width>=150);
    await page.evaluate(()=>scrollTo(0,0));assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(out,'mobile.png')});
    await(await page.$('.ai-flow-layout')).screenshot({path:path.join(out,'mobile-editor.png')});ok('Mobile editor fits 390px without horizontal page scrolling and keeps the selected block readable.');
    assert.deepEqual(report.errors,[]);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
  }catch(e){await page.screenshot({path:path.join(out,'failure.png'),fullPage:true});throw e;}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
