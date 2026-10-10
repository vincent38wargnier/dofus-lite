// Browser and CLI deliberately use the SAME runtime manifest/ZIP validators.
require('./ai_runtime.cjs');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { inflateRawSync } = require('node:zlib');
const { File } = require('node:buffer');
const { readContentZip, writeContentZip } = require('../src/content/zip');
const { prepareContentFiles } = require('../src/ui/contentPackageImport');
const { PACKAGE_LIMITS } = require('../src/content/packageSchema');
const { decodePng } = require('../skills/retro-class-designer/scripts/class-kit.cjs');
global.File = File;

async function validateFiles(files) {
  return prepareContentFiles(files, { newId: randomUUID, verifyPixels: async (file, definition) => {
    const size = definition.frameSize || 256;
    decodePng(Buffer.from(await file.arrayBuffer()), file.name, size * definition.frames, size, definition.frames, definition.pose !== 'portrait');
  } });
}
async function readInput(input) {
  const stat = fs.lstatSync(input);
  if (stat.isSymbolicLink()) throw new Error('Symbolic links are not accepted.');
  if (stat.isDirectory()) {
    const files = new Map(); let total = 0;
    const walk = (directory, prefix = '') => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const file = path.join(directory, entry.name), relative = prefix + entry.name;
        if (entry.isSymbolicLink()) throw new Error(`Symbolic link: ${relative}`);
        if (entry.isDirectory()) { if (relative.split('/').length > 2) throw new Error(`Nested directory: ${relative}`); walk(file, relative + '/'); }
        else {
          const size = fs.statSync(file).size; total += size;
          if (size > (relative === 'content.json' ? PACKAGE_LIMITS.jsonBytes : PACKAGE_LIMITS.pngBytes)
            || total > PACKAGE_LIMITS.expandedBytes || files.size >= PACKAGE_LIMITS.files) throw new Error('Package size limit exceeded.');
          files.set(relative, new Uint8Array(fs.readFileSync(file)));
        }
      }
    };
    walk(input); return files;
  }
  if (stat.size > PACKAGE_LIMITS.zipBytes) throw new Error('Maximum 32 MiB ZIP.');
  if (path.basename(input) === 'content.json') return new Map([['content.json', new Uint8Array(fs.readFileSync(input))]]);
  return readContentZip(new Uint8Array(fs.readFileSync(input)), (bytes, size) => new Uint8Array(inflateRawSync(bytes, { maxOutputLength: Math.max(1, size) })));
}

async function main() {
  const [command, input, output] = process.argv.slice(2);
  if (!['validate', 'pack'].includes(command) || !input || command === 'pack' && !output) {
    throw new Error('Usage: node scripts/content-pack.cjs validate folder|package.zip|content.json\n       node scripts/content-pack.cjs pack folder package.zip');
  }
  const files = await readInput(input), result = await validateFiles(files);
  if (command === 'pack') {
    const bytes = writeContentZip(files);
    await readContentZip(bytes); // Including archive limits and portable paths.
    fs.writeFileSync(output, bytes);
  }
  console.log(JSON.stringify({ valid: true, type: result.manifest.type, name: result.entry.name,
    files: files.size, images: result.records.reduce((sum, record) => sum + Object.keys(record.images).length, 0),
    warnings: result.warnings, ...(output ? { output } : {}) }, null, 2));
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { validateFiles, readInput };
