// Isolated browser: author spells through the UI, reload, play and run the AI.
const puppeteer = require('puppeteer-core');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const out = process.env.PROOF_DIR || '/tmp/dofus-spell-designer';
require('./ai_runtime.cjs');
const { dist } = require('../src/engine/geometry');
const { validateAction } = require('../src/engine/engine');

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, pipe: true });
  const report = { errors: [] };
  let page;
  try {
    page = await browser.newPage(); page.setDefaultTimeout(30000);
    await page.setViewport({ width: 1780, height: 1140 });
    page.on('pageerror', error => report.errors.push(error.message));
    await page.evaluateOnNewDocument(() => {
      const create = URL.createObjectURL;
      URL.createObjectURL = function(blob) { window.combatExport = blob; return create.call(this, blob); };
    });
    const click = async (selector, text = '') => {
      const handle = await page.evaluateHandle(({ selector, text }) => [...document.querySelectorAll(selector)].find(e => e.checkVisibility() && e.textContent.includes(text)), { selector, text });
      assert(handle.asElement(), `Missing ${selector}: ${text}`);
      assert(!await handle.asElement().evaluate(e => e.disabled), `Disabled ${selector}: ${text}`);
      await handle.asElement().click(); await handle.dispose();
    };
    const input = async (selector, value) => {
      await page.$eval(selector, e => { e.focus(); e.select(); });
      await page.keyboard.press('Backspace'); await page.type(selector, String(value));
    };
    const field = async (label, value, scope = '.spell-designer') => {
      const handle = await page.evaluateHandle(({ label, scope }) => [...document.querySelectorAll(`${scope} label`)].find(e => e.checkVisibility() && e.childNodes[0].textContent.trim() === label)?.querySelector('input, select, textarea'), { label, scope });
      assert(handle.asElement(), `Missing field ${label}`);
      if (await handle.asElement().evaluate(e => e.tagName === 'SELECT')) await handle.asElement().select(String(value));
      else {
        await handle.asElement().evaluate(e => { e.focus(); e.select(); });
        await page.keyboard.press('Backspace'); await handle.asElement().type(String(value));
      }
      await handle.dispose();
    };
    const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('dofus-lite-creations-v1')).characters[0]);
    const record = async () => {
      if (!await page.$('.fight-log')) await click('.fight-heading-actions button', 'Journal');
      await click('.combat-log-heading button', 'Exporter');
      return page.evaluate(async () => JSON.parse(await window.combatExport.text()));
    };
    const createSpell = async (preset, name) => {
      await click('.creator-new-spell button'); await field('Partir d’un modèle', preset); await field('Nom du sort', name);
    };
    const saveSpell = () => click('.spell-designer button[type="submit"]');
    await page.goto(process.env.PROOF_URL || 'http://127.0.0.1:3013', { waitUntil: 'networkidle0' });
    await click('.tabs > button', 'Atelier'); await click('.creator-tabs button', 'Mes classes');
    await click('.creator-library-strip button', 'Nouvelle classe');
    await input('.creator-name-row input', 'Astrale');
    await field('Apparence', 1, '.creator-character-identity');
    await createSpell('attack', 'Éclat astral');
    await field('Description', 'Une croix d’air pour punir les ennemis groupés. Convergence renforce chaque frappe.');
    await field('Cible du lancer', 'cell'); await field('Portée maximale', 8);
    await field('Élément', 'air'); await field('Minimum', 16); await field('Maximum', 20); await field('Zone', 'Xb');
    await saveSpell();
    await createSpell('boost', 'Convergence'); await field('Action', 'buffDamage'); await field('Durée (tours)', 1);
    await saveSpell();
    await createSpell('heal', 'Halo réparateur'); await field('Minimum', 10); await field('Maximum', 12); await saveSpell();
    await createSpell('teleport', 'Pas stellaire'); await saveSpell();
    const creation = await saved();
    assert.equal(creation.loadout.spells.custom.length, 4);
    assert(creation.loadout.spells.custom.every(s => s.authoringVersion === 1 && s.id > 1e12));
    assert.equal(new Set(creation.loadout.spells.custom.map(s => s.id)).size, 4);
    await page.reload({ waitUntil: 'networkidle0' });
    await click('.tabs > button', 'Atelier'); await click('.creator-tabs button', 'Mes classes');
    assert.deepEqual(await saved(), creation);
    await click('[aria-label="Modifier Éclat astral"]');
    await page.$eval('.custom-spell-picker', e => e.scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: path.join(out, 'editor.png') });
    await page.setViewport({ width: 390, height: 844 });
    await page.$eval('.spell-designer', e => e.scrollIntoView({ block: 'start' }));
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile horizontal overflow');
    await page.screenshot({ path: path.join(out, 'editor-mobile.png') });
    await page.setViewport({ width: 1780, height: 1140 });
    await click('.spell-designer button', 'Annuler');
    report.authoring = { name: creation.name, spells: creation.loadout.spells.custom.map(s => ({ name: s.name, id: s.id })), reload: true, mobileOverflow: false };
    await click('.creator-launch-buttons button', 'Jouer cette création');
    await page.waitForSelector('.placement-cell.yours');
    const placement = await record();
    fs.writeFileSync(path.join(out, 'placement.json'), JSON.stringify(placement, null, 2));
    const enemy = placement.state.fighters.B.pos;
    const attack = creation.loadout.spells.custom[0], boost = creation.loadout.spells.custom[1];
    const legalFrom = (state, key) => {
      const trial = JSON.parse(JSON.stringify(state)); trial.phase = 'combat'; trial.currentIndex = trial.order.indexOf('A');
      trial.fighters.A.pa = trial.fighters.A.basePa;
      const [x, y] = key.split(',').map(Number); trial.fighters.A.pos = { x, y };
      return validateAction(trial, { type: 'CAST', spell: attack.key, target: trial.fighters.B.pos }).ok;
    };
    const spots = await page.$$eval('.placement-cell.yours', cells => cells.map(c => c.dataset.placementCell));
    spots.sort((a, b) => {
      const p = a.split(',').map(Number), q = b.split(',').map(Number);
      return Number(legalFrom(placement.state, b)) - Number(legalFrom(placement.state, a))
        || dist({ x: p[0], y: p[1] }, enemy) - dist({ x: q[0], y: q[1] }, enemy);
    });
    await click(`.placement-cell.yours[data-placement-cell="${spots[0]}"]`);
    await click('.placement-ready'); await page.waitForSelector('.turn-status.yours');
    for (let attempt = 0; attempt < 10; attempt++) {
      await click(`.spell-slot[data-spell-id="${attack.id}"] .spell-btn`);
      if (await page.$('.token.side-B.targetable')) { await page.keyboard.press('Escape'); break; }
      await page.keyboard.press('Escape');
      const state = (await record()).state;
      const moves = await page.$$eval('.cell.hl-move', cells => cells.map(c => c.dataset.cell));
      moves.sort((a, b) => {
        const p = a.split(',').map(Number), q = b.split(',').map(Number);
        return Number(legalFrom(state, b)) - Number(legalFrom(state, a))
          || dist({ x: p[0], y: p[1] }, enemy) - dist({ x: q[0], y: q[1] }, enemy);
      });
      if (moves.length) {
        await click(`.cell[data-cell="${moves[0]}"]`);
        await page.waitForFunction(() => !document.querySelector('.token.walking'));
      } else {
        const previous = await page.$eval('.fight-heading', e => e.innerText);
        await click('.play-controls button', 'Fin de tour');
        await page.waitForFunction(before => document.querySelector('.turn-status.yours') && document.querySelector('.fight-heading').innerText !== before, {}, previous);
      }
    }
    await page.click(`.spell-slot[data-spell-id="${boost.id}"] .spell-btn`, { button: 'right' });
    await click(`.spell-slot[data-spell-id="${attack.id}"] .spell-btn`);
    assert(await page.$('.token.side-B.targetable'), 'Poutch outside authored area spell range');
    await page.hover('.token.side-B.targetable .figure');
    assert(await page.$('.attack-preview-cell'), 'Area hover preview missing');
    await click('.token.side-B.targetable .figure');
    await page.mouse.move(20, 20);
    const combat = await record();
    const casts = combat.events.filter(e => e.t === 'cast');
    assert(casts.some(e => e.spellId === boost.id && e.visualSpellId === 153));
    assert(casts.some(e => e.spellId === attack.id && e.visualSpellId === 161));
    const damage = combat.events.find(e => e.t === 'damage' && e.target === 'B');
    assert(damage?.amount > 0); assert.equal(damage.calculation.flatDamage, 8);
    assert(!combat.events.some(e => e.t === 'bot_error' || e.t === 'unsupported_effects'));
    await page.screenshot({ path: path.join(out, 'combat.png') });
    report.manual = { damage: damage.amount, immediateFlatDamage: 8, spells: casts.map(e => e.spellName), visualReferences: casts.map(e => e.visualSpellId) };
    fs.writeFileSync(path.join(out, 'combat.json'), JSON.stringify(combat, null, 2));
    await click('.fight-heading-actions button', combat.state.over ? 'Préparation' : 'Abandonner');
    await click('.tabs > button', 'Atelier'); await click('.creator-tabs button', 'Mes classes');
    await click('.creator-launch-buttons button', 'Tester avec l’IA');
    await page.waitForSelector('[data-auto-dungeon]', { timeout: 60000 });
    await click('.auto-result-button');
    const automatic = await record();
    assert.equal(automatic.state.winner, 'A');
    assert(automatic.events.some(e => e.t === 'cast' && e.spellId === attack.id));
    assert(!automatic.events.some(e => e.t === 'bot_error'));
    report.ai = { winner: automatic.state.winner, turns: automatic.state.turn, spells: [...new Set(automatic.events.filter(e => e.t === 'cast').map(e => e.spellName))] };
    assert.deepEqual(report.errors, []); report.passed = true;
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    report.failure = error.message;
    if (page) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
    throw error;
  } finally {
    fs.writeFileSync(path.join(out, 'proof.json'), JSON.stringify(report, null, 2));
    const child = browser.process(); await browser.disconnect(); if (child?.exitCode === null) child.kill('SIGTERM');
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
