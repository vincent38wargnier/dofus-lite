const puppeteer = require('puppeteer-core');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const out = process.env.PROOF_DIR || '/tmp/dofus-auto-dungeon';

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, pipe: true });
  const report = { errors: [], layouts: [] };
  let page;
  try {
    page = await browser.newPage(); page.setDefaultTimeout(60000);
    page.on('pageerror', error => report.errors.push(error.message));
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument(() => {
      if (!localStorage.getItem('auto-dungeon-proof')) {
        localStorage.setItem('dofus-lite-player-setup-v1', JSON.stringify({ playerClass: 'IOP', mode: 'boss', bossId: 147, bossGrade: 1, mapId: 'canyon' }));
        localStorage.setItem('dofus-lite-loadouts-v1', JSON.stringify({ 'A:IOP': {
          version: 1, level: 200, base: { force: 200, vitalite: 200 }, rollMode: 'max', rollSeed: 1,
          slots: { hat: 8267, cape: 8265, amulet: 8262, ring1: 8263, ring2: 2469, belt: 8266, boots: 8264, weapon: 2416 },
          spells: { common: [350, 367], order: [0, 141, 153] },
        } }));
        localStorage.setItem('auto-dungeon-proof', 'true');
      }
      Math.random = () => .000031;
      const original = URL.createObjectURL;
      URL.createObjectURL = function (blob) { window.combatExport = blob; return original.call(this, blob); };
    });
    const click = async (selector, text = '') => {
      const handle = await page.evaluateHandle(({ selector, text }) => [...document.querySelectorAll(selector)]
        .find(e => e.checkVisibility() && e.textContent.includes(text)), { selector, text });
      assert(handle.asElement(), `Missing ${selector}: ${text}`);
      assert(!await handle.asElement().evaluate(e => e.disabled), `Disabled ${selector}: ${text}`);
      await handle.asElement().click(); await handle.dispose();
    };
    const record = async () => {
      if (!await page.$('.fight-log')) await click('.fight-heading-actions button', 'Journal');
      await click('.combat-log-heading button', 'Exporter');
      const result = await page.evaluate(async () => JSON.parse(await window.combatExport.text()));
      await click('.fight-log-close'); return result;
    };
    const layout = async label => {
      await page.waitForFunction(() => {
        const board = document.querySelector('.board')?.getBoundingClientRect();
        const area = document.querySelector('.fight-map')?.getBoundingClientRect();
        return board && area && board.width <= area.width + 1 && board.height <= area.height + 1;
      });
      const geometry = await page.evaluate(() => ({ viewport: [innerWidth, innerHeight],
        page: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
        outside: [...document.querySelectorAll('.auto-replay-controls, .auto-result, .combat-stats')].filter(el => {
          const r = el.getBoundingClientRect(); return r.right > innerWidth + 1 || r.bottom > innerHeight + 1 || r.x < 0;
        }).map(el => el.className) }));
      assert(geometry.page[0] <= geometry.viewport[0] && geometry.page[1] <= geometry.viewport[1], label);
      assert.deepEqual(geometry.outside, [], label);
      report.layouts.push({ label, ...geometry });
    };
    await page.goto(process.env.PROOF_URL || 'http://127.0.0.1:3013', { waitUntil: 'networkidle0' });
    await click('.setup-navigation button', 'Combat');
    await click('.match-modes button', 'Donjon automatique');
    assert.equal(await page.$eval('[aria-label="IA de mon personnage"]', e => e.value), 'maison');
    report.loadoutBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('dofus-lite-loadouts-v1'))['A:IOP']);
    await page.screenshot({ path: path.join(out, 'setup.png') });
    await click('.setup-play', 'Simuler');
    await page.waitForSelector('[data-auto-dungeon]');
    assert.equal(await page.$('.placement-ready'), null, 'No manual placement or turn is required');
    await click('[aria-label="Pause"]');
    const paused = await page.$eval('[data-auto-dungeon]', e => e.dataset.replayFrame);
    await new Promise(resolve => setTimeout(resolve, 600));
    assert.equal(await page.$eval('[data-auto-dungeon]', e => e.dataset.replayFrame), paused, 'Pause stops replay');
    if (Number(paused) > 0) await click('[aria-label="Revenir au début"]');
    report.initial = await record();
    assert.equal(report.initial.mapId, 'dungeon_2083');
    const originals = Object.values(report.initial.state.fighters).filter(f => f.team === 'B' && !f.isSummon);
    assert.equal(originals.length, 8);
    assert.equal(report.initial.state.fighters.A.level, 200);
    assert.deepEqual(report.initial.state.fighters.A.loadout.slots, report.loadoutBefore.slots);
    await click('[aria-label="Action suivante"]');
    assert.equal(await page.$eval('[data-auto-dungeon]', e => e.dataset.replayFrame), '1');
    await click('[aria-label="Action précédente"]');
    assert.equal(await page.$eval('[data-auto-dungeon]', e => e.dataset.replayFrame), '0');
    await page.select('[aria-label="Vitesse de lecture"]', '8');
    await click('[aria-label="Lire le combat"]');
    await page.waitForFunction(() => Number(document.querySelector('[data-auto-dungeon]').dataset.replayFrame) > 1);
    await click('[aria-label="Pause"]');
    await layout('desktop-replay');
    await page.screenshot({ path: path.join(out, 'replay.png') });
    await click('.auto-result-button');
    await page.waitForSelector('[data-outcome]');
    report.resultText = await page.$eval('.auto-result', e => e.textContent);
    report.result = await record();
    assert(report.result.state.over);
    assert(report.result.events.some(e => e.t === 'cast' && e.fighter === 'A'));
    assert.deepEqual(report.result.events.filter(e => e.t === 'bot_error'), []);
    report.outcome = await page.$eval('[data-outcome]', e => e.dataset.outcome);
    await layout('desktop-result');
    await page.screenshot({ path: path.join(out, 'result.png') });
    for (const [width, height] of [[844, 390], [390, 844], [375, 667]]) {
      await page.setViewport({ width, height }); await layout(`${width}x${height}`);
    }
    await page.screenshot({ path: path.join(out, 'mobile.png') });
    await click('.fight-heading-actions button', 'Préparation');
    const after = await page.evaluate(() => JSON.parse(localStorage.getItem('dofus-lite-loadouts-v1'))['A:IOP']);
    assert.deepEqual(after, report.loadoutBefore);
    await page.reload({ waitUntil: 'networkidle0' });
    await click('.setup-navigation button', 'Combat');
    assert.equal(await page.$eval('.match-modes button[aria-pressed="true"]', e => e.textContent.includes('Donjon automatique')), true);
    assert.equal(await page.$eval('[aria-label="IA de mon personnage"]', e => e.value), 'maison');
    await click('.match-modes button', 'Boss de donjon');
    await click('.setup-play', 'Jouer');
    await page.waitForSelector('.placement-ready');
    report.manualModePreserved = true;
    assert.deepEqual(report.errors, []);
    console.log(JSON.stringify({ outcome: report.outcome, resultText: report.resultText, layouts: report.layouts, errors: report.errors }, null, 2));
  } catch (error) {
    if (page) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
    throw error;
  } finally {
    fs.writeFileSync(path.join(out, 'proof.json'), JSON.stringify(report, null, 2));
    const child = browser.process(); await browser.disconnect(); child?.kill('SIGTERM');
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
