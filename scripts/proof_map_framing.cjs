// Fit visible tactical terrain, not the much taller imported scenery canvas.
const puppeteer = require('puppeteer-core');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const common = require('../src/engine/spellLibrary.json').common;
const out = process.env.PROOF_DIR || '/tmp/dofus-map-fit';

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, pipe: true });
  const report = { errors: [], sizes: [] };
  let page;
  try {
    page = await browser.newPage();
    page.setDefaultTimeout(15000);
    page.on('pageerror', error => report.errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400) report.errors.push(`${response.status()} ${response.url()}`); });
    await page.setViewport({ width: 1600, height: 900 });
    const cdp = await page.createCDPSession();
    await cdp.send('Page.setDownloadBehavior', { behavior: 'deny' });
    await page.evaluateOnNewDocument(common => {
      localStorage.setItem('dofus-lite-player-setup-v1', JSON.stringify({ playerClass: 'IOP', mode: 'boss', bossId: 872, bossGrade: 5 }));
      localStorage.setItem('dofus-lite-tactical-mode-v1', 'true');
      localStorage.setItem('dofus-lite-loadouts-v1', JSON.stringify({ 'A:IOP': {
        version: 1, level: 200, base: { force: 100 }, slots: {}, rollMode: 'max', rollSeed: 1, spells: { common },
      } }));
      Math.random = () => .000007;
      const original = URL.createObjectURL;
      URL.createObjectURL = function (blob) { window.combatExport = blob; return original.call(this, blob); };
    }, common);
    const record = async () => {
      await page.$eval('.fight-log .combat-log-heading button', e => e.click());
      return page.evaluate(async () => JSON.parse(await window.combatExport.text()));
    };
    const check = async label => {
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const result = await page.evaluate(() => {
        const rect = e => { const r = e.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
        const map = rect(document.querySelector('.fight-map'));
        const board = rect(document.querySelector('.board'));
        const tiles = [...document.querySelectorAll('.tactical-terrain > g')].map(rect);
        const left = Math.min(...tiles.map(r => r.left)), top = Math.min(...tiles.map(r => r.top));
        const right = Math.max(...tiles.map(r => r.right)), bottom = Math.max(...tiles.map(r => r.bottom));
        const outside = [...document.querySelectorAll('.spell-btn, .combat-stats, .fight-heading-actions, .placement-ready')]
          .filter(e => e.checkVisibility()).filter(e => { const r = rect(e); return r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1; })
          .map(e => e.className);
        const clippedFighters = [...document.querySelectorAll('.token .figure')].filter(e => {
          const r = rect(e); return r.left < map.left || r.top < map.top || r.right > map.right || r.bottom > map.bottom;
        }).length;
        return { viewport: [innerWidth, innerHeight], page: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
          map, board, visible: { left, top, right, bottom, width: right - left, height: bottom - top },
          legend: rect(document.querySelector('.tactical-legend')), outside, clippedFighters,
          bottomInset: parseFloat(getComputedStyle(document.querySelector('.fitted-board')).paddingBottom) || 0,
          hw: parseFloat(getComputedStyle(document.querySelector('.board-wrap')).getPropertyValue('--hw')) };
      });
      const { map, board, visible, viewport, page: size } = result;
      report.sizes.push({ label, ...result });
      assert(size[0] <= viewport[0] && size[1] <= viewport[1], `${label}: page must not scroll`);
      assert.deepEqual(result.outside, [], `${label}: all controls must remain visible`);
      assert.equal(result.clippedFighters, 0, `${label}: fighters must remain visible`);
      assert(board.left >= map.left - 1 && board.top >= map.top - 1 && board.right <= map.right + 1 && board.bottom <= map.bottom + 1, `${label}: board clipped`);
      assert(visible.left >= board.left && visible.top >= board.top && visible.right <= board.right && visible.bottom <= board.bottom, `${label}: terrain clipped`);
      assert(Math.max(visible.width / map.width, visible.height / (map.height - result.bottomInset)) > .85, `${label}: visible terrain must fill the area above the legend`);
      assert(visible.bottom < result.legend.top, `${label}: legend must not cover terrain`);
      await page.screenshot({ path: path.join(out, `${label}.png`) });
      return result;
    };
    const assertAligned = async state => {
      const errors = await page.evaluate(fighters => Object.values(fighters).filter(f => f.hp > 0).flatMap(f => {
        const token = document.querySelector(`.token[data-fighter-id="${f.id}"]`);
        const tile = document.querySelector(`.tactical-terrain g[data-cell="${f.pos.x},${f.pos.y}"] .tactical-tile`);
        const box = tile.getBBox();
        return Math.abs(parseFloat(token.style.left) - box.x - box.width / 2) > .1
          || Math.abs(parseFloat(token.style.top) - box.y - box.height / 2) > .1 ? [f.id] : [];
      }), state.fighters);
      assert.deepEqual(errors, [], 'Fighters must stay centered on their cells');
    };
    await page.goto(process.env.PROOF_URL || 'http://127.0.0.1:3013', { waitUntil: 'networkidle0' });
    await page.click('.setup-play');
    await page.waitForFunction(() => document.querySelectorAll('.token ruffle-player').length === 4
      && [...document.querySelectorAll('.token ruffle-player')].every(player => player.ruffle().readyState === 2));
    const initial = await record();
    assert.equal(initial.mapId, 'dungeon_11961');
    await check('after');
    await assertAligned(initial.state);
    for (const [width, height] of [[2048, 1168], [1366, 768], [844, 390], [390, 844]]) {
      await page.setViewport({ width, height });
      await check(`${width}x${height}`);
      await assertAligned(initial.state);
    }
    await page.setViewport({ width: 1600, height: 900 });
    if (!await page.$('.fight-log-close')) await page.click('.fight-heading-actions button:first-child');
    await page.waitForSelector('.fight-log-close');
    await page.click('.fight-log-close');
    await check('journal-closed');
    await page.click('.fight-heading-actions button:first-child');
    await page.click('.board-mode-toggle');
    await page.waitForSelector('.retro-map-layer');
    await page.screenshot({ path: path.join(out, 'original-scenery.png') });
    const scenery = await record();
    assert.deepEqual(scenery.state.fighters, initial.state.fighters, 'Changing the display must not move fighters');
    assert.equal((await page.$$('.retro-map-layer')).length, 25, 'All original scenery layers must remain');
    await page.click('.board-mode-toggle');
    await check('tactical-restored');
    const start = '.placement-cell.yours:not(.selected)';
    const cell = await page.$eval(start, e => e.dataset.placementCell.split(',').map(Number));
    await page.click(start);
    const placed = await record();
    assert.deepEqual(placed.state.fighters.A.pos, { x: cell[0], y: cell[1] }, 'Aiming must use the resized cell');
    await assertAligned(placed.state);
    await page.click('.placement-ready');
    await page.waitForSelector('.turn-status.yours');
    await page.click('.spell-slot[data-spell-id="160"] .spell-btn');
    const target = '.cell.hl-target';
    await page.hover(target);
    await page.waitForFunction(() => document.querySelectorAll('.attack-preview-cell').length > 1);
    const preview = await page.$$eval('.attack-preview-cell', cells => cells.map(e => e.dataset.attackCell).sort());
    await page.screenshot({ path: path.join(out, 'spell-preview.png') });
    await page.click(target);
    const cast = (await record()).events.find(e => e.t === 'cast' && e.fighter === 'A' && e.spellId === 160);
    assert(cast, 'Épée de Iop must cast at the clicked cell');
    const actual = cast.aoe.filter(p => p.x >= 0 && p.y >= 0 && p.x < initial.state.board.width && p.y < initial.state.board.height
      && initial.state.board.obstacles[`${p.x},${p.y}`]?.type !== 'VOID').map(p => `${p.x},${p.y}`).sort();
    assert.deepEqual(preview, actual, 'The visible preview must agree with the actual spell area');
    report.placementAligned = true;
    report.spellAreaAligned = true;
    assert.deepEqual(report.errors, []);
    report.passed = true;
    console.log(JSON.stringify({ passed: true, sizes: report.sizes.map(s => ({ label: s.label, hw: s.hw, visible: s.visible })), errors: report.errors }, null, 2));
  } catch (error) {
    report.failure = error.message;
    if (page) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
    throw error;
  } finally {
    fs.writeFileSync(path.join(out, 'proof.json'), JSON.stringify(report, null, 2));
    const child = browser.process(); await browser.disconnect(); child?.kill('SIGTERM');
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
