const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const puppeteer = require('puppeteer-core');
const out = process.env.PROOF_DIR || '/tmp/dofus-overlap-targeting';
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, pipe: true });
  const page = await browser.newPage(), report = { errors: [], checks: [] };
  page.setDefaultTimeout(30000);
  page.on('pageerror', error => report.errors.push(error.message));
  const click = async (selector, text = '') => {
    const element = await page.evaluateHandle(({ selector, text }) => [...document.querySelectorAll(selector)].find(e => e.checkVisibility() && e.textContent.includes(text)), { selector, text });
    assert(element.asElement(), `Missing ${selector}: ${text}`); await element.asElement().click(); await element.dispose();
  };
  const capture = name => page.screenshot({ path: path.join(out, `${name}.png`) });
  const check = text => { report.checks.push(text); console.log(text); };
  const fit = () => page.evaluate(() => {
    const tools = document.querySelector('.board-tools').getBoundingClientRect();
    return document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight
      && tools.right <= innerWidth && tools.left >= 0;
  });
  const readyArt = () => page.waitForFunction(() => document.querySelectorAll('.token ruffle-player').length === 9
    && [...document.querySelectorAll('.token ruffle-player')].every(p => p.ruffle().readyState === 2));
  try {
    await page.setViewport({ width: 1440, height: 900 });
    // Fresh browser storage only; never touch the player's running game.
    await page.evaluateOnNewDocument(() => {
      // Screenshots at several pixel densities can take longer than a turn.
      // Pause only the UI's 200 ms turn clock in this isolated test browser.
      const interval = window.setInterval.bind(window);
      window.setInterval = (callback, delay, ...args) => interval(delay === 200 ? () => {} : callback, delay, ...args);
      if (localStorage.getItem('overlap-proof')) return;
      localStorage.setItem('overlap-proof', '1');
      localStorage.setItem('dofus-lite-player-setup-v1', JSON.stringify({ playerClass: 'IOP', mode: 'boss', bossId: 1188, bossGrade: 5 }));
      localStorage.setItem('dofus-lite-loadouts-v1', JSON.stringify({ 'A:IOP': {
        version: 1, level: 200, base: { force: 100 }, slots: { weapon: 2416 }, rollMode: 'max', rollSeed: 1,
      } }));
      localStorage.setItem('dofus-lite-tactical-mode-v1', 'true');
      localStorage.setItem('dofus-lite-sound', JSON.stringify({ enabled: false, volume: 0 }));
    });
    await page.goto(process.env.PROOF_URL || 'http://127.0.0.1:3013', { waitUntil: 'networkidle0' });
    await click('.setup-play'); await click('.combat-choice-launch'); await page.waitForSelector('.placement-ready');
    await readyArt();
    report.fixture = await page.evaluate(() => {
      const el = document.querySelector('.fight-screen');
      let fiber = el[Object.keys(el).find(k => k.startsWith('__reactFiber$'))], match;
      for (; fiber && !match; fiber = fiber.return) for (let hook = fiber.memoizedState; hook; hook = hook.next) {
        const value = hook.memoizedState?.current;
        if (typeof value?.humanAct === 'function' && typeof value?.ready === 'function') { match = value; break; }
      }
      if (!match) throw new Error('Missing match fixture');
      window.creatureFixture = match;
      const others = Object.values(match.state.fighters).filter(f => !['A', 'B', 'B6'].includes(f.id));
      const { board } = match.state;
      const distance = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
      const free = (x, y) => !board.obstacles[`${x},${y}`]?.blocksMove;
      let origin;
      for (let y = 3; y < board.height - 4 && !origin; y++) for (let x = 3; x < board.width - 5; x++) {
        if ([-1, 0].every(dx => [0, 1, 2].every(dy => free(x + dx, y + dy)))
          && others.every(f => distance(f.pos, { x, y }) > 6)) { origin = { x, y }; break; }
      }
      if (!origin) throw new Error('Missing clear cells');
      const ready = match.ready;
      match.ready = function () {
        const result = ready.call(this);
        this.state.fighters.A.pos = origin; this.state.fighters.A.pa = 40;
        this.state.currentIndex = this.state.order.indexOf('A');
        Object.assign(this.state.fighters.B6, { appearanceMonsterId: 921, name: 'Pichon Bleu', pos: { x: origin.x - 1, y: origin.y + 1 }, hp: 2000, maxHp: 2000 });
        Object.assign(this.state.fighters.B, { appearanceMonsterId: 924, name: 'Pichon Kloune' });
        this.state.fighters.B.pos = { x: origin.x, y: origin.y + 2 };
        this.state.rngState = 123456; this.ready = ready; return result;
      };
      window.creatureActions = [];
      const humanAct = match.humanAct;
      match.humanAct = function (action) { const result = humanAct.call(this, action); window.creatureActions.push({ action, ok: result.ok, events: result.events }); return result; };
      return { origin, targetId: 'B6', frontId: 'B' };
    });
    await click('.placement-ready'); await page.waitForSelector('.turn-status.yours');
    await click('.spell-slot[data-spell-id="152"] .spell-btn');
    assert(await page.$('.token[data-fighter-id="B"].targetable'), 'front creature must be a legal target too');
    assert(await page.$('.token[data-fighter-id="B6"].targetable'), 'rear creature must be a legal target');
    await page.waitForFunction(() => {
      const board = document.querySelector('.board').getBoundingClientRect();
      return [...document.querySelectorAll('.token')].every(token => {
        const rect = token.getBoundingClientRect();
        return Math.abs(rect.left - board.left - parseFloat(token.style.left)) < .1
          && Math.abs(rect.top - board.top - parseFloat(token.style.top)) < .1;
      });
    });

    await readyArt();
    await page.waitForFunction(() => document.querySelector('.token[data-fighter-id="B6"]').dataset.actor === '1487');
    const targetPoint = async () => page.evaluate(() => {
      const rear = document.querySelector('.token[data-fighter-id="B6"]');
      const front = document.querySelector('.token[data-fighter-id="B"]');
      const art = token => {
        const canvas = token.querySelector('ruffle-player').shadowRoot.querySelector('canvas');
        const rect = canvas.getBoundingClientRect(), data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        return { rect, alpha(x,y) {
          let px = Math.floor((x-rect.left)*canvas.width/rect.width), py = Math.floor((y-rect.top)*canvas.height/rect.height);
          if (px<0 || py<0 || px>=canvas.width || py>=canvas.height) return 0;
          if (token.dataset.mirror==='true') px=canvas.width-1-px;
          return data[(py*canvas.width+px)*4+3];
        } };
      };
      const backArt=art(rear), frontArt=art(front), box=front.querySelector('.figure').getBoundingClientRect(), candidates=[];
      for (let y=Math.ceil(box.top); y<box.bottom; y++) for (let x=Math.ceil(box.left); x<box.right; x++) {
        if(backArt.alpha(x,y)>=220 && frontArt.alpha(x,y)<8
          && document.elementFromPoint(x,y)?.closest('[data-fighter-id]')===front) candidates.push({x,y});
      }
      if(!candidates.length) throw new Error('No visible rear pixels inside the foreground DOM hitbox');
      const center = candidates.reduce((p,c)=>({x:p.x+c.x/candidates.length,y:p.y+c.y/candidates.length}),{x:0,y:0});
      candidates.sort((a,b)=>Math.hypot(a.x-center.x,a.y-center.y)-Math.hypot(b.x-center.x,b.y-center.y));
      return { ...candidates[0], candidates:candidates.length };
    });
    let point = await targetPoint(); report.pointer=point;
    await page.mouse.move(point.x, point.y);
    await page.waitForSelector('.combat-stats[data-inspected-fighter="B6"]');
    assert(await page.$('.token[data-fighter-id="B6"].is-inspected'));
    assert.equal(await page.$eval('.board-creature-toggle',e=>e.getAttribute('aria-pressed')),'false');
    assert.equal(await page.evaluate(p=>document.elementFromPoint(p.x,p.y)?.closest('[data-fighter-id]')?.dataset.fighterId,point),'B');
    await capture('blue-target-normal');
    const clip = await page.evaluate(() => {
      const board=document.querySelector('.board').getBoundingClientRect();
      const a=document.querySelector('.token[data-fighter-id="A"]').getBoundingClientRect();
      const b=document.querySelector('.token[data-fighter-id="B"]').getBoundingClientRect();
      return {x:Math.max(board.left,Math.min(a.left,b.left)-140),y:Math.max(board.top,Math.min(a.top,b.top)-180),width:420,height:360};
    });
    await page.screenshot({path:path.join(out,'blue-target-detail.png'),clip});
    check('Normal sprites: visible blue fish is inspected even though the foreground DOM rectangle still covers the pointer');
    await click('.spell-slot[data-spell-id="151"] .spell-btn');
    await page.mouse.move(point.x,point.y);
    await page.waitForSelector('.attack-preview-cell.aim');
    assert.equal(await page.$eval('.attack-preview-cell.aim',e=>e.dataset.attackCell),`${report.fixture.origin.x-1},${report.fixture.origin.y+1}`);
    await capture('blue-target-area');
    check('The area preview is centered on the same blue fish as the inspection');
    await click('.spell-slot[data-spell-id="152"] .spell-btn');
    await page.mouse.move(point.x,point.y);
    await page.mouse.click(point.x,point.y);
    const action=await page.evaluate(()=>window.creatureActions.at(-1));
    assert(action.ok); assert.deepEqual(action.action.target,{x:report.fixture.origin.x-1,y:report.fixture.origin.y+1});
    assert(action.events.some(e=>e.t==='damage'&&e.target==='B6'&&e.amount>0));
    assert(!action.events.some(e=>e.t==='damage'&&e.target==='B'));
    report.cast=action;
    check('The same click casts on the blue fish and damages it, without hitting the foreground monster');
    // Changing the display or size cannot make the rectangle come back.
    await page.mouse.move(4,4);
    await click('.board-mode-toggle:not(.board-creature-toggle)');
    await click('.spell-slot[data-spell-id="152"] .spell-btn');
    point=await targetPoint(); await page.mouse.move(point.x,point.y);
    await page.waitForSelector('.combat-stats[data-inspected-fighter="B6"]');
    await capture('blue-target-scenery');
    check('The same target is resolved with the original scenery');
    for(const size of [{width:390,height:844},{width:844,height:390}]) {
      await page.setViewport({...size,deviceScaleFactor:2});
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      await page.waitForFunction(() => {
        const board=document.querySelector('.board').getBoundingClientRect();
        return [...document.querySelectorAll('.token')].every(t=>Math.abs(t.getBoundingClientRect().left-board.left-parseFloat(t.style.left))<.1);
      });
      assert(await fit());
      point=await targetPoint(); await page.mouse.move(point.x,point.y);
      await page.waitForSelector('.combat-stats[data-inspected-fighter="B6"]');
      await capture(`blue-target-${size.width}`);
    }
    check('Pointer targeting stays aligned after portrait and landscape resizing, without page scrolling');
    const cdp=await page.createCDPSession();
    await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    point=await targetPoint();
    report.touchPoint=point;
    await page.evaluate(() => {
      window.touchProbe=[];
      for(const type of ['pointerdown','touchstart','pointerup','touchend','mousedown','mouseup','click']) document.addEventListener(type,e=>window.touchProbe.push({type,detail:e.detail,x:e.clientX,y:e.clientY,id:e.target.closest('[data-fighter-id]')?.dataset.fighterId,target:e.target.className?.baseVal??e.target.className}),true);
    });
    const beforeTouch=await page.evaluate(()=>window.creatureActions.length);
    await page.touchscreen.tap(point.x,point.y);
    await page.waitForFunction(count=>window.creatureActions.length===count+1,{timeout:5000},beforeTouch);
    const touch=await page.evaluate(()=>window.creatureActions.at(-1));
    assert(touch.ok); assert.deepEqual(touch.action.target,action.action.target);
    assert(touch.events.some(e=>e.t==='damage'&&e.target==='B6'&&e.amount>0));
    check('A touch tap on a high-density mobile screen also casts on the blue fish');
    assert.deepEqual(report.errors,[]);report.passed=true;
  } catch(error) {
    report.touch=await page.evaluate(()=>({events:window.touchProbe,actions:window.creatureActions?.map(e=>e.action),selected:document.querySelector('.spell-btn.selected')?.textContent}));
    report.failure=error.stack; await capture('failure').catch(()=>{}); throw error;
  } finally {fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
