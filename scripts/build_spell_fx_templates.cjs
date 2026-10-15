// Technical, code-drawn originals. No native SWF/image is redistributed.
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer-core');
const FX = require('../src/content/spellFxContract');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'public/templates/ai-design/spell-fx');
const write = (name, value) => { const file = path.join(output, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, value); };
const svg = body => `<svg xmlns="http://www.w3.org/2000/svg" width="2048" height="256" viewBox="0 0 2048 256">${body}</svg>`;

function guide(template) {
  return svg(Array.from({ length: 8 }, (_, i) => `<g transform="translate(${i * 256} 0)"><g id="artwork-${i + 1}"/><g id="hide-before-export-${i + 1}" fill="none" stroke="#7d9978"><rect x=".5" y=".5" width="255" height="255"/><rect x="16" y="16" width="224" height="224" stroke-dasharray="4 4"/><path d="M0 128H256M${template.anchor.x} 0V256" stroke-dasharray="3 4"/><circle cx="${template.anchor.x}" cy="128" r="7" stroke="#ca8758"/><text x="16" y="27" font-size="13" font-family="Arial" fill="#49683e" stroke="none">${template.role} · ${i + 1}/8 · 256×256</text><text x="16" y="242" font-size="11" font-family="Arial" fill="#49683e" stroke="none">origin (${template.anchor.x},128) · 24 fps</text></g></g>`).join(''));
}

function sheet(role) {
  const defs = '<defs><radialGradient id="light"><stop stop-color="#fff7d5"/><stop offset=".3" stop-color="#f5c573" stop-opacity=".85"/><stop offset=".72" stop-color="#da8357" stop-opacity=".38"/><stop offset="1" stop-color="#cd7756" stop-opacity="0"/></radialGradient><linearGradient id="beam"><stop stop-color="#8adccf" stop-opacity=".7"/><stop offset=".5" stop-color="#fff6d8"/><stop offset="1" stop-color="#e8b978" stop-opacity=".8"/></linearGradient></defs>';
  const frames = Array.from({ length: 8 }, (_, i) => {
    const p = i / 7, cycle = Math.sin(i / 8 * Math.PI * 2), fade = Math.max(.055, 1 - p);
    let drawing;
    if (role === 'beam') drawing = `<rect y="${114 - cycle * 2}" width="256" height="${28 + cycle * 4}" rx="6" fill="url(#beam)" opacity=".16"/><path d="M0 128Q64 ${116 + cycle * 5} 128 128T256 128" fill="none" stroke="url(#beam)" stroke-width="${6 + cycle}"/><path d="M0 128H256" stroke="#fff4c7" stroke-width="1.7"/>`;
    else if (role === 'aura') drawing = `<g transform="translate(128 128)" fill="none"><ellipse rx="${82 + cycle * 3}" ry="${41 + cycle * 1.5}" stroke="#8dd9c6" stroke-width="12" opacity=".13"/><ellipse rx="82" ry="41" stroke="#a9edd2" stroke-width="2.8" opacity=".9"/><ellipse rx="66" ry="33" stroke="#eee4ad" stroke-width="1.3" stroke-dasharray="16 12" stroke-dashoffset="${-i * 3}"/>${Array.from({ length: 6 }, (_, j) => { const a = j / 6 * Math.PI * 2 + i / 8 * Math.PI * 2; return `<circle cx="${Math.cos(a) * 82}" cy="${Math.sin(a) * 41}" r="3" fill="#e8f9d4" stroke="none"/>`; }).join('')}</g>`;
    else if (role === 'projectile') drawing = `<g transform="translate(128 128)"><circle r="${68 + cycle * 4}" fill="url(#light)"/><path d="M-48 0Q-12 -38 42 0Q-12 38 -48 0Z" fill="#e5aa65" opacity=".6"/><path d="M-24 0Q0 -18 28 0Q0 18 -24 0Z" fill="#fff4cd"/><circle r="${14 + cycle * 2}" fill="#fff8e5"/></g>`;
    else if (role === 'trail') drawing = `<g transform="translate(128 128)" opacity="${fade}"><circle r="${26 + p * 30}" fill="url(#light)"/><circle cx="${p * 8}" cy="${-p * 9}" r="${Math.max(2, 10 - p * 8)}" fill="#f7d597"/><circle cx="${-14 - p * 20}" cy="${p * 14}" r="3" fill="#dca165"/></g>`;
    else {
      const radius = role === 'cast' ? 20 + Math.sin(p * Math.PI) * 48 : 16 + p * 78;
      const strength = role === 'cast' ? Math.max(.055, Math.sin(p * Math.PI)) : fade;
      drawing = `<g transform="translate(128 128)" opacity="${strength}"><circle r="${radius + 15}" fill="url(#light)"/><circle r="${radius}" fill="none" stroke="#f9d69b" stroke-width="${Math.max(1.2, 4 - p * 3)}"/><circle r="${radius * .62}" fill="none" stroke="#e1a66d" stroke-width="1.3"/>${Array.from({ length: 8 }, (_, j) => { const a = j / 8 * Math.PI * 2 + .2, r = radius + 9; return `<path d="M${Math.cos(a) * (r - 9)} ${Math.sin(a) * (r - 9)}L${Math.cos(a) * (r + 6)} ${Math.sin(a) * (r + 6)}" stroke="#fce6b7" stroke-width="2"/>`; }).join('')}</g>`;
    }
    return `<g transform="translate(${i * 256} 0)">${drawing}</g>`;
  });
  return svg(defs + frames.join(''));
}

