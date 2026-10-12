require('./ai_runtime.cjs');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const puppeteer = require('puppeteer-core');
const { emptyLoadout } = require('../src/engine/equipment');
const out = process.env.PROOF_DIR || '/tmp/dofus-allies';
const profile = (id, name, classId, base) => ({ id, name, classId, className: classId,
  loadout: { ...emptyLoadout(classId), level: 200, base, slots: {}, spells: { order: classId === 'CRA' ? [171, 161, 164] : [] } } });
const profiles = [profile('iop', 'Iop capitaine', 'IOP', { force: 200 }), profile('cra', 'Crâ éclaireur', 'CRA', { intelligence: 100 }),
  profile('eni', 'Eniripsa soutien', 'ENIRIPSA', { intelligence: 100 }), profile('sram', 'Sram assassin', 'SRAM', { force: 100 })];
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, pipe: true });
  const page = await browser.newPage(), report = { errors: [] };
  page.setDefaultTimeout(30000);
  page.on('pageerror', error => report.errors.push(error.message));
  const click = async (selector, text = '') => {
    const handle = await page.evaluateHandle(({ selector, text }) => [...document.querySelectorAll(selector)].find(e => e.checkVisibility() && e.textContent.includes(text)), { selector, text });
    assert(handle.asElement(), `Missing ${selector}: ${text}`); await handle.asElement().click(); await handle.dispose();
  };
  const entries = () => page.evaluate(() => JSON.parse(localStorage.getItem('dofus-lite-ally-team-v1')).entries);
  const capture = name => page.screenshot({ path: path.join(out, `${name}.png`) });
  const open = async () => { await click('.setup-play'); await click('[data-panel-trigger="allies"]'); };
  const manualTurn = id => page.waitForFunction(id => document.querySelector('[data-controlled-fighter]')?.dataset.controlledFighter === id && !document.querySelector('.end-turn')?.disabled, {}, id);
  try {
    await page.setViewport({ width: 1580, height: 1080 });
    await page.evaluateOnNewDocument(profiles => {
      if (localStorage.getItem('allies-proof')) return;
      localStorage.setItem('allies-proof', '1');
      localStorage.setItem('dofus-lite-profiles-v1', JSON.stringify({ version: 1, profiles, activeId: profiles[0].id }));
      localStorage.setItem('dofus-lite-player-setup-v1', JSON.stringify({ mode: 'kanojedo', monsterGrade: 5, mapId: 'arene', botId: 'pantin', playerBotId: 'maison' }));
      localStorage.setItem('dofus-lite-sound', JSON.stringify({ enabled: false, volume: 0 }));
    }, profiles);
    await page.goto(process.env.PROOF_URL || 'http://127.0.0.1:3013', { waitUntil: 'networkidle0' });
    const original = await page.evaluate(() => localStorage.getItem('dofus-lite-profiles-v1'));
    await open();
    await page.setDragInterception(true);
    const source = await page.$('[data-candidate-id="profile:cra"]'), target = await page.$('[data-ally-drop]');
    await source.dragAndDrop(target, { delay: 120 });
    await page.setDragInterception(false);
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('dofus-lite-ally-team-v1')).entries.length === 1);
    await click('[data-candidate-id="profile:eni"] button');
    await page.select('[aria-label="Contrôle de Eniripsa soutien (2)"]', 'ai');
    await page.select('[aria-label="IA de Eniripsa soutien (2)"]', 'pantin');
    assert.deepEqual((await entries()).map(e => [e.classId, e.controller, e.botId]), [['CRA', 'player', 'maison'], ['ENIRIPSA', 'ai', 'pantin']]);
    await page.$eval('.duel-team-list', e => { e.scrollTop = 0; });
    await capture('team-desktop');
    await page.reload({ waitUntil: 'networkidle0' }); await open();
    assert.equal((await entries()).length, 2);
    assert.equal(await page.$eval('[aria-label="Contrôle de Crâ éclaireur (1)"]', e => e.value), 'player');
    assert.equal(await page.$eval('[aria-label="IA de Eniripsa soutien (2)"]', e => e.value), 'pantin');
    await page.setViewport({ width: 390, height: 844 });
    assert(await page.evaluate(() => {
      const e = document.querySelector('.combat-choice'), r = e.getBoundingClientRect(), launch = e.querySelector('.combat-choice-actions .primary').getBoundingClientRect();
      return e.scrollWidth <= e.clientWidth + 1 && r.right <= innerWidth && launch.bottom <= innerHeight;
    }), 'Mobile dialog fits');
    await capture('team-mobile');
    await page.setViewport({ width: 1580, height: 1080 });
    await click('.combat-choice-done'); await click('.combat-choice-launch'); await page.waitForSelector('.placement-ready');
    assert.equal(await page.$$eval('.token.side-A', es => es.length), 3);
    await click('.team-placement button', 'Crâ éclaireur');
    assert.equal(await page.$eval('[data-controlled-fighter]', e => e.dataset.controlledFighter), 'A2');
    const tokenStyle = await page.$eval('.token[data-fighter-id="A2"]', e => e.getAttribute('style'));
    await click('.placement-cell.yours:not(.selected)');
    await page.waitForFunction(before => document.querySelector('.token[data-fighter-id="A2"]').getAttribute('style') !== before, {}, tokenStyle);
    await capture('team-placement');
    await click('.placement-ready');
    await manualTurn('A'); await click('.end-turn'); await manualTurn('A2');
    assert(await page.$eval('.turn-status', e => e.textContent.includes('Crâ éclaireur')));
    const pa = await page.$eval('.player-resources .pa strong', e => Number(e.textContent));
    const boost = await page.$('.spell-btn[title^="Tir Eloigné"]'); assert(boost, 'Ally spell book visible'); await boost.click({ button: 'right' });
    assert.equal(await page.$eval('.player-resources .pa strong', e => Number(e.textContent)), pa - 2);
    await page.keyboard.press('2'); assert(await page.$('.spell-btn.selected'), 'Ally shortcut selects spell'); await page.keyboard.press('Escape');
    const pm = await page.$eval('.player-resources .pm strong', e => Number(e.textContent));
    await click('.cell.hl-move');
    assert(await page.$eval('.player-resources .pm strong', e => Number(e.textContent)) < pm, 'Ally movement consumes its PM');
    await capture('manual-ally-turn');
    for (const viewport of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
      await page.setViewport(viewport);
      await page.waitForFunction(() => document.documentElement.scrollHeight <= innerHeight + 1 && document.documentElement.scrollWidth <= innerWidth + 1);
    }
    await page.setViewport({ width: 1580, height: 1080 });
    await click('.end-turn'); await manualTurn('A');
    assert.equal(await page.evaluate(() => localStorage.getItem('dofus-lite-profiles-v1')), original);
    await click('.fight-heading-actions button', 'Abandonner'); await open();
    await click('.combat-choice-done'); await click('.combat-choice-modes button', 'Donjon');
    await click('[data-panel-trigger="dungeons"]');
    await click('[data-boss-id="147"]'); await click('.combat-choice-done'); await click('.combat-choice-launch');
    await page.waitForSelector('.placement-ready');
    assert.equal(await page.$$eval('.token.side-A', es => es.length), 3);
    assert.equal(await page.$$eval('.token.side-B', es => es.length), 8);
    assert(await page.$eval('.fight-heading h1', e => e.textContent.includes('Bouftou')));
    await capture('allies-in-dungeon');
    await click('.fight-heading-actions button', 'Préparation'); await open();
    await click('.combat-choice-done'); await click('.combat-choice-modes button', 'Duel');
    await click('[data-panel-trigger="opponents"]');
    await click('.duel-team-clear'); await click('.duel-source-tabs button', 'Monstres');
    await page.type('[aria-label="Rechercher un adversaire"]', 'Poutch');
    await page.select('[aria-label="Niveau proposé pour Poutch Ingball"]', '1');
    await click('[data-candidate-id="monster:494"] button');
    await click('.combat-choice-done'); await click('.combat-control-toggle button', 'Tout en IA'); await click('.combat-choice-launch');
    await page.waitForSelector('[data-auto-dungeon]', { timeout: 120000 });
    assert.equal(await page.$$eval('.token.side-A', es => es.length), 3);
    await click('.auto-result-button');
    assert.equal(await page.$eval('[data-outcome]', e => e.dataset.outcome), 'victory');
    await capture('automatic-team-result');
    assert.deepEqual(report.errors, []);
    report.checks = ['native profile drag-and-drop', 'manual and selected AI controls', 'saved team reload', 'mobile composer', 'place an ally', 'manual handoff and fresh spells', 'self-cast, shortcuts and movement on ally', 'AI ally passes its own turn', 'no combat scrolling on desktop/mobile', 'three allies against eight dungeon monsters', 'team automatic victory', 'original profiles preserved'];
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    await capture('failure'); fs.writeFileSync(path.join(out, 'failure.txt'), await page.evaluate(() => document.body.innerText)); throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
