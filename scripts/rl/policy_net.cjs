// Forward JS pur du réseau de POLITIQUE (train_policy.py, arch "policy-v1").
// Même tronc que value_net.cjs; tête plate ACTION_DIM logits (pas de tanh).
// makePolicyBot = CLONE du prof: argmax sur les actions LÉGALES (jamais
// d'action illégale). ~2 ms/décision → générateur de masse.
//   node scripts/rl/policy_net.cjs parity MODEL_DIR   # verrou torch↔JS
require('../ai_runtime.cjs');
const fs = require('node:fs');
const path = require('node:path');
const enc = require('./encoder.cjs');
const sb = require('./search_bot.cjs');
const { spellZoneCells } = require('../../src/engine/geometry');

// CLONE_ENEMY_ONLY=1: un lancer doit toucher un ENNEMI vivant, sauf sorts sur
// soi et effets « case ». Le filtre de candidateCasts accepte une zone qui ne
// touche que soi ou un allié — la politique imitée en abusait (partie clone
// 0/32: flèche lancée à côté de soi).
const CELL_KINDS = new Set(['trap', 'glyph', 'teleport', 'summon', 'staticSummon', 'double',
  'cell', 'freeCell', 'swap', 'swapAlly', 'carry', 'throw', 'fear', 'revive', 'rollback']);
function touchesEnemy(view, a) {
  const you = view.you;
  const s = you.weaponSpell?.key === a.spell ? you.weaponSpell : (you.spells || []).find(x => x.key === a.spell);
  if (!s || s.targetMode === 'self') return true;
  const rows = [...(s.effects || []), ...(s.critEffects || [])];
  if (rows.some(e => CELL_KINDS.has(e.kind))) return true;
  if (rows.every(e => (e.targetMask || 0) & 32)) return true;
  const foes = new Set((view.enemies || []).filter(f => f.hp > 0).map(f => `${f.pos.x},${f.pos.y}`));
  return rows.some(e => !((e.targetMask || 0) & 32)
    && spellZoneCells(e.zone, a.target, you.pos).some(z => foes.has(`${z.x},${z.y}`)));
}

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

// Arch "policy-spatial-v1" (train_policy.py --arch spatial): têtes PAR CASE.
// conv1..4 (3×3, entrée = 7 planes + 2 coordonnées x/(W-1), y/(H-1)), global
// g1→g2, puis par case fuse1(1×1 sur [tronc, global diffusé, coords]) → fuse2
// → move_head (1 logit/case) et cast_head (24 logits/case); PASS = linéaire
// sur [global, moyenne du tronc]. Sortie: [PASS, MOVE×210, CAST 24×210].
// Convolution « axpy »: même calcul que conv2d (somme en double, biais, GELU),
// boucles réordonnées — pour chaque (sortie, entrée, case du noyau) une passe
// CONTIGUË sur les lignes du plateau, bornes calculées hors de la boucle
// interne. Aucun test de bord dans la boucle chaude.
let acc = new Float64Array(0);
function conv2dFast(layer, x, out, H, W2, activate) {
  const cells = H * W2;
  const [nout, nin, k] = layer.shape;
  const pad = (k - 1) >> 1;
  const { W: Wt, b } = layer;
  if (acc.length < nout * cells) acc = new Float64Array(nout * cells);
  for (let o = 0; o < nout; o++) {
    const ob = o * cells;
    acc.fill(b[o], ob, ob + cells);
    for (let i = 0; i < nin; i++) {
      const ib = i * cells;
      const wb = (o * nin + i) * k * k;
      for (let ky = 0; ky < k; ky++) {
        const dy = ky - pad;
        const y0 = dy < 0 ? -dy : 0; const y1 = dy > 0 ? H - dy : H;
        for (let kx = 0; kx < k; kx++) {
          const w = Wt[wb + ky * k + kx];
          if (w === 0) continue;
          const dx = kx - pad;
          const x0 = dx < 0 ? -dx : 0; const x1 = dx > 0 ? W2 - dx : W2;
          for (let y = y0; y < y1; y++) {
            const orow = ob + y * W2; const irow = ib + (y + dy) * W2 + dx;
            for (let xx = x0; xx < x1; xx++) acc[orow + xx] += w * x[irow + xx];
          }
        }
      }
    }
  }
  const n = nout * cells;
  if (activate) for (let j = 0; j < n; j++) out[j] = gelu(acc[j]);
  else for (let j = 0; j < n; j++) out[j] = acc[j];
  return out;
}

