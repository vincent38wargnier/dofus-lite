# Training the IA Maison — how each class learns, and how to retrain

The **IA Maison** is the reference bot of the Koliséum. This document explains
exactly *what* it learns, *how* the self-play RL loop works, and the recipes to
retrain after you change a spell, a class build, or an engine rule.

Everything below is deterministic: same data + same commands → same weights.

---

## 1. What a class actually learns

The policy is **not** a neural network. Each fighter is driven by the utility
brain (`src/bots/utilityBrain.js`): every possible action (spell × target,
move × cell, end turn) gets a score from hand-written *considerations*
(expected damage, kill setup, threat maps, range band, escape risk…), and the
bot plays the argmax. What the RL learns is the **weight vector** that shapes
those scores:

- **16 tactical weights** — `damage`, `kill`, `heal`, `removePa`, `removePm`,
  `push`, `summon`, `buff`, `armor`, `focusWeak`, `leader`, `antiSummon`,
  `threat`, `rangeBand`, `aggression`, `retreatHp`
  (list: `TUNE_KEYS` in `src/tuning/harness.js`).
- **One multiplier per spell of the kit** — keys like `spell_colere`,
  `spell_chatiment_agile`… They let the learner discover *which spells matter
  in which matchup* (suppressing a trap spell, spamming a hidden gem).

And crucially, weights are learned **per matchup**: a class has 12 vectors,
one against each opponent class (mirror included) — 144 vectors total. An Iop
does not play against a Cra the way it plays against a Sacrieur.

The merged result lives in **`src/bots/maisonWeights.json`**
(`{ CLASS: { base, vs: { OPP: weights } } }`, generated — never hand-edit).
At runtime `api.maison()` resolves `vs[enemyClass]`, falling back to the
class `base` (median of its kept vectors), then to the brain defaults.

## 2. The self-play RL loop (`selfplay.js`)

Inspired by population-based training (parallel configs, rounds, selection —
same shape as the jarvio/rl DQN harness). One **jest worker per class** runs
rounds in parallel; the 12 workers co-evolve through shared pool files.

For every round, for every one of its 12 matchups, a class does:

1. **CEM step** (evolution-strategies family): sample `pop` weight vectors
   log-normally around the incumbent, evaluate each with **paired matches**
   (same seeds for all candidates, both sides A/B, 5-map rotation), refit
   mean/σ on the elite quartile, repeat `gens` times.
2. **Opponent mix** per evaluation (5 slots):
   - 3/5 — **adaptive pool**: the opponent class's *latest best* weights,
     re-read from disk each round → the metagame evolves while you train;
   - 1/5 — **anchor**: the default brain, so vectors never overfit the pool
     and forget how to beat a vanilla opponent;
   - 1/5 — **scripted boss** when the opponent class has one
     (Brutus→IOP, Plume→CRA, Toubib→ENIRIPSA): self-play alone never
     invents those styles.
3. **Shaped exploration, honest selection.** During CEM the fitness is
   `win(1/0.5/0) + 0.15·hp-margin + 0.05·PA-utilization + 0.03·PM-utilization`
   — the shaping pushes candidates to actually *use* their kit. But the
   **duel** that decides whether the candidate replaces the incumbent is
   played on fresh seeds **without shaping**: pure win rate. Shaping guides,
   it never corrupts what gets kept.
4. **Checkpointing.** After each matchup the class pool
   (`src/tuning/rl/pool/<CLASS>.json`) is written atomically (tmp+rename), and
   after each round a snapshot `src/tuning/rl/round_<N>_<CLASS>.json` is kept.
   A killed run loses at most the matchup in flight — relaunching resumes
   from `meta.round`.

**Convergence signal:** the logs print `X/12 matchups remplacés` per round.
~40% replacement means it is still climbing; < ~10% for two consecutive
rounds means converged (for the current opponents/data).

## 3. File map

| Path | Role |
|---|---|
| `src/bots/utilityBrain.js` | the policy (scoring); `DEFAULT_WEIGHTS` |
| `src/bots/maison.js` + `maisonWeights.json` | matchup resolution + merged weights |
| `src/tuning/harness.js` | match runner, paired-seed evaluation, `TUNE_KEYS`, `TUNE_MAPS`, round-1 CEM |
| `src/tuning/selfplay.js` | RL rounds: adaptive pool, anchor, scripted sparring, duels |
| `src/tuning/run3/<CLASS>.rl.js` | one worker per class (generated, `rounds: 6`) |
| `src/tuning/run4/<CLASS>.rlfix.js` | anchor-heavy pass for weak classes (`anchorShare: 3`) |
| `src/tuning/run2/AUDIT.audit.js` → `audit.js` | kit-leverage metrics (PA/PM used, idle turns, spell mix) |
| `src/tuning/run2/EVAL.eval.js` → `evalMatrix.js` | final matrix: vs default brain, class×class, vs scripted bots |
| `src/tuning/rl/pool/*.json` | live pool (best weights per matchup) — safe to delete for a clean slate |
| `scripts/merge_maison.js` | merges round-1 `out/` + RL `pool/` → `maisonWeights.json` |
| `scripts/extract_spells.py` | spell/summon data from the emulator SQL → `spellData.js` |

