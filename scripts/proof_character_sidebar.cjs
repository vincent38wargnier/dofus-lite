require('./ai_runtime.cjs');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const puppeteer = require('puppeteer-core');
const { emptyLoadout } = require('../src/engine/equipment');
const { CREATION_SPELLS_BY_ID } = require('../src/ui/creationCatalogue');
const out = process.env.PROOF_DIR || '/tmp/dofus-character-sidebar';
const profile = (id, name, classId, level, base, slots = {}) => ({ id, name, classId, className: classId,
  loadout: { ...emptyLoadout(classId), level, base, slots, spells: { common: [350], order: [350] } } });
const profiles = [profile('iop', 'Iop terre', 'IOP', 200, { force: 300 }, { weapon: 2416 }),
  profile('cra', 'Crâ éclaireur', 'CRA', 150, { agilite: 150 }, { ring1: 2469 }),
  profile('sacri', 'Sacrieur gardien', 'SACRIEUR', 200, { vitalite: 1500 })];
const custom = { id: 'sentinelle', name: 'Sentinelle astrale', classId: 'IOP', loadout: { ...emptyLoadout('IOP'), level: 200,
  spells: { custom: [153,202].map(id => CREATION_SPELLS_BY_ID[id].grades.at(-1)), order: [153,202] } } };
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, pipe: true });
  const page = await browser.newPage(), report = { errors: [], checks: [] };
  page.setDefaultTimeout(30000); page.on('pageerror', e => report.errors.push(e.message));
  const click = async (selector, text = '') => {
    await page.waitForFunction(({ selector, text }) => [...document.querySelectorAll(selector)].some(e => e.checkVisibility() && e.textContent.includes(text) && !e.disabled), {}, { selector, text });
    const handle = await page.evaluateHandle(({ selector, text }) => [...document.querySelectorAll(selector)].find(e => e.checkVisibility() && e.textContent.includes(text)), { selector, text });
    await handle.asElement().click(); await handle.dispose();
  };
  const type = async (selector, value) => { await page.$eval(selector, e => { e.focus(); e.select(); }); await page.keyboard.press('Backspace'); await page.type(selector, value); };
  const store = () => page.evaluate(() => JSON.parse(localStorage.getItem('dofus-lite-profiles-v1')));
  const current = async () => { const s = await store(); return s.profiles.find(p => p.id === s.activeId); };
  const waitName = name => page.waitForFunction(name => document.querySelector('.summary-identity h2')?.textContent === name, {}, name);
  const capture = async name => { await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: path.join(out, `${name}.png`) }); };
  const check = label => { report.checks.push(label); console.log(label); };
  try {
    await page.setViewport({ width: 1480, height: 1000 });
    await page.evaluateOnNewDocument(({ profiles, custom }) => {
      if (localStorage.getItem('character-sidebar-proof')) return;
      localStorage.setItem('character-sidebar-proof', '1');
      localStorage.setItem('dofus-lite-profiles-v1', JSON.stringify({ version: 1, profiles, activeId: 'cra' }));
      localStorage.setItem('dofus-lite-creations-v1', JSON.stringify({ version: 1, characters: [custom], dungeons: [] }));
      localStorage.setItem('dofus-lite-player-setup-v1', JSON.stringify({ mode: 'kanojedo', monsterGrade: 1, mapId: 'canyon' }));
      localStorage.setItem('dofus-lite-sound', JSON.stringify({ enabled: false, volume: 0 }));
    }, { profiles, custom });
    await page.goto(process.env.PROOF_URL || 'http://127.0.0.1:3013', { waitUntil: 'networkidle0' });
    assert.deepEqual(await page.$$eval('.setup-navigation [role="tab"]', es => es.map(e => e.getAttribute('aria-label'))), ['Équipement', 'Caractéristiques', 'Sorts', 'Combat']);
    assert.equal(await page.$eval('.setup-navigation [aria-selected="true"]', e => e.getAttribute('aria-label')), 'Équipement');
    await capture('desktop-sidebar');
    await click('[aria-label="Personnage suivant"]'); await waitName('Sacrieur gardien');
    await click('[aria-label="Personnage suivant"]'); await waitName('Iop terre');
    await click('[aria-label="Personnage précédent"]'); await waitName('Sacrieur gardien');
    await click('[aria-label="Personnage précédent"]'); await waitName('Crâ éclaireur');
    assert.deepEqual((await store()).profiles, profiles);
    await click('.setup-navigation [aria-label="Sorts"]');
    await click('[aria-label="Personnage suivant"]'); await waitName('Sacrieur gardien');
    assert.equal(await page.$eval('.setup-navigation [aria-selected="true"]', e => e.getAttribute('aria-label')), 'Sorts');
    await click('[aria-label="Personnage précédent"]'); await waitName('Crâ éclaireur');
    check('four preparation tabs; sidebar arrows wrap through saved profiles without changing the current tab or their loadouts');
    await click('.summary-character [aria-label="Dupliquer"]'); await waitName('Crâ éclaireur — copie');
    const copied = await current();
    assert.deepEqual(copied.loadout, profiles[1].loadout);
    await click('.summary-edit');
    await type('.character-settings-dialog input', 'Crâ air — test');
    await page.select('.character-settings-dialog [aria-label="Niveau du personnage"]', '190');
    await page.select('.character-settings-dialog select:not([aria-label])', '1');
    await click('.character-settings-dialog button[type="submit"]'); await waitName('Crâ air — test');
    const edited = await current(); assert.equal(edited.loadout.level, 190); assert.equal(edited.loadout.profile.sex, 1);
    assert.deepEqual((await store()).profiles.find(p => p.id === 'cra'), profiles[1]);
    await click('.summary-delete'); await waitName('Iop terre');
    await click('.summary-notice button'); await waitName('Crâ air — test'); assert.deepEqual(await current(), edited);
    await page.reload({ waitUntil: 'networkidle0' }); assert.deepEqual(await current(), edited);
    check('rename, level, appearance, duplicate, delete and undo preserve each full profile and survive reload');
    await click('.summary-new');
    await page.waitForSelector('.new-character-dialog[open]'); await capture('new-character-picker');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('.new-character-dialog'));
    assert.equal(await page.evaluate(() => document.activeElement?.className), 'summary-new');
    await click('.summary-new'); await click('.setup-class[aria-label="Choisir Sacrieur"]'); await waitName('Sacrieur');
    assert.equal((await current()).classId, 'SACRIEUR'); assert.equal((await store()).profiles.length, 5);
    await click('.summary-new'); await click('[data-custom-character-id="sentinelle"]'); await waitName(custom.name);
    assert.deepEqual((await current()).loadout, custom.loadout);
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('dofus-lite-creations-v1')).characters[0]), custom);
    check('plus creates Dofus or custom characters; cancellation restores focus and custom templates remain unchanged');
    await click('.setup-play'); await click('[data-panel-trigger="allies"]');
    await click('.duel-catalogue-heading button', 'Créer un personnage');
    await page.waitForSelector('.new-character-dialog[open]');
    assert.equal(await page.$('.combat-choice[open]'), null);
    await click('.setup-class[aria-label="Choisir Féca"]');
    await page.waitForFunction(() => document.querySelector('.summary-identity h2')?.textContent === 'Féca');
    assert.equal((await current()).classId, 'FECA');
    check('combat team composer still creates a character through the shared picker');
    await click('.summary-new'); await click('.character-custom-heading button', 'Créer une classe');
    await page.waitForSelector('.creator-return-bar');
    await type('.creator-name-row input', 'Gardienne de test');
    await type('.workshop-screen [aria-label="Rechercher dans tous les sorts"]', 'Morsure du Bouftou');
    await click('.creator-spell-results button[aria-label$="(202)"]', 'Ajouter');
    await click('.creator-return-bar button', 'Créer un profil');
    await waitName('Gardienne de test');
    assert.equal((await current()).loadout.spells.custom[0].id, 202);
    check('creating a new custom class in Atelier returns to its new sidebar profile');
    await click('.summary-new'); await page.keyboard.press('Escape');
    // Return to the original Crâ for clear screenshots.
    for (let i = 0; i < 10 && (await current()).id !== 'cra'; i++) {
      const id = (await current()).id;
      await click('[aria-label="Personnage précédent"]');
      await page.waitForFunction(id => document.querySelector('.summary-character')?.dataset.profileId !== id, {}, id);
    }
    await waitName('Crâ éclaireur');
    await capture('desktop-sidebar');
    for (const width of [900, 390, 320]) {
      await page.setViewport({ width, height: 900 });
      await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
      await page.evaluate(() => window.scrollTo(0, 0));
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Overflow ${width}`);
      for (const selector of ['.summary-new', '.summary-delete', '.summary-arrow:first-child', '.summary-arrow:last-child']) {
        assert(await page.$eval(selector, e => { const r = e.getBoundingClientRect(); return r.width >= 24 && r.left >= 0 && r.right <= innerWidth; }), `Control fits ${selector} at ${width}`);
      }
      await click('.summary-new'); await page.waitForSelector('.new-character-dialog[open]');
      assert(await page.$eval('.new-character-dialog', e => e.scrollWidth <= e.clientWidth + 1), `Dialog overflow ${width}`);
      await page.keyboard.press('Escape');
      if (width === 390) await capture('mobile-sidebar');
    }
    check('sidebar controls and creation picker fit desktop, tablet and 390/320-pixel mobile screens');
    assert.deepEqual(report.errors, []);
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
  } catch (error) { await capture('failure'); throw error; }
  finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
