require('./ai_runtime.cjs');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const puppeteer = require('puppeteer-core');
const { emptyLoadout, equipSet, ITEMS, rolledEffects, resolveLoadout } = require('../src/engine/equipment');
const { createForgedItem, replaceEquipment, validateForgedItem } = require('../src/engine/forgedItems');
const { newCustomEquipment, validateCustomEquipment } = require('../src/engine/customEquipment');
const { equipmentSnapshot } = require('../src/ui/loadoutStore');
const out = process.env.PROOF_DIR || '/tmp/dofus-equipment-collection';
const seed = { ...emptyLoadout('CRA'), level: 200, base: { intelligence: 200 }, spells: { common: [350], order: [350] } };
const mage = (loadout, slot, stat, amount = 1) => {
  const next = JSON.parse(JSON.stringify(loadout)), item = ITEMS[next.slots[slot]];
  const forge = createForgedItem(item, rolledEffects(item, loadout, slot), 67);
  forge.stats[stat] = (forge.stats[stat] || 0) + amount;
  assert.equal(validateForgedItem(item, forge), '');
  return { ...next, forgedItems: { ...next.forgedItems, [slot]: forge } };
};
const feu = mage(replaceEquipment(equipSet(seed, 66), 'ring2', 2469), 'hat', 'intelligence');
const air = mage({ ...seed, slots: { hat: 7143, ring1: 2469, ring2: 8271, cape: 8866 } }, 'ring1', 'pm');
const other = mage({ ...emptyLoadout('IOP'), level: 200, slots: { hat: 7143 } }, 'hat', 'pa');
const profiles = [{ id: 'cra', name: 'Crâ feu', classId: 'CRA', className: 'Crâ', loadout: feu },
  { id: 'iop', name: 'Iop terre', classId: 'IOP', className: 'Iop', loadout: other }];
const definitions = [{ ...newCustomEquipment(7143), id: 1000000801, name: 'Couronne astrale', level: 200, stats: { vitalite: 100, intelligence: 30 }, appearance: { shape: 'crown', color: '#8964cf' } },
  { ...newCustomEquipment(2469), id: 1000000802, name: 'Sceau des marées', level: 200, stats: { vitalite: 100 }, appearance: { shape: 'crystal', color: '#378bc2' } }];
