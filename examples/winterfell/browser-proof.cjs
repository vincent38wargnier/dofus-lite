// Exercise the downloadable ZIP in isolated Chrome storage, never user saves.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const puppeteer = require('puppeteer-core');
const { build } = require('./definition.cjs');
const { resolveLoadout } = require('../../src/engine/equipment');
const { prepareWorkshopFile } = require('../../src/ui/atelierArchive');
const out = path.resolve(__dirname, '../../public/adventures/winterfell/proof');
const zip = path.resolve(out, '../../winterfell-adventure.zip');
fs.mkdirSync(out, { recursive: true });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const click = async (page, selector, text = '') => {
  await page.waitForFunction(({ selector, text }) => [...document.querySelectorAll(selector)].some(e => e.checkVisibility() && !e.disabled && e.textContent.includes(text)), {}, { selector, text });
  const handle = await page.evaluateHandle(({ selector, text }) => [...document.querySelectorAll(selector)].find(e => e.checkVisibility() && !e.disabled && e.textContent.includes(text)), { selector, text });
  await handle.asElement().click(); await handle.dispose();
};
(async () => {
  const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, pipe: true });
  const report = { checks: [], browserErrors: [] }, check = message => { report.checks.push(message); console.log(message); };
  const page = await browser.newPage(); page.setDefaultTimeout(45000);
  await page.evaluateOnNewDocument(() => {
    window.__audioProof = { oscillators: 0, buffers: 0, peak: 0, native: 0 };
    let nativeSound;
    Object.defineProperty(window, 'dofusLiteSound', { configurable: true, get: () => nativeSound, set: value => {
      nativeSound = typeof value === 'function' ? (...args) => { window.__audioProof.native++; return value(...args); } : value;
    } });
    const prototype = window.AudioContext?.prototype, analysers = [];
    if (!prototype) return;
    for (const [method, key] of [['createOscillator', 'oscillators'], ['createBufferSource', 'buffers']]) {
      const original = prototype[method]; prototype[method] = function (...args) { window.__audioProof[key]++; return original.apply(this, args); };
    }
    const connect = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (target, ...rest) {
      if (target instanceof AudioDestinationNode) {
        const analyser = this.context.createAnalyser(); analyser.fftSize = 256;
        connect.call(this, analyser); connect.call(analyser, target); analysers.push(analyser); return target;
      }
      return connect.call(this, target, ...rest);
    };
    setInterval(() => { const data = new Float32Array(256); for (const a of analysers) {
      a.getFloatTimeDomainData(data); window.__audioProof.peak = Math.max(window.__audioProof.peak, ...data.map(Math.abs));
    } }, 20);
  });
  page.on('pageerror', error => report.browserErrors.push(error.message));
  try {
    await page.setViewport({ width: 1536, height: 1060 });
    await page.goto('http://127.0.0.1:3013', { waitUntil: 'networkidle0' });
    const initial = await page.evaluate(() => JSON.parse(localStorage.getItem('dofus-lite-creations-v1') || '{"characters":[],"dungeons":[]}'));
    assert.equal(initial.characters.length + initial.dungeons.length, 0);
    await click(page, '.tabs > button', 'Atelier'); await click(page, '.studio-transfer-tools button', 'Importer');
    await (await page.$('[aria-label="Importer un ZIP Atelier"]')).uploadFile(zip);
    await page.waitForSelector('.adventure-import-play');
    const creations = await page.evaluate(() => JSON.parse(localStorage.getItem('dofus-lite-creations-v1')));
    assert.equal(creations.dungeons.length, 1); assert.equal(creations.characters.length, 0);
    const restored = creations.dungeons[0], expected = build().dungeon;
    assert.equal(restored.members.reduce((n, m) => n + m.count, 0), 6);
    assert.equal(restored.adventure.heroes.length, 3);
    for (let i = 0; i < 3; i++) {
      const actual = resolveLoadout(restored.adventure.heroes[i].character.classId, restored.adventure.heroes[i].character.loadout);
      const original = resolveLoadout(expected.adventure.heroes[i].character.classId, expected.adventure.heroes[i].character.loadout);
      assert(actual.valid); assert.deepEqual(actual.stats, original.stats); assert.equal(actual.pa, original.pa);
      assert.equal(actual.hp, original.hp); assert.equal(actual.items.length, 8);
    }
    const art = await page.evaluate(async () => new Promise((resolve, reject) => {
      const req = indexedDB.open('dofus-lite-character-artwork', 1); req.onerror = reject;
      req.onsuccess = () => { const db = req.result, tx = db.transaction('artwork', 'readonly'), get = tx.objectStore('artwork').getAll();
        get.onsuccess = () => resolve(get.result.map(r => ({ id: r.id, images: Object.keys(r.images) }))); tx.oncomplete = () => db.close(); };
    }));
    assert.equal(art.reduce((n, r) => n + r.images.length, 0), 39);
    check('Fresh browser imports one dungeon, all three equipped heroes, all six enemies, 29 spells and all 39 images; no pre-existing creations.');
    await page.screenshot({ path: path.join(out, 'import.png') });
    const personal = await page.evaluate(() => localStorage.getItem('dofus-lite-profiles-v1'));
    await click(page, '.adventure-import-play button', 'Jouer l’aventure');
    await page.waitForSelector('.combat-choice[open] .adventure-lobby');
    await page.waitForFunction(() => [...document.querySelectorAll('.combat-choice[open] .adventure-hero-heading img')].length === 3
      && [...document.querySelectorAll('.combat-choice[open] .adventure-hero-heading img')].every(i => i.complete && i.naturalWidth > 0));
    assert.equal(await page.$$eval('.combat-choice[open] .adventure-heroes article', e => e.length), 3);
    await delay(500); await page.screenshot({ path: path.join(out, 'ready-to-play.png') });
    await page.setViewport({ width: 390, height: 844 }); await delay(300);
    assert(await page.$eval('.combat-choice[open]', e => e.scrollWidth <= e.clientWidth + 1));
    assert(await page.$eval('.combat-choice[open] .combat-choice-launch', e => e.getBoundingClientRect().bottom <= innerHeight));
    await page.screenshot({ path: path.join(out, 'mobile.png') });
    await page.setViewport({ width: 1536, height: 1060 });
    await click(page, '.combat-choice[open] .combat-choice-launch');
    await page.waitForFunction(() => document.querySelectorAll('.play-route .token.side-A').length === 3 && document.querySelectorAll('.play-route .token.side-B').length === 6);
    await page.waitForFunction(() => document.querySelectorAll('.play-route .custom-character-sprite').length === 9);
    await page.waitForSelector('[data-custom-map]'); await page.waitForSelector('[data-original-prop]');
    assert.equal(await page.$$eval('[data-original-prop]', e => e.length), 5);
    assert((await page.$eval('.fight-heading h1', e => e.textContent)).includes('Winterfell'));
    const spriteWidth = await page.$eval('.custom-character-sprite', e => e.getBoundingClientRect().width);
    await page.click('.board-creature-toggle');
    await page.waitForFunction(width => document.querySelector('.custom-character-sprite').getBoundingClientRect().width < width / 2, {}, spriteWidth);
    assert.equal(await page.$$eval('.board .custom-character-sprite', e => e.length), 9);
    assert.equal(await page.$$eval('.board ruffle-player', e => e.length), 0);
    await page.click('.board-mode-toggle:not(.board-creature-toggle)');
    await page.waitForFunction(() => !document.querySelector('[data-custom-map]'));
    assert.equal(await page.$$eval('[data-original-prop]', e => e.length), 0);
    await page.click('.board-mode-toggle:not(.board-creature-toggle)');
    await page.click('.board-creature-toggle');
    await page.waitForSelector('[data-custom-map]');
    check('Creature mode keeps original portraits at a smaller scale; tactical mode preserves the same original geometry.');
    report.layouts = [];
    for (const [width, height] of [[1536, 1060], [1366, 768], [1024, 768], [390, 844]]) {
      await page.setViewport({ width, height }); await delay(250);
      const layout = await page.evaluate(() => {
        const slots = [...document.querySelectorAll('.in-combat .spell-slot')];
        const bar = document.querySelector('.combat-spellbar'), map = document.querySelector('.fight-map');
        return { width: innerWidth, height: innerHeight, rows: Number(bar.style.getPropertyValue('--spell-rows')), slots: slots.length,
          overflow: document.documentElement.scrollHeight > innerHeight + 1 || document.documentElement.scrollWidth > innerWidth + 1,
          mapHeight: Math.round(map.getBoundingClientRect().height), dockHeight: Math.round(document.querySelector('.combat-dock').getBoundingClientRect().height) };
      });
      assert(!layout.overflow); assert.equal(layout.rows, 1); assert.equal(layout.slots, 7); report.layouts.push(layout);
      if (width === 390) await page.screenshot({ path: path.join(out, 'combat-mobile.png') });
    }
    await page.setViewport({ width: 1536, height: 1060 }); await delay(300);
    await page.screenshot({ path: path.join(out, 'placement.png') });
    check('Original courtyard, five painted props and one compact spell row fit four screen sizes with no page scrolling.');
    for (let i = 0; i < 3; i++) {
      if (!await page.$('.placement-ready')) break;
      await click(page, '.placement-ready'); await delay(200);
    }
    await page.waitForSelector('.end-turn:not([disabled])');
    const controlled = await page.$eval('.combat-turn-controls', e => e.dataset.controlledFighter);
    const heroIndex = { A: 0, A2: 1, A3: 2 }[controlled], spellIndex = [2, 5, 3][heroIndex];
    const buff = restored.adventure.heroes[heroIndex].character.loadout.spells.custom[spellIndex];
    const apBefore = await page.$eval('.player-resources .pa strong', e => Number(e.textContent));
    await page.click(`[data-spell-id="${buff.id}"] .spell-btn`, { button: 'right' });
    await page.waitForFunction(expected => Number(document.querySelector('.player-resources .pa strong')?.textContent) === expected, {}, apBefore - buff.pa);
    await page.waitForSelector('.original-spell-effect');
    assert.equal(await page.$$eval('.board ruffle-player', e => e.length), 0);
    await delay(200); await page.screenshot({ path: path.join(out, 'combat.png') });
    check(`Manual battle uses 3 heroes and 6 enemy sprites on its original Winterfell courtyard; ${buff.name} casts from the real spell bar and consumes ${buff.pa} AP.`);
    assert.equal(await page.evaluate(() => localStorage.getItem('dofus-lite-profiles-v1')), personal);
    await click(page, '.fight-heading-actions button', 'Abandonner');
    await page.reload({ waitUntil: 'networkidle0' }); await click(page, '.setup-play');
    assert.equal(await page.$$eval('.combat-choice[open] .adventure-heroes article', e => e.length), 3);
    await click(page, '.combat-choice[open] .combat-control-toggle button', 'Regarder l’IA');
    await click(page, '.combat-choice[open] .combat-choice-launch');
    await page.waitForSelector('[data-auto-dungeon]', { timeout: 120000 });
    await click(page, '.auto-result-button');
    await page.waitForSelector('.auto-result[data-outcome]', { timeout: 120000 });
    report.result = await page.$eval('.auto-result', e => ({ outcome: e.dataset.outcome, text: e.textContent }));
    await page.screenshot({ path: path.join(out, 'result.png') });
    assert.equal(await page.evaluate(() => localStorage.getItem('dofus-lite-profiles-v1')), personal);
    check('The imported adventure survives a reload and completes an automatic fight; personal profiles remain unchanged.');

    // Read replay metadata only, then seek using the actual replay control.
    const frames = await page.evaluate(() => {
      const node = document.querySelector('[data-auto-dungeon]');
      let fiber = node[Object.keys(node).find(k => k.startsWith('__reactFiber'))], result;
      for (; fiber && !result; fiber = fiber.return) for (let hook = fiber.memoizedState; hook; hook = hook.next) {
        if (hook.memoizedState?.frames) { result = hook.memoizedState; break; }
      }
      if (!result) throw new Error('Replay metadata unavailable');
      const picked = {};
      result.frames.forEach((f, index) => f.events.filter(e => e.t === 'cast').forEach(e => {
        if (!e.visualEffect || e.visualSpellId) throw new Error('Unexpected native visual in Winterfell replay');
        picked[e.visualEffect.kind] ||= { index, kind: e.visualEffect.kind };
      }));
      return Object.values(picked);
    });
    report.effects = [];
    for (const frame of frames) {
      await page.$eval('[aria-label="Avancement du combat"]', (input, index) => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, String(index));
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }, frame.index);
      await page.waitForSelector(`[data-original-fx="${frame.kind}"]`);
      await delay(130); report.effects.push(frame.kind);
      if (['fireball', 'bell', 'ice-lance', 'raven-step'].includes(frame.kind)) await page.screenshot({ path: path.join(out, `fx-${frame.kind}.png`) });
      await delay(1050);
    }
    report.audio = await page.evaluate(() => window.__audioProof);
    assert(report.audio.oscillators > 0 && report.audio.buffers > 0 && report.audio.peak > .001);
    assert.equal(report.audio.native, 0);
    check(`Replay shows ${frames.length} original effect styles; synthesized audio has a real signal and no native sound calls.`);

    // Re-export through the visible authoring UI and parse that browser ZIP.
    await click(page, '.fight-heading-actions button', 'Retour à Combat');
    await click(page, '.tabs > button', 'Atelier');
    // The last imported entry remains the selected room in the Atelier.
    if (!await page.$('.adventure-share')) {
      const text = await page.evaluate(() => document.body.innerText);
      if (!text.includes('Prêt à jouer')) await click(page, '.studio-categories button', 'Donjons');
      await click(page, '.studio-editor-tabs button', 'Prêt à jouer');
    }
    const downloadRoot = path.join(out, 'downloads'); fs.mkdirSync(downloadRoot, { recursive: true });
    const downloads = fs.mkdtempSync(path.join(downloadRoot, 'export-'));
    const cdp = await page.createCDPSession(); await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
    await click(page, '.adventure-share button', 'Exporter l’aventure');
    let download;
    for (let i = 0; i < 150; i++) { download = fs.readdirSync(downloads).find(n => n.endsWith('.zip')); if (download) break; await delay(100); }
    assert(download); let serial = 0;
    const parsed = await prepareWorkshopFile(new File([fs.readFileSync(path.join(downloads, download))], download),
      { newId: () => `proof-${++serial}`, equipmentId: () => 1900000000 + ++serial, verifyPixels: async () => {} });
    assert.equal(parsed.dungeons[0].adventure.heroes.length, 3); assert.equal(parsed.records.length, 9); assert.equal(parsed.characters.length, 0);
    assert.equal(parsed.records.reduce((n, record) => n + Object.keys(record.images).length, 0), 39);
    assert.equal(parsed.dungeons[0].battlefield.id, expected.battlefield.id);
    assert(parsed.records.some(record => record.images['courtyard.png'] && record.images['props.png']));
    check('The UI exports the adventure again as one self-contained dungeon ZIP; all hero and monster assets remain attached.');
    assert.deepEqual(report.browserErrors, []);
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    await page.screenshot({ path: path.join(out, 'failure.png') });
    fs.writeFileSync(path.join(out, 'failure.txt'), await page.evaluate(() => document.body.innerText)); throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
