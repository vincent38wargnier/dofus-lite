// Direct navigation, one personal AI on two characters, saved gear and a real replay.
const puppeteer = require('puppeteer-core');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const out = process.env.PROOF_DIR || '/tmp/dofus-ai-duel';

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, pipe: true });
  const report = { errors: [] };
  let page;
  try {
    page = await browser.newPage();
    page.setDefaultTimeout(15000);
    page.on('pageerror', error => report.errors.push(error.message));
    await page.setViewport({ width: 1500, height: 1000 });
    await page.evaluateOnNewDocument(() => {
      if (!localStorage.getItem('ai-duel-proof')) {
        const draft = (level, base, slots = {}) => ({ version: 1, level, base, slots, rollMode: 'max', rollSeed: 1, spells: { common: [] } });
        localStorage.setItem('dofus-lite-loadouts-v1', JSON.stringify({ 'A:IOP': draft(120, { force: 200 }), 'B:CRA': draft(170, { intelligence: 200 }) }));
        localStorage.setItem('dofus-lite-stuff-library-v1', JSON.stringify({ version: 1, active: {}, builds: [
          { id: 'hammer', name: 'Marteau et PA', loadout: draft(200, {}, { weapon: 2416, ring1: 2469 }), createdAt: 1, updatedAt: 1 },
          { id: 'mobility', name: 'Mobilité', loadout: draft(200, {}, { ring1: 2469, dofus1: 6980 }), createdAt: 1, updatedAt: 1 },
        ] }));
        localStorage.setItem('koliseum.bots.v1', JSON.stringify([{ id: 'custom-duel', name: 'Mon IA', custom: true, emoji: '🤖', code: 'function decide(view, api) { return api.maison(); }' }]));
        localStorage.setItem('ai-duel-proof', 'true');
      }
      const create = URL.createObjectURL;
      URL.createObjectURL = function(blob) { window.duelExport = blob; return create.call(this, blob); };
    });
    const click = async (selector, text = '') => {
      const handle = await page.evaluateHandle(({ selector, text }) => [...document.querySelectorAll(selector)]
        .find(e => e.checkVisibility() && e.textContent.includes(text)), { selector, text });
      assert(handle.asElement(), `Missing ${selector}: ${text}`);
      await handle.asElement().click(); await handle.dispose();
    };
    const choose = (name, value) => page.select(`.arena-screen select[aria-label="${name}"]`, value);
    const exportCombat = async () => {
      await click('.arena-screen .combat-log-heading button', 'Exporter');
      return page.evaluate(async () => JSON.parse(await window.duelExport.text()));
    };
    await page.goto(process.env.PROOF_URL || 'http://127.0.0.1:3013', { waitUntil: 'networkidle0' });
    await click('.tabs > button', 'IA contre IA');
    assert.equal(await page.$eval('.tools-menu', e => e.open), false);
    assert.equal(await page.$eval('.tabs > button[aria-current="page"]', e => e.textContent.trim()), 'IA contre IA');
    await choose('Classe A', 'IOP'); await choose('Classe B', 'CRA');
    await choose('IA A', 'custom-duel'); await choose('IA B', 'plume');
    await choose('Stuff A', 'hammer'); await choose('Stuff B', 'mobility');
    const drafts = await page.evaluate(() => localStorage.getItem('dofus-lite-loadouts-v1'));
    await click('.arena-ai-choice button', 'Même IA que A');
    assert.equal(await page.$eval('select[aria-label="IA B"]', e => e.value), 'custom-duel');
    assert.equal(await page.evaluate(() => localStorage.getItem('dofus-lite-loadouts-v1')), drafts);
    await choose('Carte de combat', 'arene');
    await page.waitForFunction(() => [...document.querySelectorAll('.arena-setup .retro-portrait img, .arena-setup img.retro-portrait')].every(img => img.complete && img.naturalWidth));
    await page.screenshot({ path: path.join(out, 'setup.png') });
    report.directNavigation = true;
    report.copyKeepsCharacters = true;
    await click('.arena-setup-actions button', 'Personnaliser');
    await click('.arena-screen .loadout-side.side-B');
    assert((await page.$eval('.arena-screen .loadout-side.side-B', e => e.innerText)).includes('Cra'));
    await click('.arena-setup-actions button', 'Fermer');
    await page.setViewport({ width: 390, height: 844 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile horizontal overflow');
    await page.screenshot({ path: path.join(out, 'mobile.png'), fullPage: true });
    await page.setViewport({ width: 1500, height: 1000 });
    await click('.arena-launch');
    await page.waitForFunction(() => document.querySelector('.arena-screen .playback')
      && document.querySelector('.arena-setup').getAttribute('aria-busy') === 'false', { timeout: 120000 });
    await click('.arena-screen [aria-label="Mettre en pause"]');
    const initial = await exportCombat();
    const a = initial.state.fighters.A, b = initial.state.fighters.B;
    assert.equal(a.classId, 'IOP'); assert.equal(a.level, 120);
    assert.equal(b.classId, 'CRA'); assert.equal(b.level, 170);
    assert.deepEqual(a.loadout.slots, { weapon: 2416, ring1: 2469 });
    assert.deepEqual(b.loadout.slots, { ring1: 2469, dofus1: 6980 });
    assert.equal(a.basePa, 8); assert.equal(b.basePm, 4);
    assert(a.name.includes('Mon IA') && b.name.includes('Mon IA') && a.name !== b.name);
    await page.focus('.arena-screen [aria-label="Progression du combat"]');
    await page.keyboard.press('End');
    await page.waitForSelector('.arena-screen .winner-banner');
    const final = await exportCombat();
    assert.equal(final.state.over, true);
    assert.equal(final.events.filter(e => e.t === 'bot_error').length, 0);
    assert(final.events.some(e => e.t === 'cast' && e.fighter === 'A'));
    assert(final.events.some(e => e.t === 'cast' && e.fighter === 'B'));
    report.match = { classes: [a.classId, b.classId], levels: [a.level, b.level], names: [a.name, b.name],
      winner: final.state.winner, turns: final.state.turn, endReason: final.state.endReason,
      casts: final.events.filter(e => e.t === 'cast').length };
    await (await page.$('.arena-layout')).screenshot({ path: path.join(out, 'combat.png') });
    await click('.arena-screen [aria-label="Revenir au début"]');
    await click('.arena-screen [aria-label="Lire le combat"]');
    await click('.tabs > button', 'Jouer');
    const pausedFrame = await page.$eval('.arena-screen [aria-label="Progression du combat"]', e => e.value);
    await new Promise(resolve => setTimeout(resolve, 650));
    assert.equal(await page.$eval('.arena-screen [aria-label="Progression du combat"]', e => e.value), pausedFrame);
    report.hiddenReplayPaused = true;
    assert.deepEqual(report.errors, []);
    report.passed = true;
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    report.failure = error.message;
    if (page) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
    throw error;
  } finally {
    fs.writeFileSync(path.join(out, 'proof.json'), JSON.stringify(report, null, 2));
    const child = browser.process(); await browser.disconnect(); child?.kill('SIGTERM');
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
