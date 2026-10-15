// Run after npm run templates:authoring. Exercises the portable kit and its pixels.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const zlib = require('node:zlib');
const { spawnSync } = require('node:child_process');
const FX = require('../src/content/spellFxContract');
const { checkSpellFx } = require('../skills/retro-class-designer/scripts/check-spell-fx.cjs');
const root = path.resolve(__dirname, '..'), kit = path.join(root, 'skills/retro-class-designer');
const samples = path.join(kit, 'assets/ai-design/spell-fx/examples');

const invalid = (change, pattern, kind = 'projectile') => {
  const value = FX.example(kind); change(value);
  const report = FX.validate(value);
  assert.equal(report.valid, false); assert.match(report.errors.join(' '), pattern);
};
function fixture(t, kind = 'projectile') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spell-fx-test-'));
  fs.cpSync(path.join(samples, kind), dir, { recursive: true });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function pixels(kind) {
  // A small independent PNG encoder for meaningful blank/opaque-frame fixtures.
  const width = 2048, height = 256, scan = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const at = y * (width * 4 + 1) + 1 + x * 4;
    scan[at] = 240; scan[at + 1] = 180; scan[at + 2] = 100;
    scan[at + 3] = kind === 'opaque' ? 255 : kind === 'blank-last' && x >= 1792 ? 0 : x % 256 === 128 && y === 128 ? 255 : 0;
  }
  const crc = bytes => { let value = 0xffffffff; for (const byte of bytes) { value ^= byte; for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0); } return (value ^ 0xffffffff) >>> 0; };
  const chunk = (name, data) => { const tag = Buffer.from(name), buf = Buffer.alloc(data.length + 12); buf.writeUInt32BE(data.length); tag.copy(buf, 4); data.copy(buf, 8); buf.writeUInt32BE(crc(Buffer.concat([tag, data])), data.length + 8); return buf; };
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(scan)), chunk('IEND', Buffer.alloc(0))]);
}

for (const kind of ['projectile', 'impact', 'aura', 'beam']) test(`${kind}: supplied source folder validates with all its frames`, () => {
  const result = checkSpellFx(path.join(samples, kind));
  assert.deepEqual(result.errors, []); assert.equal(result.valid, true);
  assert.equal(result.runtimeImportable, false); assert.equal(result.visualReview, 'not-run');
  assert.equal(result.files.length, FX.example(kind).layers.length);
});

