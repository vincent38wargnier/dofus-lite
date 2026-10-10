// Reproduce Ga Pa after +3 over vitality through the real workshop, in an isolated browser.
const puppeteer = require('puppeteer-core');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');

const url = process.env.RETRO_URL || 'http://127.0.0.1:3013';
const expectCrash = process.env.EXPECT_CRASH === '1';
const out = path.join(os.tmpdir(), expectCrash ? 'dofus-fm-cap-crash' : 'dofus-fm-cap-proof');

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true, pipe: true,
  });
  const report = { url, expectCrash, errors: [] };
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1500, height: 1150 });
    page.on('pageerror', error => report.errors.push({ message: error.message, stack: error.stack }));
    const click = (selector, text = '') => page.evaluate(({ selector, text }) => {
      const element = [...document.querySelectorAll(selector)].find(e => e.offsetParent && e.textContent.includes(text));
      if (!element || element.disabled) throw new Error(`Unavailable: ${selector} ${text}`);
      element.click();
    }, { selector, text });
    const fill = async (selector, text) => {
      const handle = await page.evaluateHandle(selector => [...document.querySelectorAll(selector)].find(e => e.offsetParent), selector);
      await handle.asElement().focus();
      await handle.asElement().type(text);
      await handle.dispose();
    };
    const savedForge = () => page.evaluate(() => JSON.parse(localStorage.getItem('dofus-lite-loadouts-v1'))['A:IOP'].forgedItems?.ring2);
    const shot = async name => {
      const handle = await page.evaluateHandle(() => [...document.querySelectorAll('.fm-workspace')].find(e => e.offsetParent));
      await handle.asElement().screenshot({ path: path.join(out, name) });
      await handle.dispose();
    };

    await page.goto(url, { waitUntil: 'networkidle0' });
    await click('.setup-navigation button', 'Stuff');
    await click('[data-slot="ring2"]');
    await fill('input[aria-label="Rechercher un équipement"]', 'Blopanneau Griotte Royal');
    await click('[data-item-id="9126"]');
    await click('.equipment-equip');
    await click('.equipment-forge');
    await page.waitForSelector('.fm-workspace');
    await click('input[aria-label="Succès critique garanti"]');
    await click('[data-rune-id="1523"]'); // Vi: 35 + 3 = 38, over weight 0.75.
    await click('.fm-fuse');
    report.before = await savedForge();
    assert.equal(report.before.stats.vitalite, 38);
    assert.equal(report.before.puits, 0);
    const runes = await page.evaluate(() => [...[...document.querySelectorAll('.fm-workshop')].find(e => e.offsetParent)
      .querySelectorAll('[data-rune-stat]')].map(e => e.dataset.runeStat));
    assert.deepEqual(runes.slice(0, 2), ['pa', 'pm']);
    await click('[data-rune-id="1558"]');
    assert.ok(await page.evaluate(() => [...document.querySelectorAll('.fm-fuse')].some(e => e.offsetParent && !e.disabled)), 'Exotic PM is directly available');
    await click('[data-rune-id="1557"]');
    await shot('before-ga-pa.png');
    await click('.fm-fuse');

    if (expectCrash) {
      await page.waitForFunction(() => document.getElementById('root').childElementCount === 0);
      assert.ok(report.errors.some(error => /Limite de forgemagie dépassée : vitalite/.test(error.message)));
      assert.deepEqual(await savedForge(), report.before, 'The failed transaction must leave the persisted item intact');
      report.reproduced = true;
      await page.screenshot({ path: path.join(out, 'crash.png') });
    } else {
      await page.waitForFunction(() => JSON.parse(localStorage.getItem('dofus-lite-loadouts-v1'))['A:IOP'].forgedItems?.ring2?.stats.pa === 1);
      report.after = await savedForge();
      assert.deepEqual(report.after.stats, { ...report.before.stats, pa: 1 });
      assert.equal(report.after.puits, 0);
      assert.equal(report.after.attempts, 2);
      assert.equal(report.after.consumption[1557], 1);
      assert.equal(report.after.history.at(-1).outcome, 'SC');
      assert.match(await page.$eval('.fm-meters', e => e.textContent), /100,75/);
      assert.equal(await page.$eval('.fm-fuse', e => e.disabled), true, 'A second PA stays forbidden');
      await shot('ga-pa-with-vitality-over.png');
      await page.reload({ waitUntil: 'networkidle0' });
      await click('.setup-navigation button', 'Stuff');
      await click('.builder-navigation button', 'Forgemagie');
      await click('[data-forge-slot="ring2"]');
      assert.deepEqual(await savedForge(), report.after, 'Reload must retain the complete forged item');
      assert.equal(await page.$eval('[data-forge-stat="pa"] td b', e => e.textContent), '1');
      assert.equal(await page.$eval('[data-forge-stat="vitalite"] td b', e => e.textContent), '38');
      await click('[data-rune-id="1523"]');
      assert.equal(await page.$eval('.fm-fuse', e => e.disabled), true, 'Another +3 Vi would exceed 101');
      assert.match(await page.$eval('.fm-blocked', e => e.textContent), /101/);
      report.reloadPreserved = true;
      assert.deepEqual(report.errors, []);
    }
    console.log(JSON.stringify(report, null, 2));
  } finally {
    fs.writeFileSync(path.join(out, 'proof.json'), JSON.stringify(report, null, 2));
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
