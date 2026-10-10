const puppeteer = require('puppeteer-core');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const url = process.env.RETRO_URL || 'http://127.0.0.1:3013';
const out = '/tmp/dofus-ui-remaster';

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, pipe: true, protocolTimeout: 30000 });
  try {
    const page = await browser.newPage(); await page.setViewport({ width: 1500, height: 1050 });
    const errors = [], external = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
    await page.setRequestInterception(true);
    page.on('request', r => { if (r.url().startsWith(url) || /^(data|blob):/.test(r.url())) r.continue(); else { external.push(r.url()); r.abort(); } });
    const handle = selector => page.evaluateHandle(s => [...document.querySelectorAll(s)].find(e => e.offsetParent), selector);
    const click = async (selector, text = '') => {
      const h = await page.evaluateHandle(({ selector, text }) => [...document.querySelectorAll(selector)].find(e => e.offsetParent && e.textContent.includes(text)), { selector, text });
      assert.ok(h.asElement(), `Missing visible ${selector}: ${text}`);
      await h.asElement().click(); await h.dispose();
    };
    const select = async (selector, value) => { const h = await handle(selector); await h.asElement().select(String(value)); await h.dispose(); };
    const fill = async (selector, value) => { const h = await handle(selector); await h.asElement().focus(); await h.asElement().evaluate(e => e.select()); await page.keyboard.press('Backspace'); await h.asElement().type(value); await h.dispose(); };
    const draft = key => page.evaluate(key => JSON.parse(localStorage.getItem('dofus-lite-loadouts-v1'))[key], key);
    const settings = () => page.evaluate(() => JSON.parse(localStorage.getItem('dofus-lite-player-setup-v1')));
    const tab = text => click('.setup-navigation button', text);
    const shot = async name => { await page.evaluate(() => scrollTo(0, 0)); await page.screenshot({ path: `${out}/${name}.png`, fullPage: true }); };
    const noOverflow = async label => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Horizontal overflow: ${label}`);
    await page.goto(url, { waitUntil: 'networkidle0' });
    await page.waitForSelector('.setup-class img');
    assert.equal(await page.$$eval('.setup-class', es => es.length), 12);
    assert.equal(await page.$$eval('.setup-play', es => es.filter(e => e.offsetParent).length), 1);
    await shot('personnage');
    await click('[aria-label="Choisir Cra"]');
    await select('select[aria-label="Niveau du personnage"]', 150);
    await click('.allocation-reset'); await click('[aria-label="Maximum en Intelligence"]');
    await select('select[aria-label="Apparence du joueur"]', 'female');
    const cra = await draft('A:CRA');
    assert.equal(cra.level, 150); assert.equal(cra.profile.sex, 1); assert.ok(cra.base.intelligence > 0);
    await click('[aria-label="Choisir Iop"]');
    assert.equal(await page.$eval('.level-badge', e => e.textContent), 'Niv. 100');
    await click('[aria-label="Choisir Cra"]');
    assert.deepEqual(await draft('A:CRA'), cra);
    await click('.stuff-save-actions button', 'Enregistrer ce stuff');
    await fill('input[aria-label="Nom du stuff"]', 'Crâ · Feu'); await click('.stuff-name-form button[type="submit"]');
    assert.ok(await page.evaluate(() => JSON.parse(localStorage.getItem('dofus-lite-stuff-library-v1')).builds.some(b => b.name === 'Crâ · Feu' && b.loadout.profile.sex === 1)));
    // Keyboard movement between preparation panes, then native modal focus/Escape.
    await page.focus('.setup-navigation [aria-selected="true"]'); await page.keyboard.press('End');
    assert.match(await page.$eval('.setup-navigation [aria-selected="true"]', e => e.textContent), /Combat/);
    await click('.map-open');
    assert.equal(await page.$$eval('dialog[open] .map-card', es => es.length), 21);
    assert.ok(await page.evaluate(() => document.querySelector('dialog[open]').contains(document.activeElement)));
    await page.keyboard.press('Escape');
    assert.equal(await page.$$eval('dialog[open]', es => es.length), 0);
    assert.ok(await page.evaluate(() => document.activeElement.classList.contains('map-open')));
    await click('.map-open'); await fill('dialog[open] input', 'Astrub'); await click('dialog[open] .map-card', 'Astrub');
    await select('select[aria-label="Classe adverse"]', 'FECA'); await select('select[aria-label="Bot adverse"]', 'pantin');
    assert.equal((await settings()).mapId, 'astrub_2195');
    await page.reload({ waitUntil: 'networkidle0' });
    assert.deepEqual(await settings(), { playerClass: 'CRA', botClass: 'FECA', botId: 'pantin', mapId: 'astrub_2195' });
    assert.deepEqual(await draft('A:CRA'), cra);
    assert.equal(await page.$eval('.character-options select[aria-label="Apparence du joueur"]', e => e.value), 'female');
    // Lowering level must expose invalid gear and prevent combat, without deleting it.
    await select('select[aria-label="Niveau du personnage"]', 1);
    assert.ok(await page.$eval('.setup-play', e => e.disabled));
    await click('.setup-validation');
    assert.ok(await page.$$eval('.loadout-errors', es => es.some(e => e.offsetParent && e.textContent.includes('niveau'))));
    await select('select[aria-label="Niveau du personnage"]', 150); await tab('Personnage');
    assert.deepEqual((await draft('A:CRA')).base, cra.base);
    await tab('Stuff'); await noOverflow('desktop equipment'); await shot('stuff');
    await tab('Combat'); await shot('combat-preparation');
    // Multiple viewport sizes, every pane, and a single reachable play action.
    for (const width of [1366, 1100, 820, 390]) {
      await page.setViewport({ width, height: width < 600 ? 844 : 900 });
      for (const name of ['Personnage', 'Stuff', 'Combat']) { await tab(name); await noOverflow(`${width}: ${name}`); }
    }
    await tab('Personnage'); await shot('personnage-mobile');
    assert.ok(await page.$eval('.setup-play', e => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }));
    await tab('Stuff');
    for (const pane of ['Équipements', 'Caractéristiques', 'Sorts']) { await click('.builder-navigation button', pane); await noOverflow(`mobile ${pane}`); }
    await click('.builder-navigation button', 'Équipements'); await shot('stuff-mobile');
    await page.setViewport({ width: 1500, height: 1050 });
    await tab('Combat');
    await page.evaluate(() => { const original = URL.createObjectURL; URL.createObjectURL = blob => { window.setupExport = blob; return original(blob); }; });
    await click('.setup-play');
    await page.waitForSelector('.fight-heading');
    assert.equal(await page.$('.player-setup'), null);
    await click('.combat-log-heading button', 'Exporter');
    const record = await page.evaluate(async () => JSON.parse(await window.setupExport.text()));
    assert.equal(record.mapId, 'astrub_2195'); assert.equal(record.state.fighters.A.classId, 'CRA');
    assert.equal(record.state.fighters.A.level, 150); assert.equal(record.state.fighters.A.loadout.profile.sex, 1);
    assert.equal(record.state.fighters.B.classId, 'FECA');
    await page.waitForFunction(() => [...document.querySelectorAll('.retro-actor ruffle-player')].length === 2 && [...document.querySelectorAll('.retro-actor ruffle-player')].every(e => typeof e.animate === 'function'));
    await page.waitForFunction(() => [...document.querySelectorAll('.retro-map-layer')].every(e => e.complete && e.naturalWidth));
    await shot('combat'); await click('.fight-heading button', 'Abandonner');
    assert.equal(await page.$('.fight-heading'), null);
    await click('.sound-settings summary'); await click('.retro-sound-toggle');
    assert.equal(await page.$eval('.retro-sound-toggle', e => e.getAttribute('aria-pressed')), 'false');
    await click('.sound-settings summary');
    await click('.tools-menu summary'); await click('.tools-dropdown button', 'Arène');
    assert.ok(await page.$$eval('.loadout-heading', es => es.some(e => e.offsetParent)));
    await click('.tab', 'Jouer');
    assert.equal(await page.$eval('.player-summary h2', e => e.textContent), 'Cra');
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
    fs.writeFileSync(`${out}/proof.json`, JSON.stringify({ errors, external, checks: ['default player preparation', '12 classes', 'one play action', 'per-class drafts', 'level and focus', 'saved appearance', 'keyboard tabs', '21-map modal', 'Escape and restored focus', 'map and opponent persistence', 'level validation', 'four viewports', 'three builder panes', 'combat export', 'return to setup', 'sound controls', 'advanced tools'] }, null, 2));
    console.log(`Player setup browser proof passed: ${out}`);
  } finally { await browser.disconnect(); browser.process()?.kill('SIGKILL'); }
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => process.exit(process.exitCode || 0));
