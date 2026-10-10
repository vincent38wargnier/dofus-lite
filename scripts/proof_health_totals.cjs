// Real Kanojedo input, unmodified engine rolls and exported HP accounting.
const puppeteer = require('puppeteer-core');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const out = process.env.PROOF_DIR || '/tmp/dofus-health-totals';

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, pipe: true });
  const report = { errors: [] };
  let page;
  try {
    page = await browser.newPage();
    page.setDefaultTimeout(10000);
    await page.setViewport({ width: 1600, height: 1150, deviceScaleFactor: 1.5 });
    page.on('pageerror', e => report.errors.push(e.message));
    const cdp = await page.createCDPSession();
    await cdp.send('Page.setDownloadBehavior', { behavior: 'deny' });
    await page.evaluateOnNewDocument(() => {
      localStorage.setItem('dofus-lite-player-setup-v1', JSON.stringify({ playerClass: 'ENIRIPSA', mode: 'kanojedo', monsterGrade: 5 }));
      localStorage.setItem('dofus-lite-loadouts-v1', JSON.stringify({
        'A:ENIRIPSA': { version: 1, level: 200, base: { force: 100 },
          slots: { weapon: 8825, cape: 8866, amulet: 323, ring1: 2469, dofus1: 7754 }, rollMode: 'max', rollSeed: 1 },
      }));
      Math.random = () => 0.000007;
      const original = URL.createObjectURL;
      URL.createObjectURL = function (blob) { window.combatExport = blob; return original.call(this, blob); };
    });
    const click = async (selector, text = '') => {
      const handle = await page.evaluateHandle(({ selector, text }) => [...document.querySelectorAll(selector)]
        .find(e => e.checkVisibility() && e.textContent.includes(text)), { selector, text });
      assert(handle.asElement(), `Missing ${selector}: ${text}`);
      assert(!await handle.asElement().evaluate(e => e.disabled), `Disabled ${selector}: ${text}`);
      await handle.asElement().click(); await handle.dispose();
    };
    const record = async () => {
      await click('.fight-screen .combat-log-heading button', 'Exporter');
      return page.evaluate(async () => JSON.parse(await window.combatExport.text()));
    };
    const pass = async () => {
      await page.keyboard.press('Escape'); await page.mouse.move(20, 20);
      await page.waitForFunction(() => !document.querySelector('.fighter-inspector'));
      const heading = await page.$eval('.fight-heading', e => e.innerText);
      await click('.play-controls .btn', 'Fin de tour');
      await page.waitForFunction(previous => document.querySelector('.turn-status.yours')
        && document.querySelector('.fight-heading').innerText !== previous, {}, heading);
    };
    const selectWeapon = () => click('.fight-screen .spell-btn', 'Masse du Corailleur Magistral');
    const approach = async state => {
      const target = state.fighters.B.pos;
      const costs = new Map([[`${target.x},${target.y}`, 0]]), queue = [target];
      for (let i = 0; i < queue.length; i++) {
        const p = queue[i];
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const n = { x: p.x + dx, y: p.y + dy }, k = `${n.x},${n.y}`;
          if (n.x < 0 || n.y < 0 || n.x >= state.board.width || n.y >= state.board.height || state.board.obstacles[k]?.blocksMove || costs.has(k)) continue;
          costs.set(k, costs.get(`${p.x},${p.y}`) + 1); queue.push(n);
        }
      }
      const moves = await page.$$eval('.cell.hl-move', cells => cells.map(c => c.dataset.cell));
      moves.sort((a, b) => (costs.get(a) ?? Infinity) - (costs.get(b) ?? Infinity));
      assert(moves.length, 'No legal movement toward Poutch');
      await click(`.cell[data-cell="${moves[0]}"]`);
      await page.waitForFunction(() => !document.querySelector('.token.walking'));
    };
    const floats = () => page.$$eval('.fight-screen .health-change', nodes => nodes.map(e => {
      const r = e.getBoundingClientRect();
      return { text: e.textContent, actionId: Number(e.dataset.actionId), target: e.dataset.target,
        lines: Number(e.dataset.healthLines), kind: e.classList.contains('dmg') ? 'damage' : 'heal',
        top: r.top, bottom: r.bottom, left: r.left, right: r.right };
    }));
    await page.goto(process.env.PROOF_URL || 'http://127.0.0.1:3013', { waitUntil: 'networkidle0' });
    await click('.setup-play'); await click('.placement-ready');
    await page.waitForSelector('.turn-status.yours');
    let inReach = false;
    for (let turn = 0; turn < 12; turn++) {
      await selectWeapon();
      inReach = !!await page.$('.token.side-B.targetable');
      await page.keyboard.press('Escape');
      if (inReach) break;
      await approach((await record()).state); await pass();
    }
    assert(inReach, 'Hammer cannot reach Poutch');
    // Mot Stimulant's real self-damage creates missing HP for both life steals.
    await click('.spell-slot[data-spell-id="126"] .spell-btn');
    await page.keyboard.press('Escape'); await page.mouse.move(20, 20);
    const before = await record();
    assert(before.state.fighters.A.hp < before.state.fighters.A.maxHp);
    assert(before.state.fighters.A.pa >= 10);
    await page.waitForFunction(() => !document.querySelector('.health-change'));
    await selectWeapon();
    await click('.token.side-B.targetable .figure');
    await page.waitForFunction(() => document.querySelectorAll('.fight-screen .health-change').length === 2);
    await page.keyboard.press('Escape'); await page.mouse.move(20, 20);
    const first = await floats();
    assert.equal(first.length, 2);
    assert(first.some(e => e.kind === 'damage' && e.lines === 3));
    assert(first.some(e => e.kind === 'heal' && e.lines === 2));
    // No action waits for either the weapon animation or floating numbers.
    await selectWeapon();
    await click('.token.side-B.targetable .figure');
    await page.waitForFunction(() => document.querySelectorAll('.fight-screen .health-change').length === 4);
    await page.keyboard.press('Escape'); await page.mouse.move(20, 20);
    const rapid = await floats();
    assert.equal(rapid.length, 4);
    assert.equal(new Set(rapid.map(e => e.actionId)).size, 2);
    for (let i = 0; i < rapid.length; i++) {
      for (const b of rapid.slice(i + 1)) {
        const a = rapid[i];
        assert(a.bottom <= b.top || b.bottom <= a.top || a.right <= b.left || b.right <= a.left, 'Health numbers overlap');
      }
    }
    await page.mouse.move(20, 20);
    await page.screenshot({ path: path.join(out, 'hammer-totals.png') });
    const after = await record();
    const events = after.events.slice(before.events.length);
    const actions = [...new Set(events.filter(e => e.t === 'cast').map(e => e.actionId))];
    assert.equal(actions.length, 2);
    report.actions = actions.map(actionId => {
      const rows = events.filter(e => e.actionId === actionId);
      const damage = rows.filter(e => e.t === 'damage'), heal = rows.filter(e => e.t === 'heal');
      const totalDamage = damage.reduce((sum, e) => sum + e.amount, 0);
      const totalHeal = heal.reduce((sum, e) => sum + e.amount, 0);
      const numbers = rapid.filter(e => e.actionId === actionId);
      assert.equal(numbers.find(e => e.kind === 'damage').text, `−${totalDamage}`);
      assert.equal(numbers.find(e => e.kind === 'heal').text, `+${totalHeal}`);
      for (const hit of damage) {
        const stat = { air: 'agilite', eau: 'chance', neutre: 'force' }[hit.element];
        const caster = before.state.fighters.A;
        const expected = Math.floor(hit.calculation.jet * (100 + caster.stats[stat] + (caster.permanent.power || 0)) / 100) + (caster.permanent.damage || 0);
        assert.equal(hit.amount, expected);
      }
      assert.deepEqual(heal.map(e => e.amount), damage.slice(0, 2).map(e => Math.floor(e.amount / 2)));
      return { actionId, damage: damage.map(e => e.amount), totalDamage, heal: heal.map(e => e.amount), totalHeal };
    });
    assert.equal(before.state.fighters.B.hp - after.state.fighters.B.hp, report.actions.reduce((sum, a) => sum + a.totalDamage, 0));
    assert.equal(after.state.fighters.A.hp - before.state.fighters.A.hp, report.actions.reduce((sum, a) => sum + a.totalHeal, 0));
    assert.equal(before.state.fighters.A.pa - after.state.fighters.A.pa, 10);
    const compactLog = await page.$eval('.fight-screen .log', e => e.innerText);
    for (const action of report.actions) assert(compactLog.includes(`−${action.totalDamage} PV`));
    for (const action of report.actions) assert(compactLog.includes(`+${action.totalHeal} PV`));
    assert(/\+\d+ PA/.test(compactLog), 'The PA boost must remain visible');
    assert(!/érosion|se déplace|— Tour|lance |subit |récupère |au total|PV max/.test(compactLog), 'Compact journal contains verbose events');
    assert(after.events.some(e => e.t === 'move') && after.events.some(e => e.t === 'turn_start'), 'The export must retain the hidden events');
    report.compactLog = compactLog;
    await page.screenshot({ path: path.join(out, 'compact-journal.png') });
    await page.waitForFunction(() => !document.querySelector('.health-change'));
    await click('.fight-screen .combat-log-heading label');
    const log = await page.$('.fight-screen .log');
    await log.evaluate(e => { e.scrollTop = e.scrollHeight; });
    await log.screenshot({ path: path.join(out, 'elemental-details.png') });
    fs.writeFileSync(path.join(out, 'combat.json'), JSON.stringify(after, null, 2));
    assert.deepEqual(report.errors, []);
    report.damageCheckedAgainstStats = true; report.hpAndApReconciled = true;
    report.rapidNumbers = rapid;
    fs.writeFileSync(path.join(out, 'proof.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    if (page) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
    throw error;
  } finally {
    const child = browser.process(); await browser.disconnect();
    if (child?.exitCode === null) child.kill('SIGTERM');
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
