// Exercise editing and persistence in a disposable browser, using a supplied
// local profile snapshot or a standalone reproduction. Never changes user saves.
require('./ai_runtime.cjs');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer-core');
const { newAuthoredSpell, newAuthoredEffect, normalizeAuthoredSpell } = require('../src/engine/authoredSpells');
const { emptyLoadout } = require('../src/engine/equipment');
const { spellbookBalance } = require('../src/engine/spellBalance');
const out = process.env.PROOF_DIR || '/tmp/dofus-spell-balance/proof';
const raw = normalizeAuthoredSpell({ ...newAuthoredSpell(), name: 'Argent russe', pa: 1, rangeMax: 12,
  needsLos: false, adjustableRange: true, targetMode: 'cell', maxPerTurn: 3, maxPerTarget: 3, critRate: 2,
  effects: [{ ...newAuthoredEffect('lifeSteal'), min: 149, max: 150, zone: 'Cc' },
    ...Array.from({ length: 3 }, () => ({ ...newAuthoredEffect(), min: 149, max: 150 }))], critEffects: [newAuthoredEffect()] });
const profile = process.argv[2] ? JSON.parse(fs.readFileSync(process.argv[2])) : {
  name: 'Hoty', classId: 'IOP', loadout: { ...emptyLoadout('IOP'), level: 200, spells: { custom: [raw] } },
};
const character = { ...profile, id: 'budget-proof' };
delete character.loadout.artworkId;

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, pipe: true });
  const report = { errors: [] };
  try {
    const page = await browser.newPage(); page.setDefaultTimeout(30000);
    await page.setViewport({ width: 1780, height: 1120 });
    page.on('pageerror', error => report.errors.push(error.message));
    await page.evaluateOnNewDocument(character => {
      if (!localStorage.getItem('budget-proof-seeded')) {
        localStorage.setItem('dofus-lite-creations-v1', JSON.stringify({ version: 1, characters: [character], dungeons: [] }));
        localStorage.setItem('budget-proof-seeded', 'true');
      }
    }, character);
    const click = async (selector, text = '') => {
      const handle = await page.evaluateHandle(({ selector, text }) => [...document.querySelectorAll(selector)]
        .find(e => e.checkVisibility() && e.textContent.includes(text)), { selector, text });
      assert(handle.asElement(), `Missing ${selector} / ${text}`);
      await handle.asElement().click(); await handle.dispose();
    };
    const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('dofus-lite-creations-v1')).characters[0]);
    const workshop = async () => { await click('.tabs > button', 'Atelier'); await click('.creator-tabs button', 'Mes classes'); };
    await page.goto(process.env.PROOF_URL || 'http://127.0.0.1:3013', { waitUntil: 'networkidle0' });
    await workshop();
    assert.deepEqual((await saved()).loadout.spells, character.loadout.spells);
    await click('[aria-label="Modifier Argent russe"]');
    assert(await page.$eval('.spell-designer button[type="submit"]', b => b.disabled));
    assert((await page.$eval('.spell-designer-errors', e => e.textContent)).includes('critique'));
    await page.$eval('.spell-designer', e => e.scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: path.join(out, 'before.png') });
    report.before = spellbookBalance((await saved()).loadout.spells.custom);
    await click('.spell-designer button', 'Rééquilibrer les valeurs');
    assert.deepEqual((await saved()).loadout.spells, character.loadout.spells, 'Repair is only a draft until saved');
    assert(!await page.$eval('.spell-designer button[type="submit"]', b => b.disabled));
    await click('.spell-designer button[type="submit"]');
    report.repaired = (await saved()).loadout.spells.custom.find(s => s.name === 'Argent russe');
    assert.equal(report.repaired.effects.length, report.repaired.critEffects.length);
    // This observed profile also contains two unrestricted boss spells.
    // Remove them through the UI in the disposable copy to verify kit admission.
    for (const name of ['Captation Explosive', 'Brûlure Céleste']) {
      if (await page.$(`[aria-label="Retirer ${name}"]`)) await click(`[aria-label="Retirer ${name}"]`);
    }
    report.after = spellbookBalance((await saved()).loadout.spells.custom);
    assert(report.after.valid);
    const expected = await saved();
    await page.reload({ waitUntil: 'networkidle0' }); await workshop();
    assert.deepEqual(await saved(), expected);
    await click('[aria-label="Modifier Argent russe"]');
    await page.$eval('.spell-designer', e => e.scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: path.join(out, 'after.png') });
    await page.setViewport({ width: 390, height: 844 });
    await page.$eval('.spell-designer-review', e => e.scrollIntoView({ block: 'start' }));
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Horizontal overflow');
    await page.screenshot({ path: path.join(out, 'mobile.png') });
    assert.deepEqual(report.errors, []);
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ before: report.before.score, after: report.after.score, repairedCost: report.repaired.pa,
      reload: true, mobile: true, errors: report.errors, screenshots: out }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
