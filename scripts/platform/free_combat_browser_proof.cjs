// Existing isolated proof profile contains installed Dofus, Potter and Astérix.
// Never opens or edits the player's Chrome profile.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const puppeteer = require('puppeteer-core');
const origin = 'http://127.0.0.1:3013', out = '/tmp/arena-free-combat-proof';
const userDataDir = '/tmp/arena-world-selection-proof/profile';
let browser, page;
const report = { errors: [], failedRequests: [] };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const scope = '.combat-choice[open]';
const store = key => page.evaluate(key => JSON.parse(localStorage.getItem('arena-forge:dofus-lite-' + key + '-v1')), key);
async function launch() {
  browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, pipe: true, userDataDir, protocolTimeout: 180000 });
  page = await browser.newPage(); page.setDefaultTimeout(40000); await page.setViewport({ width: 1480, height: 1000 });
  page.on('pageerror', e => report.errors.push(e.message));
  page.on('response', r => { if (r.status() >= 400) report.failedRequests.push([r.status(), r.url()]); });
}
async function click(text, selector = scope + ' button') {
  await page.waitForFunction(({ text, selector }) => [...document.querySelectorAll(selector)].some(e => e.getClientRects().length && !e.disabled && e.innerText.trim() === text), {}, { text, selector });
  await page.evaluate(({ text, selector }) => [...document.querySelectorAll(selector)].find(e => e.getClientRects().length && !e.disabled && e.innerText.trim() === text).click(), { text, selector });
}
async function world(name) {
  const id = await page.$eval(scope + ' [aria-label="Monde"]', (el, name) => [...el.options].find(o => o.text.includes(name))?.value, name);
  assert(id); await page.select(scope + ' [aria-label="Monde"]', id);
  if (await page.$eval(scope, e => e.dataset.combatPanel) === 'dungeons') await click('C’est prêt');
  return id;
}
async function shot(name) { await pause(350); await page.screenshot({ path: path.join(out, name + '.png') }); }
async function main() {
  fs.mkdirSync(out, { recursive: true }); await launch();
  try {
    await page.goto(origin + '/#/library/demo-library-potter');
    await page.waitForFunction(() => document.querySelector('.af-library-detail .af-button.primary') && !document.querySelector('.af-library-detail .af-button.primary').disabled);
    await page.click('.af-library-detail .af-button.primary'); await page.waitForSelector(scope, { timeout: 180000 });
    if (await page.$eval(scope, e => e.dataset.combatPanel) !== 'overview') await click('C’est prêt');
    assert.equal(await page.$eval(scope + ' h2', e => e.textContent), 'Combat libre');
    assert(!await page.$(scope + ' .adventure-lobby'));
    assert(await page.$(scope + ' [aria-label="Modifier mon équipe"]'));
    const source = await store('creations');
    const personalBefore = await store('profiles'), main = personalBefore.profiles.find(p => p.id === personalBefore.activeId);
    assert.equal(main.classId, 'CRA');
    // Clear only the proof's secondary members; retain its native main hero.
    await page.click(scope + ' [aria-label="Modifier mon équipe"]');
    const removes = await page.$$eval(scope + ' [data-ally-index] .duel-remove-member', els => els.map(e => e.getAttribute('aria-label')));
    for (const label of removes.reverse()) await page.click(scope + ' [aria-label=' + JSON.stringify(label) + ']');
    await click('Classes', scope + ' .duel-source-tabs button');
    await page.click(scope + ' .duel-candidate-add');
    const heroName = (await store('ally-team')).entries[0].name;
    await page.select(scope + ' [aria-label="Contrôle du personnage principal"]', 'player');
    await page.select(scope + ' [aria-label=' + JSON.stringify(`Contrôle de ${heroName} (1)`) + ']', 'ai');
    await page.select(scope + ' [aria-label=' + JSON.stringify(`IA de ${heroName} (1)`) + ']', 'cortex');
    await shot('choose-team-and-control'); await click('C’est prêt');
    const teamBefore = await store('ally-team'); assert.equal(teamBefore.entries[0].name, heroName);
    await world('Dofus'); assert.deepEqual(await store('ally-team'), teamBefore);
    await world('Harry Potter'); assert.deepEqual(await store('ally-team'), teamBefore);
    assert.equal(await page.$eval(scope + ' h2', e => e.textContent), 'Combat libre');
    assert((await page.$eval(scope, e => e.innerText)).includes(main.name));
    report.sharedUiAndStableTeam = true; console.log('Same combat editor in both worlds; personal team and control choices retained.');
    await shot('harry-potter-free-combat');
    await page.setViewport({ width: 390, height: 844 });
    assert(await page.$eval(scope, e => e.scrollWidth <= e.clientWidth + 1));
    await shot('free-combat-mobile'); await page.setViewport({ width: 1480, height: 1000 });
    const enemies = await page.$$eval(scope + ' .combat-team-preview.enemies .combat-member', els => els.map(e => e.querySelector('strong').textContent));
    await click('Changer de carte'); await world('Astérix');
    const mapName = await page.$eval(scope + ' .duel-map-card strong', e => e.textContent);
    await page.click(scope + ' .duel-map-card');
    assert.equal((await store('player-setup')).mode, 'duel');
    assert.equal((await store('opponent-team')).entries.length, enemies.length);
    assert((await page.$eval(scope, e => e.innerText)).includes(mapName));
    await page.click(scope + ' [aria-label="Modifier les adversaires"]');
    assert.equal(await page.$$eval(scope + ' [data-opponent-index]', els => els.length), enemies.length);
    await page.click(scope + ' [data-opponent-index="0"] .duel-remove-member');
    await click('C’est prêt'); assert.equal((await store('opponent-team')).entries.length, enemies.length - 1);
    assert.deepEqual(await store('creations'), source);
    report.mapChangeKeepsEnemies = true; report.libraryUntouched = true;
    const settings = await store('player-setup'), opponents = await store('opponent-team');
    const resumeUrl = page.url(); await browser.close(); browser = null;
    await launch(); await page.goto(resumeUrl); await page.waitForSelector('.player-setup');
    assert.deepEqual(await store('player-setup'), settings);
    assert.deepEqual(await store('opponent-team'), opponents);
    assert.deepEqual(await store('ally-team'), teamBefore);
    if (!await page.$(scope)) await page.click('.setup-play');
    if (await page.$eval(scope, e => e.dataset.combatPanel) !== 'overview') await click('C’est prêt');
    report.browserRestart = true; console.log('Map, enemies and mixed team retained after a full Chrome restart.'); await shot('mixed-world-ready');
    await click('Lancer le combat'); await page.waitForSelector('.fight-screen');
    await page.waitForFunction(count => document.querySelectorAll('.token').length === count, {}, 2 + opponents.entries.length);
    const tokens = await page.$$eval('.token', els => els.map(e => ({ name: e.getAttribute('aria-label'), title: e.getAttribute('title') })));
    const placement = await page.$eval('[aria-label="Placer votre équipe"]', e => e.innerText);
    assert(placement.includes(main.name)); assert(placement.includes(heroName));
    await shot('mixed-world-live-fight');
    report.manualLaunch = { heroName, mainName: main.name, enemies: opponents.entries.length, tokens };
    console.log('Manual fight uses the exact composed team and map.');
    await click('Préparation', '.fight-screen button');
    await page.waitForSelector('.player-setup');
    const returnedButtons = '.combat-choice[open] button, .combat-inline button';
    await click('Tout en IA', returnedButtons); await click('Lancer le combat', returnedButtons);
    await page.waitForSelector('.auto-result-button', { timeout: 180000 }); await page.click('.auto-result-button');
    await page.waitForSelector('.auto-result', { timeout: 180000 });
    await shot('mixed-world-result'); report.automatic = true;
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedRequests, []);
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); console.log(report);
  } catch (e) { await shot('failure'); console.error(await page.evaluate(() => document.body.innerText.slice(-3000))); throw e; }
  finally { if (browser) await browser.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
