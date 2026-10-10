// Render the local Flash portraits, spell icons and map layers to transparent
// PNGs. Characters keep their original vector timelines in the running game.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const puppeteer = require('puppeteer-core');

const root = path.resolve(__dirname, '..', 'public');
const assetRoot = path.join(root, 'dofus-local');
const manifestFile = path.join(assetRoot, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
const chrome = process.env.CHROME_BIN || [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].find(p => fs.existsSync(p));
if (!chrome) throw new Error('Set CHROME_BIN to a Chrome/Chromium executable.');

async function main() {
  const server = http.createServer((req, res) => {
    if (req.url === '/render') {
      res.setHeader('Content-Type', 'text/html');
      res.end('<!doctype html><style>html,body{margin:0;background:transparent}ruffle-player{display:block}</style><script src="/ruffle/ruffle.js"></script>');
      return;
    }
    const file = path.resolve(root, '.' + decodeURIComponent(req.url.split('?')[0]));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404); res.end(); return;
    }
    res.setHeader('Content-Type', { '.wasm': 'application/wasm', '.js': 'application/javascript', '.swf': 'application/x-shockwave-flash' }[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await puppeteer.launch({ executablePath: chrome, headless: true, pipe: true, protocolTimeout: 30000, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1800, height: 1400, deviceScaleFactor: 1 });
    await page.setRequestInterception(true);
    page.on('request', r => r.url().startsWith(origin) || r.url().startsWith('data:') || r.url().startsWith('blob:') ? r.continue() : r.abort());
    page.on('pageerror', e => console.error(e.message));
    await page.goto(origin + '/render');
    let rendered = 0;
    async function render(source, destination, width, height, settle = 60, force = false) {
      const output = path.join(assetRoot, destination);
      if (fs.existsSync(output) && !force && !process.argv.includes('--force')
        && fs.statSync(output).mtimeMs >= fs.statSync(path.join(assetRoot, source)).mtimeMs) return;
      await page.evaluate(async ({ source, width, height }) => {
        // A new player also resets the imported-symbol library. Reusing one
        // across map SWFs can report ready before their imports are displayed.
        window.player = window.RufflePlayer.newest().createPlayer();
        document.body.replaceChildren(player);
        player.style.width = `${width}px`;
        player.style.height = `${height}px`;
        await player.ruffle().load({ url: '/dofus-local/' + source, base: new URL('.', new URL('/dofus-local/' + source, location.href)).href, autoplay: 'on', wmode: 'transparent',
          splashScreen: false, unmuteOverlay: 'hidden', contextMenu: 'off', logLevel: 'error',
          allowScriptAccess: false, allowNetworking: 'all', openUrlMode: 'deny', letterbox: 'off' });
        player.ruffle().volume = 0;
      }, { source, width, height });
      await page.waitForFunction(() => player.ruffle().readyState === 2, { timeout: 20000 });
      if (source.startsWith('maps/')) await page.waitForNetworkIdle({ idleTime: 250, timeout: 20000 });
      await new Promise(resolve => setTimeout(resolve, settle));
      fs.mkdirSync(path.dirname(output), { recursive: true });
      let pixels;
      for (let attempt = 0; attempt < 8; attempt++) {
        pixels = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: Math.ceil(width), height: Math.ceil(height) } });
        const visible = await page.evaluate(async data => {
          const blob = await (await fetch('data:image/png;base64,' + data)).blob();
          const bitmap = await createImageBitmap(blob);
          const canvas = document.createElement('canvas');
          canvas.width = bitmap.width; canvas.height = bitmap.height;
          const ctx = canvas.getContext('2d'); ctx.drawImage(bitmap, 0, 0);
          const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
          bitmap.close();
          for (let i = 3; i < rgba.length; i += 4) if (rgba[i] > 0) return true;
          return false;
        }, Buffer.from(pixels).toString('base64'));
        if (visible) break;
        if (attempt === 7) throw new Error(`Empty render after waiting for imports: ${source}`);
        await new Promise(resolve => setTimeout(resolve, 250));
      }
      fs.writeFileSync(output, pixels);
      rendered += 1;
      if (rendered % 30 === 0) console.log(`Rendered ${rendered} assets.`);
    }
    if (!process.argv.includes('--icons-only')) for (const [id, map] of Object.entries(manifest.maps)) {
      for (const layer of map.layers) await render(layer.swf, layer.image, Math.ceil(map.width), Math.ceil(map.height), 180);
      console.log(`Map ${id} ready (${map.layers.length} layers).`);
    }
    if (!process.argv.includes('--maps-only') && !process.argv.includes('--icons-only')) for (const variants of Object.values(manifest.classes)) {
      for (const id of Object.values(variants)) {
        await render(`static/portraits/${id}.swf`, `portraits/${id}.png`, 96, 96);
      }
    }
    // Only rasterize icons the combat engine exposes; all other raw icons
    // remain available in the imported library.
    const spellSource = fs.readFileSync(path.join(__dirname, '../src/engine/spellData.js'), 'utf8');
    const catalogueFile = path.join(assetRoot, 'spell-catalogue.json');
    const catalogue = fs.existsSync(catalogueFile) ? JSON.parse(fs.readFileSync(catalogueFile)) : {};
    const classSpellIds = [...Object.values(catalogue.classes || {}).flat(), ...(catalogue.common || [])].map(String);
    const ids = [...new Set([...classSpellIds, ...[...spellSource.matchAll(/"id":\s*(\d+)/g)].map(m => m[1])])];
    if (!process.argv.includes('--maps-only')) for (const id of ids) {
      if (manifest.spells[id]?.icon) {
        const visual = manifest.spells[id];
        await render(visual.iconSource || `static/icons/${id}.swf`, visual.icon, 64, 64, 60, visual.iconNeedsRender);
        delete visual.iconNeedsRender;
      }
    }
    manifest.imagesReady = true;
    manifest.renderedSpellIcons = ids.filter(id => manifest.spells[id]?.icon && fs.existsSync(path.join(assetRoot, manifest.spells[id].icon)));
    fs.writeFileSync(manifestFile, JSON.stringify(manifest));
    console.log(`Done. ${rendered} transparent PNGs rendered locally.`);
  } finally {
    if (browser) { const child = browser.process(); await browser.disconnect(); if (child?.exitCode === null) child.kill('SIGKILL'); }
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => process.exit(process.exitCode || 0));
