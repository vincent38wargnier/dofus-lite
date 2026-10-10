// Three consecutive real Furies in one turn, with live bonus display and logs.
const puppeteer = require('puppeteer-core');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const out = process.env.PROOF_DIR || '/tmp/dofus-immediate-boosts';

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, pipe: true });
  const report = { errors: [], casts: [] };
  let page;
  try {
    page = await browser.newPage();
    page.setDefaultTimeout(10000);
    await page.setViewport({ width: 1600, height: 1150, deviceScaleFactor: 1.5 });
    page.on('pageerror', e => report.errors.push(e.message));
    const cdp = await page.createCDPSession();
    await cdp.send('Page.setDownloadBehavior', { behavior: 'deny' });
    await page.evaluateOnNewDocument(() => {
      localStorage.setItem('dofus-lite-player-setup-v1', JSON.stringify({ playerClass: 'SACRIEUR', mode: 'kanojedo', monsterGrade: 5 }));
      localStorage.setItem('dofus-lite-loadouts-v1', JSON.stringify({
        'A:SACRIEUR': { version: 1, level: 200, base: {},
          slots: { cape: 8866, belt: 2369, amulet: 323, ring1: 2469, dofus1: 7754 },
          rollMode: 'max', rollSeed: 1, spells: { grades: { 447: 5 } } },
      }));
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
      await click('.fight-screen .combat-log-heading button', 'Exporter');
      return page.evaluate(async () => JSON.parse(await window.combatExport.text()));
    };
    const pass = async () => {
      await page.keyboard.press('Escape'); await page.mouse.move(20, 20);
      await page.waitForFunction(() => !document.querySelector('.fighter-inspector'));
      const heading = await page.$eval('.fight-heading', e => e.innerText);
      await click('.play-controls .btn', 'Fin de tour');
      await page.waitForFunction(previous => document.querySelector('.turn-status.yours')
        && document.querySelector('.fight-heading').innerText !== previous, {}, heading);
    };
    const selectFury = () => click('.fight-screen .spell-slot[data-spell-id="447"] .spell-btn');
    const approach = async state => {
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
      assert(moves.length, 'No movement toward Poutch');
      await click(`.cell[data-cell="${moves[0]}"]`);
      await page.waitForFunction(() => !document.querySelector('.token.walking'));
    };
    await page.goto(process.env.PROOF_URL || 'http://127.0.0.1:3013', { waitUntil: 'networkidle0' });
    await click('.setup-play'); await click('.placement-ready');
    await page.waitForSelector('.turn-status.yours');
    let inReach = false;
    for (let turn = 0; turn < 12; turn++) {
      await selectFury(); inReach = !!await page.$('.token.side-B.targetable');
      await page.keyboard.press('Escape');
      if (inReach) break;
      await approach((await record()).state); await pass();
    }
    assert(inReach);
    let before = await record();
    const initial = before;
    assert.equal(before.state.fighters.A.pa, 12);
    for (let n = 0; n < 3; n++) {
      await selectFury(); await click('.token.side-B.targetable .figure');
      await page.keyboard.press('Escape'); await page.mouse.move(20, 20);
      const after = await record();
      const events = after.events.slice(before.events.length);
      const hit = events.find(e => e.t === 'damage' && e.target === 'B');
      assert(hit, 'Expected a successful Fury');
      assert.equal(after.state.turn, initial.state.turn);
      assert(!events.some(e => e.t === 'turn_start' || e.t === 'turn_end'));
      assert.equal(hit.calculation.flatDamage, (initial.state.fighters.A.permanent.damage || 0) + n * 8);
      const base = Math.floor(hit.calculation.jet * (100 + before.state.fighters.A.stats.chance) / 100);
      assert.equal(hit.calculation.raw, base + hit.calculation.flatDamage);
      assert.equal(hit.amount, Math.floor(hit.calculation.raw * hit.calculation.areaPercent / 100));
      assert.equal(before.state.fighters.B.hp - after.state.fighters.B.hp, hit.amount);
      assert.equal(before.state.fighters.A.pa - after.state.fighters.A.pa, 4);
      const shown = await page.$eval('.fight-screen [data-fighter-id="A"] [data-bonus-stat="damage"]', e => e.textContent);
      assert(shown.startsWith(`+${(n + 1) * 8} `));
      report.casts.push({ turn: after.state.turn, baseRoll: hit.calculation.jet, acquiredBonusUsed: n * 8,
        equipmentDamage: initial.state.fighters.A.permanent.damage || 0, damageBeforeArea: hit.calculation.raw,
        areaPercent: hit.calculation.areaPercent, damage: hit.amount, displayedBonus: shown });
      before = after;
    }
    assert.equal(before.state.fighters.A.pa, 0);
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: path.join(out, 'three-furies-same-turn.png') });
    await click('.fight-screen .combat-log-heading label');
    const log = await page.$('.fight-screen .log');
    await log.evaluate(e => { e.scrollTop = e.scrollHeight; });
    await log.screenshot({ path: path.join(out, 'fury-calculations.png') });
    assert.deepEqual(report.errors, []);
    fs.writeFileSync(path.join(out, 'combat.json'), JSON.stringify(before, null, 2));
    fs.writeFileSync(path.join(out, 'proof.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    if (page) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
    throw error;
  } finally {
    const child = browser.process(); await browser.disconnect();
    if (child?.exitCode === null) child.kill('SIGTERM');
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
