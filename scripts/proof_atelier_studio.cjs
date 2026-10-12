require('./ai_runtime.cjs');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const puppeteer = require('puppeteer-core');
const { emptyLoadout } = require('../src/engine/equipment');
const { CREATION_SPELLS } = require('../src/ui/creationCatalogue');
const { newCustomEquipment } = require('../src/engine/customEquipment');
const out = process.env.PROOF_DIR || '/tmp/dofus-atelier-studio';
const raw = id => CREATION_SPELLS.find(s => s.id === id).grades.at(-1);
const seed = {
  version: 1,
  characters: [{ id: 'sentinelle', name: 'Sentinelle astrale', classId: 'CRA', loadout: { ...emptyLoadout('CRA'), level: 200,
    artworkId: 'shape-v1-warden-378bc2', spells: { custom: [161, 142, 124].map(raw), order: [161, 142, 124] } } }],
  dungeons: [{ id: 'bosquet', name: 'Le bosquet des rois', mapId: 'dungeon_2083', members: [{ monsterId: 147, grade: 1, count: 1 }, { monsterId: 494, grade: 1, count: 2 }] }],
};
const items = [{ ...newCustomEquipment(7143), id: 1000000701, name: 'Couronne astrale', level: 200, stats: { vitalite: 150, intelligence: 40 }, appearance: { shape: 'crystal', color: '#378bc2' } }];
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, pipe: true });
  const page = await browser.newPage(), report = { errors: [], checks: [] };
  page.setDefaultTimeout(40000); page.on('pageerror', error => report.errors.push(error.message));
  const check = label => { report.checks.push(label); console.log(label); };
  const click = async (selector, text = '') => {
    await page.waitForFunction(({ selector, text }) => [...document.querySelectorAll(selector)].some(e => e.checkVisibility() && e.textContent.includes(text) && !e.disabled), {}, { selector, text });
    const handle = await page.evaluateHandle(({ selector, text }) => [...document.querySelectorAll(selector)].find(e => e.checkVisibility() && e.textContent.includes(text) && !e.disabled), { selector, text });
    await handle.asElement().click(); await handle.dispose();
  };
  const input = async (selector, value) => { await page.$eval(selector, el => { el.focus(); el.select(); }); await page.keyboard.press('Backspace'); await page.type(selector, value); };
  const labelInput = async (label, value) => {
    const h = await page.evaluateHandle(label => [...document.querySelectorAll('label')].find(e => e.checkVisibility() && e.childNodes[0]?.textContent.trim() === label)?.querySelector('input'), label);
    assert(h.asElement(), `Missing ${label}`); await h.asElement().evaluate(e => { e.focus(); e.select(); }); await page.keyboard.press('Backspace'); await h.asElement().type(value); await h.dispose();
  };
  const select = async (label, value) => {
    const h = await page.evaluateHandle(label => [...document.querySelectorAll('label')].find(e => e.checkVisibility() && e.childNodes[0]?.textContent.trim() === label)?.querySelector('select'), label);
    assert(h.asElement(), `Missing ${label}`); await h.asElement().select(value); await h.dispose();
  };
  const data = () => page.evaluate(() => JSON.parse(localStorage.getItem('dofus-lite-creations-v1')));
  const shot = async name => { await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, document.querySelector('.studio-heading').getBoundingClientRect().top + window.scrollY - 22); }); await page.screenshot({ path: path.join(out, `${name}.png`) }); };
  try {
    await page.setViewport({ width: 1600, height: 1100 });
    await page.evaluateOnNewDocument(({ seed, items }) => {
      if (localStorage.getItem('atelier-studio-proof')) return;
      localStorage.setItem('atelier-studio-proof', '1');
      localStorage.setItem('dofus-lite-creations-v1', JSON.stringify(seed));
      localStorage.setItem('dofus-lite-custom-equipment-v1', JSON.stringify({ version: 1, items }));
      localStorage.setItem('dofus-lite-sound', JSON.stringify({ enabled: false, volume: 0 }));
    }, { seed, items });
    await page.goto(process.env.PROOF_URL || 'http://127.0.0.1:3013', { waitUntil: 'networkidle0' });
    await click('.tabs > button', 'Atelier');
    await click('.studio-new', 'Nouveau donjon');
    await input('.creator-name-row input', 'La clairière des chimères');
    await click('.studio-editor-tabs button', 'Terrain');
    await click('[data-map-id="dungeon_2083"]');
    assert.equal((await data()).dungeons.at(-1).mapId, 'dungeon_2083');
    await input('.creator-monster-filters input[type="search"]', 'Bouftou');
    const source = await page.$('.creator-monster-card[data-monster-id="147"] .creator-monster-heading');
    await source.scrollIntoView();
    const box = await source.boundingBox(), target = await page.$eval('.creator-roster-dropzone', e => { const b=e.getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+60}; });
    await page.setDragInterception(true); await page.mouse.dragAndDrop({ x: box.x + 75, y: box.y + 20 }, target, { delay: 150 }); await page.setDragInterception(false);
    assert.equal((await data()).dungeons.at(-1).members[0].monsterId, 147);
    await input('.creator-monster-filters input[type="search"]', 'Poutch');
    await page.select('[aria-label="Niveau proposé pour Poutch Ingball"]', '1');
    await click('[aria-label="Ajouter Poutch Ingball"]'); await click('[aria-label="Plus de Poutch Ingball"]');
    assert.equal((await data()).dungeons.at(-1).members[1].count, 2);
    await input('.creator-monster-filters input[type="search"]', '');
    await shot('dungeon');
    check('visual map selection, real mouse drag, chosen monster grade and quantity persist');
    await click('[aria-label="Dupliquer la création"]');
    assert((await data()).dungeons.at(-1).name.endsWith('copie'));
    await click('[aria-label="Supprimer la création"]'); await click('.creator-undo button');
    assert((await data()).dungeons.at(-1).name.endsWith('copie'));
    await click('[aria-label="Supprimer la création"]');
    await click('.studio-library-card', 'La clairière');
    check('duplicate, remove and undo keep the rest of the visual library intact');
    await click('.studio-categories button', 'Mes classes');
    await click('.studio-new', 'Nouvelle classe');
    await input('.creator-name-row input', 'Gardienne des aurores');
    await click('.studio-editor-tabs button', 'Apparence');
    await click('[aria-label="Forme Gardien"]'); await click('[aria-label="Couleur Océan"]');
    await shot('appearance');
    await click('.studio-editor-tabs button', 'Sorts');
    await click('.creator-new-spell button', 'Créer un sort');
    await labelInput('Nom du sort', 'Éclat boréal');
    await click('.studio-editor-tabs button', 'Apparence');
    await click('.studio-editor-tabs button', 'Sorts');
    assert.equal(await page.$eval('.spell-designer input[maxlength="80"]', e => e.value), 'Éclat boréal');
    await shot('spell-designer');
    await click('.spell-designer-save button', 'Ajouter à ma classe');
    for (const id of [161,142,124]) {
      const name=raw(id).name;
      await input('[aria-label="Rechercher dans tous les sorts"]', name);
      await click(`.creator-spell-results [aria-label="Ajouter ${name} (${id})"]`);
    }
    await input('[aria-label="Rechercher dans tous les sorts"]', '');
    await click('.studio-quick-filters button', 'Soin');
    assert(await page.$$eval('.creator-spell-card', es => es.every(e => e.textContent.includes('Soin'))));
    await click('.studio-advanced-filters summary'); await select('Origine', 'class');
    await click('.creator-filters button', 'Réinitialiser'); await click('.studio-advanced-filters summary');
    await shot('class');
    assert.equal((await data()).characters.at(-1).loadout.spells.custom.length, 4);
    check('class appearance, spell creation, draft retention between sections, quick filters and advanced filters work');
    await click('.studio-editor-tabs button', 'Équipement');
    await page.waitForSelector('.equipment-collection');
    await click('.studio-editor-tabs button', 'Caractéristiques');
    await select('Classe de référence', 'CRA');
    assert.equal((await data()).characters.at(-1).classId, 'CRA');
    await click('.studio-categories button', 'Mes équipements');
    await labelInput('Nom de l’équipement', 'Diadème des aurores');
    await click('.studio-editor-tabs button', 'Apparence');
    await click('[aria-label="Forme Cristal"]'); await click('[aria-label="Couleur Océan"]');
    await click('.studio-editor-tabs button', 'Bonus');
    await labelInput('Niveau requis', '200');
    await click('.equipment-design-add button', 'Ajouter');
    await input('[aria-label="Vitalité"]', '150');
    await click('.studio-categories button', 'Mes classes');
    await click('.studio-categories button', 'Mes équipements');
    assert.equal(await page.$eval('.equipment-design-identity input', e => e.value), 'Diadème des aurores');
    assert.equal(await page.$eval('[aria-label="Vitalité"]', e => e.value), '150');
    await click('.equipment-design-actions button', 'Enregistrer l’équipement');
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('dofus-lite-custom-equipment-v1')).items.find(i => i.name === 'Diadème des aurores').appearance), { shape: 'crystal', color: '#378bc2' });
    await shot('equipment');
    check('equipment appearance and bonus sections retain drafts across categories; save produces a reusable object');
    const saved = await data();
    await page.reload({ waitUntil: 'networkidle0' }); await click('.tabs > button', 'Atelier');
    assert.deepEqual(await data(), saved);
    await click('.studio-categories button', 'Mes classes');
    await click('.studio-library-card', 'Gardienne');
    assert.equal(await page.$eval('.creator-name-row input',e=>e.value), 'Gardienne des aurores');
    check('classes, spells and dungeon composition survive a page reload');
    for (const width of [1000, 390, 320]) {
      await page.setViewport({ width, height: 980 });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      for (const category of ['Mes classes', 'Mes donjons', 'Mes équipements']) {
        await click('.studio-categories button', category);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${category} horizontal overflow at ${width}`);
      }
      if (width===390) { await click('.studio-categories button','Mes classes'); await shot('mobile'); }
    }
    check('all three editors fit tablet, 390px and 320px widths without horizontal scrolling');
    await page.setViewport({ width: 1500, height: 1050 });
    await click('.studio-categories button', 'Mes classes');
    await click('.studio-import-button');
    await page.waitForSelector('dialog[open]');
    await page.browserContext().overridePermissions('http://127.0.0.1:3013', ['clipboard-read', 'clipboard-sanitized-write']);
    await input('[data-package-panel] textarea', 'Un gardien de glace');
    await click('[data-package-panel] button', 'Copier le prompt');
    await page.waitForFunction(() => document.querySelector('[data-package-panel] [role="status"]')?.textContent.includes('copié'));
    const prompt = await page.evaluate(() => navigator.clipboard.readText());
    assert(prompt.includes('Un gardien de glace') && prompt.includes('content.json'));
    const file = await page.$('input[aria-label="Importer une classe ou un donjon ZIP"]');
    await file.uploadFile(path.resolve('public/templates/content-packages/example-class-with-artwork.zip'));
    await page.waitForFunction(() => document.querySelector('[data-package-panel] [role="status"]')?.textContent.includes('importé et sauvegardé'));
    assert((await data()).characters.length > saved.characters.length);
    await click('dialog footer button');
    await page.waitForFunction(()=>!document.querySelector('dialog[open]'));
    check('AI prompt copies the theme and contract; artwork ZIP import opens the new class from the focused dialog');
    await click('.studio-library-card', 'Gardienne');
    await click('.studio-editor-actions button', 'Tester');
    await click('.creator-launch-buttons button', 'Jouer cette création');
    await page.waitForSelector('.placement-ready');
    await click('.placement-ready');
    await page.waitForSelector('.spell-slot');
    assert(await page.$('.spell-slot[data-spell-id="161"]'));
    check('the dedicated test dialog launches manual combat with the edited spellbook');
    await click('.fight-heading-actions button', 'Abandonner');
    await page.waitForSelector('.studio-heading');
    await click('.studio-editor-actions button', 'Tester');
    await click('.creator-launch-buttons button', 'Tester avec l’IA');
    await page.waitForSelector('[data-auto-dungeon]');
    await click('.auto-result-button');
    await page.waitForSelector('.auto-result[data-outcome]');
    await click('.fight-heading-actions button', 'Retour à l’Atelier');
    await page.waitForSelector('.studio-heading');
    check('AI testing reaches a result and returns to the same Atelier class');
    await click('.studio-categories button', 'Mes donjons');
    await click('.studio-import-button');
    const dungeonFile = await page.$('input[aria-label="Importer une classe ou un donjon ZIP"]');
    await dungeonFile.uploadFile(path.resolve('public/templates/content-packages/example-dungeon-with-artwork.zip'));
    await page.waitForFunction(() => document.querySelector('[data-package-panel] [role="status"]')?.textContent.includes('importé et sauvegardé'));
    await click('dialog footer button');
    await click('.creator-custom-monster button', 'Modifier les sorts');
    await page.waitForSelector('.creator-monster-spell-editor');
    assert(await page.$eval('.creator-monster-spell-editor', e => e.textContent.includes('Budget du monstre')));
    check('imported custom monsters still expose their own spell editor');
    await click('.studio-categories button', 'Mes classes');
    await click('.studio-library-card', 'Gardienne');
    await shot('class-final');
    await click('.studio-import-button');
    assert.equal(await page.$eval('[data-package-panel] textarea', e => e.value), 'Un gardien de glace');
    await page.screenshot({ path: path.join(out, 'ai-import.png') });
    await click('dialog footer button');
    check('the AI theme survives closing the import dialog and switching creation types');
    assert.deepEqual(report.errors, []);
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  } catch(error) { await page.screenshot({ path: path.join(out,'failure.png') }); console.error(report); throw error; }
  finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
