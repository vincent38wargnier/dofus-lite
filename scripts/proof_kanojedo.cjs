// Exercise preparation, original client assets, real clicks and combat exports.
const puppeteer = require('puppeteer-core');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const out = process.env.PROOF_DIR || '/tmp/dofus-kanojedo';

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, pipe: true });
  const report = { errors: [] };
  let page;
  try {
    page = await browser.newPage();
    page.setDefaultTimeout(10000);
    await page.setViewport({ width: 1600, height: 1150 });
    page.on('pageerror', error => report.errors.push(error.message));
    const cdp = await page.createCDPSession();
    await cdp.send('Page.setDownloadBehavior', { behavior: 'deny' });
    await page.evaluateOnNewDocument(() => {
      if (!localStorage.getItem('kanojedo-proof')) {
        localStorage.setItem('dofus-lite-player-setup-v1', JSON.stringify({ playerClass: 'CRA', botClass: 'IOP', botId: 'maison', mapId: 'canyon' }));
        localStorage.setItem('dofus-lite-loadouts-v1', JSON.stringify({
          'A:CRA': { version: 1, level: 200, base: { intelligence: 100 }, slots: {}, rollMode: 'max', rollSeed: 1 },
        }));
        localStorage.setItem('kanojedo-proof', 'true');
      }
      Math.random = () => 0.000007;
      const original = URL.createObjectURL;
      URL.createObjectURL = function (blob) { window.combatExport = blob; return original.call(this, blob); };
    });
    const click = async (selector, text = '') => {
      const handle = await page.evaluateHandle(({ selector, text }) => [...document.querySelectorAll(selector)]
        .find(e => e.checkVisibility() && e.textContent.includes(text)), { selector, text });
      assert(handle.asElement(), `Missing ${selector}: ${text}`);
      assert(!await handle.asElement().evaluate(e => e.disabled), `Disabled ${selector}: ${text}`);
      await handle.asElement().click(); await handle.dispose();
    };
    const record = async () => {
      await click('.combat-log-heading button', 'Exporter');
      return page.evaluate(async () => JSON.parse(await window.combatExport.text()));
    };
    const humanTurn = () => page.waitForFunction(() => document.querySelector('.turn-status.yours'));
    const pass = async () => {
      await page.keyboard.press('Escape');
      await page.mouse.move(20, 20);
      await page.waitForFunction(() => !document.querySelector('.fighter-inspector'));
      const heading = await page.$eval('.fight-heading', e => e.innerText);
      await click('.play-controls .btn', 'Fin de tour');
      // A zero-AP monster may already have passed before the next CDP call.
      await page.waitForFunction(previous => document.querySelector('.turn-status.yours')
        && document.querySelector('.fight-heading').innerText !== previous, {}, heading);
    };
    const castAtPoutch = async () => {
      await click('.spell-slot[data-spell-id="161"] .spell-btn');
      if (await page.$('.token.side-B.targetable')) {
        await click('.token.side-B.targetable .figure');
        await page.mouse.move(20, 20);
        return true;
      }
      await page.keyboard.press('Escape');
      return false;
    };
    const approach = async state => {
      // Choose an actually highlighted move cell using walking distance to B.
      const target = state.fighters.B.pos;
      const costs = new Map([[`${target.x},${target.y}`, 0]]), queue = [target];
      for (let i = 0; i < queue.length; i++) {
        const p = queue[i];
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const n = { x: p.x + dx, y: p.y + dy }, k = `${n.x},${n.y}`;
          if (n.x < 0 || n.y < 0 || n.x >= state.board.width || n.y >= state.board.height || state.board.obstacles[k]?.blocksMove || costs.has(k)) continue;
          costs.set(k, costs.get(`${p.x},${p.y}`) + 1); queue.push(n);
        }
      }
      const moves = await page.$$eval('.cell.hl-move', cells => cells.map(c => c.dataset.cell));
      moves.sort((a, b) => (costs.get(a) ?? Infinity) - (costs.get(b) ?? Infinity));
      if (!moves.length) return false;
      await click(`.cell[data-cell="${moves[0]}"]`);
      await page.waitForFunction(() => !document.querySelector('.token.walking'));
      return true;
    };
    await page.goto(process.env.PROOF_URL || 'http://127.0.0.1:3013', { waitUntil: 'networkidle0' });
    await click('.setup-navigation button', 'Combat');
    await click('.match-modes button', 'Monstres');
    await page.select('select[aria-label="Niveau du Poutch"]', '2');
    await page.reload({ waitUntil: 'networkidle0' });
    await click('.setup-navigation button', 'Combat');
    assert.equal(await page.$eval('select[aria-label="Niveau du Poutch"]', e => e.value), '2');
    await click('.match-modes button', 'Duel');
    assert.equal(await page.$eval('.player-setup select[aria-label="Carte de combat"]', e => e.value), 'canyon');
    await click('.match-modes button', 'Monstres');
    await page.select('select[aria-label="Niveau du Poutch"]', '5');
    await page.screenshot({ path: path.join(out, 'preparation.png') });
    report.savedChoice = { afterReload: 2, restoredDuelMap: 'canyon', levels: [1, 25, 50, 75, 100] };
    await page.setViewport({ width: 390, height: 844 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: path.join(out, 'preparation-mobile.png'), fullPage: true });
    await page.setViewport({ width: 1600, height: 1150 });
    await click('.setup-play');
    await page.waitForSelector('.token.side-B[data-actor="1219"] ruffle-player');
    await click('.placement-ready');
    await humanTurn();
    let before = await record();
    assert.equal(before.state.mapId, 'amakna_534');
    assert.equal(before.state.fighters.B.hp, 10000);
    assert.equal(before.state.fighters.B.pa, 0); assert.equal(before.state.fighters.B.pm, 0);
    const original = before.state.fighters.B.pos;
    for (let turn = 0; turn < 8; turn++) {
      if (await castAtPoutch()) break;
      await approach((await record()).state);
      if (await castAtPoutch()) break;
      await pass();
    }
    const afterHit = await record();
    const damage = afterHit.events.filter(e => e.t === 'damage' && e.target === 'B' && e.source === 'A');
    assert(damage.some(e => e.amount > 0));
    await pass();
    const after = await record();
    assert.deepEqual(after.state.fighters.B.pos, original);
    assert.equal(after.state.fighters.A.hp, before.state.fighters.A.hp);
    assert.equal(after.state.fighters.B.pa, 0); assert.equal(after.state.fighters.B.pm, 0);
    assert(!after.events.some(e => e.t === 'bot_error' || ((e.t === 'cast' || e.t === 'move') && e.fighter === 'B')));
    report.combat = { mapId: after.mapId, actorId: await page.$eval('.token.side-B', e => e.dataset.actor),
      damage: damage.map(e => e.amount), hpLeft: after.state.fighters.B.hp, rounds: after.state.turn,
      stationary: true, noRetaliation: true, pa: 0, pm: 0 };
    await page.mouse.move(20, 20);
    if (await page.$('.fighter-inspector-toolbar button')) await click('.fighter-inspector-toolbar button');
    await page.mouse.move(20, 20);
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: path.join(out, 'combat.png') });
    fs.writeFileSync(path.join(out, 'combat.json'), JSON.stringify(after, null, 2));
    const figure = await page.$('.fight-screen .token.side-B .figure');
    await figure.focus();
    await figure.press('Enter');
    await page.waitForSelector('[data-inspected-fighter="B"]');
    await click('[data-inspected-fighter="B"] .fighter-spells summary');
    assert((await page.$eval('[data-inspected-fighter="B"]', e => e.innerText)).includes('Tuerie'));
    await page.screenshot({ path: path.join(out, 'inspection.png') });
    assert.deepEqual(report.errors, []);
    report.passed = true;
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    report.failure = error.message;
    if (page) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
    throw error;
  } finally {
    fs.writeFileSync(path.join(out, 'proof.json'), JSON.stringify(report, null, 2));
    const child = browser.process();
    await browser.disconnect();
    if (child?.exitCode === null) child.kill('SIGTERM');
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
