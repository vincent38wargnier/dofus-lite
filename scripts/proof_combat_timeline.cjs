// Isolated Chrome storage. Stage positions only to exercise portrait targeting
// with real spells, weapon rules, dungeon terrain and rendered client graphics.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const puppeteer = require('puppeteer-core');
const out = process.env.PROOF_DIR || '/tmp/dofus-combat-timeline';
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, pipe: true });
  const page = await browser.newPage(), report = { errors: [], checks: [], sizes: [] };
  page.setDefaultTimeout(25000);
  page.on('pageerror', error => report.errors.push(error.message));
  const click = async (selector, text = '') => {
    const handle = await page.evaluateHandle(({ selector, text }) => [...document.querySelectorAll(selector)].find(e => e.checkVisibility() && e.textContent.includes(text)), { selector, text });
    assert(handle.asElement(), `Missing ${selector}: ${text}`); await handle.asElement().click(); await handle.dispose();
  };
  const capture = name => page.screenshot({ path: path.join(out, `${name}.png`) });
  const check = value => { report.checks.push(value); console.log(value); };
  const card = id => `[data-timeline-fighter="${id}"]`;
  const spell = id => `.spell-slot[data-spell-id="${id}"] .spell-btn`;
  try {
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument(() => {
      localStorage.setItem('dofus-lite-player-setup-v1', JSON.stringify({ playerClass: 'IOP', mode: 'boss', bossId: 1188, bossGrade: 5 }));
      localStorage.setItem('dofus-lite-loadouts-v1', JSON.stringify({ 'A:IOP': {
        version: 1, level: 200, base: { force: 100 }, slots: { weapon: 2416 }, rollMode: 'max', rollSeed: 1,
      } }));
      localStorage.setItem('dofus-lite-tactical-mode-v1', 'true');
      localStorage.setItem('dofus-lite-sound', JSON.stringify({ enabled: false, volume: 0 }));
      Math.random = () => .000031;
    });
    await page.goto(process.env.PROOF_URL || 'http://127.0.0.1:3013', { waitUntil: 'networkidle0' });
    await click('.setup-play'); await click('.combat-choice-launch');
    await page.waitForSelector('.placement-ready');
    await page.waitForFunction(() => document.querySelectorAll('.token ruffle-player').length === 9
      && [...document.querySelectorAll('.token ruffle-player')].every(p => p.ruffle().readyState === 2));
    report.fixture = await page.evaluate(() => {
      const element = document.querySelector('.fight-screen');
      let fiber = element[Object.keys(element).find(k => k.startsWith('__reactFiber$'))], match;
      for (; fiber && !match; fiber = fiber.return) for (let hook = fiber.memoizedState; hook; hook = hook.next) {
        const value = hook.memoizedState?.current;
        if (typeof value?.humanAct === 'function' && typeof value?.ready === 'function') { match = value; break; }
      }
      if (!match) throw new Error('Missing live match');
      window.timelineFixture = match;
      const target = match.state.fighters.B6;
      const others = Object.values(match.state.fighters).filter(f => f.id !== 'A' && f.id !== target.id);
      const { board } = match.state;
      const distance = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
      const free = (x, y) => !board.obstacles[`${x},${y}`]?.blocksMove;
      let origin;
      for (let y = 3; y < board.height - 3 && !origin; y++) for (let x = 3; x < board.width - 5; x++) {
        if ([0, 1, 2].every(dx => free(x + dx, y)) && others.every(f => distance(f.pos, { x, y }) > 6)) { origin = { x, y }; break; }
      }
      if (!origin) throw new Error('Missing clear fixture cells');
      const ready = match.ready;
      match.ready = function () {
        const result = ready.call(this);
        this.state.fighters.A.pos = origin; this.state.fighters.A.pa = 40;
        this.state.currentIndex = this.state.order.indexOf('A');
        Object.assign(this.state.fighters[target.id], { pos: { x: origin.x + 2, y: origin.y }, hp: 2000, maxHp: 2000 });
        this.state.rngState = 123456; this.ready = ready;
        return result;
      };
      const humanAct = match.humanAct;
      window.timelineActions = [];
      match.humanAct = function (action) {
        const result = humanAct.call(this, action);
        window.timelineActions.push({ action, ok: result.ok, events: result.events }); return result;
      };
      return { origin, targetId: target.id, mapId: match.state.mapId };
    });
    await click('.placement-ready'); await page.waitForSelector('.turn-status.yours');
    const target = card(report.fixture.targetId);
    const order = await page.evaluate(() => window.timelineFixture.state.order.filter(id => window.timelineFixture.state.fighters[id].hp > 0));
    assert.deepEqual(await page.$$eval('[data-timeline-fighter]', es => es.map(e => e.dataset.timelineFighter)), order);
    assert.equal(await page.$eval('.timeline-fighter.current', e => e.dataset.timelineFighter), 'A');
    await page.waitForFunction(() => [...document.querySelectorAll('.timeline-portrait img')].length === 9
      && [...document.querySelectorAll('.timeline-portrait img')].every(img => img.complete && img.naturalWidth));
    await click(target);
    assert.equal(await page.evaluate(() => window.timelineActions.length), 0);
    check('Nine living portraits in engine initiative order, with native graphics; clicking without a spell only inspects');
    await click(spell(160)); await page.hover(target);
    await page.waitForSelector(`.combat-stats[data-inspected-fighter="${report.fixture.targetId}"]`);
    assert.equal(await page.$$eval('.attack-preview-cell', es => es.length), 13);
    assert.equal(await page.$eval(target, e => e.dataset.targetable), 'true');
    assert(await page.$(`.token[data-fighter-id="${report.fixture.targetId}"].is-inspected`));
    await capture('targeting-desktop');
    await click(target);
    report.spell = await page.evaluate(id => ({ action: window.timelineActions.at(-1), hp: window.timelineFixture.state.fighters[id].hp,
      pa: window.timelineFixture.state.fighters.A.pa }), report.fixture.targetId);
    assert(report.spell.action.ok); assert(report.spell.hp < 2000); assert.equal(report.spell.pa, 36);
    assert(report.spell.action.events.some(e => e.t === 'cast' && e.spellId === 160));
    check('Épée de Iop previews 13 cells on portrait hover and casts on the correct fighter, consuming 4 PA');
    await page.evaluate(id => { window.timelineFixture.state.fighters[id].hp = 1; window.timelineFixture.state.rngState = 123456; }, report.fixture.targetId);
    await click(spell(0)); await page.hover(target);
    assert.equal(await page.$$eval('.attack-preview-cell', es => es.length), 4);
    assert.equal(await page.$eval('.attack-preview-cell.aim', e => e.dataset.attackCell), `${report.fixture.origin.x + 1},${report.fixture.origin.y}`);
    await capture('hammer-target');
    await click(target); await page.waitForFunction(id => !document.querySelector(`[data-timeline-fighter="${id}"]`), {}, report.fixture.targetId);
    report.hammer = await page.evaluate(id => ({ action: window.timelineActions.at(-1), hp: window.timelineFixture.state.fighters[id].hp }), report.fixture.targetId);
    assert(report.hammer.action.ok); assert.equal(report.hammer.hp, 0);
    assert(report.hammer.action.events.some(e => e.t === 'cast' && e.itemId === 2416));
    assert.equal(await page.$$eval('[data-timeline-fighter]', es => es.length), 8);
    assert.notEqual(await page.$eval('.combat-stats', e => e.dataset.inspectedFighter), report.fixture.targetId);
    check('Hammer portrait chooses the adjacent empty aiming cell; a lethal hit removes the portrait and clears inspection immediately');
    await page.mouse.move(5, 5);
    await page.waitForFunction(() => document.querySelector('.combat-stats').dataset.inspectedFighter === 'A');
    for (const size of [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
      await page.setViewport(size);
      await page.waitForFunction(() => {
        const map = document.querySelector('.fight-map').getBoundingClientRect(), controls = document.querySelector('.combat-dock').getBoundingClientRect();
        return map.height > 0 && map.bottom <= controls.top + 1;
      });
      const layout = await page.evaluate(() => {
        const rect = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; };
        const rail = document.querySelector('.combat-timeline-rail');
        return { pageFits: document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight,
          map: rect('.fight-map'), dock: rect('.combat-dock'), timeline: rect('.combat-timeline'), overflow: rail.scrollWidth > rail.clientWidth + 1 };
      });
      assert(layout.pageFits, JSON.stringify({ size, layout })); assert(layout.dock.bottom <= size.height);
      assert(layout.timeline.right <= size.width); assert(layout.map.bottom <= layout.timeline.y);
      if (layout.overflow) {
        await page.waitForSelector('.timeline-scroll:not([disabled])');
        await click('[aria-label="Voir les combattants suivants"]');
        assert(await page.$eval('.combat-timeline-rail', e => e.scrollLeft > 0));
      }
      report.sizes.push({ ...size, ...layout }); await capture(`layout-${size.width}`);
    }
    check('Desktop, mobile and short landscape keep the map and all controls on-screen; the portrait rail scrolls independently');
    await page.setViewport({ width: 1440, height: 900 });
    if (await page.$('.board-mode-toggle')) await click('.board-mode-toggle');
    await page.waitForFunction(() => [...document.querySelectorAll('.board img')].every(img => img.complete && img.naturalWidth));
    await capture('scenery-desktop');
    assert.deepEqual(report.errors, []); report.passed = true;
  } catch (error) {
    report.failure = error.stack; await capture('failure').catch(() => {});
    fs.writeFileSync(path.join(out, 'failure.txt'), await page.evaluate(() => document.body.innerText)); throw error;
  } finally {
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
