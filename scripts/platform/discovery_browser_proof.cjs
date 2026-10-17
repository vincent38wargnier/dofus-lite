const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict');
const puppeteer = require('puppeteer-core');
const { libraryCategoryCounts } = require('../../server/generated/library.cjs');
const origin = process.env.PROOF_ORIGIN || 'http://127.0.0.1:3013', output = '/tmp/arena-discovery-proof';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function click(page, prefix) {
  await page.waitForFunction(prefix => [...document.querySelectorAll('button')].some(e => e.getClientRects().length && !e.disabled && (e.getAttribute('aria-label') || e.innerText).startsWith(prefix)), {}, prefix);
  await page.evaluate(prefix => [...document.querySelectorAll('button')].find(e => e.getClientRects().length && !e.disabled && (e.getAttribute('aria-label') || e.innerText).startsWith(prefix)).click(), prefix);
}
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'af-discovery-browser-'));
  const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, pipe: true, userDataDir: profile });
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  async function shot(name) { await page.evaluate(() => document.fonts.ready); await pause(100); await page.screenshot({ path: path.join(output, name + '.png') }); }
  try {
    await page.setViewport({ width: 1480, height: 1050 });
    await page.goto(origin + '/#/explore');
    await page.waitForSelector('.af-illustrated-card');
    const libraries = (await (await fetch(origin + '/api/libraries')).json()).libraries;
    const counts = libraryCategoryCounts(libraries);
    for (const [id, label] of [['all', 'Tout'], ['adventure', 'Aventures'], ['characters', 'Classes'], ['equipment', 'Équipements'], ['mixed', 'Univers']]) {
      assert(counts[id] > 0, id + ' should contain playable content');
      await click(page, label + ' :');
      assert.equal(await page.$$('.af-illustrated-card').then(x => x.length), counts[id]);
      assert.equal(await page.$eval('.af-discovery .af-segments button[aria-pressed=true]', e => e.getAttribute('aria-label')), label + ' : ' + counts[id] + ' bibliothèques');
    }
    await click(page, 'Équipements :');
    assert.equal(await page.$eval('.af-content-chips .selected', e => e.innerText), '48 équipements');
    await page.evaluate(() => document.querySelector('.af-discovery').scrollIntoView());
    await page.waitForFunction(() => [...document.querySelectorAll('.af-illustrated-card img')].slice(0, 3).every(e => e.naturalWidth > 0));
    await shot('equipment');
    assert((await page.$eval('.af-demo-preview-toggle', e => e.innerText)).includes('fictifs'));
    await page.click('.af-demo-preview-toggle input');
    assert.equal((await page.$$('.af-library-activity.simulated')).length, 0);
    await page.reload(); await page.waitForSelector('.af-illustrated-card');
    assert.equal(await page.$eval('.af-demo-preview-toggle input', e => e.checked), false);
    await page.click('.af-demo-preview-toggle input');
    await page.type('input[aria-label="Rechercher une bibliothèque"]', 'no-match-9867');
    await page.waitForFunction(() => document.querySelector('.af-empty h3')?.innerText === 'Aucun résultat pour cette recherche');
    await click(page, 'Voir toutes les bibliothèques');
    await page.waitForFunction(count => document.querySelectorAll('.af-illustrated-card').length === count, {}, libraries.length);
    assert.equal(await page.$eval('input[aria-label="Rechercher une bibliothèque"]', e => e.value), '');
    await click(page, 'Ouvrir Game of Thrones');
    await page.waitForSelector('.af-library-detail .af-chips');
    const inventory = await page.$eval('.af-library-detail .af-chips', e => e.innerText);
    for (const label of ['6 personnages', '48 équipements', '8 salles', '8 cartes']) assert(inventory.includes(label), label);
    await page.goto(origin + '/#/community');
    await page.waitForSelector('.af-thread-row');
    const stats = await (await fetch(origin + '/api/community')).json();
    const sections = { general: 'Discussion libre', help: 'Entraide', feedback: 'Créations & retours', strategy: 'Stratégies', ai: 'Intelligence artificielle', looking: 'Trouver des joueurs' };
    for (const [id, label] of Object.entries(sections)) {
      assert(stats.categoryCounts[id] > 0, id);
      await click(page, label);
      await page.waitForFunction(({ label, count }) => {
        const rows = [...document.querySelectorAll('.af-thread-row')];
        return rows.length === count && rows.every(row => row.querySelector('.af-forum-flair')?.innerText.includes(label));
      }, {}, { label, count: stats.categoryCounts[id] });
    }
    await click(page, 'Entraide');
    await page.waitForFunction(() => document.querySelectorAll('.af-thread-row').length === 3);
    await page.evaluate(() => scrollTo(0, 0)); await shot('help');
    await page.setViewport({ width: 390, height: 844 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await shot('community-mobile');
    await page.goto(origin + '/#/explore'); await page.waitForSelector('.af-illustrated-card');
    await click(page, 'Équipements :');
    await page.evaluate(() => document.querySelector('.af-discovery .af-filters').scrollIntoView());
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await shot('equipment-mobile');
    assert.deepEqual(errors, []);
    const report = { categoryCounts: counts, forumCategories: stats.categoryCounts, embeddedContent: true, searchReset: true, simulationSeparated: true, mobile: true, errors };
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } catch (error) { await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {}); throw error; }
  finally { await browser.close(); fs.rmSync(profile, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
