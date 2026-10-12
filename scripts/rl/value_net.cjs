// Forward JS pur du réseau de VALEUR (train_value.py, arch "value-v1") —
// mêmes maths que torch (GELU exact via erf, |err| ≤ 1.5e-7). Sort V ∈ [-1,1]:
// issue attendue du match pour le joueur au trait de l'obs.
//   node scripts/rl/value_net.cjs parity MODEL_DIR   # verrou de parité torch↔JS
const fs = require('node:fs');
const path = require('node:path');

function erf(x) {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-ax * ax);
  return sign * y;
}
const gelu = (x) => 0.5 * x * (1 + erf(x / Math.SQRT2));

function readLayers(dir, shapes) {
  const raw = fs.readFileSync(path.join(dir, 'weights.bin'));
  const layers = {};
  let off = 0;
  for (const spec of shapes.layers) {
    const size = spec.shape.reduce((a, b) => a * b, 1);
    const W = new Float32Array(raw.buffer, raw.byteOffset + off, size);
    off += size * 4;
    const b = new Float32Array(raw.buffer, raw.byteOffset + off, spec.shape[0]);
    off += spec.shape[0] * 4;
    layers[spec.name] = { W, b, shape: spec.shape };
  }
  if (off !== raw.byteLength) throw new Error(`weights.bin: ${raw.byteLength} octets, lu ${off}`);
  return layers;
}

function linear(layer, x, out, activate) {
  const [nout, nin] = layer.shape;
  const { W, b } = layer;
  for (let o = 0; o < nout; o++) {
    let s = b[o];
    const base = o * nin;
    for (let i = 0; i < nin; i++) s += W[base + i] * x[i];
    out[o] = activate ? gelu(s) : s;
  }
  return out;
}

function conv2d(layer, x, out, H, W2, activate) {
  const cells = H * W2;
  const [nout, nin, k] = layer.shape;
  const pad = (k - 1) >> 1;
  const { W: Wt, b } = layer;
  for (let o = 0; o < nout; o++) {
    for (let y = 0; y < H; y++) {
      for (let xx = 0; xx < W2; xx++) {
        let s = b[o];
        for (let i = 0; i < nin; i++) {
          const wBase = (o * nin + i) * k * k;
          const cBase = i * cells;
          for (let ky = 0; ky < k; ky++) {
            const sy = y + ky - pad;
            if (sy < 0 || sy >= H) continue;
            for (let kx = 0; kx < k; kx++) {
              const sx = xx + kx - pad;
              if (sx < 0 || sx >= W2) continue;
              s += Wt[wBase + ky * k + kx] * x[cBase + sy * W2 + sx];
            }
          }
        }
        out[o * cells + y * W2 + xx] = activate ? gelu(s) : s;
      }
    }
  }
  return out;
}

function loadValue(dir) {
  const shapes = JSON.parse(fs.readFileSync(path.join(dir, 'shapes.json'), 'utf8'));
  if (shapes.arch !== 'value-v1') throw new Error(`arch inattendue: ${shapes.arch}`);
  const L = readLayers(dir, shapes);
  const { n: NP, h: H, w: W2 } = shapes.planes;
  const cells = H * W2;
  const planeDim = NP * cells;
  const ch = shapes.ch;
  const gdim = shapes.gdim;
  const b1 = new Float32Array(ch * cells);
  const b2 = new Float32Array(ch * cells);
  const pooled = new Float32Array(ch);
  const g128 = new Float32Array(128);
  const g = new Float32Array(gdim);
  const cat = new Float32Array(ch + gdim);
  const hid = new Float32Array(128);
  const out1 = new Float32Array(1);
  const forward = (obs) => {
    conv2d(L.conv1, obs.subarray(0, planeDim), b1, H, W2, true);
    conv2d(L.conv2, b1, b2, H, W2, true);
    conv2d(L.conv3, b2, b1, H, W2, true);
    for (let c = 0; c < ch; c++) {
      let s = 0;
      const base = c * cells;
      for (let i = 0; i < cells; i++) s += b1[base + i];
      pooled[c] = s / cells;
    }
    linear(L.g1, obs.subarray(planeDim), g128, true);
    linear(L.g2, g128, g, true);
    cat.set(pooled, 0);
    cat.set(g, ch);
    linear(L.h1, cat, hid, true);
    linear(L.h2, hid, out1, false);
    return Math.tanh(out1[0]);
  };
  return { shapes, forward };
}

module.exports = { loadValue };

if (require.main === module) {
  const [, , mode, dir] = process.argv;
  if (mode !== 'parity' || !dir) { console.log('usage: parity MODEL_DIR'); process.exit(1); }
  const model = loadValue(dir);
  const obsDim = model.shapes.obsDim;
  const raw = fs.readFileSync(path.join(dir, 'parity_obs.bin'));
  const expected = JSON.parse(fs.readFileSync(path.join(dir, 'parity_v.json'), 'utf8'));
  const n = expected.length;
  let maxDiff = 0;
  for (let i = 0; i < n; i++) {
    const obs = new Float32Array(raw.buffer, raw.byteOffset + i * obsDim * 4, obsDim);
    const v = model.forward(obs);
    maxDiff = Math.max(maxDiff, Math.abs(v - expected[i]));
  }
  const ok = maxDiff < 2e-3;
  console.log(JSON.stringify({ n, maxDiff: +maxDiff.toExponential(3), ok }));
  process.exit(ok ? 0 : 1);
}
