// Isolated browser only: does not read or change the player's saved characters.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer-core');
const out = '/tmp/ai-prompt-context-proof';
fs.mkdirSync(out, { recursive: true });

async function click(page, selector, text = '') {
  await page.waitForFunction(({ selector, text }) => [...document.querySelectorAll(selector)]
    .some(e => e.checkVisibility() && !e.disabled && e.textContent.includes(text)), {}, { selector, text });
  const handle = await page.evaluateHandle(({ selector, text }) => [...document.querySelectorAll(selector)]
    .find(e => e.checkVisibility() && !e.disabled && e.textContent.includes(text)), { selector, text });
  await handle.asElement().click(); await handle.dispose();
}
async function input(page, selector, value) {
  await page.$eval(selector, e => { e.focus(); e.select(); });
  await page.keyboard.sendCharacter(value);
}
const promptText = page => page.$eval('[aria-label="Prompt complet"]', e => e.value);
const dossier = text => JSON.parse(text.split('COMBATTANT RÉEL\n')[1].split('\nLes clés de sorts')[0]);

(async () => {
  const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, pipe: true });
  const page = await browser.newPage(), report = { checks: [], errors: [] };
  page.on('pageerror', e => report.errors.push(e.message));
  await browser.defaultBrowserContext().overridePermissions('http://127.0.0.1:3013', ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write']);
  await page.setViewport({ width: 1480, height: 1130 });
  const ok = text => { report.checks.push(text); console.log(text); };
  try {
    await page.goto('http://127.0.0.1:3013', { waitUntil: 'networkidle0' });
    await click(page, '.tabs > button', 'Studio IA');
    await click(page, '.ai-fighter-grid button', 'Osamodas');
    await click(page, '.ai-fighter-selected button', 'Créer sa stratégie');
    await click(page, '.ai-assistant-card button', 'Préparer mon prompt');
    assert((await page.$eval('.ai-prompt-context', e => e.innerText)).includes('7 invocations'));
    await click(page, '.ai-brief-example summary');
    await click(page, '.ai-brief-example button', 'Utiliser cet exemple');
    assert((await page.$eval('.ai-field textarea', e => e.value)).includes('Invocation de Tofu'));
    await click(page, '.ai-brief-example summary');
    const brief = 'Mon Osamodas doit invoquer, renforcer ses créatures et rester à distance. Soigner un allié sous 45 % de PV. Prioriser les invocateurs ennemis ; éliminer une invocation si elle menace de tuer un allié. Si le soutien est inutile, attaquer ou se replacer.';
    await input(page, '.ai-field textarea', brief);
    await click(page, '.ai-prompt-buttons button', 'Copier le prompt');
    await page.waitForFunction(() => document.querySelector('.ai-prompt-buttons button').textContent.includes('Prompt copié'));
    const copied = await page.evaluate(() => navigator.clipboard.readText()), own = dossier(copied);
    assert.equal(copied, await promptText(page)); assert(copied.includes(brief));
    assert.equal(own.classId, 'OSAMODAS'); assert.equal(own.level, 100); assert.equal(own.summons.length, 7);
    assert(own.summons.every(s => s.hp > 0 && s.spells.length));
    assert(own.spells.find(s => s.key === 'crapaud').readableEffects.some(e => e.target.includes('hors invocations')));
    fs.writeFileSync(path.join(out, 'osamodas-prompt.txt'), copied);
    await page.$eval('dialog', e => { e.scrollTop = 0; });
    await page.screenshot({ path: path.join(out, 'osamodas-desktop.png') });
    ok('Clipboard includes the written behavior, exact Osamodas spells, seven summon kits and supported graph limits.');

    for (let i = 0; i < 18; i++) { await page.keyboard.press('Tab'); assert(await page.evaluate(() => !!document.activeElement.closest('dialog'))); }
    await page.keyboard.press('Escape');
    assert(await page.$eval('.ai-assistant-card button', e => e === document.activeElement));
    await click(page, '.ai-assistant-card button');
    assert.equal(await page.$eval('.ai-field textarea', e => e.value), brief);
    await page.keyboard.press('Escape');
    await page.reload({ waitUntil: 'networkidle0' });
    await click(page, '.tabs > button', 'Studio IA'); await click(page, '.ai-assistant-card button');
    assert.equal(await page.$eval('.ai-field textarea', e => e.value), brief);
    ok('Behavior survives closing and reloading; keyboard focus stays in the dialog and returns to its opener.');

    const sample = JSON.parse(copied.split('EXEMPLE IMPORTABLE\n')[1].split('\n\nSTRATÉGIE')[0]);
    sample.name = 'Osamodas · soutien';
    await input(page, '.ai-prompt-return textarea', JSON.stringify(sample));
    await click(page, '.ai-prompt-return button', 'Vérifier et créer mon IA');
    await click(page, '.ai-document-actions button', 'Enregistrer');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('koliseum.bots.v1')));
    assert.equal(saved[0].classId, 'OSAMODAS'); assert.deepEqual(saved[0].flow, sample.graph);
    assert(saved[0].code.includes('function decide('));
    await click(page, '.ai-assistant-card button');
    assert.equal(await page.$eval('.ai-field textarea', e => e.value), brief);
    ok('The supplied example JSON imports, compiles and saves as a new Osamodas AI without losing its brief.');

    await page.setViewport({ width: 390, height: 844 });
    await page.$eval('dialog', e => { e.scrollTop = 0; });
    assert(await page.$eval('dialog', e => e.scrollWidth <= e.clientWidth + 1));
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: path.join(out, 'osamodas-mobile.png') });
    await click(page, '.ai-prompt-buttons button', 'Copier le prompt');
    assert((await page.evaluate(() => navigator.clipboard.readText())).includes(brief));
    ok('Mobile form fits 390px and its copy control remains reachable.');
    assert.deepEqual(report.errors, []);
    fs.writeFileSync(path.join(out, 'proof.json'), JSON.stringify(report, null, 2));
  } catch (error) {
    await page.screenshot({ path: path.join(out, 'failure.png'), fullPage: true });
    throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
