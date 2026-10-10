// A controlled lethal hammer hit in the Blop dungeon, through the combat UI.
// Only the isolated test fight is staged: two wounded targets beside the player.
const puppeteer = require('puppeteer-core');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const out = process.env.PROOF_DIR || '/tmp/dofus-dead-fighters';

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, pipe: true });
  const report = { errors: [] };
  let page;
  try {
    page = await browser.newPage(); page.setDefaultTimeout(25000);
    await page.setViewport({ width: 1440, height: 900 });
    page.on('pageerror', error => report.errors.push(error.message));
    const cdp = await page.createCDPSession();
    await cdp.send('Page.setDownloadBehavior', { behavior: 'deny' });
    await page.evaluateOnNewDocument(() => {
      localStorage.setItem('dofus-lite-player-setup-v1', JSON.stringify({ playerClass: 'IOP', mode: 'boss', bossId: 1188, bossGrade: 5 }));
      localStorage.setItem('dofus-lite-loadouts-v1', JSON.stringify({
        'A:IOP': { version: 1, level: 200, base: { force: 100 }, slots: { weapon: 2416 }, rollMode: 'max', rollSeed: 1 },
      }));
      localStorage.setItem('dofus-lite-tactical-mode-v1', 'true');
      Math.random = () => .000031;
      const create = URL.createObjectURL;
      URL.createObjectURL = function (blob) { window.combatExport = blob; return create.call(this, blob); };
    });
    const click = async (selector, text = '') => {
      const handle = await page.evaluateHandle(({ selector, text }) => [...document.querySelectorAll(selector)]
        .find(e => e.checkVisibility() && e.textContent.includes(text)), { selector, text });
      assert(handle.asElement(), `Missing ${selector}: ${text}`);
      await handle.asElement().click(); await handle.dispose();
    };
    const record = async () => {
      if (!await page.$('.fight-log')) await click('.fight-heading-actions button', 'Journal');
      await click('.combat-log-heading button', 'Exporter');
      const result = await page.evaluate(async () => JSON.parse(await window.combatExport.text()));
      await click('.fight-log-close'); return result;
    };
    await page.goto(process.env.PROOF_URL || 'http://127.0.0.1:3013', { waitUntil: 'networkidle0' });
    await click('.setup-play');
    await page.waitForFunction(() => document.querySelectorAll('.token ruffle-player').length === 9
      && [...document.querySelectorAll('.token ruffle-player')].every(p => p.ruffle().readyState === 2));

    // Access the existing LiveMatch ref only in this isolated browser fixture;
    // no debug hooks or changes to the production game's rules are needed.
    report.fixture = await page.evaluate(() => {
      const element = document.querySelector('.fight-screen');
      let fiber = element[Object.keys(element).find(k => k.startsWith('__reactFiber$'))], match;
      for (; fiber && !match; fiber = fiber.return) {
        for (let hook = fiber.memoizedState; hook; hook = hook.next) {
          const value = hook.memoizedState?.current;
          if (typeof value?.humanAct === 'function' && typeof value?.ready === 'function') { match = value; break; }
        }
      }
      if (!match) throw new Error('Missing live combat fixture');
      const targets = [Object.values(match.state.fighters).find(f => f.monsterId === 1184), match.state.fighters.B6];
      const others = Object.values(match.state.fighters).filter(f => f.id !== 'A' && !targets.includes(f));
      const { board } = match.state;
      const distance = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
      const free = (x, y) => x >= 0 && y >= 0 && x < board.width && y < board.height && !board.obstacles[`${x},${y}`]?.blocksMove;
      const candidates = [];
      for (let y = 1; y < board.height - 1; y++) for (let x = 1; x < board.width - 3; x++) {
        if ([0, 1, 2].every(dx => free(x + dx, y)) && others.every(f => distance(f.pos, { x, y }) > 6)) candidates.push({ x, y });
      }
      candidates.sort((a, b) => distance(a, match.state.fighters.A.pos) - distance(b, match.state.fighters.A.pos));
      const origin = candidates[0];
      if (!origin) throw new Error('No clear test cells');
      const ready = match.ready;
      match.ready = function () {
        const result = ready.call(this);
        this.state.fighters.A.pos = origin;
        this.state.currentIndex = this.state.order.indexOf('A');
        this.state.fighters.A.pa = this.state.fighters.A.basePa;
        this.state.fighters.A.pm = this.state.fighters.A.basePm;
        for (const [i, target] of targets.entries()) Object.assign(this.state.fighters[target.id], {
          pos: { x: origin.x + 1 + i, y: origin.y }, hp: i ? 12 : 30,
        });
        this.state.rngState = 123456;
        this.ready = ready;
        return result;
      };
      return { mapId: match.state.mapId, origin, destination: { x: origin.x + 1, y: origin.y },
        targets: targets.map(f => ({ id: f.id, name: f.name })) };
    });
    await click('.placement-ready');
    await page.waitForSelector('.turn-status.yours');
    const victim = `.token[data-fighter-id="${report.fixture.targets[0].id}"]`;
    await page.hover(`${victim} .figure`);
    await page.waitForSelector(`.combat-stats[data-inspected-fighter="${report.fixture.targets[0].id}"]`);
    await page.screenshot({ path: path.join(out, 'before.png') });
    const before = await record();
    await click('.spell-btn', 'Marteau du Bouftou');
    await page.hover(`${victim} .figure`);
    await click(`${victim}.targetable .figure`);
    await page.waitForFunction(ids => ids.every(id => !document.querySelector(`.token[data-fighter-id="${id}"]`)), {}, report.fixture.targets.map(f => f.id));
    assert.equal(await page.$eval('.combat-stats', e => e.dataset.inspectedFighter), 'A');
    const floats = await page.$$eval('.health-change.dmg', els => els.map(e => ({ id: e.dataset.target, text: e.textContent })));
    assert(floats.some(f => f.id === report.fixture.targets[0].id && f.text === '−30'));
    assert(floats.some(f => f.id === report.fixture.targets[1].id && f.text === '−12'));
    const after = await record();
    report.deaths = after.events.slice(before.events.length).filter(e => e.t === 'death');
    assert.equal(report.deaths.length, 2);
    assert.equal(after.state.over, false);
    assert.equal(await page.$$eval('.token.side-B', els => els.length), 6);
    await page.keyboard.press('Escape');
    const p = report.fixture.destination;
    await page.waitForSelector(`.cell.hl-move[data-cell="${p.x},${p.y}"]`);
    await click(`.cell.hl-move[data-cell="${p.x},${p.y}"]`);
    await page.waitForFunction(() => !document.querySelector('.token.walking'));
    const moved = await record();
    assert.deepEqual(moved.state.fighters.A.pos, p);
    report.walkedOntoFreedCell = true;
    await page.mouse.move(5, 5);
    await page.waitForFunction(() => !document.querySelector('.health-change'));
    await page.screenshot({ path: path.join(out, 'after.png') });
    // The same removed tokens stay absent when returning to the original scenery.
    await click('.board-mode-toggle');
    await page.waitForFunction(() => [...document.querySelectorAll('.board img')].every(img => img.complete && img.naturalWidth));
    assert.equal(await page.$$eval('.token.side-B', els => els.length), 6);
    await page.screenshot({ path: path.join(out, 'after-scenery.png') });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight));
    assert.deepEqual(report.errors, []); report.passed = true;
    fs.writeFileSync(path.join(out, 'combat.json'), JSON.stringify(moved, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    report.failure = error.message;
    if (page) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
    throw error;
  } finally {
    fs.writeFileSync(path.join(out, 'proof.json'), JSON.stringify(report, null, 2));
    const child = browser.process(); await browser.disconnect(); if (child?.exitCode === null) child.kill('SIGTERM');
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
