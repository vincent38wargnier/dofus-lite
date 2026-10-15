// Refresh the portable skill and its runtime references from current game rules.
// This documentation archive is separate from the importable class/dungeon ZIPs.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { writeZip } = require('../skills/retro-class-designer/scripts/class-kit.cjs');
const root = path.resolve(__dirname, '..');
const skill = path.join(root, 'skills/retro-class-designer');
const generated = path.join(root, 'public/templates/content-packages');
const copy = (from, to) => {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
};

execFileSync(process.execPath, [path.join(__dirname, 'build_content_templates.cjs')], { cwd: root, stdio: 'inherit' });
execFileSync(process.execPath, [path.join(__dirname, 'build_authoring_validator.cjs')], { cwd: root, stdio: 'inherit' });
execFileSync(process.execPath, [path.join(__dirname, 'build_visual_templates.cjs')], { cwd: root, stdio: 'inherit' });
fs.cpSync(path.join(root, 'public/templates/ai-design'), path.join(skill, 'assets/ai-design'), { recursive: true });
for (const [source, destination] of [
  ['rules.md', 'references/runtime-zip.md'],
  ['equipment-rules.md', 'references/equipment-rules.md'],
  ['equipment-limits.json', 'references/equipment-limits.json'],
  ['content.schema.json', 'assets/content.schema.json'],
  ['spec.json', 'assets/runtime-spec.json'],
  ['prompt-class.txt', 'assets/runtime-class-prompt.txt'],
  ['prompt-dungeon.txt', 'assets/runtime-dungeon-prompt.txt'],
  ['example-class-with-artwork.zip', 'assets/runtime-class.zip'],
  ['example-dungeon-with-artwork.zip', 'assets/runtime-dungeon.zip'],
  ['example-class.zip', 'assets/runtime-class-minimal.zip'],
  ['example-dungeon.zip', 'assets/runtime-dungeon-minimal.zip'],
  ['example-equipment.json', 'assets/validation-equipment.json'],
  ['example-character.json', 'assets/validation-character.json'],
]) copy(path.join(generated, source), path.join(skill, destination));
for (const name of ['spell-balance.md', 'equipment-balance.md', 'equipment-balance-census.csv', 'content-packages.md', 'original-battlefields.md', 'dungeon-campaigns.md']) {
  copy(path.join(root, 'docs', name), path.join(skill, 'references', name));
}
// The portable reference must not point back into this repository's public/ tree.
const packageDoc = path.join(skill, 'references/content-packages.md');
let packageText = fs.readFileSync(packageDoc, 'utf8');
for (const [source, target] of [
  ['rules.md', 'runtime-zip.md'], ['content.schema.json', '../assets/content.schema.json'],
  ['spec.json', '../assets/runtime-spec.json'], ['prompt-class.txt', '../assets/runtime-class-prompt.txt'],
  ['prompt-dungeon.txt', '../assets/runtime-dungeon-prompt.txt'],
  ['example-class.zip', '../assets/runtime-class-minimal.zip'], ['example-dungeon.zip', '../assets/runtime-dungeon-minimal.zip'],
  ['example-class-with-artwork.zip', '../assets/runtime-class.zip'], ['example-dungeon-with-artwork.zip', '../assets/runtime-dungeon.zip'],
  ['equipment-rules.md', 'equipment-rules.md'], ['equipment-limits.json', 'equipment-limits.json'],
]) packageText = packageText.replaceAll(`../public/templates/content-packages/${source}`, target);
packageText = packageText.replaceAll('../public/templates/ai-design/index.html', '../assets/ai-design/index.html')
  .replaceAll('../public/templates/ai-design/spell-fx/index.html', '../assets/ai-design/spell-fx/index.html')
  .replace('(custom-class-authoring-kit.zip)', '(../../START-HERE.md)');
fs.writeFileSync(packageDoc, packageText);

