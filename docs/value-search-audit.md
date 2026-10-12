# Value-Search Bot — Results & Self-Learning Plan (Audit Document)

Date: 2026-10-11 (rev. 2, post-expert-audit) · Scope mandated by Vincent: **CRA vs CRA, level 100, no equipment**.
Goal: a search+learned-value bot (TD-Gammon/AlphaZero family) that beats IA Maison, then humans.

**This revision incorporates the independent expert audit** ([value-search-expert-audit.md](value-search-expert-audit.md),
findings F01–F14). Its corrections to this document's earlier claims (its §8) are applied
below; each repair landed today carries the fixture that proves it. Search snapshot of this
revision: `SEARCH_VERSION = 'A1-2026-10-11'` (logged in every mirror line from now on).

## 1. Architecture (current, post-repair)

The bot is **not** a bare policy network (that approach — Synapse — failed and is retired).
It is a calculator with a learned judge:

1. **Turn enumeration** — BFS over move/cast/interleaved lines via the official bot API,
   retained-node budget (default 8,000) + per-decision CPU cap (3× budget, measured from a
   per-decision baseline — the earlier match-cumulative cap was a critical regression, see §3).
   **Semantic target prefilter (F02 repair)**: a cast whose effect zones
   (`spellZoneCells`, the engine's own geometry) contain no living fighter is skipped
   *before* `applyAction` — exceptions kept for cell-effects (traps/glyphs/teleports) and
   caster-only effects (`targetMask & 32`, one representative target). Null-cast `effectKey`
   pruning remains as backstop. Dedupe on a **complete** semantic state key (F07 repair:
   full effect identities/durations/signs, per-target uses, carry, hazards — the old key
   stored only the effect *count*).
2. **Nomination (F08 repair)** — damage lines deduped by (spell-combo, **final cell**) so
   "shoot in place" and "shoot then retreat" both survive; per combo: best-HP line *and*
   most-retreated variant (top 8 combos each); setup lines (buff/poison/debuff, 1 per combo,
   self-harm excluded); positional candidates; extremes; 3 random; **plus the full maison
   turn as a witness candidate** — the "improvement operator" always evaluates its
   reference action under the same sampling protocol.
3. **Rollout** — end turn → opponent reply → one more full round, both sides played by the
   real maison policy. This is a **fixed-horizon maison-policy rollout, not quiescence**
   (audit F14): tactical quietness at the cutoff is not established, and the bias is an
   open experimental question, not an absorbed constant.
4. **Judge** — leaf = value net `V(obs) ∈ [−1,1]` ×1000 + 0.35 × hand heuristic (HP + threat),
   clamped to ±999; terminals ±1000. Threat (`damagePotential`) now follows the **engine's
   startTurn semantics** (F06 repair): cooldowns −1 for the waiting fighter, per-target uses
   cleared, PA/PM = base + active effects — a −4 PA debuff cuts measured threat 42→10
   (fixture), and a spell at cooldown 1 counts for its next turn (fixture: cd1→20, cd2→0).
5. **Sampling (F03 repair)** — 3 common dice streams per decision, seeds derived from the
   decision state (not process history). *Every* score replays the candidate's own actions
   from the root under a fresh stream (the enumeration sample is never reused). Stage 1:
   1 fresh replay per nominee (ranking only). Stage 2: finalists (top 6 + maison witness)
   get all 3 streams; **selection is over finalists only** — a 1-sample candidate can no
   longer win selection. Open-loop replay halts if the match ends or the turn changes.
6. **Selection (F04 repair)** — argmax of the 3-sample mean. A terminal win (±1000) now
   always outranks a clamped leaf (±999): the old `−0.5 × plan-length` penalty is **out of
   the score** and acts only as an exact-tie break (shorter plan wins ties).
7. **Replan after every action** (plan-commit was tested and is worse — see §3).

### Files

| Path | Role |
|---|---|
| `scripts/rl/search_bot.cjs` | Search, rollouts, judges, eval bench, probe flags `SB_*`, `SEARCH_VERSION` |
| `scripts/rl/value_gen.cjs` | Dataset generator (maison±ε or search games; `--model` to judge with a net) |
| `scripts/rl/train_value.py` | Value-net trainer; **featureVersion now read from shard metas** (F10 repair), seeded init |
| `scripts/rl/value_net.cjs` | Pure-JS inference + `parity` CLI (torch↔JS gate) |
| `scripts/rl/encoder.cjs` | Observations: V1 (4,082 dims, legacy) and V2 (5,126 dims) — **V2 still incomplete, see F05** |
| `local-observations/rl/value-cra1/` | Round-1 (V1) data 5.6 GB, model (384,033 params), eval logs |
| `local-observations/rl/value-cra2/` | V2 data + model (517,665 params, parity 1.112e-6), eval logs |

## 2. Evaluation protocol

- CRA mirror, level 100, no loadout, map `arene`, `MAX_MATCH_ACTIONS` 800. An
  action-limit abort is **not** a genuine draw (audit): it is logged as D and treated as
  a protocol artifact (0 observed in 6,120 V1 games).
- Paired seeds: games 2k/2k+1 share a seed; the search side alternates A/B. Judge/config
  comparisons run on **matched seed blocks**; fresh blocks are reserved for confirmation.
- Reference points: maison in the bot's seat scores exactly 8W–8L (bench fairness);
  maison-vs-maison CRA mirror side bias A 35 / B 25, n=60 across the 5 tune maps.
- **Statistical honesty (audit §6)**: ~32–64 games is a *smoke test*, not a promotion
  certificate. At 64 games, ≥55% happens 19.1% of the time under a fair coin. Illustrative
  95% Wilson intervals: 37/64 = 57.8% → [45.6%, 69.1%]; 29/64 = 45.3% → [33.7%, 57.4%].
  Promotion claims require a predeclared confirmation budget (first guess: 256 seed pairs /
  512 games), paired per-seed analysis, and an explicit "inconclusive" outcome when the
  bound doesn't clear the margin. No historical row below meets that bar.
- Game-scale context (measured): ~380–410 legal atomic actions per decision, 66–79
  decisions/match, one full turn = 2,000–6,000+ distinct end states; full-match tree
  ≈ 10^206 → bounded search + judge is the only viable calculator design.

## 3. Complete results history (chronological, nothing omitted)

All vs IA Maison, CRA mirror L100 arene unless noted. **Every row is a point estimate on a
small sample under its own code snapshot — trend evidence, not certified strength.**

| Config | n | W–L | Win% | ms/dec |
|---|---|---|---|---|
| v0 search + hand judge, L200-gear IOP/CRA cross (not mirror) | 8 | 3–5 | 37.5 | 376 |
| v0 search + hand judge, mirror **L200gear** | 16 | 0–16 | 0 | 544 |
| v0 search + hand judge, mirror L200gear IOP | 16 | 1–15 | 6.3 | 578 |
| v0 search + hand judge, mirror L100 (control) | 16 | 1–15 | 6.3 | 115 |
| v0 search + **net v1** | 32 | 0–32 | 0 | 192 |
| fixed search (null-cast prune, interleave, cell dedupe) + hand | 16 | 2–14 | 12.5 | 97 |
| fixed search + net v1 | 32 | 0–32 | 0 | 136 |
| + real-maison sim opponent + blended judge | 16 | 0–16 | 0 | 147 |
| + spell-combo nomination | 16 | 0–16 | 0 | 205 |
| + quiescence→rollout (3 scripted turns) | 16 | 0–16 | 0 | 325 |
| **probe** `SB_CLAIRVOYANT` (diagnostic: real dice) + net | 16 | 5–11 | 31.3 | 234 |
| probe clairvoyant + hand | 16 | 6–10 | 37.5 | 176 |
| probe `SB_COMMIT` (whole-turn commit, no replan) | 16 | 0–16 | 0 | 462 |
| probe commit + clairvoyant | 16 | 1–15 | 6.3 | 454 |
| fair 3-sample averaging + net | 16 | 3–13 | 18.8 | 407 |
| + CRN / + deterministic sim (⚠ same seeds + deterministic sim ⇒ the 3 runs largely replayed identical games) | 16 | 3–13 | 18.8 | ~390 |
| fair, fresh seeds (offset 1000) + net | 32 | 4–28 | 12.5 | 393 |
| **BFS coverage fix**, offset 2000 + net | 32 | 12–20 | 37.5 | 552 |
| BFS, offset 3000 + net | 32 | 17–15 | 53.1 | 821 |
| BFS, offset 3000 + hand | 32 | 19–13 | 59.4 | 610 |
| BFS, offset 2000 + hand | 32 | 18–14 | 56.3 | 645 |
| probe budget 8,000 vs 4,000, offset 4000 + net (⚠ differing seed blocks — motivates a controlled budget comparison, does **not** establish +20pp) | 16 | 11–5 | 68.8 | 980 |
| **⚠ REGRESSION (self-inflicted)**: while landing review fix #1 I capped CPU on the *match-cumulative* counter — search collapsed after the first decisions. Offset 6000 + hand | 32 | 0–32 | 0 | — |
| same regression + net V2 (killed early) | 26 | 0–26 | 0 | — |
| regression root-caused (audit F01 counter probe confirms), per-decision baseline fix + smoke, offset 6000 + hand | 8 | 7–1 | 87.5 | 846 |
| cap-fixed search + hand, offset 6000 (**orphaned**: session died at game 27) | 27 | 24–3 | 88.9 | — |
| cap-fixed search + net V2, offset 6000 (**orphaned** at game 28) | 28 | 16–12 | 57.1 | — |
| **Expert audit received** → F02–F08/F10 repairs (`A1-2026-10-11`) · smoke, offset 7900 + hand | 8 | 8–0 | 100 | 1,164 |
| **A1 verdict**, offset 7000 + hand judge (sanity same block: maison-in-seat exactly 8–8) | 32 | **32–0** | **100** | 1,218 |
| A1 verdict, same seeds + net V2 judge (paired: hand ≥ net on all 32 seeds, 1 discordant) | 32 | 31–1 | 96.9 | 1,474 |
| A1 controlled budget probe, same seeds + hand, **budget 4,000** (vs maison, 4k suffices; both at ceiling so no 4k≡8k claim in general) | 32 | 32–0 | 100 | 892 |
| **A1 vs Synapse champion** (`ppo-v1/pool/iter_0120`, its own training scope: CRA l100 naked), hand judge, offset 7000 | 32 | **32–0** | **100** | 1,265 |

Pooled pre-regression fair config (64 paired games each): net v1 29/64 = 45.3%, hand
37/64 = 57.8% — per the audit: *historical estimates from superseded snapshots; the
repaired configuration must be frozen and remeasured*. The V1-net-vs-HP-rule check
(75.9% vs 72.1% winner-sign accuracy on 2,048 positions) shows aggregate accuracy is a
weak headline; it does **not** prove "the net mostly reads HP" (that needs ablation).

### Diagnosis chain (what the probes established)

1. ~0% across 6 upper-layer fixes ⇒ flaw below all of them.
2. Clairvoyant dice 0 → 31–37% ⇒ **single-sample stochastic planning** (winner's curse at
   every decision) was *a* base flaw — diagnostic evidence of chance-sensitivity, not a
   proof it was the only one (audit correction): the budget/coverage defects were
   independent and equally fatal.
3. Fair resampling + BFS coverage closed most of the measured gap.
4. The V2 search shards (s0/s1) decode to **0 wins / 180 games** for the search side —
   generated under the cap regression. Archived as counterexamples with a failing-policy
   flag; never evidence of self-play progress.

## 4. External review round 2 (full audit) — status of F01–F14

The first review's "six findings, all verified, all fixed" claim was **wrong** (audit §8):
several fixes were partial. Current status, with proof where repaired today:

| # | Finding (audit) | Status 2026-10-11 | Proof |
|---|---|---|---|
| F01 | CPU cap used match-cumulative counter | **Fixed** (per-decision baseline) | audit counter probe 594→0→0 before, 610→610 after; coverage probe below identical on call 1 and 2 |
| F02 | No two-cast / cast-then-move plans within budget | **Fixed** (semantic target prefilter before `applyAction`) | opening probe, budget 8k: castStates 610→**8,000**, twoCasts 0→**6,491**, castThenMove 0→**853** |
| F03 | 1st sample never replayed; 1-sample candidates could win selection | **Fixed** (all scores are fresh full-plan replays; selection over equally-sampled finalists only; replay halts on turn change) | code `search_bot.cjs` replay guard + finalist-only argmax |
| F04 | Depth penalty could override terminal wins; blend calibration open | **Fixed** (penalty → exact-tie break only). Calibration of the heuristic blend: **open**, needs value-only vs blend ablation | code; terminal ±1000 > clamp ±999 by construction |
| F05 | V2 encodes 11/21 enemy CRA spells; merged stats; sentinel `p2=−1` | **OPEN** — needs encoder V3 + regeneration (Phase B) | verified: 21 spells in live view, 12 slots |
| F06 | Next-turn threat ignored cooldown timing, per-target uses, resource buffs | **Fixed** (engine startTurn semantics: cd−1 when waiting, uses cleared, `turnResources`) | fixtures: all-cd5→0; harcelante cd1→20, cd2→0; −4 PA debuff 42→10 |
| F07 | State key stored only effect count; hazards/per-target uses missing | **Fixed** (full effects JSON, usedOnTarget, carriedBy, hazards; also in `effectKeyOf`) | fixtures: duration 1 vs 3 → distinct keys; +40 vs −40 → distinct keys |
| F08 | Nomination erased position/order variants; setups could be self-harm; no reference action | **Fixed** (combo×cell dedupe, retreat variant per combo, self-harm filter, maison witness candidate forced into finalists) | code |
| F09 | Generator: unbounded buffering, no checkpoints/backpressure | **OPEN** (Phase B) | — |
| F10 | Trainer hard-coded `featureVersion: 2`; V1 data would export a lying manifest | **Fixed** (version read+asserted from shard metas; `torch.manual_seed` added) | `train_value.py` |
| F11 | Match split identity unstable across shard layout | **OPEN** (Phase B: immutable match identity) | — |
| F12 | Pool/champion-vs-candidate machinery not implemented; no best-checkpoint selection | **OPEN** (Phase C) — plan §6 updated to say so honestly | — |
| F13 | No run provenance; planner RNG depended on process history | **Partially fixed**: planner/nomination/leaf seeds now derived from the decision state (single game rerunnable in isolation); `SEARCH_VERSION`+judge+budget+offset now logged per game. Full manifests (engine/model fingerprints): **open** | code |
| F14 | "Quiescence" is a fixed-horizon maison rollout; bias unmeasured | **Acknowledged & renamed**; horizon/policy ablation queued | — |

Healthy checks that remain green: torch↔JS parity V1 1.168e-6, V2 1.112e-6 (tensor-pack
only — live-encoder parity is a separate open item, F10 note); shard byte/label
consistency; legacy neuralBot tests 5/5.

## 5. Current state (post-Phase-A verdicts, 2026-10-11)

- Phase A (trustworthy planner) repairs **F01–F04, F06–F08** landed; all acceptance
  fixtures pass. On the fresh offset-7000 block (sanity on the same block: maison-in-seat
  exactly 8–8), fair play, replanning each action:
  - **vs maison: 32–0** (hand judge; 40–0 cumulative with the offset-7900 smoke);
  - **vs Synapse champion `iter_0120`: 32–0** at Synapse's own training scope —
    "beats our previous ones" holds for maison and Synapse;
  - judge attribution on matched seeds: hand 32–0 vs net V2 31–1 (paired: 1 discordant
    seed, won by hand) — **the learned judge does not beat the hand judge**; maison is now
    too weak to separate judges, the discriminating test is bot-vs-bot (blocked on F12);
  - controlled budget on matched seeds: 4,000 nodes also 32–0 at 892 ms/dec (−27% CPU) —
    4k suffices *against maison*; no general 4k≡8k claim (ceiling on both).
  - Caveats (scope, per audit): one map (`arene`), CRA mirror l100 naked, 32-game blocks =
    smoke-scale; a 32–0 block is p≈2.3e-10 under a fair coin, but the residual
    uncertainty is bench scope, not the count. `bot(V1)` vs `bot(V2)` head-to-head still
    impossible (F12 machinery).
- The V2 net (517,665 params, 75.88% val sign-accuracy, parity 1.112e-6) was trained on
  pre-repair data (97.8% maison games; the 2.2% search games came from the broken policy —
  archived as counterexamples). With the repaired search as a *much stronger teacher*
  (two-cast/retreat tactics now exist in its games), Phase B regeneration is the path for
  the net to earn the judge seat.
- Observed cost at budget 8,000: 1.2–1.5 s/decision (opening ≈ 1.8 s); 4,000: ~0.9 s.

## 5bis. Round C1 — predeclared protocol (written BEFORE results, 2026-10-11)

Vincent authorized large compute with explicit control. Declared before any C1 result exists:

- **Data** (`value-cra3/shards`, featureVersion 3, generator rev with manifests/backpressure/
  stable `.v.u8` split): 2×1,000 maison±ε(0.08) anchors; 6×300 teacher-vs-maison
  (teacher = `A1` search + hand judge, budget 4,000, teacher side ε-free); 4×150 self-play
  (both sides search, ε 0.06 pre-search). ~4,200 games, ~48% of positions from maison games
  (vs 97.8% in V1/V2 data).
- **Training**: same arch (`value-v1`, ch32/gdim96; input auto-sizes to 6,122), AdamW 3e-4,
  4 epochs, seeded init, split from generation-time flags.
- **Gates, in order**:
  1. parity torch↔JS < 2e-3 (expect ~1e-6);
  2. smoke — `bot(V3 blend)` vs maison, 32 fresh-seed games: **≥ 30 wins** required
     (no ceiling regression);
  3. **main gate** — `duel`: `bot(V3 blend)` vs `bot(hand)`, same calculator both sides,
     64 games (32 paired seeds × both seats), fresh offset: net must score **> 32/64**
     to claim anything; 64 games only detects large effects — if promising but not
     decisive, a 256-seed-pair confirmation is the follow-up, not a re-roll.
- **Kill criteria during generation**: shard stalls > 10 min; teacher win rate in `search`
  shards < 80%; aborts > 2% of games. Any trip → stop fleet, diagnose, no training on
  suspect data.
- **Stop rule**: if the main gate fails, run one diagnostic pass (per-source calibration,
  candidate-ranking probe vs expensive reference) and stop — no blind round 2.

### C1 outcome and C1-b (declared before C1-b results)

- C1 data: **passed** all tripwires (3,080 games, 163,181 positions, 0 aborts, teacher
  98.7–100% per shard, self-play seat-balanced). Training: V3, 645,153 params, val
  sign-acc 73.2% (61.7/76.6/81.8 by phase). Parity 6.7e-7 ✅.
- Maison smoke: **29–3 = FAIL** (bar ≥30). Matched-seed hand-judge attribution on the
  same block: in progress at time of writing. Diagnostic (val accuracy by source):
  teacher-games 81–90%, **balanced maison games 67–69% with early phase ≈ 56%** —
  early positions of balanced games are the hole; all 3 smoke losses were 8-turn games.
- **C1-b treatment (single knob, justified by the diagnostic)**: offline λ-returns
  (TD-Gammon seat) — per-player trajectory targets `G_t = (1−λ)·V(s_{t+1}) + λ·G_{t+1}`,
  final target z, λ=0.85, bootstrap = V3, same shards, fresh init, validation still
  graded against true z. Gates unchanged: parity → smoke ≥30/32 on the SAME block 8000
  (direct comparison with V3's 29–3) → 64-game duel vs hand.
- Vincent's standing order (2026-10-11): iterate until gates pass, then advance. Control
  retained: each round needs a diagnostic-justified treatment; two consecutive rounds with
  no gate progress ⇒ pause and report.

### C1-b outcome, duel, divergence probe, and C2 (declared before C2 results — 2026-10-12)

- Matched-seed attribution, block 8000 vs maison: **hand 31–1, V3 29–3, V3-TD 29–3 with
  the identical three losses** (games 15/19/26; game 15 lost by all three — hard seed).
  λ-returns (C1-b): no gate progress — val metrics moved (early acc 61.7→62.6), play
  unchanged. One treatment, no improvement (counts toward the two-strike pause rule).
- **Main-gate duel** (V3 blend vs hand, same calculator both sides, 64 games, 4 fresh
  blocks): net **30–34 (46.9%)**, seat-balanced (14/32 as A, 16/32 as B). Gate failed;
  the learned judge is slightly behind the hand judge, consistent across V2 and V3.
- **Decision-divergence probe** on the two judge-attributable losses: both diverge at
  decision #1 of turn 1 — hand opens move-to-mid + `tir_eloigne` + `maitrise_de_l_arc`
  + `oeil_de_taupe` chip (4-action tempo turn); net opens **retreat-to-edge +
  `tir_puissant` + PASS with PA left** (turtle). Root cause named: outcome-only labels
  from ~50 decisions away do not teach tempo; the net's early value surface is flat and
  passive. This is the audit's predicted failure mode of pure Monte Carlo value learning.
- **C2 treatment (single variable)**: dense teacher-verdict targets, Stockfish-NNUE style.
  The generator now logs the search's root value (best-plan 3-sample mean, ∈[−1,1]) per
  calculator decision (`.sv.f32` sidecar, sentinel 2.0 elsewhere; smoke-verified: 54.5%
  coverage in search mode, sane range). New data: 6×150 teacher + 3×60 self games, fresh
  seeds, same teacher/budget. Training target: `y = 0.5·sv + 0.5·z` where sv exists,
  z elsewhere (C1 shards remain as outcome-only anchors). Gates unchanged: parity →
  matched smoke on block 8000 (reference: hand 31–1) → 64-game duel vs hand (>32/64).

### C2 outcome (2026-10-12) — prediction improved, duel unchanged; strike 2 declared

- C2 data: 1,080 games / 56,694 records, 0 aborts, teacher 98–100%, sv coverage 51%
  (teacher games) / 94% (self-play) — all tripwires green.
- V4 (sv-blend targets, same arch): same-testset accuracy **80.5% vs V3's 76.2%**
  (n=13,781; early 65.4→70.2, late 83.0→88.3). Parity 4.5e-7 ✅.
- Matched smoke block 8000: **V4 30–2 — gate passed** (ladder on identical seeds:
  V3 29–3 → V4 30–2 → hand 31–1; V4 recovered judge-attributable loss #26).
- **Main-gate duel: V4 30–34 (46.9%) — identical to V3's 30–34.** Paired across the two
  duels on the same seeds: 12 flips each way (18 WW / 12 WL / 12 LW / 22 LL) — variance
  churn, no signal. Seat-balanced (15/32 both seats).
- **Interpretation**: the leaf-judge channel appears saturated at this scope — the blend
  already contains the hand heuristic, the search + rollouts dominate decisions, and a
  measurably better outcome predictor (+4.3pp) buys zero duel wins. Two treatments, two
  prediction improvements, zero main-gate progress ⇒ **strike 2, pause rule active**.
- **Confirmation duel (256 games, 8 fresh blocks): net 127–129 = 49.6% ± 6.1pp (95%).**
  Per-block 12/32–20/32, seat split 69/128 vs 58/128. Verdict: **statistical parity** —
  the earlier 46.9% readings were small-sample noise; there is no judge deficit, and no
  judge surplus. The leaf-judge channel is saturated at this scope: a +4.3pp-better
  outcome predictor plays exactly as well as the hand heuristic inside an equal search.
- **Round C conclusion**: the learned judge reached hand-judge strength from data alone
  (useful property for scope changes, where hand heuristics need manual retuning), but
  cannot beat it in the leaf seat at CRA-mirror l100. Strike-2 pause honored: no further
  leaf-seat training rounds. The fork (net as nomination prior = phase D; scope-up to
  l200/gear/pool; ship the calculator in-game; or stop ML) is Vincent's strategic call —
  recommendation recorded: phase D and/or scope-up, where the saturated channel opens.

### Scope-up baselines — level 200 geared (2026-10-12, offset 10000, budget 4000)

- Sanity (maison in bot seat, same block): exactly 8–8 ✅.
- **Hand judge: 30–2 (93.8%)**; **V4 (trained on l100 data only): 29–3 (90.6%)** — the
  search and both judges transfer to Vincent's real conditions (Synapse's score here: ~0).
- Paired losses on identical seeds: hand loses {20, 22}, V4 loses {0, 11, 18},
  **no overlap** — V4 wins both hand-lost games and vice versa. Unlike l100 (strict
  hand ≥ net nesting), the judges' failure modes at the new scope are *complementary*:
  the first observed precondition for the learned judge to add real value (ensemble,
  blend tuning, or l200-mixed retraining are now justified experiments for the next round).
- In-game port (« Stratège » builtin, searchBrain.js, loyal view-only): strength at
  budget 300 = 16–0 (l100) and 16–0 (l200gear) on fresh seeds; port↔bench parity 25/25
  decisions; guard tests 7/7.
- **UI latency saga (2026-10-12)**: Vincent's "crash" = synchronous main-thread search
  (LiveMatch-measured 1.9s avg / 5.1s max per action at l200gear under bench contention).
  Micro-profile: 1 simulated maison action = 15.4 ms (full utility scan), 1 castTargets =
  2.5 ms — rollouts dominate at l200, enumeration at l100. Speed-profile attempts, all
  strength-gated: greedy rollout alone **3–5/8 = banned** (weak opponent model corrupts
  judgment); fastCasts alone 8–0; shape cuts alone 7–1; naive combination at budget 150
  **7–9/16 = knobs interact, rejected**. Shipped: bench semantics + fastCasts + budget 300
  → **16–0 l100 (0.53s avg) and 16–0 l200gear (1.8s avg, 6s max)**. The l200 latency is
  structural for on-thread execution; the queued fix is a Web Worker running the
  full-strength search off-thread (no strength compromise, no freeze).

## 6. Learning plan (revised per audit §§4–7)

Phases, each with exit conditions — no large training run before its predecessors hold:

- **A — trustworthy planner** (today): fixture battery green; reproducible baseline matches
  vs maison on matched seed blocks; controlled budget comparison. *Exit*: stable,
  attributable baseline strength for search+hand and search+V2 judges.
- **B — trustworthy data**: encoder V3 (full both-side CRA kits: readiness of all 21
  spells, signed effects with durations, boosted-spell identity, normalized magnitudes);
  live-encoder parity (not just tensor parity); generator streaming/checkpoints (F09);
  immutable match identity + stable split (F11); run manifests (F13 full). *Exit*:
  interrupted generation resumes; shard schema validated; saved live observation matches
  training features bit-for-bit.
- **C — small learning pilot**: independent champion/candidate bot instances with their own
  models and planner streams (F12); best-validation-checkpoint selection; a few hundred
  games end-to-end. *Exit*: a candidate can be trained, evaluated and reproduced.
- **D — learn search allocation**: action-ranking/policy prior from logged search decisions
  (candidate identity, effort, scores are logged from Phase A on); compare prior-guided
  nomination vs current hand rules at matched compute; Gumbel-style allocation is the
  later candidate if low sample counts bind.
- **E — scale** only after repeated measured gains per compute hour.

Promotion protocol (replaces the old G1–G4 gates): smoke (≈64 games) only filters
collapse; confirmation = predeclared budget (star: 256 seed pairs), paired per-seed
scores, both seats per seed, uncertainty bound must clear a declared margin, else
**inconclusive**. Two failed 64-game rounds do *not* declare a plateau (audit): a plateau
claim requires adequate power plus layer-specific diagnosis (§6 "measure the part that
fails" table in the expert audit).

## 7. Watch list (open items, by audit finding)

- **F05**: V2 still blind to 10 enemy CRA spells (incl. `tir_puissant` readiness) — the
  single biggest known representation hole; fix in Phase B, not patchable by training.
- **F04-cal**: heuristic blend calibration (value-only vs bounded-blend ablation).
- **F09/F11/F13**: generator robustness, stable splits, full run manifests.
- **F12**: pool machinery — `SB_SELF` shares one global judge; `bot(V_new)` vs `bot(V_old)`
  requires independent instances (Phase C blocker for expert iteration).
- **F14**: rollout policy/horizon ablation; "bias cancels in ranking" remains unverified.
- Nomination recall vs an expensive reference search (audit's "measure the part that
  fails"): not yet instrumented.
- `arene`-only evaluation vs 5-map generation: objective to be declared explicitly.
- Draw semantics: action-limit abort ≠ game draw; keep separated in labels and reports.

## 8. Reproduction commands

```bash
# bench sanity (expects ~8W-8L)
SB_MAISON=1 node scripts/rl/search_bot.cjs mirror 16 CRA l100

# coverage acceptance probe (audit F02): expect twoCasts/castThenMove > 0, stable across calls
SB_BUDGET=8000 node - <<'JS'
const sb = require('./scripts/rl/search_bot.cjs');
const { createGame } = require('./src/engine/engine');
const { state } = createGame({ mapId: 'arene', seed: 1, fighters: sb.makeFighters('l100','CRA','CRA') });
const c = { applies: 0, ms: 0, decisions: 0, endsSum: 0, invalid: 0 };
for (let i = 0; i < 2; i++) { sb.searchDecide(state, c);
  console.log(JSON.stringify({ applies: c.applies, covTwo: c.covTwo, covCastMove: c.covCastMove })); }
JS

# fair eval, net judge, fresh seeds (same offset for the paired hand-judge run)
SB_SEED_OFFSET=7000 node scripts/rl/search_bot.cjs mirror 32 CRA l100 out-net.jsonl local-observations/rl/value-cra2/model
SB_SEED_OFFSET=7000 node scripts/rl/search_bot.cjs mirror 32 CRA l100 out-hand.jsonl

# diagnostic upper bound (NOT fair play)
SB_CLAIRVOYANT=1 node scripts/rl/search_bot.cjs mirror 16 CRA l100

# controlled budget comparison (same seeds)
SB_BUDGET=4000  SB_SEED_OFFSET=7000 node scripts/rl/search_bot.cjs mirror 32 CRA l100 b4k.jsonl
SB_BUDGET=16000 SB_SEED_OFFSET=7000 node scripts/rl/search_bot.cjs mirror 32 CRA l100 b16k.jsonl

# dataset + training + parity
node scripts/rl/value_gen.cjs --out shards/mX --matches 1500 --mode maison --seed0 0 --eps 0.08
python3 scripts/rl/train_value.py --shards local-observations/rl/value-cra2/shards --out local-observations/rl/value-cra2/model --epochs 3
node scripts/rl/value_net.cjs parity local-observations/rl/value-cra2/model

# one fully-logged game (every action printed)
node scripts/rl/search_bot.cjs debug CRA l100 MODEL_DIR
```
