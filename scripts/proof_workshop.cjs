const puppeteer = require('puppeteer-core');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const out = process.env.PROOF_DIR || '/tmp/dofus-workshop';

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, pipe: true });
  const report = { errors: [] };
  let page;
  try {
    page = await browser.newPage(); page.setDefaultTimeout(30000);
    page.on('pageerror', error => report.errors.push(error.message));
    await page.setViewport({ width: 1600, height: 1050 });
    await page.evaluateOnNewDocument(() => {
      const original = URL.createObjectURL;
      URL.createObjectURL = function(blob) { window.workshopExport = blob; return original.call(this, blob); };
      Math.random = () => .000019;
    });
    const click = async (selector, text = '') => {
      const handle = await page.evaluateHandle(({ selector, text }) => [...document.querySelectorAll(selector)]
        .find(element => element.checkVisibility() && element.textContent.includes(text)), { selector, text });
      assert(handle.asElement(), `Missing ${selector}: ${text}`);
      assert(!await handle.asElement().evaluate(element => element.disabled), `Disabled ${selector}: ${text}`);
      await handle.asElement().click(); await handle.dispose();
    };
    const input = async (selector, value) => {
      await page.$eval(selector, element => { element.focus(); element.select(); });
      await page.keyboard.press('Backspace'); await page.type(selector, value);
    };
    const chooseLabel = async (label, value) => {
      const handle = await page.evaluateHandle(label => [...document.querySelectorAll('.workshop-screen label')]
        .find(element => element.checkVisibility() && element.childNodes[0]?.textContent.trim() === label)?.querySelector('select'), label);
      assert(handle.asElement(), `Missing select ${label}`); await handle.asElement().select(value); await handle.dispose();
    };
    const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('dofus-lite-creations-v1')));
    const exportFight = async () => {
      if (!await page.$('.fight-log')) await click('.fight-heading-actions button', 'Journal');
      await click('.fight-log .combat-log-heading button', 'Exporter');
      return page.evaluate(async () => JSON.parse(await window.workshopExport.text()));
    };
    await page.goto(process.env.PROOF_URL || 'http://127.0.0.1:3013', { waitUntil: 'networkidle0' });
    const originalDraft = await page.evaluate(() => localStorage.getItem('dofus-lite-loadouts-v1'));
    await click('.tabs > button', 'Atelier');
    await click('.creator-tabs button', 'Mes classes');
    await click('.creator-library-strip button', 'Nouvelle classe');
    assert.equal((await saved()).characters[0].loadout.spells.custom.length, 0);
    await input('.creator-name-row input', 'Chimère des donjons');
    await chooseLabel('Modèle du personnage', 'CRA');
    await chooseLabel('Apparence', '1');
    for (const [query, id] of [['Fureur', 305], ['Morsure du Bouftou', 202], ['Invocation d’Arakne', 214]]) {
      await input('[aria-label="Rechercher dans tous les sorts"]', query);
      await click(`.creator-spell-results [aria-label$="(${id})"]`, '+ Ajouter');
    }
    const character = (await saved()).characters[0];
    assert.equal(character.classId, 'CRA');
    assert.equal(character.loadout.profile.sex, 1);
    for (const id of [305, 202, 214]) assert(character.loadout.spells.custom.some(spell => spell.id === id));
    await input('[aria-label="Rechercher dans tous les sorts"]', '');
    const extraSpells = await page.$$eval('.creator-spell-results .creator-spell-facts button:not(:disabled)', buttons => buttons.slice(0, 7).map(button => ({
      label: button.getAttribute('aria-label'), name: button.closest('article').querySelector('strong').textContent,
    })));
    for (const spell of extraSpells) await click(`[aria-label=${JSON.stringify(spell.label)}]`);
    assert.equal((await saved()).characters[0].loadout.spells.custom.length, 10);
    assert.equal(await page.$$eval('.creator-spell-results .creator-spell-facts button:not(:disabled)', buttons => buttons.length), 0);
    await page.$eval('.creator-name-row', element => element.scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: path.join(out, 'named-class-ten-spells.png') });
    report.spellLimit = { maximum: 10, additionsDisabled: true, emptyAtCreation: true };
    for (const spell of extraSpells) await click(`[aria-label=${JSON.stringify(`Retirer ${spell.name}`)}]`);
    assert.deepEqual((await saved()).characters[0], character);
    await input('[aria-label="Rechercher dans tous les sorts"]', 'Furie');
    await chooseLabel('Type de sort', 'boost');
    assert(await page.$('.creator-spell-results [aria-label$="(447)"]'));
    await chooseLabel('Type de sort', 'damage');
    assert(await page.$('.creator-spell-results [aria-label$="(447)"]'));
    await click('.creator-filters button', 'Réinitialiser');
    await chooseLabel('Origine', 'monster');
    await chooseLabel('Classe ou monstre', 'monster:147');
    await chooseLabel('Trier par', 'action');
    await chooseLabel('Trier par', 'element');
    await page.$eval('.custom-spell-picker', element => element.scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: path.join(out, 'spell-catalogue.png') });
    report.customCharacter = { name: character.name, classId: character.classId, spellCount: character.loadout.spells.custom.length };
    await click('.creator-tabs button', 'Mes donjons');
    await click('.creator-library-strip button', 'Nouveau donjon');
    await input('.creator-name-row input', 'Mon laboratoire royal');
    await page.select('.workshop-screen [aria-label="Carte de combat"]', 'dungeon_2083');
    const dragMonster = async id => {
      await page.$eval('.creator-dungeon-layout', element => element.scrollIntoView({ block: 'start' }));
      const source = await page.$(`.creator-monster-card[data-monster-id="${id}"] .creator-monster-heading`);
      const sourceBox = await source.boundingBox();
      const targetBox = await (await page.$('.creator-roster-dropzone')).boundingBox();
      assert(sourceBox && targetBox, 'Drag source and roster are visible');
      await page.setDragInterception(true);
      await page.mouse.dragAndDrop({ x: sourceBox.x + 90, y: sourceBox.y + 20 },
        { x: targetBox.x + targetBox.width / 2, y: targetBox.y + 60 }, { delay: 150 });
      await page.setDragInterception(false);
    };
    await input('.creator-monster-filters input[type="search"]', 'Bouftou Royal');
    await dragMonster(147);
    assert.equal((await saved()).dungeons[0].members[0].monsterId, 147);
    await input('.creator-monster-filters input[type="search"]', 'Poutch');
    await page.select('[aria-label="Niveau proposé pour Poutch Ingball"]', '1');
    await dragMonster(494);
    await dragMonster(494);
    assert.deepEqual((await saved()).dungeons[0].members[1], { monsterId: 494, grade: 1, count: 2 });
    report.dragAndDrop = { realMouseDrag: true, mixedMonsters: [147, 494], chosenGrade: 1, duplicateCount: 2 };
    await input('.creator-monster-filters input[type="search"]', '');
    await page.$eval('.creator-dungeon-layout', element => element.scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: path.join(out, 'dungeon-drag-and-drop.png') });
    await click('[aria-label="Moins de Poutch Ingball"]');
    await chooseLabel('Votre personnage', character.id);
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: path.join(out, 'dungeon.png') });
    let creations = await saved();
    assert.equal(creations.dungeons[0].mapId, 'dungeon_2083');
    assert.deepEqual(creations.dungeons[0].members.map(member => member.monsterId), [147, 494]);
    await page.reload({ waitUntil: 'networkidle0' });
    await click('.tabs > button', 'Atelier');
    assert.deepEqual(await saved(), creations);
    await chooseLabel('Votre personnage', character.id);
    await click('.creator-launch button', 'Jouer cette création');
    await page.waitForSelector('.placement-ready');
    const initial = await exportFight();
    assert.equal(initial.state.mapId, 'dungeon_2083');
    assert.equal(Object.keys(initial.state.fighters).length, 3);
    assert.equal(initial.state.fighters.A.name, character.name);
    assert.deepEqual(initial.state.fighters.A.loadout.spells.custom.map(spell => spell.id), character.loadout.spells.custom.map(spell => spell.id));
    await click('.placement-ready');
    await page.waitForSelector('.spell-slot[data-spell-id="305"] button:not(:disabled)');
    await click('.spell-slot[data-spell-id="305"] button');
    await click('.spell-slot[data-spell-id="214"] button');
    await page.waitForSelector('.cell.hl-target');
    const target = await page.$('.cell.hl-target');
    await target.click();
    const battle = await exportFight();
    assert(battle.events.some(event => event.t === 'cast' && event.spellId === 305));
    assert(battle.events.some(event => event.t === 'summon_add' && event.fighter === 'A'));
    assert(Object.values(battle.state.fighters).some(fighter => fighter.isMonster && fighter.isSummon && fighter.team === 'A'));
    assert(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: path.join(out, 'manual-combat.png') });
    report.manualCombat = { map: initial.state.mapId, opponents: 2, monsterSpellCast: true, monsterSummoned: true };
    await click('.fight-heading-actions button', 'Abandonner');
    await page.waitForSelector('.workshop-screen');
    // A small, deterministic custom room to exercise the full automatic result.
    await click('.creator-roster-row [aria-label="Retirer Bouftou Royal"]');
    await page.select('.workshop-screen [aria-label="Carte de combat"]', 'arene');
    await click('.creator-launch button', 'Tester avec l’IA');
    await page.waitForSelector('[data-auto-dungeon]', { timeout: 120000 });
    await click('.auto-result-button');
    await page.waitForSelector('[data-outcome]');
    const result = await exportFight();
    assert.equal(result.state.mapId, 'arene');
    assert.equal(result.state.over, true);
    assert.equal(result.state.winner, 'A');
    assert.equal(result.state.endReason, 'ko');
    assert.deepEqual(result.events.filter(event => event.t === 'bot_error'), []);
    report.automatic = { winner: result.state.winner, turns: result.state.turn, spells: result.events.filter(event => event.t === 'cast' && event.fighter === 'A').map(event => event.spell) };
    await page.screenshot({ path: path.join(out, 'auto-result.png') });
    await click('.fight-heading-actions button', 'Retour à l’atelier');
    assert.equal(await page.evaluate(() => localStorage.getItem('dofus-lite-loadouts-v1')), originalDraft);
    await click('.tabs > button', 'IA contre IA');
    await page.select('[aria-label="Personnage personnalisé A"]', character.id);
    await page.select('[aria-label="Personnage personnalisé B"]', character.id);
    await page.select('[aria-label="Niveau B"]', '100');
    assert.equal(await page.$eval('[aria-label="Niveau A"]', element => element.value), '200');
    assert.deepEqual((await saved()).characters[0], character);
    report.independentArenaCopies = true;
    await page.screenshot({ path: path.join(out, 'custom-duel.png') });
    await click('.tabs > button', 'Atelier');
    await page.setViewport({ width: 390, height: 844 });
    await page.evaluate(() => scrollTo(0, 0));
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile horizontal overflow');
    assert(await page.$eval('.creator-library-strip select', element => element.getBoundingClientRect().width >= 300), 'Readable mobile creation selector');
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
