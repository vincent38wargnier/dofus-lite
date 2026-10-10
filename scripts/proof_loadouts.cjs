// Cross-class equipment, legacy libraries, CRUD, reload and actual combat.
const puppeteer = require('puppeteer-core');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { items } = require('../src/engine/equipmentData.json');
const url = process.env.RETRO_URL || 'http://127.0.0.1:3013';
const out = process.env.PROOF_DIR || '/tmp/dofus-loadout-ui';
const fields = ['slots', 'rollMode', 'rollSeed', 'rollOrigins', 'forgedItems', 'petBonuses'];
const gear = loadout => Object.fromEntries(fields.filter(key => loadout[key] !== undefined).map(key => [key, loadout[key]]));
const character = loadout => Object.fromEntries(['level', 'base', 'profile', 'spells'].map(key => [key, loadout[key]]));
const base = { version: 1, level: 200, base: {}, slots: {}, rollMode: 'max', rollSeed: 1, profile: { sex: 0, alignment: 0, rank: 0 } };
const source = { ...base, base: { force: 200 }, slots: { hat: 2411, weapon: 2416, ring1: 2469, ring2: 9128, pet: 7520 },
  rollMode: 'random', rollSeed: 17, rollOrigins: { ring2: 'ring1' }, petBonuses: { 7520: 213 },
  spells: { common: [350], grades: { 141: 5 }, order: [0, 141, 350] }, forgedItems: { ring1: {
    version: 1, itemId: 2469, stats: { pa: 1, pm: 1 }, baseEffects: items[2469].effects.map(row => ({ row, value: row[1] })),
    puits: 0, rngState: 17, attempts: 1, consumption: {}, history: [],
  } } };
