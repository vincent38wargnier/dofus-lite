// Isolated browser proof; does not read or replace the user's saved builds.
const puppeteer = require('puppeteer-core');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const url = process.env.RETRO_URL || 'http://127.0.0.1:3013';
const out = path.join(os.tmpdir(), 'dofus-lite-forgemagie-proof');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, pipe: true });
  let page;
  try {
    page = await browser.newPage();
    await page.setViewport({ width: 1500, height: 1150 });
    const errors = [], external = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
    await page.setRequestInterception(true);
    page.on('request', r => { if (r.url().startsWith(url) || /^(data|blob):/.test(r.url())) r.continue(); else { external.push(r.url()); r.abort(); } });
    const click = (selector, text = '') => page.evaluate(({ selector, text }) => {
      const e = [...document.querySelectorAll(selector)].find(e => e.offsetParent && e.textContent.includes(text));
      if (!e || e.disabled) throw new Error(`Unavailable: ${selector} ${text}`);
      e.click();
    }, { selector, text });
    const handle = selector => page.evaluateHandle(selector => [...document.querySelectorAll(selector)].find(e => e.offsetParent), selector);
    const select = async (selector, value) => { const h = await handle(selector); await h.asElement().select(String(value)); await h.dispose(); };
    const fill = async (selector, value) => { const h = await handle(selector); await h.asElement().focus(); await h.asElement().evaluate(e => e.select()); await page.keyboard.press('Backspace'); await h.asElement().type(String(value)); await page.keyboard.press('Tab'); await h.dispose(); };
    const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('dofus-lite-loadouts-v1'))?.['A:IOP']);
    const forge = async () => (await stored())?.forgedItems?.ring2;
    const library = () => page.evaluate(() => JSON.parse(localStorage.getItem('dofus-lite-stuff-library-v1')));
    const tab = label => click('.builder-navigation button', label);
    const shot = async name => { const h = await handle('.fm-workspace'); await h.asElement().screenshot({ path: path.join(out, name) }); await h.dispose(); };
    const save = async (name, copy = false) => {
      await click('.stuff-save-actions button', copy ? 'Enregistrer sous' : 'Enregistrer ce stuff');
      await fill('input[aria-label="Nom du stuff"]', name); await click('.stuff-name-form button[type="submit"]');
      return (await library()).builds.find(b => b.name === name);
    };

    await page.goto(url, { waitUntil: 'networkidle0' });
    await click('.setup-navigation button', 'Stuff');
    await click('[data-slot="weapon"]'); await fill('input[aria-label="Rechercher un équipement"]', 'God Rod');
    await click('[data-item-id="200"]'); await click('.equipment-equip');
    await click('[data-slot="ring1"]'); await fill('input[aria-label="Rechercher un équipement"]', 'Gelano');
    await click('[data-item-id="2469"]'); await click('.equipment-equip');
    await click('[data-slot="ring2"]'); await fill('input[aria-label="Rechercher un équipement"]', 'Blopanneau Coco Royal');
    await click('[data-item-id="9128"]'); await click('.equipment-equip'); await click('.equipment-forge');
    await page.waitForSelector('.fm-workspace');
    const grid = () => page.evaluate(() => [...document.querySelectorAll('.fm-workshop')].find(e => e.offsetParent)
      .querySelector('.fm-rune-grid')?.outerHTML);
    const rowStats = () => page.evaluate(() => [...document.querySelectorAll('[data-rune-stat]')].filter(e => e.offsetParent).map(e => e.dataset.runeStat));
    assert.deepEqual((await rowStats()).sort(), ['vitalite', 'agilite', 'sagesse', 'damage', 'initiative', 'prospecting'].sort());
    const beforeSelection = await stored();
    await click('[data-rune-id="1552"]'); // Ra Sa, without first choosing a characteristic.
    assert.deepEqual(await stored(), beforeSelection, 'Rune selection must never forge the item');
    await click('.fm-add-runes summary');
    await fill('input[aria-label="Rechercher d’autres runes"]', 'Ga Pa');
    await click('[data-extra-stat="pa"]');
    await click('[data-rune-id="1557"]');
    assert.ok((await grid()).includes('Ga Pa'));
    assert.equal(await page.evaluate(() => document.querySelector('[data-rune-id="1557"][aria-pressed="true"]') !== null), true);
    await click('[data-extra-stat="pa"]');
    assert.ok(!(await rowStats()).includes('pa'), 'Removing the selected extra falls back to an item rune');
    await fill('input[aria-label="Rechercher d’autres runes"]', 'Ga Pme');
    await click('[data-extra-stat="pm"]');
    await click('[data-rune-id="1558"]');
    await click('[data-forge-slot="ring1"]');
    assert.deepEqual(await rowStats(), ['pa'], 'Gelano automatically shows Ga Pa only');
    await click('[data-forge-slot="weapon"]');
    assert.ok((await rowStats()).includes('pa'), 'Weapon bonuses choose their matching runes');
    assert.ok(!(await rowStats()).includes('pm'), 'Added runes must not leak to another item');
    await click('[data-forge-slot="ring2"]');
    assert.ok((await rowStats()).includes('pm'), 'An item retains its added runes when switching back');
    await click('.fm-add-runes summary');
    await click('[data-extra-stat="pm"]');
    await click('.fm-add-runes summary');
    assert.deepEqual(await stored(), beforeSelection, 'Choosing optional runes must leave the equipment intact');
    await click('.fm-details summary', 'Jet de départ');
    await fill('input[aria-label="Jet initial Sagesse"]', 12);
    await fill('input[aria-label="Puits initial"]', 20);
    assert.equal((await forge()).stats.sagesse, 12); assert.equal((await forge()).puits, 20);
    const guaranteed = 'input[aria-label="Succès critique garanti"]';
    assert.equal(await page.$eval(guaranteed, e => e.checked), false);
    await click('.fm-add-runes summary'); await click('[data-extra-stat="pm"]');
    await click('[data-rune-id="1558"]'); await click('.fm-add-runes summary');
    assert.equal(await page.$eval('.fm-chances dd', e => e.textContent.trim()), '1 %');
    const displayedChances = () => page.$$eval('.fm-chances dd', cells => cells.map(e => e.textContent.trim()));
    const normalPMChances = await displayedChances();
    await click(guaranteed);
    assert.deepEqual(await displayedChances(), normalPMChances, 'Guaranteed mode keeps the normal probability display');
    await shot('succes-garanti-chances-normales.png');
    const beforeGuaranteed = await forge();
    await click('.fm-fuse');
    assert.deepEqual((await forge()).stats, { ...beforeGuaranteed.stats, pm: 1 });
    assert.equal((await forge()).puits, 20);
    assert.equal((await forge()).history.at(-1).chances.guaranteedSuccess, true);
    assert.equal((await forge()).history.at(-1).chances.SC, 1, 'The actual fusion remains guaranteed');
    assert.equal((await forge()).history.at(-1).outcome, 'SC');
    assert.equal(await page.$eval('.fm-fuse', e => e.disabled), true, 'A second PM is blocked in guaranteed mode');
    await click('.fm-details button', 'Recommencer au jet naturel');
    await fill('input[aria-label="Jet initial Sagesse"]', 12); await fill('input[aria-label="Puits initial"]', 20);
    await click('[data-rune-id="1552"]'); await click('.fm-batch');
    await page.waitForFunction(() => [...document.querySelectorAll('.fm-batch')].some(e => e.offsetParent && e.disabled));
    assert.equal((await forge()).attempts, 2, 'Guaranteed batches continue past SC and stop at the cap');
    assert.equal((await forge()).stats.sagesse, 32); assert.equal((await forge()).puits, 20);
    assert.ok((await forge()).history.every(e => e.outcome === 'SC' && e.chances.guaranteedSuccess));
    await click('[data-rune-id="1521"]');
    await shot('succes-critique-garanti.png');
    const guaranteedSaved = await forge();
    await page.reload({ waitUntil: 'networkidle0' }); await click('.setup-navigation button', 'Stuff'); await tab('Forgemagie');
    await click('[data-forge-slot="ring2"]');
    assert.equal(await page.$eval(guaranteed, e => e.checked), true, 'Guaranteed mode survives reload');
    assert.deepEqual(await forge(), guaranteedSaved);
    await click('[data-rune-id="1521"]');
    const normalSaChances = await displayedChances();
    await click(guaranteed);
    assert.deepEqual(await displayedChances(), normalSaChances, 'Toggling the mode does not change the displayed estimate');
    assert.notEqual(await page.$eval('.fm-chances dd', e => e.textContent.trim()), '100 %');
    await click('.fm-details summary', 'Jet de départ'); await click('.fm-details button', 'Recommencer au jet naturel');
    await fill('input[aria-label="Jet initial Sagesse"]', 12); await fill('input[aria-label="Puits initial"]', 20);
    await click('[data-rune-id="1521"]');
    for (let n = 0; n < 5; n++) { await click('.fm-fuse'); await pause(60); }
    assert.equal((await forge()).attempts, 5);
    assert.equal((await forge()).consumption[1521], 5);
    const frozen = await forge();
    await select('select[aria-label="Qualité des jets"]', 'average');
    assert.deepEqual(await forge(), frozen);
    await click('.fm-repeat-options input[type="checkbox"]');
    await click('.fm-batch'); await pause(350); await click('.fm-stop');
    const stopped = await forge(); await pause(600); assert.deepEqual(await forge(), stopped);
    // Hidden screens must never keep spending runes.
    await select('select[aria-label="Nombre de fusions"]', 100); await click('.fm-batch');
    await click('.tabs > .tab', 'Grimoire'); await pause(400);
    const hidden = await forge(); await pause(600); assert.deepEqual(await forge(), hidden);
    await click('.tabs > .tab', 'Jouer');
    await shot('atelier-desktop.png');
    const first = await save('Coco · première forgemagie');
    assert.deepEqual(first.loadout.forgedItems.ring2, await forge());
    await click('.fm-fuse'); await pause(80);
    const second = await save('Coco · seconde forgemagie', true);
    assert.notDeepEqual(first.loadout.forgedItems.ring2, second.loadout.forgedItems.ring2);
    assert.deepEqual((await library()).builds.find(b => b.id === first.id), first);
    await page.reload({ waitUntil: 'networkidle0' }); await click('.setup-navigation button', 'Stuff'); await tab('Forgemagie');
    await click('[data-forge-slot="ring2"]');
    assert.deepEqual(await forge(), second.loadout.forgedItems.ring2);
    await select('select[aria-label="Charger un stuff"]', first.id);
    assert.deepEqual(await forge(), first.loadout.forgedItems.ring2);
    await click('.fm-details summary', 'Jet de départ');
    await click('.fm-details button', 'Reprendre le dernier jet capturé');
    const observed = await forge();
    assert.equal(observed.stats.vitalite, 84); assert.equal(observed.stats.sagesse, 13);
    assert.equal(observed.stats.agilite, 19); assert.equal(observed.stats.initiative, 137);
    assert.equal(observed.puits, 0); assert.equal(observed.origin, 'observed-with-unknown-puits');
    await page.evaluate(() => { const fn = URL.createObjectURL; URL.createObjectURL = b => { window.fmExport = b; return fn(b); }; });
    await click('.fm-journal-tools button', 'Exporter');
    const exported = await page.evaluate(async () => JSON.parse(await window.fmExport.text()));
    assert.deepEqual(exported.forge, observed);
    assert.ok((await rowStats()).includes('prospecting'), 'A natural bonus at zero keeps its runes in the grid');
    await click('[data-rune-id="1554"]');
    await shot('atelier-capture-reprise.png');
    for (const width of [390, 320]) {
      await page.setViewport({ width, height: 844 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Overflow at ${width}`);
      if (width === 390) {
        await page.evaluate(() => [...document.querySelectorAll('.fm-fusion-panel')].find(e => e.offsetParent).scrollIntoView({ block: 'start' }));
        await page.screenshot({ path: path.join(out, 'atelier-mobile.png') });
        const rune = await handle('[data-rune-id="1548"]');
        await rune.asElement().evaluate(e => e.scrollIntoView({ block: 'center' }));
        await rune.asElement().click(); await rune.dispose();
        assert.ok(await page.evaluate(() => [...document.querySelectorAll('[data-rune-id="1548"]')].some(e => e.offsetParent && e.getAttribute('aria-pressed') === 'true')));
        const button = await handle('.fm-fuse');
        await button.asElement().evaluate(e => e.scrollIntoView({ block: 'center' }));
        await button.asElement().click(); await button.dispose(); await pause(80);
        assert.equal((await forge()).attempts, 1, 'The mobile fusion button must accept a real pointer click');
        await click('.fm-details button', 'Reprendre le dernier jet capturé');
        assert.deepEqual(await forge(), observed);
      }
    }
    await page.setViewport({ width: 1500, height: 1150 });
    // The actual match must receive the instance, not regenerate catalogue jets.
    await click('.setup-navigation button', 'Combat'); await select('select[aria-label="Carte de combat"]', 'arene');
    await click('.setup-play'); await page.waitForSelector('.fighter-card');
    await click('.combat-log-heading button', 'Exporter');
    const combat = await page.evaluate(async () => JSON.parse(await window.fmExport.text()));
    assert.deepEqual(combat.state.fighters.A.loadout.forgedItems.ring2, observed);
    assert.equal(combat.state.fighters.A.equipment.items.find(i => i.slot === 'ring2').effects.find(e => e.row[0] === 125).value, 84);
    await page.screenshot({ path: path.join(out, 'objet-forgemage-en-combat.png') });
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
    fs.writeFileSync(path.join(out, 'proof.json'), JSON.stringify({ errors, external, attempts: stopped.attempts,
      checks: ['normal chances displayed in both modes', 'guaranteed SC toggle', 'guaranteed PM without losses', 'guaranteed cap enforcement', 'guaranteed batch stops at cap', 'guaranteed preference reload', 'normal chance restore', 'automatic rune grid', 'all natural variants', 'extra rune search/add/remove', 'Ga Pa and Ga Pme', 'weapon/ring switching', 'zero stat retained', 'selection without fusion', 'mobile rune pointer click', 'fusion', 'reservoir', 'saved RNG', 'natural rolls independent', 'batch stop', 'hidden tab pause', 'independent named builds', 'reload', 'capture snapshot', 'export', '390px', '320px', 'real combat item instance'] }, null, 2));
    console.log(`Forgemagie browser proof passed: ${out}`);
  } catch (error) {
    if (page) await page.screenshot({ path: path.join(out, 'failure.png'), fullPage: true }).catch(() => {});
    throw error;
  } finally { await browser.disconnect(); browser.process()?.kill('SIGKILL'); }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => process.exit(process.exitCode || 0));
