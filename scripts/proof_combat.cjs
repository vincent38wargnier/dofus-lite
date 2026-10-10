const puppeteer = require('puppeteer-core');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const url = process.env.RETRO_URL || 'http://127.0.0.1:3013';
const out = path.join(os.tmpdir(), 'dofus-lite-combat-proof');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, pipe: true, protocolTimeout: 20000 });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1500, height: 1100 });
    const errors = [], external = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' || m.text().includes('%cERROR%c')) { errors.push(m.text().slice(0, 180)); console.error('Browser:', m.text().slice(0, 180)); } });
    page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
    await page.setRequestInterception(true);
    page.on('request', r => { if (r.url().startsWith(url) || /^(data|blob):/.test(r.url())) r.continue(); else { external.push(r.url()); r.abort(); } });
    const click = async (selector, text) => page.evaluate(({ selector, text }) => {
      const element = [...document.querySelectorAll(selector)].find(e => e.offsetParent && e.textContent.includes(text));
      if (!element) throw new Error(`Missing ${selector}: ${text}`); element.click();
    }, { selector, text });
    await page.goto(url, { waitUntil: 'networkidle0' });
    await page.waitForSelector('.player-summary .retro-portrait');
    await click('.tab', 'Jouer'); await click('.setup-navigation button', 'Combat');
    const mapCount = await page.$eval('select[aria-label="Carte de combat"]', e => e.options.length);
    assert.equal(mapCount, 21);
    await click('.map-open', 'cartes');
    await page.waitForSelector('.map-gallery');
    await sleep(1300);
    await page.screenshot({ path: path.join(out, 'map-gallery.png') });
    console.log('Map gallery: 21 choices loaded.');
    await click('.map-card', 'Astrub');
    assert.equal(await page.$$eval('select[aria-label="Carte de combat"]', es => es.find(e => e.offsetParent).value), 'astrub_2195');
    await click('.btn.primary', 'Jouer');
    await page.waitForFunction(() => [...document.querySelectorAll('.retro-actor ruffle-player')].filter(e => typeof e.animate === 'function').length === 2, { timeout: 30000 });
    await page.waitForSelector('.cell.hl-move');
    await page.waitForFunction(() => [...document.querySelectorAll('.retro-map-layer')].every(i => i.complete && i.naturalWidth));
    const mapLayers = await page.$$eval('.retro-map-layer', images => images.map(i => i.src));
    assert.ok(mapLayers.length > 0 && mapLayers.every(src => src.includes('/2195-')));
    await page.screenshot({ path: path.join(out, 'astrub-combat.png') });
    console.log('Original Astrub scenery and actors loaded.');
    await page.waitForFunction(() => [...document.querySelectorAll('.spell-btn')].some(e => e.textContent.includes('Puissance') && !e.disabled));
    await click('.spell-btn', 'Puissance');
    console.log('Puissance selected.');
    // Zero-range spells cast immediately; ranged spells ask for a target.
    if (await page.$('.token.side-A.targetable .figure')) await page.click('.token.side-A.targetable .figure');
    await page.waitForSelector('.retro-spell-effect ruffle-player');
    await page.waitForFunction(() => document.querySelector('.token.side-A ruffle-player').ruffle().callExternalInterface('currentFrame') > 1);
    await sleep(1600);
    assert.ok(await page.$('.retro-spell-effect'), 'Original effect was truncated before its nested timeline finished');
    await page.screenshot({ path: path.join(out, 'original-spell-animation.png') });
    console.log('Native spell and actor animation verified.');
    await page.evaluate(() => {
      const original = URL.createObjectURL;
      URL.createObjectURL = function(blob) { window.exportedCombat = blob; return original.call(this, blob); };
    });
    await click('.combat-log-heading button', 'Exporter');
    const record = await page.evaluate(async () => JSON.parse(await window.exportedCombat.text()));
    assert.equal(record.mapId, 'astrub_2195');
    assert.equal(record.rulesVersion, 4);
    assert.ok(record.events.some(e => e.t === 'cast' && e.fighter === 'A' && e.spellId === 153));
    fs.writeFileSync(path.join(out, 'combat-export.json'), JSON.stringify(record, null, 2));
    console.log('Combat journal exported.');
    await click('.tab', 'Grimoire');
    console.log('Grimoire opened.');
    await page.waitForSelector('.spellbook-item');
    assert.equal(await page.$$eval('.spellbook-item', es => es.length), 22);
    await page.select('select[aria-label="Classe du grimoire"]', 'CRA');
    console.log('Cra selected.');
    await click('.spellbook-item', 'Flèche Magique');
    const facts = await page.$eval('.spell-facts', e => e.textContent);
    assert.ok(facts.includes('∞ / tour')); assert.ok(facts.includes('2 / cible'));
    await page.select('select[aria-label="Grade du sort"]', '6');
    console.log('Grade 6 selected.');
    await click('.spellbook-detail button', 'animation originale');
    await page.waitForSelector('.spellbook-detail .retro-spell-effect ruffle-player');
    await sleep(1000);
    await page.screenshot({ path: path.join(out, 'spellbook.png') });
    await page.select('select[aria-label="Classe du grimoire"]', 'SRAM');
    console.log('Sram selected.');
    await click('.spellbook-item', 'Piège de Masse');
    assert.ok((await page.$eval('.spell-status', e => e.textContent)).includes('Disponible'));
    await page.select('select[aria-label="Classe du grimoire"]', 'ALL');
    assert.equal(await page.$$eval('.spellbook-item', es => es.length), 2141);
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
    console.log(JSON.stringify({ maps: mapCount, originalMapLayers: mapLayers.length, catalogue: 2141,
      exportedEvents: record.events.length, errors, externalRequests: external.length, screenshots: out }, null, 2));
  } catch (error) {
    console.error(error);
    throw error;
  } finally {
    let timer;
    try {
      await Promise.race([browser.close(), new Promise(resolve => { timer = setTimeout(resolve, 5000); })]);
    } finally {
      clearTimeout(timer);
      await browser.disconnect();
      if (browser.process()?.exitCode === null) browser.process().kill('SIGKILL');
    }
  }
})().catch(error => { console.error(error); process.exitCode = 1; })
  .finally(() => process.exit(process.exitCode || 0));
