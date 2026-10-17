# RL1 — Reward-based self-play for the fast policy network (protocol, pre-registered 2026-10-15)

Vincent's goal: neural networks that **act fast** and improve by **playing each other for
rewards**. RL1 is the first run of that. This document fixes the setup, the measurements and
the stop rules before any RL1 result exists. Results go in §8.

## 1. Why this setup (lessons that shaped it)

- **The Oct 10–11 PPO run (Synapse)** plateaued around 50% vs IA Maison and was weak in real
  play. It started from a weak network (28.6% vs Maison), trained only at level 100 without
  gear, and its value head mean-pools the board (`train_ppo.py` `t.mean(dim=(2, 3))`).
- **A per-cell policy head fixed the policy clone** (flat head 0/32 → spatial 72% vs Maison,
  Oct 13). Base audit B1 (`docs/selfplay-loop1.md`) showed that a positional readout also
  helps value nets.
- **A network alone cannot replace C1's simulated reply** (loop 1/1b/B1). Copying C1 can make
  it cheaper but never stronger. Only reward learning can push a network past its teacher.

Best-practice references followed:
- start from imitation, then RL (AlphaStar, Metamon);
- PPO with GAE and illegal-action masking;
- a decaying KL anchor to the starting policy against forgetting (arXiv 2402.02868);
- a league of past versions plus fixed anchors (OpenAI Five, AlphaStar);
- shaping that fades to zero;
- separate policy and value networks.

## 2. Starting point (measured 2026-10-15)

**Policy.** The spatial clone `value-cra3/policy-spatial-r4-e60c-s9/ep60` (1.32M params,
featureVersion 3). It imitates the calculator; CRA mirror, l100 and l200gear.

**Sampler** `scripts/rl/rl1_policy.cjs` uses the same legal set as the clone's decoder (PASS,
reachable cells, `candidateCasts`). In argmax mode it plays the **same move as `makePolicyBot`
on 576/576 decisions** (8 games, both levels).

**Strength vs IA Maison by temperature** (64 games, mixed maps — arena 60% plus 4 others —
both levels):

| temperature | wins | l100 | l200gear |
|---|---|---|---|
| 0 (argmax) | 37/64 (58%) | 19/32 | 18/32 |
| 0.5 | 36/64 (56%) | 22/32 | 14/32 |
| 1 | 14/64 (22%) | 8/32 | 6/32 |

So RL1 samples at T = 0.5, implemented as **head folding**: the clone's three heads are
multiplied by 2. The folded net at T = 1 *is* the clone at T = 0.5, and argmax is unchanged.
On mixed maps the clone wins 58%; its 72% (Oct 13) was on the arena only.

## 3. The loop (`scripts/rl/rl1_train.py` + `rl1_selfplay.cjs`)

**Each iteration** plays 256 games with 4 CPU workers, then trains on the GPU. The two never
run at the same time, because on 2026-10-15 GPU + CPU reached heat level 2 in 70 s.

**Opponents.**

| share | opponent | what is recorded |
|---|---|---|
| 50% | itself | both sides |
| 30% | a past version: the last 6, plus 1 in 5 older ones, at most 12 | learner side only |
| 10% | the starting clone, argmax (fixed anchor) | learner side only |
| 10% | IA Maison | learner side only |

**Levels and maps.** Levels l100 / l200gear at 50/50; maps as in loop 1. Games are paired:
same seed and conditions, seats swapped.

**Reward.** Win +1, loss −1, draw 0, plus a health-margin bonus of 0.1 × 0.95^iteration
(fades out).

**PPO.**
- clip 0.2, 3 epochs, minibatch 2048;
- γ 0.995, λ 0.95;
- entropy coefficient 0.003;
- policy LR 1e-4, value LR 3e-4;
- early stop when the minibatch KL exceeds 0.03.
- KL anchor to the folded clone: ρ 0.2 × 0.98^(iteration − 2).
- Iterations 0–1 train the value network only.

**Value network.** Separate from the policy. Its trunk is copied from the clone. The readout
takes the mean, the max, the mover's cell and the enemy cells, plus the global vector.

