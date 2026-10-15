// Portable design-source validation. Does not install or execute an effect.
const fs = require('node:fs');
const path = require('node:path');
const FX = require('../assets/ai-design/spell-fx/contract.js');
const { decodePng } = require('./class-kit.cjs');

function checkSpellFx(folder) {
  const files = [], errors = [];
  const safeFile = (name, max) => {
    const file = path.join(folder, name), stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > max) throw new Error(`${name}: regular file required, maximum ${max} bytes.`);
    return fs.readFileSync(file);
  };
  const stat = fs.lstatSync(folder);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Provide a regular effect folder.');
  const bytes = safeFile('effect.json', FX.limits.jsonBytes);
  const manifest = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  const report = FX.validate(manifest);
  if (report.valid) {
    const names = new Set(['effect.json', ...manifest.layers.map(row => row.file)]);
    for (const entry of fs.readdirSync(folder)) if (!names.has(entry)) errors.push(`Undeclared file: ${entry}. Keep prompts/guides outside this folder.`);
    for (const row of manifest.layers) {
      try {
        const png = safeFile(row.file, FX.limits.pngBytes);
        const decoded = decodePng(png, row.file, row.frames * row.frameSize, row.frameSize, row.frames, true);
        files.push({ file: row.file, ...decoded, bytes: png.length });
      } catch (error) { errors.push(error.message); }
    }
    if (files.reduce((sum, file) => sum + file.bytes, bytes.length) > FX.limits.totalBytes) errors.push('Effect folder exceeds 12 MiB.');
  }
  errors.push(...report.errors);
  return { valid: !errors.length, format: 'dofus-lite-spell-fx-design-validation', version: 1,
    runtimeImportable: false, visualReview: 'not-run', name: manifest.name, files, errors,
    scope: 'Design manifest, timing, paths, PNG pixels, nonempty transparent frames and sizes. Not game-import or combat/balance validation.' };
}
module.exports = { checkSpellFx };
if (require.main === module) {
  try {
    if (process.argv.length !== 3) throw new Error('Usage: node scripts/check-spell-fx.cjs <effect-folder>');
    const report = checkSpellFx(process.argv[2]); console.log(JSON.stringify(report, null, 2)); process.exitCode = report.valid ? 0 : 1;
  } catch (error) { console.log(JSON.stringify({ valid: false, runtimeImportable: false, errors: [error.message] }, null, 2)); process.exitCode = 1; }
}