function loadSpatialPolicy(dir, shapes, conv = conv2dFast) {
  const L = readLayers(dir, shapes);
  const { n: NP, h: H, w: W2 } = shapes.planes;
  const cells = H * W2;
  const planeDim = NP * cells;
  const { ch, gdim, fdim } = shapes;
  const slots = shapes.spellSlots;
  const g1dim = L.g1.shape[0];
  const inp = new Float32Array((NP + 2) * cells);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W2; x++) {
      inp[NP * cells + y * W2 + x] = x / (W2 - 1);
      inp[(NP + 1) * cells + y * W2 + x] = y / (H - 1);
    }
  }
  const a = new Float32Array(ch * cells);
  const b = new Float32Array(ch * cells);
  const gh = new Float32Array(g1dim);
  const g = new Float32Array(gdim);
  const fin = new Float32Array((ch + gdim + 2) * cells);
  const f1 = new Float32Array(fdim * cells);
  const f2 = new Float32Array(fdim * cells);
  const move = new Float32Array(cells);
  const cast = new Float32Array(slots * cells);
  const pin = new Float32Array(gdim + ch);
  const pout = new Float32Array(1);
  const logits = new Float32Array(shapes.actionDim);
  const forward = (obs) => {
    inp.set(obs.subarray(0, planeDim), 0);
    conv(L.conv1, inp, a, H, W2, true);
    conv(L.conv2, a, b, H, W2, true);
    conv(L.conv3, b, a, H, W2, true);
    conv(L.conv4, a, b, H, W2, true); // tronc final dans b
    linear(L.g1, obs.subarray(planeDim), gh, true);
    linear(L.g2, gh, g, true);
    fin.set(b, 0);
    for (let j = 0; j < gdim; j++) fin.fill(g[j], (ch + j) * cells, (ch + j + 1) * cells);
    fin.set(inp.subarray(NP * cells, (NP + 2) * cells), (ch + gdim) * cells);
    conv(L.fuse1, fin, f1, H, W2, true);
    conv(L.fuse2, f1, f2, H, W2, true);
    conv(L.move_head, f2, move, H, W2, false);
    conv(L.cast_head, f2, cast, H, W2, false);
    pin.set(g, 0);
    for (let c = 0; c < ch; c++) {
      let s = 0; const base = c * cells;
      for (let i = 0; i < cells; i++) s += b[base + i];
      pin[gdim + c] = s / cells;
    }
    linear(L.pass_head, pin, pout, false);
    logits[0] = pout[0];
    logits.set(move, 1);
    logits.set(cast, 1 + cells);
    return logits;
  };
  return { shapes, forward };
}

// CLONE_ORT=1 + model.onnx (scripts/rl/export_policy_onnx.py) → forward ONNX Runtime:
// binding natif SYNCHRONE (même astuce que bot_net_ort.cjs), 1 thread par process.
// Mêmes logits à la précision float32 près (le JS somme en double).
function loadPolicyOrt(dir, shapes) {
  const ort = require('onnxruntime-node');
  const { binding, initOrt } = require('onnxruntime-node/dist/binding');
  initOrt();
  const session = new binding.InferenceSession();
  session.loadModel(path.join(dir, 'model.onnx'), {
    executionProviders: ['cpu'], intraOpNumThreads: 1, interOpNumThreads: 1,
    graphOptimizationLevel: 'all', executionMode: 'sequential',
  });
  const fetches = { logits: null };
  const dims = [1, shapes.obsDim];
  const forward = (x) => session.run({ obs: new ort.Tensor('float32', x, dims) }, fetches, {}).logits.data;
  return { shapes: { ...shapes, runtime: 'ort' }, forward };
}