**Safety.** caffeinate; the loop pauses while heat is ≥ 2 and stops if free memory drops
below 30% or memory pressure rises. `RUN/STOP` ends it cleanly; it resumes from `state.pt`.

**Smoke test** (2 iterations, 8 games): the full cycle ran on MPS. The policy changed after
the first update (KL early stop, clip fraction 0.175), and exports reload in the
clone's format.

## 4. Measurements

**Gates**, in argmax at iteration 0 and every 10 iterations, on the same seeds each time:
- 128 games vs IA Maison;
- 128 games vs the starting clone, in pairs.

**Every iteration:** rollout win rates by opponent, entropy, KL to the clone, value explained
variance, and speed.

## 5. Decision rules

- **Promising:** a gate vs the starting clone reaches ≥ 60% (77/128).
- **Confirmed improvement** (fresh seeds, never used): that checkpoint vs the starting clone,
  400 games (200 pairs). Both must hold:
  - score ≥ 55% with the 95% CI lower bound > 50%;
  - vs IA Maison (256 games) at least the clone's score minus 5 points.

  Only this is called "RL improved the network".
- **Against C1** (the champion): measured only after a confirmed improvement, with a
  pure-policy side added to `calc_duel.cjs`.

## 6. Stop rules

- **Collapse:** two consecutive gates vs IA Maison 15+ points below iteration 0's gate → stop.
- **No progress:** no gate vs the starting clone ≥ 55% by iteration 60 (~15k games) → stop,
  report, and fix the base before any longer run. That follows Vincent's rule: no blind
  pushing.
- **Budget for RL1:** at most 100 iterations (~25k games, about 4–5 h at the smoke pace;
  *estimate*).

## 7. Order

A3 (level-200 gain test of the loop-1 net) is stopped for RL1. It is resumable from
`next-block`.

## 8. Results log

### 2026-10-15 18:20–18:44 — iterations 0–3, heat incident, restart with 3 workers + in-phase brake

**Iteration-0 gate** (argmax, the reference):
- vs IA Maison: **94/128 (73%)** — l100 49/64, l200gear 45/64;
- vs the starting clone (itself): 58 won / 12 drawn / 58 lost (symmetric, as expected).

**Iterations.**
- 0–1: value only; value MSE 0.556 → 0.327.
- 2–3: PPO on. Both stopped early on KL (0.036 and 0.019); clip fraction ≈ 0.17. Entropy is
  0.895; KL to the clone 0.043 → 0.089.
- Rollout win rates per opponent are too small to read (22–88 episodes).

**Heat.** With 4 workers, 13 of 30 heat checks were at level ≥ 2, including two at **level 4**,
and rollouts slowed 3–4× from throttling (17 → 64 ms per decision). The between-phase guard
was not enough. Fix (operational, before any later gate):
- `run_workers` now SIGSTOPs every worker while pressure is ≥ 2 and resumes at ≤ 1 after at
  least 30 s. Tested with forced readings: 1 pause of 30.2 s, 40/40 games finished, 0 invalid
  actions.
- Workers 4 → 3.

The run resumed from `state.pt` at iteration 4 (18:44). Nothing about learning changed.

### 2026-10-15 18:44–19:08 — iterations 4–6, crash at 7, restart

**Iterations 4–6** ran under the in-phase brake with 3 workers.
- Heat stayed at level 1–2 the whole time (watcher samples every 20 s: 36 at level 2, 22 at
  level 1, none at 0). The brake froze workers 178–314 s per iteration, about 60% of play
  time, so an iteration took 5–9 min.
- Heat sources seen besides RL1: VS Code renderer processes at about 2 cores, and Spotlight
  (`mds_stores`) at about 1 core.
- Learning: PPO KL 0.010–0.012 per iteration, KL to the clone 0.050–0.066, entropy about
  0.90, value explained variance 0.06 → 0.09. Rollout win rates per opponent are still too
  small to read.

**Crash at iteration 7.** A worker exited with SIGABRT inside ONNX Runtime's telemetry
(`Microsoft::Applications::Events … recursive_mutex lock failed`, crash report
`node-2026-10-15-190503.ips`), after it had written everything:
- `done.json` was present;
- 85 games and 4,725 steps, consistent across `ep`/`act`/`obs`/`mask`.

