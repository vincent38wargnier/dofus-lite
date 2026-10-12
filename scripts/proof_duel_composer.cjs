require('./ai_runtime.cjs');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer-core');
const { emptyLoadout } = require('../src/engine/equipment');
const { CREATION_SPELLS_BY_ID } = require('../src/ui/creationCatalogue');
const out = '/tmp/dofus-duel-composer';
const profile = (id, name, classId, stat, level = 200) => ({ id, name, classId, className: classId,
  loadout: { ...emptyLoadout(classId), level, base: { [stat]: 100 }, slots: { weapon: 2416 } } });
const profiles = [profile('iop-feu', 'Iop feu', 'IOP', 'intelligence'), profile('sram', 'Sram assassin', 'SRAM', 'force', 180),
  profile('cra', 'Cra longue portée', 'CRA', 'agilite'), profile('sacri', 'Sacrieur tank', 'SACRIEUR', 'vitalite'),
  profile('eni', 'Eniripsa soutien', 'ENIRIPSA', 'intelligence'), profile('custom', 'Gardienne des flammes', 'IOP', 'intelligence')];
profiles[5].loadout.spells = { custom: [202, 350].map(id => CREATION_SPELLS_BY_ID[id].grades.at(-1)), order: [202, 350] };
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, pipe: true });
  const report = { errors: [] };
  try {
    const page = await browser.newPage(); page.setDefaultTimeout(30000);
    await page.setViewport({ width: 1600, height: 1060 });
    page.on('pageerror', error => report.errors.push(error.message));
    await page.evaluateOnNewDocument(profiles => {
      if (localStorage.getItem('duel-composer-proof')) return;
      localStorage.setItem('duel-composer-proof', '1');
      localStorage.setItem('dofus-lite-profiles-v1', JSON.stringify({ version: 1, activeId: profiles[0].id, profiles }));
      localStorage.setItem('dofus-lite-player-setup-v1', JSON.stringify({ mode: 'duel', mapId: 'amakna_pvp_10340', botId: 'pantin', playerBotId: 'pantin' }));
    }, profiles);
    const click = async (selector, text = '') => {
      const handle = await page.evaluateHandle(({ selector, text }) => [...document.querySelectorAll(selector)].find(e => e.checkVisibility() && e.textContent.includes(text)), { selector, text });
      assert(handle.asElement(), `Missing ${selector} ${text}`); await handle.asElement().click(); await handle.dispose();
    };
    const type = async (selector, text) => { await page.$eval(selector, element => { element.value = ''; }); await page.type(selector, text); };
    const entries = () => page.evaluate(() => JSON.parse(localStorage.getItem('dofus-lite-opponent-team-v1')).entries);
    const capture = async name => {
      await page.evaluate(() => { for (const selector of ['.combat-choice-body', '.duel-catalogue-grid']) { const element = document.querySelector(selector); if (element) element.scrollTop = 0; } });
      await page.screenshot({ path: path.join(out, `${name}.png`) });
    };
    const open = async () => { await click('.setup-play'); await click('[data-panel-trigger="opponents"]'); await page.waitForSelector('.duel-composer'); };
    const fits = async () => assert(await page.evaluate(() => {
      const dialog = document.querySelector('.combat-choice'), rect = dialog.getBoundingClientRect(), launch = dialog.querySelector('.combat-choice-actions .primary').getBoundingClientRect();
      return rect.left >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight && launch.bottom <= innerHeight && dialog.scrollWidth <= dialog.clientWidth + 1;
    }), 'Composer fits the viewport and keeps launch visible');
    await page.goto(process.env.PROOF_URL || 'http://127.0.0.1:3013', { waitUntil: 'networkidle0' });
    const before = await page.evaluate(() => localStorage.getItem('dofus-lite-profiles-v1'));
    await open();
    assert.equal(await page.$eval('.duel-source-tabs [aria-pressed=true]', e => e.textContent.trim()), 'Mes personnages6');
    await click('.duel-team-clear');
    await page.setDragInterception(true);
    const source = await page.$('[data-candidate-id="profile:sram"]'), target = await page.$('[data-opponent-drop]');
    await source.dragAndDrop(target, { delay: 120 });
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('dofus-lite-opponent-team-v1')).entries.length === 1);
    await page.setDragInterception(false);
    assert.equal((await entries())[0].name, 'Sram assassin');
    await click('[data-candidate-id="profile:custom"] button');
    assert.deepEqual((await entries())[1].loadout.spells.custom.map(spell => spell.id), [202, 350]);
    await fits(); await capture('profiles');
    report.profiles = { nativeDragAndDrop: true, customSpellsRetained: [202, 350], total: 2 };

    await click('.duel-source-tabs button', 'Monstres');
    await type('[aria-label="Rechercher un adversaire"]', 'bouftou');
    await page.select('[aria-label="Niveau proposé pour Bouftou Royal"]', '1');
    await click('[data-candidate-id="monster:147"] button');
    assert.deepEqual((await entries())[2], { kind: 'monster', monsterId: 147, grade: 1 });
    await capture('monsters');
    report.monsters = { searched: 'bouftou', selected: 147, grade: 1, mixedGroup: true };

    await click('.combat-choice-done'); await click('[data-panel-trigger="map"]');
    await fits(); await capture('maps');
    await type('[aria-label="Rechercher une carte"]', 'bouftou');
    await click('[data-map-id="dungeon_2083"]');
    assert(await page.$eval('.combat-terrain', e => e.textContent.includes('Donjon des Bouftous')));
    await page.reload({ waitUntil: 'networkidle0' }); await open(); await click('.combat-choice-done');
    assert.equal((await entries()).length, 3);
    assert(await page.$eval('.combat-terrain', e => e.textContent.includes('Donjon des Bouftous')));
    await click('[data-panel-trigger="opponents"]'); await click('[data-opponent-index="0"] .duel-team-member-info button');
    await page.select('.loadout-toolbar [aria-label="Niveau du personnage"]', '170');
    assert.equal((await entries())[0].loadout.level, 170);
    await page.select('.opponent-edit-banner [aria-label="Apparence adverse"]', 'female');
    assert.equal((await entries())[0].loadout.profile.sex, 1);
    assert.equal(await page.evaluate(() => localStorage.getItem('dofus-lite-profiles-v1')), before);
    await click('.opponent-edit-banner button', 'Revenir au choix du combat'); await click('.combat-choice-done');
    await click('.combat-choice-launch');
    await page.waitForSelector('.placement-ready');
    assert.equal(await page.$$eval('.token.side-B', elements => elements.length), 3);
    assert(await page.$eval('.fight-heading', e => e.textContent.includes('Donjon des Bouftous')));
    await capture('mixed-placement');
    report.manual = { opponents: 3, exactMap: 'dungeon_2083', customizationIsolated: true, restoredAfterReload: true };
    await click('.fight-heading button', 'Préparation'); await open();
    // Quick automatic match against a selected Poutch validates the same composer handoff.
    await click('.duel-team-clear'); await click('.duel-source-tabs button', 'Monstres');
    await type('[aria-label="Rechercher un adversaire"]', 'Poutch');
    await page.select('[aria-label="Niveau proposé pour Poutch Ingball"]', '1');
    await click('[data-candidate-id="monster:494"] button');
    await click('.combat-choice-done'); await click('.combat-control-toggle button', 'Tout en IA');
    await click('[data-panel-trigger="settings"]');
    await page.select('[aria-label="IA de votre personnage"]', 'maison'); await click('.combat-choice-done');
    await click('.combat-choice-launch'); await page.waitForSelector('[data-auto-dungeon]', { timeout: 120000 });
    await click('.auto-replay-controls button', 'Voir le résultat');
    assert(await page.$eval('[data-outcome]', e => e.textContent.includes('1 / 1 adversaires vaincus')));
    report.automatic = { outcome: await page.$eval('[data-outcome]', e => e.dataset.outcome), opponents: 1 };
    await click('.auto-dungeon .fight-heading button', 'Retour à Combat'); await click('.tabs > button', 'Jouer'); await open();
    await click('.combat-choice-done'); await click('.combat-choice-modes button', 'Duel');
    await page.setViewport({ width: 390, height: 844 }); await fits(); await capture('mobile');
    await click('[data-panel-trigger="map"]'); await fits(); await capture('mobile-maps');
    report.mobile = { width: 390, fits: true };
    assert.deepEqual(report.errors, []);
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    const pages = await browser.pages(); await pages.at(-1)?.screenshot({ path: path.join(out, 'failure.png') }); throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
