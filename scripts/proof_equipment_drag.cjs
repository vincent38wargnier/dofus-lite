// Native Chrome mouse drags, isolated storage, and a persisted reload.
const puppeteer = require('puppeteer-core');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const data = require('../src/engine/equipmentData.json');
const out = process.env.PROOF_DIR || '/tmp/dofus-equipment-drag';
const url = process.env.PROOF_URL || 'http://127.0.0.1:3013';

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true, pipe: true, protocolTimeout: 30000,
  });
  const report = { errors: [], checks: [] };
  let page;
  try {
    page = await browser.newPage();
    await page.setViewport({ width: 1700, height: 1150 });
    await page.setDragInterception(true);
    page.on('pageerror', error => report.errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400) report.errors.push(`${response.status()} ${response.url()}`); });
    const gelano = { version: 1, model: 'retro-reconstruction-v3', itemId: 2469,
      stats: { pa: 1, pm: 1 }, baseEffects: data.items[2469].effects.map(row => ({ row, value: row[1] })),
      puits: 0, rngState: 17, attempts: 0, consumption: {}, history: [] };
    await page.evaluateOnNewDocument(forged => {
      if (!localStorage.getItem('equipment-drag-proof-seeded')) {
        const base = { version: 1, level: 200, base: {}, rollMode: 'random', rollSeed: 17 };
        localStorage.setItem('dofus-lite-player-setup-v1', JSON.stringify({ playerClass: 'IOP', botClass: 'CRA', mapId: 'arene' }));
        localStorage.setItem('dofus-lite-loadouts-v1', JSON.stringify({
          'A:IOP': { ...base, slots: { hat: 2411, ring1: 2469, ring2: 9128 }, forgedItems: { ring1: forged } },
          'B:CRA': { ...base, slots: {} },
        }));
        localStorage.setItem('equipment-drag-proof-seeded', '1');
      }
    }, gelano);
    const handle = async (selector, text = '') => {
      const element = await page.evaluateHandle(({ selector, text }) => [...document.querySelectorAll(selector)]
        .find(e => e.checkVisibility() && e.textContent.includes(text)), { selector, text });
      assert(element.asElement(), `Missing ${selector}: ${text}`);
      return element.asElement();
    };
    const click = async (selector, text = '') => { const e = await handle(selector, text); await e.click(); await e.dispose(); };
    const read = async (selector, fn) => { const e = await handle(selector); const value = await e.evaluate(fn); await e.dispose(); return value; };
    const search = async value => {
      const input = await handle('input[aria-label="Rechercher un équipement"]');
      await input.focus(); await input.evaluate(e => e.select()); await page.keyboard.press('Backspace');
      await input.type(value); await input.dispose();
    };
    const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('dofus-lite-loadouts-v1'))['A:IOP']);
    const slot = id => `.loadout-picker [data-slot="${id}"]`;
    const totals = () => read('.loadout-picker .loadout-totals', e => e.textContent);
    const drag = async (from, to, capture = false) => {
      const source = await handle(from), target = await handle(to);
      const payload = await source.drag(target);
      await target.dragEnter(payload); await target.dragOver(payload);
      if (capture) {
        assert.equal(await page.$$eval('.equipment-slot.drop-compatible', es => es.length), 6);
        assert(await read(slot('hat'), e => e.classList.contains('drop-blocked')));
        assert(await target.evaluate(e => e.classList.contains('drop-target')));
        await page.screenshot({ path: path.join(out, 'compatible-slots.png') });
      }
      await target.drop(payload); await page.mouse.up();
      await page.waitForFunction(() => !document.querySelector('.equipment-dragging'));
      await source.dispose(); await target.dispose();
    };

    await page.goto(url, { waitUntil: 'networkidle0' });
    await click('.setup-navigation button', 'Stuff');
    await click(slot('dofus1')); await search('Vulbis');
    await read('.loadout-workbench', e => e.scrollIntoView({ block: 'start' }));
    assert.match(await totals(), /4 PM/);
    await drag('.equipment-result[data-item-id="6980"]', slot('dofus6'), true);
    assert.equal((await saved()).slots.dofus6, 6980);
    assert.equal((await saved()).slots.dofus1, undefined);
    assert.match(await totals(), /5 PM/);
    report.checks.push('Catalogue Vulbis drops into Dofus 6 while Dofus 1 is selected; +1 MP, six valid slots highlighted');

    await search('Turquoise');
    await drag('.equipment-result[data-item-id="739"]', slot('dofus1'));
    const beforeDofus = await totals();
    await drag(slot('dofus6'), slot('dofus1'));
    assert.equal((await saved()).slots.dofus1, 6980);
    assert.equal((await saved()).slots.dofus6, 739);
    assert.equal(await totals(), beforeDofus);
    await drag(slot('dofus1'), slot('dofus3'));
    assert.equal((await saved()).slots.dofus1, null);
    assert.equal((await saved()).slots.dofus3, 6980);
    report.checks.push('Dofus swap with occupied slots and move into empty slots without changing bonuses');

    const beforeRings = await totals();
    await drag(slot('ring1'), slot('ring2'));
    assert.equal((await saved()).slots.ring1, 9128);
    assert.equal((await saved()).slots.ring2, 2469);
    assert.deepEqual((await saved()).forgedItems.ring2, gelano);
    assert.equal((await saved()).forgedItems.ring1, undefined);
    assert.equal(await totals(), beforeRings);
    report.checks.push('Native ring swap keeps the Gelano PA/PM forge and preserves total stats');

    const beforeInvalid = await saved();
    await drag(slot('hat'), slot('dofus2'));
    assert.deepEqual(await saved(), beforeInvalid);
    report.checks.push('Wrong equipment type is rejected without changing the loadout');

    await page.setDragInterception(false);
    const source = await handle(slot('ring2'));
    await source.hover(); await page.mouse.down();
    const point = await source.clickablePoint();
    await page.mouse.move(point.x + 100, point.y + 30, { steps: 12 });
    await page.waitForSelector('.equipment-dragging');
    await page.keyboard.press('Escape'); await page.mouse.up();
    await page.waitForFunction(() => !document.querySelector('.equipment-dragging'));
    assert.deepEqual(await saved(), beforeInvalid);
    await source.dispose();
    await page.setDragInterception(true);
    report.checks.push('Escape cancels a real mouse drag without changing equipment');

    // The inspected item is also draggable, and ordinary clicks still work after dragging.
    await click(slot('dofus1')); await search('Turquoise');
    await click('.equipment-result[data-item-id="739"]');
    await drag('.equipment-inspector-head', slot('dofus6'));
    assert.deepEqual(await saved(), beforeInvalid);
    await search('Tacheté');
    assert.equal(await read('.equipment-result[data-item-id="7112"]', e => e.draggable), false);
    report.checks.push('Inspector drag works; unsupported items cannot be dragged');

    const beforeReload = await saved();
    await page.reload({ waitUntil: 'networkidle0' });
    await click('.setup-navigation button', 'Stuff');
    assert.deepEqual(await saved(), beforeReload);
    assert.equal(await totals(), beforeRings);
    assert.match(await read(slot('ring2'), e => e.getAttribute('aria-label')), /Gelano/);
    assert.match(await read(slot('dofus3'), e => e.getAttribute('aria-label')), /Vulbis/);
    await click(slot('dofus3'));
    await read('.loadout-workbench', e => e.scrollIntoView({ block: 'start' }));
    const workbench = await handle('.loadout-workbench');
    await workbench.screenshot({ path: path.join(out, 'equipped-after-reload.png') });
    await workbench.dispose();
    report.checks.push('Equipment, random jet origins and FM persist after reloading the browser');

    await page.setViewport({ width: 390, height: 844 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'No mobile horizontal overflow');
    report.checks.push('Existing narrow-screen equipment layout still fits');
    assert.deepEqual(report.errors, []);
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    report.failure = error.message;
    if (page) await page.screenshot({ path: path.join(out, 'failure.png'), fullPage: true }).catch(() => {});
    throw error;
  } finally {
    fs.writeFileSync(path.join(out, 'proof.json'), JSON.stringify(report, null, 2));
    const child = browser.process();
    await browser.disconnect(); child?.kill('SIGTERM');
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
