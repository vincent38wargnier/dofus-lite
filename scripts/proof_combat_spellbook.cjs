// Real controls, isolated browser storage; never modify the player's saves.
const puppeteer = require('puppeteer-core');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const out = '/tmp/dofus-spellbook-proof';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const click = async (page, selector, text = '') => {
  await page.waitForFunction(({ selector, text }) => [...document.querySelectorAll(selector)].some(e => e.checkVisibility() && !e.disabled && e.textContent.includes(text)), {}, { selector, text });
  const handle = await page.evaluateHandle(({ selector, text }) => [...document.querySelectorAll(selector)].find(e => e.checkVisibility() && !e.disabled && e.textContent.includes(text)), { selector, text });
  await handle.asElement().click(); await handle.dispose();
};
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, pipe: true });
  const page = await browser.newPage(), report = { checks: [], errors: [] };
  page.setDefaultTimeout(30000);
  page.on('pageerror', error => report.errors.push(error.message));
  const check = message => { report.checks.push(message); console.log(message); };
  try {
    await page.setViewport({ width: 1440, height: 1000 });
    await page.goto('http://127.0.0.1:3013', { waitUntil: 'networkidle0' });
    await click(page, '.tabs > button', 'Atelier');
    await click(page, '.studio-transfer-tools button', 'Importer');
    await (await page.$('[aria-label="Importer un ZIP Atelier"]')).uploadFile(path.resolve('public/adventures/winterfell-adventure.zip'));
    await click(page, '.adventure-import-play button', 'Jouer l’aventure');
    await click(page, '.combat-choice[open] .combat-choice-launch');
    await page.waitForSelector('.combat-spellbook-button');
    await click(page, '.combat-spellbook-button');
    await page.waitForSelector('.combat-spellbook-dialog[open]');
    assert.equal(await page.$$eval('[data-spellbook-fighter]', els => els.length), 9);
    assert.equal(await page.$$eval('[data-spellbook-spell]', els => els.length), 4);
    await delay(700);
    await page.screenshot({ path: path.join(out, 'library.png') });
    check('Winterfell library contains all 9 fighters; the commander has exactly its 4 authored spells.');
    await click(page, '[data-spellbook-fighter]', 'Archer du givre');
    await click(page, '[data-spellbook-spell]', 'Cloué par le froid');
    const archer = await page.$eval('.combat-spellbook-detail', e => e.innerText);
    assert(archer.includes('12–16 dégâts Eau') && archer.includes('−1 PM') && archer.includes('3–7 PO') && archer.includes('esquivable'));
    await page.screenshot({ path: path.join(out, 'monster-spell.png') });
    await page.type('[aria-label="Rechercher un combattant ou un sort"]', 'La nuit est sombre');
    assert.equal(await page.$$eval('[data-spellbook-fighter]', els => els.length), 1);
    assert((await page.$eval('.combat-spellbook-detail', e => e.innerText)).includes('La zone peut aussi toucher vos alliés'));
    await page.$eval('[aria-label="Rechercher un combattant ou un sort"]', e => { const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(e, ''); e.dispatchEvent(new Event('input', { bubbles: true })); });
    await click(page, '[data-spellbook-fighter="A2"]');
    assert((await page.$eval('.combat-spellbook-detail', e => e.innerText)).includes('Arme équipée'));
    await click(page, '.spell-variant-tabs button', 'Critique');
    assert(await page.$eval('.spell-variant-tabs button[aria-pressed="true"]', e => e.textContent.includes('Critique')));
    await page.screenshot({ path: path.join(out, 'arya-weapon.png') });
    check('Monster damage, dodgeable PM removal, ally damage warnings, equipped weapons and critical variants are readable.');

    for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1280, height: 650 }]) {
      await page.setViewport(viewport); await delay(200);
      assert(await page.$eval('.combat-spellbook-dialog', e => e.scrollWidth <= e.clientWidth + 1));
      assert(await page.$eval('.combat-spellbook-dialog > footer', e => e.getBoundingClientRect().bottom <= innerHeight));
      if (viewport.width === 390) await page.screenshot({ path: path.join(out, 'mobile.png') });
    }
    check('The library fits phone, tablet and short desktop screens; its return button remains visible.');
    await page.setViewport({ width: 1440, height: 1000 });
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('.combat-spellbook-dialog'));
    assert(await page.$eval('.combat-spellbook-button', e => e === document.activeElement));
    // Choose Arya while placing so her weapon reproduces the user's screenshot.
    await click(page, '.team-placement button', 'Arya');
    assert.equal(await page.$$eval('.spell-info-button', els => els.length), await page.$$eval('.spell-slot', els => els.length));
    await page.hover('.spell-slot .spell-btn'); await delay(1200);
    assert.equal(await page.$('.spell-hover-card'), null);
    await page.screenshot({ path: path.join(out, 'info-buttons.png') });
    await page.hover('.spell-slot .spell-info-button'); await delay(400);
    await page.hover('.spell-slot .spell-btn'); await delay(800);
    assert.equal(await page.$('.spell-hover-card'), null);
    await page.hover('.spell-slot .spell-info-button'); await delay(650);
    assert.equal(await page.$('.spell-hover-card'), null);
    await delay(550);
    await page.waitForSelector('.spell-hover-card');
    assert(await page.$eval('.spell-hover-card', e => e.textContent.includes('Aiguille') && e.textContent.includes('Arme équipée')));
    assert.equal(await page.$$eval('.spell-slot[title], .spell-btn[title]', e => e.length), 0);
    await page.screenshot({ path: path.join(out, 'hover.png') });
    await click(page, '.spell-hover-open');
    assert(await page.$eval('.combat-spellbook-detail', e => e.textContent.includes('Aiguille')));
    await click(page, '.combat-spellbook-dialog > footer button');
    check('Every spell has an information icon: only a full second on that icon opens details; brief and ordinary spell hovers stay clear.');
    check('Arya’s information card opens the correct library entry without casting; leaving early cancels the preview.');

    await page.evaluate(() => document.activeElement?.blur());
    await page.mouse.move(5, 5);
    await page.setViewport({ width: 390, height: 844 });
    // Let the board's ResizeObserver settle before aiming at the compact bar.
    await delay(400);
    await page.waitForFunction(() => [...document.querySelectorAll('.spell-btn .ic')].every(e => {
      const r = e.getBoundingClientRect();
      return !document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('.spell-info-button');
    }));
    const touch = await page.createCDPSession();
    await touch.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
    const target = await page.$eval('.spell-info-button', e => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    await page.touchscreen.tap(target.x, target.y);
    await page.waitForSelector('.spell-hover-card');
    assert(await page.$eval('.spell-hover-card', e => { const r = e.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; }));
    await page.screenshot({ path: path.join(out, 'info-mobile.png') });
    await page.keyboard.press('Escape');
    await touch.send('Emulation.setTouchEmulationEnabled', { enabled: false });
    await touch.detach();
    await page.setViewport({ width: 1440, height: 1000 });
    check('The information icon remains usable by touch and its card stays within the mobile viewport.');

    await click(page, '.placement-ready');
    await page.waitForSelector('.end-turn:not([disabled])');
    await click(page, '.combat-spellbook-button');
    const timer = await page.$eval('[role="timer"]', e => e.getAttribute('aria-label'));
    const resources = await page.$eval('.player-resources', e => e.innerText);
    await delay(2100); await page.keyboard.press('1');
    assert.equal(await page.$eval('[role="timer"]', e => e.getAttribute('aria-label')), timer);
    assert.equal(await page.$eval('.player-resources', e => e.innerText), resources);
    assert.equal(await page.$('.spell-btn.selected'), null);
    await click(page, '.combat-spellbook-dialog > footer button');
    await delay(1200);
    assert.notEqual(await page.$eval('[role="timer"]', e => e.getAttribute('aria-label')), timer);
    check('Reading pauses the local timer without spending PA; shortcuts are blocked and the same turn resumes on close.');

    // Confirm targeting still works after inspecting: a real self boost.
    const buffName = await page.$eval('.combat-turn-controls', e => ({ A: 'Serment de la Garde', A2: 'Le pas de la louve', A3: 'Le rubis veille' })[e.dataset.controlledFighter]);
    const before = await page.$eval('.player-resources .pa strong', e => Number(e.textContent));
    const buffButton = await page.evaluateHandle(name => [...document.querySelectorAll('.spell-btn')].find(e => e.textContent.includes(name)), buffName);
    await buffButton.asElement().click({ button: 'right' }); await buffButton.dispose();
    await page.waitForFunction(before => Number(document.querySelector('.player-resources .pa strong').textContent) < before, {}, before);
    check('Right-click self-casting remains functional after returning from the spellbook.');
    assert.deepEqual(report.errors, []);
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  } catch (error) {
    await page.screenshot({ path: path.join(out, 'failure.png') });
    fs.writeFileSync(path.join(out, 'failure.txt'), await page.evaluate(() => document.body.innerText));
    throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
