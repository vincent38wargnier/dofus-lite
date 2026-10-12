// Forward ONNX Runtime (CPU) — remplaçant drop-in du forward JS pur de
// bot_net.cjs. Même interface: loadModel(dir) → { shapes, forward(obs) →
// Float32Array(actionDim) }, 100% SYNCHRONE.
//
// Le dossier doit contenir model.onnx (généré par scripts/rl/export_onnx.py
// depuis weights.bin + shapes.json) + shapes.json (vérif featureVersion).
//
// Pourquoi c'est synchrone: l'API publique d'onnxruntime-node (promesses)
// n'est qu'un habillage setImmediate autour d'un binding natif synchrone
// ("Binding exports a simple synchronized inference session object wrap",
// node_modules/onnxruntime-node/dist/binding.d.ts). On appelle ce binding
// directement: loadModel() et run() bloquants, zéro boucle d'événements.
//
// Threading: 1 thread intra-op + 1 inter-op par session — 16 workers de
// rollout possèdent chacun leur session, on ne sursouscrit pas les cœurs.
const fs = require('node:fs');
const path = require('node:path');
const enc = require('./encoder.cjs');
const ort = require('onnxruntime-node'); // ort.Tensor (constructeur reconnu par le binding)
const { binding, initOrt } = require('onnxruntime-node/dist/binding');

const SESSION_OPTIONS = {
  executionProviders: ['cpu'],
  intraOpNumThreads: 1,
  interOpNumThreads: 1,
  graphOptimizationLevel: 'all',
  executionMode: 'sequential',
};

function loadModel(dir) {
  const shapes = JSON.parse(fs.readFileSync(path.join(dir, 'shapes.json'), 'utf8'));
  if (shapes.featureVersion !== enc.FEATURE_VERSION) {
    throw new Error(`featureVersion ${shapes.featureVersion} ≠ encodeur ${enc.FEATURE_VERSION}`);
  }
  const modelPath = path.join(dir, 'model.onnx');
  if (!fs.existsSync(modelPath)) {
    throw new Error(`${modelPath} introuvable — convertir d'abord: python3 scripts/rl/export_onnx.py ${dir}`);
  }
  initOrt();
  const session = new binding.InferenceSession();
  session.loadModel(modelPath, SESSION_OPTIONS); // synchrone (binding natif)
  const obsDim = shapes.obsDim;
  const fetches = { logits: null };
  const forward = (x) => {
    if (x.length !== obsDim) throw new Error(`obs ${x.length} ≠ obsDim ${obsDim}`);
    const out = session.run({ obs: new ort.Tensor('float32', x, [1, obsDim]) }, fetches, {});
    return out.logits.data; // Float32Array(actionDim)
  };
  return { shapes, session, forward };
}

module.exports = { loadModel, forward: (m, x) => m.forward(x) };
