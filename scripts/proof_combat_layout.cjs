// Exercise the client-style fight workspace, including every extra spell.
const puppeteer = require('puppeteer-core');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const common = require('../src/engine/spellLibrary.json').common;
const out = process.env.PROOF_DIR || '/tmp/dofus-combat-layout';

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, pipe: true });
  const report = { errors: [], sizes: [] };
  let page;
  try {
    page = await browser.newPage();
    page.setDefaultTimeout(12000);
    page.on('pageerror', error => report.errors.push(error.message));
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument(common => {
      localStorage.setItem('dofus-lite-player-setup-v1', JSON.stringify({ playerClass: 'IOP', mode: 'kanojedo', monsterGrade: 5 }));
      localStorage.setItem('dofus-lite-loadouts-v1', JSON.stringify({
        'A:IOP': { version: 1, level: 200, base: { force: 100 }, slots: { weapon: 2416 }, rollMode: 'max', rollSeed: 1, spells: { common, order: [142, 141, 153, 0] } },
      }));
      Math.random = () => .000007;
    }, common);
    const dimensions = () => page.evaluate(() => {
      const rect = selector => {
        const r = document.querySelector(selector).getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
      };
      const selectors = ['.fight-map', '.board', '.fight-log', '.fight-main', '.combat-dock', '.combat-spellbar', '.combat-stats', '.dock-stat-content', '.play-controls'];
      const bounds = Object.fromEntries(selectors.filter(s => document.querySelector(s)).map(s => [s, rect(s)]));
      const mapBottomInset = parseFloat(getComputedStyle(document.querySelector('.fitted-board')).paddingBottom) || 0;
      const outside = [...document.querySelectorAll('.fight-screen .spell-btn, .spellbar-sort, .dock-attributes, .dock-resistances, .dock-detail-row, .dock-pages, .player-resources, .combat-turn-controls .btn, .fight-log .combat-log-heading')].filter(el => {
        if (!el.checkVisibility()) return false;
        const r = el.getBoundingClientRect();
        return r.x < -1 || r.y < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1;
      }).map(el => el.className);
      const croppedIcons = [...document.querySelectorAll('.fight-screen .spell-btn .retro-spell-icon')].filter(el => {
        const r = el.getBoundingClientRect(), parent = el.closest('button').getBoundingClientRect();
        return r.x < parent.x || r.y < parent.y || r.right > parent.right || r.bottom > parent.bottom;
      }).length;
      const driftingTokens = [...document.querySelectorAll('.fight-screen .token:not(.walking)')].filter(el => {
        const style = getComputedStyle(el);
        return Math.abs(parseFloat(style.left) - parseFloat(el.style.left)) > .1
          || Math.abs(parseFloat(style.top) - parseFloat(el.style.top)) > .1;
      }).map(el => el.dataset.fighterId);
      const slots = [...document.querySelectorAll('.fight-screen .spell-slot')].map(el => el.getBoundingClientRect());
      const bar = document.querySelector('.spellbar').getBoundingClientRect();
      const firstRow = slots.filter(r => Math.abs(r.y - slots[0].y) < 1);
      return { viewport: [innerWidth, innerHeight], page: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
        bounds, mapBottomInset, outside, croppedIcons, driftingTokens, spells: slots.length,
        unusedWidth: bar.width - (firstRow.at(-1).right - firstRow[0].x) };
    });
    const check = async (label, minimumSpells = 39) => {
      await page.waitForFunction(() => {
        const board = document.querySelector('.fight-map .board')?.getBoundingClientRect();
        const area = document.querySelector('.fight-map')?.getBoundingClientRect();
        const inset = parseFloat(getComputedStyle(document.querySelector('.fitted-board')).paddingBottom) || 0;
        return board && area && board.width <= area.width && board.height <= area.height
          && Math.min(area.width - board.width, area.height - inset - board.height) <= 3;
      });
      const d = await dimensions();
      report.sizes.push({ label, ...d });
      assert(d.page[0] <= d.viewport[0] && d.page[1] <= d.viewport[1], `Page scroll at ${label}`);
      assert.deepEqual(d.outside, [], `Off-screen controls at ${label}`);
      const b = d.bounds['.board'], area = d.bounds['.fight-map'];
      assert(b.x >= area.x - 1 && b.right <= area.right + 1 && b.y >= area.y - 1 && b.bottom <= area.bottom + 1, `Cropped board at ${label}`);
      assert(Math.min(area.width - b.width, area.height - d.mapBottomInset - b.height) <= 3, `Map not maximized at ${label}`);
      const log = d.bounds['.fight-log'];
      if (log) assert(log.right <= area.x + 1 || log.y >= d.bounds['.combat-dock'].bottom - 1, `Journal covers the combat at ${label}`);
      assert(d.bounds['.combat-spellbar'].y >= area.bottom - 1, `Spells cover the map at ${label}`);
      assert.equal(d.croppedIcons, 0, `Cropped spell icons at ${label}`);
      assert(d.unusedWidth < 1, `Spell bar does not fill the width at ${label}`);
      assert.deepEqual(d.driftingTokens, [], `Characters sliding off their cells after resizing at ${label}`);
      assert(d.spells >= minimumSpells, 'Spells missing');
      await page.screenshot({ path: path.join(out, `${label}.png`) });
    };
    await page.goto(process.env.PROOF_URL || 'http://127.0.0.1:3013', { waitUntil: 'networkidle0' });
    await page.click('.setup-play');
    await page.waitForSelector('.app.in-combat .token.side-B[data-actor="1219"]');
    await page.waitForFunction(() => [...document.querySelectorAll('.fight-screen .token ruffle-player')].length === 2
      && [...document.querySelectorAll('.fight-screen .token ruffle-player')].every(player => player.ruffle().readyState === 2));
    assert(await page.$('.fight-log .log'), 'Desktop journal should be open');
    await check('placement');
    await page.click('.placement-ready');
    await page.waitForSelector('.turn-status.yours');
    await check('desktop');
    await page.hover('.token.side-B .figure');
    await page.waitForSelector('.combat-stats[data-inspected-fighter="B"]');
    assert((await page.$eval('.player-resources .pa', e => e.innerText)).includes('7'));
    assert.equal(await page.$('.fighter-inspector'), null);
    await page.screenshot({ path: path.join(out, 'hover-monster.png') });
    await page.click('.dock-stat-tabs button:last-child');
    assert((await page.$eval('.combat-stats', e => e.innerText)).includes('Tuerie'));
    await page.click('[aria-label="Revenir à mes statistiques"]');
    await page.mouse.move(5, 5);
    await page.waitForSelector('.combat-stats[data-inspected-fighter="A"]');
    await page.keyboard.press('Digit2');
    await page.waitForSelector('.spell-slot[data-spell-id="142"] .selected');
    await page.keyboard.press('Escape');
    await page.focus('.spell-slot[data-spell-id="141"] .spell-btn');
    await page.keyboard.down('Alt'); await page.keyboard.press('ArrowLeft'); await page.keyboard.up('Alt');
    await page.keyboard.press('Digit2');
    await page.waitForSelector('.spell-slot[data-spell-id="141"] .selected');
    await page.keyboard.press('Escape');
    report.shortcutsAfterReorder = true;
    await page.click('.spell-slot[data-spell-id="153"] .spell-btn');
    await page.click('.token.side-A.targetable .figure');
    await page.mouse.move(5, 5);
    await page.waitForSelector('.combat-stats[data-inspected-fighter="A"]');
    await page.click('#combat-stats-effects');
    await page.waitForFunction(() => document.querySelector('.dock-stat-content').innerText.includes('Puissance'));
    report.selfCast = await page.$eval('.dock-stat-content', e => e.innerText);
    await page.screenshot({ path: path.join(out, 'client-layout.png') });
    await page.click('#combat-stats-stats');
    const turnBefore = await page.$eval('.fight-heading', e => e.innerText);
    await page.click('.play-controls .btn');
    await page.waitForFunction(previous => document.querySelector('.turn-status.yours')
      && document.querySelector('.fight-heading').innerText !== previous, {}, turnBefore);
    report.endTurn = true;
    await page.waitForSelector('.fight-log .log');
    await check('journal');
    const beforeCollapse = await page.$eval('.fight-map', e => e.getBoundingClientRect().width);
    await page.click('.fight-log-close');
    await page.waitForFunction(width => document.querySelector('.fight-map').getBoundingClientRect().width > width, {}, beforeCollapse);
    report.collapsingJournalFreesMapSpace = true;
    for (const [width, height] of [[1920, 1080], [1366, 768], [1024, 768], [844, 390], [390, 844], [375, 667]]) {
      await page.setViewport({ width, height });
      await check(`${width}x${height}`);
      if (width === 375) {
        await page.click('.fight-heading-actions button:first-child');
        await check('mobile-journal');
        await page.click('.fight-log-close');
      }
    }
    await page.setViewport({ width: 1440, height: 900 });
    await page.click('.board-mode-toggle');
    await check('tactical');
    await page.hover('.token.side-B .figure');
    await page.waitForSelector('.combat-stats[data-inspected-fighter="B"]');
    await page.mouse.move(5, 5);
    await page.waitForSelector('.combat-stats[data-inspected-fighter="A"]');
    report.hoverRestoresPlayer = true;
    await page.click('.fight-heading-actions button:last-child');
    await page.waitForSelector('.player-setup');
    assert.equal(await page.$('.app.in-combat'), null);
    assert(await page.$eval('.app-header', el => el.checkVisibility()));
    await page.evaluate(() => [...document.querySelectorAll('.setup-navigation button')].find(b => b.textContent.includes('Combat')).click());
    await page.evaluate(() => [...document.querySelectorAll('.match-modes button')].find(b => b.textContent.includes('Duel')).click());
    await page.select('select[aria-label="Carte de combat"]', 'territoire_des_dopeuls_5383');
    await page.click('.setup-play');
    await page.waitForSelector('.app.in-combat .placement-ready');
    await check('duel-placement');
    await page.click('.placement-ready');
    await check('duel');
    await page.click('.fight-heading-actions button:last-child');
    await page.close();
    page = await browser.newPage();
    page.on('pageerror', error => report.errors.push(error.message));
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument(() => {
      localStorage.setItem('dofus-lite-player-setup-v1', JSON.stringify({ playerClass: 'IOP', mode: 'boss', bossId: 147, bossGrade: 5 }));
      localStorage.setItem('dofus-lite-loadouts-v1', JSON.stringify({ 'A:IOP': {
        version: 1, level: 200, base: { force: 100 }, slots: {}, rollMode: 'max', rollSeed: 1, spells: { common: [] },
      } }));
      localStorage.setItem('dofus-lite-tactical-mode-v1', 'false');
      Math.random = () => .000007;
    });
    await page.goto(process.env.PROOF_URL || 'http://127.0.0.1:3013', { waitUntil: 'networkidle0' });
    await page.click('.setup-play');
    await page.waitForFunction(() => document.querySelectorAll('.token ruffle-player').length === 9
      && [...document.querySelectorAll('.token ruffle-player')].every(player => player.ruffle().readyState === 2));
    await page.click('.placement-ready');
    await page.waitForSelector('.turn-status.yours');
    await page.click('.spell-slot[data-spell-id="153"] .spell-btn');
    await page.click('.token.side-A.targetable .figure');
    await page.mouse.move(5, 5);
    await page.waitForSelector('.combat-stats[data-inspected-fighter="A"]');
    assert.equal(await page.$eval('.spellbar', e => getComputedStyle(e).gridTemplateRows.split(' ').length), 1);
    await check('standard-bar', 21);
    report.compactStandardBar = true;
    assert.deepEqual(report.errors, []);
    report.passed = true;
    console.log(JSON.stringify({ passed: report.passed, errors: report.errors, shortcutsAfterReorder: report.shortcutsAfterReorder,
      hoverRestoresPlayer: report.hoverRestoresPlayer, selfCast: report.selfCast, endTurn: report.endTurn,
      sizes: report.sizes.map(s => ({ label: s.label, viewport: s.viewport, spells: s.spells, croppedIcons: s.croppedIcons, outside: s.outside, driftingTokens: s.driftingTokens })) }, null, 2));
  } catch (error) {
    report.failure = error.message;
    if (page) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
    throw error;
  } finally {
    fs.writeFileSync(path.join(out, 'proof.json'), JSON.stringify(report, null, 2));
    const child = browser.process(); await browser.disconnect(); if (child?.exitCode === null) child.kill('SIGTERM');
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
