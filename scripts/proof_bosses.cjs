// Exercise boss search, persistence, portraits, a real fight and viewport sizing.
const puppeteer = require('puppeteer-core');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const out = process.env.PROOF_DIR || '/tmp/dofus-bosses';
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, pipe: true });
  const report = { errors: [], viewports: [] };
  let page;
  try {
    page = await browser.newPage();
    page.setDefaultTimeout(15000);
    page.on('pageerror', e => report.errors.push(e.message));
    await page.setViewport({ width: 1600, height: 1150 });
    const cdp = await page.createCDPSession();
    await cdp.send('Page.setDownloadBehavior', { behavior: 'deny' });
    await page.evaluateOnNewDocument(() => {
      if (!localStorage.getItem('boss-proof')) {
        localStorage.setItem('dofus-lite-player-setup-v1', JSON.stringify({ playerClass: 'IOP', mode: 'duel', mapId: 'canyon' }));
        localStorage.setItem('dofus-lite-loadouts-v1', JSON.stringify({
          'A:IOP': { version: 1, level: 200, base: { force: 100 }, slots: {}, rollMode: 'max', rollSeed: 1 },
        }));
        localStorage.setItem('boss-proof', '1');
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
      await page.$eval('[aria-label="Rechercher un boss"]', input => { input.focus(); input.select(); });
      await page.keyboard.press('Backspace');
      await page.type('[aria-label="Rechercher un boss"]', value);
    };
    const record = async () => {
      if (!await page.$('.fight-log')) await click('.fight-heading-actions button', 'Journal');
      await click('.combat-log-heading button', 'Exporter');
      const result = await page.evaluate(async () => JSON.parse(await window.combatExport.text()));
      await click('.fight-log-close');
      return result;
    };
    const checkViewport = async () => {
      await page.waitForSelector('.app.in-combat');
      await page.waitForFunction(() => {
        const board = document.querySelector('.fight-map .board')?.getBoundingClientRect();
        const map = document.querySelector('.fight-map')?.getBoundingClientRect();
        return board && map && board.width <= map.width && board.height <= map.height
          && Math.min(map.width - board.width, map.height - board.height) < 4;
      });
      const d = await page.evaluate(() => {
        const rect = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
        return { width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth,
          scrollHeight: document.documentElement.scrollHeight, map: rect('.fight-map'), board: rect('.board'), dock: rect('.combat-dock') };
      });
      assert(d.scrollWidth <= d.width && d.scrollHeight <= d.height, 'Fight must fit without page scroll');
      assert(d.board.right <= d.width + 1 && d.board.bottom <= d.dock.y + 1);
      assert(Math.min(d.map.width - d.board.width, d.map.height - d.board.height) < 4, 'Map must fill available space');
      report.viewports.push(d);
    };
    await page.goto(process.env.PROOF_URL || 'http://127.0.0.1:3013', { waitUntil: 'networkidle0' });
    await click('.setup-navigation button', 'Combat');
    await click('.match-modes button', 'Boss de donjon');
    assert.equal(await page.$eval('.boss-catalogue-heading .count-badge', e => Number(e.innerText)), 69);
    await search('zzzzzz');
    assert(await page.$('.boss-empty'));
    assert(!await page.$eval('.setup-play', e => e.disabled));
    await search('qu’Tan');
    assert.equal(await page.$$eval('.boss-card', cards => cards.length), 1);
    await click('.boss-card', "Qu'Tan");
    assert((await page.$eval('[aria-label="Boss sélectionné"]', e => e.innerText)).includes('Qu’Tan')
      || (await page.$eval('[aria-label="Boss sélectionné"]', e => e.innerText)).includes("Qu'Tan"));
    await search('Bouftou Royal');
    await click('.boss-card', 'Bouftou Royal');
    await page.select('[aria-label="Niveau du boss"]', '2');
    await page.reload({ waitUntil: 'networkidle0' });
    await click('.setup-navigation button', 'Combat');
    assert.equal(await page.$eval('[aria-label="Niveau du boss"]', e => e.value), '2');
    assert((await page.$eval('[aria-label="Boss sélectionné"]', e => e.innerText)).includes('550 PV'));
    await click('.match-modes button', 'Monstres');
    await page.select('[aria-label="Niveau du Poutch"]', '3');
    await click('.match-modes button', 'Boss de donjon');
    assert.equal(await page.$eval('[aria-label="Niveau du boss"]', e => e.value), '2');
    await page.select('[aria-label="Niveau du boss"]', '5');
    await page.select('.boss-setup [aria-label="Carte de combat"]', 'amakna_534');
    await page.waitForFunction(() => [...document.querySelectorAll('.boss-card img, .boss-details .opponent-preview img')].every(img => img.complete && img.naturalWidth > 0));
    await page.screenshot({ path: path.join(out, 'boss-selection.png'), fullPage: true });
    report.saved = await page.evaluate(() => JSON.parse(localStorage.getItem('dofus-lite-player-setup-v1')));
    assert.equal(report.saved.mapId, 'amakna_534');
    await page.setViewport({ width: 390, height: 844 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: path.join(out, 'boss-selection-mobile.png'), fullPage: true });
    await page.setViewport({ width: 1440, height: 900 });
    await click('.setup-play');
    await page.waitForSelector('.token.side-B[data-actor="1574"]');
    await page.waitForFunction(() => [...document.querySelectorAll('.token ruffle-player')].length === 2
      && [...document.querySelectorAll('.token ruffle-player')].every(p => p.ruffle().readyState === 2));
    await checkViewport();
    await click('.placement-ready');
    await page.waitForSelector('.turn-status.yours');
    let snapshot = await record();
    assert.equal(snapshot.state.fighters.B.monsterId, 147);
    assert.equal(snapshot.state.fighters.B.maxHp, 700);
    let rounds = 0;
    while (!snapshot.events.some(e => e.t === 'damage' && e.source === 'B') && rounds++ < 6) {
      const previous = await page.$eval('.fight-heading', e => e.innerText);
      await click('.play-controls .btn', 'Fin de tour');
      await page.waitForFunction(previous => document.querySelector('.turn-status.yours')
        && document.querySelector('.fight-heading').innerText !== previous, { timeout: 30000 }, previous);
      snapshot = await record();
    }
    assert(snapshot.events.some(e => e.t === 'move' && e.fighter === 'B'), 'Boss should approach the player');
    assert(snapshot.events.some(e => e.t === 'damage' && e.source === 'B'), 'Boss should attack');
    assert(snapshot.events.some(e => e.t === 'cast' && e.fighter === 'B' && e.spellId === 202), 'Bouftou should use Morsure');
    assert(!snapshot.events.some(e => e.t === 'cast' && e.fighter === 'B' && e.spellId === 251), 'Abolissement is reserved for summons');
    assert(!snapshot.events.some(e => ['bot_error', 'invalid'].includes(e.t)));
    await page.hover('.token.side-B .figure');
    await page.waitForSelector('.combat-stats[data-inspected-fighter="B"]');
    await page.screenshot({ path: path.join(out, 'boss-fight.png') });
    assert((await page.$eval('.combat-stats', e => e.innerText)).includes('Bouftou Royal'));
    await page.mouse.move(2, 2);
    for (const [width, height] of [[1366, 768], [390, 844]]) {
      await page.setViewport({ width, height });
      await page.waitForFunction(() => {
        const b = document.querySelector('.board').getBoundingClientRect(), m = document.querySelector('.fight-map').getBoundingClientRect();
        return b.width <= m.width + 1 && b.height <= m.height + 1;
      });
      await checkViewport();
    }
    report.bossActions = snapshot.events.filter(e => (e.t === 'cast' && e.fighter === 'B') || (e.t === 'damage' && e.source === 'B'));
    report.rounds = rounds;
    await page.setViewport({ width: 1440, height: 900 });
    await click('.fight-heading-actions button', 'Abandonner');
    await click('.setup-navigation button', 'Combat');
    await page.select('.boss-setup [aria-label="Carte de combat"]', 'canyon');
    await click('.setup-play');
    await page.waitForSelector('.token.side-B[data-actor="1574"]');
    await page.waitForFunction(() => document.querySelectorAll('.token ruffle-player').length === 2
      && [...document.querySelectorAll('.token ruffle-player')].every(p => p.ruffle().readyState === 2));
    await checkViewport();
    report.customMap = true;
    report.appearances = [];
    for (const [name, gfx] of [['Ilyzaelle', '8036'], ['Kralamoure Géant', '1635']]) {
      await click('.fight-heading-actions button', 'Préparation');
      await click('.setup-navigation button', 'Combat');
      await search(name);
      await click('.boss-card', name);
      await page.select('.boss-setup [aria-label="Carte de combat"]', 'amakna_534');
      await click('.setup-play');
      await page.waitForSelector(`.token.side-B[data-actor="${gfx}"] ruffle-player`);
      await page.waitForFunction(() => document.querySelectorAll('.token ruffle-player').length === 2
        && [...document.querySelectorAll('.token ruffle-player')].every(p => p.ruffle().readyState === 2));
      await checkViewport();
      await page.screenshot({ path: path.join(out, `boss-${gfx}.png`) });
      report.appearances.push({ name, gfx });
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