**Fix.** A worker now counts as done when its `done.json` exists (written last); the files are
rechecked on load and exit aborts are counted (`exitAborts`). Resumed at iteration 7, 19:08.

### 2026-10-15 19:22 — iteration-10 gate: **promising** → confirmation launched

Gate (argmax, the same seeds as iteration 0); "iter 0" is the clone itself:

| | iteration 0 | iteration 10 |
|---|---|---|
| vs starting clone (W/D/L of 128) | 58 / 12 / 58 | **83 / 12 / 33** |
| pairs (both won / split / both lost) | 0 / 64 / 0 | **33 / 22 / 8** |
| pair score | 0.500 | **0.698 ± 0.087** |
| vs IA Maison | 94/128 | 98/128 |

Wins vs the clone by level: l100 56 of 79 games, l200gear 27 of 49. That clears §5's
"promising" bar (≥ 60%).

**Confirmation** (`scripts/rl/rl1_confirm.py`, criteria exactly as in §5). The candidate is
`pool/iter_0010`. Fresh seed tag `confirm1`, never used for training, gates or smoke.
- **A:** 400 games vs the clone.
- **B:** 256 games candidate vs IA Maison, and 256 clone vs IA Maison on the same seeds.

RL1 paused at the end of iteration 10 (STOP) to keep the machine to one job, and resumes after.

**Fix found while reading the gate.** Workers got odd game counts (43/43/42), so 2 games had
no partner. `run_workers` now hands out whole pairs. This is a scheduling change only.

### 2026-10-15 19:35 — confirmation of `iter_0010`: **CONFIRMED** (§5), with a caveat

`rl1_confirm.py`, fresh tag `confirm1`, argmax, l100 + l200gear, mixed maps. RL1 was paused
from 19:26 to 19:35.

| test | result | §5 bar | |
|---|---|---|---|
| A: candidate vs starting clone, 200 pairs | **92 / 98 / 10** (both won / split / both lost), pair score **0.705**, 95% CI **0.665–0.746** | ≥ 0.55 and CI low > 0.50 | pass |
| A by level (wins) | l100 150/222, l200gear 108/178 | | |
| B: vs IA Maison, same 256 seeds | candidate 186/256 (72.7%), clone 192/256 (75.0%): −2.3 pts | ≥ clone − 5 pts | pass |

**By the pre-registered rule, RL improved the network against its starting version: a pair
score of 0.705, about +150 Elo.** This is the project's first reward-driven gain for a network.

**Caveat (not part of the rule, stated before any further test).**
- The starting clone (argmax) is itself 10% of RL1's training opponents. So part of the gain
  may be *exploiting that one opponent* rather than general strength.
- Against IA Maison, also 10% of training, it did **not** improve (−2.3 pts, n.s.).

Generality checks next, against opponents never seen in training, with the clone on the same
seeds as the baseline:
- sibling clones (same recipe, other seeds: `policy-spatial-r4-e60c-s7`, `-s8`);
- C1 (the champion search; new `c1` opponent kind in `rl1_selfplay.cjs`, C1 settings set
  and reset around each of its decisions, as in `calc_duel.cjs`).

They run at the iteration-20 gate on `iter_0020`, with the clone as baseline.

### 2026-10-15 20:23 — iteration-20 gate: **regressed** from iteration 10

| gate (same seeds) | it 0 | it 10 | it 20 |
|---|---|---|---|
| vs starting clone (W / D / L of 128) | 58 / 12 / 58 | 83 / 12 / 33 | 65 / 12 / 51 |
| vs IA Maison | 94 | 98 | 86 |
| vs IA Maison, l200gear wins | 45 | 46 | 32 |

Not a §6 collapse: Maison is −6 pts against −15 needed twice.

Iterations 11–20:
- KL to the clone grew 0.072 → 0.115 and value explained variance 0.10 → 0.34;
- the last iteration's rollout win rate against past versions was 28/86;
- heat froze workers 0–270 s per iteration.

