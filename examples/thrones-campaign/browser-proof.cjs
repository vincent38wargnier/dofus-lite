// End-to-end proof in fresh Chrome profiles, never in the user's browser storage.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), puppeteer = require('puppeteer-core');
require('../../scripts/ai_runtime.cjs');
const { prepareWorkshopFile } = require('../../src/ui/atelierArchive');
const output = path.resolve(__dirname, '../../public/adventures/thrones-campaign/proof'); fs.mkdirSync(output, { recursive: true });
const zip = path.resolve(output, '../../thrones-eight-memories.zip'), delay = ms => new Promise(r => setTimeout(r, ms));
async function click(page, selector, text = '') {
  await page.waitForFunction(({ selector, text }) => [...document.querySelectorAll(selector)].some(e => e.checkVisibility() && !e.disabled && e.textContent.includes(text)), {}, { selector, text });
  const handle = await page.evaluateHandle(({ selector, text }) => [...document.querySelectorAll(selector)].find(e => e.checkVisibility() && !e.disabled && e.textContent.includes(text)), { selector, text });
  await handle.asElement().click(); await handle.dispose();
}
async function importZip(page, file) {
  await click(page, '.tabs > button', 'Atelier'); await click(page, '.studio-transfer-tools button', 'Importer');
  await (await page.$('[aria-label="Importer un ZIP Atelier"]')).uploadFile(file); await page.waitForSelector('.adventure-import-play');
}
async function readyBrief(page, season) {
  await page.waitForFunction(season => document.querySelector('dialog.campaign-brief[open]')?.textContent.includes(`Saison ${season}`), { timeout: 180000 }, season);
  await click(page, '.campaign-brief button', 'Entrer dans la salle');
}
(async () => {
  const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, pipe: true });
  const page = await browser.newPage(); page.setDefaultTimeout(60000);
  const report = { checks: [], errors: [], rooms: [] }, check = text => { report.checks.push(text); console.log(text); };
  page.on('pageerror', e => report.errors.push(e.message));
  try {
    await page.setViewport({ width: 1920, height: 1080 }); await page.goto('http://127.0.0.1:3013', { waitUntil: 'networkidle0' });
    await importZip(page, zip);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('dofus-lite-creations-v1'))), dungeon = saved.dungeons[0];
    assert.equal(saved.dungeons.length, 1); assert.equal(saved.characters.length, 0); assert.equal(dungeon.rooms.length, 8); assert.equal(dungeon.adventure.heroes.length, 6);
    check('Clean import restores eight rooms and six equipped heroes without any preexisting content.');
    await page.screenshot({ path: path.join(output, 'import.png') });
    await click(page, '.adventure-import-play button', 'Jouer');
    assert.equal(await page.$$eval('.campaign-lobby [aria-label="Choisir une salle"] button:disabled', e => e.length), 7);
    await page.screenshot({ path: path.join(output, 'campaign.png') });
    await click(page, '.combat-choice[open] .combat-choice-launch'); await readyBrief(page, 1);
    assert.equal(await page.$$eval('.board .token', e => e.length), 6 + dungeon.rooms[0].members.reduce((n, m) => n + m.count, 0));
    await delay(800);
    await page.screenshot({ path: path.join(output, 'baelor.png') });
    for (let i = 0; i < 6; i++) { if (!await page.$('.placement-ready')) break; await click(page, '.placement-ready'); await delay(100); }
    await page.waitForSelector('.end-turn:not([disabled])');
    const active = await page.$eval('.combat-turn-controls', e => e.dataset.controlledFighter), index = active === 'A' ? 0 : +active.slice(1) - 1;
    const buff = dungeon.adventure.heroes[index].character.loadout.spells.custom[[2, 5, 3, 3, 1, 2][index]];
    const pa = await page.$eval('.player-resources .pa strong', e => +e.textContent);
    await page.click(`[data-spell-id="${buff.id}"] .spell-btn`, { button: 'right' });
    await page.waitForFunction(pa => +document.querySelector('.player-resources .pa strong').textContent === pa, {}, pa - buff.pa);
    await page.screenshot({ path: path.join(output, 'manual.png') }); check('Manual placement and an original hero boost work in room one.');
    await click(page, '.fight-heading-actions button', 'Abandonner');
    assert(await page.evaluate(() => !Object.values(JSON.parse(localStorage.getItem('dofus-lite-dungeon-progress-v1') || '{}')).some(p => p.cleared)));
    await click(page, '.setup-play');
    await click(page, '.combat-choice .combat-control-toggle button', 'Regarder l’IA');
    await click(page, '.combat-choice .combat-choice-launch');
    for (let season = 1; season <= 8; season++) {
      await readyBrief(page, season); await page.waitForSelector('[data-auto-dungeon]', { timeout: 180000 });
      const heading = await page.$eval('.fight-heading h1', e => e.textContent);
      assert.equal(heading, dungeon.rooms[season - 1].battlefield.name);
      const layout = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, overflow: document.documentElement.scrollHeight > innerHeight + 1,
        fighters: document.querySelectorAll('.board .token').length, native: document.querySelectorAll('.board ruffle-player').length }));
      assert(!layout.overflow); assert.equal(layout.native, 0);
      if ([2, 5, 8].includes(season)) await page.screenshot({ path: path.join(output, `season-${season}.png`) });
      await click(page, '.auto-result-button'); await page.waitForSelector('.campaign-result');
      const result = await page.$eval('.auto-result', e => ({ outcome: e.dataset.outcome, text: e.textContent }));
      assert.equal(result.outcome, 'victory');
      const rounds = Number(result.text.match(/(\d+)\s*tours?/i)?.[1]);
      assert(Number.isFinite(rounds) && rounds > 0, 'The result must expose the actual round count.');
      if (season === 1) assert(rounds <= 5, `Opening room took ${rounds} rounds.`);
      const progress = await page.evaluate(id => JSON.parse(localStorage.getItem('dofus-lite-dungeon-progress-v1'))[id], dungeon.id);
      assert.equal(progress.cleared, season); report.rooms.push({ season, heading, rounds, result, layout }); console.log(JSON.stringify(report.rooms.at(-1)));
      if (season === 1 || season === 8) await page.screenshot({ path: path.join(output, `victory-${season}.png`) });
      if (season < 8) await click(page, '.campaign-result button', 'Salle suivante');
    }
    check('Eight real browser simulations win in order; each victory unlocks exactly one next room and preserves supplied heroes.');
    await click(page, '.campaign-result button', 'Retour'); await page.reload({ waitUntil: 'networkidle0' }); await click(page, '.setup-play');
    assert.equal(await page.$$eval('.campaign-lobby [aria-label="Choisir une salle"] button:disabled', e => e.length), 0);
    assert((await page.$eval('.campaign-lobby', e => e.textContent)).includes('Donjon terminé'));
    await page.setViewport({ width: 390, height: 844 }); await delay(300); await page.screenshot({ path: path.join(output, 'mobile.png') });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    check('Reload retains completed progression; unlocked rooms and story fit a phone viewport.');
    await page.keyboard.press('Escape'); await page.setViewport({ width: 1920, height: 1080 }); await click(page, '.tabs > button', 'Atelier');
    await page.screenshot({ path: path.join(output, 'editor.png') });
    await click(page, '.studio-editor-tabs button', 'Prêt à jouer');
    const downloads = fs.mkdtempSync('/tmp/dofus-campaign-downloads-'), client = await page.createCDPSession();
    await client.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
    await click(page, '.adventure-share button', 'Exporter');
    for (let i = 0; i < 300 && !fs.readdirSync(downloads).some(n => n.endsWith('.zip')); i++) await delay(100);
    const filename = fs.readdirSync(downloads).find(n => n.endsWith('.zip')); assert(filename);
    const reexport = path.join(downloads, filename);
    let serial = 0;
    const copy = await prepareWorkshopFile(new File([fs.readFileSync(reexport)], filename), { newId: () => `proof-${++serial}`, equipmentId: () => 1800009000 + serial++, verifyPixels: async () => {} });
    assert.equal(copy.dungeons[0].rooms.length, 8); assert.equal(copy.records.length, 23);
    // A second empty browser context proves re-export needs neither local creations nor unlocked progress.
    const fresh = await browser.createBrowserContext(), second = await fresh.newPage(); second.setDefaultTimeout(60000);
    second.on('pageerror', e => report.errors.push(e.message)); await second.setViewport({ width: 1440, height: 900 });
    await second.goto('http://127.0.0.1:3013', { waitUntil: 'networkidle0' }); await importZip(second, reexport); await click(second, '.adventure-import-play button', 'Jouer');
    assert.equal(await second.$$eval('.campaign-lobby [aria-label="Choisir une salle"] button:disabled', e => e.length), 7);
    await second.keyboard.press('Escape'); await click(second, '.tabs > button', 'Atelier');
    await click(second, '.dungeon-room-heading button', 'Ajouter une salle');
    assert.equal(await second.evaluate(() => JSON.parse(localStorage.getItem('dofus-lite-creations-v1')).dungeons[0].rooms.length), 9);
    await click(second, '[aria-label="Ordre des salles"] button', 'Saison 8');
    await second.click('[aria-label="Dupliquer la salle"]');
    assert.equal(await second.evaluate(() => JSON.parse(localStorage.getItem('dofus-lite-creations-v1')).dungeons[0].rooms.at(-1).members.reduce((n,m)=>n+m.count,0)), 32);
    await second.click('[aria-label="Déplacer la salle avant"]'); await second.click('[aria-label="Supprimer la salle"]');
    await click(second, '[aria-label="Ordre des salles"] button', 'Salle 9'); await second.click('[aria-label="Supprimer la salle"]');
    await second.reload({ waitUntil: 'networkidle0' }); await click(second, '.tabs > button', 'Atelier');
    assert.equal(await second.evaluate(() => JSON.parse(localStorage.getItem('dofus-lite-creations-v1')).dungeons[0].rooms.length), 8);
    await second.screenshot({ path: path.join(output, 'editor-verified.png') });
    await fresh.close(); check('Re-export restores all dependencies in an empty browser at room one; room add, duplicate, reorder, delete and reload also work.');
    assert.deepEqual(report.errors, []); fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  } catch (error) { console.log(JSON.stringify({ browserErrors: report.errors })); await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {}); fs.writeFileSync(path.join(output, 'failure.txt'), error.stack); throw error; }
  finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
