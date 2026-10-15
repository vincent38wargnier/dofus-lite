#!/usr/bin/env node
// Portable Node.js 20+ launcher. A worker deadline also catches dynamic loops
// and recursive code which cannot be covered by the game's loop instrumentation.
const fs = require('node:fs');
const path = require('node:path');
const { Worker, isMainThread, parentPort, workerData } = require('node:worker_threads');
const { createHash } = require('node:crypto');
const sha = data => createHash('sha256').update(data).digest('hex');

async function main(args = process.argv.slice(2)) {
  if (!args.length || args.includes('--help')) {
    console.log(`AI coding kit — Node.js 20+
node test.cjs check bot.js
node test.cjs duel bot.js --against maison
node test.cjs benchmark bot.js --against maison --seed 12000 --report results.json

Options: --fighter fighter.json (default: beside bot.js)
         --opponent rival-fighter.json (default: same fighter)
         --against maison|cortex|brutus|plume|toubib|pantin|./rival.js
         --seed 12000  --timeout 180 (seconds, 1–3600)  --report results.json

check: syntax + 10 real combat situations; duel: 1 match;
benchmark: 6 matches, 3 maps, both sides. --seed reproduces api.random().
Exit 0: tested code is legal; exit 1: code/runtime/comparison error or timeout.
A lost match or turn-limit draw does not fail validation. Passing is not proof of strength.
Runtime functions: checkAiCode, benchmarkAiCode, aiTestCases, checkAiAction.
JavaScript executes as local code, not in a security sandbox.`);
    return;
  }
  if (Number(process.versions.node.split('.')[0]) < 20) throw new Error('Node.js 20+ required.');
  const [command, file, ...flags] = args;
  if (!['check', 'duel', 'benchmark'].includes(command) || !file || file.startsWith('--')) throw new Error('Use --help for commands.');
  const options = {};
  for (let i = 0; i < flags.length; i += 2) {
    const key = flags[i], value = flags[i + 1];
    if (!['--fighter','--opponent','--against','--seed','--timeout','--report'].includes(key) || !value || value.startsWith('--') || options[key] !== undefined) throw new Error(`Invalid option ${key}.`);
    options[key] = value;
  }
  const filePath = path.resolve(file), code = fs.readFileSync(filePath, 'utf8');
  const fighter = JSON.parse(fs.readFileSync(path.resolve(options['--fighter'] || path.join(path.dirname(filePath), 'fighter.json')), 'utf8'));
  const opponent = options['--opponent'] ? JSON.parse(fs.readFileSync(path.resolve(options['--opponent']), 'utf8')) : fighter;
  const against = options['--against'] || 'maison';
  const opponentCode = against.endsWith('.js') ? fs.readFileSync(path.resolve(against), 'utf8') : undefined;
  const seed = Number(options['--seed'] || 12000), timeout = Number(options['--timeout'] || 180);
  if (!Number.isInteger(seed) || seed < 0 || seed > 2147483644) throw new Error('Invalid seed (0–2147483644).');
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > 3600) throw new Error('Invalid timeout (1–3600 seconds).');
  const runtimePath = path.join(__dirname, 'runtime.cjs');
  const metadata = JSON.parse(fs.readFileSync(path.join(__dirname, 'runtime-version.json'), 'utf8'));
  if (sha(fs.readFileSync(runtimePath)) !== metadata.runtimeSha256) throw new Error('Test runtime differs from its recorded version. Download a fresh kit.');
  const config = { code, fighter, opponent, against, opponentCode, seed, count: command === 'benchmark' ? 6 : 1 };
  const result = await new Promise((resolve, reject) => {
    const worker = new Worker(__filename, { workerData: { command, config }, stdout: true, stderr: true });
    // Keep stdout as one JSON report; cap/discard log floods from user code.
    worker.stdout.resume(); worker.stderr.resume();
    const timer = setTimeout(() => { worker.terminate(); resolve({ ok: false, errors: [`Timeout after ${timeout}s. No successful validation was recorded.`] }); }, timeout * 1000);
    worker.once('message', result => { clearTimeout(timer); worker.terminate(); resolve(result); });
    worker.once('error', error => { clearTimeout(timer); reject(error); });
    worker.once('exit', code => { clearTimeout(timer); resolve({ ok: false, errors: [`Test worker exited before reporting (${code}).`] }); });
  });
  const report = { command, ...result, version: metadata, sourceSha256: sha(code), fighterSha256: sha(JSON.stringify(fighter)),
    opponentSha256: sha(JSON.stringify(opponent)), opponentCodeSha256: opponentCode ? sha(opponentCode) : null,
    seed, against, fighter: { name: fighter.name, classId: fighter.classId },
    scope: 'Actual game engine, selected fighter; correctness and win rate are separate. No browser artwork or neural models.' };
  const json = JSON.stringify(report, null, 2) + '\n';
  if (options['--report']) {
    const target = path.resolve(options['--report']);
    const inputs = [filePath, path.resolve(options['--fighter'] || path.join(path.dirname(filePath), 'fighter.json')), runtimePath,
      __filename, path.join(__dirname, 'runtime-version.json'), ...(options['--opponent'] ? [path.resolve(options['--opponent'])] : []),
      ...(opponentCode ? [path.resolve(against)] : [])];
    if (inputs.includes(target)) throw new Error('Report must not overwrite test inputs or tools.');
    fs.writeFileSync(target, json);
  }
  process.stdout.write(json);
  if (!report.ok || report.comparisonValid === false) process.exitCode = 1;
}

if (!isMainThread) {
  (async () => {
    try {
      const runtime = require('./runtime.cjs');
      const result = workerData.command === 'check' ? runtime.checkAiCode(workerData.config) : await runtime.benchmarkAiCode(workerData.config);
      parentPort.postMessage(result);
    } catch (error) { parentPort.postMessage({ ok: false, errors: [error.message] }); }
  })();
} else if (require.main === module) main().catch(error => {
  console.error(JSON.stringify({ ok: false, errors: [error.message] })); process.exitCode = 1;
});
module.exports = { main };
