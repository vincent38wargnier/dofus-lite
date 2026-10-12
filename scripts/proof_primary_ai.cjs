require('./ai_runtime.cjs');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const puppeteer = require('puppeteer-core');
const { emptyLoadout } = require('../src/engine/equipment');
const out = process.env.PROOF_DIR || '/tmp/dofus-primary-ai';
const profiles = [
  { id: 'iop', name: 'Iop capitaine', classId: 'IOP', className: 'Iop', loadout: { ...emptyLoadout('IOP'), level: 200, base: { force: 200 } } },
  { id: 'cra', name: 'Crâ éclaireur', classId: 'CRA', className: 'Crâ', loadout: { ...emptyLoadout('CRA'), level: 200, base: { intelligence: 100 }, spells: { order: [171, 161, 164] } } },
];

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, pipe: true });
  const page = await browser.newPage(), report = { errors: [], checks: [] };
  page.setDefaultTimeout(30000);
  page.on('pageerror', error => report.errors.push(error.message));
  const click = async (selector, text = '') => {
    const handle = await page.evaluateHandle(({ selector, text }) => [...document.querySelectorAll(selector)].find(e => e.checkVisibility() && e.textContent.includes(text)), { selector, text });
    assert(handle.asElement(), `Missing ${selector}: ${text}`); await handle.asElement().click(); await handle.dispose();
  };
  const value = selector => page.$eval(selector, e => e.value);
  const text = selector => page.$eval(selector, e => e.textContent);
  const capture = name => page.screenshot({ path: path.join(out, `${name}.png`) });
  const resize = async viewport => { await page.setViewport(viewport); await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)))); };
  const open = async () => { await click('.setup-play'); await click('[data-panel-trigger="allies"]'); };
  const controls = { leader: '[aria-label="Contrôle du personnage principal"]', bot: '[aria-label="IA du personnage principal"]',
    ally: '[aria-label="Contrôle de Crâ éclaireur (1)"]', allyBot: '[aria-label="IA de Crâ éclaireur (1)"]' };
  try {
    await page.setViewport({ width: 1480, height: 1000 });
    await page.evaluateOnNewDocument(profiles => {
      // Freeze only the human turn timer in this isolated verification browser.
      const interval = window.setInterval.bind(window);
      window.setInterval = (callback, delay, ...args) => interval(delay === 200 ? () => {} : callback, delay, ...args);
      if (localStorage.getItem('primary-ai-proof')) return;
      localStorage.setItem('primary-ai-proof', '1');
      localStorage.setItem('dofus-lite-profiles-v1', JSON.stringify({ version: 1, profiles, activeId: 'iop' }));
      localStorage.setItem('dofus-lite-player-setup-v1', JSON.stringify({ mode: 'kanojedo', monsterGrade: 1, mapId: 'canyon', playerBotId: 'maison', botId: 'pantin' }));
      localStorage.setItem('dofus-lite-sound', JSON.stringify({ enabled: false, volume: 0 }));
    }, profiles);
    await page.goto(process.env.PROOF_URL || 'http://127.0.0.1:3013', { waitUntil: 'networkidle0' });
    const original = await page.evaluate(() => localStorage.getItem('dofus-lite-profiles-v1'));
    await open();
    await page.select(controls.leader, 'ai'); await page.select(controls.bot, 'pantin');
    await click('[data-candidate-id="profile:cra"] button');
    assert.equal(await value(controls.ally), 'player');
    await page.$eval('.duel-team-list', e => { e.scrollTop = 0; });
    await capture('mixed-team');
    await click('.combat-choice-done');
    assert((await text('.combat-play-style')).includes('Équipe mixte'));
    const preview = await page.$$eval('.friends .combat-member', es => es.map(e => e.textContent));
    assert(preview[0].endsWith('IA') && preview[1].endsWith('Vous'));
    report.checks.push('principal AI with a manual companion; preview reflects each control');

    await page.reload({ waitUntil: 'networkidle0' }); await open();
    assert.equal(await value(controls.leader), 'ai'); assert.equal(await value(controls.bot), 'pantin');
    assert.equal(await value(controls.ally), 'player');
    report.checks.push('principal control, chosen AI and manual companion persist after reload');
    await resize({ width: 390, height: 844 });
    assert(await page.evaluate(() => {
      const dialog = document.querySelector('.combat-choice'), r = dialog.getBoundingClientRect(), done = dialog.querySelector('.combat-choice-done').getBoundingClientRect();
      return r.right <= innerWidth && dialog.scrollWidth <= dialog.clientWidth + 1 && done.bottom <= innerHeight;
    }), 'Mobile dialog fits');
    await capture('mobile-primary-ai');
    report.checks.push('mobile primary controls and footer fit the screen');
    await resize({ width: 1480, height: 1000 });
    await click('.combat-choice-done'); await click('.combat-choice-launch');
    await page.waitForSelector('.placement-ready');
    assert.equal(await page.$$eval('.token.side-A', es => es.length), 2);
    assert.equal(await page.$('[data-auto-dungeon]'), null);
    await click('.placement-ready');
    await page.waitForFunction(() => document.querySelector('[data-controlled-fighter]')?.dataset.controlledFighter === 'A2' && !document.querySelector('.end-turn')?.disabled);
    const pa = Number(await text('.player-resources .pa strong'));
    const boost = await page.$('.spell-btn[title^="Tir Eloigné"]'); assert(boost, 'Manual companion spellbook');
    await boost.click({ button: 'right' });
    assert.equal(Number(await text('.player-resources .pa strong')), pa - 2);
    await capture('manual-companion-turn');
    await click('.end-turn');
    await page.waitForFunction(() => document.querySelector('[data-controlled-fighter]')?.dataset.controlledFighter === 'A2' && !document.querySelector('.end-turn')?.disabled);
    report.checks.push('selected principal AI passes autonomously; companion casts and receives the next manual turn');
    await click('.fight-heading-actions button', 'Abandonner'); await open();

    // Change the last manual member: simulation follows without using Tout en IA.
    await page.select(controls.bot, 'maison'); await page.select(controls.ally, 'ai');
    await page.select(controls.allyBot, 'maison');
    assert((await text('.duel-team-bottom')).includes('IA contre IA'));
    await page.select(controls.ally, 'player');
    assert(!(await text('.duel-team-bottom')).includes('IA contre IA'));
    await page.select(controls.ally, 'ai');
    await page.$eval('.duel-team-list', e => { e.scrollTop = 0; });
    await capture('automatic-team-controls');
    await click('.combat-choice-done');
    assert((await text('.combat-play-style')).includes('IA contre IA'));
    await capture('automatic-overview');
    await click('.combat-choice-launch');
    await page.waitForSelector('[data-auto-dungeon]', { timeout: 120000 });
    assert((await text('.fight-heading')).includes('Kanojedo'));
    assert.equal(await page.$$eval('.token.side-A', es => es.length), 2);
    assert(await page.$('.auto-result-button'), 'Replay controls are available automatically');
    await click('.auto-result-button');
    assert.equal(await page.$eval('[data-outcome]', e => e.dataset.outcome), 'victory');
    await capture('automatic-result');
    report.checks.push('all-AI team launches a simulation automatically on the training map and wins', 'switching any member to manual exits all-AI mode without hiding selectors');
    assert.equal(await page.evaluate(() => localStorage.getItem('dofus-lite-profiles-v1')), original);
    assert.deepEqual(report.errors, []);
    report.checks.push('original character profiles preserved; no browser errors');
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    await capture('failure'); fs.writeFileSync(path.join(out, 'failure.txt'), await page.evaluate(() => document.body.innerText)); throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
