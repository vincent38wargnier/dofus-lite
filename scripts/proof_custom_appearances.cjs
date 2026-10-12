// Fresh headless browser storage, separate from the player's saves.
require('./ai_runtime.cjs');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const puppeteer = require('puppeteer-core');
const out = process.env.PROOF_DIR || '/tmp/dofus-custom-appearances';
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, pipe: true });
  const page = await browser.newPage(), report = { errors: [], checks: [] };
  page.setDefaultTimeout(30000);
  page.on('pageerror', error => report.errors.push(error.message));
  const element = async (selector, text = '') => {
    const handle = await page.evaluateHandle(({ selector, text }) => [...document.querySelectorAll(selector)].find(e => e.checkVisibility() && e.textContent.includes(text)), { selector, text });
    assert(handle.asElement(), `Missing ${selector}: ${text}`); return handle.asElement();
  };
  const click = async (selector, text = '') => { const e = await element(selector, text); await e.click(); await e.dispose(); };
  const field = async (label, value) => {
    const h = await page.evaluateHandle(label => [...document.querySelectorAll('label')].find(e => e.checkVisibility() && e.childNodes[0]?.textContent.trim() === label)?.control, label);
    const e = h.asElement(); assert(e, `Missing field ${label}`);
    if (await e.evaluate(e => e.tagName === 'SELECT')) await e.select(String(value));
    else { await e.focus(); await e.evaluate(e => e.select()); await page.keyboard.press('Backspace'); await e.type(String(value)); }
    await h.dispose();
  };
  const screenshot = async (name, selector) => {
    if (selector) await page.$eval(selector, e => e.scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: path.join(out, `${name}.png`) });
  };
  const creations = () => page.evaluate(() => JSON.parse(localStorage.getItem('dofus-lite-creations-v1')));
  const equipment = () => page.evaluate(() => JSON.parse(localStorage.getItem('dofus-lite-custom-equipment-v1')).items);
  const check = value => { report.checks.push(value); console.log(value); };
  try {
    await page.setViewport({ width: 1440, height: 1000 });
    await page.goto(process.env.PROOF_URL || 'http://127.0.0.1:3013', { waitUntil: 'networkidle0' });
    await click('.tabs > button', 'Atelier'); await click('.creator-tabs button', 'Mes classes');
    await click('.creator-library-strip button', 'Nouvelle classe');
    await field('Nom de la classe', 'Sentinelle d’azur');
    assert.equal((await creations()).characters[0].loadout.artworkId, 'shape-v1-wanderer-8964cf');
    await click('[aria-label="Forme Gardien"]'); await click('[aria-label="Couleur Océan"]');
    const artId = 'shape-v1-warden-378bc2';
    assert.equal((await creations()).characters[0].loadout.artworkId, artId);
    await field('Aperçu de la silhouette', 'walk');
    await page.waitForFunction(() => Number(document.querySelector('.character-shape-preview [data-artwork-frame]')?.dataset.artworkFrame) > 0);
    await field('Aperçu de la silhouette', 'static');
    await click('.character-custom-appearance button', 'Mes images');
    assert(await page.$('input[aria-label="Images PNG du personnage"]'));
    assert.equal((await creations()).characters[0].loadout.artworkId, artId);
    await click('.character-custom-appearance button', 'Visuel Dofus');
    assert.equal((await creations()).characters[0].loadout.artworkId, null);
    await click('.character-custom-appearance button', 'Forme personnalisée');
    assert.equal((await creations()).characters[0].loadout.artworkId, artId);
    await click('.custom-spell-picker button', 'Créer un sort');
    await field('Nom du sort', 'Éclat azur');
    await click('form[aria-label="Créateur de sort"] button', 'Ajouter à ma classe');
    await screenshot('class-desktop', '.creator-character-identity');
    assert(await page.$eval('.shape-options img', image => decodeURIComponent(image.src).includes('<linearGradient')));
    await (await page.$('.character-custom-appearance')).screenshot({ path: path.join(out, 'class-art-selector.png') });
    check('new class starts with original artwork; shape, palette and animated preview work without image import');
    await click('.creator-tabs button', 'Mes équipements');
    assert.equal(await page.$eval('[aria-label="Forme Silhouette"]', e => e.getAttribute('aria-pressed')), 'true');
    await field('Nom de l’équipement', 'Heaume azur'); await field('Niveau requis', 200);
    await click('[aria-label="Forme Cristal"]'); await click('[aria-label="Couleur Océan"]');
    await click('.equipment-design-add button'); await field('Vitalité', 100);
    await click('.equipment-designer button[type="submit"]');
    const hat = (await equipment()).find(item => item.name === 'Heaume azur');
    assert.deepEqual(hat.appearance, { shape: 'crystal', color: '#378bc2' });
    await screenshot('equipment-desktop', '.equipment-workshop-heading');
    await (await page.$('.equipment-designer .shape-picker')).screenshot({ path: path.join(out, 'equipment-art-selector.png') });
    await click('[aria-label="Nouvel équipement"]');
    await field('Famille', 'weapon-7'); await field('Nom de l’équipement', 'Marteau de braise'); await field('Niveau requis', 200);
    await click('[aria-label="Couleur Corail"]');
    if (await page.$eval('.equipment-designer button[type="submit"]', e => e.disabled)) await click('.equipment-design-errors button');
    await click('.equipment-designer button[type="submit"]');
    const hammer = (await equipment()).find(item => item.name === 'Marteau de braise');
    assert.deepEqual(hammer.appearance, { shape: 'equipment', color: '#d87558' });
    await page.reload({ waitUntil: 'networkidle0' }); await click('.tabs > button', 'Atelier'); await click('.creator-tabs button', 'Mes équipements');
    await click('.equipment-design-saved-card', 'Heaume azur');
    assert.equal(await page.$eval('[aria-label="Forme Cristal"]', e => e.getAttribute('aria-pressed')), 'true');
    assert.equal(await page.$eval('[aria-label="Couleur Océan"]', e => e.getAttribute('aria-pressed')), 'true');
    await page.setViewport({ width: 390, height: 844 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await screenshot('equipment-mobile', '.equipment-design-identity');
    await click('.creator-tabs button', 'Mes classes');
    assert.equal(await page.$eval('[aria-label="Forme Gardien"]', e => e.getAttribute('aria-pressed')), 'true');
    assert.equal(await page.$eval('[aria-label="Couleur Océan"]', e => e.getAttribute('aria-pressed')), 'true');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await screenshot('class-mobile', '.character-custom-appearance');
    check('class and equipment colours survive reload; both editors fit a 390px screen');
    await page.setViewport({ width: 1440, height: 1000 });
    await click('.builder-navigation button', 'Équipement');
    for (const [item, slot] of [[hat, 'hat'], [hammer, 'weapon']]) {
      await click(`.loadout-picker [data-slot="${slot}"]`);
      await click('.equipment-origin-filter button', 'Mes créations');
      await click(`.equipment-result[data-item-id="${item.id}"]`);
      await click('.loadout-picker button', 'Équiper ·');
      await page.waitForFunction(({ id, slot }) => JSON.parse(localStorage.getItem('dofus-lite-creations-v1')).characters[0].loadout.slots[slot] === id, {}, { id: item.id, slot });
      assert.equal((await creations()).characters[0].loadout.slots[slot], item.id);
      assert(await page.$eval(`.loadout-picker [data-slot="${slot}"] img`, image => image.complete && image.naturalWidth > 0 && image.src.startsWith('data:image/svg+xml')));
    }
    await screenshot('equipped', '.builder-context');
    await click('.creator-launch-buttons button', 'Jouer cette création');
    await page.waitForSelector('.placement-ready');
    await click('.placement-ready'); await page.waitForSelector('.combat-spellbar');
    assert.equal(await page.$eval('.token.side-A .custom-character-sprite', e => e.dataset.artworkId), artId);
    assert(await page.$eval('.combat-spellbar img[src^="data:image/svg+xml"]', image => image.complete && image.naturalWidth > 0));
    const sprites = await page.$$eval('[data-artwork-id]', es => es.map(e => ({ id: e.dataset.artworkId, image: getComputedStyle(e).backgroundImage })));
    assert(sprites.some(sprite => sprite.id === artId && decodeURIComponent(sprite.image).includes('#378bc2')));
    await screenshot('combat');
    check('equipped icons and combat weapon use the chosen artwork; the character renders its coloured silhouette on the map');
    assert.deepEqual(report.errors, []);
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  } catch (error) {
    report.failure = error.stack; await screenshot('failure').catch(() => {});
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
    fs.writeFileSync(path.join(out, 'failure.txt'), await page.evaluate(() => document.body.innerText)); throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
