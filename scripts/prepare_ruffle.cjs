const fs = require('node:fs');
const path = require('node:path');

const source = path.dirname(require.resolve('@ruffle-rs/ruffle/package.json'));
const target = path.join(__dirname, '..', 'public', 'ruffle');
fs.mkdirSync(target, { recursive: true });
for (const name of fs.readdirSync(source)) {
  if (/\.(js|wasm)$/.test(name) || /license/i.test(name)) {
    fs.copyFileSync(path.join(source, name), path.join(target, name));
  }
}
console.log('Local Ruffle runtime ready.');
