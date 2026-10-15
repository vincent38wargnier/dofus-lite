// Portable technical PNG check; does not edit files or certify visual quality.
const fs = require('node:fs');
const path = require('node:path');
const { decodePng } = require('./class-kit.cjs');
const spec = require('../assets/artwork-spec.json');
const MiB = 1048576;

function checkVisuals(kind, target) {
  const files = [], errors = [];
  if (!['character', 'icon'].includes(kind) || !target) throw new Error('Usage: node scripts/check-visuals.cjs character <folder> | icon <file.png>');
  const inspect = (file, width, height, frames, transparent) => {
    try {
      if (fs.statSync(file).size > 2 * MiB) throw new Error(`${file}: maximum 2 MiB.`);
      const bytes = fs.readFileSync(file);
      decodePng(bytes, path.basename(file), width, height, frames, transparent);
      files.push({ name: path.basename(file), width, height, frames, bytes: bytes.length });
    } catch (error) { errors.push(error.message); }
  };
  if (kind === 'icon') inspect(target, 64, 64, 1, false);
  else {
    const names = fs.readdirSync(target).filter(name => name.toLowerCase().endsWith('.png'));
    for (const name of names) if (!spec.files.some(file => file.name === name)) errors.push(`Unknown character PNG: ${name}`);
    for (const file of spec.files) {
      if (!names.includes(file.name)) { if (file.required) errors.push(`Missing required PNG: ${file.name}`); continue; }
      inspect(path.join(target, file.name), file.frames * spec.frameSize, spec.frameSize, file.frames, file.pose !== 'portrait');
    }
    if (files.reduce((n, file) => n + file.bytes, 0) > 12 * MiB) errors.push('Character set: maximum 12 MiB.');
  }
  return { valid: errors.length === 0, files, errors,
    scope: 'PNG encoding, dimensions, alpha, nonempty frames and size. Review anchors, facing, animation consistency and readability visually. Not a playable-ZIP or balance validation.' };
}
module.exports = { checkVisuals };
if (require.main === module) {
  try { const result = checkVisuals(process.argv[2], process.argv[3]); console.log(JSON.stringify(result, null, 2)); process.exitCode = result.valid ? 0 : 1; }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
