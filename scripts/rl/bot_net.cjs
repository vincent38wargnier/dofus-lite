// Bot d'inférence du réseau BC/RL — forward pass JS pur (zéro dépendance
// native), mêmes maths que les modèles PyTorch exportés (GELU exact via erf).
// Deux architectures: "mlp" (train_bc.py) et "spatial-v2" (train_bc2.py,
// tronc conv sur les planes + têtes par case). Choisit la MEILLEURE ACTION
// LÉGALE: logits triés, puis validation par l'api officielle (canMove/
// canCast) — jamais l'état interne.
const fs = require('node:fs');
const path = require('node:path');
const enc = require('./encoder.cjs');

// erf (Abramowitz & Stegun 7.1.26, |err| ≤ 1.5e-7) → GELU exact de PyTorch.
function erf(x) {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-ax * ax);
  return sign * y;
}
const gelu = (x) => 0.5 * x * (1 + erf(x / Math.SQRT2));

const H = enc.MAX_H;
const W = enc.MAX_W;
const CELLS = enc.CELLS;

function readLayers(dir, shapes) {
  const raw = fs.readFileSync(path.join(dir, 'weights.bin'));
  const layers = {};
  let off = 0;
  const specs = shapes.layers.map((l) => l.name
    ? l // spatial-v2: { name, type, shape }
    : { name: `lin${shapes.layers.indexOf(l)}`, type: 'linear', shape: [l.out, l.in] });
  for (const spec of specs) {
    const size = spec.shape.reduce((a, b) => a * b, 1);
    const Wt = new Float32Array(raw.buffer, raw.byteOffset + off, size);
    off += size * 4;
    const b = new Float32Array(raw.buffer, raw.byteOffset + off, spec.shape[0]);
    off += spec.shape[0] * 4;
    layers[spec.name] = { W: Wt, b, shape: spec.shape, type: spec.type };
  }
  return layers;
}

function linear(layer, x, out, activate) {
  const [nout, nin] = layer.shape;
  const { W: Wt, b } = layer;
  for (let o = 0; o < nout; o++) {
    let s = b[o];
    const base = o * nin;
    for (let i = 0; i < nin; i++) s += Wt[base + i] * x[i];
    out[o] = activate ? gelu(s) : s;
  }
  return out;
}

// Conv2d channels-first sur grille H×W aplatie (idx = c*CELLS + y*W + x),
// poids (out, in, k, k) row-major, padding (k-1)/2.
function conv2d(layer, x, out, activate) {
  const [nout, nin, k] = layer.shape;
  const pad = (k - 1) >> 1;
  const { W: Wt, b } = layer;
  for (let o = 0; o < nout; o++) {
    for (let y = 0; y < H; y++) {
      for (let xx = 0; xx < W; xx++) {
        let s = b[o];
        for (let i = 0; i < nin; i++) {
          const wBase = (o * nin + i) * k * k;
          const cBase = i * CELLS;
          for (let ky = 0; ky < k; ky++) {
            const sy = y + ky - pad;
            if (sy < 0 || sy >= H) continue;
            for (let kx = 0; kx < k; kx++) {
              const sx = xx + kx - pad;
              if (sx < 0 || sx >= W) continue;
              s += Wt[wBase + ky * k + kx] * x[cBase + sy * W + sx];
            }
          }
        }
        const v = activate ? gelu(s) : s;
        out[o * CELLS + y * W + xx] = v;
      }
    }
  }
  return out;
}