## 4. Recipes — retraining after a change

All commands run from the repo root. Jest is the parallel executor; these
files are **not** picked up by a normal `yarn test`.

### A. You changed a spell (or added/removed one)

```bash
# 1. Edit scripts/extract_spells.py (EFFECTS map, SPELL_BLACKLIST, ranges…)
python3 scripts/extract_spells.py generate     # rewrites src/engine/spellData.js
CI=true npx react-scripts test --watchAll=false   # 51 tests must stay green

# 2. Retrain (pool is a warm start; duels self-heal stale vectors)
CI=true npx react-scripts test --watchAll=false \
  --testMatch '<rootDir>/src/tuning/run3/*.rl.js' --maxWorkers=10

# 3. Merge, evaluate, audit, ship
node scripts/merge_maison.js
CI=true npx react-scripts test --watchAll=false --testMatch '<rootDir>/src/tuning/run2/*.eval.js'
CI=true npx react-scripts test --watchAll=false --testMatch '<rootDir>/src/tuning/run2/*.audit.js'
yarn build
```

Keep the pool (default) for small changes — stale vectors lose their duels
and get replaced where it matters. **Wipe it** (`rm -rf src/tuning/rl`) for a
clean slate when the change is drastic (new mechanic, rebalanced class,
spell renamed → its `spell_<key>` multiplier key changes).

New spells start with multiplier 1 and are explored automatically — the CEM
keys are rebuilt from the class kit at every launch.

### B. You changed class characteristics (stats, HP, maxSummons)

Edit the `BUILDS` table in `src/engine/classes.js`. No regeneration needed —
go straight to steps 2–3 above. Same warm-start-vs-wipe judgement call.

### C. You changed the brain or the engine rules

Scoring changes shift what the weights *mean*, engine changes shift what wins.
Run the test suite, then retrain (steps 2–3). If the change is behavioral
(e.g. new movement logic), run the **audit** before and after — it is the
fastest way to see if bots still leverage PA/PM/spells.

### D. You added a brand-new effect kind

1. Map the effect id in `EFFECTS` (`scripts/extract_spells.py`), regenerate.
2. Implement the `case` in `doCast` (`src/engine/engine.js`).
3. Score it in `scoreRows` (`src/bots/utilityBrain.js`) — unscored = never cast.
4. Add an engine test, then recipe A. The probe pattern in git history
   (`SACRI.probe.js`) is handy to verify a class actually *plays* the new toy.

### E. Weak class after training

Give it an anchor-heavy pass (more matches vs the default brain, warm start):

```bash
# edit/generate src/tuning/run4/<CLASS>.rlfix.js with the class list, then
CI=true npx react-scripts test --watchAll=false \
  --testMatch '<rootDir>/src/tuning/run4/*.rlfix.js' --maxWorkers=4
node scripts/merge_maison.js
```

## 5. Budget cheat-sheet

Per class-round ≈ `12 matchups × (pop·gens·seedsPerGen·2 + duels)` matches.
Defaults (`pop 12, gens 3, seedsPerGen 5, duelSeeds 8`) ≈ **4 700
matches/class/round** ≈ 2 min. A full `rounds: 6` run for 12 classes on 10
workers ≈ **~340 000 matches, 20–30 min wall**. A headless match costs
~15–25 ms; scale `rounds`/`pop` freely, the executor caps at `--maxWorkers`.

## 6. Pitfalls

- **Never hand-edit** `spellData.js` or `maisonWeights.json` — regenerate/merge.
- The 72 historic spell keys (`colere`, `bond`, `pression`…) are pinned in
  `SPELL_META` (`classes.js`); builtin bots and tests reference them.
- `merge_maison.js` overlays: round-1 `out/` **<** RL `pool/`. The pool wins.
- After a merge, restart/rebuild the app — weights are bundled at compile time.
- Score scale: `1.0` = wins every duel match; `0.5` = even; margins add ±0.15.
  In `EVAL.json`, `matrix[A][B]` is A's score against B (maison vs maison).
- Some dump spells are GM/monster variants (see `SPELL_BLACKLIST` — e.g. the
  300-HP-steal "Folie sanguinaire"). If a class suddenly one-shots everyone
  after a regen, run the outlier scan from git history before blaming the RL.
- `cortexWeights.json` is the *generic* (non-matchup) tuned set used by
  `api.suggest()` — unrelated to the maison files.
