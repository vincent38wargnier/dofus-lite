# Self-Play Loop 1 — Protocol (pre-registered before any loop-1 data exists)

Date: 2026-10-14 · Champion going in: **C1** = calculator `{budget 1200, fastCasts, horizon 1}`
on the view-rebuilt state (calc_duel spec `fc=1+rv=1+b=1200+h=1`), which beat the in-game
Stratège 116/192 (60.4%, +79.5 nElo, SPRT-H1 at [0, 40] nElo) on 2026-10-14.
Scope: **CRA mirror**, levels **l100** (naked) and **l200gear** (Vincent's real conditions).

This document fixes the design, the gates and the stop rules **before** results exist. Any
change after data arrives is logged as an amendment with its reason, never silently.

## 0. What loop 1 is — and what it is not

Loop 1 is one turn of the AlphaZero / Expert-Iteration crank, done the way Stockfish NNUE
was bootstrapped: the champion plays itself, every end-of-turn position it already scores
is recorded with its score, and a neural value net learns to reproduce that score. The net
then replaces (part of) the expensive simulation inside the same search, so the search can
look at more plans in the same thinking time.

Honest expectation, measured before launch (smoke data, §6): C1's own choice is already
within ~2 judge points of the best candidate *by its own evaluation*. A distilled net cannot
make that evaluation *smarter*; it makes it *cheaper*. Loop 1 therefore converts into Elo
only where more search buys strength (measured: l100 yes in the in-game profile, l200 not
shown). Where it doesn't, its value is speed (in-game latency), tested separately (§8 B).
"Learning from wins" (game outcomes) enters in loop 2, once the cheaper search makes
enough games affordable (§9) — loop 1 records the outcomes now so nothing is lost.

## 1. Practice → decision map (sources verified 2026-10-14)

| Industry practice (source) | Loop-1 decision |
|---|---|
| Train on the positions the search actually queries; include non-chosen ones (Stockfish nonpv generator; Giraffe; AlphaGo 2016) | Record **every** afterstate C1 scores (all ~20 nominees + finalist samples) **plus 6 random enumerated ends** per decision |
| Afterstate value = expectation over chance; train it by regression on sampled targets (Stochastic MuZero; Sutton & Barto §16.1, TD-Gammon) | Unit = position after my turn, before the opponent's dice; MSE on 1-reply samples (label noise measured: ≈1.4% of label variance) |
| Label with a fixed search; diversify with random near-best moves early (Stockfish `gensfen`: depth 9, `random_multi_pv`) | Labels = C1's own score (1 maison reply + hand judge); in turns ≤3, 15% of decisions play a random top-3 finalist |
| Win-probability target, scale fitted to the engine's data; λ blend with results in [0.75, 1] (nnue-pytorch `nnue.md`, PR 3927/4020) | Two target variants: `linear` (J/1000) and `wdl` (tanh(J/L), L = s/2 with s fitted on our games). **λ = 1** in loop 1 (see §9) |
| Value nets need >10^5 independent games or they memorize outcomes (Expert Iteration; AlphaGo 2016) | **No outcome head in loop 1** (≈1.5k games); outcomes recorded for loop 2 |
| Keep positions, re-score with each improved search (NNUE `transform rescore`; MuZero Reanalyse) | Each record stores its **full afterstate JSON**; each decision stores its **root state**. Relabel fidelity proven bit-exact (§6) |
| Validate a value net by **ranking of sibling candidates**, not only MSE (TD-Gammon; Tesauro 1995) | Offline gate = **regret** vs a 16-sample reference on held-out decisions (§5) |
| Split by game, never by position (AlphaGo 2016 memorization) | Separate train / validation workers, seed ranges and flags |
| Pentanomial GSPRT on colour-swapped pairs, α = β = 0.05, normalized-Elo bounds, never fixed-n (fishtest wiki + `LLRcalc.py`, Van den Bergh GSPRT note) | `scripts/rl/sprt.py --normalized` = fishtest `LLR_alt2`; pairs = same seed, seats swapped |
| Test at the real time control; a speed-up is a normal patch (fishtest "Creating my first test") | Every challenger runs at **equal wall-clock per decision**, calibrated on a frozen 60-position bench (§7), monitored per game |
| Measure what double time is worth to the champion first (Expert Iteration "time odds") | Calibration duel **C1@2400 vs C1@1200** at both levels, run in parallel with data generation (§4) |
| Pick nets by match results over several seeds; confirm on unseen seeds (nnue-pytorch wiki; fishtest FAQ on selection bias) | 3 training seeds per recipe; offline selection on validation; SPRT on **never-used** seed offsets |
| Diverse opponents (AlphaGo pool; AlphaStar league) | Game mix: 60% C1 self-play, 20% vs in-game Stratège, 20% vs IA Maison |
| Provenance: code SHA, config, seeds per dataset (fishtest bench, nettest recipes) | Every shard manifest carries git HEAD + sha256 of the generator, search, encoder and float16 code |

Parked, deliberately (one variable at a time): Gumbel top-k + Sequential Halving for the
finalists (the fixed top-20→6 cut is the heuristic the Gumbel paper shows can fail — a
*search* change, tested separately); AIVAT-style luck correction in evaluation; auxiliary
short-horizon heads (KataGo).

## 2. Pre-launch proofs (done 2026-10-14, before any loop-1 data)

| Claim | Proof |
|---|---|
| Recorder changes no decision | `loop1_probe.cjs identity`: frozen pre-change file vs new (hook off) vs new (hook on) → identical games, l100 2 games (70/56 actions) + 1 more after the net-judge edit, l200gear 1 game (74 actions) |
| Default bench path unchanged | regen of shard `d1-l0` game 1 (Oct 11): obs, search values, 50 actions byte-identical, twice (after each edit) |
| Stored states are faithful | `afterstate_relabel_check.cjs`: 572/572 labels and 600/600 encodings recomputed bit-identical from stored JSON |
| float16 storage exact | 200,017 values bit-identical to `numpy.float16` |
| ONNX path exact | value-v1 export: JS/torch 4.6e-7, ORT/torch 2.0e-6, batch vs single 6e-8 |
| SPRT tool correct | reproduces C1's record (H1, +73.5 logistic / +79.5 nElo); simulation at nElo [0, 40], cap 600 pairs, 55% split pairs: false-accept 4.1%, power 93%, ≈440 games at the bounds |

## 3. Data generation (`scripts/rl/afterstate_gen.cjs`)

Per C1 decision: role P = each nominee, sample k=0 (free); F = finalist samples k≥1 (free);
R = 6 random non-nominated enumerated ends (+1 reply each); Q = (validation GT decisions
only) unlabelled k=1,2 replays of non-finalists. Label `y = −score/1000` from the
perspective of the player to move at the afterstate. Terminal afterstates are not recorded
(the search scores them exactly).

| Workers | Level | Split | Seeds (`ag:` namespace) | Extra |
|---|---|---|---|---|
| 4 | l100 | train | 2,000,000 + w·100,000 | — |
| 6 | l200gear | train | 3,000,000 + w·100,000 | — |
| 1 | l100 | val | 4,000,000 + | GT on 25% of decisions, 16 replies per nominee |
| 2 | l200gear | val | 5,000,000 + w·100,000 | idem |

All: mix self 0.6 / in-game 0.2 / maison 0.2, arena share 0.6 (else muraille, canyon,
amakna_1571, territoire_des_dopeuls_5383), shards of 10 matches, graceful stop via
`local-observations/rl/loop1/shards/STOP-loop1`. Stop when train records ≥ 1.8M with ≥ 35% at
l200gear, or after 6 h, whichever first; GT workers continue (max +2 h) until ≥ 400 GT
decisions with ≥ 150 at l200gear.

**Gate G0 (data)** — all must hold, else stop and diagnose: every shard passes
`afterstate_check.py`; relabel check passes on 3 random shards (200 records each); aborts
≤ 1% of matches; invalid actions ≤ 0.1%; C1 vs IA Maison ≥ 90%; C1 vs in-game Stratège ≥ 50%.

**Safe-mode amendment (2026-10-14, after two Mac freezes).** Launching all 18 processes at
once (12:09 and 17:50) ran macOS out of memory both times (kernel `compressor_exhausted`,
apps suspended, power-button reset). Generation and calibration now run only through
`scripts/rl/loop1_safe_launch.sh` → `loop1_supervisor.sh`:

- **Concurrency:** at most 12 slots (not 18), at background priority (`nice 10`, own
  process group). It starts with 4 and adds 1 every 5 min, only while memory is healthy:
  pressure normal, ≥ 50% free, compressor < +3 GB since start.
- **Shedding:** the newest slot is killed if the kernel pressure level is ≥ warning, free
  memory < 38%, fleet RSS > 7.8 GB, or the compressor has grown +6 GB. The cap then drops.
- **Emergency stop:** every slot is killed if pressure is critical, free memory < 28%, or
  the compressor has grown +10 GB.
- **Per process:** a node above 1.5 GB is killed as a leak; V8 heap is capped at 1 GB.
- **Measured basis:** peaks over a full match are 0.49–0.64 GB per worker
  (`/usr/bin/time -l`).
- **Safeguards:** the launcher refuses a second fleet. Loops stop after 3 consecutive
  failures and start no new shard without a live supervisor. A shed calibration worker
  sets its partial file aside instead of appending duplicates.
- **Unchanged:** seeds, shard layout, labels and stop rule. `STOP-train` at 1.8M records
  or 6 h; `STOP-loop1` at the GT target or 8 h. The supervisor applies them from shard
  manifests every 10 min.
- **Frozen bench (§7):** `bench-positions-l200gear.jsonl` (60 positions) was built during
  the memory measurement.

## 4. Double-time calibration (runs in parallel with §3)

`calc_duel.cjs`: `fc=1+rv=1+b=2400+h=1` vs `fc=1+rv=1+b=1200+h=1`, l100 then l200gear,
128 games each (4 workers × 32), offsets 300000 (l100) / 310000 (l200gear). Descriptive
(nElo ± CI, time ratio) plus SPRT readout. It decides §8's stage-2 bounds.

## 5. Training and offline gate G1

Trainer `scripts/rl/train_afterstate.py`: architecture value-v1 unchanged (645k params,
already ported to JS and ONNX), AdamW wd 1e-5, one-cycle cosine LR peak 1e-3, batch 2048,
8 epochs, best epoch by validation MSE. Variants: target ∈ {linear, wdl} × seeds {7, 8, 9}.

Offline evaluation `scripts/rl/afterstate_offline.py` on validation GT decisions: truth
T(n) = mean of reference replies 3–15 (never used to choose); a "fresh 3-sample final" is
simulated with replies 0–2; regret = max T − T(choice). Policies: `C1_reel` (C1's actual
choice), `C1_proxy`, `N0b_proxy` (net ranks nominees, top-6 get the 3-sample final),
`N0a` (net only, mean over the 3 replays, no simulated reply).

**G1 rule.** A model is N0a-eligible if mean(N0a − C1_reel) ≤ +5 judge points with 95% upper
bound ≤ +10; N0b-eligible if mean(N0b_proxy − C1_proxy) ≤ +5 with upper bound ≤ +10.
Recipe = target variant with the lower mean regret over its 3 seeds. Mode = N0a if ≥ 2 of
its 3 seeds are N0a-eligible, else N0b if ≥ 2 are N0b-eligible, else **G1 fails (strike)**.
The model taken online = the eligible seed with the lowest regret in that mode.

## 6. Smoke numbers (pipeline validation only — not results)

l100: 26 free labels/decision (3–41), encoding 0.26 ms each, one simulated reply ≈ 11 ms
(≈ 40% of a 630–760 ms decision). l200gear: 25.5 labels/decision, encoding ≈ 0.5 ms,
reply ≈ 68 ms (≈ 55–65% of a 2.7–3.2 s decision). Label noise ≈ 1.4% of label variance.
On 21 smoke GT decisions C1's own regret was 2.2 points.

## 7. Time parity

Frozen benches `local-observations/rl/loop1/bench-positions-{l100,l200gear}.jsonl` (60
positions each, C1 self-play, 1 decision in 3). `scripts/rl/time_bench.cjs time LK SPEC`
times SPEC and C1 alternately on each position. The challenger's budget B is the largest of
{1200, 1800, 2400, 3000, 3600, 4800} with ratio-of-means ≤ 1.00 at **both** levels. During
every duel the per-game ms of both sides is logged; a test whose running time ratio exceeds
1.10 is void and is re-run after recalibration.

## 8. Online tests (fishtest style)

Pairs = same seed, seats swapped. `sprt.py --normalized`, α = β = 0.05, cap 600 pairs
(cap reached = "not proven" = not promoted). Seed offsets never used before.

- **Test A — Elo gainer at equal time.** Stage 1 (STC analog): l100, challenger @B vs C1,
  bounds [0, 40] nElo, offset 400000. Stage 2 (LTC analog): l200gear, offset 410000; bounds
  [0, 40] if §4 shows ≥ +20 nElo for double time at l200gear, otherwise non-regression
  [−40, 0] (at l200 the saved time is then delivered as speed, not Elo). Promotion = both
  stages H1.
- **Test B — speed patch** (only if A fails stage 1): challenger @1200 (same budget as C1,
  less time) vs C1, non-regression [−40, 0], l100 offset 420000 then l200gear offset 430000.
  Passing = same strength, faster → a UX deliverable, not a record.

Shipping either result in the game is a separate gated step (browser runtime for the net,
in-game parity, time measured in the real Web Worker) and needs Vincent's go-ahead for
`src/` changes.

## 9. After loop 1 (direction, not pre-registered)

Loop 2 makes the evaluation *smarter*, not just cheaper: relabel the stored afterstates with
a deeper search that uses V (e.g. reply + V instead of reply + hand judge; horizon 3 with a
V-guided self-model instead of maison playing my own turn), keep some outcome weight once
labels bootstrap off the net (Leela's warning about positive feedback loops), add the
outcome head when the cheaper search makes ≥ 10^5 games affordable, and test Gumbel
Sequential Halving for the finalists.

## 10. Stop rules

Two strikes within loop 1 (G1 failure; Test A failing at stage 1 *and* Test B failing)
→ stop, report, rethink. Every result, including failures, goes in §11 with its files.

## 11. Results log

### 2026-10-15 — Generation, calibration and gate G0

**Generation** (safe mode, 2026-10-14 19:06 → 2026-10-15 01:31; the 6 h cap ended it before
1.8M): 59 shards, 531 matches, 942,390 records, of which 729,793 train records (32% at
l200gear) and 1,537 GT decisions (432 at l200gear).

**G0 — FAILED on one criterion** (`afterstate_check.py` on all 59 shards; relabel check on
3 shards drawn with `random.seed(15102026)`: `v100-w0-k7`, `t200-w2-k3`, `t100-w1-k8`):

| Criterion | Bar | Result | |
|---|---|---|---|
| Every shard passes `afterstate_check.py` | all | 59/59 | pass |
| Relabel check, 3 random shards | bit-exact | 573/573 labels, 600/600 encodings | pass |
| Aborts | ≤ 1% | 0 / 531 | pass |
| Invalid actions | ≤ 0.1% | 0 | pass |
| C1 vs in-game Stratège | ≥ 50% | 62/97 (64%) | pass |
| C1 vs IA Maison | ≥ 90% | **91/106 (85.8%)** | **fail** |

**Diagnosis.** The shortfall is one map: on `territoire_des_dopeuls_5383` C1 beat IA Maison
6/13; on the four other maps 85/93 (91.4%). Not the exploration rule (games with an explored
decision 79/92 = 85.9%, without 12/14), not the seat (A 43/51, B 48/55). On the same map C1
still beat the in-game Stratège 5/9, and self-play games there are long (median 13 turns vs
8 at `arene`). Whether this is a real C1 weakness on that map or a map-specific bug (e.g. the
view-rebuilt state) is **not yet known**; it is tracked as a champion issue, outside loop 1.

**Machine finding.** From the 18:10 reboot until 11:00 the Mac cycled Sleep/DarkWake ≈500
times (`pmset -g log`), including up to 50 "Thermal Emergency" sleeps per hour (22:00–02:00).
All 85 gaps > 75 s in the supervisor log contain a system sleep: the "slow supervisor loops"
were the machine sleeping. The search has no wall-clock cutoff (`performance.now`/`Date.now`
only feed timing counters), so no decision or label changed; only the **ms timings are
unreliable** (calibration `msPerDec` includes sleep). Generation simply produced fewer
matches per wall-clock hour. Fix for every later run: `caffeinate -i` for the run's lifetime
plus a thermal brake (`com.apple.system.thermalpressurelevel` ≥ 2).

**Calibration (§4)** (`sprt.py --normalized`, bounds [0, 40]; time ratios void, see above):
C1@2400 vs C1@1200, 64 pairs per level. l100: 67/128 games, pairs 13 won / 41 split / 10 lost,
+19.3 nElo (logistic +16, 95% CI −35 to +68), LLR −0.03, undecided. l200gear: 73/128 games,
pairs 21 / 31 / 12, +49.1 nElo (logistic +49, 95% CI −11 to +113), LLR 1.23, undecided.
For §8 stage 2 the point estimate at l200gear (+49) is above the +20 threshold, so stage 2
would use the gainer bounds [0, 40]; the interval still includes 0.

**Amendment A1 (2026-10-15, before any training result).** Proceed to §5 on **all** shards,
no map removed. Reasons: (1) every data-validity criterion passes; the failed one is a
champion-strength sanity check, and its failure is localized to one map; (2) loop 1 distils
C1's own evaluation and every later test compares the net to **C1 itself** at equal time, so
a C1 weakness is inherited by both sides of the test, not hidden by it; (3) dropping the map
after seeing the data would be a post-hoc choice. Training runs through
`scripts/rl/loop1_train.sh` (6 variants, sequential, `caffeinate -i`, memory and thermal
guard), then G1 per §5.

### 2026-10-15 — Training (§5) and offline gate G1: PASSED in mode N0b

`scripts/rl/loop1_train.sh` (12:50–13:10, `caffeinate -i`, memory + thermal guard, no guard
trip): 6 models, 729,793 train / 184,540 validation records, 8 epochs each, best epoch = 7 for
all six. Validation R² (in each model's own target space): linear s7/s8/s9 0.828 / 0.788 /
0.832; wdl s7/s8/s9 0.901 / 0.900 / 0.900 (label noise variance 0.00287).

G1 on the 1,537 validation GT decisions (regret in judge points; `afterstate_offline.py`,
all six re-scored with the same final version, which now also prints the protocol's
`N0b_proxy − C1_proxy` pair and its 95% upper bound — before, only the comparison against
`C1_reel` was printed):

| Model | N0a regret | N0b regret | N0a − C1_reel (up95) | N0b − C1_proxy (up95) | N0a / N0b eligible |
|---|---|---|---|---|---|
| linear s7 | 30.52 | 7.08 | 25.81 (30.05) | 3.49 (5.14) | no / yes |
| linear s8 | 31.87 | 7.51 | 27.16 (31.47) | 3.92 (5.72) | no / yes |
| linear s9 | 31.71 | 7.34 | 27.00 (31.51) | 3.75 (5.58) | no / yes |
| wdl s7 | 33.33 | 6.58 | 28.62 (33.04) | 2.99 (4.75) | no / yes |
| wdl s8 | 32.87 | 7.01 | 28.16 (32.59) | 3.42 (5.22) | no / yes |
| wdl s9 | 33.24 | 7.00 | 28.54 (33.05) | 3.41 (5.16) | no / yes |

References: C1_reel 4.71, C1_proxy 3.59, oracle top-6 2.32. Rank correlation of V with the
truth over nominees ≈ 0.55–0.57, against 0.85 for C1's own one-reply score.

Reading: the net alone (N0a) is far from C1 (+26 to +29 points); as a pre-ranker of the
nominees with the real 3-reply final (N0b) it is within +3 to +4 points. Mode = **N0b**.
The rule "recipe = lower mean regret" does not name the policy; since no seed is
N0a-eligible, the regret of the reachable mode (N0b) is used: wdl 6.86 vs linear 7.31 → wdl
(under N0a regret, linear would have been chosen: 31.37 vs 33.15). Online model = **wdl s7**
(lowest N0b regret). ONNX export parity: JS 4.8e-7, ORT 1.2e-6 against torch.

### 2026-10-15 — Time parity (§7): B = 1200

`scripts/rl/loop1_timeparity.sh` (wdl s7, mode N0b, `caffeinate -i`, quiet machine), ratio of
mean ms/decision against C1 on the 60 frozen positions:

| B | l100 ratio (median) | l200gear ratio (median) |
|---|---|---|
| 1200 | **0.827** (0.840) | **0.763** (0.792) |
| 1800 | 1.015 (0.999) | not run |
| 2400 | 1.300 (1.023) | not run |
| 3000 | 1.435 (1.018) | not run |
| 3600 | 1.602 (1.016) | not run |
| 4800 | 1.964 (1.021) | not run |

Only B = 1200 is ≤ 1.00, so the challenger runs at C1's own budget and saves 17% (l100) and
24% (l200gear) of the thinking time instead of spending it on more search. The saving is
modest because N0b still gives every finalist 3 real replies (C1 reuses its stage-1 reply
as the first one). ~15 net evaluations per decision. Next, per §8: Test A stage 1 (l100,
[0, 40], offset 400000), and Test B only if A fails.

### 2026-10-15 — Test A stage 1 (l100, [0, 40] nElo): **H0 — failed**

`scripts/rl/loop1_sprt.sh A-s1-l100` (13:25–13:37, offset 400000): challenger
`fc=1+rv=1+b=1200+h=1+net=model-wdl-s7+nm=prelim` vs C1 `fc=1+rv=1+b=1200+h=1`.
After 31 pairs: 1 won / 21 split / 9 lost, score 0.371, **−92 Elo (95% CI −162 to −28),
−125 nElo**, LLR −2.985 ≤ −2.944 → H0. LOS 0.2%. Thinking time 0.768× C1. Files:
`local-observations/rl/loop1/sprt/A-s1-l100/`.

The online loss is far larger than the offline gate suggested (+2.4 points of regret per
decision against C1's real choices). Likely cause, to be tested: the net ranks sibling
candidates poorly — rank correlation with the truth over a decision's nominees is 0.55–0.57,
against 0.85 for a single simulated reply — and the regret tail is heavier (decisions with
regret > 10 points: 11.3% for N0b vs 8% for C1), so a game of ~30 decisions per side
collects about one extra sizeable mistake.

**Machine:** with 8 workers the thermal pressure reached level 2 ("heavy") within two
minutes; the runner's guard shed one worker every 30 s down to 1 (13:27–13:30), and the
test finished on 1 worker. On this Mac, heat — not memory — bounds parallel play. Test B
runs with 3 workers.

### Amendment A2 (2026-10-15, pre-registered before any result) — loop 1b, sibling objective

**Diagnosis behind it.** In the training labels, only ≈14% of the variance lies *within* a
decision (between the sibling afterstates of one root); 86% is "who is winning" across
positions. Plain MSE spends its capacity on the 86%, yet a choice depends only on the 14%:
the loop-1 nets' residual error (≈0.018, linear target) is as large as the whole
within-decision variance (≈0.015), which matches their weak sibling ranking (0.55–0.57).

**Single change.** `train_afterstate.py --sib λ`: loss = MSE + λ · MSE of the values centred
per decision (V − mean of its siblings vs target − mean of its siblings); batches are whole
decisions (≥ 2048 records); best epoch by val MSE + λ · val centred MSE. Data, architecture,
epochs, LR, target (wdl, loop 1's recipe) unchanged. Default `--sib 0` keeps the original
training path. Grid: λ ∈ {1, 4} × seeds {7, 8, 9}.

**Offline bar (stricter, from Test A's lesson).** At equal budget N0b only changes which 6
nominees reach the real final, so it cannot be "no weaker" online unless it pre-ranks at
least as well as C1's own one-reply stage 1. A model goes online only if
mean(N0b_proxy − C1_proxy) ≤ 0 on the 1,537 GT decisions (N0a keeps the §5 rule). Reported
alongside: within-decision rank correlation with the truth, val centred R², regret tail.

**Order.** Runs after Test B (l100) ends, so the two never share the machine. If Test B
passes, Test B l200gear (offset 430000) still runs first, as §8 says.

### 2026-10-15 — Test B (l100, non-regression [−40, 0]): **H1 — passed**

`loop1_sprt.sh B-l100` (13:38–14:57, offset 420000, 3 workers, thermal level 0 throughout):
same challenger as Test A vs C1. After 255 pairs: 45 won / 164 split / 46 lost, score 0.498,
**−1.4 Elo (95% CI −27 to +24), −1.6 nElo**, LLR 3.107 ≥ 2.944 → H1. Thinking time **0.789×**
C1. So at l100 the net version is as strong as C1 within ±25 Elo and thinks 21% less.

Test A's −92 Elo was the size bias of a sequential test that stopped after 31 pairs: H0
there means "no +40 gain", which stands; the magnitude did not. Pooled over both blocks
(286 pairs): 46 / 185 / 55. Next, per §8: Test B l200gear (offset 430000), 4 workers.

### 2026-10-15 — Test B l200gear: started, runner changed mid-test (scheduling only)

Started 14:57 (offset 430000, 4 workers × 150 pairs). Heat reached level 2 within 5 min; the
guard cut to 1 worker and never added any back, so after 9 pairs (2 won / 7 split / 0 lost)
the run was stopped (15:21) and **resumed** (15:29) with `loop1_sprt.sh` v2: seed blocks of
25 pairs, one result file per block, workers 2 → max 4 driven by heat (−1 at level ≥ 2 for
30 s, +1 after 10 min at level 0), resume via `NAME/next-block`. Resumed blocks use seeds
from 430600 (the first run's range was 430000–430599, never replayed). Only scheduling
changed: the challenger, C1, the bounds and the SPRT are the same, and pairs from both
runs are pooled. Smoke tests (throwaway seeds 990000+/991000+): block cycling, ramp-up,
STOP and resume all verified, no stray processes.

### 2026-10-15 — Test B l200gear (non-regression [−40, 0]): **H1 — passed**

Verdict at 16:24:27 after 43 pairs (9 from the first run, 34 from blocks b000–b002; seeds
430600–430674): 11 won / 29 split / 3 lost, score 0.593, **+65 Elo (naive 95% CI +9 to
+126), +85 nElo**, LLR 2.985 ≥ 2.944 → H1. Thinking time **0.783×** C1 (1,672 vs 2,135 ms
per decision). Second run: 2 workers, 3 from 15:39 (10 cool minutes); thermal level 0 or 1,
no guard event; free memory ≥ 83%. Files: `local-observations/rl/loop1/sprt/B-l200gear/`.

**What it shows:** at l200gear the net version is not weaker than C1 and thinks 22% less.
**What it does not show:** a gain. The test stopped at its first boundary crossing, which
overstates the effect, and the naive CI is not valid after optional stopping (Test A's
−92 Elo at l100 became −1.4 on fresh seeds). Loop 1's outcome under §8 is therefore the
**speed patch**: same strength at both levels, ~21–22% less thinking. Shipping it needs
Vincent's go-ahead (§8).

### Addendum to A2 — selection rule (written before any loop-1b result)

Loop 1b started 16:25:29 (`scripts/rl/loop1b_train.sh`, git 4142b78 + working tree). It
first retrains a **control** with `--sib 0`, seed 7 (loop 1's recipe; never a candidate). The
control checks that the default path is unchanged (its val metrics should match model-wdl-s7)
and gives the reference centred R². Selection follows §5's structure: take the λ with the
lower mean N0b_proxy regret over its three seeds, then that λ's best seed. That model goes
online only if it has mean(N0b_proxy − C1_proxy) ≤ 0; otherwise no loop-1b model goes online.
Table: `logs/loop1b-summary.json`. Online path if one passes: time parity (§7), then Test A
stage 1 (l100, [0, 40], offset 500000) and stage 2 (l200gear, [0, 40], offset 510000).

### Amendment A3 (pre-registered before it runs) — Test A stage 2 at l200gear, loop-1 challenger

§8 runs stage 2 only after stage 1 passes. Stage 1 (l100) failed, so no gain was ever tested
at l200gear. Test B l200gear's estimate raises a level-specific hypothesis, and only fresh
seeds can test it. The design is §8's stage 2 unchanged:
- same challenger (`net=model-wdl-s7+nm=prelim`, B = 1200) vs C1, l200gear;
- bounds [0, 40] nElo, offset **410000** (reserved for stage 2, never used);
- α = β = 0.05, cap 600 pairs, `loop1_sprt.sh` v2 (2 workers, max 4).

The Test B l200gear pairs are not pooled, since they motivated the hypothesis. It runs after
loop 1b's training and G1, and before any loop-1b online test. **H1** = the first measured
strength gain from self-play, at l200gear only (l100 stays "equal", Test B). H0 or the cap =
no gain at l200gear.

### 2026-10-15 — Loop 1b (A2): **failed the bar**, no model goes online

`loop1b_train.sh`, 16:25–16:48, no guard event. G1 on the 1,537 GT decisions; "rho" =
within-decision rank correlation with the truth (C1's one-reply stage 1: 0.854).

| model | val R² | val centred R² | rho | N0b regret | N0b − C1_proxy (se) |
|---|---|---|---|---|---|
| control sib 0 s7 | 0.9007 | 0.621 | 0.555 | 6.58 | +2.99 (0.90) |
| sib 1 s7 / s8 / s9 | 0.895 | 0.618 | 0.554 / 0.539 / 0.537 | 7.05 / 6.59 / 7.68 | +3.46 / +2.99 / +4.09 |
| sib 4 s7 / s8 / s9 | 0.895–0.899 | 0.631–0.636 | 0.585 / 0.587 / 0.592 | 6.48 / 7.11 / 6.35 | +2.89 / +3.52 / **+2.76** (0.92) |

- The control reproduces model-wdl-s7 exactly (val MSE 0.03196, R² 0.9007, best epoch 7;
  identical G1), so the trainer's default path is unchanged.
- λ = 1 changes nothing. λ = 4 lifts rho by ≈ +0.03 and centred R² by ≈ +0.012, but the
  regret does not move (recipe means: λ 1 7.11, λ 4 6.65, control 6.58).
- Selected per the addendum: wdl-sib4-s9, +2.76 > 0 → **fails**. N0a: +24 to +31, not
  eligible. Files: `logs/loop1b-summary.json`, `logs/{train,g1}-wdl-sib*.{log,json}`.
- **Conclusion:** the objective was not the bottleneck. Train and val MSE are nearly equal in
  every run (wdl-s7: 0.0309 vs 0.0320), so the net underfits: the limit is the model or its
  inputs, not the data volume or the loss.

### Base audit B1 (pre-registered before any probe result): why the net cannot rank siblings

Facts from the code (`train_value.py` ValueNet = value-v1, `encoder.cjs` featureVersion 3):
- **Small view.** 3 conv layers 3×3, so each feature sees 7×7 cells of a 15×14 board.
- **"Where" is erased.** Global *mean* pooling over the board leaves only 32 averages.
- **Raw coordinates.** Fighter positions enter only as normalized x, y in the global vector.
  Distance, line of sight and "in range" must come from a 2-layer MLP that never sees the
  obstacle map.

Siblings differ mainly in where the mover ends up and what it hit, while the reply depends on
reach and line of sight between fighters: exactly what this design cannot compute.
*Hypothesis, not verified.*

**Probes.** All use the wdl target, `--sib 4`, seed 7, and the same data, epochs and LR. The
comparator is wdl-sib4-s7 (rho 0.585, N0b 6.48).
- **P-cap:** `--ch 64 --gdim 192` (2× width, same design). Tests capacity.
- **P-space:** value-v2 = `--depth 8 --readout fighters`. The 5 extra layers are residual,
  so each feature sees 17×17 cells (the whole board). The readout is mean + max + features at
  the mover's cell + mean at enemy cells. Tests spatial reach and pooling. 703,681 params vs
  645,153.

A probe **moves the base** if rho ≥ 0.635 (+0.05, about 12× the seed spread at λ 4); N0b
regret and the A2 difference are reported alongside. Decision:
- P-space moves and P-cap does not → the spatial design is the flaw. Run value-v2 on 3 seeds
  under the A2 bar.
- Both move → capacity and space together (value-v2 at 2× width).
- Neither moves → information is missing from the inputs. Next is encoder v4: reach, threat
  and line-of-sight planes per side.

The A2 bar stays the only way online. The probes run on the GPU while A3 plays on the CPU:
- **A3 stays valid.** Results don't depend on wall-clock (no time cutoffs). A and B share each
  worker. The time ratio (~0.78) is far from the 1.10 void line.
- **Guards:** the probe stops at heat level ≥ 2 for 30 s, and A3's runner sheds a worker.

Code (default path unchanged, checked): same parameter names and init weights at the same
seed, and model-wdl-s7 reloads and reproduces its stored parity outputs. A value-v2 smoke run
(3 shards, 1 epoch) trains and exports, with weights.bin holding all 703,681 parameters.

**Scheduling change (16:57, before any probe result).** Sharing the machine failed. With
the GPU probe running next to A3's 2 workers, heat reached level 2 within 70 s (16:55:39 →
16:56:49). The probe guard stopped P-cap after epoch 0. A3's runner shed to 1 worker, then
ended `STOPPED-THERMAL` at 16:57:17 (4 pairs: 2 / 1 / 1; blocks 0–1 interrupted, seeds
410000–410049 never replayed). Heat stayed at level 2 after both stopped, with Spotlight
(`mds_stores`) at about one core. New order:
1. Wait for heat level 0.
2. Run both probes alone (same specs).
3. Resume A3 with `RESUME=1` from block 2 (seeds 410050+), pooling its 4 pairs.

Nothing about the tests changes, only the timing.

### 2026-10-15 — Base audit B1 results: space helps a little, width does not, neither fixes choosing

Both probes ran alone (16:58:49–17:09:43, heat level 0 throughout); A3 resumed at 17:09:55.

| model | rho | N0b regret | N0b − C1_proxy (se) | N0a − C1_reel | val R² | val centred R² |
|---|---|---|---|---|---|---|
| comparator wdl-sib4-s7 | 0.585 | 6.48 | +2.89 (0.91) | +24.9 | 0.8951 | 0.631 |
| P-cap (2× width) | 0.601 | 6.89 | +3.30 (0.94) | +24.6 | 0.8965 | 0.636 |
| P-space (value-v2) | **0.644** | 7.83 | +4.24 (1.24) | **+21.9** | 0.9029 | 0.654 |

**By the pre-registered rule, P-space moves the base (0.644 ≥ 0.635) and P-cap does not.**
The spatial design is a real flaw, and fixing it is worth ≈ +0.06 rho, +0.023 centred R² and
−3 points of N0a regret. It does not fix choosing, though:
- N0b regret got worse (+1.35, about one standard error, so not significant either way).
- The A2 difference is +4.24, against a bar of ≤ 0.
- C1's one-reply simulation sits at 0.854, far above.

**Deviation, decided before any further run:** the rule's next step (value-v2 on 3 seeds
under the A2 bar) is skipped. All three seeds would need to drop by more than 4 regret
points, so it can only fail, and running it would push a direction that shows no
improvement in what matters (decision regret).

**What B1 and earlier work say about the base.** A static net cannot stand in for the
opponent's reply:
- here, afterstate ranking reaches 0.59–0.64 against 0.85 for one simulated reply;
- on 2026-10-13, a value net judging states right after my move won 50% (l100), but 100%
  after one simulated reply (`SB_NET_LEAF` 1 vs 1r, `rl-pipeline` notes).

The mean-pool flaw found here is the same one that sank the flat-head policy clone (fixed by
a per-cell head). It was present in every learned *leaf* judge so far (V3–V5, all value-v1),
so their "never beats the hand judge" verdict was reached with that flaw. Next: loop 2's first
item (§9), the net at the leaf seat after the simulated reply, where it does not have to guess
the reply.

### Base audit B2 — the hand judge's weights against real game outcomes (Texel method)

The ceiling is C1's leaf judge (`heuristicLeaf`):

> 1000 · HP-fraction difference + 350 · threat + 300 if I have lethal − 300 if they do

Threat = my damage potential / their max HP − theirs / mine. The weights were set by hand, and
no learned judge has beaten them so far. B2 asks whether game outcomes support those weights.

**Data.** `scripts/rl/texel_probe.cjs` reads all 531 loop-1 games: 30,965 decision roots, each
with the real result for the searcher. A root is the start of the searcher's turn, the same
kind of state C1's leaf judges after the simulated reply.

Checks:
- every (game, side) has one result;
- all 328 games with both sides recorded have opposite results;
- the recomposed judge equals `heuristicLeaf` exactly.

**Fit.** `scripts/rl/texel_fit.py`: logistic regression on the result, 5-fold cross-validation
by game, bootstrap over games.

| model | CV log-loss | minus current (95% CI) |
|---|---|---|
| M0: current judge, only its scale fitted | 0.57108 | — |
| M1: same 4 terms, free weights | 0.56597 | −0.0051 (−0.0070 to −0.0033) |
| M2: M1 per level | 0.56594 | −0.0051 (−0.0092 to −0.0008) |
| M3: M1 + distance, turn | 0.56535 | −0.0057 (−0.0083 to −0.0030) |

M1's weights in judge units (HP = 1000), each against the current value:

| term | fitted (95% CI) | current |
|---|---|---|
| threat | 2,195 (1,853 to 2,650) | 350 |
| "I have lethal" | 1,384 (1,088 to 1,843) | 300 |
| "they have lethal" | +34 (−52 to +118) | −300 |

Both levels agree:
- l100: 2,098 / 1,191 / +57;
- l200gear: 2,580 / 1,840 / −20.

Fitting per level, or adding distance and turn, gains little beyond M1.

**Reading.** In C1's own games:
- the side that threatens more wins much more often than the current weights imply;
- so does the side that has lethal on its own turn;
- "they have lethal next turn" predicts nothing once the rest is known, because at the start
  of my turn I act first.

Predicting outcomes better is not the same as playing better. Only an online test can show
that.

### Test T1 (pre-registered before it runs) — C1 with outcome-fitted judge weights

**Matchup.**
- Challenger: C1 + `jw=1038:2278:1437:36`, i.e. M1 rescaled to the current judge's
  calibration. A judge point is worth the same logit as before, so the ±999 clamp and the
  ±1000 outcomes keep their meaning.
- Opponent: C1 at the same budget. The judge's cost is identical.

**Stages.**
- Stage 1: l100, bounds [0, 40] nElo, offset **600000** (never used). α = β = 0.05, cap 600
  pairs, `loop1_sprt.sh` v2, 3 workers (max 4).
- Stage 2, only if stage 1 passes: l200gear, [0, 40], offset **610000**.
- Promotion = H1 at both stages, which makes a new champion. Shipping it in the game needs
  Vincent's go-ahead (`src/bots/searchBrain.js`). The time rule (VOID-TIME at a ratio > 1.10)
  is unchanged.

**Order.**
- A3 was paused at 17:37:11 (16 pairs: 2 / 12 / 2; next block 4, seeds 410100+) to free the
  CPU. It resumes after T1 stage 1 if T1 fails, or after stage 2.
- A3's later blocks load the new `search_bot.cjs`, whose default path is unchanged (proved
  below).

**Code.** `setJudgeWeights` (search_bot.cjs) and the `jw=` key (calc_duel.cjs); null = the
historical lines, untouched. Proof on 3,431 roots (6 shards, l100 + l200):
- the default judge is bit-identical to the extracted values;
- `jw` with the historical weights is within 1.1e-13;
- the fitted weights change the value on 96% of roots;
- a 2-game smoke (throwaway seeds 995000) runs, and a bad `jw` is rejected.

**Caveat.** The weights were fitted on positions C1 reaches. Playing with them changes those
positions (Texel's known limit). If T1 passes, the next step is to refit on T1's own games
and test again, the self-play tuning loop.

### 2026-10-15 — Test T1 stage 1 (l100, [0, 40]): **H0 — failed**

`loop1_sprt.sh T1-s1-l100` ran 17:42:36–18:00:41, on git d7dbec5 + working-tree changes (the
`jw` switch).
- Workers: 3, then 4 from 17:52 (10 cool minutes). Heat level 0 or 1, no guard event.
- Result after 53 pairs: 7 won / 28 split / 18 lost, score 0.396, **−73 Elo (naive 95% CI
  −141 to −11), −78 nElo**. LLR −3.438 ≤ −2.944 → H0.
- Thinking time 0.996× (same cost, as expected).
- Files: `local-observations/rl/loop1/sprt/T1-s1-l100/`.

The outcome-fitted weights predict results better but play worse. The early stop overstates
the size, but the direction is clear. Likely reason (*not verified*): a leaf judge has to rank
siblings, not predict outcomes. Weighting the threat 6× makes C1 chase "threat" positions that
the 1-reply search cannot hold. Per the rule, A3 resumed at 18:01 (block 4, seeds 410100+).

**Direction change (Vincent, 2026-10-15 ~18:00).** The goal is RL networks trained by
self-play on rewards, which act fast. The next work is a PPO self-play league:
- start from the spatial policy clone of the calculator;
- give the value head a positional readout (B1's fix; the old PPO net's value head is
  mean-pooled, `train_ppo.py` `t.mean(dim=(2, 3))`);
- gate each round against its previous version, IA Maison and C1.

A new protocol document will hold it before any run.
