// Isolated browser profiles only: never reads or modifies the player's saves.
require('./ai_runtime.cjs');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { inflateRawSync } = require('node:zlib');
const puppeteer = require('puppeteer-core');
const { readContentZip } = require('../src/content/zip');
const { prepareContentFiles } = require('../src/ui/contentPackageImport');
const { prepareWorkshopFile } = require('../src/ui/atelierArchive');
const { emptyLoadout, ITEMS, rolledEffects, resolveLoadout } = require('../src/engine/equipment');
const { newCustomEquipment } = require('../src/engine/customEquipment');
const { createForgedItem } = require('../src/engine/forgedItems');
const { customDungeonErrors, customDungeonRoster } = require('../src/engine/customDungeons');
const out = '/tmp/dofus-dungeon-characters', downloads = path.join(out, 'downloads');
let serial = 0;
const newId = () => `dungeon-character-proof-${++serial}`;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  fs.mkdirSync(downloads, { recursive: true });
  const template = await readContentZip(fs.readFileSync('public/templates/content-packages/example-class-with-artwork.zip'), b => new Uint8Array(inflateRawSync(b)));
  const imported = await prepareContentFiles(template, { newId, verifyPixels: async () => {} });
  const hero = imported.entry; hero.name = 'Gardienne astrale';
  const hat = { ...newCustomEquipment(7143), name: 'Couronne des astres', level: 200,
    stats: { intelligence: 30, vitalite: 100 }, appearance: { shape: 'crystal', color: '#378bc2' } };
  hero.loadout.slots = { hat: hat.id, ring1: 2469, weapon: 2416 };
  hero.loadout.customEquipment = { [hat.id]: hat };
  hero.loadout.forgedItems = { ring1: createForgedItem(ITEMS[2469], rolledEffects(ITEMS[2469], hero.loadout, 'ring1'), 71) };
  hero.loadout.forgedItems.ring1.stats.pm = 1;
  assert.deepEqual(resolveLoadout(hero.classId, hero.loadout).errors, []);
  const guardian = { id: 'profile-guardian', name: hero.name, className: 'Gardien astral', classId: hero.classId, customCharacterId: hero.id, loadout: hero.loadout };
  const archer = { id: 'profile-archer', name: 'Archère du bosquet', className: 'Crâ', classId: 'CRA', customCharacterId: null,
    loadout: { ...emptyLoadout('CRA'), level: 200, profile: { sex: 1 }, base: { intelligence: 80 }, slots: { weapon: 2416 } } };
  const alternate = { ...JSON.parse(JSON.stringify(hero)), id: 'class-warden', name: 'Sentinelle des brumes',
    loadout: { ...JSON.parse(JSON.stringify(hero.loadout)), artworkId: 'shape-v1-warden-378bc2' } };
  const profiles = { version: 1, activeId: archer.id, profiles: [guardian, archer] };
  const records = await Promise.all(imported.records.map(async record => ({ ...record, images: Object.fromEntries(
    await Promise.all(Object.entries(record.images).map(async ([name, blob]) => [name, Buffer.from(await blob.arrayBuffer()).toString('base64')])) ) })));
  const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, pipe: true });
  const report = { checks: [], errors: [] };
  const check = message => { report.checks.push(message); console.log(message); };
  const click = async (page, selector, text = '') => {
    await page.waitForFunction(({ selector, text }) => [...document.querySelectorAll(selector)].some(e => e.checkVisibility() && !e.disabled && e.textContent.includes(text)), {}, { selector, text });
    const handle = await page.evaluateHandle(({ selector, text }) => [...document.querySelectorAll(selector)].find(e => e.checkVisibility() && !e.disabled && e.textContent.includes(text)), { selector, text });
    await handle.asElement().click(); await handle.dispose();
  };
  const input = async (page, selector, value) => { await page.$eval(selector, e => { e.focus(); e.select(); }); await page.keyboard.press('Backspace'); await page.type(selector, value); };
  const saved = page => page.evaluate(() => JSON.parse(localStorage.getItem('dofus-lite-creations-v1')));
  const setup = async context => {
    const page = await context.newPage(); page.setDefaultTimeout(40000); page.on('pageerror', error => report.errors.push(error.message));
    await page.setViewport({ width: 1680, height: 1150 });
    await page.goto('http://127.0.0.1:3013', { waitUntil: 'networkidle0' }); return page;
  };
  const shot = async (page, name) => {
    await page.evaluate(() => { document.activeElement?.blur(); const e = document.querySelector('.studio-heading'); window.scrollTo(0, e ? e.getBoundingClientRect().top + scrollY - 20 : 0); });
    await page.screenshot({ path: path.join(out, `${name}.png`) });
  };
  try {
    const page = await setup(browser);
    await page.evaluate(async ({ profiles, characters, hat, records }) => {
      localStorage.setItem('dofus-lite-profiles-v1', JSON.stringify(profiles));
      localStorage.setItem('dofus-lite-creations-v1', JSON.stringify({ version: 1, characters, dungeons: [] }));
      localStorage.setItem('dofus-lite-custom-equipment-v1', JSON.stringify({ version: 1, items: [hat] }));
      localStorage.setItem('dofus-lite-sound', JSON.stringify({ enabled: false, volume: 0 }));
      await new Promise((resolve, reject) => {
        const request = indexedDB.open('dofus-lite-character-artwork', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('artwork', { keyPath: 'id' });
        request.onerror = reject;
        request.onsuccess = () => { const db = request.result, tx = db.transaction('artwork', 'readwrite');
          for (const record of records) tx.objectStore('artwork').put({ ...record, images: Object.fromEntries(Object.entries(record.images).map(([name, encoded]) => [name,
            new Blob([Uint8Array.from(atob(encoded), x => x.charCodeAt(0))], { type: 'image/png' })])) });
          tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = reject;
        };
      });
    }, { profiles, characters: [hero, alternate], hat, records });
    await page.reload({ waitUntil: 'networkidle0' }); await click(page, '.tabs > button', 'Atelier');
    await click(page, '.studio-new', 'Nouveau donjon'); await input(page, '[aria-label="Nom du donjon"]', 'Les gardiens du bosquet');
    await click(page, '.studio-editor-tabs button', 'Terrain'); await click(page, '[data-map-id="dungeon_2083"]');
    await click(page, '.dungeon-catalogue-tabs button', 'Mes personnages');
    await page.waitForFunction(() => document.querySelector('[data-dungeon-character="profile-guardian"] img')?.naturalWidth > 0);
    const source = await page.$('[data-dungeon-character="profile-guardian"] .creator-monster-heading'); await source.scrollIntoView();
    const box = await source.boundingBox(), target = await page.$eval('.creator-roster-dropzone', e => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + 60 }; });
    await page.setDragInterception(true); await page.mouse.dragAndDrop({ x: box.x + 75, y: box.y + 20 }, target, { delay: 160 }); await page.setDragInterception(false);
    assert.equal((await saved(page)).dungeons[0].members[0].character.name, guardian.name);
    await click(page, '[aria-label="Ajouter Archère du bosquet au donjon"]');
    await click(page, '.dungeon-catalogue-tabs button', 'Mes classes');
    await click(page, '[aria-label="Ajouter Sentinelle des brumes au donjon"]');
    await click(page, '.dungeon-catalogue-tabs button', 'Monstres');
    await input(page, '.creator-monster-filters input[type="search"]', 'Poutch');
    await page.select('[aria-label="Niveau proposé pour Poutch Ingball"]', '1'); await click(page, '[aria-label="Ajouter Poutch Ingball"]');
    await click(page, '.dungeon-catalogue-tabs button', 'Mes personnages');
    const dungeon = (await saved(page)).dungeons[0];
    assert.equal(dungeon.members.length, 4); assert.deepEqual(customDungeonErrors(dungeon), []);
    assert.deepEqual(dungeon.members[0].character.loadout, hero.loadout);
    await click(page, '[data-room-character="Gardienne astrale"] summary');
    const details = await page.$eval('[data-room-character="Gardienne astrale"] .dungeon-character-details', e => e.textContent);
    assert(details.includes('Braise vive') && details.includes('Couronne des astres') && details.includes('Gelano') && details.includes('FM'));
    await shot(page, 'dungeon-characters');
    check('real drag of a saved profile, add a native-class profile and custom class, mix with a monster, inspect all copied equipment and spells');

    // Removing the original libraries must not alter the room's copied character.
    await page.evaluate(() => {
      const key = 'dofus-lite-creations-v1', content = JSON.parse(localStorage.getItem(key)); content.characters = [];
      localStorage.setItem(key, JSON.stringify(content));
      const profiles = JSON.parse(localStorage.getItem('dofus-lite-profiles-v1'));
      profiles.profiles = profiles.profiles.filter(p => p.id === 'profile-archer');
      profiles.profiles[0].loadout.base.intelligence = 120;
      localStorage.setItem('dofus-lite-profiles-v1', JSON.stringify(profiles));
      localStorage.removeItem('dofus-lite-custom-equipment-v1');
    });
    await page.reload({ waitUntil: 'networkidle0' }); await click(page, '.tabs > button', 'Atelier');
    assert.deepEqual((await saved(page)).dungeons[0], dungeon);
    check('source profiles/classes/items can change or disappear; the saved room retains exact independent snapshots after reload');
    const cdp = await page.createCDPSession(); await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
    const zipPath = path.join(downloads, 'Les-gardiens-du-bosquet.zip'); if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
    await click(page, '[aria-label="Exporter la création"]');
    for (let i = 0; i < 300 && !fs.existsSync(zipPath); i++) await delay(100);
    assert(fs.existsSync(zipPath), 'actual dungeon ZIP download');
    const parsed = await prepareWorkshopFile(new File([fs.readFileSync(zipPath)], 'room.zip'), { newId, verifyPixels: async () => {} });
    assert.equal(parsed.characters.length, 0); assert.equal(parsed.equipment.length, 0); assert.equal(parsed.dungeons.length, 1);
    assert.equal(parsed.records.length, 2); assert.equal(Object.keys(parsed.records[0].images).length, 9);
    assert(parsed.records.some(r => r.images['icons/ember.png']));
    assert.deepEqual(customDungeonErrors(parsed.dungeons[0]), []);
    check('dungeon-only ZIP includes nested custom item, FM, all 9 character sheets and the separate custom spell icon');

    const freshContext = await browser.createBrowserContext(), fresh = await setup(freshContext);
    assert.deepEqual((await saved(fresh))?.dungeons || [], []); assert.deepEqual((await saved(fresh))?.characters || [], []);
    await click(fresh, '.tabs > button', 'Atelier'); await click(fresh, '.studio-transfer-tools button', 'Importer');
    const file = await fresh.$('[aria-label="Importer un ZIP Atelier"]'); await file.uploadFile(zipPath);
    await fresh.waitForSelector('.atelier-import-result'); await click(fresh, '.atelier-import-result button', 'Ouvrir donjons');
    await fresh.waitForFunction(() => [...document.querySelectorAll('[data-room-character="Gardienne astrale"] img')].some(img => img.src.startsWith('blob:') && img.naturalWidth > 0));
    const after = await saved(fresh), npc = after.dungeons[0].members[0].character;
    assert.equal(after.characters.length, 0); assert.equal(after.dungeons.length, 1);
    assert.deepEqual(customDungeonErrors(after.dungeons[0]), []);
    assert.deepEqual(npc.loadout.forgedItems, hero.loadout.forgedItems);
    assert.deepEqual(resolveLoadout(npc.classId, npc.loadout).stats, resolveLoadout(hero.classId, hero.loadout).stats);
    assert.notEqual(npc.loadout.artworkId, hero.loadout.artworkId);
    assert.notEqual(npc.loadout.spells.custom[0].iconArtworkId, hero.loadout.spells.custom[0].iconArtworkId);
    assert.notEqual(npc.loadout.slots.hat, hero.loadout.slots.hat);
    await fresh.reload({ waitUntil: 'networkidle0' }); assert.deepEqual(await saved(fresh), after);
    await click(fresh, '.tabs > button', 'Atelier');
    await click(fresh, '[data-room-character="Gardienne astrale"] summary'); await shot(fresh, 'fresh-import');
    check('fresh browser validates/imports the ZIP, remaps assets and custom items, keeps exact stats and FM, and reloads without source libraries');
    for (const width of [390, 320]) {
      await fresh.setViewport({ width, height: 980 }); await fresh.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await click(fresh, '.dungeon-catalogue-tabs button', 'Mes personnages');
      assert(await fresh.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `No horizontal overflow at ${width}`);
      if (width === 390) await shot(fresh, 'mobile');
    }
    check('embedded character details and catalogue fit 390px and 320px screens');
    await fresh.setViewport({ width: 1440, height: 1050 });
    await click(fresh, '.tabs > button', 'Jouer'); await click(fresh, '.setup-play');
    await click(fresh, '.combat-choice-modes button', 'Donjon'); await click(fresh, '.combat-choice [data-panel-trigger="dungeons"]');
    await click(fresh, '.combat-choice .source-filters button', 'Personnalisés');
    await click(fresh, `.combat-choice [data-dungeon-id="${after.dungeons[0].id}"]`);
    await click(fresh, '.combat-choice-done');
    const preview = await fresh.$eval('.combat-choice .combat-team-preview.enemies', e => e.textContent);
    for (const name of [guardian.name, archer.name, alternate.name, 'Poutch Ingball']) assert(preview.includes(name));
    await click(fresh, '.combat-choice-launch'); await fresh.waitForSelector('.placement-ready');
    assert.equal(await fresh.$$eval('.token.side-B', es => es.length), 4);
    await fresh.waitForFunction(() => document.querySelector('.token[data-fighter-id="B"] .custom-character-sprite')?.style.backgroundImage.includes('blob:'));
    await shot(fresh, 'fight'); await click(fresh, '.placement-ready'); await fresh.waitForSelector('.spell-slot');
    await click(fresh, '.fight-heading-actions button', 'Abandonner');
    check('standard Combat selection previews every mixed member and launches the imported room on its own map with 4 rendered opponents');
    await click(fresh, '.tabs > button', 'Atelier'); await click(fresh, '.studio-editor-actions button', 'Tester');
    await fresh.waitForSelector('.combat-choice[open]');
    await click(fresh, '.combat-choice .combat-control-toggle button', 'Tout en IA');
    await click(fresh, '.combat-choice-launch');
    await fresh.waitForSelector('[data-auto-dungeon]', { timeout: 120000 });
    await click(fresh, '.auto-result-button'); await fresh.waitForSelector('.auto-result[data-outcome]');
    report.outcome = await fresh.$eval('.auto-result', e => e.textContent);
    assert(report.outcome.includes('combattants vaincus'));
    await click(fresh, '.fight-heading-actions button', 'Retour à Combat');
    await click(fresh, '.tabs > button', 'Atelier');
    check('Tester opens the shared combat menu; automatic combat completes in the fresh browser with default AI for each copied character');
    assert.deepEqual(report.errors, []);
    report.roster = customDungeonRoster(after.dungeons[0]).map(f => ({ name: f.name, classId: f.classId, monsterId: f.monsterId }));
  } catch (error) { report.failure = error.stack; for (const page of await browser.pages()) if (page.url().startsWith('http')) await page.screenshot({ path: path.join(out, `failure-${Date.now()}.png`) }).catch(() => {}); throw error; }
  finally { fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
