#!/usr/bin/env node
// Preuve navigateur de l'arène: IA Maison vs IA Maison (OSAMODAS vs CRA),
// replay accéléré jusqu'au verdict, screenshot du banner de victoire.
//   node scripts/proof_arena.js [url]

const puppeteer = require('puppeteer-core');

const URL = process.argv[2] || 'http://localhost:3210';
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

  // Config: IA Maison (OSAMODAS) vs IA Maison (CRA)
  const selects = await page.$$('.panel label.field select');
  await selects[0].select('maison');
  await selects[1].select('OSAMODAS');
  await selects[2].select('maison');
  await selects[3].select('CRA');
  await selects[4].select('arene');
  await sleep(200);

  await page.evaluate(() => {
    [...document.querySelectorAll('.btn.primary')]
      .find((b) => b.textContent.includes('Lancer le combat')).click();
  });
  await sleep(800);
  await page.screenshot({ path: 'shot-arena-1-fight.png' });

  // Vitesse ×4 puis on laisse dérouler jusqu'au banner
  const speed = await page.$('.playback select');
  if (speed) await speed.select('3');
  await page.waitForFunction(
    () => document.querySelector('.winner-banner'),
    { timeout: 180000 },
  );
  await sleep(400);
  await page.screenshot({ path: 'shot-arena-2-winner.png' });

  const verdict = await page.evaluate(() => ({
    banner: document.querySelector('.winner-banner')?.innerText.replace(/\n/g, ' · '),
    stats: document.querySelector('.arena-center .muted.small')?.innerText,
    lastLog: [...document.querySelectorAll('.log .entry')].slice(-4).map((e) => e.textContent),
  }));
  console.log(JSON.stringify(verdict, null, 1));

  await browser.close();
  console.log('OK — screenshots shot-arena-*.png');
})().catch((e) => { console.error('ÉCHEC:', e.message); process.exit(1); });
