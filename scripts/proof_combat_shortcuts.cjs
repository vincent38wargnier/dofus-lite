// Real mouse drag and keyboard input, with an isolated profile and persisted reload.
const puppeteer = require('puppeteer-core');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const url = process.env.PROOF_URL || 'http://127.0.0.1:3013';
const out = process.env.PROOF_DIR || '/tmp/dofus-combat-shortcuts';

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true, pipe: true, protocolTimeout: 30000,
  });
  const report = { errors: [] };
  let page;
  try {
    page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 1150 });
    await page.setDragInterception(true);
    page.on('pageerror', error => report.errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400) report.errors.push(`${response.status()} ${response.url()}`); });
    const cdp = await page.createCDPSession();
    await cdp.send('Page.setDownloadBehavior', { behavior: 'deny' });
    await page.evaluateOnNewDocument(() => {
      if (!localStorage.getItem('shortcut-proof-initialized')) {
        localStorage.setItem('dofus-lite-player-setup-v1', JSON.stringify({ playerClass: 'IOP', botClass: 'CRA', botId: 'shortcut-proof', mapId: 'arene' }));
        localStorage.setItem('koliseum.bots.v1', JSON.stringify([{ id: 'shortcut-proof', name: 'Sparring', custom: true, code: 'function decide(v,a){return a.endTurn();}' }]));
        const base = { version: 1, level: 200, slots: {}, rollMode: 'max', rollSeed: 1 };
        localStorage.setItem('dofus-lite-loadouts-v1', JSON.stringify({
          'A:IOP': { ...base, base: { force: 100 }, slots: { weapon: 2416 }, spells: { order: [0, 142, 141], common: [350], grades: { 350: 3 } } },
          'B:CRA': { ...base, base: {} },
        }));
        localStorage.setItem('shortcut-proof-initialized', 'true');
      }
      Math.random = () => .000007;
      const original = URL.createObjectURL;
      URL.createObjectURL = function (blob) { window.combatExport = blob; return original.call(this, blob); };
    });
    const slot = id => `.spell-slot[data-spell-id="${id}"]`;
    const click = async (selector, text = '') => {
      const handle = await page.evaluateHandle(({ selector, text }) => [...document.querySelectorAll(selector)]
        .find(e => e.checkVisibility() && e.textContent.includes(text)), { selector, text });
      assert(handle.asElement(), `Missing ${selector}: ${text}`);
      assert(!await handle.asElement().evaluate(e => e.disabled), `Disabled ${selector}: ${text}`);
      await handle.asElement().click(); await handle.dispose();
    };
    const barIds = () => page.$$eval('.spell-slot', slots => slots.map(e => Number(e.dataset.spellId)));
    const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('dofus-lite-loadouts-v1'))['A:IOP']);
    const selected = id => page.$eval(`${slot(id)} .spell-btn`, e => e.classList.contains('selected'));
    const drag = async (from, to) => {
      const source = await page.$(slot(from)), target = await page.$(slot(to));
      await source.scrollIntoView();
      await source.dragAndDrop(target, { delay: 80 });
      await source.dispose(); await target.dispose();
    };
    const start = async () => {
      await click('.setup-play'); await click('.placement-ready');
      await page.waitForFunction(() => !document.querySelector('.spell-slot[data-spell-id="153"] .spell-btn')?.disabled);
    };
    await page.goto(url, { waitUntil: 'networkidle0' });
    await start();
    report.before = await barIds();
    await drag(153, 0); // Puissance immediately after the pinned weapon.
    assert.deepEqual((await barIds()).slice(0, 2), [0, 153]);
    await drag(155, 142); // Vitalité follows Puissance.
    report.order = await barIds();
    assert.deepEqual(report.order.slice(0, 3), [0, 153, 155]);
    assert.deepEqual((await stored()).spells.order, report.order);
    assert.equal(await page.$('.spell-btn.selected'), null, 'Dragging must not select or cast a spell');

    await page.keyboard.down('2'); await page.keyboard.down('2'); await page.keyboard.up('2');
    assert.equal(await selected(153), true, '2 selects the spell after the weapon and ignores held-key repeats');
    await page.keyboard.press('Escape');
    assert.equal(await selected(153), false);
    await page.keyboard.press('2');
    await click('.token.side-A.targetable .figure');
    assert.equal(await page.$eval(`${slot(153)} .spell-btn`, e => e.disabled), true);
    await page.keyboard.press('2');
    assert.equal(await page.$('.spell-btn.selected'), null, 'Cooldown is respected');
    await page.keyboard.press('3');
    assert.equal(await selected(155), true, '3 selects the following spell');
    await click('.token.side-A.targetable .figure');
    assert.equal(await page.$eval(`${slot(0)} .spell-btn`, e => e.disabled), true);
    await drag(155, 153); await drag(155, 153); // Disabled cards remain draggable.
    assert.deepEqual(await barIds(), report.order);
    await click('.combat-log-heading button', 'Exporter');
    const combat = await page.evaluate(async () => JSON.parse(await window.combatExport.text()));
    report.casts = combat.events.filter(event => event.t === 'cast' && event.fighter === 'A').map(event => event.spellId);
    assert.deepEqual(report.casts, [153, 155]);
    assert.equal(combat.state.fighters.A.pa, 0);
    assert.deepEqual(combat.state.fighters.A.loadout.spells.order, report.order);
    const beforeReload = await stored();

    await page.reload({ waitUntil: 'networkidle0' });
    await click('.setup-navigation button', 'Stuff');
    await click('.builder-navigation button', 'Sorts');
    const preparedOrder = await page.$$eval('.spell-loadout-order li', nodes => nodes.filter(e => e.checkVisibility()).map(e => Number(e.dataset.spellId)));
    assert.deepEqual(preparedOrder, report.order, 'Combat order must agree with preparation after reload');
    assert.deepEqual(await stored(), beforeReload, 'Reordering must preserve the full draft and selected grades');
    await click('.setup-navigation button', 'Combat');
    await start();
    assert.deepEqual(await barIds(), report.order);
    await page.keyboard.press('2');
    assert.equal(await selected(153), true);
    const bar = await page.$('.combat-spellbar');
    await bar.screenshot({ path: path.join(out, 'reordered-shortcuts.png') });
    await bar.dispose();
    await page.keyboard.press('Escape');
    await page.setViewport({ width: 390, height: 844 });
    assert(await page.$eval('.spellbar', e => e.scrollWidth <= e.clientWidth + 1), 'The spell bar must fit a narrow viewport');
    const mobile = await page.$('.combat-spellbar');
    await mobile.screenshot({ path: path.join(out, 'reordered-shortcuts-mobile.png') });
    await mobile.dispose();
    report.persistedAfterReload = true;
    report.nativeDragWithDisabledSpells = true;
    assert.deepEqual(report.errors, []);
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    if (page) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
    throw error;
  } finally {
    fs.writeFileSync(path.join(out, 'proof.json'), JSON.stringify(report, null, 2));
    const child = browser.process(); await browser.disconnect(); child?.kill('SIGTERM');
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
