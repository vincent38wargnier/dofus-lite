// Fidélité des états stockés (loop 1): pour N records tirés au hasard d'un shard
// afterstate_gen.cjs, re-parse l'après-état JSON (s.jsonl.gz), RECALCULE
// l'étiquette C1 (riposte maison h=1 + juge main) et RÉ-ENCODE l'obs: les deux
// doivent être identiques au bit près à ce qui a été écrit. Preuve qu'un
// ré-étiquetage futur (recherche améliorée) part exactement des bonnes positions.
//   node scripts/rl/afterstate_relabel_check.cjs SHARD_BASE [N=200]
require('../ai_runtime.cjs');
const fs = require('node:fs');
const zlib = require('node:zlib');
const { getView, currentFighter } = require('../../src/engine/engine');
const sb = require('./search_bot.cjs');
const enc = require('./encoder.cjs');
const { encodeF16 } = require('./f16.cjs');

const [, , base, nArg] = process.argv;
const N = Number(nArg || 200);
const meta = JSON.parse(fs.readFileSync(`${base}.meta.json`, 'utf8'));
const D = meta.obsDim;
const y = new Float32Array(fs.readFileSync(`${base}.y.f32`).buffer.slice(0));
const r = fs.readFileSync(`${base}.r.u8`);
const xs = fs.readFileSync(`${base}.x.f16`);
const lines = zlib.gunzipSync(fs.readFileSync(`${base}.s.jsonl.gz`)).toString().split('\n').filter(Boolean);
if (lines.length !== meta.records) { console.log(JSON.stringify({ ok: false, error: `s.jsonl.gz ${lines.length} lignes ≠ ${meta.records} records` })); process.exit(1); }
const roots = zlib.gunzipSync(fs.readFileSync(`${base}.root.jsonl.gz`)).toString().split('\n').filter(Boolean);
const decs = fs.readFileSync(`${base}.dec.jsonl`, 'utf8').split('\n').filter(Boolean);
let s = 7;
const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
const f32 = new Float32Array(D);
let labelSame = 0; let labelChecked = 0; let obsSame = 0; let obsChecked = 0;
const bad = [];
sb.setHorizon(1); // profil C1 de l'étiquette
for (let t = 0; t < Math.min(N, meta.records); t++) {
  const i = Math.floor(rnd() * meta.records);
  const after = JSON.parse(lines[i]);
  const toMove = currentFighter(after);
  const view = getView(after, toMove.id);
  enc.encodeSampleV3({ view, board: view.board }, null, f32);
  const h = encodeF16(f32, new Uint16Array(D));
  const stored = new Uint16Array(xs.buffer, xs.byteOffset + i * D * 2, D);
  obsChecked++;
  if (h.every((v, j) => v === stored[j])) obsSame++; else bad.push({ i, what: 'obs' });
  if (r[i] === 4) continue; // rôle Q: pas d'étiquette
  const me = Object.values(after.fighters).find((f) => f.id !== toMove.id);
  const v = sb.depth2Score(after, me.id, me.team, { applies: 0 }, null);
  labelChecked++;
  if (Math.fround(-v / 1000) === y[i]) labelSame++; else bad.push({ i, what: 'label', stored: y[i], recomputed: -v / 1000 });
}
sb.setHorizon(null);
const ok = labelSame === labelChecked && obsSame === obsChecked && roots.length === decs.length;
console.log(JSON.stringify({ base, ok, labelChecked, labelSame, obsChecked, obsSame, rootLines: roots.length, decLines: decs.length, bad: bad.slice(0, 5) }));
process.exit(ok ? 0 : 1);
