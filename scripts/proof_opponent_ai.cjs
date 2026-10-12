require('./ai_runtime.cjs');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const puppeteer = require('puppeteer-core');
const { emptyLoadout } = require('../src/engine/equipment');
const out = process.env.PROOF_DIR || '/tmp/dofus-opponent-ai';
const profile = (id, name, classId) => ({ id, name, classId, className: classId,
  loadout: { ...emptyLoadout(classId), level: 200, base: {} } });
const profiles = [profile('iop', 'Iop capitaine', 'IOP'), profile('cra', 'Crâ vigie', 'CRA'), profile('sram', 'Sram éclaireur', 'SRAM')];
const bots = ['alpha', 'beta'].map(id => ({ id, custom: true, name: `IA test ${id}`, code: `let calls = 0;
  function decide() { calls++; return calls % 2 ? { type: 'SAY', text: '${id}-' + calls } : { type: 'PASS' }; }` }));

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
  const choose = (index, id) => page.select(`[data-opponent-index="${index}"] .opponent-controller select`, id);
  const entries = () => page.evaluate(() => JSON.parse(localStorage.getItem('dofus-lite-opponent-team-v1')).entries);
  const open = async () => { await click('.setup-play'); await click('[data-panel-trigger="opponents"]'); };
  const capture = name => page.screenshot({ path: path.join(out, `${name}.png`) });
  const check = label => { report.checks.push(label); console.log(label); };
  try {
    await page.setViewport({ width: 1480, height: 1000 });
    await page.evaluateOnNewDocument(({ profiles, bots }) => {
      const interval = window.setInterval.bind(window);
      window.setInterval = (callback, delay, ...args) => interval(delay === 200 ? () => {} : callback, delay, ...args);
      if (localStorage.getItem('opponent-ai-proof')) return;
      localStorage.setItem('opponent-ai-proof', '1');
      localStorage.setItem('dofus-lite-profiles-v1', JSON.stringify({ version: 1, profiles, activeId: 'iop' }));
      localStorage.setItem('dofus-lite-player-setup-v1', JSON.stringify({ mode: 'duel', mapId: 'canyon', botId: 'pantin', playerBotId: 'pantin' }));
      localStorage.setItem('dofus-lite-opponent-team-v1', JSON.stringify({ version: 1, entries: profiles.slice(1).map(p => ({ kind: 'character', name: p.name, classId: p.classId, loadout: p.loadout })) }));
      localStorage.setItem('koliseum.bots.v1', JSON.stringify(bots));
      localStorage.setItem('dofus-lite-sound', JSON.stringify({ enabled: false, volume: 0 }));
    }, { profiles, bots });
    await page.goto(process.env.PROOF_URL || 'http://127.0.0.1:3013', { waitUntil: 'networkidle0' });
    const original = await page.evaluate(() => localStorage.getItem('dofus-lite-profiles-v1'));
    await open();
    assert.deepEqual((await entries()).map(e => e.botId), ['pantin', 'pantin']);
    await choose(0, 'maison');
    assert.deepEqual((await entries()).map(e => e.botId), ['maison', 'pantin']);
    assert.equal(await page.$('[aria-label="Bot adverse"]'), null);
    await capture('individual-opponent-ai');
    check('legacy shared AI retained on each opponent; changing one leaves the other unchanged');

    await choose(0, 'alpha'); await choose(1, 'beta');
    await click('.duel-source-tabs button', 'Monstres');
    await page.type('[aria-label="Rechercher un adversaire"]', 'Poutch');
    await page.select('[aria-label="Niveau proposé pour Poutch Ingball"]', '2');
    await click('[data-candidate-id="monster:494"] button');
    assert.equal(await page.$eval('[data-opponent-index="2"] .opponent-controller select', e => e.value), '');
    await choose(2, 'alpha'); await choose(2, '');
    assert.equal((await entries())[2].botId, null);
    await choose(2, 'beta');
    await page.reload({ waitUntil: 'networkidle0' }); await open();
    assert.deepEqual((await entries()).map(e => e.botId), ['alpha', 'beta', 'beta']);
    check('personal AI and monster override persist after reload; native monster AI remains selectable');
    await page.setViewport({ width: 390, height: 844 });
    await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
    assert(await page.evaluate(() => {
      const dialog = document.querySelector('.combat-choice'), r = dialog.getBoundingClientRect(), done = dialog.querySelector('.combat-choice-done').getBoundingClientRect();
      return r.right <= innerWidth && dialog.scrollWidth <= dialog.clientWidth + 1 && done.bottom <= innerHeight;
    }), 'Mobile chooser fits');
    await page.$eval('[data-opponent-index="2"] .opponent-controller select', e => e.scrollIntoView({ block: 'nearest' }));
    await choose(2, 'alpha'); await choose(2, 'beta');
    await page.$eval('.duel-team-list', e => { e.scrollTop = 0; });
    await capture('mobile-individual-ai');
    check('individual selectors remain usable on mobile');
    await page.setViewport({ width: 1480, height: 1000 });
    await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
    await click('.combat-choice-done'); await click('.combat-choice-launch'); await page.waitForSelector('.placement-ready');
    // Observe actual decisions without modifying the combat state or actions.
    await page.evaluate(() => {
      const e = document.querySelector('.fight-screen');
      let fiber = e[Object.keys(e).find(k => k.startsWith('__reactFiber$'))], match;
      for (; fiber && !match; fiber = fiber.return) for (let hook = fiber.memoizedState; hook; hook = hook.next) {
        const value = hook.memoizedState?.current;
        if (typeof value?.humanAct === 'function') { match = value; break; }
      }
      if (!match) throw new Error('Missing live match');
      window.opponentProof = { match, events: [] };
      const step = match.botStep;
      match.botStep = function () { const result = step.call(this); window.opponentProof.events.push(...result.events); return result; };
    });
    await click('.placement-ready');
    await page.waitForFunction(() => !document.querySelector('.end-turn')?.disabled);
    await click('.end-turn');
    await page.waitForFunction(() => ['B', 'B2', 'B3'].every(id => window.opponentProof.events.some(e => e.t === 'say' && e.fighter === id)));
    report.live = await page.evaluate(() => Object.fromEntries(['B', 'B2', 'B3'].map(id => [id, window.opponentProof.events.find(e => e.t === 'say' && e.fighter === id).text])));
    assert.deepEqual(report.live, { B: 'alpha-1', B2: 'beta-1', B3: 'beta-1' });
    assert(await page.evaluate(() => !window.opponentProof.events.some(e => e.t === 'bot_error')));
    check('live combat executes each selected AI, with separate memory for two users of beta');
    await click('.fight-heading-actions button', 'Abandonner'); await open();

    await click('[data-opponent-index="0"] .duel-remove-member');
    assert.deepEqual((await entries()).map(e => e.botId), ['beta', 'beta']);
    await click('[data-candidate-id="profile:cra"] button'); await choose(2, 'alpha');
    assert.deepEqual((await entries()).map(e => e.botId), ['beta', 'beta', 'alpha']);
    check('removing and adding opponents keeps each existing AI attached to the correct fighter');
    await click('.combat-choice-done'); await click('.combat-control-toggle button', 'Tout en IA');
    await click('.combat-choice-launch'); await page.waitForSelector('[data-auto-dungeon]', { timeout: 120000 });
    await click('.auto-result-button');
    report.automatic = await page.evaluate(() => {
      const e = document.querySelector('[data-auto-dungeon]');
      let fiber = e[Object.keys(e).find(k => k.startsWith('__reactFiber$'))], result;
      for (; fiber && !result; fiber = fiber.return) for (let hook = fiber.memoizedState; hook; hook = hook.next) {
        const value = hook.memoizedState;
        if (value?.frames && value?.events && value?.finalState) { result = value; break; }
      }
      if (!result) throw new Error('Missing automatic recording');
      return { choices: result.config.opponents.map(e => e.botId), speakers: Object.fromEntries(['B', 'B2', 'B3'].map(id => [id, result.events.find(e => e.t === 'say' && e.fighter === id)?.text])), errors: result.events.filter(e => e.t === 'bot_error') };
    });
    assert.deepEqual(report.automatic, { choices: ['beta', 'beta', 'alpha'], speakers: { B: 'beta-1', B2: 'beta-1', B3: 'alpha-1' }, errors: [] });
    await capture('automatic-per-opponent');
    check('automatic combat and replay retain all individual AI choices, including a monster and personal scripts');
    assert.equal(await page.evaluate(() => localStorage.getItem('dofus-lite-profiles-v1')), original);
    assert.deepEqual(report.errors, []);
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    await capture('failure'); fs.writeFileSync(path.join(out, 'failure.txt'), await page.evaluate(() => document.body.innerText)); throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