**Before any change** (decided now, before seeing the checks below):
- **Direct check:** `iter_0020` vs `iter_0010` head-to-head on fresh seeds (200 games, argmax).
- **Generality check** (`rl1_general.py`, tag `gen10`) on the confirmed `iter_0010` instead of
  `iter_0020`. It plays sibling clones s7 and s8 (128 games each) and C1 at l100 (128 games),
  with the clone as baseline on the same seeds.

`iter_0020` is no longer the best candidate, so the pre-announced generality check moves to
`iter_0010`. RL1 stays paused until both are read.

### 2026-10-15 22:05 — direct check and generality check: the iteration-10 gain is **real and general**; iteration 20 regressed

**Direct check (fresh seeds, 100 pairs):** `iter_0020` vs `iter_0010` = 11 / 67 / 22 (both won /
split / both lost), score **0.445** (95% CI 0.390–0.500). The regression is real, about −40 Elo.

**Generality of `iter_0010`** (`rl1_general.py`, tag `gen10`, argmax, the clone on the same
seeds as baseline). None of these opponents were seen in training.

| opponent | pairs | clone (baseline) | iter_0010 | difference (95% CI) |
|---|---|---|---|---|
| sibling clone s7 (l100 + l200gear) | 64 | 0.406 | **0.648** | **+0.242** (+0.132 to +0.353) |
| sibling clone s8 (l100 + l200gear) | 64 | 0.477 | **0.719** | **+0.242** (+0.134 to +0.350) |
| C1 (l100) | 64 | 0.094 | **0.188** | **+0.094** (+0.033 to +0.155) |

The gain carries over to unseen networks, and the score against C1 doubled. But C1 still wins
about 81% of games against the best network.

### Phase 2 (pre-registered before it runs) — steadier PPO from the best checkpoint

**Diagnosis.** Iterations 0–10 gained; iterations 10–20 drifted, so the problem is training
stability, not direction. At about 13k steps and a value explained variance of 0.1–0.34 per
iteration, the policy gradient is noisy.

**Changes, all standard PPO stabilization.** New run `rl1-run2`:
- start from `rl1-run1/pool/iter_0010` (fold 1, already folded), with the value network
  taken from run 1's iteration-20 state (explained variance 0.34);
- the anchor (KL reference and the fixed argmax opponent "clone0") = that same `iter_0010`;
- 512 games per iteration instead of 256;
- policy LR 5e-5 instead of 1e-4;
- KL-anchor decay 0.99 instead of 0.98;
- gates every 5 iterations on **fresh seeds** at each gate.

**Opponent mix and other settings:** unchanged (self 0.5, pool 0.3, anchor 0.1, Maison 0.1).

**Best and rollback rules.**
- Best = the checkpoint with the highest gate pair score against the anchor.
- If two consecutive gates score below 0.45 against the anchor: roll back to the best, halve
  the LR and reset Adam. The second time that happens, stop.

**Success.**
1. The best checkpoint must pass §5's confirmation against the anchor (`iter_0010`) on fresh
   seeds.
2. Then generality as above: siblings, plus C1 at l100, and C1 at l200gear if l100 improves.

**Budget.** At most 40 iterations (~20k games), about 6–10 h with heat pauses (*estimate*).

Phase 2 launched 2026-10-15 22:08:40: `rl1-run2`, value warmup 2 (default, unchanged). The smoke test forced a rollback (`--rollback-below 0.99`): it reloaded the best, halved the LR and continued.

### 2026-10-15 22:37 — phase 2, iterations 0–4 and the iteration-5 gate

| gate (fresh seeds each time) | it 0 (anchor = run-1 iter_0010) | it 5 |
|---|---|---|
| vs anchor: W / D / L, pair score | 53 / 22 / 53, 0.500 | 56 / 14 / 58, **0.492** |
| vs IA Maison | 94/128 (pair 0.734) | 97/128 (pair 0.758) |

- The value network reused from run 1 starts at explained variance **0.38–0.46**, against
  0.06 in run 1.
- PPO KL per iteration is 0.006–0.009; KL to the anchor 0.009–0.017.
- Heat froze workers 151–172 s in iterations 0–2 and not at all in iterations 3–4 (127–167 s
  of play per 512 games).
