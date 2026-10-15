// Independent author/recipient Chrome storage. Never touches the user's saves.
require('./ai_runtime.cjs');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { inflateRawSync } = require('node:zlib');
const puppeteer = require('puppeteer-core');
const { readContentZip } = require('../src/content/zip');
const { prepareContentFiles } = require('../src/ui/contentPackageImport');
const { prepareWorkshopFile } = require('../src/ui/atelierArchive');
const { newCustomEquipment } = require('../src/engine/customEquipment');
const { emptyLoadout, ITEMS, rolledEffects, resolveLoadout } = require('../src/engine/equipment');
const { createForgedItem } = require('../src/engine/forgedItems');
const out = '/tmp/dofus-adventure-proof', downloads = path.join(out, 'downloads');
let serial = 0;
const newId = () => `adventure-proof-${++serial}`;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const click = async (page, selector, text = '') => {
  await page.waitForFunction(({ selector, text }) => [...document.querySelectorAll(selector)].some(e => e.checkVisibility() && !e.disabled && e.textContent.includes(text)), {}, { selector, text });
  const handle = await page.evaluateHandle(({ selector, text }) => [...document.querySelectorAll(selector)].find(e => e.checkVisibility() && !e.disabled && e.textContent.includes(text)), { selector, text });
  await handle.asElement().click(); await handle.dispose();
};
const saved = page => page.evaluate(() => JSON.parse(localStorage.getItem('dofus-lite-creations-v1')));
const modal = '.combat-choice[open]';
(async () => {
  fs.mkdirSync(downloads, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, pipe: true });
  const report = { checks: [], errors: [] }, check = message => { report.checks.push(message); console.log(message); };
  const pageFor = async context => {
    const page = await context.newPage(); page.setDefaultTimeout(35000); page.on('pageerror', e => report.errors.push(e.message));
    await page.setViewport({ width: 1460, height: 1080 }); await page.goto('http://127.0.0.1:3013', { waitUntil: 'networkidle0' }); return page;
  };
  try {
    const files = await readContentZip(new Uint8Array(fs.readFileSync('public/templates/content-packages/example-class-with-artwork.zip')), packed => new Uint8Array(inflateRawSync(packed)));
    const imported = await prepareContentFiles(files, { newId, verifyPixels: async () => {} });
    const hero = imported.entry; hero.name = 'Sentinelle astrale'; hero.className = 'Gardien des braises';
    const crown = { ...newCustomEquipment(7143), id: 1000008101, name: 'Couronne de la sentinelle', level: 200,
      stats: { intelligence: 40, vitalite: 100 }, appearance: { shape: 'crystal', color: '#378bc2' } };
    hero.loadout.customEquipment = { [crown.id]: crown }; hero.loadout.slots.hat = crown.id;
    hero.loadout.slots.ring1 = 100;
    hero.loadout.forgedItems = { ring1: createForgedItem(ITEMS[100], rolledEffects(ITEMS[100], hero.loadout, 'ring1'), 71) };
    hero.loadout.forgedItems.ring1.stats.pa = 1;
    const scout = { id: 'scout', name: 'Éclaireuse des brumes', classId: 'CRA', className: 'Crâ',
      loadout: { ...emptyLoadout('CRA'), level: 200, profile: { sex: 1 }, base: { intelligence: 200 }, slots: { weapon: 2416 } } };
    const room = { id: 'mist-gate', name: 'La porte des brumes', mapId: 'dungeon_2083', members: [{ monsterId: 494, grade: 1, count: 2 }] };
    assert(resolveLoadout(hero.classId, hero.loadout).valid);
    const records = await Promise.all(imported.records.map(async record => ({ ...record,
      images: Object.fromEntries(await Promise.all(Object.entries(record.images).map(async ([name, blob]) => [name, Buffer.from(await blob.arrayBuffer()).toString('base64')]))) })));
    const author = await pageFor(browser);
    await author.evaluate(async ({ hero, scout, room, records }) => {
      localStorage.setItem('dofus-lite-creations-v1', JSON.stringify({ version: 1, characters: [hero], dungeons: [room] }));
      localStorage.setItem('dofus-lite-profiles-v1', JSON.stringify({ version: 1, activeId: hero.id, profiles: [hero, scout] }));
      await new Promise((resolve, reject) => {
        const req = indexedDB.open('dofus-lite-character-artwork', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('artwork', { keyPath: 'id' }); req.onerror = reject;
        req.onsuccess = () => { const db = req.result, tx = db.transaction('artwork', 'readwrite');
          records.forEach(record => tx.objectStore('artwork').put({ ...record, images: Object.fromEntries(Object.entries(record.images).map(([name, value]) => [name, new Blob([Uint8Array.from(atob(value), c => c.charCodeAt(0))], { type: 'image/png' })])) }));
          tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = reject;
        };
      });
    }, { hero, scout, room, records });
    await author.reload({ waitUntil: 'networkidle0' }); await click(author, '.tabs > button', 'Atelier');
    await click(author, '.studio-editor-tabs button', 'Prêt à jouer');
    await author.click('.adventure-intro input[type="checkbox"]');
    await click(author, '[data-adventure-hero="Sentinelle astrale"] button', 'Ajouter ce héros');
    await click(author, '[data-adventure-hero="Éclaireuse des brumes"] button', 'Ajouter ce héros');
    await author.type('.adventure-author-notes textarea', 'Franchissez la porte avec les héros de la guilde. Leurs armes, leurs sorts et leurs talents sont déjà prêts. À vous de les faire gagner.');
    await click(author, '.adventure-options button', 'Héros au choix');
    await author.$eval('.adventure-add', e => { e.open = false; });
    const snapshot = (await saved(author)).dungeons[0];
    assert.equal(snapshot.adventure.heroes.length, 2); assert.deepEqual(snapshot.adventure.heroes[0].character.loadout, hero.loadout);
    await author.screenshot({ path: path.join(out, 'author.png'), fullPage: true });
    const cdp = await author.createCDPSession(); await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
    for (const name of fs.readdirSync(downloads)) fs.unlinkSync(path.join(downloads, name));
    await click(author, '.adventure-share button', 'Exporter l’aventure');
    let zip;
    for (let i = 0; i < 200; i++) { zip = fs.readdirSync(downloads).find(n => n.endsWith('.zip')); if (zip) break; await delay(100); }
    assert(zip, 'ZIP downloaded'); zip = path.join(downloads, zip);
    const parsed = await prepareWorkshopFile(new File([fs.readFileSync(zip)], 'adventure.zip'), { newId, verifyPixels: async () => {} });
    assert.equal(parsed.characters.length, 0); assert.equal(parsed.equipment.length, 0); assert.equal(parsed.dungeons.length, 1); assert(parsed.records.length > 0);
    check('author enables the option, includes two equipped heroes and exports one self-contained dungeon ZIP');

    const context = await browser.createBrowserContext(), player = await pageFor(context);
    await click(player, '.tabs > button', 'Atelier'); await click(player, '.studio-transfer-tools button', 'Importer');
    await (await player.$('[aria-label="Importer un ZIP Atelier"]')).uploadFile(zip); await player.waitForSelector('.adventure-import-play');
    await player.screenshot({ path: path.join(out, 'import.png') });
    const restored = (await saved(player)).dungeons[0];
    assert.equal((await saved(player)).characters.length, 0);
    assert.deepEqual(restored.adventure.heroes[0].character.loadout.forgedItems, hero.loadout.forgedItems);
    assert.notEqual(restored.adventure.heroes[0].character.loadout.artworkId, hero.loadout.artworkId);
    assert.equal(resolveLoadout(hero.classId, restored.adventure.heroes[0].character.loadout).hp, resolveLoadout(hero.classId, hero.loadout).hp);
    const personal = await player.evaluate(() => localStorage.getItem('dofus-lite-profiles-v1'));
    await click(player, '.adventure-import-play button', 'Jouer l’aventure'); await player.waitForSelector(`${modal} .adventure-lobby`);
    await player.waitForFunction(() => document.querySelector('.combat-choice[open] .adventure-hero img')?.complete);
    await delay(800); await player.screenshot({ path: path.join(out, 'play.png') });
    assert.equal(await player.$$eval(`${modal} .adventure-heroes article`, es => es.length), 2);
    assert.equal(await player.$(`${modal} .combat-settings-button`), null);
    check('fresh browser imports images, spell icons, custom equipment and FM; Play opens the ready adventure directly');
    for (const width of [390, 320]) {
      await player.setViewport({ width, height: 844 }); await delay(150);
      assert(await player.$eval(modal, el => el.scrollWidth <= el.clientWidth + 1), `no horizontal overflow at ${width}`);
      assert(await player.$eval(`${modal} .combat-choice-launch`, el => el.getBoundingClientRect().bottom <= innerHeight), 'launch remains visible');
      if (width === 390) await player.screenshot({ path: path.join(out, 'mobile.png') });
    }
    await player.setViewport({ width: 1460, height: 1080 });
    await click(player, `${modal} [data-adventure-hero="Éclaireuse des brumes"] button`, 'Choisir');
    await click(player, `${modal} .combat-choice-launch`); await player.waitForSelector('.fight-screen .token.side-A');
    assert.equal(await player.$$eval('.play-route .token.side-A', es => es.length), 1);
    assert.equal(await player.$$eval('.play-route .token.side-B', es => es.length), 2);
    await player.screenshot({ path: path.join(out, 'combat.png') });
    assert.equal(await player.evaluate(() => localStorage.getItem('dofus-lite-profiles-v1')), personal);
    check('selected supplied hero fights the packaged enemies on its map without changing the personal profile; mobile 320/390px fits');
    await click(player, '.fight-heading-actions button', 'Préparation');
    await player.reload({ waitUntil: 'networkidle0' }); await click(player, '.setup-play');
    assert(await player.$eval(`${modal} [data-adventure-hero="Éclaireuse des brumes"] button`, el => el.getAttribute('aria-pressed') === 'true'));
    await click(player, `${modal} .combat-control-toggle button`, 'Regarder l’IA'); await click(player, `${modal} .combat-choice-launch`);
    await player.waitForSelector('[data-auto-dungeon]', { timeout: 120000 }); await click(player, '.auto-result-button'); await player.waitForSelector('.auto-result[data-outcome]', { timeout: 120000 });
    report.result = await player.$eval('.auto-result', e => e.textContent);
    assert.equal(await player.evaluate(() => localStorage.getItem('dofus-lite-profiles-v1')), personal);
    check('hero selection survives reload; the same package runs through the automatic combat runner');
    assert.deepEqual(report.errors, []);
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
