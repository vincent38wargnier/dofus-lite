// Native rendering in a crowded custom dungeon, using an isolated browser profile.
const puppeteer = require('puppeteer-core');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const out = process.env.PROOF_DIR || '/tmp/dofus-dungeon-visibility';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, pipe: true });
  const report = { errors: [], graphicsWarnings: [], checks: [] };
  let page;
  try {
    page = await browser.newPage(); page.setDefaultTimeout(30000);
    await page.setViewport({ width: 1600, height: 1000 });
    page.on('pageerror', error => report.errors.push(error.message));
    page.on('console', message => {
      if (/context.*lost|too many.*context/i.test(message.text())) report.graphicsWarnings.push(message.text());
    });
    await page.evaluateOnNewDocument(() => {
      const getContext = HTMLCanvasElement.prototype.getContext;
      const seen = new WeakSet();
      window.renderCanvases = [];
      window.contextLosses = 0;
      HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
        const context = getContext.call(this, kind, ...args);
        if (context && !seen.has(this)) {
          seen.add(this); window.renderCanvases.push({ canvas: new WeakRef(this), kind });
          this.addEventListener('webglcontextlost', () => { window.contextLosses += 1; });
        }
        return context;
      };
      localStorage.setItem('dofus-lite-creations-v1', JSON.stringify({ version: 1, characters: [], dungeons: [{
        id: 'visibility-proof', name: 'Les huit Maîtres Corbacs', mapId: 'dungeon_2083', members: [{ monsterId: 289, grade: 1, count: 8 }],
      }] }));
      localStorage.setItem('dofus-lite-player-setup-v1', JSON.stringify({ playerClass: 'IOP' }));
      localStorage.setItem('dofus-lite-loadouts-v1', JSON.stringify({ 'A:IOP': {
        version: 1, level: 200, base: { vitalite: 995 }, slots: {}, rollMode: 'max', rollSeed: 1,
      } }));
      localStorage.setItem('dofus-lite-tactical-mode-v1', 'true');
      localStorage.setItem('dofus-lite-sound-v1', JSON.stringify({ enabled: false, volume: 0 }));
      Math.random = () => .000019;
    });
    const click = async (selector, text = '') => {
      const h = await page.evaluateHandle(({ selector, text }) => [...document.querySelectorAll(selector)].find(e => e.checkVisibility() && e.textContent.includes(text)), { selector, text });
      assert(h.asElement(), `Missing ${selector}: ${text}`); await h.asElement().click(); await h.dispose();
    };
    await page.goto(process.env.PROOF_URL || 'http://127.0.0.1:3013', { waitUntil: 'networkidle0' });
    await click('.tabs > button', 'Atelier');
    await click('.creator-launch button', 'Tester avec l’IA');
    await page.waitForSelector('[data-auto-dungeon]', { timeout: 120000 });
    await click('[aria-label="Pause"]');
    report.fight = await page.evaluate(() => {
      const root = document.querySelector('[data-auto-dungeon]');
      let fiber = root[Object.keys(root).find(k => k.startsWith('__reactFiber$'))], result;
      for (; fiber && !result; fiber = fiber.return) for (let h = fiber.memoizedState; h; h = h.next) {
        if (h.memoizedState?.frames?.length && h.memoizedState?.finalState) { result = h.memoizedState; break; }
      }
      if (!result) throw new Error('Replay not found');
      window.visibilityResult = result;
      let peak = 0, index = 0;
      result.frames.forEach((frame, i) => {
        const count = Object.values(frame.state.fighters).filter(f => f.hp > 0).length;
        if (count > peak) { peak = count; index = i; }
      });
      return { map: result.finalState.mapId, peak, index, frames: result.frames.length,
        summons: result.events.filter(e => e.t === 'summon_add').length,
        errors: result.events.filter(e => e.t === 'bot_error') };
    });
    console.log('Fight', report.fight);
    assert(report.fight.peak > 16, 'Room must exercise more than 16 live native actors');
    assert.deepEqual(report.fight.errors, []);
    const seek = async index => {
      await page.$eval('[aria-label="Avancement du combat"]', (element, value) => {
        const props = element[Object.keys(element).find(k => k.startsWith('__reactProps$'))];
        props.onChange({ target: { value: String(value) } });
      }, index);
      await page.waitForFunction(() => [...document.querySelectorAll('.token ruffle-player')].every(p => typeof p.animate === 'function'));
      await sleep(850);
    };
    const verify = async label => {
      const result = await page.evaluate(label => {
        const actors = [...document.querySelectorAll('.token')].map(token => {
          const player = token.querySelector('ruffle-player');
          const entry = window.renderCanvases.find(entry => entry.canvas.deref()?.getRootNode().host === player);
          const canvas = entry?.canvas.deref();
          let visiblePixels = 0;
          if (canvas && entry.kind === '2d') {
            const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
            for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 20) visiblePixels += 1;
          }
          return { id: token.dataset.fighterId, actor: token.dataset.actor, kind: entry?.kind, visiblePixels,
            animation: token.dataset.animation, nativeFrame: player?.ruffle().callExternalInterface('currentFrame') };
        });
        return { label, actors, contextLosses: window.contextLosses };
      }, label);
      assert.equal(result.contextLosses, 0, label);
      for (const actor of result.actors) {
        assert.equal(actor.kind, '2d', `${label}: ${actor.id} must not consume a WebGL context`);
        assert(actor.visiblePixels > 20, `${label}: ${actor.id} disappeared (${actor.animation})`);
      }
      report.checks.push(result);
    };
    await seek(report.fight.index); await verify('crowded-room');
    await page.screenshot({ path: path.join(out, 'crowded-room.png') });
    // Spells, hit reactions and movements from the real simulated fight.
    const frames = await page.evaluate(index => window.visibilityResult.frames.map((frame, i) => ({ i, frame }))
      .filter(({ i, frame }) => i >= index && frame.events.some(e => ['cast', 'move', 'damage'].includes(e.t)))
      .slice(0, 12).map(({ i }) => i), report.fight.index);
    for (const index of frames) { await seek(index); await verify(`action-${index}`); }
    await click('.board-mode-toggle'); await sleep(800); await verify('original-scenery');
    await page.screenshot({ path: path.join(out, 'original-scenery.png') });
    await click('.fight-heading-actions button', 'Journal'); await sleep(350); await verify('resized-with-journal');
    await page.setViewport({ width: 1280, height: 800 }); await sleep(450); await verify('resized-window');
    await seek(0); await verify('rewound-replay');
    await seek(report.fight.index); await verify('restored-summons');
    assert.deepEqual(report.errors, []); assert.deepEqual(report.graphicsWarnings, []);
    report.passed = true; console.log(JSON.stringify({ ...report, checks: report.checks.map(x => ({ label: x.label, visible: x.actors.length })) }, null, 2));
  } catch (error) {
    report.failure = error.stack; if (page) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
    throw error;
  } finally {
    fs.writeFileSync(path.join(out, 'proof.json'), JSON.stringify(report, null, 2));
    const child = browser.process(); await browser.disconnect(); child?.kill('SIGTERM');
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
