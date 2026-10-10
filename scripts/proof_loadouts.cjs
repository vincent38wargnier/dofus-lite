const puppeteer = require('puppeteer-core');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const url = process.env.RETRO_URL || 'http://127.0.0.1:3013';
const out = '/tmp/dofus-loadout-ui';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, pipe: true, protocolTimeout: 30000 });
  try {
    const page = await browser.newPage(); await page.setViewport({ width: 1500, height: 1150 });
    const errors = [], external = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
    await page.setRequestInterception(true);
    page.on('request', r => { if (r.url().startsWith(url) || /^(data|blob):/.test(r.url())) r.continue(); else { external.push(r.url()); r.abort(); } });
    const handle = selector => page.evaluateHandle(s => [...document.querySelectorAll(s)].find(e => e.offsetParent), selector);
    const click = (selector, text = '') => page.evaluate(({ selector, text }) => {
      const element = [...document.querySelectorAll(selector)].find(e => e.offsetParent && e.textContent.includes(text));
      if (!element) throw new Error(`Missing visible ${selector}: ${text}`);
      if (element.disabled) throw new Error(`Disabled ${selector}: ${text}`);
      element.click();
    }, { selector, text });
    const select = async (selector, value) => { const h = await handle(selector); await h.asElement().select(String(value)); await h.dispose(); };
    const fill = async (selector, value) => { const h = await handle(selector); await h.asElement().focus(); await h.asElement().evaluate(e => e.select()); await page.keyboard.press('Backspace'); await h.asElement().type(value); await h.dispose(); };
    const lib = () => page.evaluate(() => JSON.parse(localStorage.getItem('dofus-lite-stuff-library-v1')));
    const drafts = () => page.evaluate(() => JSON.parse(localStorage.getItem('dofus-lite-loadouts-v1')));
    const tab = name => click('.builder-navigation button', name);
    const save = async (name, copy = false) => {
      await click('.stuff-save-actions .btn', copy ? 'Enregistrer sous' : 'Enregistrer ce stuff');
      await fill('input[aria-label="Nom du stuff"]', name); await click('.stuff-name-form button[type="submit"]');
      const saved = (await lib())?.builds.find(b => b.name === name);
      assert.ok(saved, `Save failed for ${name}: ${JSON.stringify(await lib())}`);
      return saved;
    };
    const cardClick = (id, text) => click(`[data-build-id="${id}"] button`, text);
    const quickLoad = id => select('select[aria-label="Charger un stuff"]', id);
    const equip = async (slot, name, id) => {
      await click(`[data-slot="${slot}"]`); await fill('input[aria-label="Rechercher un équipement"]', name);
      await click(`[data-item-id="${id}"]`); await click('.equipment-equip');
    };
    const shot = async (selector, filename) => { const h = await handle(selector); await h.asElement().screenshot({ path: `${out}/${filename}` }); await h.dispose(); };
    await page.goto(url, { waitUntil: 'networkidle0' }); await click('.tab', 'Jouer'); await click('.setup-navigation button', 'Stuff');
    // Save a complete first variant, including spell choices and rolled item values.
    await tab('Sorts'); await click('input[aria-label="Apprendre Flamiche"]');
    await select('select[aria-label="Grade de Flamiche"]', 3); await click('button[aria-label="Monter Flamiche"]');
    await select('select[aria-label="Qualité des jets"]', 'random');
    const first = await save('Bouftou · Terre');
    assert.deepEqual(first.loadout, (await drafts())['A:IOP']);
    assert.equal(first.loadout.spells.grades[350], 3);
    // Replacing a set ring must include the lost seven-piece set bonus in the comparison.
    await tab('Équipements'); await select('select[aria-label="Qualité des jets"]', 'max');
    await click('[data-slot="ring1"]'); await fill('input[aria-label="Rechercher un équipement"]', 'Gelano'); await click('[data-item-id="2469"]');
    const delta = await page.evaluate(() => [...document.querySelectorAll('.equipment-comparison')].find(e => e.offsetParent).innerText);
    assert.match(delta, /Force\s+389\s+-10/); assert.doesNotMatch(delta, /^PA\s/m);
    // Create a second, independently saved build.
    await select('select[aria-label="Niveau du personnage"]', 143);
    await select('select[aria-label="Panoplie à équiper"]', 55); await click('.builder-set-tools button', 'Équiper la panoplie');
    await equip('ring2', 'Gelano', 2469); await equip('dofus1', 'Vulbis', 6980);
    await tab('Caractéristiques'); await click('.allocation-reset'); await click('[aria-label="Maximum en Force"]');
    await tab('Sorts'); await select('select[aria-label="Grade de Flamiche"]', 6); await click('input[aria-label="Apprendre Cawotte"]');
    const second = await save('Meulou · Mobilité', true);
    assert.deepEqual((await lib()).builds.find(b => b.id === first.id), first);
    assert.equal(second.loadout.level, 143); assert.equal(second.loadout.slots.ring2, 2469);
    assert.equal(second.loadout.slots.dofus1, 6980); assert.equal(second.loadout.spells.grades[350], 6);
    console.log('Two independent builds saved with equipment, level, rolls, characteristics and spells. Set-aware comparison verified.');
    await page.reload({ waitUntil: 'networkidle0' }); await click('.tab', 'Jouer'); await click('.setup-navigation button', 'Stuff');
    assert.equal((await lib()).builds.length, 2);
    await quickLoad(first.id); assert.deepEqual((await drafts())['A:IOP'], first.loadout);
    await tab('Sorts');
    assert.equal(await page.evaluate(() => [...document.querySelectorAll('select[aria-label="Grade de Flamiche"]')].find(e => e.offsetParent).value), '3');
    await select('select[aria-label="Qualité des jets"]', 'max');
    await click('.stuff-save-actions button', 'Mettre à jour');
    let library = await lib();
    assert.equal(library.builds.find(b => b.id === first.id).loadout.rollMode, 'max');
    assert.deepEqual(library.builds.find(b => b.id === second.id), second);
    // Rename, duplicate and undo delete without overwriting another save.
    await click('.stuff-library-toggle');
    await cardClick(first.id, 'Renommer'); await fill('input[aria-label="Nom du stuff"]', 'Bouftou · Terre classique'); await click('.stuff-name-form button[type="submit"]');
    await cardClick(first.id, 'Dupliquer'); library = await lib();
    const copy = library.builds.find(b => ![first.id, second.id].includes(b.id));
    assert.ok(copy); await cardClick(copy.id, 'Supprimer'); assert.equal((await lib()).builds.length, 2);
    await click('.stuff-notice button', 'Annuler l’action'); assert.equal((await lib()).builds.length, 3);
    assert.deepEqual((await lib()).builds.find(b => b.id === copy.id), copy);
    await cardClick(copy.id, 'Supprimer');
    console.log('Reload, quick loading, explicit updates, rename, duplicate and deletion undo verified.');
    // Builds are reusable by either side, and loading a different class switches that combatant only.
    await click('.setup-navigation button', 'Combat'); await click('.match-advanced summary'); await select('select[aria-label="Apparence adverse"]', 'female');
    await click('.edit-opponent'); await select('select[aria-label="Qualité des jets"]', 'average');
    const cra = await save('Crâ · Feu'); const opponentDraft = (await drafts())['B:CRA'];
    await click('.opponent-edit-banner button'); await click('.stuff-library-toggle'); await select('select[aria-label="Classes de la bibliothèque"]', 'all');
    await cardClick(cra.id, 'Charger');
    assert.deepEqual((await drafts())['A:CRA'], cra.loadout); assert.deepEqual((await drafts())['B:CRA'], opponentDraft);
    await cardClick(second.id, 'Charger'); assert.deepEqual((await drafts())['A:IOP'], second.loadout);
    // Undo loading restores both the old build association and its draft.
    await click('.stuff-notice button', 'Annuler l’action');
    assert.deepEqual((await drafts())['A:CRA'], cra.loadout);
    await cardClick(second.id, 'Charger');
    await fill('input[aria-label="Rechercher un stuff"]', 'meulou');
    assert.equal(await page.evaluate(() => [...document.querySelectorAll('.stuff-card')].filter(e => e.offsetParent).length), 1);
    await fill('input[aria-label="Rechercher un stuff"]', '');
    assert.equal(await page.evaluate(() => [...document.querySelectorAll('.stuff-card')].filter(e => e.offsetParent).length), 3);
    await shot('.stuff-library', 'saved-stuffs.png');
    await click('button[aria-label="Fermer la bibliothèque"]'); await click('button[aria-label="Fermer la notification"]');
    await tab('Équipements');
    // Verify filtering, sorting, and preview without changing the chosen build.
    await click('[data-slot="hat"]'); await fill('input[aria-label="Rechercher un équipement"]', 'meulou');
    await click('.equipment-result');
    await fill('input[aria-label="Rechercher un équipement"]', '');
    await select('select[aria-label="Trier les équipements"]', 'level-asc');
    await fill('input[aria-label="Niveau minimum des objets"]', '120');
    await fill('input[aria-label="Niveau maximum des objets"]', '143');
    const levels = await page.evaluate(() => [...document.querySelectorAll('.equipment-result')].filter(e => e.offsetParent).map(e => Number(e.querySelector('.equipment-item-level').textContent.match(/\d+/)[0])));
    assert.ok(levels.length); assert.ok(levels.every(n => n >= 120 && n <= 143));
    assert.deepEqual(levels, [...levels].sort((a,b) => a-b));
    await click('.equipment-filter-row button', 'Effacer'); await select('select[aria-label="Trier les équipements"]', 'level-desc');
    await shot('.loadout-picker', 'equipment-builder.png');
    await shot('.loadout-workbench', 'equipment-workbench.png');
    console.log('Both combatants, cross-class loading, draft restoration, filtering and sorting verified.');
    // Mobile layout: check all three panes and the saved-build library.
    await page.setViewport({ width: 390, height: 844 });
    for (const name of ['Équipements', 'Caractéristiques', 'Sorts']) {
      await tab(name);
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) {
        console.log(await page.evaluate(() => [...document.querySelectorAll('body *')].filter(e => e.offsetParent && e.getBoundingClientRect().right > innerWidth + 1).map(e => ({ tag: e.tagName, class: e.className, width: e.getBoundingClientRect().width, right: e.getBoundingClientRect().right, text: e.textContent.slice(0,75) })).slice(0,25)));
        await page.screenshot({ path: `${out}/mobile-overflow.png`, fullPage: true });
      }
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Mobile overflow: ${name}`);
    }
    await tab('Équipements'); await click('.stuff-library-toggle');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Mobile library overflow');
    await shot('.stuff-library', 'saved-stuffs-mobile.png'); await click('button[aria-label="Fermer la bibliothèque"]');
    await shot('.loadout-picker', 'equipment-builder-mobile.png');
    await page.setViewport({ width: 1500, height: 1150 });
    // A real human fight uses exactly the selected saved snapshot.
    await click('.setup-navigation button', 'Combat'); await select('select[aria-label="Carte de combat"]', 'arene'); await click('.btn.primary', 'Jouer');
    await page.waitForSelector('.fighter-card');
    await page.evaluate(() => { const original = URL.createObjectURL; URL.createObjectURL = blob => { window.loadoutCombatExport = blob; return original(blob); }; });
    await click('.combat-log-heading button', 'Exporter');
    const combat = await page.evaluate(async () => JSON.parse(await window.loadoutCombatExport.text()));
    assert.deepEqual(combat.state.fighters.A.loadout, second.loadout);
    assert.deepEqual(combat.state.fighters.B.loadout, opponentDraft);
    assert.equal(combat.state.fighters.A.level, 143); assert.equal(combat.state.fighters.A.loadout.spells.grades[350], 6);
    await page.screenshot({ path: `${out}/saved-stuff-combat.png` });
    await click('.btn', 'Abandonner'); await click('.tools-menu summary'); await click('.tools-dropdown button', 'Arène');
    assert.equal(await page.evaluate(() => [...document.querySelectorAll('.stuff-library-toggle')].find(e => e.offsetParent).textContent), 'Mes stuffs 3');
    await quickLoad(second.id); assert.deepEqual((await drafts())['A:IOP'], second.loadout);
    await click('.stuff-library-toggle'); await select('select[aria-label="Classes de la bibliothèque"]', 'all'); await cardClick(cra.id, 'Charger');
    assert.equal(await page.evaluate(() => [...document.querySelectorAll('select[aria-label="Apparence du joueur"]')].find(e => e.offsetParent).value), 'female');
    const actorId = JSON.parse(fs.readFileSync('public/dofus-local/manifest.json', 'utf8')).classes.CRA.female;
    assert.ok(await page.evaluate(id => [...document.querySelectorAll('.loadout-side.side-A img')].find(e => e.offsetParent).src.endsWith(`/portraits/${id}.png`), actorId));
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
    fs.writeFileSync(`${out}/proof.json`, JSON.stringify({ errors, external, builds: (await lib()).builds.map(b => ({ id: b.id, name: b.name, classId: b.classId })), checks: ['two complete builds', 'set-aware comparison', 'reload', 'quick load', 'update isolation', 'rename', 'duplicate', 'delete undo', 'both sides', 'class switching', 'load undo', 'search', 'level filters', 'sort', 'mobile all panes', 'actual combat snapshot', 'shared Arena library'] }, null, 2));
    console.log(`Saved stuff used in combat; shared Arena library and offline browser proof passed: ${out}`);
  } finally { await browser.disconnect(); browser.process()?.kill('SIGKILL'); }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => process.exit(process.exitCode || 0));
