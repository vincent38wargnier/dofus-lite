// Native right-clicks against the real combat UI, with isolated player storage.
const puppeteer = require('puppeteer-core');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const out = process.env.PROOF_DIR || '/tmp/dofus-self-cast';

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true, pipe: true,
  });
  const report = { errors: [] };
  let page;
  try {
    page = await browser.newPage();
    page.setDefaultTimeout(15000);
    await page.setViewport({ width: 1600, height: 1000 });
    page.on('pageerror', error => report.errors.push(error.message));
    page.on('response', response => {
      if (response.status() >= 400) report.errors.push(`${response.status()} ${response.url()}`);
    });
    const cdp = await page.createCDPSession();
    await cdp.send('Page.setDownloadBehavior', { behavior: 'deny' });
    await page.evaluateOnNewDocument(() => {
      localStorage.setItem('dofus-lite-player-setup-v1', JSON.stringify({
        playerClass: 'IOP', botClass: 'CRA', botId: 'maison', mapId: 'arene', mode: 'kanojedo', monsterGrade: 5,
      }));
      localStorage.setItem('dofus-lite-loadouts-v1', JSON.stringify({
        'A:IOP': { version: 1, level: 200, base: { force: 100 }, slots: { weapon: 2416 },
          rollMode: 'max', rollSeed: 1, spells: { order: [153, 155, 141, 142, 0], common: [350] } },
      }));
      Math.random = () => .000007;
      const original = URL.createObjectURL;
      URL.createObjectURL = function (blob) { window.combatExport = blob; return original.call(this, blob); };
      window.spellContextMenus = [];
      document.addEventListener('contextmenu', event => {
        const slot = event.target.closest('.spell-slot');
        if (slot) window.spellContextMenus.push({ spellId: Number(slot.dataset.spellId), prevented: event.defaultPrevented });
      });
    });
    const spell = id => `.spell-slot[data-spell-id="${id}"] .spell-btn`;
    const rightClick = id => page.click(spell(id), { button: 'right' });
    const record = async () => {
      await page.click('.fight-log .combat-log-heading button');
      return page.evaluate(async () => JSON.parse(await window.combatExport.text()));
    };
    const casts = combat => combat.events.filter(e => e.t === 'cast' && e.fighter === 'A');
    await page.goto(process.env.PROOF_URL || 'http://127.0.0.1:3013', { waitUntil: 'networkidle0' });
    await page.click('.setup-play');
    await rightClick(153); // Placement must not cast.
    assert.equal(casts(await record()).length, 0);
    await page.click('.placement-ready');
    await page.waitForFunction(() => !document.querySelector('.spell-slot[data-spell-id="153"] .spell-btn')?.disabled);
    const before = await record();
    await page.click(spell(153)); // Left-click still selects Puissance for manual targeting.
    assert(await page.$eval(spell(153), e => e.classList.contains('selected')));
    for (const id of [141, 142, 0, 350]) await rightClick(id);
    const invalid = await record();
    assert.equal(casts(invalid).length, 0);
    assert.equal(invalid.state.fighters.A.pa, before.state.fighters.A.pa);
    assert(await page.$eval(spell(153), e => e.classList.contains('selected')), 'Invalid right-click keeps the selected spell');

    await rightClick(153);
    const first = await record();
    assert.deepEqual(casts(first).map(e => e.spellId), [153]);
    assert.equal(first.state.fighters.A.pa, before.state.fighters.A.pa - 4);
    assert(first.state.fighters.A.effects.some(e => e.stat === 'power' && e.value === 100));
    assert.equal(await page.$('.spell-btn.selected'), null);
    await rightClick(153); // Cooldown on a disabled button must also suppress the browser menu.
    await rightClick(155); // Vitalité can follow without waiting for the animation.
    await rightClick(148); // Amplification: insufficient PA now.
    const after = await record();
    assert.deepEqual(casts(after).map(e => e.spellId), [153, 155]);
    assert.equal(after.state.fighters.A.pa, 0);
    assert(after.state.fighters.A.hp > before.state.fighters.A.hp);
    assert(after.events.every(e => e.t !== 'invalid'));
    report.casts = casts(after).map(({ spellName, target }) => ({ spellName, target }));
    report.self = after.state.fighters.A.pos;
    for (const cast of report.casts) assert.deepEqual(cast.target, report.self);
    report.pa = { before: before.state.fighters.A.pa, after: after.state.fighters.A.pa };
    report.effects = after.state.fighters.A.effects.map(({ name, stat, value }) => ({ name, stat, value }));
    report.contextMenus = await page.evaluate(() => window.spellContextMenus);
    assert.equal(report.contextMenus.length, 9);
    assert(report.contextMenus.every(e => e.prevented), 'No browser menu over combat spells, including disabled ones');
    await page.mouse.move(25, 70);
    await page.waitForFunction(() => !document.querySelector('.retro-spell-effect'));
    await page.screenshot({ path: path.join(out, 'right-click-self-cast.png') });
    assert.deepEqual(report.errors, []);
    report.passed = true;
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    if (page) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
    throw error;
  } finally {
    fs.writeFileSync(path.join(out, 'proof.json'), JSON.stringify(report, null, 2));
    const child = browser.process();
    await browser.disconnect();
    child?.kill('SIGTERM');
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
