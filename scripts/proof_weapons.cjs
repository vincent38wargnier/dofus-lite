const puppeteer = require('puppeteer-core');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const out = process.env.PROOF_DIR || '/tmp/dofus-weapon-proof';

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, pipe: true });
  let page;
  try {
    page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 1200 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const cdp = await page.createCDPSession();
    await cdp.send('Page.setDownloadBehavior', { behavior: 'deny' });
    // Only this temporary browser profile receives the test equipment/bot.
    await page.evaluateOnNewDocument(() => {
      localStorage.setItem('dofus-lite-player-setup-v1', JSON.stringify({ playerClass: 'IOP', botClass: 'CRA', mapId: 'arene', botId: 'weapon-proof' }));
      localStorage.setItem('dofus-lite-loadouts-v1', JSON.stringify({
        'A:IOP': { version: 1, level: 200, base: { force: 100 }, slots: { weapon: 2416 }, rollMode: 'max', rollSeed: 1 },
        'B:CRA': { version: 1, level: 200, base: {}, slots: {}, rollMode: 'max', rollSeed: 1 },
      }));
      localStorage.setItem('koliseum.bots.v1', JSON.stringify([{ id: 'weapon-proof', name: 'Cible marteau', custom: true,
        code: `function decide(v, a) {
          if (a.dist(v.you.pos, v.enemy.pos) === 2 && a.aligned(v.you.pos, v.enemy.pos)) return a.endTurn();
          const cells = a.reachable().filter(c => a.dist(c.pos, v.enemy.pos) === 2 && a.aligned(c.pos, v.enemy.pos)).sort((a,b) => a.cost-b.cost);
          return cells.length ? a.move(cells[0].pos) : a.moveToward(v.enemy.pos) || a.endTurn();
        }` }]));
      Math.random = () => 0.000007;
      const original = URL.createObjectURL;
      URL.createObjectURL = function (blob) { window.weaponExport = blob; return original.call(this, blob); };
    });
    const click = async (selector, text = '') => {
      const handle = await page.evaluateHandle(({ selector, text }) => [...document.querySelectorAll(selector)]
        .find(element => element.checkVisibility() && element.textContent.includes(text)), { selector, text });
      assert(handle.asElement(), `Missing ${selector}: ${text}`);
      assert(!await handle.asElement().evaluate(element => element.disabled), `Disabled ${selector}: ${text}`);
      await handle.asElement().click(); await handle.dispose();
    };
    const exportState = async () => {
      await click('.combat-log-heading button', 'Exporter');
      return page.evaluate(async () => JSON.parse(await window.weaponExport.text()));
    };
    const humanTurn = () => page.waitForFunction(() => document.querySelector('.turn-status.yours'));
    await page.goto(process.env.PROOF_URL || 'http://127.0.0.1:3013', { waitUntil: 'networkidle0' });
    await click('.setup-play');
    await page.waitForFunction(() => [...document.querySelectorAll('.retro-actor ruffle-player')].filter(player => typeof player.animate === 'function').length === 2);
    await click('.placement-ready');
    await humanTurn();
    let before;
    for (let i = 0; i < 8; i++) {
      before = await exportState();
      const a = before.state.fighters.A.pos, b = before.state.fighters.B.pos;
      if (Math.abs(a.x-b.x) + Math.abs(a.y-b.y) === 2 && (a.x === b.x || a.y === b.y)) break;
      await click('.play-controls .btn', 'Fin de tour');
      await page.waitForFunction(() => !document.querySelector('.turn-status.yours'));
      await humanTurn();
    }
    const a = before.state.fighters.A.pos, b = before.state.fighters.B.pos;
    assert.equal(Math.abs(a.x-b.x) + Math.abs(a.y-b.y), 2);
    await page.waitForFunction(() => !document.querySelector('.token.walking'));
    await click('.spell-btn', 'Marteau du Bouftou');
    if (process.env.EXPECT_LEGACY === '1') {
      assert.equal(await page.$('.token.side-B.targetable'), null);
      await click('.token.side-B .figure');
      assert.equal((await exportState()).state.fighters.B.hp, before.state.fighters.B.hp);
      await page.keyboard.press('Escape');
      if (!await page.$('.spell-btn.selected')) await click('.spell-btn', 'Marteau du Bouftou');
      const target = { x: (a.x+b.x)/2, y: (a.y+b.y)/2 };
      await click(`.cell[data-cell="${target.x},${target.y}"]`);
      const after = await exportState();
      assert(after.state.fighters.B.hp < before.state.fighters.B.hp);
      console.log('Reproduced: clicking a fighter in hammer splash range does nothing; aiming at the intervening empty cell deals damage.');
      return;
    }
    await page.waitForSelector('.token.side-B.targetable');
    await page.hover('.token.side-B.targetable .figure');
    await page.waitForFunction(() => document.querySelectorAll('.attack-preview-cell').length === 4);
    await page.screenshot({ path: path.join(out, 'hammer-targeting.png') });
    await click('.token.side-B.targetable .figure');
    await page.keyboard.press('Escape');
    await page.mouse.move(30, 30);
    const after = await exportState();
    const cast = after.events.find(event => event.t === 'cast' && event.itemId === 2416);
    assert(cast);
    assert.equal(Math.abs(a.x-cast.target.x) + Math.abs(a.y-cast.target.y), 1);
    assert(after.state.fighters.B.hp < before.state.fighters.B.hp);
    assert.equal(after.state.fighters.A.hp, before.state.fighters.A.hp);
    assert.equal(after.state.fighters.A.pa, before.state.fighters.A.pa - 5);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(out, 'hammer-hit.png') });
    await click('.play-controls .btn', 'Fin de tour');
    await page.waitForFunction(() => !document.querySelector('.turn-status.yours'));
    await humanTurn();
    const emptyBefore = await exportState();
    const emptyAim = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    await click('.spell-btn', 'Marteau du Bouftou');
    const emptySelector = `.cell[data-cell="${emptyAim.x},${emptyAim.y}"]`;
    await page.hover(emptySelector);
    await page.waitForFunction(() => document.querySelectorAll('.attack-preview-cell').length === 4);
    await page.screenshot({ path: path.join(out, 'hammer-empty-target.png') });
    await click(emptySelector);
    const emptyAfter = await exportState();
    const emptyCast = emptyAfter.events.slice(emptyBefore.events.length).find(e => e.t === 'cast');
    assert.deepEqual(emptyCast?.target, emptyAim);
    assert(emptyAfter.state.fighters.B.hp < emptyBefore.state.fighters.B.hp);
    assert.equal(emptyAfter.state.fighters.A.pa, emptyBefore.state.fighters.A.pa - 5);
    await page.mouse.move(30, 30);
    await page.screenshot({ path: path.join(out, 'hammer-empty-hit.png') });

    await click('.play-controls .btn', 'Fin de tour');
    await page.waitForFunction(() => !document.querySelector('.turn-status.yours'));
    await humanTurn();
    const missBefore = await exportState();
    await click('.spell-btn', 'Marteau du Bouftou');
    const missAim = { x: 2 * a.x - emptyAim.x, y: 2 * a.y - emptyAim.y };
    await click(`.cell[data-cell="${missAim.x},${missAim.y}"]`);
    const missAfter = await exportState();
    assert.deepEqual(missAfter.events.slice(missBefore.events.length).find(e => e.t === 'cast')?.target, missAim);
    assert.equal(missAfter.state.fighters.B.hp, missBefore.state.fighters.B.hp);
    assert.equal(missAfter.state.fighters.A.pa, missBefore.state.fighters.A.pa - 5);
    assert.deepEqual(errors, []);
    const result = { weapon: 'Marteau du Bouftou', clicked: b, aimed: cast.target, damage: before.state.fighters.B.hp - after.state.fighters.B.hp,
      emptyAim, emptyAimDamage: emptyBefore.state.fighters.B.hp - emptyAfter.state.fighters.B.hp, whollyEmptyAim: missAim, apCost: 5, errors };
    fs.writeFileSync(path.join(out, 'proof.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    if (page) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
    throw error;
  } finally { await browser.disconnect(); browser.process()?.kill('SIGKILL'); }
})().catch(error => { console.error(error); process.exitCode = 1; });
