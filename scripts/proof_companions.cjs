// Exercise actual equipment controls, saved loadouts and a live combat export.
const puppeteer = require('puppeteer-core');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const out = process.env.PROOF_DIR || '/tmp/dofus-companions';
const url = process.env.PROOF_URL || 'http://127.0.0.1:3013';

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true, pipe: true,
  });
  const report = { errors: [], checks: [] };
  let page;
  try {
    page = await browser.newPage();
    await page.setViewport({ width: 1500, height: 1100 });
    page.on('pageerror', error => report.errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400) report.errors.push(`${response.status()} ${response.url()}`); });
    await page.evaluateOnNewDocument(() => {
      if (!localStorage.getItem('companion-proof-seeded')) {
        localStorage.setItem('dofus-lite-player-setup-v1', JSON.stringify({ playerClass: 'IOP', botClass: 'CRA', botId: 'companion-proof', mapId: 'arene' }));
        localStorage.setItem('koliseum.bots.v1', JSON.stringify([{ id: 'companion-proof', name: 'Sparring', custom: true, code: 'function decide(v,a){return a.endTurn();}' }]));
        const base = { version: 1, level: 100, base: {}, rollMode: 'max', rollSeed: 1 };
        localStorage.setItem('dofus-lite-loadouts-v1', JSON.stringify({
          'A:IOP': { ...base, slots: { pet: 7519 } }, 'B:CRA': { ...base, slots: {} },
        }));
        localStorage.setItem('companion-proof-seeded', '1');
      }
      Math.random = () => .000071;
    });
    const handle = async selector => {
      const result = await page.evaluateHandle(selector => [...document.querySelectorAll(selector)].find(e => e.checkVisibility()), selector);
      assert(result.asElement(), `Missing ${selector}`);
      return result.asElement();
    };
    const click = async (selector, text = '') => {
      const element = await page.evaluateHandle(({ selector, text }) => [...document.querySelectorAll(selector)]
        .find(e => e.checkVisibility() && e.textContent.includes(text)), { selector, text });
      assert(element.asElement(), `Missing ${selector}: ${text}`);
      await element.asElement().click(); await element.dispose();
    };
    const select = async (selector, value) => { const element = await handle(selector); await element.select(String(value)); await element.dispose(); };
    const search = async value => {
      const input = await handle('input[aria-label="Rechercher un équipement"]');
      await input.focus(); await input.evaluate(e => e.select()); await page.keyboard.press('Backspace');
      await input.type(value); await input.dispose();
    };
    const inspect = async (name, id) => { await search(name); await click(`[data-item-id="${id}"]`); };
    const text = async selector => { const e = await handle(selector); const value = await e.evaluate(e => e.textContent); await e.dispose(); return value; };
    const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('dofus-lite-loadouts-v1'))['A:IOP']);
    const screenshot = async name => {
      const element = await handle('.equipment-inventory');
      await element.screenshot({ path: path.join(out, name) }); await element.dispose();
    };
    await page.goto(url, { waitUntil: 'networkidle0' });
    await click('.setup-navigation button', 'Stuff');
    await click('[data-slot="pet"]');
    assert.match(await text('.equipment-effects'), /\+55 Sagesse/);
    assert.match(await text('.companion-status'), /Capacités accrues/);
    report.checks.push('Existing saved Dragoune Rose now gives +55 wisdom');
    await select('select[aria-label="Type de compagnon"]', 'pet');
    await inspect('Nomoon', 6716);
    assert.match(await text('.equipment-effects'), /\+90 Prospection/);
    await click('.equipment-equip');
    await screenshot('nomoon-max.png');
    await inspect('Croum', 7520);
    await select('select[aria-label="Spécialisation du familier"]', 213);
    await click('.equipment-equip');
    assert.match(await text('.equipment-effects'), /\+26 % résistance feu/);
    assert.equal((await saved()).petBonuses[7520], 213);
    await page.reload({ waitUntil: 'networkidle0' });
    await click('.setup-navigation button', 'Stuff'); await click('[data-slot="pet"]');
    assert.equal((await saved()).slots.pet, 7520);
    assert.equal((await saved()).petBonuses[7520], 213);
    assert.match(await text('.equipment-effects'), /\+26 % résistance feu/);
    await search('Croum');
    await screenshot('croum-specialization.png');
    report.checks.push('Croum +26% fire specialization survives reload');
    await select('select[aria-label="Type de compagnon"]', 'mount');
    await inspect('Prune et Emeraude', 7870);
    await select('select[aria-label="Niveau du personnage"]', 59);
    const equip = await handle('.equipment-equip');
    assert.equal(await equip.evaluate(e => e.disabled), true); await equip.dispose();
    await select('select[aria-label="Niveau du personnage"]', 60);
    await click('.equipment-equip');
    assert.equal((await saved()).slots.pet, 7870);
    assert.match(await text('.loadout-totals'), /4 PM/);
    assert.match(await text('.equipment-effects'), /\+200 Vitalité/);
    await select('select[aria-label="Niveau du personnage"]', 100);
    await screenshot('dragodinde-level-100.png');
    report.checks.push('Level 100 mount requires rider level 60; replaces pet bonuses');
    await page.setViewport({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Mobile horizontal overflow');
    await screenshot('dragodinde-mobile.png');
    await page.setViewport({ width: 1500, height: 1100 });
    await select('select[aria-label="Type de compagnon"]', 'pet'); await inspect('Croum', 7520); await click('.equipment-equip');
    assert.match(await text('.loadout-totals'), /3 PM/);
    assert.match(await text('.equipment-effects'), /\+26 % résistance feu/);
    await select('select[aria-label="Type de compagnon"]', 'mount'); await inspect('Prune et Emeraude', 7870); await click('.equipment-equip');
    await click('.setup-navigation button', 'Combat'); await click('.setup-play'); await click('.placement-ready');
    await page.waitForFunction(() => document.querySelector('.turn-status.yours'));
    await page.evaluate(() => {
      const original = URL.createObjectURL;
      URL.createObjectURL = function (blob) { window.companionExport = blob; return original.call(this, blob); };
    });
    const exportFight = async () => {
      await click('.combat-log-heading button', 'Exporter');
      return page.evaluate(async () => JSON.parse(await window.companionExport.text()));
    };
    const record = await exportFight();
    const fighter = record.state.fighters.A;
    assert.equal(fighter.basePm, 4); assert.equal(fighter.basePa, 7); assert.equal(fighter.hp, 851);
    assert.equal(fighter.permanent.range, 1);
    assert.equal(fighter.loadout.slots.pet, 7870);
    assert.equal(fighter.resistances.feu, 0);
    await click('.play-controls .btn', 'Fin de tour');
    await page.waitForFunction(() => document.querySelector('.turn-status.yours'));
    assert.equal((await exportFight()).state.fighters.A.pm, 4);
    report.checks.push('Combat and next turn: 851 HP, 7 AP, 4 MP, +1 range; no Croum resistance');
    const card = await handle('.fighter-card[data-fighter-id="A"]');
    await card.screenshot({ path: path.join(out, 'mounted-bonuses-combat.png') }); await card.dispose();
    fs.writeFileSync(path.join(out, 'combat.json'), JSON.stringify(record, null, 2));
    assert.deepEqual(report.errors, []);
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    if (page) await page.screenshot({ path: path.join(out, 'failure.png'), fullPage: true }).catch(() => {});
    throw error;
  } finally {
    fs.writeFileSync(path.join(out, 'proof.json'), JSON.stringify(report, null, 2));
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
