// Uses the isolated profile prepared by the library import proof, never the player's browser.
const fs = require('node:fs'), assert = require('node:assert/strict');
const puppeteer = require('puppeteer-core');
const out = '/tmp/arena-world-filter-proof';
const scope = '.combat-choice[open]';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  fs.mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true, pipe: true, userDataDir: '/tmp/arena-world-selection-proof/profile' });
  const page = await browser.newPage();
  const report = { errors: [] };
  page.on('pageerror', error => report.errors.push(error.message));
  page.setDefaultTimeout(40000);
  await page.setViewport({ width: 1480, height: 1000 });
  const click = async text => {
    await page.evaluate(({ scope, text }) => [...document.querySelectorAll(scope + ' button')]
      .find(button => button.innerText.trim() === text && button.getClientRects().length).click(), { scope, text });
  };
  const screenshot = async name => {
    await page.$eval(scope + ' .duel-source-tabs', el => el.scrollIntoView({ block: 'start' }));
    await pause(300); await page.screenshot({ path: `${out}/${name}.png` });
  };
  const preparation = () => page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([key]) =>
    /dofus-lite-(player-setup|profiles|ally-team|opponent-team)-v1$/.test(key))));
  try {
    await page.goto('http://127.0.0.1:3013/#/workspace/play');
    await page.waitForSelector('.player-setup');
    if (!await page.$(scope)) await page.click('.setup-play');
    if (await page.$eval(scope, el => el.dataset.combatPanel) !== 'overview') await click('C’est prêt');
    await page.click(scope + ' [aria-label="Modifier mon équipe"]');
    await click('Monstres');
    const worldSelector = scope + ' .duel-catalogue-filters [aria-label="Monde"]';
    const roomSelector = scope + ' .duel-catalogue-filters [aria-label="Donjon d’origine"]';
    await page.waitForSelector(worldSelector);
    const worlds = await page.$$eval(worldSelector + ' option', options => options.map(o => ({ id: o.value, name: o.text })));
    const dofus = worlds.find(w => w.name.includes('Dofus')), potter = worlds.find(w => w.name.includes('Harry Potter'));
    assert(dofus && potter);
    const before = await preparation();
    await page.select(worldSelector, dofus.id);
    await page.waitForSelector(scope + ' [data-candidate-id="monster:147"]');
    const nativeRooms = await page.$$eval(roomSelector + ' option', options => options.map(o => ({ id: o.value, name: o.text })));
    const bouftous = nativeRooms.find(room => /Bouftous/.test(room.name)); assert(bouftous);
    const adjacent = await page.$eval(scope + ' .duel-catalogue-filters', el => {
      const a = el.querySelector('[aria-label="Monde"]').getBoundingClientRect();
      const b = el.querySelector('[aria-label="Donjon d’origine"]').getBoundingClientRect();
      return { world: { x: a.x, y: a.y }, dungeon: { x: b.x, y: b.y } };
    });
    assert(Math.abs(adjacent.world.y - adjacent.dungeon.y) < 3);
    await screenshot('dofus-world-filter');
    await page.select(roomSelector, bouftous.id);
    await page.select(worldSelector, potter.id);
    assert.equal(await page.$eval(roomSelector, el => el.value), '');
    assert(!await page.$(scope + ' [data-candidate-id="monster:147"]'));
    const importedRooms = await page.$$eval(roomSelector + ' option', options => options.map(o => ({ id: o.value, name: o.text })));
    assert(importedRooms.length > 1);
    assert(importedRooms.slice(1).every(room => room.id.startsWith('custom-dungeon:')));
    await page.select(roomSelector, importedRooms[1].id);
    assert(await page.$(scope + ' .duel-candidate.monster'));
    await screenshot('potter-world-filter');
    await page.setViewport({ width: 390, height: 844 });
    await screenshot('world-filter-mobile');
    assert(await page.$eval(scope, el => el.scrollWidth <= el.clientWidth + 1));
    for (const selector of [worldSelector, roomSelector]) {
      const rect = await page.$eval(selector, el => { const r = el.getBoundingClientRect(); return { x: r.x, right: r.right }; });
      assert(rect.x >= 0 && rect.right <= 390);
    }
    await page.select(worldSelector, 'all');
    assert.equal(await page.$eval(roomSelector, el => el.value), '');
    assert(await page.$(scope + ' [data-candidate-id="monster:147"]'));
    assert(await page.$(scope + ' [data-candidate-id^="monster:creature:"]'));
    assert.deepEqual(await preparation(), before);
    await page.setViewport({ width: 1480, height: 1000 });
    await click('Classes'); await page.select(worldSelector, dofus.id);
    assert(await page.$(scope + ' [data-candidate-id="class:CRA"]'));
    await page.select(worldSelector, potter.id);
    assert(!await page.$(scope + ' [data-candidate-id="class:CRA"]'));
    assert(await page.$(scope + ' [data-candidate-id^="custom:"]'));
    await screenshot('class-world-filter');
    await click('C’est prêt');
    await page.click(scope + ' [data-mode="boss"]');
    await page.click(scope + ' .combat-dungeon-title');
    const dungeonWorld = scope + ' .boss-setup [aria-label="Monde"]';
    await page.select(dungeonWorld, potter.id);
    assert(await page.$(scope + ' .boss-card[data-dungeon-id]'));
    assert(!await page.$(scope + ' .boss-card[data-boss-id]'));
    await page.select(dungeonWorld, dofus.id);
    assert(await page.$(scope + ' .boss-card[data-boss-id="147"]'));
    assert(!await page.$(scope + ' .boss-card[data-dungeon-id]'));
    await click('C’est prêt'); await page.click(scope + ' [data-panel-trigger="map"]');
    await page.select(scope + ' [aria-label="Monde"]', potter.id);
    assert(await page.$(scope + ' .duel-map-card[data-map-id^="custom-free-"]'));
    await click('C’est prêt'); await page.click(scope + ' [aria-label="Fermer le choix du combat"]');
    await page.click('.setup-navigation [aria-label="Équipement"]');
    const equipmentWorld = '.equipment-inventory > .world-filter [aria-label="Monde"]';
    await page.waitForSelector(equipmentWorld);
    await page.select(equipmentWorld, potter.id);
    assert(await page.$('.equipment-inventory [data-personal-kind="created"]'));
    assert.equal(await page.$$eval('.equipment-results [data-item-id]', els => els.length), 0);
    await page.$eval('.equipment-inventory', el => el.scrollIntoView({ block: 'start' }));
    await pause(300); await page.screenshot({ path: `${out}/equipment-world-filter.png` });
    await page.select(equipmentWorld, dofus.id);
    assert((await page.$eval('.equipment-results', el => el.innerText)).trim().length > 0);
    await page.setViewport({ width: 390, height: 844 });
    await page.$eval(equipmentWorld, el => el.scrollIntoView({ block: 'center' }));
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.setViewport({ width: 1480, height: 1000 });
    await page.evaluate(() => [...document.querySelectorAll('.app-header nav button')].find(el => el.innerText.trim() === 'Atelier').click());
    await page.waitForSelector('.workshop-studio');
    const workshopWorld = '.studio-library > .world-filter [aria-label="Monde"]';
    await page.select(workshopWorld, potter.id);
    assert(await page.$('.studio-library-items .studio-library-card'));
    await page.click('.studio-category.characters');
    await page.evaluate(() => [...document.querySelectorAll('.studio-library button')].find(el => el.innerText.includes('Partir d’une classe existante')).click());
    await page.select('.character-dialog[open] [aria-label="Monde"]', dofus.id);
    assert(await page.$('.character-dialog[open] [aria-label="Choisir Cra"]'));
    await page.select('.character-dialog[open] [aria-label="Monde"]', potter.id);
    assert(!await page.$('.character-dialog[open] [aria-label="Choisir Cra"]'));
    assert(await page.$('.character-dialog[open] [data-custom-character-id]'));
    await page.click('.character-dialog[open] [aria-label="Fermer"]');
    await page.click('.studio-category.equipment');
    const creatorWorld = '.equipment-design-library [aria-label="Monde"]';
    await page.waitForSelector(creatorWorld);
    assert.equal(await page.$eval(creatorWorld, el => el.value), potter.id);
    assert(await page.$('.equipment-design-saved-card'));
    await page.$eval('.equipment-design-library', el => el.scrollIntoView({ block: 'start' }));
    await pause(300); await page.screenshot({ path: `${out}/atelier-equipment-world-filter.png` });
    await page.reload(); await page.waitForSelector('.player-setup');
    // The shared filter survives a full page reload, independently of the edited content.
    assert.equal(await page.$eval('.world-filter select', el => el.value), potter.id);
    assert.deepEqual(report.errors, []);
    Object.assign(report, { nativeRooms: nativeRooms.length - 1, importedRooms: importedRooms.length - 1,
      desktopFiltersAdjacent: true, mobileFits: true, mixedWorlds: true, teamUnchanged: true,
      classes: true, dungeons: true, maps: true, equipment: true, classTemplates: true, atelierEquipment: true, remembered: true });
    fs.writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2));
    console.log(report);
  } catch (error) {
    await page.screenshot({ path: `${out}/failure.png` }); throw error;
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
