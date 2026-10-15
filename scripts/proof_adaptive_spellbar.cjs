// Responsive spell-bar proof, in isolated Chrome storage.
const puppeteer = require('puppeteer-core');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const common = require('../src/engine/spellLibrary.json').common;
require('./ai_runtime.cjs');
const { emptyLoadout } = require('../src/engine/equipment');
const { createGame, spellsOf } = require('../src/engine/engine');
const loadout = { ...emptyLoadout('IOP'), level: 200, slots: {}, spells: { common } };
const expectedCount = Object.keys(spellsOf(createGame({ fighters: [{ id: 'A', classId: 'IOP', loadout }, { id: 'B', classId: 'CRA' }] }).state.fighters.A)).length;
const out = '/tmp/dofus-adaptive-spellbar';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, pipe: true });
  const page = await browser.newPage(), report = { layouts: [], errors: [] };
  page.on('pageerror', e => report.errors.push(e.message));
  try {
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument(loadout => {
      localStorage.setItem('dofus-lite-player-setup-v1', JSON.stringify({ playerClass: 'IOP', mode: 'kanojedo', monsterGrade: 5 }));
      localStorage.setItem('dofus-lite-loadouts-v1', JSON.stringify({ 'A:IOP': loadout }));
    }, loadout);
    await page.goto('http://127.0.0.1:3013', { waitUntil: 'networkidle0' });
    await page.click('.setup-play');
    await page.waitForSelector('.combat-choice[open] .combat-choice-launch');
    await page.click('.combat-choice[open] .combat-choice-launch');
    await page.waitForSelector('.in-combat .spell-slot');
    for (const [width, height] of [[1920, 1080], [1440, 900], [1366, 768], [1024, 768], [844, 390], [390, 844], [375, 667]]) {
      await page.setViewport({ width, height }); await delay(450);
      const result = await page.evaluate(() => {
        const slots = [...document.querySelectorAll('.spell-slot')].map(e => e.getBoundingClientRect());
        const icons = [...document.querySelectorAll('.spell-btn .ic')].map(e => ({ r: e.getBoundingClientRect(), p: e.closest('.spell-btn').getBoundingClientRect() }));
        const bar = document.querySelector('.combat-spellbar');
        return { width: innerWidth, height: innerHeight, count: slots.length, rows: +bar.style.getPropertyValue('--spell-rows'),
          minWidth: Math.min(...slots.map(r => r.width)),
          scrolls: document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight,
          clipped: slots.some(r => r.x < 0 || r.y < 0 || r.right > innerWidth || r.bottom > innerHeight),
          clippedIcon: icons.some(({ r, p }) => r.x < p.x || r.y < p.y || r.right > p.right + .1 || r.bottom > p.bottom + .1),
          mapHeight: Math.round(document.querySelector('.fight-map').getBoundingClientRect().height) };
      });
      assert.equal(result.count, expectedCount); assert(result.count >= 39);
      assert(!result.scrolls && !result.clipped && !result.clippedIcon, JSON.stringify(result));
      assert(result.minWidth >= 43 && result.rows > 1 && result.mapHeight >= 80, JSON.stringify(result));
      report.layouts.push(result);
      if (width === 375 || width === 1440) await page.screenshot({ path: `${out}/${width}.png` });
    }
    assert.deepEqual(report.errors, []);
    fs.writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    await page.screenshot({ path: `${out}/failure.png` }); throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
