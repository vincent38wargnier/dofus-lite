// Observe real decoded client recordings while replaying an unmodified dungeon simulation.
const puppeteer = require('puppeteer-core');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const url = process.env.RETRO_URL || 'http://127.0.0.1:3013';
const out = process.env.PROOF_DIR || '/tmp/dofus-combat-audio-proof';
fs.mkdirSync(out, {
  recursive: true
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    pipe: true
  });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(45000);
    await page.setViewport({
      width: 1500,
      height: 1000
    });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('response', r => {
      if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`);
    });
    await page.evaluateOnNewDocument(() => {
      localStorage.setItem('dofus-lite-player-setup-v1', JSON.stringify({
        playerClass: 'IOP',
        mode: 'boss-auto',
        bossId: 1184,
        bossGrade: 1,
        playerBotId: 'maison'
      }));
      localStorage.setItem('dofus-lite-loadouts-v1', JSON.stringify({
        'A:IOP': {
          version: 1,
          level: 200,
          base: {
            vitalite: 300,
            force: 100
          },
          rollMode: 'max',
          rollSeed: 1,
          slots: {
            hat: 8267,
            cape: 8265,
            amulet: 8262,
            ring1: 8263,
            ring2: 2469,
            belt: 8266,
            boots: 8264,
            weapon: 2416,
            dofus1: 739
          }
        }
      }));
      Math.random = () => .000031;
      window.audioProof = {
        cues: [],
        media: []
      };
      let context;
      document.addEventListener('click', () => {
        if (!context) context = new AudioContext();
        context.resume();
      }, true);
      const play = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function () {
        const item = {
          url: this.src,
          volume: this.volume,
          peak: 0,
          elapsed: 0,
          media: this
        };
        window.audioProof.media.push(item);
        if (context) {
          const analyser = context.createAnalyser(),
            source = context.createMediaElementSource(this);
          source.connect(analyser);
          analyser.connect(context.destination);
          const values = new Float32Array(analyser.fftSize);
          const timer = setInterval(() => {
            analyser.getFloatTimeDomainData(values);
            item.peak = Math.max(item.peak, ...values.map(Math.abs));
            item.elapsed = this.currentTime;
            if (this.paused || this.ended) {
              clearInterval(timer);
              source.disconnect();
              analyser.disconnect();
            }
          }, 20);
        }
        return play.call(this).then(() => {
          item.played = true;
        }, e => {
          item.error = e.message;
          throw e;
        });
      };
    });
    const click = async (selector, text = '') => {
      const h = await page.evaluateHandle(({
        selector,
        text
      }) => [...document.querySelectorAll(selector)].find(e => e.checkVisibility() && e.textContent.includes(text)), {
        selector,
        text
      });
      assert(h.asElement(), `${selector} ${text}`);
      await h.asElement().click();
      await h.dispose();
    };
    await page.goto(url, {
      waitUntil: 'networkidle0'
    });
    await page.evaluate(() => {
      const prev = window.dofusLiteSound;
      window.dofusLiteSound = (name, scope) => {
        window.audioProof.cues.push({
          name,
          scope
        });
        prev(name, scope);
      };
    });
    await click('.setup-play');
    await page.waitForSelector('[data-auto-dungeon]');
    await click('[aria-label="Pause"]');
    await page.waitForFunction(() => [...document.querySelectorAll('.token ruffle-player')].every(p => typeof p.animate === 'function'));
    const frames = await page.evaluate(() => {
      const el = document.querySelector('[data-auto-dungeon]');
      let fiber = el[Object.keys(el).find(k => k.startsWith('__reactFiber$'))];
      for (; fiber; fiber = fiber.return) {
        for (let hook = fiber.memoizedState; hook; hook = hook.next) {
          if (hook.memoizedState?.frames) return hook.memoizedState.frames.map((f, i) => ({
            i,
            events: f.events,
            fighters: Object.fromEntries(Object.entries(f.state.fighters).map(([id, x]) => [id, {
              name: x.name,
              isMonster: x.isMonster,
              isSummon: x.isSummon,
              monsterId: x.monsterId
            }]))
          }));
        }
      }
      throw Error('No replay');
    });
    fs.writeFileSync(out + '/frames.json', JSON.stringify(frames));
    const summary = frames.flatMap(f => f.events.filter(e => ['cast', 'spell_fail', 'move'].includes(e.t)).map(e => ({
      i: f.i,
      ...e,
      name: f.fighters[e.fighter]?.name,
      isMonster: f.fighters[e.fighter]?.isMonster
    })));
    console.log(JSON.stringify({
      frames: frames.length,
      casts: summary.filter(e => e.t === 'cast' && e.isMonster).map(e => [e.i, e.spellId, e.spellName]),
      crits: summary.filter(e => e.crit).map(e => [e.i, e.name, e.spellName]),
      fails: summary.filter(e => e.t === 'spell_fail').map(e => [e.i, e.name, e.spellName])
    }, null, 2));
    fs.writeFileSync(out + '/summary.json', JSON.stringify(summary, null, 2));
    const cases = [['monster-boost', summary.find(e => e.spellId === 1171)], ['monster-summon', summary.find(e => e.spellId === 1170)], ['monster-step', summary.find(e => e.t === 'move' && e.isMonster)], ['one-cell-step', summary.find(e => e.t === 'move' && e.path.length === 2)], ['critical-hit', summary.find(e => e.crit && e.fighter === 'A')], ['critical-failure', summary.find(e => e.t === 'spell_fail')]];
    const results = [];
    const seek = async index => {
      // Invoke the range control's actual seek handler, without changing the
      // simulated state or events. Its UI slider is too coarse for one action.
      await page.$eval('[aria-label="Avancement du combat"]', (el, value) => el[Object.keys(el).find(k => k.startsWith('__reactProps$'))].onChange({
        target: {
          value: String(value)
        }
      }), index);
      await page.waitForFunction(i => Number(document.querySelector('[data-auto-dungeon]').dataset.replayFrame) === i, {}, index);
    };
    for (const [label, e] of cases) {
      assert(e, `Missing real replay event: ${label}`);
      await seek(Math.max(0, e.i - 1));
      await sleep(1800);
      await page.evaluate(() => {
        window.audioProof.cues = [];
        window.audioProof.media = [];
      });
      await click('[aria-label="Action suivante"]');
      await sleep(2500);
      const r = await page.evaluate(() => ({
        cues: window.audioProof.cues,
        media: window.audioProof.media.map(({
          media,
          ...x
        }) => x)
      }));
      const result = {
        label,
        event: e,
        ...r
      };
      results.push(result);
      console.log('CASE', label, JSON.stringify(r));
      if (e.t === 'move') assert.equal(r.cues.filter(c => c.scope === r.cues[0].scope).length, e.path.length - 1, 'one sound per step');
      assert(r.media.some(m => m.played && m.elapsed > 0 && m.peak > .00001), label + ' no decoded sound');
      if (label === 'critical-hit') assert(r.cues.some(c => c.name === 'BIP'));
      if (label === 'critical-failure') assert(r.cues.some(c => c.name === 'COUP_CRITIQUE'));
      await page.screenshot({
        path: out + '/' + label + '.png'
      });
    }
    await click('.fight-heading-actions button', 'Préparation');
    assert(await page.evaluate(() => window.audioProof.media.every(x => x.media.paused)), 'Leaving combat stops voices');
    await click('.sound-settings summary');
    await click('.retro-sound-toggle', 'activés');
    await click('.sound-settings summary');
    await click('.setup-play');
    await page.waitForSelector('[data-auto-dungeon]');
    await click('[aria-label="Pause"]');
    assert(await page.evaluate(() => window.audioProof.media.every(x => x.media.paused)));
    const muteEvent = cases.find(([_, e]) => !!e)[1];
    await seek(muteEvent.i - 1);
    await sleep(1800);
    await page.evaluate(() => {
      window.audioProof.media = [];
    });
    await click('[aria-label="Action suivante"]');
    await sleep(1200);
    assert.equal(await page.evaluate(() => window.audioProof.media.length), 0);
    await click('.fight-heading-actions button', 'Préparation');
    await click('.sound-settings summary');
    await click('.retro-sound-toggle', 'coupés');
    await click('.sound-settings summary');
    await click('.tools-menu summary');
    await click('.tools-menu button', 'Personnages');
    await page.select('.retro-preview-controls label:last-child select', '1511');
    await page.waitForFunction(() => typeof document.querySelector('.retro-preview ruffle-player')?.animate === 'function');
    await page.select('.retro-preview-controls label:nth-child(2) select', 'anim2R');
    await sleep(2000);
    await page.evaluate(() => {
      window.audioProof.cues = [];
      window.audioProof.media = [];
    });
    await click('.retro-preview-controls button', 'Rejouer');
    await sleep(2200);
    const nowel = await page.evaluate(() => ({
      cues: window.audioProof.cues,
      media: window.audioProof.media.map(({
        media,
        ...x
      }) => x)
    }));
    assert(nowel.cues.some(c => c.name === 'son transformation pere noel'));
    assert(nowel.media.some(m => m.played && m.elapsed > 0 && m.peak > .00001));
    results.push({
      label: 'papa-nowel-native-transformation',
      ...nowel
    });
    console.log('CASE papa-nowel', JSON.stringify(nowel));
    const oldScope = nowel.cues[0].scope;
    await click('.tab', 'Jouer');
    await page.evaluate(() => {
      window.audioProof.media = [];
    });
    await page.evaluate(scope => window.dofusLiteSound('son transformation pere noel', scope), oldScope);
    assert.equal(await page.evaluate(() => window.audioProof.media.length), 0, 'Hidden/unmounted scene remains silent');
    fs.writeFileSync(out + '/report.json', JSON.stringify({
      results,
      errors,
      mute: true
    }, null, 2));
    assert.deepEqual(errors, []);
  } finally {
    const child = browser.process();
    await browser.disconnect();
    child?.kill('SIGTERM');
  }
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
}).finally(() => process.exit(process.exitCode || 0));
