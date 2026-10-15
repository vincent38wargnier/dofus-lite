require('../../scripts/ai_runtime.cjs');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const puppeteer = require('puppeteer-core');
const { build, owners } = require('./definition.cjs');
const { chapters, TITLE, INTRO } = require('./story.cjs');
const maps = require('./battlefields.cjs');
const { artworkRecords: existingArtwork } = require('../winterfell-last-stand/build.cjs');
const { extractArtwork } = require('../winterfell/build.cjs');
const { buildAtelierArchive } = require('../../src/ui/atelierArchive');
const output = path.resolve(__dirname, '../../public/adventures/thrones-campaign');
const pngUrl = file => `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`;
function artworkRecords() {
  const pngRecord = (id, name, directory, files) => ({ id, version: 1, name,
    images: Object.fromEntries(files.map(file => [file, new Blob([fs.readFileSync(path.join(directory, file))], { type: 'image/png' })])) });
  return [...existingArtwork(),
    ...owners.map(owner => pngRecord(`thrones-${owner.key}-v1`, owner.name, path.join(output, 'assets', owner.key), ['portrait.png', 'idle-front.png', 'idle-back.png'])),
    ...maps.slice(0, 7).map((map, i) => pngRecord(map.background.artworkId, map.name, path.join(output, 'assets', chapters[i].key), ['battlefield.png', 'props.png']))];
}
async function art() {
  fs.mkdirSync(path.join(output, 'assets'), { recursive: true });
  const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, pipe: true });
  try {
    const page = await browser.newPage();
    const strips = await page.evaluate(async src => {
      const image = new Image(); image.src = src; await image.decode();
      return Array.from({ length: 3 }, (_, row) => {
        const c = document.createElement('canvas'); c.width = image.width; c.height = Math.round(image.height / 3);
        c.getContext('2d').drawImage(image, 0, row * image.height / 3, image.width, image.height / 3, 0, 0, c.width, c.height);
        return c.toDataURL('image/png').split(',')[1];
      });
    }, pngUrl(path.join(__dirname, 'sources/soldiers-generated.png')));
    owners.forEach((owner, i) => fs.writeFileSync(path.join(__dirname, 'sources', `${owner.key}.png`), Buffer.from(strips[i], 'base64')));
    const warmProps = await page.evaluate(async src => {
      const image = new Image(); image.src = src; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = 768; canvas.height = 256;
      const ctx = canvas.getContext('2d'); ctx.imageSmoothingQuality = 'high';
      for (let i = 0; i < 3; i++) {
        const width = Math.round(image.width / 3), c = document.createElement('canvas'); c.width = width; c.height = image.height;
        const x = c.getContext('2d'); x.drawImage(image, i * image.width / 3, 0, width, image.height, 0, 0, width, image.height);
        const data = x.getImageData(0, 0, width, image.height).data; let left = width, right = 0, top = image.height, bottom = 0;
        for (let y = 0; y < image.height; y++) for (let xx = 0; xx < width; xx++) if (data[(y * width + xx) * 4 + 3] > 40) {
          left = Math.min(left, xx); right = Math.max(right, xx); top = Math.min(top, y); bottom = Math.max(bottom, y);
        }
        const w = right - left + 1, h = bottom - top + 1, s = Math.min(230 / w, 216 / h);
        const destination = [0, 2, 1][i]; // Runtime atlas order: pillar, brazier, barricade.
        ctx.drawImage(c, left, top, w, h, destination * 256 + (256 - w * s) / 2, 228 - h * s, w * s, h * s);
      }
      return canvas.toDataURL('image/png').split(',')[1];
    }, pngUrl(path.join(__dirname, 'sources/props-generated.png')));
    for (let i = 0; i < 7; i++) {
      const directory = path.join(output, 'assets', chapters[i].key); fs.mkdirSync(directory, { recursive: true });
      const png = await page.evaluate(async ({ map, ground, atlas, snow }) => {
        const image = new Image(); image.src = ground === 4 ? snow : atlas; await image.decode();
        const texture = document.createElement('canvas'); texture.width = 1024; texture.height = 1024;
        const tx = texture.getContext('2d');
        if (ground === 4) tx.drawImage(image, image.width * .3, image.height * .35, image.width * .35, image.height * .35, 0, 0, 1024, 1024);
        else tx.drawImage(image, ground % 2 * image.width / 2, Math.floor(ground / 2) * image.height / 2, image.width / 2, image.height / 2, 0, 0, 1024, 1024);
        const c = document.createElement('canvas'); c.width = map.background.width; c.height = map.background.height; const ctx = c.getContext('2d');
        const { hw, top, originX } = map.background, n = map.width, ox = originX * hw, hh = hw / 2;
        const background = ctx.createRadialGradient(ox, top + n * hh, 100, ox, top + n * hh, 1000);
        background.addColorStop(0, ground === 4 ? '#293c4c' : '#302a27'); background.addColorStop(1, '#0b1118'); ctx.fillStyle = background; ctx.fillRect(0, 0, c.width, c.height);
        const poly = (points, color) => { ctx.beginPath(); points.forEach(([x,y],j)=>j ? ctx.lineTo(x,y) : ctx.moveTo(x,y));ctx.closePath();ctx.fillStyle=color;ctx.fill(); };
        poly([[ox-n*hw,top+n*hh],[ox,top+2*n*hh],[ox,top+2*n*hh+32],[ox-n*hw,top+n*hh+32]],ground===4?'#536c7e':'#3e3933');
        poly([[ox+n*hw,top+n*hh],[ox,top+2*n*hh],[ox,top+2*n*hh+32],[ox+n*hw,top+n*hh+32]],ground===4?'#304858':'#262520');
        ctx.save();ctx.setTransform(hw,hh,-hw,hh,ox,top);ctx.drawImage(texture,0,0,n,n);ctx.restore();
        // Subtle boundary stones frame the battlefield without inventing impassable cells.
        ctx.beginPath();ctx.moveTo(ox,top);ctx.lineTo(ox+n*hw,top+n*hh);ctx.lineTo(ox,top+2*n*hh);ctx.lineTo(ox-n*hw,top+n*hh);ctx.closePath();
        ctx.strokeStyle=ground===4?'#b2c9d277':'#c2b59777';ctx.lineWidth=3;ctx.stroke();
        return c.toDataURL('image/png').split(',')[1];
      }, { map: maps[i], ground: chapters[i].ground, atlas: pngUrl(path.join(__dirname, 'sources/ground-generated.png')),
        snow: pngUrl(path.resolve(__dirname, '../winterfell-last-stand/sources/battlefield-generated.png')) });
      fs.writeFileSync(path.join(directory, 'battlefield.png'), Buffer.from(png, 'base64'));
      if (chapters[i].ground === 4) fs.copyFileSync(path.resolve(output, '../winterfell-last-stand/assets/props.png'), path.join(directory, 'props.png'));
      else fs.writeFileSync(path.join(directory, 'props.png'), Buffer.from(warmProps, 'base64'));
    }
  } finally { await browser.close(); }
  await extractArtwork({ owners, sourceRoot: __dirname, targetRoot: output, includeIcons: false });
}
async function main() {
  if (!process.argv.includes('--skip-art')) await art();
  const { dungeon, report } = build(), records = artworkRecords();
  const archive = await buildAtelierArchive({ dungeons: [dungeon] }, { readArtwork: async id => { const r = records.find(r => r.id === id); assert(r, id); return r; } });
  assert.deepEqual(archive.warnings, []);
  fs.writeFileSync(path.resolve(output, '../thrones-eight-memories.zip'), archive.bytes);
  fs.writeFileSync(path.join(__dirname, 'atelier.json'), JSON.stringify(archive.manifest, null, 2));
  fs.writeFileSync(path.join(output, 'balance-report.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(output, 'story.json'), JSON.stringify({ title: TITLE, introduction: INTRO, chapters }, null, 2));
  console.log(JSON.stringify({ bytes: archive.bytes.length, rooms: dungeon.rooms.length, images: archive.manifest.artwork.reduce((n, r) => n + Object.keys(r.images).length, 0) }));
}
module.exports = { artworkRecords, output };
if (require.main === module) main().catch(e => { console.error(e); process.exitCode = 1; });