function buildForward(shapes, layers) {
  if (shapes.arch !== 'spatial-v2') {
    // MLP v1: suite de linear, GELU partout sauf la dernière.
    const seq = Object.values(layers);
    const bufs = seq.map((l) => new Float32Array(l.shape[0]));
    return (x) => {
      let cur = x;
      seq.forEach((l, i) => { linear(l, cur, bufs[i], i < seq.length - 1); cur = bufs[i]; });
      return cur;
    };
  }
  const ch = shapes.ch;
  const planeDim = shapes.planes.n * CELLS;
  const slots = shapes.spellSlots;
  const t1 = new Float32Array(ch * CELLS);
  const t2 = new Float32Array(ch * CELLS);
  const t3 = new Float32Array(ch * CELLS);
  const h1 = new Float32Array(layers.g1.shape[0]);
  const g = new Float32Array(layers.g2.shape[0]);
  const f = new Float32Array(layers.fuse.shape[0] * CELLS);
  const move = new Float32Array(CELLS);
  const cast = new Float32Array(slots * CELLS);
  const passIn = new Float32Array(g.length + ch);
  const pas = new Float32Array(1);
  const logits = new Float32Array(shapes.actionDim);
  const gdim = g.length;
  const fdim = layers.fuse.shape[0];
  return (x) => {
    conv2d(layers.conv1, x.subarray(0, planeDim), t1, true);
    conv2d(layers.conv2, t1, t2, true);
    conv2d(layers.conv3, t2, t3, true);
    linear(layers.g1, x.subarray(planeDim), h1, true);
    linear(layers.g2, h1, g, true);
    // fuse (1×1): out[o,c] = gelu(b + Σ_i Wt[o,i]·t3[i,c] + Σ_j Wg[o,j]·g[j])
    // → la partie g est constante par case, calculée une fois par canal.
    const { W: Wf, b: bf } = layers.fuse;
    const nin = layers.fuse.shape[1]; // ch + gdim
    for (let o = 0; o < fdim; o++) {
      let gPart = bf[o];
      for (let j = 0; j < gdim; j++) gPart += Wf[o * nin + ch + j] * g[j];
      for (let c = 0; c < CELLS; c++) {
        let s = gPart;
        for (let i = 0; i < ch; i++) s += Wf[o * nin + i] * t3[i * CELLS + c];
        f[o * CELLS + c] = gelu(s);
      }
    }
    conv2d(layers.move_head, f, move, false);
    conv2d(layers.cast_head, f, cast, false);
    for (let i = 0; i < ch; i++) {
      let s = 0;
      for (let c = 0; c < CELLS; c++) s += t3[i * CELLS + c];
      passIn[gdim + i] = s / CELLS;
    }
    passIn.set(g, 0);
    linear(layers.pass_head, passIn, pas, false);
    logits[0] = pas[0];
    logits.set(move, 1);
    logits.set(cast, 1 + CELLS);
    return logits;
  };
}

function loadModel(dir) {
  const shapes = JSON.parse(fs.readFileSync(path.join(dir, 'shapes.json'), 'utf8'));
  if (shapes.featureVersion !== enc.FEATURE_VERSION) {
    throw new Error(`featureVersion ${shapes.featureVersion} ≠ encodeur ${enc.FEATURE_VERSION}`);
  }
  const layers = readLayers(dir, shapes);
  return { shapes, layers, forward: buildForward(shapes, layers) };
}

// Indices des logits triés décroissants.
function argsortDesc(logits) {
  const idx = Array.from(logits.keys());
  idx.sort((a, b) => logits[b] - logits[a]);
  return idx;
}

const MAX_TRIES = 64;

function makeNetBot(modelDir, name = 'net') {
  // ORT (natif) si model.onnx est présent et chargeable, sinon forward JS.
  let model;
  try { model = require('./bot_net_ort.cjs').loadModel(modelDir); }
  catch { model = loadModel(modelDir); }
  const obs = new Float32Array(enc.OBS_DIM);
  const stats = { decisions: 0, fallbackSum: 0, illegalArgmax: 0, ms: 0 };
  const decide = (view, api) => {
    const t0 = performance.now();
    enc.encodeSample({ view, board: view.board }, null, obs);
    const logits = model.forward(obs);
    const order = argsortDesc(logits);
    const bw = view.board.width;
    const bh = view.board.height;
    const reachable = new Set(api.reachable().map((c) => `${c.pos.x},${c.pos.y}`));
    stats.decisions++;
    for (let k = 0; k < Math.min(MAX_TRIES, order.length); k++) {
      const action = enc.labelToAction(order[k], view);
      let ok = false;
      if (action.type === 'PASS') ok = true;
      else if (action.type === 'MOVE') {
        ok = action.to.x < bw && action.to.y < bh && reachable.has(`${action.to.x},${action.to.y}`);
      } else if (action.type === 'CAST') {
        ok = action.target.x < bw && action.target.y < bh && api.canCast(action.spell, action.target).ok;
      }
      if (ok) {
        stats.fallbackSum += k;
        if (k > 0) stats.illegalArgmax++;
        stats.ms += performance.now() - t0;
        return action;
      }
    }
    stats.ms += performance.now() - t0;
    stats.fallbackSum += MAX_TRIES;
    stats.illegalArgmax++;
    return { type: 'PASS' };
  };
  return { name, decide, stats, model };
}

module.exports = { loadModel, forward: (m, x) => m.forward(x), makeNetBot, gelu, erf };
