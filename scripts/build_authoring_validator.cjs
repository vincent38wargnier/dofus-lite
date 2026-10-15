const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const webpack = require('webpack');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'skills/retro-class-designer/scripts');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

async function buildValidator() {
  const compiler = webpack({ mode: 'production', target: 'node20', context: root,
    entry: './scripts/authoring-validator.cjs', devtool: false,
    output: { path: output, filename: 'validation-runtime.cjs', library: { type: 'commonjs2' } },
    optimization: { minimize: false }, performance: { hints: false } });
  const stats = await new Promise((resolve, reject) => compiler.run((error, stats) => {
    compiler.close(closeError => error || closeError ? reject(error || closeError) : resolve(stats));
  }));
  if (stats.hasErrors()) throw new Error(stats.toString({ all: false, errors: true }));
  const sources = [...stats.compilation.fileDependencies].filter(file => file.startsWith(root + path.sep)
    && !file.includes(`${path.sep}node_modules${path.sep}`) && fs.statSync(file).isFile())
    .map(file => ({ path: path.relative(root, file).split(path.sep).join('/'), sha256: sha256(fs.readFileSync(file)) }))
    .sort((a, b) => a.path.localeCompare(b.path));
  const metadata = { nodeMinimum: 20, sourceSha256: sha256(JSON.stringify(sources)),
    runtimeSha256: sha256(fs.readFileSync(path.join(output, 'validation-runtime.cjs'))) };
  fs.writeFileSync(path.join(output, 'validation-build.json'), JSON.stringify(metadata, null, 2) + '\n');
  fs.writeFileSync(path.join(output, 'validate.cjs'), `#!/usr/bin/env node
// Generated portable entry. Uses only Node built-ins; run --help for usage.
require('./validation-runtime.cjs').main(process.argv.slice(2), require('./validation-build.json'))
  .catch(error => { console.error(JSON.stringify({ valid: false, errors: [error.message] })); process.exitCode = 1; });
`);
  console.log(JSON.stringify({ validator: path.relative(root, output), sources: sources.length, ...metadata }, null, 2));
}
if (require.main === module) buildValidator().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { buildValidator };
