// Executed against a copied runtime outside the repository: no npm/modules.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'koliseum-ai-tests-'));
const source = path.resolve(__dirname, '../public/templates/ai-coding');
for (const f of ['runtime.cjs','runtime-version.json','test.cjs']) fs.copyFileSync(path.join(source, f), path.join(folder, f));
fs.writeFileSync(path.join(folder, 'fighter.json'), JSON.stringify({ name: 'Invocateur', classId: 'OSAMODAS' }));
after(() => fs.rmSync(folder, { recursive: true, force: true }));
function run(name, code, command = 'check', options = []) {
  fs.writeFileSync(path.join(folder, `${name}.js`), code);
  const result = spawnSync(process.execPath, ['test.cjs', command, `${name}.js`, ...options], {
    cwd: folder, encoding: 'utf8', timeout: 30000, env: { ...process.env, NODE_PATH: '', NODE_OPTIONS: '' },
  });
  assert(!result.error, result.error?.message);
  const report = JSON.parse(result.stdout || result.stderr);
  return { ...result, report };
}
test('portable checks use real Osamodas and Maison without repository or npm', () => {
  const { status, report } = run('maison', 'function decide(v,a){return a.maison();}');
  assert.equal(status, 0); assert.equal(report.ok, true); assert.equal(report.cases.length, 10);
  assert.equal(report.fighter.classId, 'OSAMODAS'); assert.match(report.sourceSha256, /^[a-f0-9]{64}$/);
});
test('illegal actions and exceptions fail with structured reasons', () => {
  for (const code of ['function decide(){return {type:"NOPE"};}', 'function decide(){throw Error("broken");}', 'function decide(){}']) {
    const { status, report } = run('bad', code);
    assert.equal(status, 1); assert.equal(report.ok, false); assert(report.errors.length);
  }
});
test('ordinary infinite loops and dynamically created loops are stopped', () => {
  const guarded = run('loop', 'function decide(){while(true){}}');
  assert.equal(guarded.status, 1); assert.match(guarded.report.errors[0], /Boucle infinie/);
  const dynamic = run('dynamic', 'function decide(){return Function("while(true){}")();}', 'check', ['--timeout','1']);
  assert.equal(dynamic.status, 1); assert.match(dynamic.report.errors[0], /Timeout/);
});
test('early worker exit is a failure, never a hang or success', () => {
  const result = run('exit', 'function decide(){process.exit(0);}');
  assert.equal(result.status, 1); assert.match(result.report.errors[0], /exited before/);
});
test('six mirrored draws are valid tests and reports can be saved', () => {
  const pass = 'function decide(v,a){return a.endTurn();}';
  fs.writeFileSync(path.join(folder, 'rival.js'), pass);
  const { status, report } = run('pass', pass, 'benchmark', ['--against','./rival.js','--report','results.json']);
  // The engine ends the draw when advancing from round 40 to round 41.
  assert.equal(status, 0); assert.deepEqual(report.summary, { wins: 0, losses: 0, draws: 6, invalidActions: 0, errors: 0, meanTurns: 41 });
  assert.equal(report.games.length, 6); assert.equal(report.comparisonValid, true);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(folder, 'results.json'), 'utf8')), report);
});
test('neural models are explicitly unavailable instead of silently using another AI', () => {
  const result = run('neural', 'function decide(v,a){return a.neural();}');
  assert.equal(result.status, 1); assert.match(result.report.errors[0], /modèles/);
});
test('syntax errors and unknown options are not silently accepted', () => {
  const result = run('syntax', 'function decide(v,a) {', 'check');
  assert.equal(result.status, 1); assert.equal(result.report.ok, false);
  const flag = run('flag', 'function decide(v,a){return a.endTurn();}', 'check', ['--typo', '1']);
  assert.equal(flag.status, 1); assert.match(flag.report.errors[0], /Invalid option/);
});
