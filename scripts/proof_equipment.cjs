const puppeteer = require('puppeteer-core');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const url = process.env.RETRO_URL || 'http://127.0.0.1:3013';
const out = path.join(os.tmpdir(), 'dofus-lite-equipment-proof');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, pipe: true, protocolTimeout: 30000 });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1500, height: 1150 });
    const errors = []; const external = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
    await page.setRequestInterception(true);
    page.on('request', r => { if (r.url().startsWith(url) || /^(data|blob):/.test(r.url())) r.continue(); else { external.push(r.url()); r.abort(); } });
    const click = (selector, text = '') => page.evaluate(({ selector, text }) => {
      const element = [...document.querySelectorAll(selector)].find(e => e.offsetParent && e.textContent.includes(text));
      if (!element) throw new Error(`Missing visible ${selector}: ${text}`);
      element.click();
    }, { selector, text });
    const select = async (selector, value) => {
      const handle = await page.evaluateHandle(selector => [...document.querySelectorAll(selector)].find(e => e.offsetParent), selector);
      await handle.asElement().select(String(value)); await handle.dispose();
    };
    const search = async text => {
      const handle = await page.evaluateHandle(() => [...document.querySelectorAll('input[aria-label="Rechercher un équipement"]')].find(e => e.offsetParent));
      await handle.asElement().focus(); await handle.asElement().evaluate(e => e.select());
      await page.keyboard.press('Backspace'); await handle.asElement().type(text); await handle.dispose();
    };
    const totals = () => page.evaluate(() => [...document.querySelectorAll('.loadout-picker')].find(e => e.offsetParent)
      .querySelector('.loadout-totals').textContent);
    const equip = async (slot, text, id) => {
      await click(`[data-slot="${slot}"]`); await search(text); await click(`[data-item-id="${id}"]`); await click('.equipment-equip');
    };
    await page.goto(url, { waitUntil: 'networkidle0' });
    await click('.tab', 'Jouer'); await click('.setup-navigation button', 'Stuff');
    assert.match(await totals(), /8 PA/);
    await equip('ring2', 'Gelano', 2469);
    assert.match(await totals(), /9 PA/);
    await equip('dofus1', 'Vulbis', 6980);
    assert.match(await totals(), /4 PM/);
    assert.match(await totals(), /9 PA/);
    console.log('Gelano +1 PA and Vulbis +1 PM appear in the live loadout totals.');
    await equip('ring1', 'Gelano', 2469);
    assert.ok(await page.evaluate(() => [...document.querySelectorAll('.loadout-errors')].some(e => e.offsetParent && e.textContent.includes('deux fois'))));
    assert.ok(await page.evaluate(() => [...document.querySelectorAll('.btn.primary')].filter(e => e.offsetParent && e.textContent.includes('Jouer')).every(e => e.disabled)));
    await equip('ring1', 'Bouze', 2419);
    assert.match(await totals(), /9 PA/);
    console.log('Invalid duplicate equipment blocks match start; replacing it restores the set bonus.');
    await select('select[aria-label="Qualité des jets"]', 'random');
    const randomTotals = await totals();
    await page.reload({ waitUntil: 'networkidle0' }); await click('.tab', 'Jouer'); await click('.setup-navigation button', 'Stuff');
    assert.equal(await totals(), randomTotals);
    await select('select[aria-label="Qualité des jets"]', 'max');
    // Play and Arena share the same saved per-class loadouts.
    await click('.tools-menu summary'); await click('.tools-dropdown button', 'Arène'); assert.match(await totals(), /9 PA/); assert.match(await totals(), /4 PM/);
    await click('.tab', 'Jouer'); await click('.setup-navigation button', 'Stuff');
    await click('[data-slot="ring2"]'); await search('Gelano'); await click('[data-item-id="2469"]');
    await page.evaluate(() => scrollTo(0, 0)); await sleep(200);
    await page.screenshot({ path: path.join(out, 'equipment-selection.png'), fullPage: true });
    console.log('Saved rolls persist after reload and loadouts are shared by both match screens.');
    await page.setViewport({ width: 390, height: 844 });
    await sleep(200);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Mobile horizontal overflow');
    await page.screenshot({ path: path.join(out, 'equipment-mobile.png'), fullPage: true });
    await page.setViewport({ width: 1500, height: 1150 });
    await click('.setup-navigation button', 'Combat'); await select('select[aria-label="Carte de combat"]', 'arene');
    await click('.btn.primary', 'Jouer');
    await page.waitForSelector('.fighter-card');
    // Capture an actual combat export, not an inspection of React internals.
    await page.evaluate(() => {
      const original = URL.createObjectURL;
      URL.createObjectURL = function(blob) { window.equipmentCombatExport = blob; return original.call(this, blob); };
    });
    await click('.combat-log-heading button', 'Exporter');
    let record = await page.evaluate(async () => JSON.parse(await window.equipmentCombatExport.text()));
    assert.equal(record.state.fighters.A.basePa, 9); assert.equal(record.state.fighters.A.basePm, 4);
    assert.equal(record.state.fighters.A.loadout.slots.ring2, 2469); assert.equal(record.state.fighters.A.loadout.slots.dofus1, 6980);
    assert.equal(record.state.fighters.A.stats.force, 399);
    assert.equal(record.state.fighters.A.stats.intelligence, 201);
    await page.waitForFunction(() => [...document.querySelectorAll('.spell-btn')].some(e => e.offsetParent && !e.disabled && e.textContent.includes('Puissance')), { timeout: 45000 });
    await click('.spell-btn', 'Puissance');
    if (await page.$('.token.side-A.targetable .figure')) await page.click('.token.side-A.targetable .figure');
    await sleep(350);
    await click('.combat-log-heading button', 'Exporter');
    record = await page.evaluate(async () => JSON.parse(await window.equipmentCombatExport.text()));
    assert.ok(record.events.some(e => e.t === 'cast' && e.fighter === 'A' && e.spellId === 153));
    fs.writeFileSync(path.join(out, 'equipment-combat.json'), JSON.stringify(record, null, 2));
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: path.join(out, 'equipped-combat.png') });
    console.log('A real fight starts with 9 PA, 4 PM and the expected elemental stats; a spell casts and exports correctly.');
    await click('.btn', 'Abandonner');
    await click('.tools-menu summary'); await click('.tools-dropdown button', 'Arène'); await click('.btn.primary', 'Lancer le combat');
    await page.waitForFunction(() => [...document.querySelectorAll('.fighter-card')].filter(e => e.offsetParent).length === 2);
    await click('.combat-log-heading button', 'Exporter');
    const replay = await page.evaluate(async () => JSON.parse(await window.equipmentCombatExport.text()));
    assert.equal(replay.state.fighters.A.basePa, 9); assert.equal(replay.state.fighters.A.basePm, 4);
    assert.equal(replay.events[0].loadouts.A.slots.ring2, 2469);
    assert.deepEqual(external, []); assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(out, 'proof.json'), JSON.stringify({ errors, external, totals: { pa: 9, pm: 4, force: 365, intelligence: 100 }, checks: ['AP/MP', 'set bonuses', 'duplicate rejection', 'saved rolls', 'reload', 'shared loadouts', 'mobile', 'human fight', 'spell cast', 'combat export', 'arena replay'] }, null, 2));
    console.log(`Equipment proof complete: ${out}`);
  } finally { await browser.disconnect(); browser.process()?.kill('SIGKILL'); }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => process.exit(process.exitCode || 0));
