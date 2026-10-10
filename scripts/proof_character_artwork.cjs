const puppeteer = require('puppeteer-core');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const spec = require('../src/ui/characterArtworkSpec.json');
const out = process.env.PROOF_DIR || '/tmp/dofus-character-artwork';
const base = process.env.PROOF_URL || 'http://127.0.0.1:3013';
const templates = path.resolve(__dirname, '../public/templates/character-artwork');
const artwork = process.env.PROOF_ARTWORK_DIR && path.resolve(process.env.PROOF_ARTWORK_DIR);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, pipe: true });
  let page;
  const report = { errors: [] };
  try {
    page = await browser.newPage(); page.setDefaultTimeout(30000);
    await page.setViewport({ width: 1600, height: 1100 });
    page.on('pageerror', error => report.errors.push(error.message));
    await page.evaluateOnNewDocument(() => { Math.random = () => .000017; });
    const click = async (selector, text = '') => {
      const h = await page.evaluateHandle(({ selector, text }) => [...document.querySelectorAll(selector)].find(e => e.checkVisibility() && e.textContent.includes(text)), { selector, text });
      assert(h.asElement(), `Missing ${selector}: ${text}`); await h.asElement().click(); await h.dispose();
    };
    const input = async (selector, value) => {
      await page.$eval(selector, e => { e.focus(); e.select(); });
      await page.keyboard.press('Backspace'); await page.type(selector, value);
    };
    const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('dofus-lite-creations-v1')).characters[0]);
    const upload = async (directory, names) => {
      const field = await page.$('[aria-label="Images PNG du personnage"]');
      await field.uploadFile(...names.map(name => path.join(directory === 'example' && artwork ? artwork : path.join(templates, directory), name)));
    };
    const imageNames = spec.files.map(file => file.name);
    const minimal = spec.files.filter(file => file.required).map(file => file.name);
    await page.goto(base, { waitUntil: 'networkidle0' });
    await click('.tabs > button', 'Atelier');
    await click('.creator-tabs button', 'Mes classes');
    await click('.creator-library-strip button', 'Nouvelle classe');
    await input('.creator-name-row input', process.env.PROOF_CHARACTER_NAME || 'Gardien — dessin personnalisé');
    for (const [query, id] of [['Puissance', 153], ['Morsure du Bouftou', 202], ['Fureur', 305], ['Invocation d’Arakne', 214]]) {
      await input('[aria-label="Rechercher dans tous les sorts"]', query);
      await click(`.creator-spell-results [aria-label$="(${id})"]`, 'Ajouter');
    }
    await click('.creator-artwork summary');
    await upload('example', minimal.slice(1));
    await page.waitForFunction(() => document.querySelector('.creator-artwork [role="alert"]')?.textContent.includes('portrait.png'));
    assert.equal((await saved()).loadout.artworkId, undefined);
    await upload('example', minimal);
    await page.waitForSelector('.creator-artwork-stage .custom-character-sprite');
    const initialId = (await saved()).loadout.artworkId;
    await page.select('[aria-label="Animation d’aperçu"]', 'walk').catch(async () => {
      const h = await page.evaluateHandle(() => [...document.querySelectorAll('.creator-artwork label')].find(e => e.textContent.includes('Animation d’aperçu')).querySelector('select'));
      await h.asElement().select('walk'); await h.dispose();
    });
    assert.equal(await page.$eval('.creator-artwork-stage .custom-character-sprite', e => e.dataset.artworkFile), 'idle-front.png');
    report.minimum = { imported: 3, optionalFallback: 'idle-front.png' };
    await upload('example', imageNames);
    await page.waitForFunction(id => JSON.parse(localStorage.getItem('dofus-lite-creations-v1')).characters[0].loadout.artworkId !== id, {}, initialId);
    const fullId = (await saved()).loadout.artworkId;
    await page.waitForFunction(id => document.querySelector('.creator-artwork-stage .custom-character-sprite')?.dataset.artworkId === id, {}, fullId);
    const oldPackStillStored = await page.evaluate(id => new Promise((resolve, reject) => {
      const r = indexedDB.open('dofus-lite-character-artwork', 1);
      r.onerror = reject;
      r.onsuccess = () => { const q = r.result.transaction('artwork').objectStore('artwork').get(id); q.onsuccess = () => { resolve(!!q.result); r.result.close(); }; };
    }), initialId);
    assert(oldPackStillStored);
    await upload('blank', imageNames);
    await page.waitForFunction(() => document.querySelector('.creator-artwork [role="alert"]')?.textContent.includes('vide'));
    assert.equal((await saved()).loadout.artworkId, fullId);
    // An invalid replacement cannot overwrite the saved valid pack.
    report.validation = { missingRequiredRejected: true, emptyFramesRejected: true, previousPackPreserved: true };
    await page.reload({ waitUntil: 'networkidle0' });
    await click('.tabs > button', 'Atelier'); await click('.creator-tabs button', 'Mes classes');
    await page.waitForSelector('.creator-artwork-stage .custom-character-sprite');
    assert.equal((await saved()).loadout.artworkId, fullId);
    assert.equal(await page.$eval('.creator-character-identity .retro-portrait', e => e.src.startsWith('blob:') && e.naturalWidth), 256);
    const selectPreview = async (label, value) => {
      const h = await page.evaluateHandle(label => [...document.querySelectorAll('.creator-artwork label')].find(e => e.textContent.startsWith(label)).querySelector('select'), label);
      await h.asElement().select(value); await h.dispose();
    };
    for (const [direction, file, mirror] of [['SE', 'front', false], ['SW', 'front', true], ['NW', 'back', false], ['NE', 'back', true]]) {
      await selectPreview('Orientation d’aperçu', direction);
      await selectPreview('Animation d’aperçu', 'walk');
      assert.equal(await page.$eval('.creator-artwork-stage .custom-character-sprite', e => e.dataset.artworkFile), `walk-${file}.png`);
      assert.equal(await page.$eval('.creator-artwork-stage .custom-character-sprite', e => e.style.transform), mirror ? 'scaleX(-1)' : '');
    }
    await selectPreview('Animation d’aperçu', 'static'); await selectPreview('Orientation d’aperçu', 'SE');
    await page.$eval('.creator-artwork', e => e.scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: path.join(out, 'artwork-editor.png') });
    report.preview = { directions: 4, savedAfterReload: true, images: 9 };
    const guidePage = await browser.newPage();
    await guidePage.setViewport({ width: 1400, height: 1200 });
    await guidePage.goto(`${base}/templates/character-artwork/index.html`, { waitUntil: 'networkidle0' });
    const broken = await guidePage.evaluate(async () => {
      const links = [...document.querySelectorAll('a[href]')].filter(a => /templates|guides|blank|kit\.zip/.test(a.href));
      return (await Promise.all(links.map(async a => ({ url: a.href, ok: (await fetch(a.href)).ok })))).filter(r => !r.ok);
    });
    assert.deepEqual(broken, []);
    await guidePage.screenshot({ path: path.join(out, 'template-guide.png') });
    await guidePage.close();
    report.downloads = { guideAndTemplateLinksWork: true };
    await click('.creator-launch button', 'Jouer cette création');
    await page.waitForSelector('.token.side-A .custom-character-sprite');
    assert.equal(await page.$('.token.side-A ruffle-player'), null);
    assert.equal(await page.$eval('.token.side-A .custom-character-sprite', e => e.dataset.artworkId), fullId);
    if (await page.$('.fight-log-close')) await click('.fight-log-close');
    await click('.placement-ready');
    await page.waitForSelector('.turn-status.yours');
    await page.evaluate(() => { const original = window.dofusLiteSound; window.artworkCues = []; window.dofusLiteSound = (cue, scope) => {
      window.artworkCues.push({ cue, custom: !!document.getElementById(`retro-sound-${scope}`)?.classList.contains('custom-character-sprite') }); original(cue, scope);
    }; });
    await page.click('.spell-slot[data-spell-id="153"] button', { button: 'right' });
    await page.waitForFunction(() => document.querySelector('.token.side-A .custom-character-sprite')?.dataset.artworkFile.startsWith('cast-'), { polling: 10 });
    await page.waitForFunction(() => document.querySelector('.token.side-A .custom-character-sprite')?.dataset.artworkFrame !== '0', { polling: 10 });
    await page.waitForFunction(() => document.querySelector('.token.side-A .custom-character-sprite')?.dataset.artworkFile.startsWith('idle-'));
    const movement = await page.evaluate(() => {
      const node = document.querySelector('.fight-screen');
      let fiber = node[Object.keys(node).find(k => k.startsWith('__reactFiber$'))], match;
      for (; fiber && !match; fiber = fiber.return) for (let h = fiber.memoizedState; h; h = h.next) if (typeof h.memoizedState?.current?.humanAct === 'function') { match = h.memoizedState.current; break; }
      const from = match.state.fighters.A.pos;
      const cells = [...document.querySelectorAll('.cell.hl-move')].map(e => ({ cell: e.dataset.cell, pos: e.dataset.cell.split(',').map(Number) }));
      cells.sort((a, b) => b.pos.reduce((s, n, i) => s + Math.abs(n - [from.x, from.y][i]), 0) - a.pos.reduce((s, n, i) => s + Math.abs(n - [from.x, from.y][i]), 0));
      return { cell: cells[0].cell, pa: match.state.fighters.A.pa };
    });
    assert.equal(movement.pa, 3);
    await click(`.cell[data-cell="${movement.cell}"]`);
    await page.waitForFunction(() => document.querySelector('.token.side-A .custom-character-sprite')?.dataset.artworkFile.startsWith('walk-'), { polling: 10 });
    await page.waitForFunction(() => !document.querySelector('.token.side-A.walking'));
    await sleep(150);
    await page.screenshot({ path: path.join(out, 'custom-combat.png') });
    const rect = await page.$eval('.token.side-A .custom-character-sprite', e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
    await page.screenshot({ path: path.join(out, 'custom-character.png'), clip: rect });
    report.combat = { castAnimated: true, walkAnimated: true, spellSound: await page.evaluate(() => window.artworkCues.some(({ cue }) => /gonfle|vlad_803/i.test(cue))) };
    assert(report.combat.spellSound, 'PNG casting lost the spell effect sound');
    await click('.fight-heading-actions button', 'Abandonner');
    await click('.creator-launch button', 'Tester avec l’IA');
    await page.waitForSelector('[data-auto-dungeon]', { timeout: 120000 });
    await click('.auto-result-button'); await page.waitForSelector('[data-outcome]');
    await page.waitForSelector('.token.side-A .custom-character-sprite');
    assert.equal(await page.$eval('.token.side-A .custom-character-sprite', e => e.dataset.artworkId), fullId);
    report.automatic = { customAppearanceInResult: true };
    await click('.fight-heading-actions button', 'Retour à l’atelier');
    await page.setViewport({ width: 390, height: 844 });
    await page.$eval('.creator-artwork', e => e.scrollIntoView({ block: 'start' }));
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Artwork editor mobile overflow');
    await page.screenshot({ path: path.join(out, 'mobile.png') });
    assert.deepEqual(report.errors, []);
    report.passed = true;
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    report.failure = error.stack;
    if (page) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
    throw error;
  } finally {
    fs.writeFileSync(path.join(out, 'proof.json'), JSON.stringify(report, null, 2));
    const child = browser.process(); await browser.disconnect(); child?.kill('SIGTERM');
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
