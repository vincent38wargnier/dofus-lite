// Create a class through the Atelier, then select and play it from Jouer.
const puppeteer = require('puppeteer-core');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const out = process.env.PROOF_DIR || '/tmp/dofus-custom-class-selection';

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, pipe: true });
  const report = { errors: [] };
  let page;
  try {
    page = await browser.newPage(); page.setDefaultTimeout(30000);
    await page.setViewport({ width: 1600, height: 1080 });
    page.on('pageerror', error => report.errors.push(error.message));
    await page.evaluateOnNewDocument(() => {
      if (!localStorage.getItem('custom-selection-proof')) {
        localStorage.setItem('dofus-lite-player-setup-v1', JSON.stringify({ playerClass: 'IOP', mode: 'kanojedo', monsterGrade: 5, bossId: 147, bossGrade: 1 }));
        localStorage.setItem('custom-selection-proof', 'true');
      }
      Math.random = () => .000031;
      const create = URL.createObjectURL;
      URL.createObjectURL = function (blob) { window.combatExport = blob; return create.call(this, blob); };
    });
    const click = async (selector, text = '') => {
      const handle = await page.evaluateHandle(({ selector, text }) => [...document.querySelectorAll(selector)].find(e => e.checkVisibility() && e.textContent.includes(text)), { selector, text });
      assert(handle.asElement(), `Missing ${selector}: ${text}`);
      assert(!await handle.asElement().evaluate(e => e.disabled), `Disabled ${selector}: ${text}`);
      await handle.asElement().click(); await handle.dispose();
    };
    const input = async (selector, value) => {
      await page.$eval(selector, e => { e.focus(); e.select(); });
      await page.keyboard.press('Backspace'); await page.type(selector, value);
    };
    const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('dofus-lite-creations-v1')).characters[0]);
    const record = async () => {
      if (!await page.$('.fight-log')) await click('.fight-heading-actions button', 'Journal');
      await click('.combat-log-heading button', 'Exporter');
      return page.evaluate(async () => JSON.parse(await window.combatExport.text()));
    };
    await page.goto(process.env.PROOF_URL || 'http://127.0.0.1:3013', { waitUntil: 'networkidle0' });
    await click('.tabs > button', 'Atelier');
    await click('.creator-tabs button', 'Mes classes');
    await click('.creator-library-strip button', 'Nouvelle classe');
    await input('.creator-name-row input', 'Gardienne Ivoire');
    const appearance = await page.evaluateHandle(() => [...document.querySelectorAll('.creator-character-identity label')]
      .find(label => label.textContent.startsWith('Apparence')).querySelector('select'));
    await appearance.asElement().select('1'); await appearance.dispose();
    for (const [query, id] of [['Puissance', 153], ['Morsure du Bouftou', 202], ['Invocation d’Arakne', 214]]) {
      await input('.workshop-screen [aria-label="Rechercher dans tous les sorts"]', query);
      await click(`.workshop-screen .creator-spell-results [aria-label$="(${id})"]`, 'Ajouter');
    }
    await click('.creator-artwork summary');
    const upload = await page.$('[aria-label="Images PNG du personnage"]');
    await upload.uploadFile(...['portrait.png', 'idle-front.png', 'idle-back.png'].map(name => path.resolve(__dirname, '../public/characters/heroine-ivoire-v1', name)));
    await page.waitForSelector('.creator-artwork-stage .custom-character-sprite');
    const creation = await saved();
    const selector = `.setup-class[data-custom-character-id="${creation.id}"]`;
    await click('.tabs > button', 'Jouer');
    await page.waitForSelector(`${selector} img`);
    assert.equal(await page.$$eval('.setup-class', items => items.length), 13);
    await click(selector);
    await page.waitForFunction(() => document.querySelector('.summary-portrait img')?.src.startsWith('blob:'));
    assert.equal(await page.$eval('.player-summary h2', e => e.textContent), creation.name);
    assert.equal(await page.$$eval('.setup-class[aria-pressed="true"]', items => items.length), 1);
    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForFunction(selector => document.querySelector(selector)?.getAttribute('aria-pressed') === 'true', {}, selector);
    await page.waitForFunction(() => document.querySelector('.summary-portrait img')?.src.startsWith('blob:'));
    assert.equal(await page.$eval('.player-summary h2', e => e.textContent), creation.name);
    await page.$eval('.setup-navigation', e => e.scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: path.join(out, 'selection.png') });
    report.selection = { name: creation.name, spellIds: creation.loadout.spells.custom.map(s => s.id), count: 13, customPortrait: true, restoredAfterReload: true };
    await page.setViewport({ width: 390, height: 844 });
    await page.$eval(selector, e => e.scrollIntoView({ block: 'center' }));
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile overflow');
    await page.screenshot({ path: path.join(out, 'mobile.png') });
    await page.setViewport({ width: 1600, height: 1080 });
    await click('.setup-play');
    await page.waitForSelector('.token.side-A .custom-character-sprite');
    assert.deepEqual(await page.$$eval('.combat-spellbar .spell-slot', entries => entries.map(e => Number(e.dataset.spellId))), [153, 202, 214]);
    await click('.placement-ready');
    await page.waitForSelector('.turn-status.yours');
    await page.click('.spell-slot[data-spell-id="153"] .spell-btn', { button: 'right' });
    const manual = await record();
    assert.equal(manual.state.fighters.A.name, creation.name);
    assert.equal(manual.state.fighters.A.loadout.artworkId, creation.loadout.artworkId);
    assert(manual.events.some(e => e.t === 'cast' && e.spellId === 153));
    await page.screenshot({ path: path.join(out, 'combat.png') });
    report.manual = { name: manual.state.fighters.A.name, map: manual.mapId, customCast: true };
    await click('.fight-heading-actions button', 'Abandonner');
    await click('.setup-navigation button', 'Combat');
    await click('.match-modes button', 'Donjon automatique');
    await click('.setup-play', 'Simuler');
    await page.waitForSelector('[data-auto-dungeon]', { timeout: 120000 });
    await click('.auto-result-button');
    const automatic = await record();
    assert.equal(automatic.state.fighters.A.name, creation.name);
    assert.deepEqual(automatic.state.fighters.A.loadout.spells.custom, creation.loadout.spells.custom);
    assert.equal(automatic.state.fighters.A.loadout.artworkId, creation.loadout.artworkId);
    assert(automatic.state.over);
    report.automatic = { name: automatic.state.fighters.A.name, completed: true, map: automatic.mapId };
    assert.deepEqual(report.errors, []);
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    report.failure = error.stack;
    if (page) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
    throw error;
  } finally {
    fs.writeFileSync(path.join(out, 'proof.json'), JSON.stringify(report, null, 2));
    const child = browser.process(); await browser.disconnect(); child?.kill('SIGTERM');
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
