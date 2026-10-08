const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new', args: ['--window-size=1500,1000'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 980 });
  page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
  await page.goto('http://localhost:3210', { waitUntil: 'networkidle0', timeout: 60000 });
  await page.evaluate(() => [...document.querySelectorAll('.tab')].find((t) => t.textContent.includes('Jouer')).click());
  await sleep(300);
  await page.evaluate(() => [...document.querySelectorAll('.btn.primary')].find((b) => b.textContent.includes('Jouer')).click());
  await page.waitForFunction(() => document.querySelector('.cell.hl-move'), { timeout: 45000 });
  await sleep(300);

  // 1. survol de la case verte la plus lointaine → chemin + coût PM
  const cells = await page.$$('.cell.hl-move');
  await cells[cells.length - 1].hover();
  await sleep(350);
  const dots = await page.evaluate(() => ({
    dots: document.querySelectorAll('.path-dot').length,
    cost: document.querySelector('.path-cost')?.textContent,
  }));
  console.log('aperçu chemin:', JSON.stringify(dots));
  await page.screenshot({ path: 'shot-ux-1-path.png' });

  // 2. sort sélectionné → grille de portée complète + cibles
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('.spell-btn')].find((b) => !b.disabled && !b.title.includes('portée 0-0'));
    btn.click();
  });
  await sleep(350);
  const grid = await page.evaluate(() => ({
    range: document.querySelectorAll('.cell.hl-range').length,
    targets: document.querySelectorAll('.cell.hl-target').length,
    spell: document.querySelector('.spell-btn.selected .nm')?.textContent,
  }));
  console.log('grille de portée:', JSON.stringify(grid));
  await page.screenshot({ path: 'shot-ux-2-range.png' });

  // 3. marche le long du chemin: clic loin, capture à mi-parcours
  await page.evaluate(() => {
    const btn = document.querySelector('.spell-btn.selected'); if (btn) btn.click();
  });
  await sleep(250);
  const far = await page.$$('.cell.hl-move');
  const before = await page.evaluate(() => {
    const t = document.querySelector('.token.side-A');
    return { left: t.style.left, top: t.style.top };
  });
  await far[far.length - 1].click();
  await sleep(220);
  const mid = await page.evaluate(() => {
    const t = document.querySelector('.token.side-A');
    return { left: t.style.left, top: t.style.top, walking: t.className.includes('walking') };
  });
  await page.screenshot({ path: 'shot-ux-3-midwalk.png' });
  await sleep(600);
  const after = await page.evaluate(() => {
    const t = document.querySelector('.token.side-A');
    return { left: t.style.left, top: t.style.top };
  });
  console.log('marche:', JSON.stringify({ before, mid, after }));
  await browser.close();
  console.log('OK');
})().catch((e) => { console.error('ÉCHEC:', e.message); process.exit(1); });
