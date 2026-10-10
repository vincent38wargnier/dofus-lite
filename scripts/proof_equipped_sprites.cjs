// Original Flash accessories, in real combat UI and a disposable browser profile.
const puppeteer = require('puppeteer-core');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const out = process.env.PROOF_DIR || '/tmp/dofus-wearables';
const url = process.env.PROOF_URL || 'http://127.0.0.1:3013';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const classes = ['IOP', 'FECA', 'OSAMODAS', 'ENUTROF', 'SRAM', 'XELOR', 'ECAFLIP', 'ENIRIPSA', 'CRA', 'SADIDA', 'SACRIEUR', 'PANDAWA'];

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, pipe: true });
  const report = { errors: [], classes: [], poses: [] };
  let page;
  try {
    for (const classId of process.env.PROOF_CLASS ? [process.env.PROOF_CLASS] : classes) {
      page = await browser.newPage(); page.setDefaultTimeout(30000);
      await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 2 });
      page.on('pageerror', e => report.errors.push(e.message));
      page.on('response', r => { if (r.status() >= 400) report.errors.push(`${r.status()} ${r.url()}`); });
      await page.evaluateOnNewDocument(classId => {
        const base = { version: 1, level: 200, base: {}, rollMode: 'max', rollSeed: 1 };
        localStorage.setItem('dofus-lite-player-setup-v1', JSON.stringify({ playerClass: classId, botClass: classId, botId: 'wearables-proof', mode: 'duel', mapId: 'amakna_952' }));
        localStorage.setItem('koliseum.bots.v1', JSON.stringify([{ id: 'wearables-proof', name: 'Sparring', custom: true, code: 'function decide(v,a){return a.endTurn();}' }]));
        localStorage.setItem('dofus-lite-loadouts-v1', JSON.stringify({
          [`A:${classId}`]: { ...base, profile: { sex: 0, alignment: 0, rank: 0 }, slots: { hat: 11548, cape: 8876, pet: 7519 } },
          [`B:${classId}`]: { ...base, profile: { sex: 1, alignment: 0, rank: 0 }, slots: { hat: 2411, cape: 8265, pet: 1728 } },
        }));
        localStorage.setItem('dofus-lite-sound-v1', JSON.stringify({ enabled: false, volume: 0 }));
        Math.random = () => .000021;
      }, classId);
      const click = async (selector, text = '') => {
        const h = await page.evaluateHandle(({ selector, text }) => [...document.querySelectorAll(selector)]
          .find(e => e.checkVisibility() && e.textContent.includes(text)), { selector, text });
        assert(h.asElement(), `Missing ${selector}: ${text}`);
        await h.asElement().click(); await h.dispose();
      };
      await page.goto(url, { waitUntil: 'networkidle0' });
      await click('.setup-play');
      await page.waitForFunction(() => document.querySelectorAll('.token ruffle-player').length === 2
        && [...document.querySelectorAll('.token ruffle-player')].every(p => p.accessoryState));
      await page.waitForFunction(() => [...document.querySelectorAll('.token ruffle-player')]
        .every(p => p.ruffle().callExternalInterface('accessoryState')?.hat.width > 0));
      const actors = await page.$$eval('.token', tokens => tokens.map(t => ({ id: t.dataset.actor,
        equipment: t.querySelector('ruffle-player').ruffle().callExternalInterface('accessoryState') })));
      for (const [index, actor] of actors.entries()) {
        for (const [slot, graphic] of Object.entries(index === 0 ? { hat: '16_282', cape: '17_147', pet: '18_14' }
          : { hat: '16_41', cape: '17_110', pet: '18_1' })) {
          assert.equal(actor.equipment[slot].graphic, graphic, `${classId} ${index} ${slot}`);
          assert(actor.equipment[slot].width > 0 && actor.equipment[slot].height > 0, `Empty graphic: ${classId} ${slot}`);
        }
      }
      assert.equal(Number(actors[1].id), Number(actors[0].id) + 1, `${classId}: independent male/female snapshots`);
      report.classes.push({ classId, actors });
      console.log(`Verified ${classId}: both appearances, distinct hats, capes and pets`);
      if (classId === 'IOP') {
        // Exercise native poses inside the existing player (including mirrored
        // orientations and cape/pet walking frames), without remounting it.
        await page.$eval('.token.side-A ruffle-player', p => { window.wearablePlayer = p; });
        for (const [label, mirror] of [['staticR', false], ['staticR', true], ['staticL', false], ['staticL', true], ['walkR', false], ['walkL', true], ['anim0R', false]]) {
          await page.$eval('.token.side-A ruffle-player', (p, { label, mirror }) => p.ruffle().callExternalInterface('animate', label, mirror), { label, mirror });
          await sleep(100);
          const equipment = await page.$eval('.token.side-A ruffle-player', p => p.ruffle().callExternalInterface('accessoryState'));
          assert.equal(equipment.hat.graphic, '16_282');
          assert(equipment.hat.width > 0 && equipment.cape.width > 0);
          if (label.startsWith('walk')) assert(equipment.pet.pose.startsWith('W'), `Pet does not walk: ${label}`);
          report.poses.push({ label, mirror, equipment });
        }
        await click('.fight-log-close');
        await click('.placement-ready');
        await page.waitForSelector('.turn-status.yours');
        // Actual self-cast through the bar: the clothing player survives the
        // action and its render updates; the three items remain attached.
        await page.click('.spell-slot[data-spell-id="153"] button', { button: 'right' });
        await page.waitForFunction(() => document.querySelector('.token.side-A').dataset.animation?.startsWith('anim'));
        await sleep(150);
        assert(await page.evaluate(() => document.querySelector('.token.side-A ruffle-player') === window.wearablePlayer), 'A combat action reloaded the equipped actor');
        await page.waitForFunction(() => document.querySelector('.token.side-A ruffle-player')?.accessoryState
          && document.querySelector('.token.side-A ruffle-player').ruffle().callExternalInterface('accessoryState').hat.width > 0);
        await sleep(1600); await page.mouse.move(2, 2);
        const movement = await page.evaluate(() => {
          const element = document.querySelector('.fight-screen');
          let fiber = element[Object.keys(element).find(k => k.startsWith('__reactFiber$'))], match;
          for (; fiber && !match; fiber = fiber.return) {
            for (let hook = fiber.memoizedState; hook; hook = hook.next) {
              if (typeof hook.memoizedState?.current?.humanAct === 'function') { match = hook.memoizedState.current; break; }
            }
          }
          if (!match) throw new Error('Missing live match');
          const from = match.state.fighters.A.pos;
          const targets = [...document.querySelectorAll('.cell.hl-move')].map(cell => cell.dataset.cell)
            .map(cell => ({ cell, pos: cell.split(',').map(Number) })).filter(({ pos: [x, y] }) => x < from.x && y <= from.y);
          targets.sort((a, b) => b.pos.reduce((s, p, i) => s + Math.abs(p - [from.x, from.y][i]), 0)
            - a.pos.reduce((s, p, i) => s + Math.abs(p - [from.x, from.y][i]), 0));
          if (!targets[0]) throw new Error('No north-west movement target');
          return { from, to: targets[0].cell, pa: match.state.fighters.A.pa };
        });
        assert.equal(movement.pa, 3, 'Puissance must really be cast');
        await click(`.cell[data-cell="${movement.to}"]`);
        await page.waitForFunction(() => document.querySelector('.token.side-A.walking ruffle-player')?.accessoryState
          && document.querySelector('.token.side-A.walking ruffle-player').ruffle().callExternalInterface('accessoryState').pet.pose?.startsWith('W'), { polling: 10 });
        report.movement = { ...movement, equipment: await page.$eval('.token.side-A ruffle-player', p => p.ruffle().callExternalInterface('accessoryState')) };
        await page.waitForFunction(() => !document.querySelector('.token.side-A.walking'));
        await sleep(150);
        assert(await page.evaluate(() => document.querySelector('.token.side-A ruffle-player') === window.wearablePlayer));
        await page.screenshot({ path: path.join(out, 'combat.png') });
        // Close-up is a real screen crop, keeping Flash vectors and both
        // character/companion registrations at their actual combat scale.
        const rect = await page.$eval('.token.side-A ruffle-player', p => {
          const r = p.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height };
        });
        await page.screenshot({ path: path.join(out, 'equipped-character.png'), clip: rect });
      }
      await page.close(); page = null;
    }
    assert.deepEqual(report.errors, []);
  } catch (error) {
    if (page) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
    throw error;
  } finally {
    fs.writeFileSync(path.join(out, 'proof.json'), JSON.stringify(report, null, 2));
    const process = browser.process(); await browser.disconnect(); process?.kill('SIGTERM');
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