const mobility = { ...base, level: 117, base: { vitalite: 1000 }, slots: { ring1: 2469, dofus1: 6980 }, spells: { common: [367] } };
const cra = { ...base, base: { intelligence: 200 }, profile: { sex: 1, alignment: 0, rank: 0 }, spells: { common: [350, 367], order: [0, 367, 161], grades: { 161: 5 } } };
const sacri = { ...base, level: 180, base: { vitalite: 1000 }, spells: { common: [367], order: [0, 367, 432] } };
const legacy = { version: 1, builds: [
  { id: 'earth', classId: 'IOP', name: 'Terre · exo PM', loadout: source, createdAt: 1, updatedAt: 1 },
  { id: 'mobility', classId: 'SACRIEUR', name: 'Mobilité', loadout: mobility, createdAt: 2, updatedAt: 2 },
], active: { 'A:IOP': 'earth' } };

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, pipe: true });
  const report = { errors: [], checks: [] };
  let page;
  try {
    page = await browser.newPage();
    await page.setViewport({ width: 1500, height: 1000 });
    const cdp = await page.createCDPSession();
    await cdp.send('Page.setDownloadBehavior', { behavior: 'deny' });
    page.on('pageerror', error => report.errors.push(error.message));
    await page.evaluateOnNewDocument(({ legacy, cra, sacri }) => {
      if (!localStorage.getItem('shared-stuffs-proof')) {
        localStorage.setItem('dofus-lite-stuff-library-v1', JSON.stringify(legacy));
        localStorage.setItem('dofus-lite-player-setup-v1', JSON.stringify({ playerClass: 'CRA', mode: 'kanojedo', monsterGrade: 5 }));
        localStorage.setItem('dofus-lite-loadouts-v1', JSON.stringify({ 'A:CRA': cra, 'A:SACRIEUR': sacri, 'B:SACRIEUR': sacri }));
        localStorage.setItem('shared-stuffs-proof', '1');
      }
      const original = URL.createObjectURL;
      URL.createObjectURL = blob => { window.combatExport = blob; return original(blob); };
    }, { legacy, cra, sacri });
    const click = (selector, text = '') => page.evaluate(({ selector, text }) => {
      const e = [...document.querySelectorAll(selector)].find(e => e.checkVisibility() && e.textContent.includes(text));
      if (!e || e.disabled) throw new Error(`Unavailable ${selector}: ${text}`);
      e.click();
    }, { selector, text });
    const handle = selector => page.evaluateHandle(selector => [...document.querySelectorAll(selector)].find(e => e.checkVisibility()), selector);
    const select = async (selector, value) => { const h = await handle(selector); await h.asElement().select(value); await h.dispose(); };
    const fill = async (selector, value) => {
      const h = await handle(selector); await h.asElement().focus(); await h.asElement().evaluate(e => e.select());
      await page.keyboard.press('Backspace'); if (value) await h.asElement().type(value); await h.dispose();
    };
    const lib = () => page.evaluate(() => JSON.parse(localStorage.getItem('dofus-lite-stuff-library-v1')));
    const drafts = () => page.evaluate(() => JSON.parse(localStorage.getItem('dofus-lite-loadouts-v1')));
    const classId = () => page.evaluate(() => JSON.parse(localStorage.getItem('dofus-lite-player-setup-v1')).playerClass);
    const quick = id => select('[aria-label="Charger un stuff"]', id);
    const cardClick = (id, text) => click(`[data-build-id="${id}"] button`, text);
    const namedSave = async name => {
      await click('.stuff-save-actions button', 'Enregistrer sous');
      await fill('[aria-label="Nom du stuff"]', name); await click('.stuff-name-form button[type="submit"]');
      return (await lib()).builds.find(b => b.name === name);
    };
    await page.goto(url, { waitUntil: 'networkidle0' });
    await click('.stuff-library-toggle');
    assert.equal(await page.$$eval('.stuff-card', cards => cards.filter(e => e.checkVisibility()).length), 2);
    assert.equal(await page.$('[aria-label="Classes de la bibliothèque"]'), null);
    const preview = await page.$eval('[data-build-id="earth"] .stuff-card-totals', e => e.textContent);
    await cardClick('earth', 'Charger ce stuff');
    assert.equal(await classId(), 'CRA');
    assert.deepEqual(character((await drafts())['A:CRA']), character(cra));
    assert.deepEqual(gear((await drafts())['A:CRA']), gear(source));
    assert.deepEqual((await drafts())['B:SACRIEUR'], sacri);
    assert.deepEqual((await lib()).builds, legacy.builds);
    const totals = await page.$$eval('.summary-vitals strong', elements => elements.map(e => Number(e.textContent)));
    assert.match(preview, new RegExp(`${totals[0]} PV`));
    assert.equal(totals[1], 8); assert.equal(totals[2], 4);
    await click('.stuff-notice button', 'Annuler l’action');
    assert.deepEqual((await drafts())['A:CRA'], cra);
    await quick('earth');
    assert.deepEqual(gear((await drafts())['A:CRA']), gear(source));
    await page.reload({ waitUntil: 'networkidle0' });
    assert.equal(await classId(), 'CRA');
    assert.deepEqual(character((await drafts())['A:CRA']), character(cra));
    assert.deepEqual(gear((await drafts())['A:CRA']), gear(source));
    report.checks.push('legacy Iop equipment on Cra', 'exo PM and random jets', 'preview matches equipped totals', 'undo', 'reload');

    await click('.setup-navigation button', 'Stuff');
    await select('[aria-label="Qualité des jets"]', 'max');
    await click('.stuff-save-actions button', 'Mettre à jour');
    let library = await lib();
    assert.equal(library.builds.find(b => b.id === 'earth').classId, undefined);
    assert.equal(library.builds.find(b => b.id === 'earth').loadout.rollMode, 'max');
    assert.deepEqual(library.builds.find(b => b.id === 'mobility'), legacy.builds[1]);
    assert.deepEqual(library.builds.find(b => b.id === 'earth').loadout.spells, source.spells);
    const shared = await namedSave('Terre partagée');
    assert(shared); assert.equal(shared.classId, undefined);
    assert.equal(shared.loadout.level, undefined); assert.equal(shared.loadout.spells, undefined);
    assert.deepEqual(shared.loadout.base, {});
    assert.deepEqual(shared.loadout.forgedItems, source.forgedItems);
    await click('.stuff-library-toggle');
    await cardClick(shared.id, 'Dupliquer');
    const copy = (await lib()).builds.find(b => b.name === 'Terre partagée — copie');
    assert(copy); assert.deepEqual(copy.loadout, shared.loadout);
    await cardClick(copy.id, 'Renommer');
    await fill('[aria-label="Nom du stuff"]', 'Variante terre'); await click('.stuff-name-form button[type="submit"]');
    await cardClick(copy.id, 'Supprimer');
    await click('.stuff-notice button', 'Annuler l’action');
    assert.equal((await lib()).builds.find(b => b.id === copy.id).name, 'Variante terre');
    await cardClick(copy.id, 'Supprimer');
    await fill('[aria-label="Rechercher un stuff"]', 'partagee');
    assert.equal(await page.$$eval('.stuff-card', cards => cards.filter(e => e.checkVisibility()).length), 1);
    await fill('[aria-label="Rechercher un stuff"]', '');
    await page.$eval('.stuff-library', e => e.scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: `${out}/shared-stuffs-cra.png` });
    report.checks.push('update from another class', 'new class-free snapshot', 'rename', 'duplicate', 'delete and undo', 'accent-insensitive search');

    await page.setViewport({ width: 390, height: 844 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await (await handle('.stuff-library')).asElement().screenshot({ path: `${out}/shared-stuffs-mobile.png` });
    await page.setViewport({ width: 1500, height: 1000 });
    await click('.setup-navigation button', 'Personnage');
    await click('[aria-label="Choisir Sacrieur"]');
    await quick(shared.id);
    assert.equal(await classId(), 'SACRIEUR');
    assert.deepEqual(character((await drafts())['A:SACRIEUR']), character(sacri));
    assert.deepEqual(gear((await drafts())['A:SACRIEUR']), gear(shared.loadout));
    const player = (await drafts())['A:SACRIEUR'];
    await click('.setup-navigation button', 'Combat');
    await click('.setup-play');
    await page.waitForSelector('.placement-ready');
    if (!await page.$('.fight-log')) await click('.fight-heading-actions button', 'Journal');
    await click('.combat-log-heading button', 'Exporter');
    const combat = await page.evaluate(async () => JSON.parse(await window.combatExport.text()));
    assert.equal(combat.state.fighters.A.classId, 'SACRIEUR');
    assert.deepEqual(combat.state.fighters.A.loadout, player);
    assert.equal(combat.state.fighters.A.basePm, 4);
    assert.equal(combat.state.fighters.A.stats.vitalite >= 1101, true);
    await page.screenshot({ path: `${out}/shared-stuff-combat.png` });
    report.checks.push('same saved stuff on Sacrieur', 'actual combat equipment and class');
    await click('.fight-heading-actions button', 'Préparation');
    await click('.tools-menu summary'); await click('.tools-dropdown button', 'Arène');
    const classB = await page.evaluateHandle(() => [...document.querySelectorAll('label')].find(e => e.checkVisibility() && e.textContent.trim().startsWith('Classe B')).querySelector('select'));
    await classB.asElement().select('SACRIEUR'); await classB.dispose();
    await click('.loadout-side.side-B');
    await quick(shared.id);
    assert.deepEqual(character((await drafts())['B:SACRIEUR']), character(sacri));
    assert.deepEqual(gear((await drafts())['B:SACRIEUR']), gear(shared.loadout));
    assert.deepEqual((await drafts())['A:SACRIEUR'], player);
    report.checks.push('shared Arena library', 'opponent gear with unchanged class and character', 'no mobile overflow');
    assert.deepEqual(report.errors, []);
    report.passed = true;
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    report.error = error.message;
    if (page) await page.screenshot({ path: `${out}/failure.png`, fullPage: true }).catch(() => {});
    throw error;
  } finally {
    fs.writeFileSync(`${out}/proof.json`, JSON.stringify(report, null, 2));
    const child = browser.process(); await browser.disconnect(); child?.kill('SIGTERM');
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