test('a valid straight projectile and one-frame aura are also authorable', () => {
  const line = FX.example('projectile'); line.travel.kind = 'line'; line.travel.arcHeightPercent = 0;
  assert.equal(FX.validate(line).valid, true);
  const aura = FX.example('aura'); aura.layers[0].frames = 1;
  assert.equal(FX.validate(aura).valid, true);
});
test('impact and trail do not fire early or lose the final particle fade', () => {
  invalid(fx => { fx.layers[3].startMs = 800; }, /before arrival/);
  invalid(fx => { fx.layers[2].endMs = 1150; }, /particle lifetime/);
  invalid(fx => { fx.layers[1].endMs = 1000; }, /exact travel window/);
  invalid(fx => { fx.layers[0].endMs = 200; }, /cuts off/);
});
test('roles, references and timing cannot masquerade as game or script configuration', () => {
  invalid(fx => { fx.runtimeImportable = true; }, /expected false/);
  invalid(fx => { fx.damage = 1000; }, /unknown field/);
  invalid(fx => { fx.layers[0].file = '../escape.png'; }, /filename/);
  invalid(fx => { fx.layers[0].file = 'https://host/x.png'; }, /filename/);
  invalid(fx => { fx.durationMs = 2500; }, /100–2000/);
  invalid(fx => { fx.layers[0].frames = 17; }, /1–16/);
});
test('rejects looping one-shots, duplicate identities and incoherent attachments', () => {
  invalid(fx => { fx.layers[0].loop = true; }, /play once/);
  invalid(fx => { fx.layers[2].loop = true; }, /play once/);
  invalid(fx => { fx.layers[1].file = 'cast.png'; }, /own filename/);
  invalid(fx => { fx.layers.push({ ...fx.layers[0] }); }, /only once/);
  invalid(fx => { fx.layers[0].attachment = 'target'; }, /attachment/);
  invalid(fx => { fx.layers[0].rotation = 'path'; }, /only projectile/);
});
test('beam anchor and path constraints are explicit', () => {
  invalid(fx => { fx.layers[1].anchor.x = 128; }, /anchor/, 'beam');
  invalid(fx => { fx.travel.kind = 'line'; fx.travel.endMs = 600; }, /requires a projectile/, 'beam');
  invalid(fx => { fx.travel.arcHeightPercent = 10; }, /must be zero/, 'aura');
});
test('projectiles arrive at the exact target in all directions, also at zero distance', () => {
  const travel = FX.example().travel, from = { x: 200, y: 150 };
  for (const to of [{ x: 500, y: 170 }, { x: 20, y: 150 }, { x: 200, y: 300 }, { x: 200, y: 10 }, from]) {
    const start = FX.position(travel, from, to, travel.startMs), end = FX.position(travel, from, to, travel.endMs);
    assert.equal(start.x, from.x); assert.equal(start.y, from.y); assert.equal(end.x, to.x); assert.equal(end.y, to.y);
    assert.equal(Number.isFinite(start.angle) && Number.isFinite(end.angle), true);
    const middle = FX.position(travel, from, to, (travel.startMs + travel.endMs) / 2);
    assert.equal(middle.x, (from.x + to.x) / 2); assert.ok(middle.y <= (from.y + to.y) / 2);
  }
});
test('last blank frame and opaque sheets fail actual pixel validation', t => {
  const dir = fixture(t, 'impact');
  for (const [kind, error] of [['blank-last', /empty animation frame/], ['opaque', /transparent pixels/]]) {
    fs.writeFileSync(path.join(dir, 'impact.png'), pixels(kind));
    const report = checkSpellFx(dir); assert.equal(report.valid, false); assert.match(report.errors.join(' '), error);
  }
  fs.writeFileSync(path.join(dir, 'impact.png'), pixels('minimal'));
  assert.equal(checkSpellFx(dir).valid, true);
});
test('missing, malformed and undeclared files are rejected without execution', t => {
  const dir = fixture(t, 'impact'), img = path.join(dir, 'impact.png');
  fs.unlinkSync(img); assert.equal(checkSpellFx(dir).valid, false);
  fs.writeFileSync(img, 'not png'); assert.match(checkSpellFx(dir).errors.join(' '), /invalid.*PNG/);
  fs.writeFileSync(path.join(dir, 'run.js'), 'throw Error("should never execute")');
  assert.match(checkSpellFx(dir).errors.join(' '), /Undeclared file/);
});
test('symlinked images and wrong strip dimensions do not pass', t => {
  const dir = fixture(t, 'impact'), file = path.join(dir, 'impact.png');
  fs.unlinkSync(file); fs.symlinkSync(path.join(samples, 'impact/impact.png'), file);
  assert.match(checkSpellFx(dir).errors.join(' '), /regular file/);
  fs.unlinkSync(file); fs.copyFileSync(path.join(samples, 'impact/impact.png'), file);
  const manifest = FX.example('impact'); manifest.layers[0].frames = 4;
  fs.writeFileSync(path.join(dir, 'effect.json'), JSON.stringify(manifest));
  assert.match(checkSpellFx(dir).errors.join(' '), /expected 1024/);
});
test('CLI returns machine-readable success and failure outside repository cwd', t => {
  const dir = fixture(t, 'aura'), cli = path.join(kit, 'scripts/check-spell-fx.cjs');
  const run = () => spawnSync(process.execPath, [cli, dir], { cwd: os.tmpdir(), encoding: 'utf8' });
  let result = run(); assert.equal(result.status, 0); assert.equal(JSON.parse(result.stdout).valid, true);
  fs.writeFileSync(path.join(dir, 'effect.json'), '{bad');
  result = run(); assert.equal(result.status, 1); assert.equal(JSON.parse(result.stdout).valid, false);
});
