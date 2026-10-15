// Actual camera input on the army adventure, in disposable Chrome storage.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer-core');
const out = process.env.PROOF_DIR || '/tmp/dofus-zoom-ui';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const near = (actual, expected, message) => assert(Math.abs(actual - expected) < .15, `${message}: ${actual} ≠ ${expected}`);

async function click(page, selector, text = '') {
  await page.waitForFunction(({ selector, text }) => [...document.querySelectorAll(selector)]
    .some(e => e.checkVisibility() && !e.disabled && e.textContent.includes(text)), {}, { selector, text });
  const h = await page.evaluateHandle(({ selector, text }) => [...document.querySelectorAll(selector)]
    .find(e => e.checkVisibility() && !e.disabled && e.textContent.includes(text)), { selector, text });
  await h.asElement().click(); await h.dispose();
}

async function metrics(page) {
  return page.evaluate(() => {
    const rect = selector => {
      const e = document.querySelector(selector); if (!e) return null;
      const r = e.getBoundingClientRect();
      return { width: r.width, height: r.height, x: r.x, y: r.y, layoutHeight: e.offsetHeight, text: e.textContent };
    };
    return {
      zoom: parseInt(document.querySelector('.camera-zoom').textContent, 10),
      board: rect('.board-camera-layer'), player: rect('.token.active .figure'),
      health: rect('.token.active .mini-hp'), cost: rect('.path-cost'), dot: rect('.path-dot'),
      tools: rect('.board-tools'), camera: rect('.board-camera-tools'), spells: rect('.combat-spellbar'),
      float: rect('.float-text.pm-cost'), creature: rect('.token.active .creature-turn-position'),
      overflow: document.documentElement.scrollWidth > innerWidth + 1 || document.documentElement.scrollHeight > innerHeight + 1,
    };
  });
}

