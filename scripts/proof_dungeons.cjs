// Verify complete dungeon groups through the visible setup and combat UI.
const puppeteer = require('puppeteer-core');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const out = process.env.PROOF_DIR || '/tmp/dofus-dungeons';
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, pipe: true });
  const report = { errors: [], groups: [], viewports: [] };
  let page;
  try {
    page = await browser.newPage(); page.setDefaultTimeout(25000);
    page.on('pageerror', e => report.errors.push(e.message));
    await page.setViewport({ width: 1440, height: 900 });
    const cdp = await page.createCDPSession();
    await cdp.send('Page.setDownloadBehavior', { behavior: 'deny' });
    await page.evaluateOnNewDocument(() => {
      if (!localStorage.getItem('dungeon-proof')) {
        localStorage.setItem('dofus-lite-player-setup-v1', JSON.stringify({ playerClass: 'IOP', mode: 'boss', bossId: 147, bossGrade: 5, mapId: 'astrub_7423' }));
        localStorage.setItem('dofus-lite-loadouts-v1', JSON.stringify({ 'A:IOP': { version: 1, level: 200, base: { force: 100 }, slots: {}, rollMode: 'max', rollSeed: 1 } }));
        localStorage.setItem('dungeon-proof', '1');
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
    const search = async name => {
      await page.$eval('[aria-label="Rechercher un boss"]', e => { e.focus(); e.select(); });
      await page.keyboard.press('Backspace'); await page.type('[aria-label="Rechercher un boss"]', name);
      await click('.boss-card', name);
    };
    const record = async () => {
      if (!await page.$('.fight-log')) await click('.fight-heading-actions button', 'Journal');
      await click('.combat-log-heading button', 'Exporter');
      const result = await page.evaluate(async () => JSON.parse(await window.combatExport.text()));
      await click('.fight-log-close'); return result;
    };
    const checkViewport = async () => {
      await page.waitForSelector('.app.in-combat');
      await page.waitForFunction(() => {
        const b = document.querySelector('.board')?.getBoundingClientRect(), m = document.querySelector('.fight-map')?.getBoundingClientRect();
        return b && m && b.width <= m.width + 1 && b.height <= m.height + 1 && Math.min(m.width - b.width, m.height - b.height) < 4;
      });
      const geometry = await page.evaluate(() => ({ width: innerWidth, height: innerHeight,
        scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight,
        dockBottom: document.querySelector('.combat-dock').getBoundingClientRect().bottom }));
      assert(geometry.scrollWidth <= geometry.width && geometry.scrollHeight <= geometry.height && geometry.dockBottom <= geometry.height);
      report.viewports.push(geometry);
    };
    await page.goto(process.env.PROOF_URL || 'http://127.0.0.1:3013', { waitUntil: 'networkidle0' });
    await click('.setup-navigation button', 'Combat');
    assert.equal(await page.$('.boss-setup [aria-label="Carte de combat"]'), null);
    assert.equal(await page.$eval('[data-dungeon-map]', e => e.dataset.dungeonMap), '2083');
    assert((await page.$eval('.dungeon-roster', e => e.innerText)).includes('8 monstres'));
    assert((await page.$eval('.dungeon-roster', e => e.innerText)).includes('Chef de Guerre Bouftou'));
    await page.waitForFunction(() => [...document.querySelectorAll('.dungeon-roster img')].every(img => img.complete && img.naturalWidth));
    await page.screenshot({ path: path.join(out, 'group-selection.png'), fullPage: true });
    await page.setViewport({ width: 390, height: 844 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: path.join(out, 'group-selection-mobile.png'), fullPage: true });
    await page.setViewport({ width: 1440, height: 900 });
    for (const [name, bossId, count, mapId] of [['Bouftou Royal', 147, 8, 2083], ['Tynril Consterné', 1072, 4, 10812],
      ['Minotot', 827, 8, 9879], ['Chêne Mou', 257, 3, 9126], ['Ougah', 1159, 8, 11941],
      ['Ilyzaelle', 1170, 5, 11976], ["Qu'Tan", 1195, 5, 11975], ['Kralamoure Géant', 423, 1, 11095]]) {
      const art = JSON.parse(fs.readFileSync(path.join(__dirname, '../public/dofus-local/manifest.json'))).maps[`dungeon_${mapId}`];
      assert(art.layers.every(l => fs.existsSync(path.join(__dirname, '../public/dofus-local', l.image))), `Unrendered map ${mapId}`);
      if (await page.$('.fight-screen')) {
        await click('.fight-heading-actions button', 'Préparation');
        await click('.setup-navigation button', 'Combat');
      }
      await search(name);
      assert((await page.$eval('.dungeon-roster', e => e.innerText)).includes(`${count} monstre`));
      assert.equal(await page.$eval('[data-dungeon-map]', e => e.dataset.dungeonMap), String(mapId));
      await click('.setup-play');
      await page.waitForFunction(expected => document.querySelectorAll('.token ruffle-player').length === expected
        && [...document.querySelectorAll('.token ruffle-player')].every(p => p.ruffle().readyState === 2), {}, count + 1);
      await page.waitForFunction(() => [...document.querySelectorAll('.board img')].every(img => img.complete && img.naturalWidth));
      await checkViewport();
      const snapshot = await record();
      const foes = Object.values(snapshot.state.fighters).filter(f => f.team === 'B');
      assert.equal(foes.length, count); assert.equal(snapshot.state.fighters.B.monsterId, bossId);
      assert.equal(snapshot.state.mapId, `dungeon_${mapId}`);
      assert.equal(snapshot.state.placement.source.status, 'client');
      assert(!snapshot.state.placement.source.expanded);
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('dofus-lite-player-setup-v1')).mapId), 'astrub_7423');
      assert.equal(new Set(Object.values(snapshot.state.fighters).map(f => `${f.pos.x},${f.pos.y}`)).size, count + 1);
      assert.equal(new Set(snapshot.state.order).size, count + 1);
      assert(foes.every(f => snapshot.state.placement.ready[f.id] && !f.isSummon));
      report.groups.push({ name, mapId: snapshot.state.mapId, playerCells: snapshot.state.placement.cells.A.map(c => c.cellId),
        enemyCells: snapshot.state.placement.cells.B.map(c => c.cellId), members: foes.map(f => ({ id: f.id, name: f.name, monsterId: f.monsterId, level: f.level })) });
      const inspected = count > 1 ? 'B2' : 'B';
      await page.hover(`.token[data-fighter-id="${inspected}"] .figure`);
      await page.waitForSelector(`.combat-stats[data-inspected-fighter="${inspected}"]`);
      await page.screenshot({ path: path.join(out, `group-${bossId}.png`) });
      await page.mouse.move(2, 2);
      if (bossId === 147) {
        // Full viewport fit with nine animated fighters, including small screens.
        for (const [width, height] of [[1366, 768], [390, 844]]) {
          await page.setViewport({ width, height }); await checkViewport();
        }
        await page.setViewport({ width: 1440, height: 900 });
        await click('.placement-ready');
        let data, steps = 0;
        while (steps++ < 3) {
          await page.waitForSelector('.turn-status.yours', { timeout: 60000 });
          data = await record();
          if (Object.keys(data.state.fighters).filter(id => id !== 'A').every(id => data.events.some(e => e.t === 'turn_end' && e.fighter === id))) break;
          await click('.play-controls .btn', 'Fin de tour');
          await page.waitForFunction(() => !document.querySelector('.turn-status.yours'), { timeout: 10000 });
        }
        assert(data.events.filter(e => e.t === 'turn_end' && e.fighter !== 'A').length >= 8);
        assert(!data.events.some(e => ['invalid', 'bot_error'].includes(e.t)));
        report.round = data.events.filter(e => e.t === 'turn_end').map(e => e.fighter);
        await page.screenshot({ path: path.join(out, 'group-fight.png') });
        await click('.fight-heading-actions button', 'Abandonner');
        await click('.setup-navigation button', 'Combat');
      }
    }
    await click('.fight-heading-actions button', 'Préparation');
    await click('.setup-navigation button', 'Combat');
    await search('Bouftou Royal');
    await page.reload({ waitUntil: 'networkidle0' });
    await click('.setup-navigation button', 'Combat');
    assert((await page.$eval('.dungeon-roster', e => e.innerText)).includes('8 monstres'));
    // Change the saved PvP choice through its own UI, then return to a dungeon.
    await click('.match-modes button', 'Duel');
    await page.select('[aria-label="Carte de combat"]', 'canyon');
    await click('.match-modes button', 'Boss');
    await click('.setup-play');
    await page.waitForSelector('.token[data-fighter-id="B8"]'); await checkViewport();
    const restored = await record();
    assert.equal(restored.state.mapId, 'dungeon_2083');
    assert(!restored.state.placement.source.expanded);
    assert.equal(new Set(Object.values(restored.state.fighters).map(f => `${f.pos.x},${f.pos.y}`)).size, 9);
    await click('.fight-heading-actions button', 'Préparation');
    await click('.setup-navigation button', 'Combat');
    await click('.match-modes button', 'Duel');
    assert.equal(await page.$eval('[aria-label="Carte de combat"]', e => e.value), 'canyon');
    report.pvpChoicePreserved = true;
    assert.deepEqual(report.errors, []); report.passed = true;
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
