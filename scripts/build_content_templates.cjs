require('./ai_runtime.cjs');
const fs = require('node:fs');
const path = require('node:path');
const { packageExample } = require('../src/content/contentPackage');
const { buildContentPrompt, packageSpecDocument, PACKAGE_RULES } = require('../src/content/packagePrompt');
const { EQUIPMENT_CREATION_RULES } = require('../src/content/equipmentRules');
const { writeContentZip } = require('../src/content/zip');
const { validateFiles } = require('./content-pack.cjs');

(async () => {
  const root = path.join(__dirname, '../public/templates/content-packages'); fs.mkdirSync(root, { recursive: true });
  const spec = packageSpecDocument();
  fs.writeFileSync(path.join(root, 'spec.json'), JSON.stringify(spec, null, 2));
  fs.writeFileSync(path.join(root, 'content.schema.json'), JSON.stringify(spec.schema, null, 2));
  fs.writeFileSync(path.join(root, 'rules.md'), '# Dofus Lite content packages v1\n\n' + PACKAGE_RULES);
  fs.writeFileSync(path.join(root, 'equipment-rules.md'), '# Equipment design rules\n\n'
    + EQUIPMENT_CREATION_RULES + '\nExact limits at every level: [equipment-limits.json](equipment-limits.json). '
    + 'Each family has contiguous inclusive level bands; omitted stat limits are zero. '
    + 'These are design references, not additional content.json fields.\n');
  fs.writeFileSync(path.join(root, 'equipment-limits.json'), JSON.stringify(spec.equipment, null, 2) + '\n');
  for (const type of ['class', 'dungeon']) {
    const manifest = packageExample(type);
    const files = new Map([['content.json', new Uint8Array(Buffer.from(JSON.stringify(manifest, null, 2)))]]);
    await validateFiles(files);
    fs.writeFileSync(path.join(root, `example-${type}.zip`), writeContentZip(files));
    fs.writeFileSync(path.join(root, `example-${type}.json`), JSON.stringify(manifest, null, 2));
    fs.writeFileSync(path.join(root, `prompt-${type}.txt`), buildContentPrompt({ type }));
    // Runnable artwork sample: reusable mannequin PNGs, not finished theme art.
    const owner = type === 'class' ? manifest.class : manifest.dungeon.monsters[0];
    owner.artwork = 'artwork/warden'; owner.spells[0].icon = 'icons/ember.png';
    for (const entry of spec.artwork.files) files.set(`artwork/warden/${entry.name}`,
      new Uint8Array(fs.readFileSync(path.join(__dirname, '../public/templates/character-artwork/example', entry.name))));
    files.set('icons/ember.png', new Uint8Array(fs.readFileSync(path.join(__dirname, '../skills/retro-class-designer/assets/example/icons/flare_lance.png'))));
    files.set('content.json', new Uint8Array(Buffer.from(JSON.stringify(manifest, null, 2))));
    await validateFiles(files);
    fs.writeFileSync(path.join(root, `example-${type}-with-artwork.zip`), writeContentZip(files));
  }
  console.log(`Validated templates and self-contained prompts written to ${root}`);
})().catch(error => { console.error(error); process.exitCode = 1; });
