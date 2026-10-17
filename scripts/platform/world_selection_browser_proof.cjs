// Exercises public play links and cross-world composition in an isolated browser.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), puppeteer = require('puppeteer-core');
const origin = 'http://127.0.0.1:3013', out = '/tmp/arena-world-selection-proof';
const profile = path.join(out, 'profile');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let browser, page;
const report = { errors: [], failedRequests: [] };
async function click(text, scope = 'button') {
  await page.waitForFunction(({ text, scope }) => [...document.querySelectorAll(scope)].some(b => b.getClientRects().length && !b.disabled && b.innerText.trim() === text), {}, { text, scope });
  await page.evaluate(({ text, scope }) => [...document.querySelectorAll(scope)].find(b => b.getClientRects().length && !b.disabled && b.innerText.trim() === text).click(), { text, scope });
}
const shot = async name => { await pause(250); await page.screenshot({ path: path.join(out, name + '.png') }); };
const setup = () => page.evaluate(() => JSON.parse(localStorage.getItem('arena-forge:dofus-lite-player-setup-v1')));
async function go(route) { await page.goto(origin + '/#/' + route); }
async function library(key) {
  await go('library/demo-library-' + key);
  await page.waitForFunction(() => document.querySelector('.af-library-detail .af-button.primary') && !document.querySelector('.af-library-detail .af-button.primary').disabled);
  await page.click('.af-library-detail .af-button.primary');
  await page.waitForSelector('.combat-choice[open]', { timeout: 300000 });
}
async function selectWorld(name, scope = '.combat-choice[open]') {
  const value = await page.$eval(scope + ' select[aria-label="Monde"]', (select, name) => [...select.options].find(o => o.text.includes(name))?.value, name);
  assert(value, `World ${name} exists`); await page.select(scope + ' select[aria-label="Monde"]', value); return value;
}
(async () => {
  fs.mkdirSync(out, { recursive: true });
  browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, pipe: true, userDataDir: profile, protocolTimeout: 180000 });
  page = await browser.newPage(); page.setDefaultTimeout(45000); await page.setViewport({ width: 1480, height: 1000 });
  page.on('pageerror', e => report.errors.push(e.message));
  page.on('response', r => { if (r.status() >= 400) report.failedRequests.push([r.status(), r.url()]); });
  try {
    await go('local');
    // Reset this proof profile's teams, not its installed ZIP/media caches.
    await page.evaluate(() => { for (const key of Object.keys(localStorage)) if (/player-setup|allied-team|ally-team|opponent-team|profiles-v1/.test(key)) localStorage.removeItem(key); });
    await library('asterix');
    assert.match(await page.$eval('.combat-choice[open]', e => e.innerText), /Astérix/);
    const asterixDungeonId = (await setup()).customDungeonId; assert(asterixDungeonId); console.log('Astérix imported and selected.');
    await library('dofus');
    const native = await setup(); assert.equal(native.mode, 'boss'); assert.equal(native.customDungeonId, null);
    assert.equal(await page.$eval('.combat-choice[open]', e => e.dataset.combatPanel), 'dungeons');
    assert.equal(await page.$$eval('.combat-choice[open] [data-dungeon-id]', els => els.length), 0);
    assert(await page.$$eval('.combat-choice[open] [data-boss-id]', els => els.length) >= 55);
    await shot('dofus-selected'); report.dofusReplacesOldAdventure = true; console.log('Dofus replaces Astérix, native dungeon filter passed.');
    await click('C’est prêt', '.combat-choice[open] button'); await page.click('.combat-choice[open] [aria-label="Fermer le choix du combat"]');
    await page.click('[aria-label="Nouveau personnage"]'); await selectWorld('Dofus', '.new-character-dialog[open]');
    assert.equal(await page.$$eval('.new-character-dialog[open] [aria-label="Classes installées"] .setup-class', els => els.length), 12);
    await page.waitForFunction(() => [...document.querySelectorAll('.new-character-dialog[open] img')].every(i => i.complete && i.naturalWidth));
    await shot('dofus-classes'); await page.click('.new-character-dialog[open] [aria-label="Choisir Iop"]');
    await library('potter'); assert.match(await page.$eval('.combat-choice[open]', e => e.innerText), /Harry Potter/); report.secondWorld = true;
    await selectWorld('Astérix'); assert.match(await page.$eval('.combat-choice[open]', e => e.innerText), /Astérix/);
    await selectWorld('Dofus'); assert.equal((await setup()).customDungeonId, null); await click('C’est prêt', '.combat-choice[open] button');
    await page.select('.combat-choice[open] [aria-label="Monde"]', 'all');
    assert.equal((await setup()).mode, 'duel');
    await page.click('.combat-choice[open] [data-panel-trigger="allies"]');
    await click('Classes', '.combat-choice[open] .duel-source-tabs button'); await selectWorld('Astérix');
    assert.equal(await page.$$eval('.combat-choice[open] .duel-candidate', els => els.length), 3);
    const heroName = await page.$eval('.combat-choice[open] .duel-candidate strong', e => e.innerText);
    await page.click('.combat-choice[open] .duel-candidate-add'); await click('C’est prêt', '.combat-choice[open] button');
    await page.click('.combat-choice[open] [data-panel-trigger="opponents"]'); await page.click('.combat-choice[open] [aria-label="Vider le camp adverse"]');
    await click('Monstres', '.combat-choice[open] .duel-source-tabs button'); await selectWorld('Astérix');
    assert.equal(await page.$$eval('.combat-choice[open] .duel-candidate', els => els.length), 9);
    const monsterName = await page.$eval('.combat-choice[open] .duel-candidate strong', e => e.innerText); await page.click('.combat-choice[open] .duel-candidate-add');
    await selectWorld('Dofus'); await page.type('.combat-choice[open] input[type=search]', 'Bouftou Royal');
    await page.click('.combat-choice[open] [aria-label="Ajouter Bouftou Royal"]');
    await click('C’est prêt', '.combat-choice[open] button');
    await page.click('.combat-choice[open] [data-panel-trigger="map"]'); await selectWorld('Harry Potter');
    assert.equal(await page.$$eval('.combat-choice[open] .duel-map-card', els => els.length), 3);
    const mapName = await page.$eval('.combat-choice[open] .duel-map-card strong', e => e.innerText);
    await shot('world-map-picker'); await page.click('.combat-choice[open] .duel-map-card');
    const mixed = await setup(); assert(mixed.battlefield); assert.equal(mixed.mapId, mixed.battlefield.id);
    const text = await page.$eval('.combat-choice[open]', e => e.innerText); assert(text.includes(heroName) && text.includes(monsterName) && text.includes(mapName));
    await shot('mixed-world-combat-setup');
    await page.setViewport({ width: 390, height: 844 }); assert(await page.$eval('.combat-choice[open]', e => e.scrollWidth <= e.clientWidth + 1));
    await shot('mixed-world-mobile'); await page.setViewport({ width: 1480, height: 1000 });
    await click('Lancer le combat', '.combat-choice[open] button'); await page.waitForSelector('.fight-screen'); await page.waitForFunction(() => document.querySelectorAll('.token').length === 4);
    await page.waitForFunction(() => [...document.querySelectorAll('.token img')].every(e => e.naturalWidth));
    assert(await page.$('.original-map-prop-image'));
    await page.waitForFunction(() => document.querySelectorAll('.token ruffle-player').length === 2 && [...document.querySelectorAll('.token ruffle-player')].every(p => Object.hasOwn(p, 'currentFrame')));
    await click('Prêt');
    await page.waitForFunction(() => !document.querySelector('.fight-screen')?.innerText.includes('Placement ·'));
    if (!await page.$('.spell-btn[aria-label^="Puissance "]')) await click('Fin de tour');
    await page.waitForFunction(() => document.querySelector('.spell-btn[aria-label^="Puissance "]') && !document.querySelector('.spell-btn[aria-label^="Puissance "]').disabled);
    await page.click('.spell-btn[aria-label^="Puissance "]', { button: 'right' });
    await page.waitForFunction(() => document.querySelector('.spell-btn[aria-label^="Puissance "]')?.disabled);
    report.nativeActorsAndManualCast = true;
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Combat fits the viewport');
    await shot('mixed-world-fight');
    report.mixed = { heroName, monsterName, nativeClass: 'Iop', nativeMonster: 'Bouftou Royal', mapName, fighters: 4, mobile: true };
    await browser.close(); browser = null;
    console.log('Mixed fight launched; reopening browser.');
    browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, pipe: true, userDataDir: profile });
    page = await browser.newPage(); page.setDefaultTimeout(45000); await page.setViewport({ width: 1480, height: 1000 }); page.on('pageerror', e => report.errors.push(e.message));
    await go('workspace/play'); await page.waitForSelector('.combat-inline');
    assert.equal((await setup()).mapId, mixed.mapId); assert.deepEqual((await setup()).battlefield, mixed.battlefield); report.browserRestart = true;
    await click('Tout en IA', '.combat-inline button'); await click('Lancer le combat', '.combat-inline button');
    await page.waitForSelector('.auto-result-button', { timeout: 120000 }); await page.click('.auto-result-button'); await page.waitForSelector('.auto-result', { timeout: 120000 });
    await shot('mixed-world-result'); report.automatic = true;
    await go('workspace'); await page.waitForSelector('.workshop-screen');
    await page.click('.studio-categories .studio-category.characters');
    await click('Partir d’une classe existante'); await selectWorld('Dofus', '.new-character-dialog[open]');
    await page.click('.new-character-dialog[open] [aria-label="Choisir Iop"]');
    await page.waitForSelector('.creator-spell-catalogue');
    assert(await page.$$eval('.creator-spell-card', els => els.length) >= 20);
    await page.click('[aria-label^="Ajouter Pression ("]');
    await page.waitForFunction(() => document.querySelectorAll('.creator-selected-spells li').length === 1);
    const nativeCopy = await page.evaluate(() => JSON.parse(localStorage.getItem('arena-forge:dofus-lite-creations-v1')).characters.find(c => c.templateSource === 'class:IOP'));
    assert.equal(nativeCopy.loadout.spells.custom[0].name, 'Pression'); await shot('class-from-dofus');
    await click('Partir d’une classe existante'); await selectWorld('Astérix', '.new-character-dialog[open]');
    const sourceId = await page.$eval('.new-character-dialog[open] [data-custom-character-id]', e => e.dataset.customCharacterId);
    const before = await page.evaluate(id => JSON.parse(localStorage.getItem('arena-forge:dofus-lite-creations-v1')).characters.find(c => c.id === id), sourceId);
    await page.click('.new-character-dialog[open] [data-custom-character-id]');
    await page.waitForFunction(() => document.querySelectorAll('.creator-selected-spells li').length === 8);
    const snapshot = await page.evaluate(() => JSON.parse(localStorage.getItem('arena-forge:dofus-lite-creations-v1')));
    const copied = snapshot.characters.at(-1); assert.notEqual(copied.id, before.id); assert.deepEqual(copied.loadout, before.loadout);
    assert.deepEqual(snapshot.characters.find(c => c.id === before.id), before); report.classCopies = { native: true, imported: true, spellbooksAndEquipmentPreserved: true };
    await shot('class-from-world');
    await page.setViewport({ width: 390, height: 844 }); await click('Partir d’une classe existante');
    assert(await page.$eval('.new-character-dialog[open]', e => e.scrollWidth <= e.clientWidth + 1)); await shot('class-picker-mobile');
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedRequests, []);
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
  } catch (error) {
    if (page && !page.isClosed()) { await shot('failure'); console.error((await page.$eval('body', e => e.innerText)).slice(-4500)); }
    throw error;
  } finally { if (browser) await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
