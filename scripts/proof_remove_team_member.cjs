require('./ai_runtime.cjs');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const puppeteer = require('puppeteer-core');
const { emptyLoadout } = require('../src/engine/equipment');
const out = process.env.PROOF_DIR || '/tmp/dofus-remove-team-member';
const profile = (id, name, classId) => ({ id, name, classId, className: classId,
  loadout: { ...emptyLoadout(classId), level: 200, base: {} } });
const profiles = [profile('iop', 'Iop capitaine', 'IOP'), profile('cra', 'Crâ éclaireur', 'CRA'), profile('sram', 'Sram nocturne', 'SRAM')];
const bots = ['alpha', 'beta'].map(id => ({ id, custom: true, name: `IA test ${id}`, code: `let calls = 0;
function decide() { calls++; return calls % 2 ? { type: 'SAY', text: '${id}-' + calls } : { type: 'PASS' }; }` }));
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, pipe: true });
  const page = await browser.newPage(), report = { errors: [], checks: [] };
  page.setDefaultTimeout(30000);
  page.on('pageerror', error => report.errors.push(error.message));
  const click = async (selector, text = '') => {
    await page.waitForFunction(({ selector, text }) => [...document.querySelectorAll(selector)].some(e => e.checkVisibility() && e.textContent.includes(text)), {}, { selector, text });
    const handle = await page.evaluateHandle(({ selector, text }) => [...document.querySelectorAll(selector)].find(e => e.checkVisibility() && e.textContent.includes(text)), { selector, text });
    assert(handle.asElement(), `Missing ${selector}: ${text}`); await handle.asElement().click(); await handle.dispose();
  };
  const capture = name => page.screenshot({ path: path.join(out, `${name}.png`) });
  const check = label => { report.checks.push(label); console.log(label); };
  const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('dofus-lite-ally-team-v1')));
  const inspectLive = async () => page.evaluate(() => {
    const e = document.querySelector('.fight-screen');
    let fiber = e[Object.keys(e).find(k => k.startsWith('__reactFiber$'))], match;
    for (; fiber && !match; fiber = fiber.return) for (let hook = fiber.memoizedState; hook; hook = hook.next) {
      const value = hook.memoizedState?.current;
      if (typeof value?.humanAct === 'function') { match = value; break; }
    }
    if (!match) throw new Error('Missing live match');
    window.teamProof = match;
    window.teamProofActions = [];
    const action = match.humanAct;
    match.humanAct = function (value) { const result = action.call(this, value); window.teamProofActions.push({ value, ok: result.ok, events: result.events }); return result; };
    return Object.values(match.state.fighters).filter(f => f.team === 'A').map(f => ({ id: f.id, name: f.name, classId: f.classId }));
  });
  try {
    await page.setViewport({ width: 1480, height: 1000 });
    await page.evaluateOnNewDocument(({ profiles, bots }) => {
      const interval = window.setInterval.bind(window);
      window.setInterval = (callback, delay, ...args) => interval(delay === 200 ? () => {} : callback, delay, ...args);
      if (localStorage.getItem('remove-team-proof')) return;
      localStorage.setItem('remove-team-proof', '1');
      localStorage.setItem('dofus-lite-profiles-v1', JSON.stringify({ version: 1, profiles, activeId: 'iop' }));
      localStorage.setItem('dofus-lite-player-setup-v1', JSON.stringify({ mode: 'duel', mapId: 'canyon', playerBotId: 'pantin' }));
      localStorage.setItem('dofus-lite-opponent-team-v1', JSON.stringify({ version: 1, entries: [{ kind: 'monster', monsterId: 494, grade: 1 }] }));
      localStorage.setItem('koliseum.bots.v1', JSON.stringify(bots));
      localStorage.setItem('dofus-lite-sound', JSON.stringify({ enabled: false, volume: 0 }));
    }, { profiles, bots });
    await page.goto(process.env.PROOF_URL || 'http://127.0.0.1:3013', { waitUntil: 'networkidle0' });
    const original = await page.evaluate(() => localStorage.getItem('dofus-lite-profiles-v1'));
    await click('.setup-play'); await click('[data-panel-trigger="allies"]');
    await capture('principal-removable');
    await click('.team-leader .duel-remove-member'); await click('.combat-choice-done');
    assert(await page.$eval('.combat-choice-launch', e => e.disabled));
    assert.equal(await page.$$eval('.friends .combat-member', es => es.length), 0);
    await page.reload({ waitUntil: 'networkidle0' }); await click('.setup-play');
    assert.equal((await saved()).includePlayer, false);
    assert(await page.$eval('.combat-choice-launch', e => e.disabled));
    check('removing the principal in Mon équipe persists an empty team and disables launch');
    await click('[data-panel-trigger="allies"]');
    await click('[data-candidate-id="profile:cra"] button');
    await click('[data-candidate-id="profile:sram"] button');
    await page.select('[aria-label="Contrôle de Sram nocturne (2)"]', 'ai');
    await page.select('[aria-label="IA de Sram nocturne (2)"]', 'beta');
    await capture('replacement-team'); await click('.combat-choice-done');
    assert(await page.$eval('.combat-play-style', e => e.textContent.includes('Équipe mixte')));
    await capture('removable-overview');
    await page.setViewport({ width: 390, height: 844 });
    await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
    assert(await page.evaluate(() => {
      const d = document.querySelector('.combat-choice'), b = document.querySelector('.combat-choice-launch').getBoundingClientRect();
      return d.scrollWidth <= d.clientWidth + 1 && b.bottom <= innerHeight;
    }));
    await capture('mobile-removable-overview');
    await page.setViewport({ width: 1480, height: 1000 });
    await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
    await click('[data-panel-trigger="settings"]');
    await page.$eval('[aria-label="Graine du combat"]', e => e.select());
    await page.type('[aria-label="Graine du combat"]', '17');
    await click('.combat-choice-done');
    await click('.combat-choice-launch'); await page.waitForSelector('.placement-ready');
    assert.deepEqual(await inspectLive(), [{ id: 'A', name: 'Crâ éclaireur', classId: 'CRA' }, { id: 'A2', name: 'Sram nocturne', classId: 'SRAM' }]);
    await click('.placement-ready'); await page.waitForFunction(() => !document.querySelector('.end-turn')?.disabled);
    assert(await page.evaluate(() => window.teamProof.isHumanTurn() && window.teamProof.current().name === 'Crâ éclaireur'));
    const boost = await page.waitForSelector('.spell-slot[data-spell-id="172"] .spell-btn:not(:disabled)');
    assert(boost); await boost.click({ button: 'right' });
    await page.waitForFunction(() => window.teamProof.state.fighters.A.effects.some(e => e.stat === 'range'));
    await click('.spellbar-sort');
    assert.equal(await page.evaluate(() => localStorage.getItem('dofus-lite-profiles-v1')), original);
    check('replacement has its own spells and manual controls; companion keeps its AI; saved profiles remain untouched');
    await click('.fight-heading-actions button', 'Abandonner');
    await page.reload({ waitUntil: 'networkidle0' }); await click('.setup-play');
    assert.equal(await page.$$eval('.friends .combat-member', es => es.length), 2);
    assert.equal(await page.$('[aria-label="Retirer Iop capitaine de mon équipe"]'), null);
    await click('[data-panel-trigger="allies"]');
    await page.select('[aria-label="Contrôle de Crâ éclaireur (1)"]', 'ai');
    await page.select('[aria-label="IA de Crâ éclaireur (1)"]', 'alpha');
    await click('.combat-choice-done'); await click('.combat-choice-launch');
    await page.waitForSelector('[data-auto-dungeon]', { timeout: 120000 });
    await click('.auto-result-button');
    report.automatic = await page.evaluate(() => {
      const e = document.querySelector('[data-auto-dungeon]');
      let fiber = e[Object.keys(e).find(k => k.startsWith('__reactFiber$'))], result;
      for (; fiber && !result; fiber = fiber.return) for (let hook = fiber.memoizedState; hook; hook = hook.next) {
        const value = hook.memoizedState;
        if (value?.frames && value?.events && value?.finalState) { result = value; break; }
      }
      if (!result) throw new Error('Missing replay');
      return { names: Object.values(result.frames[0].state.fighters).filter(f => f.team === 'A').map(f => f.name),
        first: ['A','A2'].map(id => result.events.find(e => e.t === 'say' && e.fighter === id)?.text), errors: result.events.filter(e => e.t === 'bot_error') };
    });
    assert.deepEqual(report.automatic, { names: ['Crâ éclaireur', 'Sram nocturne'], first: ['alpha-1', 'beta-1'], errors: [] });
    check('automatic simulation contains only the replacement team and executes each assigned AI');
    await click('.fight-heading-actions button', 'Retour à Combat');
    await click('[aria-label="Retirer Crâ éclaireur de mon équipe (1)"]');
    assert.deepEqual((await saved()).entries.map(e => [e.name, e.botId]), [['Sram nocturne', 'beta']]);
    await click('.combat-control-toggle button', 'Je joue');
    assert.equal((await saved()).entries[0].controller, 'player');
    await click('[aria-label="Retirer Sram nocturne de mon équipe (1)"]');
    assert(await page.$eval('.combat-choice-launch', e => e.disabled));
    await click('[aria-label="Retirer Poutch Ingball des adversaires (1)"]');
    assert.equal(await page.$$eval('.enemies .combat-member', es => es.length), 0);
    check('inline combat overview can remove every member in either camp; controls stay with remaining characters');
    await click('[data-panel-trigger="allies"]');
    await click('.duel-source-tabs button', 'Monstres'); await page.type('[aria-label="Rechercher un allié"]', 'Poutch');
    await click('[data-candidate-id="monster:494"] button'); await click('.combat-choice-done');
    await click('[data-panel-trigger="opponents"]');
    await click('.duel-source-tabs button', 'Monstres'); await page.type('[aria-label="Rechercher un adversaire"]', 'Poutch');
    await click('[data-candidate-id="monster:494"] button'); await click('.combat-choice-done');
    await click('.combat-choice-launch'); await page.waitForSelector('[data-auto-dungeon]', { timeout: 120000 });
    assert(await page.evaluate(() => !document.querySelector('[role="alert"]')));
    check('an entirely native monster team also launches without injecting a player');
    assert.equal(await page.evaluate(() => localStorage.getItem('dofus-lite-profiles-v1')), original);
    assert.deepEqual(report.errors, []);
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  } catch (error) { console.error(JSON.stringify(await page.evaluate(() => ({ actions: window.teamProofActions, seed: window.teamProof?.state.seed, pa: window.teamProof?.state.fighters.A.pa })))); await capture('failure'); throw error; }
  finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