async function hoverCell(page, cell) {
  const point = await page.$eval(`[data-cell="${cell}"]`, e => {
    const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.move(point.x, point.y); await delay(300);
  return point;
}

function fixedUI(before, after, labels = ['health', 'cost', 'dot', 'tools', 'camera', 'spells']) {
  for (const label of labels) {
    assert(before[label] && after[label], `${label} must be visible at both zoom levels`);
    near(after[label].width, before[label].width, `${label} width`);
    near(after[label].height, before[label].height, `${label} height`);
  }
  assert(!after.overflow, 'Camera must not add page scrolling');
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, pipe: true });
  const page = await browser.newPage(), report = { errors: [], measurements: [] };
  page.setDefaultTimeout(45000); page.on('pageerror', e => report.errors.push(e.message));
  try {
    await page.setViewport({ width: 1920, height: 1080 });
    await page.goto(process.env.PROOF_URL || 'http://127.0.0.1:3013', { waitUntil: 'networkidle0' });
    await click(page, '.tabs > button', 'Atelier'); await click(page, '.studio-transfer-tools button', 'Importer');
    await (await page.$('[aria-label="Importer un ZIP Atelier"]')).uploadFile(path.resolve('public/adventures/winterfell-last-stand.zip'));
    await click(page, '.adventure-import-play button', 'Jouer l’aventure');
    await click(page, '.combat-choice[open] .combat-choice-launch');
    await page.waitForFunction(() => document.querySelectorAll('.board .custom-character-sprite').length === 38);
    for (let i = 0; i < 6; i++) { if (!await page.$('.placement-ready')) break; await click(page, '.placement-ready'); await delay(150); }
    await page.waitForSelector('.end-turn:not([disabled])');
    const cells = await page.$$eval('.cell.hl-move', els => els.map(e => e.dataset.cell));
    let cell;
    for (const candidate of cells) {
      await hoverCell(page, candidate);
      if (await page.$eval('.board', e => Number.parseInt(e.querySelector('.path-cost')?.textContent, 10) >= 2)) { cell = candidate; break; }
    }
    assert(cell, 'Need a real path preview for at least two movement points');
    const before = await metrics(page); report.measurements.push(before);
    await page.screenshot({ path: path.join(out, '100-percent.png') });
    for (let i = 0; i < 6; i++) await page.click('[aria-label="Zoomer la carte"]');
    await page.click('[aria-label="Centrer sur le personnage actif"]'); await hoverCell(page, cell);
    const fractional = await metrics(page); fixedUI(before, fractional); report.measurements.push(fractional);
    near(fractional.player.width / before.player.width, 1.25 ** 6, 'Character zooms');
    await page.click('[aria-label="Zoomer la carte"]');
    await page.click('[aria-label="Centrer sur le personnage actif"]');
    const destination = await hoverCell(page, cell);
    const maximum = await metrics(page); fixedUI(before, maximum); report.measurements.push(maximum);
    near(maximum.board.width / before.board.width, 4, 'Board zooms');
    near(maximum.player.width / before.player.width, 4, 'Character zooms');
    assert.equal(maximum.cost.text, before.cost.text);
    await page.screenshot({ path: path.join(out, '400-percent.png') });
    console.log('100%, 381% and 400%: world scales; bars, path costs/dots, controls and spell bar keep their pixel dimensions.');

    // Real movement still hits the intended tile, and its animated PM text is unscaled.
    const pm = await page.$eval('.player-resources .pm strong', e => +e.textContent);
    await page.mouse.click(destination.x, destination.y);
    await page.waitForSelector('.float-text.pm-cost');
    const moved = await metrics(page); report.movement = moved.float;
    near(moved.float.height, moved.float.layoutHeight, 'Movement cost float screen height');
    assert.equal(await page.$eval('.player-resources .pm strong', e => +e.textContent), pm - parseInt(before.cost.text, 10));
    await page.screenshot({ path: path.join(out, 'movement.png') });

    // Creature labels must stay fixed too. A drag must not spend another PM.
    await page.click('.board-creature-toggle'); await page.click('[aria-label="Ajuster toute la carte"]');
    const creatureBefore = await metrics(page);
    for (let i = 0; i < 7; i++) await page.click('[aria-label="Zoomer la carte"]');
    await page.click('[aria-label="Centrer sur le personnage actif"]');
    fixedUI(creatureBefore, await metrics(page), ['health', 'creature', 'tools', 'camera', 'spells']);
    const area = await page.$eval('.board-wrap', e => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    const oldTransform = await page.$eval('.board-camera-layer', e => e.style.transform);
    await page.mouse.move(area.x, area.y); await page.mouse.down(); await page.mouse.move(area.x - 80, area.y + 25, { steps: 10 }); await page.mouse.up();
    assert.notEqual(await page.$eval('.board-camera-layer', e => e.style.transform), oldTransform);
    fixedUI(creatureBefore, await metrics(page), ['health', 'creature', 'tools', 'camera', 'spells']);
    assert.equal(await page.$eval('.player-resources .pm strong', e => +e.textContent), pm - parseInt(before.cost.text, 10));
    await page.click('.board-creature-toggle');
    console.log('Zoomed movement spends the correct PM. Creature numbers and health bars stay fixed through panning.');

    await page.setViewport({ width: 390, height: 844 }); await delay(300);
    await page.click('[aria-label="Ajuster toute la carte"]'); const mobileBefore = await metrics(page);
    for (let i = 0; i < 7; i++) await page.click('[aria-label="Zoomer la carte"]');
    await page.click('[aria-label="Centrer sur le personnage actif"]');
    const mobileAfter = await metrics(page); fixedUI(mobileBefore, mobileAfter, ['health', 'tools', 'camera', 'spells']);
    report.mobile = { before: mobileBefore, after: mobileAfter };
    await page.screenshot({ path: path.join(out, 'mobile.png') });
    assert.deepEqual(report.errors, []);
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
    console.log('Phone at 400%: fixed UI, no page overflow, no browser errors.');
  } catch (error) {
    fs.writeFileSync(path.join(out, 'failure.txt'), error.stack);
    await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {}); throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
