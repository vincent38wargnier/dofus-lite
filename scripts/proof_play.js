#!/usr/bin/env node
// Preuve navigateur du mode Jouer: pilote Chrome (headless) sur l'app,
// lance un combat humain-vs-bot, clique déplacement + sort + cible,
// et capture des screenshots à chaque étape.
//   node scripts/proof_play.js [url]

const puppeteer = require('puppeteer-core');

const URL = process.argv[2] || 'http://localhost:3000';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--window-size=1500,1000'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 980 });
  page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
  await page.goto(URL, { waitUntil: 'networkidle0', timeout: 60000 });

  const clickByText = async (sel, text) => {
    const ok = await page.evaluate((s, t) => {
      const el = [...document.querySelectorAll(s)].find((x) => x.textContent.includes(t));
      if (el) { el.click(); return true; }
      return false;
    }, sel, text);
    if (!ok) throw new Error(`introuvable: ${sel} "${text}"`);
  };

  // 1. Onglet Jouer
  await clickByText('.tab', 'Jouer');
  await sleep(300);

  // Classe joueur = IOP (défaut), adversaire = IA Maison (défaut), classe CRA (défaut)
  await clickByText('.btn.primary', 'Jouer');
  await sleep(900);
  await page.screenshot({ path: 'shot-play-1-start.png' });

  // 2. Attendre notre tour (le bot joue peut-être d'abord), puis bouger
  await page.waitForFunction(
    () => document.querySelector('.cell.hl-move') || document.querySelector('.winner-banner'),
    { timeout: 45000 },
  );
  const state1 = await page.evaluate(() => ({
    moves: document.querySelectorAll('.cell.hl-move').length,
    status: document.querySelector('.turn-status')?.textContent || '',
    timer: !!document.querySelector('.turn-timer'),
  }));
  console.log('tour humain:', JSON.stringify(state1));
  await page.screenshot({ path: 'shot-play-2-highlights.png' });

  // Clic sur une case de déplacement verte
  await page.evaluate(() => {
    const cells = [...document.querySelectorAll('.cell.hl-move')];
    cells[Math.floor(cells.length / 2)].click();
  });
  await sleep(700);

  // 3. Chercher un sort qui a des cibles depuis ici → cases rouges
  let spell = null;
  let targets = 0;
  const nSpells = await page.evaluate(() => document.querySelectorAll('.spell-btn').length);
  for (let i = 0; i < nSpells && targets === 0; i++) {
    const name = await page.evaluate((idx) => {
      const btn = document.querySelectorAll('.spell-btn')[idx];
      if (!btn || btn.disabled) return null;
      if (btn.title.includes('portée 0-0')) return null; // sort sur soi: caste direct
      btn.click();
      return btn.querySelector('.nm')?.textContent;
    }, i);
    if (!name) continue;
    await sleep(250);
    targets = await page.evaluate(() => document.querySelectorAll('.cell.hl-target').length);
    if (targets > 0) spell = name;
    else await page.evaluate((idx) => document.querySelectorAll('.spell-btn')[idx].click(), i); // désélection
  }
  console.log(`sort choisi: ${spell} → ${targets} cibles surlignées`);
  await page.screenshot({ path: 'shot-play-3-targeting.png' });

  // 4. Cliquer une cible si possible (sinon annuler), puis fin de tour
  if (targets > 0) {
    await page.evaluate(() => {
      document.querySelectorAll('.cell.hl-target')[0].click();
    });
    await sleep(800);
    await page.screenshot({ path: 'shot-play-4-cast.png' });
  }
  await clickByText('button', 'Fin de tour');

  // 5. Laisser le bot répondre, capturer son tour
  await sleep(2600);
  await page.screenshot({ path: 'shot-play-5-bot-turn.png' });
  const log = await page.evaluate(
    () => [...document.querySelectorAll('.log .entry')].slice(-8).map((e) => e.textContent),
  );
  console.log('journal:', JSON.stringify(log, null, 1));

  await browser.close();
  console.log('OK — screenshots shot-play-*.png');
})().catch((e) => { console.error('ÉCHEC:', e.message); process.exit(1); });
