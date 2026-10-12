// Isolated browser profile: never reads or edits the player's real saves.
require('./ai_runtime.cjs');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const path = require('node:path');
const puppeteer = require('puppeteer-core');
const { emptyLoadout } = require('../src/engine/equipment');
const out = '/tmp/dofus-combat-choice';
const loadout = { ...emptyLoadout('IOP'), level: 200, base: { force: 300 }, slots: { weapon: 2416 } };
const room = { id: 'proof-room', name: 'La clairière des Poutchs', mapId: 'dungeon_2083', members: [{ monsterId: 494, grade: 1, count: 2 }] };
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, pipe: true });
  const report = { errors: [] };
  try {
    const page = await browser.newPage(); page.setDefaultTimeout(30000);
    await page.setViewport({ width: 1440, height: 1000 });
    page.on('pageerror', error => report.errors.push(error.message));
    await page.evaluateOnNewDocument(({ loadout, room }) => {
      if (localStorage.getItem('combat-choice-proof')) return;
      localStorage.setItem('combat-choice-proof', '1');
      localStorage.setItem('dofus-lite-loadouts-v1', JSON.stringify({ 'A:IOP': loadout }));
      localStorage.setItem('dofus-lite-player-setup-v1', JSON.stringify({ playerClass: 'IOP', mode: 'duel', mapId: 'canyon' }));
      localStorage.setItem('dofus-lite-creations-v1', JSON.stringify({ version: 1, characters: [], dungeons: [room] }));
    }, { loadout, room });
    const click = async (selector, text = '') => {
      const handle = await page.evaluateHandle(({ selector, text }) => [...document.querySelectorAll(selector)].find(e => e.checkVisibility() && e.textContent.includes(text)), { selector, text });
      assert(handle.asElement(), `Missing ${selector} ${text}`);
      await handle.asElement().click(); await handle.dispose();
    };
    const capture = async name => { await page.screenshot({ path: path.join(out, `${name}.png`) }); };
    const open = async () => { await click('.setup-play'); await page.waitForSelector('.combat-choice[open]'); };
    const done = () => click('.combat-choice-done');
    const launchManual = async (map, count) => {
      await click('.combat-choice-launch'); await page.waitForSelector('.placement-ready');
      assert.equal(await page.$('.combat-choice[open]'), null);
      assert(await page.$eval('.fight-heading', (e, expected) => e.textContent.includes(expected), map));
      assert.equal(await page.$$eval('.token.side-B', es => es.length), count);
      await click('.fight-heading button', 'Préparation');
    };
    const modalFits = async () => assert(await page.evaluate(() => {
      const box = document.querySelector('.combat-choice').getBoundingClientRect();
      const button = document.querySelector('.combat-choice-launch').getBoundingClientRect();
      const dialog = document.querySelector('.combat-choice');
      return box.top >= 0 && box.left >= 0 && box.right <= innerWidth && box.bottom <= innerHeight
        && button.top >= box.top && button.bottom <= box.bottom && dialog.scrollWidth <= dialog.clientWidth + 1;
    }), 'Popup and launch button fit the viewport');
    await page.goto(process.env.PROOF_URL || 'http://127.0.0.1:3013', { waitUntil: 'networkidle0' });
    await open();
    assert.equal(await page.$$eval('.combat-choice-modes button', es => es.length), 3);
    assert.equal(await page.$('.placement-ready'), null);
    await modalFits(); await capture('duel');
    await click('[data-panel-trigger="map"]');
    await page.waitForSelector('.duel-map-grid');
    await done();
    assert(await page.$('.combat-choice[open]'), 'Returning from map gallery keeps combat popup open');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('.combat-choice[open]'));
    assert.equal(await page.evaluate(() => document.activeElement.classList.contains('setup-play')), true);
    report.modal = { opensWithoutStarting: true, threeModes: true, inlineMapGallery: true, escapeAndFocus: true };
    await open();
    await click('[data-panel-trigger="opponents"]'); await click('.duel-team-clear');
    await click('.duel-source-tabs button', 'Classes');
    await click('[data-candidate-id="class:FECA"] button');
    await page.select('.combat-choice [aria-label="IA de Féca (1)"]', 'cortex'); await done();
    await launchManual('Canyon', 1);
    report.duel = { opponent: 'FECA', bot: 'cortex', map: 'canyon' };

    await open(); await click('.combat-choice-modes button', 'Donjon');
    await click('[data-panel-trigger="dungeons"]'); await click('.combat-choice [data-boss-id="147"]'); await done();
    await page.select('.combat-choice [aria-label="Niveau du boss"]', '1');
    await modalFits(); await capture('dungeon');
    await page.reload({ waitUntil: 'networkidle0' }); await open();
    assert.equal(await page.$eval('.combat-choice-modes button[aria-pressed=true] strong', e => e.textContent), 'Donjon');
    assert.equal(await page.$eval('.combat-choice [aria-label="Niveau du boss"]', e => e.value), '1');
    await launchManual('Donjon des Bouftous', 8);
    report.dungeon = { boss: 147, grade: 1, enemies: 8, restoredAfterReload: true };
    await open(); await click('[data-panel-trigger="dungeons"]'); await click('.combat-choice .source-filters button', 'Personnalisés');
    await click('.combat-choice [data-dungeon-id="proof-room"]'); await done();
    await launchManual('Donjon des Bouftous', 2);
    report.customDungeon = { map: room.mapId, enemies: 2 };
    await open(); await click('.combat-choice-modes button', 'Entraînement');
    await page.select('.combat-choice [aria-label="Niveau du Poutch"]', '2');
    await launchManual('Kanojedo', 1);
    report.training = { grade: 2 };

    await open(); await click('.combat-choice-modes button', 'Donjon'); await click('.combat-control-toggle button', 'Tout en IA');
    await click('[data-panel-trigger="settings"]');
    await page.select('.combat-choice [aria-label="IA de votre personnage"]', 'maison'); await done();
    await click('[data-panel-trigger="dungeons"]');
    await click('.combat-choice .source-filters button', 'Personnalisés');
    await click('.combat-choice [data-dungeon-id="proof-room"]'); await done();
    await capture('ai-dungeon');
    await click('.combat-choice-launch');
    await page.waitForSelector('[data-auto-dungeon]', { timeout: 120000 });
    await click('.auto-replay-controls button', 'Voir le résultat');
    await page.waitForSelector('[data-outcome]');
    report.automatic = { result: await page.$eval('[data-outcome]', e => e.dataset.outcome), dungeon: room.name };
    await capture('ai-result');
    await click('.auto-dungeon .fight-heading button', 'Retour à Combat');
    await click('.tabs > button', 'Jouer'); await open();
    assert.equal(await page.$eval('.combat-control-toggle button:last-child', e => e.getAttribute('aria-pressed')), 'true');
    assert(await page.$eval('.combat-dungeon-title', (e, name) => e.textContent.includes(name), room.name));
    await page.reload({ waitUntil: 'networkidle0' }); await open();
    assert.equal(await page.$eval('.combat-control-toggle button:last-child', e => e.getAttribute('aria-pressed')), 'true');
    report.automatic.remembered = true;

    await click('.combat-choice-modes button', 'Duel'); await click('[data-panel-trigger="settings"]');
    await page.select('.combat-choice [aria-label="IA de votre personnage"]', 'pantin');
    await done(); await click('[data-panel-trigger="opponents"]');
    await page.select('.combat-choice [aria-label="IA de Féca (1)"]', 'pantin'); await done();
    await click('.combat-choice-launch');
    await page.waitForSelector('[data-auto-dungeon]', { timeout: 120000 });
    assert(await page.$eval('.fight-heading', e => e.textContent.includes('Canyon')));
    assert.equal(await page.$$eval('.token.side-B', es => es.length), 1);
    await click('.auto-replay-controls button', 'Voir le résultat');
    assert.equal(await page.$eval('[data-outcome]', e => e.dataset.outcome), 'unfinished');
    report.aiDuel = { sameAI: 'pantin', classes: ['IOP', 'FECA'], map: 'canyon' };
    await click('.auto-dungeon .fight-heading button', 'Retour à Combat');
    await click('.tabs > button', 'Jouer'); await open();
    await click('.combat-choice-modes button', 'Donjon');

    await page.setViewport({ width: 390, height: 844 });
    await modalFits(); await capture('mobile-ai');
    await click('.combat-choice-modes button', 'Duel');
    await modalFits(); await capture('mobile-duel');
    report.mobile = { width: 390, launchAlwaysVisible: true, noPopupOverflow: true };
    await click('.combat-choice-close');
    await page.setViewport({ width: 1366, height: 768 }); await open();
    await modalFits(); await capture('laptop');
    report.laptop = { width: 1366, height: 768, launchAlwaysVisible: true };
    assert.deepEqual(report.errors, []);
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    const pages = await browser.pages(); await pages.at(-1)?.screenshot({ path: path.join(out, 'failure.png') });
    throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
