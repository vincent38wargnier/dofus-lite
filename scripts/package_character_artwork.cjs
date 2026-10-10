// Mechanical export only: pack generated poses into the game's PNG layout.
// The artwork itself is created with imagegen; originals remain in sources/.
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer-core');
const spec = require('../src/ui/characterArtworkSpec.json');

(async () => {
  const directory = path.resolve(process.argv[2] || 'public/characters/heroine-ivoire-v1');
  const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, pipe: true });
  const report = [];
  try {
    const page = await browser.newPage();
    for (const file of spec.files) {
      const source = path.join(directory, 'sources', file.name);
      if (!fs.existsSync(source)) throw new Error(`Missing generated artwork: ${source}`);
      const result = await page.evaluate(async ({ data, file, spec }) => {
        const img = new Image(); img.src = data; await img.decode();
        const columns = file.frames === 6 && img.width / img.height < 4 ? 3 : file.frames;
        const rows = file.frames / columns;
        const frames = [];
        for (let i = 0; i < file.frames; i++) {
          const x = Math.round(i % columns * img.width / columns), y = Math.round(Math.floor(i / columns) * img.height / rows);
          const width = Math.round((i % columns + 1) * img.width / columns) - x;
          const height = Math.round((Math.floor(i / columns) + 1) * img.height / rows) - y;
          const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
          const ctx = canvas.getContext('2d'); ctx.drawImage(img, x, y, width, height, 0, 0, width, height);
          const pixels = ctx.getImageData(0, 0, width, height).data;
          let x0 = width, y0 = height, x1 = 0, y1 = 0, opaque = 0, transparent = 0;
          for (let yy = 0; yy < height; yy++) for (let xx = 0; xx < width; xx++) {
            const a = pixels[(yy * width + xx) * 4 + 3];
            if (!a) transparent += 1;
            if (a > 16) { x0 = Math.min(x0, xx); x1 = Math.max(x1, xx); y0 = Math.min(y0, yy); y1 = Math.max(y1, yy); opaque += 1; }
          }
          if (!opaque || !transparent) throw new Error(`Missing figure or transparent background: ${file.name} frame ${i + 1}`);
          // Register the feet, rather than centering an extended casting arm.
          let footLeft = width, footRight = 0;
          const footTop = Math.round(y1 - (y1 - y0) * .14);
          for (let yy = footTop; yy <= y1; yy++) for (let xx = 0; xx < width; xx++) {
            if (pixels[(yy * width + xx) * 4 + 3] > 32) { footLeft = Math.min(footLeft, xx); footRight = Math.max(footRight, xx); }
          }
          frames.push({ canvas, x0, x1, y0, y1, anchorX: (footLeft + footRight) / 2, opaque, transparent });
        }
        const output = document.createElement('canvas'); output.width = spec.frameSize * file.frames; output.height = spec.frameSize;
        const ctx = output.getContext('2d'); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
        if (file.pose === 'portrait') {
          const f = frames[0], width = f.x1 - f.x0 + 1, height = f.y1 - f.y0 + 1;
          const scale = Math.min(248 / width, 248 / height);
          ctx.drawImage(f.canvas, f.x0, f.y0, width, height, (256 - width * scale) / 2, (256 - height * scale) / 2, width * scale, height * scale);
        } else {
          // One scale across a sheet: no per-frame stretching while walking.
          const scale = Math.min(...frames.map(f => Math.min(208 / (f.y1 - f.y0 + 1),
            116 / Math.max(f.anchorX - f.x0, f.x1 - f.anchorX, 1))));
          frames.forEach((f, i) => {
            ctx.save(); ctx.beginPath(); ctx.rect(i * 256, 0, 256, 256); ctx.clip();
            ctx.drawImage(f.canvas, i * 256 + spec.anchor.x - f.anchorX * scale,
              spec.anchor.y - f.y1 * scale, f.canvas.width * scale, f.canvas.height * scale);
            ctx.restore();
          });
        }
        return { png: output.toDataURL('image/png').split(',')[1], source: [img.width, img.height],
          width: output.width, height: output.height, cells: frames.map(f => ({ opaque: f.opaque, transparent: f.transparent })) };
      }, { data: `data:image/png;base64,${fs.readFileSync(source).toString('base64')}`, file, spec });
      fs.writeFileSync(path.join(directory, file.name), Buffer.from(result.png, 'base64'));
      delete result.png; report.push({ name: file.name, ...result });
    }
    fs.writeFileSync(path.join(directory, 'export-report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally { const child = browser.process(); await browser.disconnect(); child?.kill('SIGTERM'); }
})().catch(error => { console.error(error); process.exitCode = 1; });
