// Extract generated atlases without repainting them, then use the real exporter.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const puppeteer = require('puppeteer-core');
const { build, heroes, monsters, ICONS } = require('./definition.cjs');
const battlefield = require('./battlefield.cjs');
const { buildAtelierArchive } = require('../../src/ui/atelierArchive');
const { decodePng } = require('../../skills/retro-class-designer/scripts/class-kit.cjs');
const root = path.resolve(__dirname, '../..'), output = path.join(root, 'public/adventures/winterfell');
const dataUrl = file => `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`;

async function extractArtwork({ owners = [...heroes, ...monsters], sourceRoot = __dirname, targetRoot = output, includeIcons = true } = {}) {
  const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, pipe: true });
  const report = [];
  try {
    const page = await browser.newPage();
    for (const owner of owners) {
      const directory = path.join(targetRoot, 'assets', owner.key); fs.mkdirSync(directory, { recursive: true });
      const frames = await page.evaluate(async ({ source, key }) => {
        const image = new Image(); image.src = source; await image.decode();
        const frameInfo = [];
        for (let col = 0; col < 3; col++) {
          const x = Math.round(image.width * col / 3), right = Math.round(image.width * (col + 1) / 3);
          const c = document.createElement('canvas'); c.width = right - x; c.height = image.height;
          const cx = c.getContext('2d'); cx.drawImage(image, x, 0, c.width, c.height, 0, 0, c.width, c.height);
          const pix = cx.getImageData(0, 0, c.width, c.height).data;
          const seen = new Uint8Array(c.width * c.height), queue = new Uint32Array(seen.length);
          // The largest connected figure excludes occasional adjacent-panel
          // portrait overhang. The generated pixels themselves remain intact.
          let largest = { n: 0 };
          for (let i = 0; i < seen.length; i++) {
            if (seen[i] || pix[i * 4 + 3] < 32) continue;
            let head = 0, tail = 1, x0 = c.width, y0 = c.height, x1 = 0, y1 = 0; queue[0] = i; seen[i] = 1;
            while (head < tail) {
              const p = queue[head++], xx = p % c.width, yy = Math.floor(p / c.width);
              x0 = Math.min(x0, xx); x1 = Math.max(x1, xx); y0 = Math.min(y0, yy); y1 = Math.max(y1, yy);
              for (const n of [xx > 0 ? p - 1 : -1, xx + 1 < c.width ? p + 1 : -1, p - c.width, p + c.width]) {
                if (n < 0 || n >= seen.length || seen[n] || pix[n * 4 + 3] < 32) continue;
                seen[n] = 1; queue[tail++] = n;
              }
            }
            if (tail > largest.n) largest = { n: tail, x0, y0, x1, y1 };
          }
          if (!largest.n) throw new Error(`${key}: empty generated panel ${col}`);
          const f = { canvas: c, ...largest };
          let footLeft = c.width, footRight = 0;
          for (let yy = Math.round(f.y1 - (f.y1 - f.y0) * .12); yy <= f.y1; yy++) {
            for (let xx = f.x0; xx <= f.x1; xx++) if (pix[(yy * c.width + xx) * 4 + 3] >= 64) {
              footLeft = Math.min(footLeft, xx); footRight = Math.max(footRight, xx);
            }
          }
          f.anchorX = (footLeft + footRight) / 2; frameInfo.push(f);
        }
        const poseScale = Math.min(...frameInfo.slice(1).map(f => Math.min(204 / (f.y1 - f.y0 + 1),
          112 / Math.max(f.anchorX - f.x0, f.x1 - f.anchorX, 1))));
        return frameInfo.map((f, index) => {
          const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 256;
          const ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
          const w = f.x1 - f.x0 + 1, h = f.y1 - f.y0 + 1;
          const scale = index ? poseScale : Math.min(248 / w, 248 / h);
          ctx.drawImage(f.canvas, f.x0, f.y0, w, h,
            index ? 128 + (f.x0 - f.anchorX) * scale : (256 - w * scale) / 2,
            index ? 224 - (f.y1 - f.y0) * scale : (256 - h * scale) / 2, w * scale, h * scale);
          return { name: ['portrait.png', 'idle-front.png', 'idle-back.png'][index], png: canvas.toDataURL('image/png').split(',')[1],
            source: [image.width, image.height], crop: [f.x0, f.y0, w, h], scale, anchor: index ? [128, 224] : null };
        });
      }, { source: dataUrl(path.join(sourceRoot, 'sources', `${owner.key}.png`)), key: owner.key });
      for (const frame of frames) {
        const bytes = Buffer.from(frame.png, 'base64'); decodePng(bytes, frame.name, 256, 256, 1, frame.name !== 'portrait.png');
        fs.writeFileSync(path.join(directory, frame.name), bytes); delete frame.png;
      }
      report.push({ key: owner.key, frames });
    }
    if (includeIcons) {
    const icons = await page.evaluate(async ({ source, names }) => {
      const image = new Image(); image.src = source; await image.decode();
      return names.map((name, i) => {
        const x = Math.round(i % 4 * image.width / 4), y = Math.round(Math.floor(i / 4) * image.height / 4);
        const w = Math.round((i % 4 + 1) * image.width / 4) - x;
        const h = Math.round((Math.floor(i / 4) + 1) * image.height / 4) - y;
        const c = document.createElement('canvas'); c.width = 64; c.height = 64;
        const ctx = c.getContext('2d'); ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(image, x, y, w, h, 0, 0, 64, 64);
        return { name, png: c.toDataURL('image/png').split(',')[1] };
      });
    }, { source: dataUrl(path.join(sourceRoot, 'sources/icons.png')), names: ICONS });
    fs.mkdirSync(path.join(targetRoot, 'assets/icons'), { recursive: true });
    for (const icon of icons) {
      const bytes = Buffer.from(icon.png, 'base64'); decodePng(bytes, icon.name, 64, 64, 1, false);
      fs.writeFileSync(path.join(targetRoot, 'assets/icons', `${icon.name}.png`), bytes);
    }
    }
    fs.writeFileSync(path.join(sourceRoot, 'artwork-report.json'), JSON.stringify(report, null, 2));
  } finally { await browser.close(); }
}

