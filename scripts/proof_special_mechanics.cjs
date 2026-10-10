// Real browser input and exported combat records, in a disposable Chrome profile.
const puppeteer = require('puppeteer-core');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const out = process.env.PROOF_DIR || '/tmp/dofus-special-mechanics';

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, pipe: true });
  const report = { errors: [] };
  let page;
  try {
    page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 1200 });
    page.on('pageerror', error => report.errors.push(error.message));
    const cdp = await page.createCDPSession();
    await cdp.send('Page.setDownloadBehavior', { behavior: 'deny' });
    await page.evaluateOnNewDocument(() => {
      if (!localStorage.getItem('special-proof-initialized')) {
        localStorage.setItem('dofus-lite-player-setup-v1', JSON.stringify({ playerClass: 'SACRIEUR', botClass: 'IOP', botId: 'special-proof', mapId: 'arene' }));
        localStorage.setItem('koliseum.bots.v1', JSON.stringify([{ id: 'special-proof', name: 'Adversaire au contact', custom: true,
          code: `function decide(v,a) {
            if (a.dist(v.you.pos, v.enemy.pos) > 1) return a.moveToward(v.enemy.pos) || a.endTurn();
            if (v.enemy.effects.some(e => e.kind === 'dodgeMelee') && a.canCast('pression', v.enemy.pos).ok) return a.cast('pression', v.enemy.pos);
            return a.endTurn();
          }` }]));
        const base = { version: 1, level: 100, slots: {}, base: {}, rollMode: 'max', rollSeed: 1 };
        localStorage.setItem('dofus-lite-loadouts-v1', JSON.stringify({
          'A:SACRIEUR': { ...base, spells: { common: [367], grades: { 367: 1, 447: 5, 444: 5, 436: 5 } } },
          'B:IOP': { ...base, level: 200 },
        }));
        localStorage.setItem('special-proof-initialized', 'true');
      }
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
      await click('.combat-log-heading button', 'Exporter');
      return page.evaluate(async () => JSON.parse(await window.combatExport.text()));
    };
    const captureLog = async name => {
      const panel = await page.evaluateHandle(() => [...document.querySelectorAll('.combat-log-heading')]
        .find(e => e.checkVisibility()).closest('.panel'));
      await panel.asElement().evaluate(e => { const log = e.querySelector('.log'); log.scrollTop = log.scrollHeight; });
      await panel.asElement().screenshot({ path: path.join(out, name) });
      await panel.dispose();
    };
    const humanTurn = () => page.waitForFunction(() => document.querySelector('.turn-status.yours'));
    const pass = async () => {
      await click('.play-controls .btn', 'Fin de tour');
      await page.waitForFunction(() => !document.querySelector('.turn-status.yours'));
      await humanTurn();
    };
    const castAt = async (id, selector) => {
      await click(`.spell-slot[data-spell-id="${id}"] .spell-btn`);
      await click(selector);
      await page.mouse.move(20, 20);
    };
    await page.goto(process.env.PROOF_URL || 'http://127.0.0.1:3013', { waitUntil: 'networkidle0' });
    await click('.setup-navigation button', 'Stuff');
    await click('.builder-navigation button', 'Sorts');
    const commonGrade = () => page.$eval('.spell-loadout-order [data-spell-id="367"] .spell-grade', e => e.textContent);
    assert.equal(await commonGrade(), 'Niv. 6 · max');
    await page.$eval('.spell-loadout-order [data-spell-id="367"]', e => e.scrollIntoView({ block: 'center' }));
    await page.screenshot({ path: path.join(out, 'cawotte-grade6-level100.png') });
    await page.reload({ waitUntil: 'networkidle0' });
    await click('.setup-navigation button', 'Stuff');
    await click('.builder-navigation button', 'Sorts');
    assert.equal(await commonGrade(), 'Niv. 6 · max');
    report.common = { characterLevel: 100, savedGrade: 1, effectiveGrade: 6, afterReload: true };

    await page.evaluate(() => {
      const key = 'dofus-lite-loadouts-v1';
      const loadouts = JSON.parse(localStorage.getItem(key));
      Object.assign(loadouts['A:SACRIEUR'], { level: 200, slots: { cape: 8866, amulet: 323, ring1: 2469, dofus1: 7754 } });
      localStorage.setItem(key, JSON.stringify(loadouts));
    });
    await page.reload({ waitUntil: 'networkidle0' });
    await click('.setup-play');
    await click('.placement-ready');
    await humanTurn();
    let before;
    for (let i = 0; i < 10; i++) {
      before = await record();
      const a = before.state.fighters.A.pos, b = before.state.fighters.B.pos;
      if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1) break;
      await pass();
    }
    assert.equal(before.state.fighters.A.pa, 11);
    await page.waitForFunction(() => !document.querySelector('.token.walking'));
    await castAt(444, '.token.side-A.targetable .figure');
    await pass();
    const dodged = await record();
    const dodgeEvents = dodged.events.slice(before.events.length);
    assert(dodgeEvents.some(e => e.t === 'damage_dodged' && e.fighter === 'A'));
    assert.equal(dodged.state.fighters.A.hp, before.state.fighters.A.hp);
    report.derobade = { incomingCast: dodgeEvents.find(e => e.t === 'cast' && e.fighter === 'B')?.spellName,
      attackDamage: 0, dodgedHits: dodgeEvents.filter(e => e.t === 'damage_dodged').length,
      originalPosition: before.state.fighters.A.pos, afterDodge: dodged.state.fighters.A.pos };
    await page.screenshot({ path: path.join(out, 'derobade-next-turn.png') });
    await captureLog('derobade-damage-log.png');

    // The bot moves back into melee after the dodge, then passes. Each Furie
    // adds its flat bonus after its own damage; the next attack sees both.
    const beforeFury = await record();
    await castAt(447, '.token.side-B.targetable .figure');
    await castAt(447, '.token.side-B.targetable .figure');
    await castAt(436, '.token.side-B.targetable .figure');
    const fury = await record();
    const bonus = fury.state.fighters.A.effects.filter(e => e.kind === 'buff' && e.stat === 'damage' && e.spellId === 447)
      .reduce((sum, e) => sum + e.value, 0);
    assert.equal(bonus, 16);
    const hits = fury.events.slice(beforeFury.events.length).filter(e => e.t === 'damage' && e.source === 'A' && e.target === 'B');
    const assault = hits.at(-1);
    assert.equal(assault.label, 'Assaut');
    assert.equal(assault.calculation.flatDamage - hits[0].calculation.flatDamage, 16);
    assert.equal(fury.state.fighters.A.pa, 0);
    report.furie = { casts: 2, immediateBonus: bonus, followingAttack: assault.label, flatDamage: assault.calculation.flatDamage, damage: assault.amount };
    await click('.combat-log-heading input[type="checkbox"]');
    await page.screenshot({ path: path.join(out, 'furie-stacked-damage.png') });
    await captureLog('furie-damage-log.png');
    assert.deepEqual(report.errors, []);
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    if (page) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
    throw error;
  } finally {
    fs.writeFileSync(path.join(out, 'proof.json'), JSON.stringify(report, null, 2));
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
