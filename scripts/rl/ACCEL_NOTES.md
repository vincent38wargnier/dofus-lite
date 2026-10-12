# Forward ONNX Runtime pour les rollouts PPO — résultats

Remplaçant drop-in du forward JS pur (`bot_net.cjs`) par ONNX Runtime CPU
(`bot_net_ort.cjs`), batch 1, 1 thread par session. Objectif ≥3× — atteint
très largement (~100× sur le forward).

## Résultats (mesurés le 2026-10-11, machine sous charge du run PPO live)

Même harnais (`bench_decision*.cjs`), mêmes poids (`ds-v1/model-bc2`), mêmes
seeds → 949 décisions identiques par run. Paires JS/ORT exécutées dos à dos
pour encaisser la même charge machine.

| Run                      | forward ms/déc | total ms/déc | part forward |
|--------------------------|---------------:|-------------:|-------------:|
| JS pur — paire 1         |          65.74 |        67.44 |        97.5% |
| ORT — paire 1            |           0.69 |         2.22 |        31.1% |
| JS pur — paire 2         |          51.79 |        52.92 |            — |
| ORT — paire 2            |           0.48 |         1.48 |            — |
| ORT — pool `iter_0010`*  |           0.45 |         1.51 |            — |

\* copie de `ppo-v1/pool/iter_0010` convertie dans `/tmp` (1318 décisions,
trajectoires différentes car poids différents).

- **Speedup forward : 95× (paire 1) et 108× (paire 2).** Même contre la
  baseline machine-plus-calme notée avant ce travail (36.05 ms/déc), ORT à
  0.45–0.69 ms/déc reste ≥ 52×.
- Coût total d'une décision : ~67 → ~1.5–2.2 ms (≈30–35×). Le goulot devient
  `maskCast` (~1.1 ms) + moteur, plus le forward (31% de part résiduelle).
- Les ms JS varient (51–66) avec les phases du run PPO live (16 workers) ;
  les paires dos à dos donnent la comparaison honnête.

## Parité numérique (parity_ort.cjs)

Critères : max |Δlogit| ≤ 1e-3 ET argmax identique ≥ 99.5%. Observations
RÉELLES (copie d'un shard rollout du run live, lignes de 4082 f32).

| Poids                     | source obs            | n    | max \|Δ\| | moy \|Δ\| | argmax = | verdict |
|---------------------------|-----------------------|-----:|----------:|----------:|---------:|---------|
| ds-v1/model-bc2           | shard rollout copié   |  256 |   6.1e-5  |   6.1e-6  |   100%   | PASS    |
| pool/iter_0010 (copie)    | shard rollout copié   |  256 |   6.1e-5  |   5.8e-6  |   100%   | PASS    |
| pool/iter_0010 (copie)    | shard rollout copié   | 2624 |   7.6e-5  |   5.9e-6  |   100%   | PASS    |
| ds-v1/model-bc2           | générées moteur       |  256 |   5.3e-5  |   6.1e-6  |   100%   | PASS    |

Les ~1e-5–1e-4 d'écart viennent de : l'erf approché de `bot_net.cjs`
(Abramowitz & Stegun, |err| ≤ 1.5e-7 par activation) vs l'erf exact d'ORT,
plus l'ordre d'accumulation f32 (le JS accumule en f64). Aucun impact argmax
observé.

## Commandes

```bash
# 1. Convertir un dossier de poids (format JS-export: weights.bin + shapes.json)
#    → écrit model.onnx DANS le dossier. Marche sur n'importe quel checkpoint
#    du pool (copier hors de ppo-v1/ si le run est live) ou export BC.
python3 scripts/rl/export_onnx.py <weightsDir>

# 2. Parité (obs réelles: COPIER un shard d'abord, le rollout est réécrit à
#    chaque itération ; sans fichier obs → observations générées via le moteur)
cp local-observations/rl/ppo-v1/rollout/obs_w1.f32 /tmp/obs_copy.f32
node scripts/rl/parity_ort.cjs <weightsDir> /tmp/obs_copy.f32 256

# 3. Benchs (mêmes seeds/maps/phases → comparables ligne à ligne)
node scripts/rl/bench_decision.cjs     <weightsDir> 8   # JS pur
node scripts/rl/bench_decision_ort.cjs <weightsDir> 8   # ONNX Runtime
```

Dépendances : `npm install -D onnxruntime-node` (fait, ^1.30.0) ;
`pip3 install --user --break-system-packages onnx onnxscript` (fait,
onnx 1.23.2 + onnxscript 0.7.2 — le `--break-system-packages` est requis par
le python Homebrew PEP 668 ; torch 2.14.1 était déjà dans le site-packages
user, même interpréteur que le run live).

## Gotchas

- **Synchrone, vraiment.** L'API publique d'`onnxruntime-node` est à
  promesses, mais ce n'est qu'un `setImmediate` autour d'un binding natif
  synchrone (« Binding exports a simple synchronized inference session object
  wrap », `node_modules/onnxruntime-node/dist/binding.d.ts`). `bot_net_ort.cjs`
  appelle `require('onnxruntime-node/dist/binding')` directement :
  `loadModel()` et `run()` bloquants → même interface sync que `bot_net.cjs`,
  zéro await. Fragile au changement de version du paquet (chemin interne) —
  épinglé en devDependency ^1.30.0.
- **Threading.** Session créée avec `intraOpNumThreads: 1`,
  `interOpNumThreads: 1`, `graphOptimizationLevel: 'all'`, EP `cpu` : 16
  workers de rollout = 16 process = 16 sessions à 1 thread, pas de
  sursouscription. Le ~0.5 ms/forward est bien à 1 thread.
- **Buffer de sortie.** `bot_net.cjs` renvoie son buffer interne réutilisé à
  chaque forward ; ORT renvoie un Float32Array neuf par run. Si du code aval
  garde une référence entre deux forwards, le comportement diffère (en
  pratique selfplay/bench consomment immédiatement).
- **Export torch.** torch 2.14 : l'exporteur TorchScript (`dynamo=False`)
  marche encore avec un DeprecationWarning ; `export_onnx.py` bascule tout
  seul sur `dynamo=True` (d'où `onnxscript` installé) si une future version le
  retire. Opset 18, entrée `obs` f32 [N,4082] (N dynamique), sortie `logits`
  f32 [N,5251]. `model.onnx` ≈ 6.4 Mo, vérifié par `onnx.checker`.
- **Run live.** Ne pas écrire dans `local-observations/rl/ppo-v1/` : pour
  convertir un checkpoint du pool pendant que le run tourne, le copier
  d'abord (`cp -r … /tmp/…`) et convertir la copie. Les shards
  `rollout/obs_w*.f32` sont réécrits à chaque itération (~4.5 min) : copier
  avant lecture et vérifier `taille % (4×4082) == 0`.
- **featureVersion.** `bot_net_ort.cjs` relit `shapes.json` et vérifie
  `featureVersion` contre l'encodeur, comme `bot_net.cjs` ; erreur claire si
  `model.onnx` manque (avec la commande de conversion à lancer).

## Fichiers

- `scripts/rl/export_onnx.py` — JS-export → `model.onnx` (politique seule).
- `scripts/rl/bot_net_ort.cjs` — `loadModel(dir)` → `{ shapes, forward }`, sync.
- `scripts/rl/bench_decision_ort.cjs` — copie du bench avec le forward ORT.
- `scripts/rl/parity_ort.cjs` — parité JS vs ORT sur obs réelles (exit 0 = PASS).