- One exit abort (ONNX Runtime teardown), handled.
- Track: best = anchor (0.5), no bad gate.

### 2026-10-15 22:52 — phase 2 iteration-10 gate: **new best, 0.602** against the anchor

| gate (fresh seeds) | it 5 | it 10 |
|---|---|---|
| vs anchor (run-1 iter_0010): W / D / L, pair score | 56 / 14 / 58, 0.492 | **75 / 4 / 49, 0.602** |
| vs IA Maison | 97/128 | 92/128 (pair 0.719) |

Track: best = iteration 10 (0.602). That clears §5's ≥ 0.60 bar, so the confirmation runs on
`rl1-run2/pool/iter_0010`: tag `confirm2`, 2 workers, alongside training, with the brake on
both.

Iterations 5–9: PPO KL about 0.005 per iteration, KL to the anchor 0.021 → 0.042, explained
variance 0.42–0.48. Workers barely froze for heat (0–36 s per iteration).

### 2026-10-15 22:59 — confirmation of phase 2 `iter_0010` against the anchor: **CONFIRMED**

`rl1_confirm.py`, tag `confirm2`, ran alongside training.

| test | result | bar | |
|---|---|---|---|
| A: vs anchor (run-1 iter_0010), 200 pairs | **72 / 123 / 5**, score **0.668**, CI **0.631–0.704** | ≥ 0.55, CI low > 0.50 | pass |
| A by level (wins) | l100 132/226, l200gear 116/174 | | |
| B: vs IA Maison, same 256 seeds | candidate 183/256 (71.5%), anchor 192/256 (75.0%): −3.5 pts | ≥ −5 pts | pass |

Two confirmed steps so far:
1. clone → run-1 iter_0010: 0.705, about +150 Elo;
2. run-1 iter_0010 → run-2 iter_0010: 0.668, about +120 Elo.

**Pattern to watch:** against IA Maison, the only scripted (non-network) opponent in the
mix, the score is flat or slightly down at both steps (−2.3, −3.5 pts, n.s.). C1 is the
generality check that matters. It runs on the best checkpoint at the end of phase 2, and
on S_6 in RL2's experiment E.

### Ceiling rule (Vincent, 2026-10-15 23:00; written before any later gate)

"Keep pushing; at a ceiling, check online for the best techniques and apply them."

**Ceiling** = two consecutive phase-2 gates (10 iterations) with no new best: a pair score
against the anchor not above the best so far.

When it triggers:
1. Stop phase 2 cleanly.
2. Confirm and test the best checkpoint against C1 (generality).
3. Choose the next techniques from the online review (started 23:00, background), with
   their rules written here before they run.

The rollback rule (two gates below 0.45 → back to best, LR ÷ 2) stays in force.

### 2026-10-15 23:10 — phase 2 iteration-15 gate: **new best, 0.672**

| gate (fresh seeds) | it 10 | it 15 |
|---|---|---|
| vs anchor: W / D / L, pair score | 75 / 4 / 49, 0.602 | **79 / 14 / 35, 0.672** |
| vs IA Maison (l100 / l200gear wins) | 92/128 (43 / 49) | 86/128 (54 / 32) |

The ceiling rule is not triggered (new best).

**Watch item:** IA Maison wins at l200gear across gates were 44, 37, 49, 32. The number of
l200 games varies per fresh-seed gate, so this is not yet a trend. The §6 collapse rule is
far from triggered (−6 pts against −15).

Iterations 10–14: PPO KL about 0.006 per iteration, KL to the anchor 0.046 → 0.052,
explained variance 0.40–0.49.

### 2026-10-15 23:30 — online review: techniques for the next phase

A background research agent checked about 40 sources. Effect sizes are from the cited
systems; whether they carry over here is *not verified*. Ranked for our symptoms (flat
against IA Maison, drift after a few gates):

1. **PFSP opponent sampling** with a scripted-bot floor. AlphaStar: self-play + PFSP reached
   Elo 1540 with a 71% minimum win rate, against 1143 for uniform past versions. microRTS
   RAISocketAI: 20% → about 90% against a hard scripted bot once half the environments used
   such bots. Sources: AlphaStar PDF, arXiv 2402.08112.
