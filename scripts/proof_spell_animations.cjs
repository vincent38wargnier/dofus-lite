// Real combat + original Flash clips in an isolated profile; no player saves touched.
const puppeteer = require('puppeteer-core');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const url = process.env.PROOF_URL || 'http://127.0.0.1:3013';
const out = process.env.PROOF_DIR || '/tmp/dofus-spell-animations';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true, pipe: true, protocolTimeout: 30000 });
  let page;
  const proofs = [], errors = [];
  try {
    const scenarios = [
      { name: 'sud-est', classId: 'IOP', spell: 'Souffle', id: 151, delta: [2, 0], label: 'anim0R', mirror: false },
      { name: 'sud-ouest', classId: 'IOP', spell: 'Souffle', id: 151, delta: [0, 2], label: 'anim0R', mirror: true },
      { name: 'nord-ouest', classId: 'IOP', spell: 'Souffle', id: 151, delta: [-2, 0], label: 'anim0L', mirror: false },
      { name: 'nord-est', classId: 'IOP', spell: 'Souffle', id: 151, delta: [0, -2], label: 'anim0L', mirror: true },
      { name: 'bond', classId: 'IOP', spell: 'Bond', id: 142, delta: [2, 0], label: 'anim1R', mirror: false },
      { name: 'fleche', classId: 'CRA', spell: 'Flèche Magique', id: 161, delta: [5, 0], label: 'anim2R', mirror: false },
      { name: 'trainee', classId: 'IOP', spell: 'Épée du Destin', id: 146, delta: [1, 0], label: 'anim0R', mirror: false },
    ];
    for (const scenario of scenarios) {
      page = await browser.newPage();
      await page.setViewport({ width: 1500, height: 1100 });
      page.on('pageerror', error => errors.push(error.message));
      page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
      await page.evaluateOnNewDocument(classId => {
        localStorage.setItem('dofus-lite-player-setup-v1', JSON.stringify({ playerClass: classId, botClass: 'CRA', botId: 'animation-proof', mapId: 'arene' }));
        localStorage.setItem('koliseum.bots.v1', JSON.stringify([{ id: 'animation-proof', name: 'Sparring', custom: true, code: 'function decide(v,a){return a.endTurn();}' }]));
        const base = { version: 1, level: 200, slots: {}, base: {}, rollMode: 'max', rollSeed: 1 };
        localStorage.setItem('dofus-lite-loadouts-v1', JSON.stringify({ [`A:${classId}`]: base, 'B:CRA': base }));
        localStorage.setItem('dofus-lite-sound-v1', JSON.stringify({ enabled: false, volume: 0 }));
        Math.random = () => 0.000007;
        const original = URL.createObjectURL;
        URL.createObjectURL = function (blob) { window.combatExport = blob; return original.call(this, blob); };
      }, scenario.classId);
      const click = async (selector, text = '') => {
        const handle = await page.evaluateHandle(({ selector, text }) => [...document.querySelectorAll(selector)]
          .find(element => element.checkVisibility() && element.textContent.includes(text)), { selector, text });
        assert(handle.asElement(), `Missing ${selector}: ${text}`);
        assert(!await handle.asElement().evaluate(element => element.disabled), `Disabled ${selector}: ${text}`);
        await handle.asElement().click(); await handle.dispose();
      };
      await page.goto(url, { waitUntil: 'networkidle0' });
      await click('.setup-play');
      await page.waitForFunction(() => document.querySelector('.token.side-A ruffle-player')?.animate);
      await click('.placement-ready');
      await page.waitForSelector('.cell.hl-move');
      await click('.cell.hl-move[data-cell="3,6"]');
      await page.waitForFunction(() => !document.querySelector('.token.side-A.walking'));
      const manifest = await page.evaluate(async () => (await fetch('/dofus-local/manifest.json')).json());
      const meta = manifest.spells[scenario.id];
      await page.evaluate(() => {
        window.effectLoads = [];
        const prototype = Object.getPrototypeOf(document.querySelector('.retro-actor ruffle-player').ruffle());
        const original = prototype.load;
        prototype.load = async function (config) {
          window.effectLoads.push({ url: config.swfFileName, parameters: config.parameters });
          return original.call(this, config);
        };
      });
      const cell = `${3 + scenario.delta[0]},${6 + scenario.delta[1]}`;
      await click('.spell-btn', scenario.spell);
      assert(await page.$(`.cell.hl-target[data-cell="${cell}"]`), `Not targetable: ${scenario.name} ${cell}`);
      await click(`.cell[data-cell="${cell}"]`);
      await page.mouse.move(20, 20);
      await page.waitForFunction(label => document.querySelector('.token.side-A').dataset.animation === label, {}, scenario.label);
      const orientation = await page.$eval('.token.side-A', token => ({ label: token.dataset.animation, mirror: token.dataset.mirror,
        transform: token.querySelector('.retro-actor').style.transform,
        frame: token.querySelector('ruffle-player').ruffle().callExternalInterface('currentFrame') }));
      assert.equal(orientation.mirror, String(scenario.mirror));
      const actorId = manifest.classes[scenario.classId].male;
      assert.equal(orientation.frame, manifest.actors[actorId].animations.indexOf(scenario.label) + 1);
      await page.waitForFunction(() => document.querySelector('.retro-spell-effect ruffle-player')?.effectState);
      const states = [];
      for (let i = 0; i < 12; i += 1) {
        const state = await page.$eval('.retro-spell-effect ruffle-player', player => player.ruffle().callExternalInterface('effectState'));
        states.push(state);
        if (state.ended || ![30, 31, 40, 41].includes(meta.type)) break;
        await sleep(30);
      }
      const load = await page.evaluate(() => window.effectLoads.find(record => record.url.startsWith('effects/')));
      assert.equal(states[0].level, 6);
      assert(Math.abs(states[0]._x - Number(load.parameters.effectX)) < .051); // Flash twips
      assert(Math.abs(states[0]._y - Number(load.parameters.effectY)) < .051);
      if ([30, 31].includes(meta.type)) {
        assert(states.some(state => Number.isFinite(state.moveX)), 'Native moving export is absent');
        assert(states.some(state => Number.isFinite(state.shootX)), 'Native impact export is absent');
      }
      if (meta.type === 51) {
        assert.deepEqual(states[0].cellFrom, { x: Number(load.parameters.fromX), y: Number(load.parameters.fromY) });
        assert.deepEqual(states[0].cellTo, { x: 0, y: 0 });
      }
      await page.screenshot({ path: path.join(out, `${scenario.name}.png`) });
      await page.waitForFunction(() => !document.querySelector('.retro-spell-effect'), { timeout: 4000 });
      proofs.push({ scenario: scenario.name, spell: scenario.spell, type: meta.type, orientation, states });
      console.log(`Verified ${scenario.name}: ${scenario.label}, mirror ${scenario.mirror}, effect ${meta.type}`);
      await page.close(); page = null;
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(out, 'proof.json'), JSON.stringify({ proofs, errors }, null, 2));
  } catch (error) {
    if (page) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
    throw error;
  } finally {
    await browser.disconnect(); browser.process()?.kill('SIGKILL');
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
