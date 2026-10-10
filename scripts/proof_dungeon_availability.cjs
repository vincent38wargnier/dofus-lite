// Reproduce the saved Gladiatrool selection and verify the actual dungeon UI.
const puppeteer = require('puppeteer-core');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const out = process.env.PROOF_DIR || '/tmp/dofus-dungeon-availability';
const encounters = JSON.parse(fs.readFileSync(path.join(__dirname, 'dungeon_encounters.json')));

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, pipe: true });
  const report = { errors: [], rooms: [], viewports: [] };
  let page;
  try {
    page = await browser.newPage(); page.setDefaultTimeout(30000);
    page.on('pageerror', error => report.errors.push(error.message));
    page.on('response', response => {
      if (response.url().includes('/dofus-local/') && response.status() >= 400) report.errors.push(`${response.status()} ${response.url()}`);
    });
    await page.setViewport({ width: 1440, height: 900 });
    const cdp = await page.createCDPSession();
    await cdp.send('Page.setDownloadBehavior', { behavior: 'deny' });
    await page.evaluateOnNewDocument(() => {
      if (!localStorage.getItem('dungeon-availability-proof')) {
        localStorage.setItem('dofus-lite-player-setup-v1', JSON.stringify({ playerClass: 'IOP', mode: 'boss', bossId: 2891, bossGrade: 6, mapId: 'canyon' }));
        localStorage.setItem('dofus-lite-loadouts-v1', JSON.stringify({ 'A:IOP': { version: 1, level: 200, base: { force: 100 }, slots: {}, rollMode: 'max', rollSeed: 1 } }));
        localStorage.setItem('dofus-lite-tactical-mode-v1', 'false');
        localStorage.setItem('dungeon-availability-proof', '1');
      }
      Math.random = () => .000031;
      const create = URL.createObjectURL;
      URL.createObjectURL = function(blob) { window.combatExport = blob; return create.call(this, blob); };
    });
    const click = async (selector, text = '') => {
      const handle = await page.evaluateHandle(({ selector, text }) => [...document.querySelectorAll(selector)]
        .find(e => e.checkVisibility() && e.textContent.includes(text)), { selector, text });
      assert(handle.asElement(), `Missing ${selector}: ${text}`);
      await handle.asElement().click(); await handle.dispose();
    };
    const search = async value => {
      await page.$eval('[aria-label="Rechercher un boss"]', e => { e.focus(); e.select(); });
      await page.keyboard.press('Backspace');
      if (value) await page.type('[aria-label="Rechercher un boss"]', value);
    };
    const record = async () => {
      if (!await page.$('.fight-log')) await click('.fight-heading-actions button', 'Journal');
      await click('.combat-log-heading button', 'Exporter');
      return page.evaluate(async () => JSON.parse(await window.combatExport.text()));
    };
    const viewport = async () => {
      await page.waitForFunction(() => {
        const dock = document.querySelector('.combat-dock')?.getBoundingClientRect();
        return dock && dock.bottom <= innerHeight + 1 && document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight;
      });
      report.viewports.push(await page.evaluate(() => ({ width: innerWidth, height: innerHeight, scrollHeight: document.documentElement.scrollHeight })));
    };
    await page.goto(process.env.PROOF_URL || 'http://127.0.0.1:3013', { waitUntil: 'networkidle0' });
    await click('.setup-navigation button', 'Combat');
    assert((await page.$eval('.boss-selection-notice', e => e.innerText)).includes('Gladiatrool'));
    assert(await page.$eval('.setup-play', e => e.disabled));
    await page.screenshot({ path: path.join(out, 'saved-selection.png'), fullPage: true });
    await click('.boss-selection-notice button', 'Fantôme de Péki Garou');
    assert.equal(await page.$eval('[data-dungeon-map]', e => e.dataset.dungeonMap), '12307');
    assert.equal(await page.$eval('[aria-label="Niveau du boss"]', e => e.value), '5');
    assert(!await page.$eval('.setup-play', e => e.disabled));
    // The entire catalogue is scrollable; excluded entries remain explanations.
    const seen = await page.$$eval('.boss-card', cards => cards.map(e => Number(e.dataset.bossId)));
    assert.equal(await page.$('[aria-label="Boss suivants"]'), null);
    assert.deepEqual(seen.sort((a, b) => a - b), encounters.encounters.flatMap(room => room.bossIds).sort((a, b) => a - b));
    report.playableChoices = seen.length;
    await search('peki');
    assert.deepEqual(await page.$$eval('.boss-card', cards => cards.map(e => Number(e.dataset.bossId))), [2997, 605]);
    await page.screenshot({ path: path.join(out, 'peki-selection.png'), fullPage: true });
    await page.reload({ waitUntil: 'networkidle0' });
    await click('.setup-navigation button', 'Combat');
    assert.equal(await page.$('.boss-selection-notice'), null);
    assert.equal(await page.$eval('[data-dungeon-map]', e => e.dataset.dungeonMap), '12307');
    for (const [bossId, name, mapId] of [[2997, 'Fantôme de Péki Garou', 12307], [182, 'Wabbit Gm', 1776], [605, 'Péki Péki', 8357]]) {
      await search(name);
      await click(`.boss-card[data-boss-id="${bossId}"]`);
      await click('.setup-play');
      await page.waitForFunction(mapId => {
        const layers = [...document.querySelectorAll('.retro-map-layer')];
        return layers.length && layers.every(img => img.src.includes(`/maps/${mapId}-`) && img.complete && img.naturalWidth)
          && document.querySelectorAll('.token ruffle-player').length === 2
          && [...document.querySelectorAll('.token ruffle-player')].every(p => p.ruffle().readyState === 2);
      }, {}, mapId);
      await viewport();
      const before = await record();
      assert.equal(before.state.mapId, `dungeon_${mapId}`);
      assert.equal(before.state.fighters.B.monsterId, bossId);
      assert.equal(before.state.placement.source.status, 'client');
      assert.deepEqual(Object.keys(before.state.fighters), ['A', 'B']);
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('dofus-lite-player-setup-v1')).mapId), 'canyon');
      await page.mouse.move(2, 2);
      await page.screenshot({ path: path.join(out, `room-${bossId}.png`) });
      await click('.board-mode-toggle');
      assert(await page.$('.tactical-terrain'));
      assert.deepEqual((await record()).state, before.state);
      await page.screenshot({ path: path.join(out, `room-${bossId}-tactical.png`) });
      await click('.board-mode-toggle');
      if (bossId === 2997) {
        for (const [width, height] of [[1366, 768], [390, 844]]) {
          await page.setViewport({ width, height }); await viewport();
        }
        await page.screenshot({ path: path.join(out, 'peki-mobile.png') });
        await page.setViewport({ width: 1440, height: 900 });
      }
      await click('.placement-ready');
      await page.waitForFunction(() => !!document.querySelector('.turn-status.yours') || !!document.querySelector('.combat-result'), { timeout: 60000 });
      const after = await record();
      assert.equal(after.state.phase, 'combat');
      assert(!after.events.some(e => ['invalid', 'bot_error'].includes(e.t)));
      report.rooms.push({ bossId, mapId: after.state.mapId, level: after.state.fighters.B.level,
        placement: before.state.placement.cells, initialFighters: Object.keys(before.state.fighters).length,
        events: after.events.length });
      await click('.fight-heading-actions button', 'Abandonner');
      await click('.setup-navigation button', 'Combat');
    }
    assert.deepEqual(report.errors, []);
    report.passed = true;
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    report.failure = error.message;
    if (page) await page.screenshot({ path: path.join(out, 'failure.png'), fullPage: true }).catch(() => {});
    throw error;
  } finally {
    fs.writeFileSync(path.join(out, 'proof.json'), JSON.stringify(report, null, 2));
    const child = browser.process(); await browser.disconnect(); if (child?.exitCode === null) child.kill('SIGTERM');
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
