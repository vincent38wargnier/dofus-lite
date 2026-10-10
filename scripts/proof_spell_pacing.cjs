// An isolated browser profile keeps the player's match and saved builds intact.
const puppeteer = require('puppeteer-core');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const url = process.env.PROOF_URL || 'http://127.0.0.1:3013';
const out = process.env.PROOF_DIR || '/tmp/dofus-spell-pacing';

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true, pipe: true, protocolTimeout: 30000,
  });
  let page;
  try {
    page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 1150 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
    const cdp = await page.createCDPSession();
    await cdp.send('Page.setDownloadBehavior', { behavior: 'deny' });
    await page.evaluateOnNewDocument(() => {
      localStorage.setItem('dofus-lite-player-setup-v1', JSON.stringify({ playerClass: 'IOP', botClass: 'CRA', botId: 'pacing-proof', mapId: 'astrub_7423' }));
      localStorage.setItem('koliseum.bots.v1', JSON.stringify([{ id: 'pacing-proof', name: 'Sparring', custom: true, code: 'function decide(v,a){return a.endTurn();}' }]));
      const base = { version: 1, level: 200, slots: {}, rollMode: 'max', rollSeed: 1 };
      localStorage.setItem('dofus-lite-loadouts-v1', JSON.stringify({
        'A:IOP': { ...base, base: { force: 100 } }, 'B:CRA': { ...base, base: {} },
      }));
      Math.random = () => 0.000007;
      const original = URL.createObjectURL;
      URL.createObjectURL = function (blob) { window.combatExport = blob; return original.call(this, blob); };
    });
    const click = async (selector, text = '') => {
      const handle = await page.evaluateHandle(({ selector, text }) => [...document.querySelectorAll(selector)]
        .find(element => element.checkVisibility() && element.textContent.includes(text)), { selector, text });
      assert(handle.asElement(), `Missing ${selector}: ${text}`);
      assert(!await handle.asElement().evaluate(element => element.disabled), `Disabled ${selector}: ${text}`);
      await handle.asElement().click();
      await handle.dispose();
    };
    const exportState = async () => {
      await click('.combat-log-heading button', 'Exporter');
      return page.evaluate(async () => JSON.parse(await window.combatExport.text()));
    };
    await page.goto(url, { waitUntil: 'networkidle0' });
    await click('.setup-play');
    await page.waitForFunction(() => [...document.querySelectorAll('.retro-actor ruffle-player')]
      .filter(player => typeof player.animate === 'function').length === 2);
    await page.evaluate(() => {
      window.effectLoads = [];
      const prototype = Object.getPrototypeOf(document.querySelector('.retro-actor ruffle-player').ruffle());
      const original = prototype.load;
      prototype.load = async function (config) {
        const record = { url: config.swfFileName, frameRate: config.frameRate, started: performance.now() };
        window.effectLoads.push(record);
        try { const result = await original.call(this, config); record.loaded = performance.now(); return result; }
        catch (error) { record.error = String(error); throw error; }
      };
    });
    await click('.placement-ready');
    await page.waitForFunction(() => [...document.querySelectorAll('.spell-btn')].some(e => e.textContent.includes('Puissance') && !e.disabled));
    const initial = await exportState();

    await click('.spell-btn', 'Puissance');
    await click('.token.side-A.targetable .figure');
    const firstCastAt = Date.now();
    await page.waitForSelector('.retro-spell-effect');
    const controls = await page.evaluate(() => ({
      vitalityEnabled: ![...document.querySelectorAll('.spell-btn')].find(e => e.textContent.includes('Vitalité')).disabled,
      endTurnEnabled: !document.querySelector('.play-controls .btn').disabled,
      effects: document.querySelectorAll('.retro-spell-effect').length,
    }));
    if (process.env.EXPECT_LOCKED === '1') {
      assert.equal(controls.vitalityEnabled, false);
      assert.equal(controls.endTurnEnabled, false);
      console.log('Reproduced the animation lock:', controls);
      return;
    }
    assert.equal(controls.vitalityEnabled, true);
    assert.equal(controls.endTurnEnabled, true);
    assert.equal(controls.effects, 1, JSON.stringify(controls));
    await click('.spell-btn', 'Vitalité');
    await click('.token.side-A.targetable .figure');
    const betweenCastsMs = Date.now() - firstCastAt;
    assert(betweenCastsMs < 1000, `Consecutive casts took ${betweenCastsMs} ms`);
    await page.waitForFunction(() => document.querySelectorAll('.retro-spell-effect').length === 2);
    await page.waitForFunction(() => [...document.querySelectorAll('.retro-spell-effect ruffle-player')]
      .filter(player => player.ruffle().readyState === 2).length === 2);
    const frameRates = await page.evaluate(() => window.effectLoads.filter(load => load.url.startsWith('effects/')).map(load => load.frameRate));
    assert(frameRates.every(rate => rate > 60), `Effects were not accelerated: ${frameRates}`);
    await page.keyboard.press('Escape');
    await page.mouse.move(30, 30);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(out, 'consecutive-spells.png') });
    const afterCasts = await exportState();
    const casts = afterCasts.events.filter(event => event.t === 'cast' && event.fighter === 'A');
    assert.deepEqual(casts.map(event => event.spellId), [153, 155]);
    assert.equal(afterCasts.state.fighters.A.pa, initial.state.fighters.A.pa - casts.reduce((total, event) => total + event.paCost, 0));
    assert.equal(afterCasts.state.fighters.A.pa, 0);
    const destination = await page.$$eval('.cell.hl-move', (elements, position) => elements.map(element => element.dataset.cell)
      .find(cell => { const [x, y] = cell.split(',').map(Number); return Math.abs(x - position.x) + Math.abs(y - position.y) === 1; }), afterCasts.state.fighters.A.pos);
    assert(destination, 'An adjacent cell is reachable');
    await click(`.cell[data-cell="${destination}"]`);
    await page.keyboard.press('Escape');
    await click('.play-controls .btn', 'Fin de tour');
    const afterMove = await exportState();
    assert(afterMove.events.some(event => event.t === 'move' && event.fighter === 'A'));
    assert(afterMove.events.some(event => event.t === 'turn_end' && event.fighter === 'A'));
    await page.waitForFunction(() => !document.querySelector('.retro-spell-effect'), { timeout: 4000 });
    assert.deepEqual(errors, []);
    const result = { betweenCastsMs, frameRates, controls, castIds: casts.map(event => event.spellId), movement: true, endTurn: true, effectsCleanedUp: true, errors };
    fs.writeFileSync(path.join(out, 'proof.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    if (page) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
    throw error;
  } finally {
    await browser.disconnect();
    browser.process()?.kill('SIGKILL');
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
