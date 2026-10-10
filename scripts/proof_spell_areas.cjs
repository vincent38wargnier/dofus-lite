// Hover and cast real spells from every class, comparing the drawn area with
// the combat export. Storage is confined to the temporary browser profile.
const puppeteer = require('puppeteer-core');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const library = require('../src/engine/spellLibrary.json');
const out = process.env.PROOF_DIR || '/tmp/dofus-spell-areas';
const cases = [
  ['IOP', 160, 'astrub_7423'], ['FECA', 10], ['OSAMODAS', 36], ['ENUTROF', 48],
  ['SRAM', 79], ['XELOR', 96], ['ECAFLIP', 119], ['ENIRIPSA', 130],
  ['CRA', 179], ['SADIDA', 191], ['SACRIEUR', 447], ['PANDAWA', 703],
  ['IOP', 145], ['IOP', 369],
];

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true, pipe: true,
  });
  const report = { errors: [], cases: [] };
  let page;
  try {
    for (const [classId, id, mapId = 'arene'] of cases) {
      const raw = library.spells[id].grades.find(g => g.grade === 6);
      page = await browser.newPage();
      page.setDefaultTimeout(15000);
      await page.setViewport({ width: 1600, height: 1000 });
      page.on('pageerror', error => report.errors.push(`${classId}: ${error.message}`));
      page.on('response', response => {
        if (response.status() >= 400) report.errors.push(`${response.status()} ${response.url()}`);
      });
      const cdp = await page.createCDPSession();
      await cdp.send('Page.setDownloadBehavior', { behavior: 'deny' });
      await page.evaluateOnNewDocument(({ classId, id, mapId }) => {
        localStorage.setItem('dofus-lite-player-setup-v1', JSON.stringify({
          playerClass: classId, botClass: 'CRA', botId: 'area-proof', mapId,
        }));
        localStorage.setItem('dofus-lite-tactical-mode-v1', 'true');
        const base = { version: 1, level: 200, slots: {}, rollMode: 'max', rollSeed: 1 };
        localStorage.setItem('dofus-lite-loadouts-v1', JSON.stringify({
          [`A:${classId}`]: { ...base, base: { intelligence: 100 }, spells: { order: [id], common: [369] } },
          'B:CRA': { ...base, base: {} },
        }));
        localStorage.setItem('koliseum.bots.v1', JSON.stringify([{ id: 'area-proof', name: 'Cible', custom: true,
          code: 'function decide(v,a) { return a.endTurn(); }' }]));
        Math.random = () => .000007;
        const original = URL.createObjectURL;
        URL.createObjectURL = function (blob) { window.combatExport = blob; return original.call(this, blob); };
      }, { classId, id, mapId });
      const record = async () => {
        // Export without moving the real pointer away from the hovered cell.
        await page.$eval('.fight-log .combat-log-heading button', e => e.click());
        return page.evaluate(async () => JSON.parse(await window.combatExport.text()));
      };
      const drawn = () => page.$$eval('.attack-preview-cell', cells => cells.map(e => e.dataset.attackCell).sort());
      const spell = `.spell-slot[data-spell-id="${id}"] .spell-btn`;
      await page.goto(process.env.PROOF_URL || 'http://127.0.0.1:3013', { waitUntil: 'networkidle0' });
      await page.click('.setup-play');
      await page.click('.placement-ready');
      await page.waitForFunction(selector => !document.querySelector(selector)?.disabled, {}, spell);
      await page.waitForFunction(() => [...document.querySelectorAll('.retro-actor ruffle-player')]
        .filter(p => typeof p.animate === 'function').length >= 2);
      const before = await record();
      let aimSelector = spell;
      if (raw.rangeMax > 0) {
        await page.click(spell);
        const candidates = await page.$$eval('.cell.hl-target', cells => cells.map(e => e.dataset.cell.split(',').map(Number)));
        assert(candidates.length, `${classId} ${id} must have a legal target`);
        const center = { x: before.state.board.width / 2, y: before.state.board.height / 2 };
        candidates.sort((a, b) => Math.abs(a[0] - center.x) + Math.abs(a[1] - center.y)
          - Math.abs(b[0] - center.x) - Math.abs(b[1] - center.y));
        aimSelector = `.cell[data-cell="${candidates[0].join(',')}"]`;
      }
      await page.hover(aimSelector);
      await page.waitForFunction(() => document.querySelectorAll('.attack-preview-cell').length > 1);
      const cells = await drawn();
      const hovered = await record();
      assert.equal(hovered.state.fighters.A.pa, before.state.fighters.A.pa);
      assert.equal(hovered.events.length, before.events.length, 'Hovering must not cast');
      if (id === 160) {
        await page.screenshot({ path: path.join(out, 'epee-de-iop-tactical.png') });
        await page.click('.board-mode-toggle');
        await page.hover(aimSelector);
        assert.deepEqual(await drawn(), cells, 'Scenery and tactical mode must show the same area');
        const layer = await page.evaluate(() => {
          const overlay = getComputedStyle(document.querySelector('.attack-preview-layer'));
          return { overlay: Number(overlay.zIndex), pointerEvents: overlay.pointerEvents,
            scenery: Math.max(...[...document.querySelectorAll('.retro-map-layer')].map(e => Number(getComputedStyle(e).zIndex))) };
        });
        assert(layer.overlay > layer.scenery, 'Decorations must not hide the preview');
        assert.equal(layer.pointerEvents, 'none', 'Preview must not intercept the aiming click');
        await page.screenshot({ path: path.join(out, 'epee-de-iop-scenery.png') });
      } else if ([703, 145].includes(id)) {
        await page.screenshot({ path: path.join(out, `spell-${id}-preview.png`) });
      }
      await page.click(aimSelector);
      const after = await record();
      const cast = after.events.slice(before.events.length).find(e => e.t === 'cast' && e.spellId === id);
      assert(cast, `${classId} ${id} should cast successfully`);
      const self = before.state.fighters.A.pos;
      const actual = [...new Set(cast.aoe.filter(c => c.x >= 0 && c.y >= 0
        && c.x < before.state.board.width && c.y < before.state.board.height
        && before.state.board.obstacles[`${c.x},${c.y}`]?.type !== 'VOID'
        && (!([145, 369].includes(id)) || c.x !== self.x || c.y !== self.y))
        .map(c => `${c.x},${c.y}`))].sort();
      assert.deepEqual(cells, actual, `${classId} ${id}: hover and actual effect areas must agree`);
      assert.equal(after.state.fighters.A.pa, before.state.fighters.A.pa - raw.pa);
      report.cases.push({ classId, spell: cast.spellName, grade: cast.grade, mapId, cells: cells.length, target: cast.target,
        hoverSpentPa: 0, matchesCast: true });
      console.log(`${classId}: ${cast.spellName}, ${cells.length} preview cells match the cast`);
      await page.close(); page = null;
    }
    assert.deepEqual(report.errors, []);
    report.passed = true;
  } catch (error) {
    if (page) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
    throw error;
  } finally {
    fs.writeFileSync(path.join(out, 'proof.json'), JSON.stringify(report, null, 2));
    const child = browser.process();
    await browser.disconnect(); child?.kill('SIGTERM');
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
