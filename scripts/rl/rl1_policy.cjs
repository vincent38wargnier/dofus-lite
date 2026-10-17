// RL1 (docs/selfplay-rl1.md) — politique ÉCHANTILLONNÉE du clone spatial et de ses
// descendants PPO. Même encodeur (v3), même forward (policy_net.loadPolicy: ORT si
// CLONE_ORT=1 et model.onnx présent), même ensemble d'actions légales que le
// décodeur « eager » de policy_net.makePolicyBot (PASS, cases atteignables,
// sb.candidateCasts = castTargets + effectfulTargets, arme: losange + canCast) —
// mais tirage dans le softmax MASQUÉ à température T (T = 0 → argmax légal).
// Chaque décision renvoie de quoi apprendre: indices légaux et indice joué; l'obs
// encodée reste dans `buf` jusqu'au prochain appel.
const enc = require('./encoder.cjs');
const sb = require('./search_bot.cjs');
const { loadPolicy } = require('./policy_net.cjs');

const ACTION_DIM = 1 + enc.CELLS + enc.SPELL_SLOTS * enc.CELLS;
const MASK_BYTES = Math.ceil(ACTION_DIM / 8);

// Actions légales: Map indice → action jouable (un indice = une action).
function legalActions(view, api) {
  const out = new Map([[0, { type: 'PASS' }]]);
  for (const c of api.reachable()) {
    const a = { type: 'MOVE', to: { x: c.pos.x, y: c.pos.y } };
    const lab = enc.actionToLabel(a, view);
    if (lab > 0 && !out.has(lab)) out.set(lab, a);
  }
  for (const a of sb.candidateCasts(view, api)) {
    const lab = enc.actionToLabel(a, view);
    if (lab > 0 && !out.has(lab)) out.set(lab, a);
  }
  return out;
}

function packMask(labels) {
  const m = new Uint8Array(MASK_BYTES);
  for (const k of labels) m[k >> 3] |= 1 << (k & 7);
  return m;
}

// makeSampler(dir) → decide(view, api, rand, temp) = { action, label, legal, logp }.
// rand: () → [0, 1) (flux du worker, pour la reproductibilité).
function makeSampler(dir) {
  const model = loadPolicy(dir);
  if ((model.shapes.featureVersion || 3) !== 3) throw new Error(`rl1 attend featureVersion 3: ${dir}`);
  if (model.shapes.actionDim !== ACTION_DIM) throw new Error(`actionDim ${model.shapes.actionDim} ≠ ${ACTION_DIM}`);
  const buf = new Float32Array(model.shapes.obsDim);
  // topK > 0: renvoie aussi `top` = les topK actions légales de plus haut logit (RL2);
  // gumbel (fonction → [0, 1)): top-k sur logit + bruit de Gumbel (Gumbel AlphaZero: tirage
  // sans remise, explore les actions que le réseau sous-pondère).
  function decide(view, api, rand, temp, topK = 0, gumbel = null) {
    enc.encodeSampleV3({ view, board: view.board }, null, buf);
    const logits = model.forward(buf);
    const legal = legalActions(view, api);
    const labels = [...legal.keys()];
    let top;
    if (topK > 0) {
      const key = new Map(labels.map((k) => [k, logits[k] + (gumbel ? -Math.log(-Math.log(Math.min(1 - 1e-12, Math.max(1e-12, gumbel())))) : 0)]));
      top = [...labels].sort((x, y) => key.get(y) - key.get(x)).slice(0, topK)
        .map((k) => ({ label: k, action: legal.get(k), logit: logits[k] }));
    }
    let best = labels[0];
    for (const k of labels) if (logits[k] > logits[best]) best = k;
    let label = best; let logp = 0;
    if (temp > 0) {
      let z = 0; const w = new Float64Array(labels.length);
      for (let i = 0; i < labels.length; i++) { w[i] = Math.exp((logits[labels[i]] - logits[best]) / temp); z += w[i]; }
      let u = rand() * z; let i = 0;
      while (i < labels.length - 1 && u >= w[i]) { u -= w[i]; i++; }
      label = labels[i]; logp = Math.log(w[i] / z);
    }
    return { action: legal.get(label), label, legal: labels, logp, top };
  }
  decide.buf = buf;
  decide.shapes = model.shapes;
  return decide;
}

module.exports = { makeSampler, legalActions, packMask, ACTION_DIM, MASK_BYTES };
