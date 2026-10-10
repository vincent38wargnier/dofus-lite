const puppeteer = require('puppeteer-core');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const url = process.env.RETRO_URL || 'http://127.0.0.1:3013';
const out = path.join(os.tmpdir(), 'dofus-lite-audio-proof');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, pipe: true, protocolTimeout: 20000 });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1500, height: 1050 });
    const errors = [], external = [], results = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
    await page.setRequestInterception(true);
    page.on('request', r => {
      if (r.url().startsWith(url) || /^(blob|data):/.test(r.url())) r.continue();
      else { external.push(r.url()); r.abort(); }
    });
    await page.evaluateOnNewDocument(() => {
      window.audioProof = { cues: [], media: [] };
      let context;
      // Observe actual decoded audio routed to the output. No autoplay bypass,
      // mocked play(), or synthetic replacement for the imported recordings.
      document.addEventListener('click', () => {
        if (!context) context = new AudioContext();
        context.resume();
      }, true);
      const originalPlay = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function () {
        const item = { url: this.src, volume: this.volume, peak: 0, elapsed: 0, ended: false, media: this };
        window.audioProof.media.push(item);
        if (context) {
          const analyser = context.createAnalyser();
          const source = context.createMediaElementSource(this);
          source.connect(analyser);
          analyser.connect(context.destination);
          const samples = new Float32Array(analyser.fftSize);
          const timer = setInterval(() => {
            analyser.getFloatTimeDomainData(samples);
            item.peak = Math.max(item.peak, ...samples.map(Math.abs));
            item.elapsed = this.currentTime;
            if (this.paused || this.ended) { clearInterval(timer); source.disconnect(); analyser.disconnect(); }
          }, 20);
        }
        this.addEventListener('ended', () => { item.ended = true; });
        return originalPlay.call(this).then(() => { item.played = true; }, error => { item.error = error.message; throw error; });
      };
    });
    const click = async (selector, text = '') => {
      const buttons = await page.$$(selector);
      for (const button of buttons) {
        if (await button.evaluate((e, text) => !!e.getClientRects().length && e.textContent.includes(text), text)) {
          await button.click(); return;
        }
      }
      throw new Error(`Missing ${selector}: ${text}`);
    };
    const hookCues = () => page.evaluate(() => {
      const original = window.dofusLiteSound;
      window.dofusLiteSound = (name, scope) => { window.audioProof.cues.push(name); original(name, scope); };
    });
    const report = () => page.evaluate(() => ({
      cues: window.audioProof.cues,
      clips: window.audioProof.media.map(({ media, ...item }) => item),
    }));
    await page.goto(url, { waitUntil: 'networkidle0' });
    await page.waitForSelector('.sound-settings');
    await hookCues();
    assert.equal(await page.$eval('.retro-sound-toggle', e => e.getAttribute('aria-pressed')), 'true');
    await click('.tab', 'Grimoire');
    await page.waitForSelector('.spellbook-item');
    const cases = [
      ['IOP', 'Pression', 'vlad_806'], ['IOP', 'Puissance', 'gonfle'],
      ['IOP', 'Bond', 'vlad_807'], ['IOP', 'Colère de Iop', 'lakam_405'],
      ['FECA', 'Attaque Naturelle'], ['OSAMODAS', 'Griffe Spectrale'],
      ['ENUTROF', 'Lancer de Pelle'], ['SRAM', 'Sournoiserie'],
      ['XELOR', 'Aiguille'], ['ECAFLIP', 'Pile ou Face'],
      ['ENIRIPSA', 'Mot Curatif'], ['CRA', 'Flèche Magique', 'cc_jet'],
      ['CRA', 'Flèche Explosive'], ['SADIDA', 'Ronce'],
      ['SACRIEUR', 'Pied du Sacrieur'], ['PANDAWA', 'Poing Enflammé'],
    ];
    for (const [classId, spell, expected] of cases) {
      await page.select('select[aria-label="Classe du grimoire"]', classId);
      await click('.spellbook-item', spell);
      await page.waitForFunction(() => typeof document.querySelector('.spell-preview-caster ruffle-player')?.animate === 'function');
      await sleep(100);
      await page.evaluate(() => { window.audioProof.cues = []; window.audioProof.media = []; });
      await click('.spellbook-detail > .btn', 'animation');
      await page.waitForFunction(cue => (!cue || window.audioProof.cues.includes(cue)) &&
        window.audioProof.media.some(item => item.played && item.elapsed > 0 && item.peak > .00001),
      { timeout: 6000 }, expected || null);
      const result = { classId, spell, ...await report() };
      // Flèche Magique's correct anim2 gesture supplies cc_jet; the old anim3
      // mapping had incorrectly made this spell's entire preview silent.
      if (expected) assert.ok(result.cues.includes(expected), `${spell}: missing authored cue ${expected}`);
      assert.ok(result.clips.some(c => c.played && c.elapsed > 0 && c.peak > .00001), `${spell}: no decoded audio signal: ${JSON.stringify(result)}`);
      assert.ok(result.clips.every(c => !c.error), `${spell}: audio playback rejected`);
      results.push(result);
      console.log(`${spell}: ${result.cues.join(', ')}; decoded audio confirmed.`);
    }
    await page.select('select[aria-label="Classe du grimoire"]', 'IOP');
    await click('.spellbook-item', 'Puissance');
    await click('.spellbook-detail > .btn', 'animation');
    await sleep(300);
    await page.click('.sound-settings summary'); await click('.retro-sound-toggle', 'activés');
    assert.ok(await page.evaluate(() => window.audioProof.media.every(x => x.media.paused)), 'Mute did not stop active clips');
    await page.evaluate(() => { window.audioProof.media = []; });
    await click('.spellbook-detail > .btn', 'animation');
    await sleep(1500);
    assert.equal((await report()).clips.length, 0, 'Muted preview created media');
    const slider = await page.$('input[aria-label="Volume des bruitages"]');
    await slider.focus();
    await page.keyboard.press('Home');
    for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowRight');
    assert.equal(await slider.evaluate(e => e.value), '60');
    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForSelector('.sound-settings');
    assert.equal(await page.$eval('.retro-sound-toggle', e => e.getAttribute('aria-pressed')), 'false');
    assert.equal(await page.$eval('input[aria-label="Volume des bruitages"]', e => e.value), '60');
    await hookCues();
    await page.click('.sound-settings summary'); await click('.retro-sound-toggle', 'coupés'); await page.click('.sound-settings summary');
    await click('.tab', 'Jouer');
    await click('.setup-play');
    await page.waitForSelector('.placement-ready');
    await click('.placement-ready');
    await page.waitForSelector('.cell.hl-move');
    await page.waitForFunction(() => {
      const players = [...document.querySelectorAll('.retro-actor ruffle-player')];
      return players.length === 2 && players.every(p => typeof p.animate === 'function');
    });
    // The opponent can win initiative; movement highlights can exist during
    // that turn, so wait for the player's actual spell controls to unlock.
    await page.waitForFunction(() => [...document.querySelectorAll('.spell-btn')].some(b => b.textContent.includes('Puissance') && !b.disabled));
    await page.evaluate(() => { window.audioProof.cues = []; window.audioProof.media = []; });
    await click('.spell-btn', 'Puissance');
    if (await page.$('.token.side-A.targetable .figure')) await page.click('.token.side-A.targetable .figure');
    await page.waitForFunction(() => window.audioProof.cues.includes('gonfle') && window.audioProof.media.some(c => c.peak > .00001));
    await sleep(400);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(out, 'spell-sounds.png') });
    const combat = await report();
    assert.ok(combat.cues.includes('gonfle') || combat.cues.includes('vlad_803'));
    assert.ok(combat.clips.some(c => Math.abs(c.volume - .6) < .001), 'Saved volume was not applied');
    await click('.tab', 'Grimoire');
    await sleep(200);
    assert.ok(await page.evaluate(() => window.audioProof.media.every(x => x.media.paused)), 'Leaving combat did not stop its voices');
    await page.evaluate(() => { window.audioProof.media = []; });
    await page.evaluate(() => {
      const hidden = document.querySelector('.retro-actor.retro-movie');
      window.dofusLiteSound('vlad_803', hidden.id.replace('retro-sound-', ''));
    });
    assert.equal((await report()).clips.length, 0, 'Hidden combat produced audio');
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
    const summary = { spells: results, combat, mute: true, persistence: true, hiddenTabsSilent: true, errors, externalRequests: 0 };
    fs.writeFileSync(path.join(out, 'audio-proof.json'), JSON.stringify(summary, null, 2));
    console.log(JSON.stringify({ spells: results.length, classes: new Set(results.map(r => r.classId)).size, mute: true, persistence: true, combat: true, hiddenTabsSilent: true, errors, externalRequests: 0, artifacts: out }, null, 2));
  } finally {
    await browser.disconnect();
    browser.process()?.kill('SIGKILL');
  }
})().catch(error => { console.error(error); process.exitCode = 1; })
  // Puppeteer can retain protocol timers after its browser has been killed.
  // All assertions, artifact writes and owned-browser cleanup are awaited above.
  .finally(() => process.exit(process.exitCode || 0));