// Use a supported custom silhouette if the local palette has changed.
definitions.forEach(def => { if (!validateCustomEquipment(def).valid) def.appearance = newCustomEquipment(def.referenceId).appearance; assert(validateCustomEquipment(def).valid); });
const library = { version: 1, active: { 'A:cra': 'feu' }, builds: [
  ['feu', 'Feu · Chêne Mou', feu], ['terre', 'Terre · Meulou', equipSet(seed, 55)], ['air', 'Air · Critiques', air], ['royal', 'Bouftou Royal', equipSet(seed, 4)],
].map(([id, name, loadout], i) => ({ id, name, createdAt: i + 1, updatedAt: i + 1, loadout: { version: 1, base: {}, ...equipmentSnapshot(loadout) } })) };

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, pipe: true });
  const page = await browser.newPage(), report = { errors: [], checks: [] };
  page.setDefaultTimeout(25000); page.on('pageerror', error => report.errors.push(error.message));
  const click = async (selector, text = '') => {
    await page.waitForFunction(({ selector, text }) => [...document.querySelectorAll(selector)].some(e => e.checkVisibility() && e.textContent.includes(text) && !e.disabled), {}, { selector, text });
    const node = await page.evaluateHandle(({ selector, text }) => [...document.querySelectorAll(selector)].find(e => e.checkVisibility() && e.textContent.includes(text) && !e.disabled), { selector, text });
    await node.asElement().click(); await node.dispose();
  };
  const current = () => page.evaluate(() => { const s = JSON.parse(localStorage.getItem('dofus-lite-profiles-v1')); return s.profiles.find(p => p.id === s.activeId); });
  const check = label => { report.checks.push(label); console.log(label); };
  const drag = async (from, to) => {
    await page.evaluate(({ from, to }) => {
      const source = document.querySelector(from), target = document.querySelector(to), dataTransfer = new DataTransfer();
      source.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer }));
      target.dispatchEvent(new DragEvent('dragover', { bubbles: true, dataTransfer }));
      target.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer }));
      source.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer }));
    }, { from, to });
  };
  const capture = async name => {
    await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, document.querySelector('.setup-navigation').getBoundingClientRect().top + window.scrollY - 16); });
    await page.screenshot({ path: path.join(out, `${name}.png`) });
  };
  try {
    await page.setViewport({ width: 1480, height: 1080 });
    await page.evaluateOnNewDocument(({ profiles, library, definitions }) => {
      if (localStorage.getItem('equipment-collection-proof')) return;
      localStorage.setItem('equipment-collection-proof', '1');
      localStorage.setItem('dofus-lite-profiles-v1', JSON.stringify({ version: 1, profiles, activeId: 'cra' }));
      localStorage.setItem('dofus-lite-stuff-library-v1', JSON.stringify(library));
      localStorage.setItem('dofus-lite-custom-equipment-v1', JSON.stringify({ version: 1, items: definitions }));
      localStorage.setItem('dofus-lite-sound', JSON.stringify({ enabled: false, volume: 0 }));
    }, { profiles, library, definitions });
    await page.goto(process.env.PROOF_URL || 'http://127.0.0.1:3013', { waitUntil: 'networkidle0' });
    await page.waitForSelector('[data-stuff-id="feu"]');
    assert.equal(await page.$('[aria-label="Charger un stuff"]'), null);
    assert.equal(await page.$$eval('.stuff-shortcut', es => es.length), 4);
    assert.equal(await page.$$eval('[data-personal-item]', es => es.length), 5);
    assert.equal(await page.$('.equipment-origin-filter'), null);
    check('four visible stuff icon shortcuts; created items and FM snapshots from other profiles and stuffs have their own shelf');
    await click('[data-stuff-id="terre"]');
    await page.waitForFunction(() => document.querySelector('[data-stuff-id="terre"]').getAttribute('aria-pressed') === 'true');
    assert.deepEqual((await current()).loadout.base, feu.base);
    assert.deepEqual((await current()).loadout.spells, feu.spells);
    await click('.stuff-notice button', 'Annuler l’action');
    assert.deepEqual((await current()).loadout, feu);
    check('one-click stuff loading and undo preserve character, level, base characteristics and spells');
    const ring = '[data-personal-item="2469"]';
    await click(ring);
    assert(await page.$eval('.equipment-inspector .equipment-effects', e => e.textContent.includes('+1 PM')));
    await drag(ring, '[data-slot="ring2"]');
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('dofus-lite-profiles-v1')).profiles[0].loadout.forgedItems?.ring2?.stats.pm === 1);
    assert.deepEqual((await current()).loadout.forgedItems.ring2, air.forgedItems.ring1);
    await click('[data-slot="ring2"]'); await click('.equipment-remove', 'Retirer');
    assert.equal((await current()).loadout.slots.ring2, null);
    await page.reload({ waitUntil: 'networkidle0' });
    await click(ring); await click('.equipment-equip');
    const afterRing = await current();
    const ringSlot = Object.keys(afterRing.loadout.forgedItems).find(slot => afterRing.loadout.forgedItems[slot].itemId === 2469);
    assert.deepEqual(afterRing.loadout.forgedItems[ringSlot], air.forgedItems.ring1);
    assert.equal(resolveLoadout('CRA', afterRing.loadout).valid, true);
    check('FM drag, removal, reload and click-to-equip retain the exact exo, original rolls and forge history');
    await drag('[data-personal-item="1000000801"]', '[data-slot="hat"]');
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('dofus-lite-profiles-v1')).profiles[0].loadout.slots.hat === 1000000801);
    assert.deepEqual((await current()).loadout.customEquipment[1000000801], definitions[0]);
    const originalLibrary = await page.evaluate(() => JSON.parse(localStorage.getItem('dofus-lite-stuff-library-v1')));
    assert.deepEqual(originalLibrary.builds, library.builds);
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('dofus-lite-profiles-v1')).profiles[1].loadout), other);
    check('custom item drag equips its own saved definition without altering saved stuffs or other characters');
    await click('[data-stuff-id="feu"]');
    await click('[data-slot="hat"]');
    await click('[role="tab"]', 'Forgemagie');
    await click('[aria-label="Succès critique garanti"]');
    await click('.fm-rune-grid button', 'Ga Pme');
    await click('.fm-fuse');
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('dofus-lite-profiles-v1')).profiles[0].loadout.forgedItems.hat.stats.pm === 1);
    await click('[role="tab"]', 'Inventaire');
    await page.waitForFunction(() => [...document.querySelectorAll('[data-personal-item="8474"]')].some(e => e.textContent.includes('+1 PM')));
    assert.equal(await page.$$eval('[data-personal-item="8474"]', es => es.length), 2);
    check('a new fusion appears automatically; the current jet and the intentionally saved old variant stay distinct');
    await capture('desktop-collections');
    for (const width of [900, 390, 320]) {
      await page.setViewport({ width, height: 980 });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `horizontal overflow at ${width}`);
      await page.$eval('.personal-equipment', e => e.scrollIntoView({ block: 'start' }));
      assert(await page.$eval('.personal-equipment-grid', e => e.scrollWidth <= e.clientWidth + 1));
      await click(ring);
      if (width === 390) {
        await page.$eval('.personal-equipment', e => e.scrollIntoView({ block: 'start' }));
        await page.evaluate(() => window.scrollBy(0, -document.querySelector('.setup-navigation').getBoundingClientRect().height - 10));
        await page.screenshot({ path: path.join(out, 'mobile-collections.png') });
      }
    }
    check('stuff and personal-equipment shelves remain accessible at tablet, 390px and 320px widths without horizontal scrolling');
    assert.deepEqual(report.errors, []);
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
  } catch (error) { await page.screenshot({ path: path.join(out, 'failure.png') }); throw error; }
  finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
