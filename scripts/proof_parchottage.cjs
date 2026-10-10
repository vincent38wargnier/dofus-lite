const puppeteer = require('puppeteer-core');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const url = process.env.RETRO_URL || 'http://127.0.0.1:3013';
const out = '/tmp/dofus-parchottage';

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, pipe: true, protocolTimeout: 30000 });
  try {
    const page = await browser.newPage(); await page.setViewport({ width: 1500, height: 1050 });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
    const handle = selector => page.evaluateHandle(s => [...document.querySelectorAll(s)].find(e => e.checkVisibility()), selector);
    const click = async (selector, text = '') => {
      const h = await page.evaluateHandle(({ selector, text }) => [...document.querySelectorAll(selector)].find(e => e.checkVisibility() && e.textContent.includes(text)), { selector, text });
      assert.ok(h.asElement(), `Missing ${selector}: ${text}`);
      assert.ok(!await h.asElement().evaluate(e => e.disabled), `Disabled ${selector}: ${text}`);
      await h.asElement().click(); await h.dispose();
    };
    const select = async (selector, value) => { const h = await handle(selector); await h.asElement().select(String(value)); await h.dispose(); };
    const fill = async (selector, value) => {
      const h = await handle(selector); await h.asElement().focus(); await h.asElement().evaluate(e => e.select());
      await page.keyboard.press('Backspace'); await h.asElement().type(String(value)); await page.keyboard.press('Tab'); await h.dispose();
    };
    const text = selector => page.evaluate(s => [...document.querySelectorAll(s)].find(e => e.checkVisibility()).textContent, selector);
    const grades = () => page.evaluate(() => [...document.querySelectorAll('.spell-grade select')].filter(e => e.checkVisibility()).map(e => e.selectedOptions[0].textContent));
    const requireAuto = async grade => { const g = await grades(); assert.ok(g.length >= 20); assert.ok(g.every(value => value === `Auto · ${grade}`), JSON.stringify(g)); };
    const builderTab = name => click('.builder-navigation button', name);
    const shot = async (selector, name) => { const h = await handle(selector); await h.asElement().screenshot({ path: `${out}/${name}.png` }); await h.dispose(); };
    await page.goto(url, { waitUntil: 'networkidle0' });
    await click('.allocation-reset');
    assert.match(await text('.allocation-budget'), /495points disponibles/);
    assert.equal(await page.$$eval('.allocation-parchment', es => es.filter(e => e.checkVisibility() && e.textContent.includes('101')).length), 6);
    assert.equal(Number(await text('[data-summary-stat="chance"]')), 101);
    assert.equal(Number(await text('[data-summary-stat="sagesse"]')), 121); // 101 + Bouftou 20.
    await select('select[aria-label="Niveau du personnage"]', 200);
    await fill('input[aria-label="Force de base"]', 99);
    assert.match(await text('.allocation-budget'), /797points disponibles/); // Only 198 capital spent.
    assert.match(await text('[data-allocation-stat="force"] .allocation-cost'), /3 pour \+1/);
    assert.equal(Number(await text('[data-allocation-stat="force"] .allocation-total strong')), 300);
    await shot('.characteristic-allocator', 'parchottage-101');
    await click('.setup-navigation button', 'Stuff'); await builderTab('Sorts');
    await click('input[aria-label="Apprendre Flamiche"]'); await requireAuto(6);
    await select('select[aria-label="Niveau du personnage"]', 199); await requireAuto(5);
    await select('select[aria-label="Grade de Flamiche"]', 3);
    await select('select[aria-label="Niveau du personnage"]', 200);
    assert.ok((await grades()).includes('3'));
    await click('.spell-defaults button'); await requireAuto(6);
    await select('select[aria-label="Niveau du personnage"]', 150); await requireAuto(5);
    for (const width of [1100, 820, 390]) {
      await page.setViewport({ width, height: 844 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Spell overflow: ${width}`);
      await builderTab('Caractéristiques');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Stat overflow: ${width}`);
      await builderTab('Sorts');
    }
    await page.setViewport({ width: 1500, height: 1050 });
    await shot('.spell-loadout', 'sorts-automatiques-5');
    await select('select[aria-label="Niveau du personnage"]', 200); await requireAuto(6);
    await shot('.spell-loadout', 'sorts-automatiques-6');
    // Save and reload: 101 stays a rule, not a duplicate bonus written into boosts.
    await click('.stuff-save-actions button', 'Enregistrer ce stuff');
    await fill('input[aria-label="Nom du stuff"]', 'Parchotté · Sorts automatiques'); await click('.stuff-name-form button[type="submit"]');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('dofus-lite-stuff-library-v1')).builds[0]);
    assert.equal(saved.loadout.base.force, 99); assert.equal(saved.loadout.base.vitalite, 0);
    assert.deepEqual(saved.loadout.spells.grades, {});
    await page.reload({ waitUntil: 'networkidle0' });
    assert.equal(Number(await text('[data-summary-stat="force"]')), 300);
    await click('.setup-navigation button', 'Stuff'); await builderTab('Sorts'); await requireAuto(6);
    // Opponent uses the same defaults independently at its own level.
    await click('.setup-navigation button', 'Combat'); await click('.edit-opponent'); await builderTab('Caractéristiques');
    assert.equal(await page.$$eval('.allocation-parchment', es => es.filter(e => e.checkVisibility() && e.textContent.includes('101')).length), 6);
    await builderTab('Sorts'); await requireAuto(5);
    await click('.opponent-edit-banner button');
    await page.evaluate(() => { const original = URL.createObjectURL; URL.createObjectURL = blob => { window.parchmentExport = blob; return original(blob); }; });
    await click('.setup-play'); await page.waitForSelector('.fight-heading');
    await click('.combat-log-heading button', 'Exporter');
    const record = await page.evaluate(async () => JSON.parse(await window.parchmentExport.text()));
    assert.equal(record.rulesVersion, 5);
    assert.equal(record.state.fighters.A.level, 200); assert.equal(record.state.fighters.B.level, 100);
    assert.equal(record.state.fighters.A.stats.force, 300);
    assert.equal(record.state.fighters.A.stats.chance, 101); assert.equal(record.state.fighters.B.stats.chance, 101);
    assert.equal(record.state.fighters.A.baseMaxHp, 1296); // 55 + 995 + 101 + 145 gear.
    assert.deepEqual(errors, []);
    fs.writeFileSync(`${out}/browser-proof.json`, JSON.stringify({ checks: ['101 free in every stat', 'capital starts at the scrolled tier', 'reset keeps parchments', 'automatic 5 and 6 grades', 'manual overrides and reset', 'four viewport widths', 'save and reload without duplication', 'same defaults for opponent', 'both combatants in version-5 export'], errors }, null, 2));
    console.log(`Parchottage and spell defaults browser proof passed: ${out}`);
  } finally { await browser.disconnect(); browser.process()?.kill('SIGKILL'); }
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => process.exit(process.exitCode || 0));