function loadPolicy(dir) {
  const shapes = JSON.parse(fs.readFileSync(path.join(dir, 'shapes.json'), 'utf8'));
  if (process.env.CLONE_ORT === '1' && fs.existsSync(path.join(dir, 'model.onnx'))) return loadPolicyOrt(dir, shapes);
  if (shapes.arch === 'policy-spatial-v1') return loadSpatialPolicy(dir, shapes);
  if (shapes.arch !== 'policy-v1') throw new Error(`arch inattendue: ${shapes.arch}`);
  const L = readLayers(dir, shapes);
  const { n: NP, h: H, w: W2 } = shapes.planes;
  const cells = H * W2;
  const planeDim = NP * cells;
  const ch = shapes.ch; const gdim = shapes.gdim; const AD = shapes.actionDim;
  const b1 = new Float32Array(ch * cells);
  const b2 = new Float32Array(ch * cells);
  const pooled = new Float32Array(ch);
  const g128 = new Float32Array(128);
  const g = new Float32Array(gdim);
  const cat = new Float32Array(ch + gdim);
  const hid = new Float32Array(128);
  const logits = new Float32Array(AD);
  const forward = (obs) => {
    conv2d(L.conv1, obs.subarray(0, planeDim), b1, H, W2, true);
    conv2d(L.conv2, b1, b2, H, W2, true);
    conv2d(L.conv3, b2, b1, H, W2, true);
    for (let c = 0; c < ch; c++) {
      let s = 0; const base = c * cells;
      for (let i = 0; i < cells; i++) s += b1[base + i];
      pooled[c] = s / cells;
    }
    linear(L.g1, obs.subarray(planeDim), g128, true);
    linear(L.g2, g128, g, true);
    cat.set(pooled, 0); cat.set(g, ch);
    linear(L.h1, cat, hid, true);
    linear(L.h2, hid, logits, false);
    return logits;
  };
  return { shapes, forward };
}

// CLONE_NO_OSC=1: grammaire de tour du PROF imposée au décodage — le calculateur
// n'enchaîne JAMAIS deux déplacements dans un plan (move→move ≡ un seul move).
// Clone seed 8 (11.7% vs maison): MOVE (1,6)→(3,6)→(2,6) dans le même tour =
// PM brûlés en aller-retour, fin de tour hors de portée, PASS avec 5 PA. Règle:
// pas de MOVE juste après un MOVE, jamais revenir sur une case déjà occupée
// pendant CE tour (clé = round + id du combattant).
// Bot clone: encode la vue, forward, argmax sur les actions LÉGALES.
// ENSEMBLE: dir = "A,B,C" → moyenne des logits de plusieurs clones (graines
// différentes). Mêmes données, la force en jeu varie de 12% à 68% selon la
// graine: moyenner annule les travers propres à chaque modèle.
function loadEnsemble(dirs) {
  const models = dirs.map(loadPolicy);
  if (models.length === 1) return models[0];
  const AD = models[0].shapes.actionDim;
  for (const m of models) {
    if (m.shapes.actionDim !== AD || m.shapes.obsDim !== models[0].shapes.obsDim) throw new Error('ensemble: dims différentes');
  }
  const avg = new Float32Array(AD);
  return { shapes: models[0].shapes, forward: (obs) => {
    avg.fill(0);
    for (const m of models) { const l = m.forward(obs); for (let k = 0; k < AD; k++) avg[k] += l[k]; }
    for (let k = 0; k < AD; k++) avg[k] /= models.length;
    return avg;
  } };
}

