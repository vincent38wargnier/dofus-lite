const puppeteer = require('puppeteer-core');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');

const url = process.env.RETRO_URL || 'http://127.0.0.1:3013';
const out = path.join(os.tmpdir(), 'dofus-lite-retro-proof');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, pipe: true, protocolTimeout: 20000 });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1500, height: 1050 });
    const errors = [], external = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' || m.text().includes('%cERROR%c')) errors.push(m.text().slice(0, 180)); });
    page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
    await page.setRequestInterception(true);
    page.on('request', r => {
      if (r.url().startsWith(url) || /^(blob|data):/.test(r.url())) r.continue();
      else { external.push(r.url()); r.abort(); }
    });
    await page.goto(url, { waitUntil: 'networkidle0' });
    await page.waitForSelector('.player-summary .retro-portrait');
    const clickTab = text => page.evaluate(text => [...document.querySelectorAll('.tab')].find(t => t.textContent.includes(text)).click(), text);
    await clickTab('Jouer');
    await page.evaluate(() => [...document.querySelectorAll('.btn.primary')].find(b => b.offsetParent && b.textContent.includes('Jouer')).click());
    await page.waitForSelector('.cell.hl-move');
    await page.waitForFunction(() => [...document.querySelectorAll('.retro-actor ruffle-player')].length === 2 && [...document.querySelectorAll('.retro-actor ruffle-player')].every(p => typeof p.animate === 'function'), { timeout: 20000 });
    await sleep(500);
    await page.$$eval('.fighter-equipment', es => es.filter(e => e.checkVisibility()).forEach(e => { e.open = true; }));
    await page.waitForFunction(() => [...document.querySelectorAll('img')].filter(i => i.checkVisibility()).every(i => i.complete && i.naturalWidth));
    const loaded = await page.evaluate(() => ({
      actors: [...document.querySelectorAll('.retro-token')].map(t => ({ id: t.dataset.actor, animation: t.dataset.animation })),
      maps: document.querySelectorAll('.retro-map-layer').length,
      // Hidden preparation panes contain lazy inventory thumbnails. Only images
      // in the visible combat are expected to have loaded at this point.
      badImages: [...document.querySelectorAll('img')].filter(i => i.checkVisibility() && (!i.complete || !i.naturalWidth)).map(i => i.src),
      spellIcons: document.querySelectorAll('.retro-spell-icon').length,
    }));
    assert.equal(loaded.actors.length, 2);
    assert.ok(loaded.maps > 0);
    assert.equal(loaded.badImages.length, 0);
    assert.ok(loaded.spellIcons > 0);
    await page.$$eval('.fighter-equipment', es => es.forEach(e => { e.open = false; }));
    // Check the Flash timeline itself, not just React's requested animation.
    const idleFrames = await page.$$eval('.retro-actor ruffle-player', players => players.map(p => p.ruffle().callExternalInterface('currentFrame')));
    assert.deepEqual(idleFrames, [1, 1]);
    await page.screenshot({ path: path.join(out, 'combat.png') });
    const cells = await page.$$('.cell.hl-move');
    await cells[cells.length - 1].hover();
    await sleep(100);
    const before = await page.$eval('.token.side-A', t => [t.style.left, t.style.top]);
    await cells[cells.length - 1].click();
    await sleep(90);
    const walking = await page.$eval('.token.side-A', t => t.dataset.animation);
    const walkFrame = await page.$eval('.token.side-A ruffle-player', p => p.ruffle().callExternalInterface('currentFrame'));
    assert.ok(walkFrame > 1, `Flash did not change to the walk animation: ${walkFrame}`);
    await sleep(700);
    const after = await page.$eval('.token.side-A', t => [t.style.left, t.style.top]);
    assert.notDeepEqual(after, before);
    assert.ok(walking.startsWith('walk'));
    await page.evaluate(() => [...document.querySelectorAll('.spell-btn')].find(b => !b.disabled && !b.title.includes('portée 0-0')).click());
    await sleep(100);
    assert.ok(await page.$$eval('.cell.hl-range,.cell.hl-target', cells => cells.length > 0));
    await page.screenshot({ path: path.join(out, 'spell-range.png') });
    await page.click('.tools-menu summary'); await clickTab('Personnages');
    await page.waitForSelector('.retro-class-choice');
    assert.equal(await page.$$eval('.retro-class-choice', a => a.length), 12);
    await sleep(700);
    await page.screenshot({ path: path.join(out, 'classes.png') });
    const choices = await page.$$('.retro-preview-controls select');
    await choices[0].select('female');
    await sleep(400);
    await choices[1].select('walkR');
    await sleep(400);
    await page.screenshot({ path: path.join(out, 'female-walk.png') });
    await page.evaluate(() => {
      window.retroProofSounds = [];
      window.dofusLiteSound = name => window.retroProofSounds.push(name);
    });
    await choices[1].select('hitR');
    await page.waitForFunction(() => window.retroProofSounds.length > 0, { timeout: 5000 });
    await page.waitForFunction(() => document.querySelector('.retro-preview ruffle-player').ruffle().callExternalInterface('currentFrame') === 1, { timeout: 5000 });
    await sleep(800);
    const sounds = await page.evaluate(() => window.retroProofSounds);
    assert.equal(sounds.filter(name => name === 'aie_f').length, 1, 'The removed hit clip kept playing its sound');
    assert.equal(external.length, 0, `Unexpected external requests: ${external}`);
    assert.equal(errors.length, 0, `Browser errors: ${errors.join('\n')}`);
    console.log(JSON.stringify({ loaded, idleFrames, walking, walkFrame, before, after, sounds, errors, externalRequests: external.length, screenshots: out }, null, 2));
  } finally {
    let timer;
    try {
      await Promise.race([browser.close(), new Promise(resolve => { timer = setTimeout(resolve, 5000); })]);
    } finally {
      clearTimeout(timer);
      await browser.disconnect();
      if (browser.process()?.exitCode === null) browser.process().kill('SIGKILL');
    }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
