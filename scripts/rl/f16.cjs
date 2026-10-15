// Conversion float32 → float16 (IEEE 754 binary16, arrondi au plus proche pair)
// pour les shards d'après-états (loop 1): obs ≈ 6 Ko au lieu de 12 Ko.
// Vérifiée bit à bit contre numpy.float16: node scripts/rl/f16.cjs selftest
const F = new Float32Array(1);
const U = new Uint32Array(F.buffer);

function toHalfBits(v) {
  F[0] = v;
  const x = U[0];
  const sign = (x >>> 16) & 0x8000;
  const exp = (x >>> 23) & 0xff;
  const mant = x & 0x7fffff;
  if (exp === 0xff) return sign | 0x7c00 | (mant ? 0x200 : 0); // inf / nan
  const e = exp - 127 + 15;
  if (e >= 0x1f) return sign | 0x7c00; // dépassement → inf
  if (e <= 0) { // sous-normal half
    if (e < -10) return sign;
    const m24 = mant | 0x800000;
    const shift = 14 - e;
    let h = m24 >>> shift;
    const rem = m24 & ((1 << shift) - 1);
    const half = 1 << (shift - 1);
    if (rem > half || (rem === half && (h & 1))) h++;
    return sign | h;
  }
  let h = sign | (e << 10) | (mant >>> 13);
  const rem = mant & 0x1fff;
  if (rem > 0x1000 || (rem === 0x1000 && (h & 1))) h++; // retenue vers l'exposant = correct
  return h;
}

function encodeF16(src, out16) {
  for (let i = 0; i < src.length; i++) out16[i] = toHalfBits(src[i]);
  return out16;
}

module.exports = { toHalfBits, encodeF16 };

if (require.main === module && process.argv[2] === 'selftest') {
  const fs = require('node:fs');
  const { execFileSync } = require('node:child_process');
  const vals = [0, -0, 1, -1, 0.5, 1 / 3, 65504, 65520, 1e-8, 6e-8, 5.96e-8, 2.98e-8, 6.1e-5, 1e5, -1e5, Infinity, -Infinity];
  let s = 12345;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  for (let i = 0; i < 200000; i++) vals.push((rnd() - 0.5) * Math.pow(10, Math.floor(rnd() * 14) - 9));
  const f32 = Float32Array.from(vals);
  const h = encodeF16(f32, new Uint16Array(f32.length));
  fs.writeFileSync('/tmp/f16_in.f32', Buffer.from(f32.buffer));
  fs.writeFileSync('/tmp/f16_js.u16', Buffer.from(h.buffer));
  const res = execFileSync('python3', ['-c', `
import numpy as np, json
a = np.fromfile('/tmp/f16_in.f32', dtype=np.float32)
ref = a.astype(np.float16).view(np.uint16)
js = np.fromfile('/tmp/f16_js.u16', dtype=np.uint16)
bad = np.flatnonzero(ref != js)
print(json.dumps({"n": int(a.size), "mismatch": int(bad.size), "first": [[float(a[i]), int(ref[i]), int(js[i])] for i in bad[:5]]}))
`]).toString();
  console.log(res.trim());
  process.exit(JSON.parse(res).mismatch === 0 ? 0 : 1);
}
