// Isolated accounts and posts. No writes to the installed community or its users.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const puppeteer=require('puppeteer-core'),{createApp}=require('../../server/app.cjs');
const out=process.env.PROOF_DIR||'/tmp/arena-forum-proof',port=Number(process.env.PROOF_PORT||3193),origin='http://127.0.0.1:'+port;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function click(page,text,scope='') {
  const selector=(scope?scope+' ':'')+'button';
  await page.waitForFunction((selector,text)=>[...document.querySelectorAll(selector)].some(element=>element.getClientRects().length&&!element.disabled&&element.innerText.trim()===text),{},selector,text);
  const handle=await page.evaluateHandle((selector,text)=>[...document.querySelectorAll(selector)].find(element=>element.getClientRects().length&&!element.disabled&&element.innerText.trim()===text),selector,text);
  await handle.asElement().click();await handle.dispose();
}
async function setText(page,selector,value) {
  await page.waitForSelector(selector,{visible:true});await page.click(selector);
  await page.$eval(selector,element=>element.select());await page.keyboard.type(value);
}
async function api(page,url,body) { return page.evaluate(async(url,body)=>{
  const me=await(await fetch('/api/auth/me')).json();const response=await fetch('/api'+url,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(me.csrf?{'X-CSRF-Token':me.csrf}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,data:await response.json()};
},url,body); }
async function go(page,route) { await page.goto(origin+'/#/'+route,{waitUntil:'networkidle0'}); }

(async()=>{
  fs.mkdirSync(out,{recursive:true});const directory=fs.mkdtempSync(path.join(os.tmpdir(),'af-forum-browser-'));
  const service=createApp({directory,origin,uri:''});await service.ready;
  const server=service.app.listen(port,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));let browser,a,b;
  const errors=[];
  try {
    await service.store.insert('users',{id:'sample-author',handle:'ExempleForum',password:'disabled',recovery:'disabled',created:'2026-06-01T00:00:00Z',admin:0,isDemo:1});
    await service.store.insert('libraries',{id:'sample-world',owner:'sample-author',name:'Laboratoire du pilier',description:'Univers de test du forum.',release:'1.0',kind:'adventure',sha256:'sample-world',bytes:1,counts:{dungeons:1},arena:[],created:'2026-10-01T00:00:00Z',hidden:0,isDemo:1});
    for(let index=0;index<35;index++)await service.store.insert('topics',{id:'sample-'+index,owner:'sample-author',library_id:'sample-world',title:'Placement autour du pilier '+index,body:'Discussion de test. Où placer le soigneur pendant que le gardien protège le passage ?',category:index%2?'strategy':'help',created:`2026-10-${String(1+index%15).padStart(2,'0')}T12:00:00Z`,updated:`2026-10-${String(1+index%15).padStart(2,'0')}T12:00:00Z`,hidden:0,locked:0,isDemo:1});
    browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,pipe:true});
    a=await(await browser.createBrowserContext()).newPage();b=await(await browser.createBrowserContext()).newPage();
    for(const page of [a,b]){await page.setViewport({width:1440,height:1000});page.on('pageerror',error=>errors.push(error.message));}
    await go(a,'community');await a.waitForSelector('.af-feed-post');assert.equal((await a.$$('.af-feed-post')).length,30);
    await click(a,'Voir les discussions suivantes');await a.waitForFunction(()=>document.querySelectorAll('.af-feed-post').length===35);
    await a.evaluate(()=>scrollTo(0,0));await a.click('.af-vote');await a.waitForSelector('dialog[open] input[name=handle]');await a.click('dialog [aria-label=Fermer]');
    await click(a,'Connexion');await click(a,'Créer un compte');await a.type('input[name=handle]','ForumProofA');await a.type('input[name=password]','forum-proof-browser-password');await click(a,'Créer mon compte');await a.waitForSelector('.af-recovery');await a.click('dialog [aria-label=Fermer]');
    await a.click('.af-forum-category-nav button:nth-child(4)');
    await click(a,'Laboratoire du pilier','.af-forum-world-nav');await click(a,'Nouvelle discussion');
    assert.equal(await a.$eval('select[name=category]',element=>element.value),'strategy');assert.equal(await a.$eval('select[name=libraryId]',element=>element.value),'sample-world');
    await a.type('input[name=title]','Quel placement pour protéger notre soigneur ?');await a.type('textarea[name=body]','Je propose de garder le pilier entre le soigneur et les archers. Qui couvre la sortie ?');await click(a,'Publier');
    await a.waitForSelector('.af-discussion-topic h1');const topic=await a.evaluate(()=>location.hash.split('/')[2]);
    await go(b,'community');const registered=await api(b,'/auth/register',{handle:'ForumProofB',password:'forum-proof-browser-password'});assert.equal(registered.status,201);await b.reload({waitUntil:'networkidle0'});await go(b,'topic/'+topic);
    await click(b,'Suivre la discussion');await b.click('.af-discussion-topic .af-vote');await b.waitForSelector('.af-discussion-topic .af-vote[aria-pressed=true]');
    await b.type('#forum-reply-body','Je couvre la sortie à gauche.');await click(b,'Répondre','.af-forum-composer');await b.waitForSelector('.af-forum-comment');
    const parent=(await api(b,'/topics/'+topic)).data.replies[0].id;
    await a.reload({waitUntil:'networkidle0'});await click(a,'Répondre','.af-forum-comment');await a.type('#forum-reply-body','Parfait, le soigneur peut rester derrière toi.');await click(a,'Répondre','.af-forum-composer');await a.waitForSelector('.af-comment-child .af-forum-comment');
    const child=(await api(a,'/topics/'+topic)).data.replies.find(reply=>reply.reply_to===parent);assert.ok(child);
    await a.click('#reply-'+parent+' .af-collapse-comment');assert.equal(await a.$('#reply-'+child.id),null);await a.click('#reply-'+parent+' .af-collapse-comment');await a.waitForSelector('#reply-'+child.id);
    await a.click('#reply-'+child.id+' .af-post-menu summary');await click(a,'Modifier','#reply-'+child.id+' .af-post-menu-items');await setText(a,'.af-edit-dialog textarea','Parfait, je garde deux cases de distance.');await click(a,'Enregistrer','.af-edit-dialog');await a.waitForFunction(()=>!document.querySelector('.af-edit-dialog'));assert.match((await api(a,'/topics/'+topic)).data.replies.find(reply=>reply.id===child.id).body,/deux cases/);
    await a.click('.af-discussion-topic .af-post-menu summary');await click(a,'Citer','.af-discussion-topic .af-post-menu-items');assert.match(await a.$eval('#forum-reply-body',element=>element.value),/^> ForumProofA/);
    await setText(a,'#forum-reply-body','> ForumProofA : garder le pilier\n\nOn essaie au prochain combat.');await click(a,'Répondre','.af-forum-composer');await a.waitForFunction(()=>document.querySelectorAll('.af-forum-comment').length===3);
    await a.evaluate(()=>scrollTo(0,0));await a.screenshot({path:path.join(out,'thread-tested.png')});
    await go(b,'community');await click(b,'Mes discussions suivies');await b.waitForFunction(()=>document.querySelectorAll('.af-feed-post').length===1);assert.match(await b.$eval('.af-thread-title',element=>element.textContent),/notre soigneur/);
    await b.reload({waitUntil:'networkidle0'});await b.waitForSelector('.af-forum-feed-nav [aria-current=page]');assert.match(await b.$eval('.af-forum-feed-nav [aria-current=page]',element=>element.textContent),/suivies/);
    await click(b,'Partager','.af-feed-post');await b.waitForSelector('.af-edit-dialog input');assert.match(await b.$eval('.af-edit-dialog input',element=>element.value),new RegExp('/topic/'+topic));await b.keyboard.press('Escape');assert.equal(await b.$('.af-edit-dialog'),null);
    await go(a,'inbox');await a.waitForSelector('.af-notification');
    await go(b,'topic/'+topic);await b.waitForSelector('#reply-'+parent+' .af-post-menu summary');await b.click('#reply-'+parent+' .af-post-menu summary');await click(b,'Retirer','#reply-'+parent+' .af-post-menu-items');await click(b,'Retirer','.af-edit-dialog');await b.waitForFunction(parent=>!document.getElementById('reply-'+parent),{},parent);assert.ok(await b.$('#reply-'+child.id));
    await click(b,'Tout replier');await click(b,'Tout déplier');
    await b.click('#reply-'+child.id+' .af-post-menu summary');await click(b,'Signaler','#reply-'+child.id+' .af-post-menu-items');await b.type('textarea[name=reason]','Vérification du bouton de signalement.');await click(b,'Envoyer le signalement');await b.waitForFunction(()=>!document.querySelector('dialog[open]'));
    for(const width of [320,390,768,1440]){
      await b.setViewport({width,height:width<500?844:1000});await go(b,'community');await click(b,'Tout le forum');await b.waitForSelector('.af-feed-post');
      assert(await b.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'feed overflow '+width);
      if(width===390)await b.screenshot({path:path.join(out,'feed-mobile-tested.png')});
      await go(b,'topic/'+topic);await b.waitForSelector('.af-forum-comment');assert(await b.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'thread overflow '+width);
      if(width===390)await b.screenshot({path:path.join(out,'thread-mobile-tested.png')});
    }
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({ok:true,source:'isolated test database',pagination:35,registration:true,composerContext:true,likes:true,follow:true,inlineReply:true,quote:true,edit:true,deletePreservesChildren:true,collapse:true,notifications:true,share:true,report:true,reload:true,viewports:[320,390,768,1440],browserErrors:errors},null,2));
    console.log('Forum browser proof passed.');
  }catch(error){if(a&&!a.isClosed())await a.screenshot({path:path.join(out,'failure-a.png')}).catch(()=>{});if(b&&!b.isClosed())await b.screenshot({path:path.join(out,'failure-b.png')}).catch(()=>{});throw error;}
  finally {if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));await service.close();fs.rmSync(directory,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