2. **Moving anchor:** a constant small KL to the last promoted champion, switched at each
   promotion, instead of a decaying KL to the old start (R-NaD arXiv 2206.15378; Lux AI 2021
   winner; arXiv 2402.02868).
3. **RL2 targets:** Gumbel-top-k candidates and sequential halving; train on
   softmax(logits + σ(completed Q)), not argmax, and keep the PPO term.
   - ExIt: the full search distribution beat the chosen move by 50 ± 13 Elo.
   - Kickstarting: the RL term was needed to surpass the teacher.
4. **RL2 details:** re-roll dice per visit (empirical means); the DORA one-ply search with a
   proposal network is the closest precedent; add C1's move as a candidate; Reanalyse.
5. **Value network:** give it the opponent type and level, which only the critic sees
   (AlphaStar: 22% → 82% average win rate). Add value pre-training; PPG.
6. Exploiters, one at a time (Minimax Exploiter arXiv 2311.17190).
7. A fixed evaluation panel; report the minimum win rate and Nash averaging (arXiv 1806.02643).
8. **Potential-based, zero-sum HP shaping:** F = γΦ(s′) − Φ(s), Φ(terminal) = 0 (Ng 1999;
   Grześ). Our terminal HP-margin bonus is *not* potential-based. It is harmless only
   because it decays.
9. PLR-style sampling of level × map × opponent.
10. PPO housekeeping.
    - Masks applied in the update: checked, `masked_logp` in recompute, ratio, entropy and KL.
    - Late-training LR and entropy decay.

**Not to do at our scale:**
- a full PSRO or AlphaStar league;
- training only against the latest self or one scripted bot;
- argmax-only targets from a tiny search;
- permanent non-potential shaping;
- removing the anchor KL;
- judging progress only against the previous best.

**Plan.** Phase 2 runs to its ceiling (rule above). Phase 3 is built now as opt-in options and
pre-registered here before it runs:
- PFSP over past checkpoints, sibling clones s7/s8/s12, the anchor, and IA Maison with a
  15% floor;
- moving anchor with constant KL;
- potential-based zero-sum HP shaping;
- opponent type for the value network only.

### 2026-10-15 23:27 — phase 2 iteration-20 gate: 0.609, no new best (ceiling counter 1/2)

| gate (fresh seeds) | it 15 | it 20 |
|---|---|---|
| vs anchor: W / D / L, pair score | 79 / 14 / 35, 0.672 | 73 / 10 / 45, 0.609 |
| vs IA Maison (l100 / l200gear wins) | 86/128 (54 / 32) | 97/128 (42 / 55) |

The earlier dip against IA Maison at l200gear looks like fresh-seed noise.

### Phase 3 (pre-registered 2026-10-15 23:40, before it runs) — `scripts/rl/rl3_train.py`

It starts when phase 2 hits its ceiling (two gates without a new best), from phase 2's best
checkpoint, with phase 2's value network turned into a critic (opponent-type inputs start at
zero).

**Opponents (PFSP).** Mix: self 0.4, pool 0.35, anchor (argmax) 0.1, IA Maison 0.15 (floor).
- The pool holds the last 6 checkpoints, 1 in 5 older ones (at most 12), and the sibling
  clones s7, s8 and s12. These are copies in `rl1-run1/opponents`, never trained against
  before; gen10 used s7 and s8 only for evaluation.
- Each pool opponent is weighted by (1 − p_win)², floor 0.05. p_win comes from training
  games: prior ½, decay 0.8 per iteration.

**Reward.**
- Win/loss ±1.
- Plus potential-based zero-sum shaping, c = 0.5: r_t += 0.5·(γΦ_{t+1} − Φ_t), with
  Φ = HP fraction (me − them) and Φ(terminal) = 0.
- The terminal margin bonus is off.

**Moving anchor.**
- Constant KL of 0.1 to the current anchor.
- Gates every 5 iterations on fresh seeds (128 games). A pair score ≥ **0.55** against the
  anchor **promotes**: the checkpoint becomes the anchor, the fixed opponent and the gate
  reference.