async function buildSpellFx() {
  write('contract.js', fs.readFileSync(path.join(root, 'src/content/spellFxContract.js')));
  write('fx.schema.json', JSON.stringify(FX.schema, null, 2) + '\n');
  write('SPEC.md', fs.readFileSync(path.join(root, 'skills/retro-class-designer/references/spell-fx-design.md')));
  for (const file of ['index.html', 'preview.js']) write(file, fs.readFileSync(path.join(__dirname, 'templates/spell-fx', file)));
  write('templates.json', JSON.stringify({ format: 'dofus-lite-spell-fx-templates', version: 1, runtimeImportable: false, limits: FX.limits, templates: FX.templates }, null, 2));
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, pipe: true });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 2048, height: 256, deviceScaleFactor: 1 });
    for (const template of FX.templates) {
      for (const [name, drawing] of [[`guides/${template.role}`, guide(template)], [`blank/${template.role}`, svg('')], [`examples/art/${template.role}`, sheet(template.role)]]) {
        write(`${name}.svg`, drawing);
        await page.setContent(`<body style="margin:0">${drawing}</body>`);
        await page.screenshot({ path: path.join(output, `${name}.png`), omitBackground: true });
      }
    }
  } finally { await browser.close(); }
  const examples = {};
  for (const kind of ['projectile', 'impact', 'aura', 'beam']) {
    const manifest = FX.example(kind), report = FX.validate(manifest);
    if (!report.valid) throw new Error(`${kind}: ${report.errors.join(' ')}`);
    write(`examples/${kind}/effect.json`, JSON.stringify(manifest, null, 2) + '\n');
    for (const layer of manifest.layers) write(`examples/${kind}/${layer.file}`, fs.readFileSync(path.join(output, 'examples/art', layer.file)));
    examples[kind] = { manifest, images: Object.fromEntries(manifest.layers.map(layer => [layer.file, `examples/${kind}/${layer.file}`])) };
  }
  write('examples.js', `globalThis.SpellFxExamples = ${JSON.stringify(examples)};\n`);
  console.log('Spell FX kit: 6 layer templates, 4 animated design examples, schema and offline viewer.');
}

module.exports = { buildSpellFx };
if (require.main === module) buildSpellFx().catch(error => { console.error(error); process.exitCode = 1; });
