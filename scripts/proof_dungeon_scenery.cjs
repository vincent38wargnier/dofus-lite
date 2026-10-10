// Verify native dungeon scenery, alignment, unchanged combat and viewport fit.
const puppeteer = require('puppeteer-core');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const out = process.env.PROOF_DIR || '/tmp/dofus-dungeon-scenery';

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, pipe: true });
  const report = { errors: [], rooms: [], viewports: [] };
  let page;
  try {
    page = await browser.newPage(); page.setDefaultTimeout(25000);
    page.on('pageerror', error => report.errors.push(error.message));
    page.on('response', response => {
      if (response.url().includes('/dofus-local/maps/') && !response.ok()) report.errors.push(`${response.status()} ${response.url()}`);
    });
    await page.setViewport({ width: 1440, height: 900 });
    const cdp = await page.createCDPSession();
    await cdp.send('Page.setDownloadBehavior', { behavior: 'deny' });
    await page.evaluateOnNewDocument(() => {
      if (!localStorage.getItem('dungeon-scenery-proof')) {
        localStorage.setItem('dofus-lite-player-setup-v1', JSON.stringify({ playerClass: 'IOP', mode: 'boss', bossId: 147, bossGrade: 5, mapId: 'canyon' }));
        localStorage.setItem('dofus-lite-loadouts-v1', JSON.stringify({ 'A:IOP': { version: 1, level: 200, base: { force: 100 }, slots: {}, rollMode: 'max', rollSeed: 1 } }));
        localStorage.setItem('dofus-lite-tactical-mode-v1', 'true');
        localStorage.setItem('dungeon-scenery-proof', '1');
      }
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
    const mode = async tactical => {
      if (await page.$eval('.board-mode-toggle', e => e.getAttribute('aria-pressed')) !== String(tactical)) await click('.board-mode-toggle');
      await page.waitForFunction(tactical => document.querySelector('.board-mode-toggle')?.getAttribute('aria-pressed') === String(tactical), {}, tactical);
      assert.equal(await page.$eval('.board-wrap', e => e.classList.contains('tactical-mode')), tactical);
    };
    const artwork = async id => {
      await page.waitForFunction(id => {
        const layers = [...document.querySelectorAll('.board .retro-map-layer')];
        return layers.length > 0 && layers.every(img => img.src.includes(`/maps/${id}-`) && img.complete && img.naturalWidth > 0);
      }, {}, id);
    };
    const viewport = async () => {
      const geometry = await page.evaluate(() => ({ width: innerWidth, height: innerHeight,
        scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight,
        controls: [...document.querySelectorAll('.board-mode-toggle')].map(e => {
          const r = e.getBoundingClientRect(); return { text: e.textContent, left: r.left, right: r.right, top: r.top, bottom: r.bottom };
        }) }));
      assert(geometry.scrollWidth <= geometry.width && geometry.scrollHeight <= geometry.height);
      assert(geometry.controls.every(r => r.left >= 0 && r.right <= geometry.width && r.top >= 0 && r.bottom <= geometry.height));
      report.viewports.push(geometry);
    };
    await page.goto(process.env.PROOF_URL || 'http://127.0.0.1:3013', { waitUntil: 'networkidle0' });
    const nativeMaps = await page.evaluate(async () => (await (await fetch('/dofus-local/manifest.json')).json()).maps);
    const dungeonMaps = Object.entries(nativeMaps).filter(([id]) => id.startsWith('dungeon_'));
    assert.equal(dungeonMaps.length, JSON.parse(fs.readFileSync(path.join(__dirname, 'dungeon_encounters.json'))).encounters.length);
    assert(dungeonMaps.every(([, map]) => map.renderingVersion === 2));
    report.rebuiltRooms = dungeonMaps.length;
    await click('.setup-play');
    await page.waitForFunction(() => document.querySelectorAll('.token ruffle-player').length === 9
      && [...document.querySelectorAll('.token ruffle-player')].every(p => p.ruffle().readyState === 2));
    assert.equal(await page.$('.board .retro-map-layer'), null);
    assert(await page.$('.tactical-terrain'));
    const before = await record();
    assert.equal(before.state.mapId, 'dungeon_2083');
    assert.deepEqual(Object.values(before.state.placement.cells).slice(0, 2).map(c => c.length), [8, 8]);
    await page.screenshot({ path: path.join(out, 'bouftou-tactical.png') });
    await mode(false); await artwork(2083);
    assert.equal(await page.$('.tactical-terrain'), null);
    const restored = await record();
    assert.deepEqual(restored.state, before.state);
    assert.deepEqual(restored.events, before.events);
    await page.mouse.move(5, 5);
    await viewport();
    await page.screenshot({ path: path.join(out, 'bouftou-original.png') });
    report.rooms.push({ mapId: restored.state.mapId, sceneryLayers: await page.$$eval('.retro-map-layer', els => els.length), fighters: Object.keys(restored.state.fighters).length, unchangedPlacement: true });
    await mode(true); assert.equal(await page.$('.retro-map-layer'), null);
    await mode(false); await artwork(2083);
    await page.reload({ waitUntil: 'networkidle0' });
    await click('.setup-play'); await artwork(2083);
    assert.equal(await page.$eval('.board-mode-toggle', e => e.getAttribute('aria-pressed')), 'false');
    report.preferencePreserved = true;
    for (const [width, height] of [[1366, 768], [390, 844]]) {
      await page.setViewport({ width, height });
      await viewport();
      if (width === 390) await page.screenshot({ path: path.join(out, 'bouftou-mobile.png') });
    }
    await page.setViewport({ width: 1440, height: 900 });
    await click('.fight-heading-actions button', 'Préparation');
    await click('.setup-navigation button', 'Combat');
    await page.type('[aria-label="Rechercher un boss"]', 'Blop Multicolore');
    await click('.boss-card', 'Blop Multicolore');
    await click('.setup-play'); await artwork(11892);
    const blops = await record();
    assert.equal(blops.state.mapId, 'dungeon_11892');
    assert.equal(blops.state.placement.source.status, 'client');
    report.rooms.push({ mapId: blops.state.mapId, sceneryLayers: await page.$$eval('.retro-map-layer', els => els.length), fighters: Object.keys(blops.state.fighters).length });
    await page.mouse.move(5, 5);
    await page.screenshot({ path: path.join(out, 'blop-multicolore-original.png') });
    assert.deepEqual(report.errors, []); report.passed = true;
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
