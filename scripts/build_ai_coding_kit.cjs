const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const webpack = require('webpack');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'public/templates/ai-coding');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function buildAiCodingKit() {
  fs.mkdirSync(output, { recursive: true });
  const compiler = webpack({ mode: 'production', target: 'node20', context: root, entry: './scripts/ai-test-runtime.cjs', devtool: false,
    output: { path: output, filename: 'runtime.cjs', library: { type: 'commonjs2' } },
    plugins: [new webpack.DefinePlugin({ 'process.env.NODE_ENV': JSON.stringify('test') })],
    optimization: { minimize: false, nodeEnv: false }, performance: { hints: false } });
  const stats = await new Promise((resolve, reject) => compiler.run((error, stats) => {
    compiler.close(closeError => error || closeError ? reject(error || closeError) : resolve(stats));
  }));
  if (stats.hasErrors()) throw new Error(stats.toString({ all: false, errors: true }));
  const sources = [...stats.compilation.fileDependencies].filter(f => f.startsWith(root + path.sep) && !f.includes('/node_modules/') && fs.statSync(f).isFile())
    .map(f => ({ path: path.relative(root, f), sha256: hash(fs.readFileSync(f)) })).sort((a,b) => a.path.localeCompare(b.path));
  fs.writeFileSync(path.join(output, 'runtime-version.json'), JSON.stringify({ format: 'koliseum-ai-code-kit', version: 1, nodeMinimum: 20,
    sourceSha256: hash(JSON.stringify(sources)), runtimeSha256: hash(fs.readFileSync(path.join(output, 'runtime.cjs'))) }, null, 2) + '\n');
  fs.copyFileSync(path.join(root, 'scripts/templates/ai-coding/test.cjs'), path.join(output, 'test.cjs'));
  const readable = ['src/bots/api.js','src/bots/compile.js','src/bots/maison.js','src/bots/utilityBrain.js',
    'src/bots/tactics.js','src/bots/visualPlanner.js','src/bots/maisonStages.js','src/bots/aiCodeTesting.js',
    'src/arena/runner.js','src/engine/engine.js'];
  fs.writeFileSync(path.join(output, 'sources.json'), JSON.stringify(Object.fromEntries(readable.map(file => [file, fs.readFileSync(path.join(root, file), 'utf8')]))));
  console.log(`AI coding kit: ${sources.length} sources, ${(fs.statSync(path.join(output, 'runtime.cjs')).size / 1048576).toFixed(1)} MiB, Node.js 20+`);
}
if (require.main === module) buildAiCodingKit().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { buildAiCodingKit };