- At each promotion, a generality panel runs: s7, s8, s12, IA Maison, and C1 at l100,
  64 games each; the minimum is reported.

**Stops.**
- **Ceiling:** 2 gates in a row with no promotion → stop and report.
- **Rollback:** 2 gates below 0.45 → back to the anchor, LR ÷ 2, once; the second time stops.

**Other settings.**
- Critic: sees the opponent type; the policy does not.
- PPO: 512 games per iteration, LR 5e-5, value warmup 1 iteration, 3 workers + brake.
- At most 60 iterations.

**Success.** The final anchor passes §5's confirmation against phase 2's best on fresh
seeds, then C1 at l100 and l200gear (a direct comparison with phase 2's best on the same
seeds).

**Smoke** (3 iterations, forced promotions): critic loaded with explained variance 0.475 at
iteration 0; PFSP, shaping, promotion, anchor switch and panel (sib7 / Maison / C1) all ran.

### 2026-10-16 00:56 — phase 3 (`rl1-run3`), iterations 0–4 and the iteration-5 gate: **promotion**

Phase 2 ended at its 40-iteration budget, not at a ceiling. Its gates against the run-1
anchor were 0.50 / 0.49 / 0.60 / 0.67 / 0.61 / 0.70 / 0.64 / 0.76 / 0.76; best = iteration 35.
Phase 3 started 00:39 from `rl1-run2/pool/iter_0035`, with phase 2's value network as the
critic.

**PFSP.** In iteration 0 the learner beat the original sibling clones 171 of 178 times. Their
weight fell to the 0.05 floor, and the anchor and recent checkpoints became the hardest pool
entries (learner win rate ≈ 0.47–0.50).

**Training games.**
- Rollout win rate against IA Maison 72–79% (sampled play).
- Explained variance 0.40–0.46; PPO KL about 0.006 per iteration; KL to the anchor up to 0.026.

**Iteration-5 gate** (fresh seeds):
- vs anchor 66 / 11 / 51, pair score **0.559**. That meets the 0.55 bar, so **promoted**: the
  anchor is now `rl1-run3/pool/iter_0005`.
- vs IA Maison 98/128.

0.559 is near the bar (rough 95% CI 0.49–0.63). The generality panel (s7, s8, s12, Maison, and
C1 at l100, 64 games each) is the check; it runs at every promotion.

### 2026-10-16 01:05–01:17 — panel at the iteration-5 promotion: **no gain against C1**; phase 3 paused

Panel for `rl1-run3/pool/iter_0005` (argmax, 64 games each, fresh seeds):

| s7 | s8 | s12 | IA Maison | C1 (l100) |
|---|---|---|---|---|
| 0.906 | 0.836 | 0.836 | 0.734 | **0.078** |

**Every network so far against C1 at l100** (64 games each, *different* seeds each time):

| checkpoint | score against C1 |
|---|---|
| clone | 0.094 |
| run-1 iter_0010 | 0.188 |
| run-2 iter_0010 | 0.109 |
| run-3 iter_0005 | 0.078 |

Each step won against its predecessor on fresh seeds (0.705, 0.668, phase-2 gates up to 0.76,
then 0.559). Against C1, the opponent that matters, the trend is flat. This is the
self-play non-transitivity the online review warned about ("don't judge progress only against
the previous best").

**Decision (scheduling, before the measurement below):**
- The auto-chain to phase 4 was stopped by hand, so it cannot start phase 4 with settings that
  only gate against the anchor.
- Phase 3 was asked to stop at its next iteration (STOP 01:17; resumable).
- **Fixed-seed C1 benchmark** (`scripts/rl/rl_c1bench.py`, tag `c1bench-l100`, 96 games each,
  identical seeds): clone, run-1 iter_0010, run-2 iter_0035, run-3 iter_0005. It decides
  whether RL has moved the network against C1 at all.

Phase 4 will be amended (in `docs/selfplay-rl2.md`) before it runs. New options are in the code,
off by default:
- `--c1-share`: training games against C1, at `--c1-lk`;
- `--c1-gate-games`: a fixed-seed C1 bench at every gate; promotion also requires no C1
  regression (`--c1-tol`).