function makePolicyBot(dir) {
  const model = loadEnsemble(String(dir).split(',').filter(Boolean));
  const fv = model.shapes.featureVersion || 3;
  if (fv !== 3) throw new Error(`policy_net attend featureVersion 3, reçu ${fv}`);
  const buf = new Float32Array(model.shapes.obsDim);
  const noOsc = !!process.env.CLONE_NO_OSC;
  const eager = !!process.env.CLONE_EAGER; // ancien décodeur (énumération complète) — vérification
  let turnKey = null; let visited = null; let lastType = null;
  const AD = model.shapes.actionDim; const CELLS = enc.CELLS; const MW = enc.MAX_W;
  const order = new Int32Array(AD);
  // Décodeur PARESSEUX: argmax légal = 1re action légale dans l'ordre décroissant
  // des logits. Les cibles légales d'un sort ne sont calculées (mêmes filtres que
  // candidateCasts: castTargets + effectfulTargets; arme: losange de portée +
  // canCast) que quand l'ordre atteint une de ses cases — 1 ou 2 sorts au lieu
  // de tout le kit (l200gear: ~55 ms → quelques ms). Même choix que l'énumération.
  function lazyBest(view, api, logits) {
    for (let k = 0; k < AD; k++) order[k] = k;
    order.sort((a, b) => logits[b] - logits[a]);
    const you = view.you; const W = view.board.width; const H = view.board.height;
    const castable = (sp) => sp && (sp.pa || 0) <= you.pa && (sp.cooldownLeft || 0) <= 0 && (sp.usesLeft ?? 99) > 0;
    let reach = null;
    const castSets = new Map();
    const castSet = (slot) => {
      if (castSets.has(slot)) return castSets.get(slot);
      const sp = slot === enc.WEAPON_SLOT ? you.weaponSpell : (you.spells || [])[slot];
      let set = null;
      if (castable(sp)) {
        let cells;
        if (slot === enc.WEAPON_SLOT) {
          const r1 = sp.range?.[1] ?? 2; cells = [];
          for (let dy = -r1; dy <= r1; dy++) {
            const span = r1 - Math.abs(dy);
            for (let dx = -span; dx <= span; dx++) {
              const c = { x: you.pos.x + dx, y: you.pos.y + dy };
              if (c.x >= 0 && c.y >= 0 && c.x < W && c.y < H && api.canCast(sp.key, c).ok) cells.push(c);
            }
          }
        } else cells = api.castTargets(sp.key);
        set = new Set(sb.effectfulTargets(view, sp, cells).map((c) => `${c.x},${c.y}`));
      }
      castSets.set(slot, set);
      return set;
    };
    for (let k = 0; k < AD; k++) {
      const a = order[k];
      if (a === 0) return { type: 'PASS' };
      if (a <= CELLS) {
        const c = a - 1; const x = c % MW; const y = (c / MW) | 0;
        if (x >= W || y >= H) continue;
        if (noOsc && (lastType === 'MOVE' || visited.has(`${x},${y}`))) continue;
        if (!reach) reach = new Set(api.reachable().map((r) => `${r.pos.x},${r.pos.y}`));
        if (reach.has(`${x},${y}`)) return { type: 'MOVE', to: { x, y } };
        continue;
      }
      const rest = a - 1 - CELLS; const slot = (rest / CELLS) | 0; const c = rest % CELLS;
      const x = c % MW; const y = (c / MW) | 0;
      if (x >= W || y >= H) continue;
      if (slot !== enc.WEAPON_SLOT && slot >= (you.spells || []).length) continue;
      const set = castSet(slot);
      if (!set || !set.has(`${x},${y}`)) continue;
      const sp = slot === enc.WEAPON_SLOT ? you.weaponSpell : you.spells[slot];
      const act = { type: 'CAST', spell: sp.key, target: { x, y } };
      if (process.env.CLONE_ENEMY_ONLY && !touchesEnemy(view, act)) continue;
      return act;
    }
    return { type: 'PASS' };
  }
  function decide(view, api) {
    if (noOsc) {
      const key = `${view.turn}:${view.you.id}`;
      if (key !== turnKey) { turnKey = key; visited = new Set(); lastType = null; }
      visited.add(`${view.you.pos.x},${view.you.pos.y}`);
    }
    enc.encodeSampleV3({ view, board: view.board }, null, buf);
    const logits = model.forward(buf);
    if (!eager) {
      const best = lazyBest(view, api, logits);
      if (noOsc) lastType = best.type;
      return best;
    }
    // Actions légales candidates: PASS, déplacements, lancers.
    let best = { type: 'PASS' };
    let bestScore = logits[enc.actionToLabel({ type: 'PASS' }, view)];
    for (const c of api.reachable()) {
      if (noOsc && (lastType === 'MOVE' || visited.has(`${c.pos.x},${c.pos.y}`))) continue;
      const a = { type: 'MOVE', to: { x: c.pos.x, y: c.pos.y } };
      const lab = enc.actionToLabel(a, view);
      if (lab >= 0 && logits[lab] > bestScore) { bestScore = logits[lab]; best = a; }
    }
    for (const a of sb.candidateCasts(view, api)) {
      if (process.env.CLONE_ENEMY_ONLY && !touchesEnemy(view, a)) continue;
      const lab = enc.actionToLabel(a, view);
      if (lab >= 0 && logits[lab] > bestScore) { bestScore = logits[lab]; best = a; }
    }
    if (noOsc) lastType = best.type;
    return best;
  }
  // Nouveau contexte de tour forcé (tours SIMULÉS du calculateur: le même
  // round/id revient d'une ligne candidate à l'autre — la mémoire anti-oscillation
  // ne doit pas fuir entre lignes).
  decide.reset = () => { turnKey = null; };
  return decide;
}

