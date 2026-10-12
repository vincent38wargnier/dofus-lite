// A real, deterministic fight in an isolated browser profile; no player saves are changed.
require('./ai_runtime.cjs');
const puppeteer = require('puppeteer-core');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { emptyLoadout } = require('../src/engine/equipment');
const { CREATION_SPELLS_BY_ID } = require('../src/ui/creationCatalogue');
const { runMatch } = require('../src/arena/runner');
const out = '/tmp/dofus-caster-death';

function decide(v, a) {
  const target = v.enemies.find(f => f.id === 'B' && f.hp > 0);
  if (v.you.id === 'B') {
    if (a.dist(v.you.pos, v.enemy.pos) <= 4 && a.canCast('maladresse', v.enemy.pos).ok) return a.cast('maladresse', v.enemy.pos);
    return a.endTurn();
  }
  if (v.you.id !== 'A' || !target) return a.endTurn();
  if (v.you.effects.some(e => e.source === 'B' && e.stat === 'pm') && a.canCast('tempete_de_puissance', target.pos).ok) {
    return a.cast('tempete_de_puissance', target.pos);
  }
  const distance = a.dist(v.you.pos, target.pos);
  if (distance > 4) {
    const cells = a.reachable().filter(c => a.dist(c.pos, target.pos) >= 3)
      .sort((x, y) => a.dist(x.pos, target.pos) - a.dist(y.pos, target.pos));
    if (cells[0] && a.dist(cells[0].pos, target.pos) < distance) return a.move(cells[0].pos);
  }
  return a.endTurn();
}

const profile = { id: 'proof-iop', name: 'Iop · contrôle des malus', classId: 'IOP', className: 'Iop',
  loadout: { ...emptyLoadout('IOP'), level: 200, base: { intelligence: 190 }, slots: { ring1: 2469 } } };
const opponents = [
  { kind: 'character', name: 'Enutrof · Maladresse', classId: 'ENUTROF', loadout: {
    ...emptyLoadout('ENUTROF'), base: {}, level: 1, spells: { custom: [CREATION_SPELLS_BY_ID[50].grades.at(-1)] },
  } },
  { kind: 'character', name: 'Autre adversaire', classId: 'ENUTROF', loadout: { ...emptyLoadout('ENUTROF'), base: {} } },
];

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const simulation = runMatch({ mode: 'duel', mapId: 'arene', seed: 7, classes: { A: 'IOP' },
    loadouts: { A: profile.loadout }, opponents, bots: { A: { name: profile.name, decide }, B: { name: 'Contrôle', decide } } });
  assert(simulation.events.some(e => e.t === 'effect_end' && e.reason === 'caster_death' && e.fighter === 'A'));
  const bot = { id: 'caster-death-proof', name: 'Contrôle des malus', custom: true, code: decide.toString() };
  const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, pipe: true });
  const report = { errors: [] };
  try {
    const page = await browser.newPage(); page.setDefaultTimeout(30000);
    await page.setViewport({ width: 1440, height: 1000 });
    page.on('pageerror', error => report.errors.push(error.message));
    await page.evaluateOnNewDocument(({ profile, opponents, bot }) => {
      localStorage.setItem('dofus-lite-profiles-v1', JSON.stringify({ version: 1, activeId: profile.id, profiles: [profile] }));
      localStorage.setItem('dofus-lite-opponent-team-v1', JSON.stringify({ version: 1, entries: opponents }));
      localStorage.setItem('koliseum.bots.v1', JSON.stringify([bot]));
      localStorage.setItem('dofus-lite-player-setup-v1', JSON.stringify({ mode: 'duel', controller: 'ai', mapId: 'arene', botId: bot.id, playerBotId: bot.id }));
      localStorage.setItem('dofus-lite-tactical-mode-v1', 'true');
      Math.random = () => .000000007;
    }, { profile, opponents, bot });
    await page.goto(process.env.PROOF_URL || 'http://127.0.0.1:3013', { waitUntil: 'networkidle0' });
    await page.click('.setup-play'); await page.click('.combat-choice-launch');
    await page.waitForSelector('[data-auto-dungeon]', { timeout: 120000 });
    await page.click('[aria-label="Pause"]');
    report.fight = await page.evaluate(() => {
      const root = document.querySelector('[data-auto-dungeon]');
      let fiber = root[Object.keys(root).find(key => key.startsWith('__reactFiber$'))], result;
      for (; fiber && !result; fiber = fiber.return) for (let hook = fiber.memoizedState; hook; hook = hook.next) {
        if (hook.memoizedState?.frames?.length && hook.memoizedState?.finalState) { result = hook.memoizedState; break; }
      }
      if (!result) throw new Error('Replay introuvable');
      const index = result.frames.findIndex(frame => frame.events.some(event => event.t === 'death' && event.fighter === 'B'));
      const before = result.frames[index - 1].state.fighters.A, after = result.frames[index].state.fighters.A;
      return { index, before: { pa: before.pa, pm: before.pm, effects: before.effects },
        after: { pa: after.pa, pm: after.pm, effects: after.effects }, events: result.frames[index].events,
        botErrors: result.events.filter(event => ['bot_error', 'invalid'].includes(event.t)) };
    });
    const seek = async index => {
      await page.$eval('[aria-label="Avancement du combat"]', (element, index) => {
        const props = element[Object.keys(element).find(key => key.startsWith('__reactProps$'))];
        props.onChange({ target: { value: String(index) } });
      }, index);
      await page.waitForFunction(index => Number(document.querySelector('[data-replay-frame]').dataset.replayFrame) === index, {}, index);
      await page.mouse.move(15, 15); await page.keyboard.press('Escape');
    };
    assert(report.fight.before.effects.some(e => e.source === 'B' && e.stat === 'pm'));
    assert(!report.fight.after.effects.some(e => e.source === 'B'));
    assert(report.fight.after.pm > report.fight.before.pm);
    assert.equal(report.fight.after.pa, report.fight.before.pa - 3);
    assert.deepEqual(report.fight.botErrors, []);
    await seek(report.fight.index - 1);
    await page.waitForFunction(() => document.querySelector('.dock-stat-content').textContent.includes('Maladresse'));
    await page.screenshot({ path: path.join(out, 'before.png') });
    await seek(report.fight.index);
    await page.waitForFunction(() => document.querySelector('.dock-stat-content').textContent.includes('Aucun effet temporaire.'));
    assert.equal(await page.$eval('.dock-points .pm', e => parseInt(e.textContent, 10)), report.fight.after.pm);
    await page.screenshot({ path: path.join(out, 'after.png') });
    assert.deepEqual(report.errors, []);
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