function artworkRecords() {
  const result = [...heroes, ...monsters].map(owner => ({ id: `winterfell-${owner.key}-v1`, name: owner.name, version: 1,
    images: Object.fromEntries(['portrait.png', 'idle-front.png', 'idle-back.png'].map(name => [name, new Blob([fs.readFileSync(path.join(output, 'assets', owner.key, name))], { type: 'image/png' })])) }));
  result.push({ id: 'winterfell-icons-v1', name: 'Winterfell — sorts', version: 1,
    images: Object.fromEntries(ICONS.map(name => [`icons/${name}.png`, new Blob([fs.readFileSync(path.join(output, 'assets/icons', `${name}.png`))], { type: 'image/png' })])) });
  result.push({ id: battlefield.background.artworkId, name: battlefield.name, version: 1,
    images: Object.fromEntries(['courtyard.png', 'props.png'].map(file => [file, new Blob([fs.readFileSync(path.join(output, 'assets/battlefield', file))], { type: 'image/png' })])) });
  return result;
}

async function packageAdventure() {
  fs.mkdirSync(output, { recursive: true });
  if (!process.argv.includes('--skip-art')) await extractArtwork();
  const { dungeon, characters, equipment, report } = build();
  const records = artworkRecords(), readArtwork = async id => { const r = records.find(r => r.id === id); assert(r, `Missing ${id}`); return r; };
  // The play ZIP deliberately exports ONLY the room. Nested dependencies must
  // suffice on an installation with no custom classes, equipment or artwork.
  const main = await buildAtelierArchive({ dungeons: [dungeon] }, { readArtwork });
  assert.equal(main.warnings.length, 0);
  const author = await buildAtelierArchive({ dungeons: [dungeon], characters, equipment }, { readArtwork });
  fs.writeFileSync(path.join(output, '../winterfell-adventure.zip'), main.bytes);
  fs.writeFileSync(path.join(output, '../winterfell-adventure-v2.zip'), main.bytes);
  fs.writeFileSync(path.join(output, '../winterfell-creator.zip'), author.bytes);
  fs.writeFileSync(path.join(__dirname, 'atelier.json'), JSON.stringify(main.manifest, null, 2));
  fs.writeFileSync(path.join(output, 'balance-report.json'), JSON.stringify(report, null, 2));
  const guide = { title: dungeon.name, introduction: dungeon.adventure.description,
    heroes: heroes.map((h, i) => ({ ...h, ...report.heroes[i], spells: h.spells.map((s, j) => ({ ...s, score: report.heroes[i].spellbook.entries[j].score })) })),
    monsters: monsters.map((m, i) => ({ ...m, ...report.monsters[i], spells: m.spells.map((s, j) => ({ ...s, score: report.monsters[i].spellbook.entries[j].score })) })) };
  fs.writeFileSync(path.join(output, 'guide.json'), JSON.stringify(guide, null, 2));
  console.log(JSON.stringify({ mainBytes: main.bytes.length, creatorBytes: author.bytes.length, images: main.manifest.artwork.reduce((n, a) => n + Object.keys(a.images).length, 0),
    heroes: characters.length, enemies: dungeon.members.reduce((n, m) => n + m.count, 0), spells: heroes.concat(monsters).reduce((n, o) => n + o.spells.length, 0), equipment: equipment.length }));
}

module.exports = { artworkRecords, output, extractArtwork };
if (require.main === module) packageAdventure().catch(error => { console.error(error); process.exitCode = 1; });
