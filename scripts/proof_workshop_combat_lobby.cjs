// Uses an isolated Chrome profile; the player's local saves stay untouched.
require('./ai_runtime.cjs');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const puppeteer = require('puppeteer-core');
const { emptyLoadout } = require('../src/engine/equipment');
const { DUNGEONS } = require('../src/engine/dungeons');
const { defaultMonsterGrade } = require('../src/engine/monsters');
const out = '/tmp/dofus-workshop-combat-lobby';
const official = DUNGEONS.find(room => room.name === 'Donjon Ensablé');
const dungeon = { id: 'sand-room', name: 'Donjon Ensablé — ma version', mapId: official.combatMapId,
  members: official.members.map(member => ({ ...member, grade: defaultMonsterGrade(member.monsterId) })) };
const second = { id: 'second-room', name: 'La clairière des Poutchs', mapId: 'dungeon_2083', members: [{ monsterId: 494, grade: 1, count: 2 }] };
const loadout = classId => ({ ...emptyLoadout(classId), level: 200, base: { force: 200 }, slots: { weapon: 2416 } });
const profile = { id: 'archer', name: 'Mon Crâ', classId: 'CRA', className: 'Crâ', customCharacterId: null, loadout: loadout('CRA') };
const allies = [{ kind: 'character', name: 'Iop des dunes', classId: 'IOP', loadout: loadout('IOP'), controller: 'ai', botId: 'cortex' }];

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, pipe: true });
  const page = await browser.newPage(), report = { checks: [], errors: [] };
  page.setDefaultTimeout(35000); page.on('pageerror', error => report.errors.push(error.message));
  const click = async (selector, text = '') => {
    await page.waitForFunction(({ selector, text }) => [...document.querySelectorAll(selector)].some(e => e.checkVisibility() && !e.disabled && e.textContent.includes(text)), {}, { selector, text });
    const handle = await page.evaluateHandle(({ selector, text }) => [...document.querySelectorAll(selector)].find(e => e.checkVisibility() && !e.disabled && e.textContent.includes(text)), { selector, text });
    await handle.asElement().click(); await handle.dispose();
  };
  const check = message => { console.log(message); report.checks.push(message); };
  const settings = () => page.evaluate(() => ({ setup: JSON.parse(localStorage.getItem('dofus-lite-player-setup-v1')),
    allies: JSON.parse(localStorage.getItem('dofus-lite-ally-team-v1')), profiles: JSON.parse(localStorage.getItem('dofus-lite-profiles-v1')) }));
  const testRoom = async name => {
    await click('.tabs > button', 'Atelier'); await click('.studio-library-card', name); await click('.studio-editor-actions button', 'Tester');
    await page.waitForSelector('.combat-choice[open]');
    assert.equal(await page.$('.studio-test-dialog'), null);
    assert.equal(await page.$('.play-route .fight-screen'), null);
    assert.equal(await page.$eval('.combat-choice-modes [aria-pressed="true"] strong', e => e.textContent), 'Donjon');
    assert(await page.$eval('.combat-choice .combat-dungeon-title', (e, name) => e.textContent.includes(name), name));
  };
  const fits = async () => assert(await page.$eval('.combat-choice[open]', e => {
    const r = e.getBoundingClientRect(), button = e.querySelector('.combat-choice-launch').getBoundingClientRect();
    return e.scrollWidth <= e.clientWidth + 1 && r.left >= 0 && r.right <= innerWidth + 1 && button.bottom <= innerHeight && button.top >= 0;
  }), 'The lobby and its launch button fit the viewport');
  try {
    await page.setViewport({ width: 1500, height: 1100 });
    await page.evaluateOnNewDocument(({ profile, allies, dungeon, second }) => {
      if (localStorage.getItem('workshop-combat-proof')) return;
      localStorage.setItem('workshop-combat-proof', '1');
      localStorage.setItem('dofus-lite-creations-v1', JSON.stringify({ version: 1, characters: [], dungeons: [dungeon, second] }));
      localStorage.setItem('dofus-lite-profiles-v1', JSON.stringify({ version: 1, activeId: profile.id, profiles: [profile] }));
      localStorage.setItem('dofus-lite-ally-team-v1', JSON.stringify({ version: 1, includePlayer: true, entries: allies }));
      localStorage.setItem('dofus-lite-player-setup-v1', JSON.stringify({ mode: 'duel', mapId: 'canyon', playerBotId: 'maison', controller: 'player' }));
      localStorage.setItem('dofus-lite-sound', JSON.stringify({ enabled: false, volume: 0 }));
    }, { profile, allies, dungeon, second });
    await page.goto('http://127.0.0.1:3013', { waitUntil: 'networkidle0' });
    const before = await settings();
    await testRoom(dungeon.name); await fits();
    assert.equal(await page.$$eval('.combat-choice .combat-team-preview.friends .combat-member', es => es.length), 2);
    assert.equal(await page.$$eval('.combat-choice .combat-team-preview.enemies .combat-member', es => es.length), 8);
    const prepared = await settings();
    assert.deepEqual(prepared.profiles, before.profiles); assert.deepEqual(prepared.allies, before.allies);
    assert.equal(prepared.setup.customDungeonId, dungeon.id); assert.equal(prepared.setup.mode, 'boss'); assert.equal(prepared.setup.mapId, 'canyon');
    await page.waitForFunction(() => [...document.querySelectorAll('.combat-choice .retro-portrait')].every(e => e.tagName !== 'IMG' || (e.complete && e.naturalWidth)));
    await page.screenshot({ path: path.join(out, 'dungeon-ready.png') });
    check('Tester opens the main combat menu on the exact custom dungeon, with its map and 8 enemies, keeping profiles and mixed manual/AI team');
    await click('.combat-choice [aria-label="Modifier mon équipe"]');
    assert.equal(await page.$eval('.combat-choice [aria-label="IA de Iop des dunes (1)"]', e => e.value), 'cortex');
    await click('.combat-choice-done');
    await click('.combat-choice-launch'); await page.waitForSelector('.placement-ready');
    assert.equal(await page.$$eval('.token.side-A', es => es.length), 2); assert.equal(await page.$$eval('.token.side-B', es => es.length), 8);
    assert(await page.$eval('.fight-heading', e => e.textContent.includes('Donjon Ensablé')));
    check('launch uses the selected room and both saved allies, including the individually selected AI');

    await click('.fight-heading-actions button', 'Préparation');
    await page.waitForSelector('.player-setup');
    if (await page.$('.combat-choice[open]')) await click('.combat-choice [aria-label="Fermer le choix du combat"]');
    await testRoom(second.name);
    assert.equal(await page.$$eval('.combat-choice .combat-team-preview.enemies .combat-member', es => es.length), 2);
    assert(await page.$eval('.combat-choice .combat-terrain', e => e.textContent.includes('Donjon des Bouftous')));
    await click('.combat-choice [aria-label="Fermer le choix du combat"]');
    await testRoom(second.name);
    check('testing another room selects its map and roster; cancelling and testing again reopens the menu');
    for (const width of [390, 320]) {
      await page.setViewport({ width, height: 844 }); await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await fits(); if (width === 390) await page.screenshot({ path: path.join(out, 'mobile.png') });
    }
    check('the shared menu and launch button remain usable at 390px and 320px');
    await page.setViewport({ width: 1500, height: 1100 });
    await click('.combat-choice .combat-control-toggle button', 'Tout en IA');
    await click('.combat-choice [aria-label="Retirer Mon Crâ de mon équipe"]');
    const aiOnly = await settings(); assert.equal(aiOnly.allies.includePlayer, false);
    await click('.combat-choice [aria-label="Fermer le choix du combat"]');
    await testRoom(second.name);
    assert.equal(await page.$$eval('.combat-choice .combat-team-preview.friends .combat-member', es => es.length), 1);
    assert.equal(await page.$eval('.combat-choice .combat-control-toggle [aria-pressed="true"]', e => e.textContent.trim()), 'Tout en IA');
    await click('.combat-choice-launch'); await page.waitForSelector('[data-auto-dungeon]', { timeout: 120000 });
    await click('.auto-result-button'); await page.waitForSelector('.auto-result[data-outcome]');
    report.result = await page.$eval('.auto-result', e => e.textContent);
    await click('.fight-heading-actions button', 'Retour à Combat');
    assert.equal((await settings()).setup.customDungeonId, second.id);
    assert.deepEqual((await settings()).allies, aiOnly.allies);
    await page.reload({ waitUntil: 'networkidle0' }); await click('.setup-play');
    assert(await page.$eval('.combat-choice .combat-dungeon-title', (e, name) => e.textContent.includes(name), second.name));
    assert.equal(await page.$$eval('.combat-choice .combat-team-preview.friends .combat-member', es => es.length), 1);
    check('AI-only test works without re-adding the removed main character; the room and team persist after reload');
    assert.deepEqual(report.errors, []);
  } catch (error) { report.failure = error.stack; await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {}); throw error; }
  finally { fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
