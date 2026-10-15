// Full isolated download -> external edit/test -> reimport round trip.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const puppeteer = require('puppeteer-core');
const exec = promisify(execFile), out = '/tmp/ai-coding-proof';
fs.mkdirSync(path.join(out, 'downloads'), { recursive: true });
const report = { checks: [], errors: [] };
const ok = message => { report.checks.push(message); console.log(message); };
async function click(page, selector, text = '') {
  await page.waitForFunction(({ selector, text }) => [...document.querySelectorAll(selector)]
    .some(e => e.checkVisibility() && !e.disabled && e.textContent.includes(text)), {}, { selector, text });
  const h = await page.evaluateHandle(({ selector, text }) => [...document.querySelectorAll(selector)]
    .find(e => e.checkVisibility() && !e.disabled && e.textContent.includes(text)), { selector, text });
  await h.asElement().click(); await h.dispose();
}
async function input(page, selector, value) { await page.$eval(selector, e => { e.focus(); e.select(); }); await page.keyboard.sendCharacter(value); }
async function cli(dir, args) {
  const { stdout } = await exec(process.execPath, ['test.cjs', ...args], { cwd: dir, timeout: 240000, maxBuffer: 2 * 1024 * 1024, env: { ...process.env, NODE_OPTIONS: '', NODE_PATH: '' } });
  return JSON.parse(stdout);
}
(async () => {
  const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, pipe: true });
  const page = await browser.newPage(); page.on('pageerror', e => report.errors.push(e.message));
  await browser.defaultBrowserContext().overridePermissions('http://127.0.0.1:3013', ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write']);
  await page.setViewport({ width: 1480, height: 1130 });
  const cdp = await page.createCDPSession();
  await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: path.join(out, 'downloads') });
  try {
    await page.goto('http://127.0.0.1:3013', { waitUntil: 'networkidle0' });
    await click(page, '.tabs > button', 'Studio IA'); await click(page, '.ai-fighter-grid button', 'Osamodas');
    await click(page, '.ai-fighter-selected button', 'Créer sa stratégie');
    await input(page, '[aria-label="Nom de l’IA"]', 'Osamodas soutien');
    await click(page, '.ai-document-actions button', 'Enregistrer');
    const before = await page.evaluate(() => JSON.parse(localStorage.getItem('koliseum.bots.v1')));
    await click(page, '.ai-heading-actions button', 'Code & fichiers');
    await input(page, '.ai-code-dialog .ai-field textarea', 'Renforcer mes invocations, soigner sous 35 % de PV et garder mes distances. Prioriser les invocateurs ennemis.');
    await click(page, '.ai-code-dialog button', 'Copier la consigne');
    await page.waitForFunction(() => document.querySelector('.ai-code-dialog').innerText.includes('Prompt copié'));
    const prompt = await page.evaluate(() => navigator.clipboard.readText()); assert(prompt.includes('35 %')); assert(prompt.includes('fighter-reference.json'));
    const zip = path.join(out, 'downloads', 'Osamodas-soutien-code.zip'); if (fs.existsSync(zip)) fs.unlinkSync(zip);
    await click(page, '.ai-code-dialog button', 'Télécharger le projet');
    await page.waitForFunction(() => document.querySelector('.ai-code-dialog [role=status]')?.textContent.includes('ZIP préparé'));
    for (let i = 0; i < 200 && !fs.existsSync(zip); i++) await new Promise(r => setTimeout(r, 100));
    assert(fs.existsSync(zip));
    const folder = fs.mkdtempSync(path.join(out, 'extracted-'));
    await exec('python3', ['-c', 'import zipfile,sys; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])', zip, folder]);
    const reference = JSON.parse(fs.readFileSync(path.join(folder, 'fighter-reference.json'), 'utf8'));
    assert.equal(reference.classId, 'OSAMODAS'); assert.equal(reference.summons.length, 7);
    assert(fs.existsSync(path.join(folder, 'engine-source/src/bots/utilityBrain.js')));
    assert(fs.readFileSync(path.join(folder, 'PROMPT.md'), 'utf8').includes('35 %'));
    await page.$eval('dialog', e => { e.scrollTop = 0; });
    await page.screenshot({ path: path.join(out, 'code-files-desktop.png') });
    ok('Downloaded project includes selected Osamodas, seven summon kits, generated code, editable prompt and readable sources.');

    for (let i = 0; i < 20; i++) { await page.keyboard.press('Tab'); assert(await page.evaluate(() => !!document.activeElement.closest('dialog'))); }
    await page.keyboard.press('Escape');
    assert((await page.evaluate(() => document.activeElement.textContent)).includes('Code & fichiers'));
    await click(page, '.ai-heading-actions button', 'Code & fichiers');
    assert((await page.$eval('.ai-code-dialog .ai-field textarea', e => e.value)).includes('35 %'));
    await page.setViewport({ width: 390, height: 844 }); await page.$eval('dialog', e => { e.scrollTop = 0; });
    assert(await page.$eval('dialog', e => e.scrollWidth <= e.clientWidth + 1));
    await page.screenshot({ path: path.join(out, 'code-files-mobile.png') });
    await click(page, '.ai-code-dialog button', 'Copier la consigne');
    assert((await page.evaluate(() => navigator.clipboard.readText())).includes('35 %'));
    await page.keyboard.press('Escape'); await page.setViewport({ width: 1480, height: 1130 });
    ok('Desktop/mobile layout, keyboard focus, copy controls and saved behavioral brief pass.');

    const initial = await cli(folder, ['check', 'bot.js']); assert.equal(initial.ok, true);
    fs.copyFileSync(path.join(folder, 'bot.js'), path.join(folder, 'baseline.js'));
    const edited = `// Edited outside the game: protect the invoker when hurt.\nfunction decide(view, api) {\n  if (view.you.hp < view.you.maxHp * 0.35) {\n    const healing = api.plan({kind:'heal',base:'maison',weights:{}});\n    if (healing.type !== 'PASS') return healing;\n  }\n  return api.maison();\n}\n`;
    fs.writeFileSync(path.join(folder, 'bot.js'), edited);
    const checked = await cli(folder, ['check', 'bot.js']); assert.equal(checked.ok, true);
    ok('Downloaded runtime validates original and externally edited bot.js outside the repository, without npm.');
    const benchmark = await cli(folder, ['benchmark', 'bot.js', '--against', 'maison', '--seed', '12000', '--report', 'results.json']);
    assert.equal(benchmark.ok, true); assert.equal(benchmark.comparisonValid, true); assert.equal(benchmark.games.length, 6);
    report.benchmark = benchmark.summary;
    fs.copyFileSync(path.join(folder, 'results.json'), path.join(out, 'external-results.json'));
    ok(`Six real mirrored Osamodas duels completed: ${JSON.stringify(benchmark.summary)}`);

    const upload = await page.$('[aria-label="Importer une IA visuelle ou JavaScript"]');
    await upload.uploadFile(path.join(folder, 'bot.js'));
    await page.waitForSelector('[aria-label="Code de l’IA"]');
    assert.equal(await page.$eval('[aria-label="Code de l’IA"]', e => e.value), edited);
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('koliseum.bots.v1'))), before);
    await input(page, '[aria-label="Nom de l’IA"]', 'Osamodas · code externe');
    await click(page, '.ai-document-actions button', 'Enregistrer');
    let saved = await page.evaluate(() => JSON.parse(localStorage.getItem('koliseum.bots.v1')));
    assert.equal(saved.length, 2); assert.equal(saved[1].classId, 'OSAMODAS'); assert.equal(saved[1].code, edited);
    await page.reload({ waitUntil: 'networkidle0' }); await click(page, '.tabs > button', 'Studio IA');
    assert.equal(await page.$eval('[aria-label="Nom de l’IA"]', e => e.value), 'Osamodas · code externe');
    await click(page, '.ai-text-button', 'Ouvrir les blocs et le code');
    assert.equal(await page.$eval('[aria-label="Code de l’IA"]', e => e.value), edited);
    await click(page, '.ai-view-tabs > button', 'Tester mon IA');
    await click(page, '.ai-challengers button', 'Maison');
    await click(page, '.ai-lab-actions button', 'Lancer un duel');
    await page.waitForFunction(() => !!document.querySelector('.ai-benchmark-heading') && !document.querySelector('.ai-lab-actions button').disabled, { timeout: 180000 });
    assert(!(await page.$eval('.ai-lab-actions', e => e.innerText)).includes('Arrêter'));
    assert(!(await page.$eval('.ai-result-metrics', e => e.innerText)).includes('NaN'));
    const uiReportPath = path.join(out, 'downloads', 'rapport-ia.json');
    if (fs.existsSync(uiReportPath)) fs.unlinkSync(uiReportPath);
    await click(page, '.ai-benchmark-heading button', 'Rapport');
    for (let i = 0; i < 100 && !fs.existsSync(uiReportPath); i++) await new Promise(r => setTimeout(r, 100));
    const uiGame = JSON.parse(fs.readFileSync(uiReportPath, 'utf8')).games[0];
    for (const key of ['outcome','turns','endReason','remainingHp','opponentHp','stats','opponentStats']) {
      assert.deepEqual(uiGame[key], benchmark.games[0][key], `CLI and browser differ: ${key}`);
    }
    ok('The downloaded CLI and browser laboratory report identical results, HP and action/damage totals for the same match.');
    await page.screenshot({ path: path.join(out, 'imported-ai-result.png') });
    ok('Edited JavaScript imports as a separate saved Osamodas AI and survives reload.');
    report.project = folder; assert.deepEqual(report.errors, []);
    fs.writeFileSync(path.join(out, 'proof.json'), JSON.stringify(report, null, 2));
  } catch (error) {
    await page.screenshot({ path: path.join(out, 'failure.png'), fullPage: true }); throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
