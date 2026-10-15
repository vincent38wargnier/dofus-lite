const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const puppeteer = require('puppeteer-core');
const { build, newHeroes, king, TITLE, INTRO } = require('./definition.cjs');
const { artworkRecords: originalArtwork, extractArtwork } = require('../winterfell/build.cjs');
const { buildAtelierArchive } = require('../../src/ui/atelierArchive');
const battlefield = require('./battlefield.cjs');
const output = path.resolve(__dirname, '../../public/adventures/winterfell-last-stand');
const owners = [...newHeroes, king];
function artworkRecords() {
  const previous = originalArtwork().filter(r => r.id !== 'winterfell-battlefield-v2');
  return [...previous, ...owners.map(owner => ({ id: `laststand-${owner.key}-v1`, version: 1, name: owner.name,
    images: Object.fromEntries(['portrait.png', 'idle-front.png', 'idle-back.png'].map(file => [file,
      new Blob([fs.readFileSync(path.join(output, 'assets', owner.key, file))], { type: 'image/png' })])) })),
  { id: battlefield.background.artworkId, version: 1, name: battlefield.name,
    images: Object.fromEntries(['battlefield.png', 'props.png'].map(file => [file,
      new Blob([fs.readFileSync(path.join(output, 'assets', file))], { type: 'image/png' })])) }];
}
async function main() {
  fs.mkdirSync(path.join(output, 'assets'), { recursive: true });
  if (!process.argv.includes('--skip-art')) {
    await extractArtwork({ owners, sourceRoot: __dirname, targetRoot: output, includeIcons: false });
    const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, pipe: true });
    try {
      const page = await browser.newPage();
      const png = await page.evaluate(async src => {
        const image = new Image(); image.src = src; await image.decode();
        const c = document.createElement('canvas'); c.width = 2048; c.height = 1536;
        const ctx = c.getContext('2d'); ctx.imageSmoothingQuality = 'high'; ctx.drawImage(image, 0, 0, c.width, c.height);
        return c.toDataURL('image/png').split(',')[1];
      }, `data:image/png;base64,${fs.readFileSync(path.join(__dirname, 'sources/battlefield-generated.png')).toString('base64')}`);
      fs.writeFileSync(path.join(output, 'assets/battlefield.png'), Buffer.from(png, 'base64'));
    } finally { await browser.close(); }
    fs.copyFileSync(path.resolve(output, '../winterfell/assets/battlefield/props.png'), path.join(output, 'assets/props.png'));
  }
  const { dungeon, characters, equipment, report } = build(), records = artworkRecords();
  const readArtwork = async id => { const record = records.find(r => r.id === id); assert(record, `Missing artwork: ${id}`); return record; };
  const main = await buildAtelierArchive({ dungeons: [dungeon] }, { readArtwork });
  assert.deepEqual(main.warnings, []);
  const creator = await buildAtelierArchive({ dungeons: [dungeon], characters, equipment }, { readArtwork });
  fs.writeFileSync(path.resolve(output, '../winterfell-last-stand.zip'), main.bytes);
  fs.writeFileSync(path.resolve(output, '../winterfell-last-stand-creator.zip'), creator.bytes);
  fs.writeFileSync(path.join(__dirname, 'atelier.json'), JSON.stringify(main.manifest, null, 2));
  fs.writeFileSync(path.join(output, 'balance-report.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(output, 'guide.json'), JSON.stringify({ title: TITLE, introduction: INTRO,
    heroes: characters.map(c => ({ name: c.name, role: c.className, description: c.description,
      portrait: c.loadout.artworkId.startsWith('laststand-') ? `assets/${c.loadout.artworkId.slice(10,-3)}/portrait.png` : `../winterfell/assets/${c.loadout.artworkId.slice(11,-3)}/portrait.png`,
      spells: c.loadout.spells.custom.map(s => ({ name: s.name, description: s.description, pa: s.pa })) })),
    enemies: report.monsters.map(m => ({ name: m.name, count: m.count, hp: m.hp })) }, null, 2));
  console.log(JSON.stringify({ zip: main.bytes.length, images: main.manifest.artwork.reduce((n, r) => n + Object.keys(r.images).length, 0),
    heroes: characters.length, enemies: dungeon.members.reduce((n, m) => n + m.count, 0), items: equipment.length }));
}
module.exports = { artworkRecords, output };
if (require.main === module) main().catch(e => { console.error(e); process.exitCode = 1; });
