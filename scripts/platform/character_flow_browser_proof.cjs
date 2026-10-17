// Reuses only the isolated world-selection proof profile, never the player's browser.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const puppeteer = require('puppeteer-core');
const out = '/tmp/arena-character-flow-proof', origin = 'http://127.0.0.1:3013';
const userDataDir = '/tmp/arena-world-selection-proof/profile';
let browser, page;
const report = { errors: [], requests: [] }, pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function launch() {
  browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, pipe: true, userDataDir });
  page = await browser.newPage(); page.setDefaultTimeout(30000); await page.setViewport({ width: 1480, height: 1000 });
  page.on('pageerror', e => report.errors.push(e.message));
  page.on('response', r => { if (r.status() >= 400) report.requests.push([r.status(), r.url()]); });
}
async function click(text, scope = 'button') {
  await page.waitForFunction(({ text, scope }) => [...document.querySelectorAll(scope)].some(e => e.getClientRects().length && !e.disabled && e.innerText.trim() === text), {}, { text, scope });
  await page.evaluate(({ text, scope }) => [...document.querySelectorAll(scope)].find(e => e.getClientRects().length && !e.disabled && e.innerText.trim() === text).click(), { text, scope });
}
const store = key => page.evaluate(key => JSON.parse(localStorage.getItem('arena-forge:dofus-lite-' + key + '-v1')), key);
const shot = async name => { await pause(300); await page.screenshot({ path: path.join(out, name + '.png') }); };
async function world(name, selector) {
  const key = await page.$eval(selector, (el, name) => [...el.options].find(o => o.text.includes(name))?.value, name);
  assert(key); await page.select(selector, key);
}
async function main() {
  fs.mkdirSync(out, { recursive: true }); await launch();
  try {
    await page.goto(origin + '/#/workspace/play'); await page.waitForSelector('.player-setup');
    // Reset just this proof's teams/settings. Retain its installed libraries and artwork.
    await page.evaluate(() => {
      for (const key of Object.keys(localStorage)) if (/player-setup|ally-team|opponent-team|profiles-v1/.test(key)) localStorage.removeItem(key);
    });
    await page.goto(origin + '/#/library/demo-library-dofus'); await page.waitForSelector('.af-library-detail .af-button.primary');
    await page.click('.af-library-detail .af-button.primary'); await page.waitForSelector('.combat-choice[open]');
    if (await page.$eval('.combat-choice[open]', e => e.dataset.combatPanel) !== 'overview') await click('C’est prêt', '.combat-choice[open] button');
    await page.click('.combat-choice[open] [aria-label="Fermer le choix du combat"]');
    await page.click('[aria-label="Nouveau personnage"]');
    await world('Dofus', '.new-character-dialog[open] [aria-label="Monde"]');
    assert.equal(await page.$$eval('.new-character-dialog[open] .setup-class', els => els.length), 12);
    await page.type('.new-character-name input', 'Lina');
    await page.evaluate(() => [...document.querySelectorAll('.new-character-dialog .setup-class')].find(b => /Choisir Cr[aâ]$/.test(b.getAttribute('aria-label'))).click());
    await page.waitForFunction(() => document.querySelector('.setup-editor-heading h2')?.textContent === 'Lina');
    let profiles = await store('profiles'), lina = profiles.profiles.find(p => p.id === profiles.activeId);
    assert.equal(lina.classId, 'CRA'); assert.equal(lina.loadout.spells?.custom, undefined);
    await click('Nom, niveau et apparence');
    await page.select('.character-settings-dialog [aria-label="Niveau du personnage"]', '150');
    await click('Enregistrer', '.character-settings-dialog button');
    await click('Sorts', '.setup-navigation button');
    assert(await page.$$eval('.spell-loadout-order > li', els => els.length) >= 21);
    await shot('customize-existing-spells');
    report.nativeClassKeepsSpellbook = true;
    const before = await store('player-setup');
    await click('Retour au combat'); await page.waitForSelector('.combat-choice[open]');
    assert.match(await page.$eval('.combat-choice[open]', e => e.innerText), /Donjon des Bouftous/);
    await page.click('.combat-choice[open] [aria-label="Personnaliser Lina"]');
    await page.waitForSelector('.setup-editor-heading');
    await click('Caractéristiques', '.setup-navigation button');
    await shot('customize-existing-stats');
    await click('Retour au combat');
    const after = await store('player-setup');
    for (const key of ['mode', 'bossId', 'bossGrade', 'mapId', 'seed']) assert.deepEqual(after[key], before[key]);
    await page.click('.combat-choice[open] [aria-label="Modifier mon équipe"]');
    await click('Classes', '.duel-source-tabs button');
    await page.click('[aria-label="Ajouter Osamodas"]');
    profiles = await store('profiles');
    let osa = profiles.profiles.find(p => p.classId === 'OSAMODAS'); assert(osa); assert.equal(profiles.activeId, lina.id);
    await click('C’est prêt', '.combat-choice[open] button');
    await page.click('.combat-choice[open] [aria-label="Personnaliser Osamodas"]');
    await page.select('.loadout-picker [aria-label="Niveau du personnage"]', '180');
    await page.waitForFunction(id => JSON.parse(localStorage.getItem('arena-forge:dofus-lite-profiles-v1')).profiles.find(p => p.id === id).loadout.level === 180, {}, osa.id);
    report.teamClassSavedWithoutChangingLeader = true;
    await click('Retour au combat');
    await shot('combat-personalize');
    const count = (await store('creations'))?.characters.length;
    await click('Mes personnages', '.combat-choice[open] button');
    await page.waitForSelector('.studio-saved-characters');
    assert.equal((await store('creations'))?.characters.length, count);
    assert(await page.$(`[data-saved-profile-id="${lina.id}"]`)); assert(await page.$(`[data-saved-profile-id="${osa.id}"]`));
    await shot('existing-atelier-saved-characters');
    await page.click(`[data-saved-profile-id="${lina.id}"]`); await page.waitForFunction(() => document.querySelector('.setup-editor-heading h2')?.textContent === 'Lina');
    await click('Retour au combat');
    report.atelierRoundTrip = true;
    await page.setViewport({ width: 390, height: 844 });
    assert(await page.$eval('.combat-choice[open]', e => e.scrollWidth <= e.clientWidth + 1));
    await shot('combat-mobile');
    await page.click('.combat-choice[open] [aria-label="Personnaliser Lina"]');
    await page.evaluate(() => document.querySelector('.setup-editor-heading').scrollIntoView());
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await shot('customize-mobile');
    const resumeUrl = page.url();
    await browser.close(); browser = null; await launch();
    await page.goto(resumeUrl); await page.waitForSelector('.player-setup');
    profiles = await store('profiles');
    assert.equal(profiles.profiles.find(p => p.id === lina.id).loadout.level, 150);
    assert.equal(profiles.profiles.find(p => p.id === osa.id).loadout.level, 180);
    assert.equal((await store('ally-team')).entries[0].loadout.level, 180);
    report.browserRestart = true;
    if (!await page.$('.combat-choice[open]')) await page.click('.setup-play');
    if (await page.$eval('.combat-choice[open]', e => e.dataset.combatPanel) !== 'overview') await click('C’est prêt', '.combat-choice[open] button');
    await click('Je joue', '.combat-choice[open] button');
    await click('Lancer le combat', '.combat-choice[open] button');
    await page.waitForSelector('.fight-screen'); await page.waitForFunction(() => document.querySelectorAll('.token').length === 10);
    await shot('saved-team-in-combat'); report.launchedSavedTeam = true;
    assert.deepEqual(report.errors, []); assert.deepEqual(report.requests, []);
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); console.log(report);
  } catch (error) { await shot('failure'); console.error(await page.evaluate(() => document.body.innerText.slice(0, 1600))); throw error; }
  finally { if (browser) await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