// Fail the refresh if the bundled executable cannot validate its own examples.
for (const [mode, file] of [['equipment', 'validation-equipment.json'], ['character', 'validation-character.json'],
  ['package', 'runtime-class.zip'], ['package', 'runtime-dungeon.zip']]) {
  const report = JSON.parse(execFileSync(process.execPath, [path.join(skill, 'scripts/validate.cjs'), mode,
    path.join(skill, 'assets', file)], { cwd: skill, encoding: 'utf8', maxBuffer: 4 * 1048576 }));
  if (!report.valid) throw new Error(`Portable validator rejected ${file}: ${report.errors.join(' ')}`);
}
for (const kind of ['projectile', 'impact', 'aura', 'beam']) {
  const report = JSON.parse(execFileSync(process.execPath, [path.join(skill, 'scripts/check-spell-fx.cjs'),
    path.join(skill, 'assets/ai-design/spell-fx/examples', kind)], { cwd: skill, encoding: 'utf8' }));
  if (!report.valid || report.runtimeImportable !== false) throw new Error(`Spell FX design rejected: ${kind}`);
}

const files = new Map();
function collect(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === '__pycache__') continue;
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Do not bundle a symbolic link: ${file}`);
    if (entry.isDirectory()) collect(file);
    else files.set(`retro-class-designer/${path.relative(skill, file).split(path.sep).join('/')}`, fs.readFileSync(file));
  }
}
collect(skill);
files.set('START-HERE.md', Buffer.from([
  '# Kit de création complet', '',
  'Ouvrez **retro-class-designer/assets/ai-design/index.html** pour les prompts visuels, les gabarits et les guides des cartes. Cette page fonctionne hors ligne.', '',
  '- Visuels : `retro-class-designer/assets/ai-design/START-HERE.md`',
  '- Animations de sorts : `retro-class-designer/assets/ai-design/spell-fx/index.html` (aperçu hors ligne), `references/spell-fx-design.md` et prompts 17–23 dans `assets/ai-design/prompts/`',
  '- Classes, donjons, JSON et règles : `retro-class-designer/references/runtime-zip.md`',
  '- Aventures équipées et export : `retro-class-designer/references/content-packages.md`',
  '- Prompts complets : `retro-class-designer/assets/runtime-class-prompt.txt` et `runtime-dungeon-prompt.txt`', '',
  '## Valider avec les calculs du jeu', '',
  'Node.js 20+ suffit, sans npm, réseau ni dépôt du jeu. Depuis ce dossier :', '',
  '```bash',
  'node retro-class-designer/scripts/validate.cjs package mon-package.zip',
  'node retro-class-designer/scripts/validate.cjs equipment mon-objet.json',
  'node retro-class-designer/scripts/validate.cjs character mon-personnage.json',
  'node retro-class-designer/scripts/check-spell-fx.cjs design-sources/spell-fx/mon-sort',
  '```', '',
  'Le rapport JSON contrôle les sorts (100 / 650), objets (100), stuffs (1650 hors Dofus), niveaux, FM et conditions. Le mode package contrôle aussi les dépendances et PNG. Voir `retro-class-designer/references/validation.md` pour les formats, exemples et limites. Un brouillon importable peut être refusé pour le combat.', '',
  "Ce kit est de la documentation, pas un ZIP de jeu à importer. Les personnages et icônes de sorts sont importables ; les décors de carte, PNG d'équipement et nouvelles animations de sorts restent des sources de design. Le vérificateur d'effets contrôle leurs PNG et leur timing ; il ne les installe pas en combat.", '',
].join('\n')));
const archive = writeZip(files);
const target = path.join(root, 'docs/custom-class-authoring-kit.zip');
fs.writeFileSync(target, archive);
copy(target, path.join(root, 'public/templates/custom-class-authoring-kit.zip'));
console.log(JSON.stringify({ files: files.size, bytes: archive.length, archive: target,
  download: '/templates/custom-class-authoring-kit.zip' }, null, 2));
