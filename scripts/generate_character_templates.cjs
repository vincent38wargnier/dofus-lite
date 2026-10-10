// Code-native drawing guides, transparent canvases and a technical mannequin.
// No installed game artwork is included in this independently editable kit.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { spawnSync } = require('node:child_process');
const puppeteer = require('puppeteer-core');
const spec = require('../src/ui/characterArtworkSpec.json');
const root = path.resolve(__dirname, '../public/templates/character-artwork');
const esc = s => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const svg = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
const crc32 = bytes => {
  let crc = -1;
  for (const byte of bytes) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); }
  return (crc ^ -1) >>> 0;
};
const chunk = (tag, data) => {
  const name = Buffer.from(tag), length = Buffer.alloc(4), crc = Buffer.alloc(4);
  length.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, crc]);
};
const blank = (w, h) => {
  const header = Buffer.alloc(13); header.writeUInt32BE(w); header.writeUInt32BE(h, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(Buffer.alloc((w * 4 + 1) * h))), chunk('IEND', Buffer.alloc(0))]);
};
function guides(file) {
  return svg(file.frames * 256, 256, `<g id="artwork"><!-- Draw your character here, or replace this group. --></g><g id="guides-hide-before-export" fill="none" stroke="#729486">${Array.from({ length: file.frames }, (_, i) => `<g transform="translate(${i * 256} 0)">
    <rect x=".5" y=".5" width="255" height="255" stroke-dasharray="5 5"/>
    <rect x="32" y="24" width="192" height="200" stroke="#99aa99" stroke-dasharray="3 5"/>
    <path d="M128 24V242 M16 224H240" stroke="#ce7059" stroke-dasharray="4 3"/>
    <circle cx="128" cy="224" r="5" fill="#ce7059" stroke="none"/>
    <g font-family="Arial,sans-serif" font-size="11" fill="#406158" stroke="none"><text x="10" y="15">${esc(file.name)} · ${i + 1}/${file.frames}</text><text x="10" y="251">${file.pose === 'portrait' ? 'Portrait: centre the face' : 'Feet: x128, y224 · hide guides'}</text></g></g>`).join('')}</g>`);
}
function mannequin(file) {
  return svg(file.frames * 256, 256, Array.from({ length: file.frames }, (_, i) => {
    const back = file.direction === 'L';
    const step = file.pose === 'walk' ? Math.sin(i * Math.PI / 3) * 13 : 0;
    const cast = file.pose === 'cast' ? Math.sin(i * Math.PI / 5) * 40 : 0;
    const hit = file.pose === 'hit' ? [0, -10, 0][i] : 0;
    return `<g transform="translate(${i * 256} 0)" stroke="#24494f" stroke-width="5" stroke-linejoin="round" stroke-linecap="round">
      <path d="M110 161L${105 - step} 207L${94 - step} 217 M142 162L${148 + step} 208L${162 + step} 217" fill="none" stroke-width="14"/>
      <g transform="translate(${hit} 0)">
      <path d="M105 99Q128 91 149 107L152 165Q127 181 102 165Z" fill="${back ? '#3e777e' : '#68b7bb'}"/>
      <path d="M104 109L${86 + step} 148L${95 + step} 169 M150 115L173 ${143 - cast}L181 ${159 - cast}" fill="none" stroke-width="12"/>
      <ellipse cx="${back ? 121 : 138}" cy="69" rx="29" ry="32" fill="${back ? '#45666a' : '#dfc58b'}"/>
      <path d="M${back ? 94 : 110} 66Q${back ? 102 : 129} 28 ${back ? 143 : 161} 49L${back ? 147 : 165} 64" fill="#45666a"/>
      ${back ? '<path d="M112 50L139 59L143 86" fill="none"/>' : '<circle cx="151" cy="69" r="3" fill="#24494f" stroke="none"/>'}
      ${cast > 20 ? '<circle cx="185" cy="103" r="12" fill="#edbe54" stroke="#a07b28"/>' : ''}
      </g></g>`;
  }).join(''));
}
const rows = spec.files.map(file => `<tr><td><code>${file.name}</code></td><td>${file.required ? 'Required' : 'Optional'}</td><td>${file.frames * 256} × 256</td><td>${file.frames}</td><td>${file.frames > 1 ? file.fps + ' fps' : 'Still'}</td><td><a href="guides/${file.name.replace('.png', '.svg')}">SVG guide</a> · <a href="blank/${file.name}" download>Blank PNG</a></td></tr>`).join('');
const guide = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Custom character artwork · template kit</title>
<style>body{font:16px/1.6 system-ui,sans-serif;color:#263d3a;background:#f7f7ef;margin:0}main{max-width:1100px;margin:auto;padding:36px 24px}h1{font-size:36px;line-height:1.2}h2{margin-top:32px}a{color:#356c62}table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:10px;border-bottom:1px solid #d7dfd5}code{background:#e5ebdf;padding:3px 5px;border-radius:4px}.table{overflow:auto}.cards{display:flex;gap:24px;flex-wrap:wrap}.card{border:1px solid #d0dbd0;background:#fff;padding:16px;border-radius:12px;max-width:290px}.card img{width:256px;max-width:100%;background:repeating-conic-gradient(#eef1e9 0% 25%,#fff 0% 50%) 0/16px 16px}.note{padding:16px 22px;background:#e5edda;border-radius:12px}</style>
<main><p>DOFUS LITE · CUSTOM CLASSES · ARTWORK FORMAT ${spec.version}</p><h1>Create your character’s artwork</h1>
<p>Start with <strong>3 transparent PNGs</strong>. Add 6 optional animation sheets when ready. The game supplies the other two facing directions by mirroring.</p>
<p><a href="../character-artwork-kit.zip" download>Download the complete template ZIP</a> · <a href="../../../">Open the game</a></p>
<div class="cards"><div class="card"><h2>Anchor template</h2><img src="guides/idle-front.svg" alt="256 by 256 canvas with foot anchor at x128, y224"><p>Keep the midpoint between the feet at <strong>(128, 224)</strong> in every frame. Coordinates start at the top left.</p></div>
<div class="card"><h2>Front ↘</h2><img src="example/idle-front.png" alt="Technical mannequin facing bottom right"><p>Three-quarter front view, looking toward the bottom right of the screen (SE). The game mirrors this for SW.</p></div>
<div class="card"><h2>Back ↖</h2><img src="example/idle-back.png" alt="Technical mannequin facing top left"><p>Three-quarter rear view, looking toward the top left (NW). The game mirrors this for NE.</p></div></div>
<h2>Image checklist</h2><div class="table"><table><thead><tr><th>Exact filename</th><th>Required?</th><th>Pixels</th><th>Frames</th><th>Playback</th><th>Templates</th></tr></thead><tbody>${rows}</tbody></table></div>
<h2>How to draw and export</h2><ol><li>Open a guide SVG in your drawing tool, or draw over the blank PNG. Keep the canvas dimensions unchanged.</li><li>Draw the same character at the same scale. Use a top-down, three-quarter isometric view. The dashed box from (32,24) to (224,224) is a suggested body area; weapons and capes may extend beyond it inside the canvas.</li><li>For sheets, arrange 256 × 256 frames left to right, in a single row, without padding. Every frame has its own (128,224) foot anchor. Walking loops; casting and hits play once.</li><li>Hide the guides group before export. Export PNG with transparency, without a ground shadow, tile, health bar, text or team ring. The game draws those separately.</li><li>Keep the exact filenames above. Select all finished PNGs together in <strong>Atelier → Mes classes → Images du personnage → Importer les PNG</strong>. Importing replaces the previous image set.</li></ol>
<p>Walking: six contact/passing poses covering a complete step cycle. Casting: prepare, anticipate, wind up, release, follow through, recover. Hits: neutral, recoil, recover. The same casting sheet is used for all spells and weapons. Optional missing poses use the idle image for the same direction.</p>
<div class="note"><strong>Clothing and equipment:</strong> draw the complete outfit into these images, including any hat, cape or companion you want visible. Custom PNGs have no native Flash attachment points. Equipment statistics still apply. Death needs no image: defeated characters leave the board immediately.</div>
<h2>What is in this kit?</h2><ul><li><code>blank/</code>: 9 transparent canvases, ready to draw on.</li><li><code>guides/</code>: 9 editable SVG guides. Hide the guides before exporting your PNGs.</li><li><code>example/</code>: 9 working mannequin PNGs, to test importing and alignment. These are technical placeholders you can replace.</li><li><code>spec.json</code>: machine-readable sizes and animation timings.</li><li><code>PROMPTS.txt</code>: starting prompts for an image tool.</li></ul>
<p>Maximum: 2 MiB per PNG, 12 MiB per set. Each animation frame must contain visible artwork; combat images must include transparent pixels. Images are stored in this browser, and used by manual combat, AI matches and replays on this browser. Keep your PNG files as a backup.</p></main></html>`;
async function main() {
  for (const dir of ['blank', 'guides', 'example']) fs.mkdirSync(path.join(root, dir), { recursive: true });
  fs.writeFileSync(path.join(root, 'index.html'), guide);
  fs.writeFileSync(path.join(root, 'spec.json'), JSON.stringify(spec, null, 2));
  fs.writeFileSync(path.join(root, 'PROMPTS.txt'), `Character design prompt\nCreate a single full-body character: [YOUR DESCRIPTION]. Three-quarter isometric game view, facing bottom-right (SE). Transparent background, no text, no scenery, no floor shadow. Keep the entire silhouette inside a 256x256 canvas. Midpoint between the feet at pixel (128,224); body mostly inside x32..224 and y24..224. Clear readable silhouette.\n\nBack view prompt\nUse the supplied front view as the character reference. Show the SAME character from behind, facing top-left (NW). Preserve proportions, outfit, colors, canvas and foot anchor. Transparent background.\n\nAnimation prompt\nUsing the reference character, draw [6 WALK / 6 CAST / 3 HIT] sequential frames in ONE horizontal row. Each frame is 256x256, with no gaps. Keep feet anchored at (128,224) inside each frame. Same direction, outfit, scale and lighting. Transparent background. [Walk: full loop. Cast: prepare, anticipate, wind up, release, follow through, recover. Hit: neutral, recoil, recover.]\n\nImage tools may not preserve exact dimensions and anchors: align and export frames in an image editor before importing. See index.html for the complete required-file checklist.\n`);
  const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, pipe: true });
  try {
    const page = await browser.newPage();
    for (const file of spec.files) {
      fs.writeFileSync(path.join(root, 'blank', file.name), blank(file.frames * 256, 256));
      fs.writeFileSync(path.join(root, 'guides', file.name.replace('.png', '.svg')), guides(file));
      await page.setViewport({ width: file.frames * 256, height: 256, deviceScaleFactor: 1 });
      await page.setContent(`<body style="margin:0">${mannequin(file)}</body>`);
      await page.screenshot({ path: path.join(root, 'example', file.name), omitBackground: true });
    }
  } finally { const child = browser.process(); await browser.disconnect(); child?.kill('SIGTERM'); }
  const zip = spawnSync('python3', ['-c', 'import pathlib,sys,zipfile; p=pathlib.Path(sys.argv[1]); z=zipfile.ZipFile(p.parent/"character-artwork-kit.zip","w",zipfile.ZIP_DEFLATED); [z.write(f, f.relative_to(p.parent)) for f in sorted(p.rglob("*")) if f.is_file()]; z.close()', root], { encoding: 'utf8' });
  if (zip.status !== 0) throw new Error(zip.stderr);
  console.log(`Created ${root} and character-artwork-kit.zip`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
