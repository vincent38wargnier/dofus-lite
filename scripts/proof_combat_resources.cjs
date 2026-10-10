// Spend real PA/PM, end the turn, then apply enemy removals through a custom bot.
const puppeteer = require('puppeteer-core');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const out = process.env.PROOF_DIR || '/tmp/dofus-combat-resources';
const url = process.env.PROOF_URL || 'http://127.0.0.1:3013';

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, pipe: true });
  const report = { errors: [], stages: [] };
  let page;
  try {
    page = await browser.newPage();
    page.setDefaultTimeout(10000);
    await page.setViewport({ width: 1600, height: 1000 });
    page.on('pageerror', error => report.errors.push(error.message));
    const cdp = await page.createCDPSession();
    await cdp.send('Page.setDownloadBehavior', { behavior: 'deny' });
    await page.evaluateOnNewDocument(() => {
      const base = { version: 1, level: 200, rollMode: 'max', rollSeed: 1, base: {} };
      localStorage.setItem('dofus-lite-player-setup-v1', JSON.stringify({ playerClass: 'IOP', botClass: 'ENUTROF', mode: 'duel', mapId: 'arene', botId: 'resource-proof' }));
      localStorage.setItem('dofus-lite-tactical-mode-v1', 'true');
      localStorage.setItem('dofus-lite-loadouts-v1', JSON.stringify({
        'A:IOP': { ...base, base: { force: 100 }, slots: { ring1: 2469 } },
        'B:ENUTROF': { ...base, base: { sagesse: 200 }, slots: { ring1: 2469, amulet: 323, dofus1: 7754 } },
      }));
      // Waiting gives the browser time to inspect each actual engine result.
      localStorage.setItem('koliseum.bots.v1', JSON.stringify([{ id: 'resource-proof', name: 'Enutrof · retraits', custom: true,
        code: `function decide(v,a) {
          const stage = window.resourceProofStage || 0;
          if (stage === 1) { window.resourceProofStage = 0; return a.cast('maladresse', v.enemy.pos); }
          if (stage === 2) { window.resourceProofStage = 0; return a.cast('maladresse_de_masse', v.you.pos); }
          if (stage === 3) return a.endTurn();
          return a.say('');
        }` }]));
      Math.random = () => .000007;
      const original = URL.createObjectURL;
      URL.createObjectURL = function(blob) { window.resourceProofExport = blob; return original.call(this, blob); };
    });
    const handle = async (selector, text = '') => {
      const e = await page.evaluateHandle(({ selector, text }) => [...document.querySelectorAll(selector)].find(e => e.checkVisibility() && e.textContent.includes(text)), { selector, text });
      assert(e.asElement(), `Missing ${selector}: ${text}`); return e.asElement();
    };
    const click = async (selector, text = '') => { const e = await handle(selector, text); assert(!await e.evaluate(e => e.disabled), `Disabled ${selector}`); await e.click(); await e.dispose(); };
    const record = async () => {
      await click('.fight-log .combat-log-heading button', 'Exporter');
      return page.evaluate(async () => JSON.parse(await window.resourceProofExport.text()));
    };
    const numbers = () => page.evaluate(() => ({
      pa: Number(document.querySelector('.player-resources .pa strong').textContent),
      pm: Number(document.querySelector('.player-resources .pm strong').textContent),
      mode: document.querySelector('.player-resources').dataset.pointsMode,
      sheetPa: parseInt(document.querySelector('.dock-points .pa').textContent, 10),
      sheetPm: parseInt(document.querySelector('.dock-points .pm').textContent, 10),
      sheetMode: document.querySelector('.dock-points').dataset.pointsMode,
      inspected: document.querySelector('.combat-stats').dataset.inspectedFighter,
    }));
    const check = async (name, preview) => {
      await page.keyboard.press('Escape'); await page.mouse.move(20, 20);
      await page.waitForFunction(() => document.querySelector('.combat-stats').dataset.inspectedFighter === 'A');
      const fight = await record(), player = fight.state.fighters.A;
      const amount = stat => Math.max(0, (stat === 'pa' ? player.basePa : player.basePm) + (player.permanent[stat] || 0)
        + player.effects.filter(e => e.kind === 'buff' && e.stat === stat).reduce((n, e) => n + e.value, 0));
      const expected = preview ? { pa: amount('pa'), pm: amount('pm') } : { pa: player.pa, pm: player.pm };
      const shown = await numbers();
      assert.equal(shown.pa, expected.pa); assert.equal(shown.pm, expected.pm);
      assert.equal(shown.sheetPa, expected.pa); assert.equal(shown.sheetPm, expected.pm);
      assert.equal(shown.mode, preview ? 'next-turn' : 'current'); assert.equal(shown.sheetMode, shown.mode);
      assert.equal(await page.$eval('.end-turn', e => e.disabled), preview);
      if (preview) assert.equal(await page.$$eval('.spell-btn:not(:disabled)', es => es.length), 0);
      report.stages.push({ name, shown, engine: { pa: player.pa, pm: player.pm }, effects: player.effects.filter(e => e.kind === 'buff' && ['pa', 'pm'].includes(e.stat)) });
      return fight;
    };
    const opponentAction = async stage => {
      const before = (await record()).events.filter(e => e.t === 'point_removal').length;
      await page.evaluate(stage => { window.resourceProofStage = stage; }, stage);
      await page.waitForFunction(() => window.resourceProofStage === 0);
      const after = await record();
      assert(after.events.filter(e => e.t === 'point_removal').length > before, 'Opponent cast must execute');
    };
    await page.goto(url, { waitUntil: 'networkidle0' });
    await click('.setup-play'); await click('.placement-ready');
    await page.waitForSelector('.turn-status.yours');
    const start = await check('start', false);
    assert.equal(start.state.fighters.A.pa, 8); assert.equal(start.state.fighters.A.pm, 3);
    for (const id of [153, 144, 149]) {
      const spell = await handle(`.spell-slot[data-spell-id="${id}"] .spell-btn`);
      await spell.click({ button: 'right' }); await spell.dispose();
    }
    await click('.cell.hl-move[data-cell="4,6"]');
    const spent = await check('spent', false);
    assert.equal(spent.state.fighters.A.pa, 0); assert.equal(spent.state.fighters.A.pm, 0);
    await click('.end-turn');
    await check('passed', true);
    await opponentAction(1);
    const afterPm = await check('after-pm-removal', true);
    assert(afterPm.events.some(e => e.t === 'point_removal' && e.target === 'A' && e.stat === 'PM' && e.removed > 0));
    await opponentAction(2);
    const afterPa = await check('after-pa-removal', true);
    assert(afterPa.events.some(e => e.t === 'point_removal' && e.target === 'A' && e.stat === 'PA' && e.removed > 0));
    await page.screenshot({ path: path.join(out, 'next-turn-resources.png') });
    const dock = await page.$('.combat-stats'); await dock.screenshot({ path: path.join(out, 'counters-with-removals.png') }); await dock.dispose();
    // Hovering the active enemy changes the sheet but keeps the player's preview.
    await page.$eval('.token[data-fighter-id="B"] .figure', e => e.focus());
    const inspected = await numbers();
    assert.equal(inspected.inspected, 'B'); assert.equal(inspected.sheetMode, 'current');
    assert.equal(inspected.pa, report.stages.at(-1).shown.pa); assert.equal(inspected.pm, report.stages.at(-1).shown.pm);
    await page.keyboard.press('Escape');
    await page.evaluate(() => { window.resourceProofStage = 3; });
    await page.waitForSelector('.turn-status.yours');
    const resumed = await check('resumed', false);
    assert.equal(resumed.state.fighters.A.pa, report.stages.at(-2).shown.pa);
    assert.equal(resumed.state.fighters.A.pm, report.stages.at(-2).shown.pm);
    assert.deepEqual(report.errors, []);
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    report.failure = error.message;
    if (page) await page.screenshot({ path: path.join(out, 'failure.png'), fullPage: true }).catch(() => {});
    throw error;
  } finally {
    fs.writeFileSync(path.join(out, 'proof.json'), JSON.stringify(report, null, 2));
    const child = browser.process(); await browser.disconnect(); child?.kill('SIGTERM');
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
