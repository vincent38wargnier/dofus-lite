// Rasterize original item icons locally; no client/account/server connection.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const puppeteer = require('puppeteer-core');
const root = path.resolve(__dirname, '../public');
const assets = path.join(root, 'dofus-local');
const forging = process.argv.includes('--forgemagie');
const icons = Object.values(JSON.parse(fs.readFileSync(path.join(assets, forging ? 'equipment/forgemagie-icons.json' : 'equipment/icons.json'))));
const tasks = icons.filter(i => !fs.existsSync(path.join(assets, i.image)) || process.argv.includes('--force'));
const chrome = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

(async () => {
  const server = http.createServer((req, res) => {
    if (req.url === '/') {
      res.setHeader('Content-Type', 'text/html');
      res.end('<!doctype html><style>body{margin:0;background:transparent}ruffle-player{display:block;width:64px;height:64px}</style><script src="/ruffle/ruffle.js"></script>'); return;
    }
    const file = path.resolve(root, '.' + decodeURIComponent(req.url.split('?')[0]));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404); res.end(); return;
    }
    res.setHeader('Content-Type', { '.js': 'application/javascript', '.wasm': 'application/wasm', '.swf': 'application/x-shockwave-flash' }[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
    let cursor = 0;
    let done = 0;
    const failed = [];
    await Promise.all(Array.from({ length: process.argv.includes('--serial') ? 1 : 4 }, async () => {
      const page = await browser.newPage();
      await page.setViewport({ width: 64, height: 64, deviceScaleFactor: 1 });
      await page.setRequestInterception(true);
      page.on('request', r => r.url().startsWith(origin) || /^(data|blob):/.test(r.url()) ? r.continue() : r.abort());
      page.on('pageerror', error => console.error(error.message));
      await page.goto(origin);
      while (cursor < tasks.length) {
        const item = tasks[cursor++];
        try {
          await page.evaluate(async source => {
            window.player = window.RufflePlayer.newest().createPlayer();
            document.body.replaceChildren(player);
            await player.ruffle().load({ url: '/dofus-local/' + source, autoplay: 'on', wmode: 'transparent',
              splashScreen: false, unmuteOverlay: 'hidden', contextMenu: 'off', logLevel: 'error',
              allowScriptAccess: false, allowNetworking: 'none', openUrlMode: 'deny', letterbox: 'off' });
            player.ruffle().volume = 0;
          }, item.source);
          await page.waitForFunction(() => player.ruffle().readyState === 2, { timeout: 15000 });
          await new Promise(resolve => setTimeout(resolve, 65));
          fs.mkdirSync(path.dirname(path.join(assets, item.image)), { recursive: true });
          await page.screenshot({ path: path.join(assets, item.image), omitBackground: true });
        } catch (error) { failed.push({ source: item.source, error: error.message }); }
        done += 1;
        if (done % 100 === 0) console.log(`${done}/${tasks.length} item icons rendered.`);
      }
    }));
    fs.writeFileSync(path.join(assets, forging ? 'equipment/forgemagie-render-report.json' : 'equipment/render-report.json'), JSON.stringify({ total: icons.length, rendered: done, failed }, null, 2));
    console.log(`Done: ${done} icons; ${failed.length} failures.`);
    if (failed.length) process.exitCode = 1;
  } finally {
    if (browser) { await browser.disconnect(); browser.process()?.kill('SIGKILL'); }
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => process.exit(process.exitCode || 0));
