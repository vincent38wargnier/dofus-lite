const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const puppeteer = require('puppeteer-core');
const out = process.env.PROOF_DIR || '/tmp/dofus-creature-mode';
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
      if (localStorage.getItem('creature-proof')) return;
      localStorage.setItem('creature-proof', '1');
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
        Object.assign(this.state.fighters.B6, { pos: { x: origin.x - 1, y: origin.y + 1 }, hp: 2000, maxHp: 2000 });
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
    const point = await page.evaluate(() => {
      const token = document.querySelector('.token[data-fighter-id="B6"]'), rect = token.getBoundingClientRect();
      const hw = parseFloat(getComputedStyle(document.querySelector('.board-wrap')).getPropertyValue('--hw'));
      return { x: rect.left, y: rect.top - hw * .42 };
    });
    await page.mouse.move(point.x, point.y);
    const hit = () => page.evaluate(p => document.elementFromPoint(p.x, p.y)?.closest('[data-fighter-id]')?.dataset.fighterId, point);
    assert.equal(await hit(), 'B');
    await capture('overlap-before');
    check('Reproduced: the boss body intercepts the exact point over the creature behind it');
    const stateBefore = await page.evaluate(() => JSON.stringify(window.creatureFixture.state));
    await click('.board-creature-toggle'); await readyArt();
    assert.equal(await page.evaluate(() => JSON.stringify(window.creatureFixture.state)), stateBefore);
    assert.equal(await page.$eval('.token[data-fighter-id="B"]', e => e.dataset.actor), '901');
    assert.equal(await page.$eval('.token[data-fighter-id="B6"]', e => e.dataset.actor), '900');
    assert.equal(await page.$eval('.token[data-fighter-id="A"]', e => e.dataset.actor), '82');
    await page.mouse.move(point.x, point.y);
    assert.equal(await hit(), 'B6');
    await page.waitForSelector('.combat-stats[data-inspected-fighter="B6"]');
    assert(await page.$('.token[data-fighter-id="B6"].targetable.is-inspected'));
    assert(await page.$('.spell-slot[data-spell-id="152"] .spell-btn.selected'));
    await capture('creatures-target');
    await page.mouse.click(point.x, point.y);
    const action = await page.evaluate(() => window.creatureActions.at(-1));
    assert(action.ok); assert.deepEqual(action.action.target, { x: report.fixture.origin.x - 1, y: report.fixture.origin.y + 1 });
    assert(action.events.some(e => e.t === 'damage' && e.target === 'B6' && e.amount > 0));
    assert(!action.events.some(e => e.t === 'damage' && e.target === 'B'));
    report.cast = action;
    check('Same cursor position now targets the rear creature: correct inspection, cast and damage; display toggle consumes no action');
    await page.mouse.move(4, 4);
    await click('.board-mode-toggle:not(.board-creature-toggle)');
    assert(await page.$('.board-wrap.creature-mode:not(.tactical-mode)'));
    await capture('creatures-scenery');
    for (const size of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
      await page.setViewport(size); assert(await fit()); await capture(`creatures-${size.width}`);
    }
    check('Compact mode works with original scenery and tactical terrain; controls fit phone and landscape');
    await page.setViewport({ width: 1440, height: 900 });
    await click('.fight-heading-actions button', 'Abandonner');
    await page.reload({ waitUntil: 'networkidle0' }); await click('.setup-play'); await click('.combat-choice-launch');
    await page.waitForSelector('.placement-ready'); await readyArt();
    assert.equal(await page.$eval('.board-creature-toggle', e => e.getAttribute('aria-pressed')), 'true');
    await click('.board-creature-toggle'); await readyArt();
    assert.equal(await page.$('.creature-token'), null);
    assert.equal(await page.evaluate(() => localStorage.getItem('dofus-lite-creature-mode-v1')), 'false');
    check('Mode survives reload and returns to each fighter’s original appearance');
    assert.deepEqual(report.errors, []); report.passed = true;
  } catch (error) {
    report.failure = error.stack; await capture('failure').catch(() => {});
    fs.writeFileSync(path.join(out, 'failure.txt'), await page.evaluate(() => document.body.innerText)); throw error;
  } finally { fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
