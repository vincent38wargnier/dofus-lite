// Isolated Chrome profile: never reads or changes the player's browser saves.
require('./ai_runtime.cjs');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const puppeteer = require('puppeteer-core');
const { emptyLoadout } = require('../src/engine/equipment');
const out = process.env.PROOF_DIR || '/tmp/dofus-preparation-ui';
const profile = (id, name, classId, base, slots = {}) => ({ id, name, classId, className: classId,
  loadout: { ...emptyLoadout(classId), level: 200, base, slots } });
const profiles = [profile('cra', 'Crâ éclaireur', 'CRA', { intelligence: 200 }, {
  hat: 7143, cape: 8876, amulet: 9464, ring1: 8877, ring2: 8991, belt: 8856, boots: 8861, weapon: 2416,
}), profile('iop', 'Iop de première ligne', 'IOP', { force: 200 }), profile('eni', 'Eniripsa soutien', 'ENIRIPSA', { intelligence: 200 })];
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, pipe: true });
  const page = await browser.newPage(), report = { errors: [], checks: [] };
  page.setDefaultTimeout(30000);
  page.on('pageerror', error => report.errors.push(error.message));
  const click = async (selector, text = '') => {
    const handle = await page.evaluateHandle(({ selector, text }) => [...document.querySelectorAll(selector)].find(e => e.checkVisibility() && e.textContent.includes(text)), { selector, text });
    assert(handle.asElement(), `Missing ${selector}: ${text}`); await handle.asElement().click(); await handle.dispose();
  };
  const tab = name => click(`.setup-navigation button[aria-label="${name}"]`);
  const visible = selector => page.$$eval(selector, nodes => nodes.some(n => n.checkVisibility()));
  const capture = async name => { await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: path.join(out, `${name}.png`) }); };
  const saved = () => page.evaluate(() => {
    const library = JSON.parse(localStorage.getItem('dofus-lite-profiles-v1'));
    return library.profiles.find(p => p.id === library.activeId).loadout;
  });
  const check = text => { report.checks.push(text); console.log(text); };
  try {
    await page.setViewport({ width: 1600, height: 1060 });
    await page.evaluateOnNewDocument(profiles => {
      if (localStorage.getItem('preparation-proof')) return;
      localStorage.setItem('preparation-proof', '1');
      localStorage.setItem('dofus-lite-profiles-v1', JSON.stringify({ version: 1, activeId: 'cra', profiles }));
      localStorage.setItem('dofus-lite-ally-team-v1', JSON.stringify({ version: 1, entries: [{ ...profiles[2], kind: 'character', controller: 'ai', botId: 'maison' }] }));
      localStorage.setItem('dofus-lite-opponent-team-v1', JSON.stringify({ version: 1, entries: [{ kind: 'monster', monsterId: 494, grade: 1 }] }));
      localStorage.setItem('dofus-lite-player-setup-v1', JSON.stringify({ mode: 'duel', mapId: 'territoire_des_dopeuls_5383', botId: 'pantin', playerBotId: 'maison' }));
      localStorage.setItem('dofus-lite-sound', JSON.stringify({ enabled: false, volume: 0 }));
    }, profiles);
    await page.goto(process.env.PROOF_URL || 'http://127.0.0.1:3013', { waitUntil: 'networkidle0' });
    assert.equal(await page.$$eval('.setup-navigation button', es => es.length), 5);
    await capture('personnages');
    await tab('Équipement');
    assert(await visible('.equipment-paperdoll'));
    assert(!await visible('.profile-identity'));
    assert(!await visible('[aria-label="Qualité des jets"]'));
    await capture('equipement');
    await click('.equipment-options summary');
    await page.select('[aria-label="Qualité des jets"]', 'average');
    assert.equal((await saved()).rollMode, 'average');
    await page.select('[aria-label="Qualité des jets"]', 'max');
    await click('.equipment-options summary');
    await click('[data-slot="ring1"]');
    await click('.equipment-forge');
    assert(await visible('.fm-workshop'));
    assert.equal(await page.$eval('.setup-navigation [aria-label="Équipement"]', e => e.getAttribute('aria-selected')), 'true');
    assert.equal(await page.$eval('[data-forge-slot="ring1"]', e => e.getAttribute('aria-pressed')), 'true');
    await capture('forgemagie');
    check('equipment and forgemagie share one tab; selected item and natural roll settings work');
    await tab('Caractéristiques');
    assert(!await visible('.fm-workshop')); assert(!await visible('.equipment-collection'));
    assert(!await visible('[aria-label="Qualité des jets"]'));
    await click('[aria-label="Augmenter Intelligence"]');
    const base = (await saved()).base.intelligence;
    assert.equal(base, 201);
    await capture('caracteristiques');
    await tab('Sorts');
    assert(!await visible('.characteristic-allocator')); assert(!await visible('.equipment-collection'));
    await click('[aria-label="Apprendre Flamiche"]');
    await click('.spell-order-buttons button', 'Trier par type');
    const spellbook = (await saved()).spells;
    assert(spellbook.common.includes(350));
    await capture('sorts');
    await page.reload({ waitUntil: 'networkidle0' });
    assert.equal((await saved()).base.intelligence, base);
    assert.deepEqual((await saved()).spells, spellbook);
    check('allocation, learned spells, sort order and equipment survive reload');
    await tab('Équipement'); await click('.equipment-inventory button', 'Créer un équipement');
    await page.$eval('.equipment-design-identity input', e => { e.focus(); e.select(); });
    await page.keyboard.type('Coiffe en préparation');
    await tab('Caractéristiques'); assert(!await visible('.equipment-workshop'));
    await tab('Sorts'); assert(await visible('.spell-loadout'));
    await tab('Équipement');
    assert.equal(await page.$eval('.equipment-design-identity input', e => e.value), 'Coiffe en préparation');
    await click('.equipment-workshop button', 'Retour au stuff');
    check('a custom equipment draft survives switching to characteristics and spells');
    await tab('Combat');
    assert(await visible('.combat-inline'));
    assert.equal(await page.$('dialog.combat-choice'), null);
    assert.equal(await page.evaluate(() => document.body.style.overflow), '');
    await capture('combat');
    await click('[data-panel-trigger="allies"]');
    await click('[data-candidate-id="profile:iop"] button');
    await click('.combat-choice-done');
    assert.equal(await page.$$eval('.friends .combat-member', es => es.length), 3);
    await click('[data-panel-trigger="map"]');
    await click('[data-map-id="canyon"]');
    assert(await page.$eval('.combat-terrain', e => e.textContent.includes('Canyon')));
    await click('.setup-play');
    assert(await visible('dialog.combat-choice[open]')); assert.equal(await page.$('.combat-inline'), null);
    assert(await page.$eval('.combat-terrain', e => e.textContent.includes('Canyon')));
    await click('.combat-choice-modes [data-mode="kanojedo"]');
    await page.select('[aria-label="Niveau du Poutch"]', '2');
    await page.keyboard.press('Escape');
    assert(await visible('.combat-inline')); assert.equal(await page.$('dialog.combat-choice'), null);
    assert.equal(await page.$eval('[aria-label="Niveau du Poutch"]', e => e.value), '2');
    check('inline Combat and Jouer modal share teams, map and mode without duplicate composers');
    await click('.combat-choice-modes [data-mode="duel"]');
    await click('[data-panel-trigger="opponents"]');
    await click('.duel-team-clear');
    await click('.duel-source-tabs button', 'Mes personnages');
    await click('[data-candidate-id="profile:iop"] button');
    await click('.duel-team-member button', 'Personnaliser');
    assert(await visible('.opponent-edit-banner'));
    await tab('Caractéristiques');
    assert(await page.$eval('.builder-context', e => e.textContent.includes('Iop de première ligne')));
    await tab('Sorts');
    assert(await page.$eval('.opponent-edit-banner', e => e.textContent.includes('Iop de première ligne')));
    assert.equal(await page.$('dialog.combat-choice'), null);
    await click('.opponent-edit-banner button', 'Revenir au choix du combat');
    assert(await visible('.combat-inline'));
    check('customizing a team member returns directly to inline Combat');
    for (const width of [1440, 1100, 768, 390]) {
      await page.setViewport({ width, height: width === 390 ? 844 : 960 });
      for (const name of ['Équipement', 'Caractéristiques', 'Sorts', 'Combat']) {
        await tab(name);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name} overflows at ${width}`);
        if (width === 390 && name === 'Combat') {
          const rect = await page.$eval('.combat-inline .combat-choice-launch', e => { const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; });
          assert(rect.top >= 0 && rect.bottom <= 844, 'inline mobile launch must stay visible');
          assert(!await visible('.setup-play'), 'no modal opener covers the inline launch');
        }
        if (width === 390) await capture(`${name === 'Équipement' ? 'equipement' : name === 'Caractéristiques' ? 'caracteristiques' : name.toLowerCase()}-mobile`);
      }
    }
    check('all five tabs fit desktop, laptop, tablet and phone without horizontal overflow');
    await page.setViewport({ width: 1600, height: 1060 });
    await tab('Combat'); await click('.combat-choice-modes [data-mode="kanojedo"]');
    await click('.combat-choice-launch');
    await page.waitForSelector('.placement-ready');
    assert.equal(await page.$$eval('.token.side-A', es => es.length), 3);
    await click('.placement-ready');
    await page.waitForSelector('.end-turn:not([disabled])');
    assert(await page.$eval('.fight-heading', e => e.textContent.includes('Kanojedo')));
    assert.deepEqual((await saved()).spells, spellbook);
    check('inline launch enters combat with the saved equipment, spells and allied team');
    assert.deepEqual(report.errors, []);
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  } catch (error) {
    report.failure = error.stack; await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
