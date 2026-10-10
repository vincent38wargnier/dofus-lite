// Verify the level threshold through preparation and live combat, without equipment.
const puppeteer = require('puppeteer-core');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const out = process.env.PROOF_DIR || '/tmp/dofus-base-pa';
const url = process.env.PROOF_URL || 'http://127.0.0.1:3013';

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true, pipe: true,
  });
  const report = { errors: [], levels: [] };
  let page;
  try {
    page = await browser.newPage();
    await page.setViewport({ width: 1500, height: 1050 });
    page.on('pageerror', error => report.errors.push(error.message));
    await page.evaluateOnNewDocument(() => {
      localStorage.setItem('dofus-lite-player-setup-v1', JSON.stringify({ playerClass: 'IOP', botClass: 'CRA', botId: 'pa-proof', mapId: 'arene' }));
      localStorage.setItem('koliseum.bots.v1', JSON.stringify([{ id: 'pa-proof', name: 'Sparring', custom: true, code: 'function decide(v,a){return a.endTurn();}' }]));
      const base = { version: 1, level: 100, slots: {}, rollMode: 'max', rollSeed: 1 };
      localStorage.setItem('dofus-lite-loadouts-v1', JSON.stringify({
        'A:IOP': { ...base, level: 99, base: { force: 100 } }, 'B:CRA': { ...base, base: {} },
      }));
      Math.random = () => .000007;
    });
    const click = async (selector, text = '') => {
      const handle = await page.evaluateHandle(({ selector, text }) => [...document.querySelectorAll(selector)].find(e => e.checkVisibility() && e.textContent.includes(text)), { selector, text });
      assert(handle.asElement(), `Missing ${selector}: ${text}`);
      await handle.asElement().click(); await handle.dispose();
    };
    const setLevel = async level => {
      const handle = await page.evaluateHandle(() => [...document.querySelectorAll('select[aria-label="Niveau du personnage"]')].find(e => e.checkVisibility()));
      await handle.asElement().select(String(level)); await handle.dispose();
    };
    await page.goto(url, { waitUntil: 'networkidle0' });
    for (const [level, pa] of [[99, 6], [100, 7], [200, 7]]) {
      await setLevel(level);
      const prepared = await page.$eval('.summary-vitals', e => Number([...e.children].find(e => e.textContent.endsWith('PA')).querySelector('strong').textContent));
      assert.equal(prepared, pa);
      assert.equal(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('dofus-lite-loadouts-v1'))['A:IOP'].slots).length), 0);
      await click('.setup-play'); await click('.placement-ready');
      await page.waitForFunction(() => document.querySelector('.turn-status.yours'));
      const combat = await page.$eval('.fighter-card[data-fighter-id="A"]', e => ({
        level: e.querySelector('.class-name').textContent,
        pa: e.querySelector('.pips .pa').textContent,
        gear: e.querySelector('.fighter-equipment summary').textContent,
      }));
      assert.match(combat.level, new RegExp(`niv\\. ${level}$`));
      assert.match(combat.pa, new RegExp(`${pa} PA`));
      assert.equal(combat.gear, '0 objets équipés');
      await click('.play-controls .btn', 'Fin de tour');
      await page.waitForFunction(() => document.querySelector('.turn-status.yours'));
      assert.match(await page.$eval('.fighter-card[data-fighter-id="A"] .pips .pa', e => e.textContent), new RegExp(`${pa} PA`));
      report.levels.push({ level, pa: prepared, gear: 0, nextTurn: pa });
      if (level === 100) {
        const panel = await page.$('.fighter-card[data-fighter-id="A"]');
        await panel.screenshot({ path: path.join(out, 'level-100-seven-pa.png') }); await panel.dispose();
      }
      await click('.fight-heading .btn', 'Abandonner');
    }
    assert.deepEqual(report.errors, []);
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    if (page) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
    throw error;
  } finally {
    fs.writeFileSync(path.join(out, 'proof.json'), JSON.stringify(report, null, 2));
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
