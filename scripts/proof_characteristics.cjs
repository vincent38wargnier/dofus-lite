const puppeteer = require('puppeteer-core');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const url = process.env.RETRO_URL || 'http://127.0.0.1:3013';
const out = '/tmp/dofus-character-points';

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, pipe: true, protocolTimeout: 30000 });
  try {
    const page = await browser.newPage(); await page.setViewport({ width: 1500, height: 1100 });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
    const handle = selector => page.evaluateHandle(s => [...document.querySelectorAll(s)].find(e => e.checkVisibility()), selector);
    const click = async (selector, text = '') => {
      const h = await page.evaluateHandle(({ selector, text }) => [...document.querySelectorAll(selector)].find(e => e.checkVisibility() && e.textContent.includes(text)), { selector, text });
      assert.ok(h.asElement(), `Missing visible ${selector}: ${text}`);
      assert.ok(!await h.asElement().evaluate(e => e.disabled), `Disabled ${selector}: ${text}`);
      await h.asElement().click(); await h.dispose();
    };
    const select = async (selector, value) => { const h = await handle(selector); await h.asElement().select(String(value)); await h.dispose(); };
    const fill = async (selector, value) => {
      const h = await handle(selector); await h.asElement().focus(); await h.asElement().evaluate(e => e.select());
      await page.keyboard.press('Backspace'); await h.asElement().type(String(value)); await page.keyboard.press('Tab'); await h.dispose();
    };
    const edit = (name, value) => fill(`input[aria-label="${name} de base"]`, value);
    const visibleText = selector => page.evaluate(s => [...document.querySelectorAll(s)].find(e => e.checkVisibility()).textContent, selector);
    const remaining = async () => Number(await visibleText('[data-remaining-points]'));
    const draft = (key = 'A:IOP') => page.evaluate(key => JSON.parse(localStorage.getItem('dofus-lite-loadouts-v1'))[key], key);
    const inputValue = async name => { const h = await handle(`input[aria-label="${name} de base"]`); const v = await h.asElement().evaluate(e => e.value); await h.dispose(); return Number(v); };
    const shot = async name => { const h = await handle('.characteristic-allocator'); await h.asElement().screenshot({ path: `${out}/${name}.png` }); await h.dispose(); };
    const noOverflow = async width => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Overflow at ${width}`);
    await page.goto(url, { waitUntil: 'networkidle0' });
    await click('.allocation-reset'); assert.equal(await remaining(), 495);
    await edit('Vitalité', 100); await edit('Sagesse', 50); await edit('Force', 100);
    assert.equal(await remaining(), 44);
    assert.match(await visibleText('[data-allocation-stat="force"] .allocation-cost'), /3 pour \+1/);
    assert.match(await visibleText('[data-allocation-stat="force"] .allocation-parchment'), /101/);
    assert.equal(Number((await visibleText('[data-allocation-stat="force"] .allocation-gear')).replace('Stuff', '').trim()), 100);
    assert.equal(Number(await visibleText('[data-allocation-stat="force"] .allocation-total strong')), 301);
    await click('[aria-label="Maximum en Force"]');
    assert.equal(await inputValue('Force'), 114); assert.equal(await inputValue('Vitalité'), 100); assert.equal(await remaining(), 2);
    await edit('Force', 115);
    assert.equal(await inputValue('Force'), 114); assert.match(await visibleText('.allocation-error'), /Capital insuffisant/);
    await click('[aria-label="Maximum en Vitalité"]'); assert.equal(await remaining(), 0);
    await click('[aria-label="Diminuer Force"]'); assert.equal(await remaining(), 3);
    await edit('Force', 98); assert.equal(await remaining(), 47);
    await click('[aria-label="Augmenter Force"]'); assert.equal(await remaining(), 45);
    await click('[aria-label="Augmenter Force"]'); assert.equal(await remaining(), 42);
    console.log('Mixed manual entry, tier crossings, exact refunds, Max remainder and equipment separation passed.');

    await click('[aria-label="Choisir Féca"]'); await click('.allocation-reset'); await edit('Force', 49);
    assert.match(await visibleText('[data-allocation-stat="force"] .allocation-cost'), /4 pour \+1/);
    assert.equal(await remaining(), 348);
    await click('[aria-label="Choisir Sacrieur"]'); await click('.allocation-reset');
    await select('select[aria-label="Niveau du personnage"]', 2);
    await click('[aria-label="Augmenter Vitalité"]'); assert.equal(await inputValue('Vitalité'), 2); assert.equal(await remaining(), 4);
    await edit('Vitalité', 3); assert.equal(await inputValue('Vitalité'), 2); assert.match(await visibleText('.allocation-error'), /nombre pair/);
    await click('[aria-label="Maximum en Vitalité"]'); assert.equal(await inputValue('Vitalité'), 10); assert.equal(await remaining(), 0);
    await select('select[aria-label="Niveau du personnage"]', 1);
    assert.equal(await inputValue('Vitalité'), 10);
    assert.match(await visibleText('.allocation-budget'), /5points en trop/);
    await click('.allocation-reset'); assert.equal(await remaining(), 0);
    assert.equal(await page.$$eval('.characteristic-allocator button[aria-label^="Augmenter"]', es => es.filter(e => e.checkVisibility() && !e.disabled).length), 0);

    await click('[aria-label="Choisir Iop"]'); await select('select[aria-label="Niveau du personnage"]', 200); await click('.allocation-reset');
    for (const [stat, amount] of [['Force', 150], ['Vitalité', 200], ['Intelligence', 20], ['Chance', 10], ['Agilité', 10], ['Sagesse', 70]]) await edit(stat, amount);
    assert.equal(await remaining(), 34);
    const mixed = await draft();
    await click('.allocation-tiers summary');
    assert.equal(await page.$$eval('.allocation-tiers dl > div', es => es.filter(e => e.checkVisibility()).length), 6);
    await shot('repartition-paliers'); await click('.allocation-tiers summary');
    await shot('repartition-desktop');
    await click('.stuff-save-actions button', 'Enregistrer ce stuff');
    await fill('input[aria-label="Nom du stuff"]', 'Iop · Répartition mixte'); await click('.stuff-name-form button[type="submit"]');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('dofus-lite-stuff-library-v1')).builds[0]);
    assert.deepEqual(saved.loadout.base, mixed.base);
    await page.reload({ waitUntil: 'networkidle0' }); assert.deepEqual((await draft()).base, mixed.base);
    await click('.allocation-reset'); await select('select[aria-label="Charger un stuff"]', saved.id);
    assert.deepEqual((await draft()).base, mixed.base);
    await select('select[aria-label="Niveau du personnage"]', 100);
    assert.deepEqual((await draft()).base, mixed.base); assert.equal(await remaining(), 466);
    assert.match(await visibleText('.allocation-budget'), /points en trop/);
    assert.ok(await page.$eval('.setup-play', e => e.disabled));
    await edit('Vitalité', 100); assert.equal(await inputValue('Vitalité'), 100); // Refund while still over budget.
    await select('select[aria-label="Charger un stuff"]', saved.id);
    assert.deepEqual((await draft()).base, mixed.base);
    for (const width of [1500, 1100, 820, 390]) {
      await page.setViewport({ width, height: width < 600 ? 844 : 1100 }); await noOverflow(width);
      if (width === 390) {
        const h = await handle('.characteristic-allocator');
        await h.asElement().evaluate(e => { document.activeElement.blur(); e.scrollIntoView({ block: 'start' }); scrollBy(0, -70); });
        await page.screenshot({ path: `${out}/repartition-mobile.png` }); await h.dispose();
      }
    }
    await page.setViewport({ width: 1500, height: 1100 });
    await click('.setup-navigation button', 'Stuff'); await click('.builder-navigation button', 'Caractéristiques');
    assert.equal(await inputValue('Force'), 150); assert.equal(await inputValue('Sagesse'), 70); assert.equal(await remaining(), 34);
    await page.evaluate(() => { const original = URL.createObjectURL; URL.createObjectURL = blob => { window.allocationExport = blob; return original(blob); }; });
    await click('.setup-play'); await page.waitForSelector('.fight-heading');
    await click('.combat-log-heading button', 'Exporter');
    const record = await page.evaluate(async () => JSON.parse(await window.allocationExport.text()));
    assert.deepEqual(record.state.fighters.A.loadout.base, mixed.base);
    assert.deepEqual(errors, []);
    fs.writeFileSync(`${out}/browser-proof.json`, JSON.stringify({ errors, base: mixed.base, saved: saved.id,
      checks: ['manual mixed allocation', 'exact capital and gear totals', 'tier crossing and refund', 'Max keeps other investments', 'overspend rejected', 'class-specific costs', 'Sacrieur double vitality and odd rejection', 'zero capital at level 1', 'tier details', 'saved build reload', 'level decrease preserves allocation and blocks combat', 'four viewport widths', 'shared builder', 'combat snapshot'] }, null, 2));
    console.log(`Characteristic browser proof passed: ${out}`);
  } finally { await browser.disconnect(); browser.process()?.kill('SIGKILL'); }
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => process.exit(process.exitCode || 0));
