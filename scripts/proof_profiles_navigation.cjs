// Full browser journey in a fresh Chrome profile; never touches the user's saves.
require('./ai_runtime.cjs');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const path = require('node:path');
const puppeteer = require('puppeteer-core');
const { emptyLoadout } = require('../src/engine/equipment');
const { CREATION_SPELLS_BY_ID } = require('../src/ui/creationCatalogue');
const out = '/tmp/dofus-profiles-navigation';
const first = { ...emptyLoadout('IOP'), level: 200, base: { force: 300 }, slots: { weapon: 2416 }, spells: { common: [350], order: [141, 153, 350] } };
const custom = { id: 'proof-class', name: 'Gardienne solaire', classId: 'IOP', loadout: {
  ...first, spells: { custom: [153, 202].map(id => CREATION_SPELLS_BY_ID[id].grades.at(-1)), order: [153, 202] },
} };
const room = { id: 'proof-room', name: 'La clairière des Poutchs', mapId: 'dungeon_2083', members: [{ monsterId: 494, grade: 1, count: 2 }] };
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, pipe: true });
  const report = { errors: [] };
  try {
    const page = await browser.newPage(); page.setDefaultTimeout(30000);
    await page.setViewport({ width: 1600, height: 1060 });
    page.on('pageerror', error => report.errors.push(error.message));
    await page.evaluateOnNewDocument(({ first, custom, room }) => {
      if (!localStorage.getItem('profiles-proof')) {
        localStorage.setItem('profiles-proof', '1');
        localStorage.setItem('dofus-lite-player-setup-v1', JSON.stringify({ playerClass: 'IOP', mode: 'boss-auto', bossId: 147, bossGrade: 1, mapId: 'canyon' }));
        localStorage.setItem('dofus-lite-loadouts-v1', JSON.stringify({ 'A:IOP': first, 'A:CRA': { ...first, base: { intelligence: 100 } } }));
        localStorage.setItem('dofus-lite-creations-v1', JSON.stringify({ version: 1, characters: [custom], dungeons: [room] }));
      }
    }, { first, custom, room });
    const click = async (selector, text = '') => {
      const handle = await page.evaluateHandle(({ selector, text }) => [...document.querySelectorAll(selector)].find(e => e.checkVisibility() && e.textContent.includes(text)), { selector, text });
      assert(handle.asElement(), `Missing ${selector}: ${text}`);
      assert(!await handle.asElement().evaluate(e => e.disabled), `Disabled ${selector}: ${text}`);
      await handle.asElement().click(); await handle.dispose();
    };
    const type = async (selector, value) => {
      await page.$eval(selector, e => { e.focus(); e.select(); });
      await page.keyboard.press('Backspace'); await page.type(selector, value);
    };
    const profiles = () => page.evaluate(() => JSON.parse(localStorage.getItem('dofus-lite-profiles-v1')));
    const current = async () => { const value = await profiles(); return value.profiles.find(p => p.id === value.activeId); };
    const screen = async name => { await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: path.join(out, `${name}.png`) }); };
    await page.goto(process.env.PROOF_URL || 'http://127.0.0.1:3013', { waitUntil: 'networkidle0' });
    await page.waitForSelector('.profile-card');
    assert.equal((await profiles()).profiles.length, 2);
    assert.deepEqual((await current()).loadout, first);
    assert.equal(await page.$('.new-profile-classes'), null);
    await click('.profile-identity button', 'Renommer');
    await type('.profile-identity input', 'Iop Terre');
    await click('.profile-identity button', 'Enregistrer');
    const original = await current();
    await click('.profile-identity button', 'Dupliquer');
    await click('.profile-identity button', 'Renommer');
    await type('.profile-identity input', 'Iop Feu');
    await click('.profile-identity button', 'Enregistrer');
    await page.select('.play-route [aria-label="Niveau du personnage"]', '190');
    const second = await current();
    assert.equal(second.loadout.level, 190);
    assert.equal((await profiles()).profiles.find(p => p.id === original.id).loadout.level, 200);
    await click(`.profile-card[data-profile-id="${original.id}"] .profile-select`);
    await screen('profiles');
    await page.reload({ waitUntil: 'networkidle0' });
    assert.equal((await current()).id, original.id);
    assert.equal((await profiles()).profiles.find(p => p.id === second.id).loadout.level, 190);
    report.profiles = { migrated: 2, variants: ['Iop Terre', 'Iop Feu'], reload: true, originalUnchanged: true };

    await click('.profile-library button', 'Nouveau personnage');
    await page.waitForSelector('.new-profile-classes');
    await screen('new-profile');
    await click('.new-profile-classes button', 'Créer une classe');
    await page.waitForSelector('.creator-return-bar');
    await type('.creator-name-row input', 'Sentinelle des flammes');
    await type('.workshop-screen [aria-label="Rechercher dans tous les sorts"]', 'Morsure du Bouftou');
    await click('.workshop-screen .creator-spell-results button[aria-label$="(202)"]', 'Ajouter');
    await click('.creator-return-bar button', 'Créer un profil');
    await page.waitForSelector('.profile-library');
    const created = await current();
    assert.equal(created.name, 'Sentinelle des flammes');
    assert.deepEqual(created.loadout.spells.custom.map(s => s.id), [202]);
    report.classCreation = { returnToProfiles: true, name: created.name, spellIds: [202] };

    await click(`.profile-card[data-profile-id="${original.id}"] .profile-select`);
    await click('.setup-navigation button', 'Combat');
    assert.equal(await page.$$eval('.play-route .combat-choice-modes button', entries => entries.length), 4);
    assert(!await page.$eval('.play-route .combat-choice-modes', e => e.textContent.includes('automatique')));
    await click('.play-route .source-filters button', 'Personnalisés');
    assert.equal(await page.$$eval('.play-route .boss-cards [data-boss-id]', entries => entries.length), 0);
    assert.equal(await page.$$eval('.play-route .boss-cards [data-dungeon-id]', entries => entries.length), 1);
    await click('.play-route .boss-card[data-dungeon-id="proof-room"]');
    await screen('dungeons');
    await click('.play-route .source-filters button', 'Dofus');
    assert.equal(await page.$$eval('.play-route .boss-cards [data-dungeon-id]', entries => entries.length), 0);
    assert(await page.$$eval('.play-route .boss-cards [data-boss-id]', entries => entries.length) > 50);
    await click('.play-route .boss-catalogue-heading button', 'Créer un donjon');
    await page.waitForSelector('.creator-return-bar');
    await type('.creator-name-row input', 'Ma salle des Poutchs');
    await page.select('.workshop-screen [aria-label="Carte de combat"]', 'dungeon_2083');
    await page.select('.workshop-screen [aria-label="Niveau proposé pour Poutch Ingball"]', '1');
    await click('.workshop-screen button[aria-label="Ajouter Poutch Ingball"]');
    await click('.creator-return-bar button', 'Choisir ce donjon');
    await page.waitForFunction(() => document.querySelector('.play-route .custom-dungeon-selection h3')?.textContent === 'Ma salle des Poutchs');
    assert.equal(await page.$eval('.play-route .custom-dungeon-selection h3', e => e.textContent), 'Ma salle des Poutchs');
    await click('.combat-choice-launch');
    await page.waitForSelector('.placement-ready');
    assert(await page.$eval('.fight-heading', e => e.textContent.includes('Bouftou')));
    assert.equal(await page.$$eval('.token.side-B', entries => entries.length), 1);
    await screen('custom-placement');
    await click('.fight-heading button', 'Préparation');
    report.dungeons = { filterCustom: true, filterDofus: true, createAndSelect: true, map: 'dungeon_2083', enemies: 1 };

    if (await page.$('.combat-choice[open]')) await click('.combat-choice-close');
    await click('.tabs > button', 'IA contre IA');
    await page.select('.arena-screen [aria-label="Profil A"]', original.id);
    await page.select('.arena-screen [aria-label="Profil B"]', second.id);
    await screen('ai-duel');
    await click('.arena-screen .match-modes button', 'Contre un donjon');
    await click('.arena-screen .source-filters button', 'Personnalisés');
    await click('.arena-screen .boss-card[data-dungeon-id="proof-room"]');
    await screen('ai-dungeon');
    await click('.arena-screen .arena-launch', 'Simuler le donjon');
    await page.waitForSelector('[data-auto-dungeon]', { timeout: 120000 });
    await click('.auto-replay-controls button', 'Voir le résultat');
    await page.waitForSelector('[data-outcome]');
    assert(await page.evaluate(() => {
      const rect = document.querySelector('.auto-dungeon .fight-workspace').getBoundingClientRect();
      return rect.bottom >= innerHeight - 15 && rect.bottom <= innerHeight && document.documentElement.scrollHeight <= innerHeight;
    }), 'Dungeon replay must fill the screen without page scroll');
    await screen('ai-result');
    report.ai = { result: await page.$eval('[data-outcome]', e => e.dataset.outcome), name: original.name, customDungeon: true };
    await click('.auto-dungeon .fight-heading button', 'Retour à Combat');
    await page.setViewport({ width: 390, height: 844 });
    await click('.tabs > button', 'Jouer');
    await click('.setup-navigation button', 'Personnages');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile profile overflow');
    await screen('mobile-profiles');
    await click('.setup-navigation button', 'Combat');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile dungeon overflow');
    report.mobile = { width: 390, noOverflow: true };
    assert.deepEqual(report.errors, []);
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