module.exports = { loadPolicy, loadPolicyOrt, loadEnsemble, makePolicyBot, loadSpatialPolicy, conv2d, conv2dFast };

if (require.main === module) {
  const [, , mode, dir] = process.argv;
  if (mode !== 'parity' || !dir) { console.log('usage: parity MODEL_DIR'); process.exit(1); }
  const model = loadPolicy(dir);
  const obsDim = model.shapes.obsDim;
  const raw = fs.readFileSync(path.join(dir, 'parity_obs.bin'));
  const expected = JSON.parse(fs.readFileSync(path.join(dir, 'parity_v.json'), 'utf8'));
  const n = expected.argmax.length;
  let maxHeadDiff = 0; let argmaxOk = 0;
  for (let i = 0; i < n; i++) {
    const obs = new Float32Array(raw.buffer, raw.byteOffset + i * obsDim * 4, obsDim);
    const logits = model.forward(obs);
    // argmax JS complet
    let am = 0; for (let k = 1; k < logits.length; k++) if (logits[k] > logits[am]) am = k;
    if (am === expected.argmax[i]) argmaxOk++;
    for (let k = 0; k < 8; k++) maxHeadDiff = Math.max(maxHeadDiff, Math.abs(logits[k] - expected.head[i][k]));
  }
  // Parité COMPLÈTE (5251 logits) si le dump torch existe: couvre les têtes
  // CAST que les 8 premiers logits (PASS + 7 MOVE) ne voient jamais.
  let maxFullDiff = null;
  const fullPath = path.join(dir, 'parity_full.f32');
  if (fs.existsSync(fullPath)) {
    const fullRaw = fs.readFileSync(fullPath);
    const AD = model.shapes.actionDim;
    const full = new Float32Array(fullRaw.buffer, fullRaw.byteOffset, fullRaw.byteLength / 4);
    if (full.length !== n * AD) throw new Error(`parity_full: ${full.length} ≠ ${n}×${AD}`);
    maxFullDiff = 0;
    for (let i = 0; i < n; i++) {
      const obs = new Float32Array(raw.buffer, raw.byteOffset + i * obsDim * 4, obsDim);
      const logits = model.forward(obs);
      for (let k = 0; k < AD; k++) maxFullDiff = Math.max(maxFullDiff, Math.abs(logits[k] - full[i * AD + k]));
    }
  }
  const ok = maxHeadDiff < 2e-3 && argmaxOk === n && (maxFullDiff === null || maxFullDiff < 2e-3);
  console.log(JSON.stringify({ arch: model.shapes.arch, n, argmaxOk, maxHeadDiff: +maxHeadDiff.toExponential(3),
    maxFullDiff: maxFullDiff === null ? null : +maxFullDiff.toExponential(3), ok }));
  process.exit(ok ? 0 : 1);
}
