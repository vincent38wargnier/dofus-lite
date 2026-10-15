// Mechanical atlas framing only: keep the generated transparent artwork intact.
const fs = require('fs'), path = require('path'), puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, pipe: true });
  try {
    const page = await browser.newPage();
    const result = await page.evaluate(async url => {
      const image = new Image(); image.src = url; await image.decode();
      const source = document.createElement('canvas'); source.width = image.width; source.height = image.height;
      const ctx = source.getContext('2d'); ctx.drawImage(image, 0, 0);
      const data = ctx.getImageData(0, 0, source.width, source.height).data;
      const atlas = document.createElement('canvas'); atlas.width = 768; atlas.height = 256;
      const out = atlas.getContext('2d'); out.imageSmoothingQuality = 'high';
      const report = [];
      for (let frame = 0; frame < 3; frame++) {
        const left = frame * 512, right = left + 512;
        let x0 = right, x1 = left, y0 = image.height, y1 = 0;
        for (let y = 0; y < image.height; y++) for (let x = left; x < right; x++) if (data[(y * image.width + x) * 4 + 3] > 64) {
          x0 = Math.min(x, x0); x1 = Math.max(x, x1); y0 = Math.min(y, y0); y1 = Math.max(y, y1);
        }
        const scale = Math.min(206 / (y1 - y0 + 1), 216 / (x1 - x0 + 1));
        // Crop by column, not by the measured bounds: retain the translucent
        // edges. Canvas clipping only protects the neighbouring sprite frame.
        out.save(); out.beginPath(); out.rect(frame * 256, 0, 256, 256); out.clip();
        out.drawImage(source, left, 0, 512, image.height,
          frame * 256 + 128 + (left - (x0 + x1) / 2) * scale, 224 - y1 * scale, 512 * scale, image.height * scale);
        out.restore(); report.push({ frame, bounds: [x0, y0, x1, y1], scale });
      }
      return { png: atlas.toDataURL('image/png').split(',')[1], report };
    }, `data:image/png;base64,${fs.readFileSync(path.join(__dirname, 'sources/props-generated.png')).toString('base64')}`);
    fs.writeFileSync(path.join(__dirname, '../../public/adventures/winterfell/assets/battlefield/props.png'), Buffer.from(result.png, 'base64'));
    fs.writeFileSync(path.join(__dirname, 'props-report.json'), JSON.stringify(result.report, null, 2));
    console.log(result.report);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
