require('./ai_runtime.cjs');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { inflateRawSync } = require('node:zlib');
const puppeteer = require('puppeteer-core');
const { readContentZip } = require('../src/content/zip');
const { prepareContentFiles } = require('../src/ui/contentPackageImport');
const { prepareWorkshopFile } = require('../src/ui/atelierArchive');
const { compileContentManifest, packageExample } = require('../src/content/contentPackage');
const { newCustomEquipment, fitEquipmentBudget } = require('../src/engine/customEquipment');
const { ITEMS, rolledEffects } = require('../src/engine/equipment');
const { createForgedItem } = require('../src/engine/forgedItems');
const { CREATION_SPELLS } = require('../src/ui/creationCatalogue');
const out = '/tmp/dofus-atelier-export', downloads = path.join(out, 'downloads');
let serial = 0;
const newId = () => `export-proof-${++serial}`;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  fs.mkdirSync(downloads, { recursive: true });
  for (const name of fs.readdirSync(downloads)) fs.unlinkSync(path.join(downloads, name));
  const template = await readContentZip(new Uint8Array(fs.readFileSync('public/templates/content-packages/example-class-with-artwork.zip')), packed => new Uint8Array(inflateRawSync(packed)));
  const imported = await prepareContentFiles(template, { newId, verifyPixels: async () => {} });
  const hero = imported.entry; hero.name = 'Sentinelle astrale';
  const second = compileContentManifest(packageExample('class'), { newId }).entry;
  second.name = 'Gardienne des aurores'; second.loadout.artworkId = 'shape-v1-warden-378bc2';
  second.loadout.spells.custom.push(CREATION_SPELLS.find(spell => spell.id === 142).grades.at(-1));
  const dungeon = compileContentManifest(packageExample('dungeon'), { newId }).entry;
  dungeon.name = 'La citadelle des braises'; dungeon.members[0].customMonster.artworkId = hero.loadout.artworkId;
  const items = [{ ...newCustomEquipment(7143), id: 1000008001, name: 'Couronne astrale', level: 200,
    stats: { intelligence: 30, vitalite: 100 }, appearance: { shape: 'crystal', color: '#378bc2' } },
    { ...fitEquipmentBudget(newCustomEquipment(3652)), id: 1000008002, name: 'Marteau des braises', level: 200 }];
  hero.loadout.slots.hat = items[0].id; hero.loadout.customEquipment = { [items[0].id]: items[0] };
  hero.loadout.slots.ring1 = 153;
  hero.loadout.forgedItems = { ring1: createForgedItem(ITEMS[153], rolledEffects(ITEMS[153], hero.loadout, 'ring1'), 71) };
  hero.loadout.forgedItems.ring1.stats.pa = 1;
  const seed = { version: 1, characters: [hero, second], dungeons: [dungeon] };
  const records = await Promise.all(imported.records.map(async record => {
    const images = await Promise.all(Object.entries(record.images).map(async ([name, blob]) => [name, Buffer.from(await blob.arrayBuffer()).toString('base64')]));
    return { ...record, images: Object.fromEntries(images) };
  }));
  const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, pipe: true });
  const report = { checks: [], errors: [] };
  const check = text => { report.checks.push(text); console.log(text); };
  const click = async (page, selector, text = '') => {
    await page.waitForFunction(({ selector, text }) => [...document.querySelectorAll(selector)].some(e => e.checkVisibility() && !e.disabled && e.textContent.includes(text)), {}, { selector, text });
    const handle = await page.evaluateHandle(({ selector, text }) => [...document.querySelectorAll(selector)].find(e => e.checkVisibility() && !e.disabled && e.textContent.includes(text)), { selector, text });
    await handle.asElement().click(); await handle.dispose();
  };
  const state = page => page.evaluate(() => ({ creations: JSON.parse(localStorage.getItem('dofus-lite-creations-v1')), equipment: JSON.parse(localStorage.getItem('dofus-lite-custom-equipment-v1')) }));
  const upload = async (page, name) => { const input = await page.$('[aria-label="Importer un ZIP Atelier"]'); await input.uploadFile(name); };
  const input = async (page, selector, value) => { await page.$eval(selector, e => { e.focus(); e.select(); }); await page.keyboard.press('Backspace'); await page.type(selector, value); };
  const downloaded = async name => {
    for (let i = 0; i < 300; i++) { const target = path.join(downloads, `${name}.zip`); if (fs.existsSync(target)) return target; await delay(100); }
    throw new Error(`Download missing: ${name}`);
  };
  const setupPage = async context => {
    const page = await context.newPage(); page.setDefaultTimeout(30000);
    page.on('pageerror', e => report.errors.push(e.message)); await page.setViewport({ width: 1440, height: 1050 });
    await page.goto('http://127.0.0.1:3013', { waitUntil: 'networkidle0' }); return page;
  };
  try {
    const page = await setupPage(browser);
    await page.evaluate(async ({ seed, items, records }) => {
      localStorage.setItem('dofus-lite-creations-v1', JSON.stringify(seed));
      localStorage.setItem('dofus-lite-custom-equipment-v1', JSON.stringify({ version: 1, items }));
      await new Promise((resolve, reject) => {
        const request = indexedDB.open('dofus-lite-character-artwork', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('artwork', { keyPath: 'id' });
        request.onerror = reject;
        request.onsuccess = () => {
          const db = request.result, tx = db.transaction('artwork', 'readwrite');
          for (const record of records) tx.objectStore('artwork').put({ ...record, images: Object.fromEntries(Object.entries(record.images).map(([name, encoded]) => [name,
            new Blob([Uint8Array.from(atob(encoded), x => x.charCodeAt(0))], { type: 'image/png' })])) });
          tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = reject;
        };
      });
    }, { seed, items, records });
    await page.reload({ waitUntil: 'networkidle0' }); await click(page, '.tabs > button', 'Atelier');
    const cdp = await page.createCDPSession(); await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
    await click(page, '.studio-transfer-tools button', 'Exporter');
    assert.equal(await page.$$eval('.atelier-export-card input:checked', nodes => nodes.length), 5);
    await click(page, '.atelier-transfer-toolbar button', 'Tout désélectionner');
    assert(await page.$eval('.atelier-transfer-dialog footer button', e => e.disabled));
    await input(page, '[aria-label="Rechercher les créations à exporter"]', 'Sentinelle');
    await click(page, '.atelier-export-card');
    await input(page, '[aria-label="Rechercher les créations à exporter"]', '');
    assert.equal(await page.$$eval('.atelier-export-card input:checked', nodes => nodes.length), 1);
    await click(page, '.atelier-transfer-toolbar button', 'Tout sélectionner');
    await page.screenshot({ path: path.join(out, 'export-selection.png') });
    await click(page, '.atelier-transfer-dialog footer button', 'Télécharger');
    const fullZip = await downloaded('atelier-5-creations');
    const parsed = await prepareWorkshopFile(new File([fs.readFileSync(fullZip)], 'export.zip'), { newId, verifyPixels: async () => {} });
    assert.equal(parsed.characters.length, 2); assert.equal(parsed.dungeons.length, 1); assert.equal(parsed.equipment.length, 2);
    assert.deepEqual(parsed.characters[0].loadout.forgedItems, hero.loadout.forgedItems);
    assert(parsed.records.length >= 2); check('mixed export: selection, search retention, actual download, images, custom spells, equipment and FM');
    await click(page, '.character-dialog-close');
    await click(page, '[aria-label="Exporter la création"]'); await downloaded('La-citadelle-des-braises');
    await click(page, '.studio-categories button', 'Mes classes'); await click(page, '[aria-label="Exporter la création"]');
    await downloaded('Sentinelle-astrale'); check('one-click export of the current class and dungeon');
    await click(page, '.studio-categories button', 'Mes équipements');
    await click(page, '.equipment-design-saved-card', 'Couronne astrale');
    await input(page, '.equipment-design-identity input', 'Couronne dernière version');
    await click(page, '[aria-label="Exporter cet équipement"]');
    const draftZip = await downloaded('Couronne-derniere-version');
    const draft = await prepareWorkshopFile(new File([fs.readFileSync(draftZip)], 'draft.zip'), { newId, verifyPixels: async () => {} });
    assert.equal(draft.equipment[0].name, 'Couronne dernière version');
    assert.equal((await state(page)).equipment.items[0].name, 'Couronne astrale');
    check('single equipment export includes the current draft without overwriting the saved item');
    await click(page, '.studio-transfer-tools button', 'Importer'); await upload(page, fullZip);
    await page.waitForSelector('.atelier-import-result');
    const after = await state(page);
    assert.equal(after.creations.characters.length, 4); assert.equal(after.equipment.items.length, 4);
    assert.deepEqual(after.creations.characters.slice(0, 2), seed.characters);
    assert.equal(new Set(after.creations.characters.map(c => c.id)).size, 4);
    await click(page, '.character-dialog-close');
    await page.reload({ waitUntil: 'networkidle0' });
    assert.deepEqual(await state(page), after); check('reimport creates independent copies, preserves originals and survives reload');

    const freshContext = await browser.createBrowserContext(), fresh = await setupPage(freshContext);
    await click(fresh, '.tabs > button', 'Atelier'); await click(fresh, '.studio-transfer-tools button', 'Importer');
    await upload(fresh, fullZip); await fresh.waitForSelector('.atelier-import-result');
    await fresh.screenshot({ path: path.join(out, 'import-success.png') });
    await click(fresh, '.atelier-import-result button', 'Ouvrir classes');
    await fresh.waitForFunction(() => [...document.querySelectorAll('.studio-editor-portrait img')].some(img => img.src.startsWith('blob:') && img.complete && img.naturalWidth > 0));
    const saved = await state(fresh);
    assert.equal(saved.creations.characters.length, 2); assert.equal(saved.creations.dungeons.length, 1); assert.equal(saved.equipment.items.length, 2);
    await fresh.reload({ waitUntil: 'networkidle0' }); assert.deepEqual(await state(fresh), saved);
    check('fresh browser imports all types with real PNG validation and working portraits after reload');
    await click(fresh, '.tabs > button', 'Atelier'); await click(fresh, '.studio-transfer-tools button', 'Importer');
    fs.writeFileSync(path.join(out, 'bad.zip'), 'not a zip'); await upload(fresh, path.join(out, 'bad.zip'));
    await fresh.waitForSelector('.atelier-import-dialog [role="alert"]');
    assert.deepEqual(await state(fresh), saved); check('invalid ZIP leaves both libraries unchanged');
    await click(fresh, '.character-dialog-close');
    for (const width of [390, 320]) {
      await fresh.setViewport({ width, height: 844 });
      await fresh.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert(await fresh.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Atelier overflow at ${width}`);
      await click(fresh, '.studio-transfer-tools button', 'Exporter');
      assert(await fresh.$eval('.atelier-transfer-dialog', dialog => dialog.scrollWidth <= dialog.clientWidth + 1), `Export overflow at ${width}`);
      assert(await fresh.$eval('.atelier-transfer-dialog footer button', button => { const r = button.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }), `Download hidden at ${width}`);
      if (width === 390) await fresh.screenshot({ path: path.join(out, 'export-mobile.png') });
      await click(fresh, '.character-dialog-close');
      await click(fresh, '.studio-transfer-tools button', 'Importer');
      assert(await fresh.$eval('.atelier-transfer-dialog', dialog => dialog.scrollWidth <= dialog.clientWidth + 1), `Import overflow at ${width}`);
      await click(fresh, '.character-dialog-close');
    }
    check('export and import remain usable at 390px and 320px without horizontal overflow');
    assert.deepEqual(report.errors, []);
  } catch (error) { report.failure = error.stack; throw error; }
  finally { fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
