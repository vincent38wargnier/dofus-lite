// Real drag, shortcuts, automatic sorting, client colors and persisted reload.
const puppeteer = require('puppeteer-core');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const library = require('../src/engine/spellLibrary.json');
const out = process.env.PROOF_DIR || '/tmp/dofus-spell-bar';

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, pipe: true });
  const report = { errors: [] };
  let page;
  try {
    page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 1000 });
    await page.setDragInterception(true);
    page.on('pageerror', error => report.errors.push(error.message));
    await page.evaluateOnNewDocument(() => {
      if (!localStorage.getItem('spell-bar-proof')) {
        localStorage.setItem('dofus-lite-player-setup-v1', JSON.stringify({ playerClass: 'IOP', mode: 'kanojedo', monsterGrade: 5 }));
        localStorage.setItem('dofus-lite-loadouts-v1', JSON.stringify({
          'A:IOP': { version: 1, level: 200, base: { force: 100 }, slots: { weapon: 2416 }, rollMode: 'max', rollSeed: 1,
            spells: { common: [350, 367, 370, 373], order: [153, 141, 0, 142] } },
        }));
        localStorage.setItem('spell-bar-proof', 'true');
      }
      Math.random = () => .000007;
    });
    const click = async (selector, text = '') => {
      const handle = await page.evaluateHandle(({ selector, text }) => [...document.querySelectorAll(selector)]
        .find(e => e.checkVisibility() && e.textContent.includes(text)), { selector, text });
      assert(handle.asElement(), `Missing ${selector}: ${text}`);
      await handle.asElement().click(); await handle.dispose();
    };
    const slots = () => page.$$eval('.spell-slot', nodes => nodes.map(e => ({
      id: Number(e.dataset.spellId), category: e.dataset.spellCategory,
      color: getComputedStyle(e.querySelector('.retro-spell-icon')).backgroundColor,
      shortcut: e.querySelector('kbd').textContent, name: e.querySelector('.nm').textContent,
    })));
    const slot = id => `.spell-slot[data-spell-id="${id}"]`;
    const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('dofus-lite-loadouts-v1'))['A:IOP']);
    const start = async () => {
      await click('.setup-play'); await click('.placement-ready');
      await page.waitForSelector('.turn-status.yours');
      if (await page.$('.fight-log-close')) await click('.fight-log-close');
      await page.waitForFunction(() => [...document.querySelectorAll('.spell-btn img')].every(img => img.complete && img.naturalWidth));
    };
    await page.goto(process.env.PROOF_URL || 'http://127.0.0.1:3013', { waitUntil: 'networkidle0' });
    await start();
    report.before = await slots();
    assert.equal(report.before.length, library.classes.IOP.length + 5);
    assert.equal(report.before[0].id, 0, 'An old saved order still pins the weapon');
    await click('.spellbar-sort');
    report.sorted = await slots();
    const ids = report.sorted.map(s => s.id);
    assert.equal(ids[0], 0);
    assert.deepEqual(new Set(ids), new Set(report.before.map(s => s.id)));
    const groups = ['weapon', 'neutre', 'terre', 'feu', 'eau', 'air', 'multi', 'boost', 'heal', 'summon', 'placement', 'debuff', 'utility'];
    const ranks = report.sorted.map(s => groups.indexOf(s.category));
    assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b));
    for (const spell of report.sorted) {
      const hex = library.iconPalette[spell.category];
      if (!hex) continue;
      const channels = hex.slice(1).match(/../g).map(n => parseInt(n, 16));
      assert.equal(spell.color, `rgb(${channels.join(', ')})`, `Client palette for ${spell.name}`);
    }
    await page.keyboard.press('2');
    assert(await page.$eval(`${slot(ids[1])} .spell-btn`, e => e.classList.contains('selected')), 'Shortcut follows the sorted slot');
    await page.keyboard.press('Escape');
    const source = await page.$(slot(142)), target = await page.$(slot(0));
    await source.dragAndDrop(target, { delay: 80 });
    assert.deepEqual((await slots()).slice(0, 2).map(s => s.id), [0, 142], 'Drop on weapon inserts after it');
    await click('.spellbar-sort');
    assert.deepEqual((await slots()).map(s => s.id), ids);
    report.saved = await stored();
    assert.deepEqual(report.saved.spells.order, ids);
    await page.screenshot({ path: path.join(out, 'combat-sorted.png') });
    await (await page.$('.combat-spellbar')).screenshot({ path: path.join(out, 'spell-bar.png') });
    await page.reload({ waitUntil: 'networkidle0' });
    await click('.setup-navigation button', 'Stuff');
    await click('.builder-navigation button', 'Sorts');
    const prepared = await page.$$eval('.spell-loadout-order li', nodes => nodes.filter(e => e.checkVisibility()).map(e => Number(e.dataset.spellId)));
    assert.deepEqual(prepared, ids);
    assert.deepEqual(await stored(), report.saved);
    await click('.spell-loadout .btn', 'Trier par type');
    assert.deepEqual((await stored()).spells.order, ids);
    await click('.setup-navigation button', 'Combat');
    await start();
    assert.deepEqual((await slots()).map(s => s.id), ids);
    report.persistedAfterReload = true;
    await page.setViewport({ width: 390, height: 844 });
    await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth
      && document.documentElement.scrollHeight <= innerHeight);
    assert.equal((await slots()).length, report.before.length);
    await page.screenshot({ path: path.join(out, 'mobile.png') });
    assert.deepEqual(report.errors, []);
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    if (page) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
    throw error;
  } finally {
    fs.writeFileSync(path.join(out, 'proof.json'), JSON.stringify(report, null, 2));
    const child = browser.process(); await browser.disconnect(); child?.kill('SIGTERM');
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
