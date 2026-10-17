# RL2 — Search in the training loop (Expert Iteration / Gumbel AlphaZero spirit) — protocol, pre-registered 2026-10-15

## Why

RL1 showed that reward learning works: PPO self-play gave +0.24 against unseen networks and
doubled the score against C1 (`docs/selfplay-rl1.md`). But PPO learns only from final
outcomes, and it drifted after 10 iterations.

The proven route past a search champion puts search inside the training loop:
- **Expert Iteration**: the search plans, the network generalizes and guides the search
  ([arXiv 1705.08439](https://arxiv.org/abs/1705.08439));
- **AlphaZero**;
- **Gumbel AlphaZero**, whose policy improvement is guaranteed even with a few simulations
  ([ICLR 2022](https://iclr.cc/virtual/2022/poster/6418)).

The network keeps playing alone at game time, so it stays fast.

## Search operator S_k (`scripts/rl/rl2_search.cjs`)

At each decision of the network's side:
1. **Candidates** = the network's k legal actions with the highest logits (`rl1_policy`
   `topK`, on the real view).
2. **Play each candidate** on the state rebuilt from the view (as C1 with rv=1: no hidden
   information). The network (argmax) finishes the turn.
3. **Score it** with Q(a) = C1's `depth2Score` at horizon 1: the IA Maison reply is
   simulated, then C1's hand judge scores the result; an outcome counts ±1000. C1's own
   proven leaf evaluation is reused unchanged.
4. **Play** the argmax of Q; ties go to the higher logit.

`rl1_selfplay.cjs --search K` makes the learner play S_K and records S_K's choice as the
action label: the Expert-Iteration target.

**Smoke test:** at l100, 76 ms per decision, against about 425 ms for C1 (2 games, n.s.).

## Experiment E (before any RL2 training)

The network is phase 2's best checkpoint (`rl1-run2/pool/iter_0010`, confirmation pending).
S_6 uses that network. Argmax everywhere; fresh seed tags `rl2e1` and `rl2e2`.

- **E1: S_6 vs the same network alone.** 128 games (64 pairs), l100 + l200gear, mixed maps.
  **Pass (S is a policy-improvement operator): pair score ≥ 0.60.**
- **E2: S_6 vs C1.** 64 games at l100 and 64 at l200gear, with the network alone vs C1 on the
  same seeds as the baseline. Descriptive: how close the network-guided search comes to the
  champion, and at what time per decision.

## Next, only if E1 passes: the RL2 loop (Expert Iteration)

1. Self-play with S_k on the learner side.
2. Train the network by cross-entropy toward S_k's choices (the policy target), with the
   value net on outcomes.
3. Gates every N iterations against the previous network and C1, on fresh seeds.

The gate rules and a budget will be written here before that loop runs. If E1 fails, S is
redesigned (other leaf, k, or reply model) before any training.

## Results log

### 2026-10-16 00:45 — experiment E: **E1 passed**; E2 (against C1) mostly in

Network = `rl1-run2/pool/iter_0010` (confirmed against run 1's best). Search S_6, argmax,
fresh tags `rl2e1` and `rl2e2-*`. Ran alongside phase 2, with the brake.

| test | pairs | both won / split / both lost | pair score (95% CI) | ms per decision |
|---|---|---|---|---|
| **E1: S_6 vs the network alone** (l100 + l200gear) | 64 | 40 / 21 / 3 | **0.789 (0.718–0.860)**: **pass** (≥ 0.60) | S 287 |
| E2: S_6 vs C1, l100 | 32 | 3 / 18 / 11 | **0.375 (0.269–0.481)** | S 68, C1 526 |
| E2: the network alone vs C1, l100 (same seeds) | 32 | 0 / 7 / 25 | 0.109 (0.038–0.181) | network 1.6, C1 643 |
| E2: S_6 vs C1, l200gear | 32 | 3 / 16 / 13 | **0.344 (0.234–0.454)** | S 522, C1 2,775 |
| E2: the network alone vs C1, l200gear | (running) | | | |

**Reading.**
- S is a strong policy-improvement operator for the network (+0.29 pair score).
- Against C1, the network-guided search gets about 0.35–0.38 while thinking **5–8× less** than
  C1. It is not yet C1's equal, but it is a much better teacher than any target the network
  has had.

**Next (§ "RL2 loop").** Train the fast network on S's improved targets: Expert Iteration
combined with phase 3's PPO, as the online review recommended (keep the PPO term and use a
distribution target, not argmax). It is pre-registered below before it runs.

### RL2 loop = "phase 4" (pre-registered 2026-10-16 00:45, before it runs)

**What it is.** Phase 3's trainer (`rl3_train.py`) plus search targets. It changes nothing
else: PFSP, moving anchor, potential shaping, critic, gates, promotion, ceiling and rollback
all stay as in phase 3.

**Search targets.**
- **Which decisions:** in training games, a learner decision is labelled with probability
  `--label-p 0.1`.
- **Candidates:** `--label-k 8` actions drawn by Gumbel-top-k (Gumbel AlphaZero: sampling
  without replacement, so actions the network under-weights get explored).
- **Scoring:** S evaluates each candidate. The network finishes the turn, then C1's
  depth2Score at horizon 1.
- **Target:** π' = softmax(logit + 50·q̂), with q̂ = (Q + 1000)/2000 (Gumbel's σ with
  c_visit 50, c_scale 1). The action played remains the network's own sample, so PPO stays
  on-policy.
- **Loss:** PPO + 1.0 × CE(π', π) on labelled steps. That is Expert Iteration's distribution
  target plus the RL term, as the online review recommended.

**When.** It starts when phase 3 ends (ceiling, budget, or rollback stop), from phase 3's last
anchor, with phase 3's critic. Run `rl1-run4`, at most 60 iterations.

**Success.**
- Promotions resume after phase 3's ceiling (the network alone beats the anchor ≥ 0.55 on
  fresh seeds).
- The final anchor passes §5's confirmation against phase 3's final anchor.
- C1 comparison at l100 and l200gear against phase 3's anchor, on the same seeds.

**Smoke** (2 iterations, 8 games, label-p 0.3): 86 of 331 steps labelled; CE 0.52 → 1.11;
targets checked (valid indices, probabilities sum to 1, candidates legal per the stored mask).

**Ops note (00:50).** The background job running E was stopped by the 2-hour limit on
background tasks. That happened during its last part (the network alone vs C1 at l200gear,
19 of 64 games played). The other four parts had finished and are reported above. The missing
part is being rerun as a **detached** job on the same seeds (`rl2e2-l200gear`) into
`local-observations/rl/rl2-E-iter0010-rerun`. Long jobs now run detached, with only short
watchers in the harness.

### Amendment to phase 4 (pre-registered 2026-10-16 01:18, BEFORE the fixed-seed C1 bench result)

**Why.** Phase 3's promotion panel showed that self-play gains against our own networks do not
reach C1: every checkpoint scores 0.08–0.19 against C1 at l100. The review said: train
against the opponents you must beat, and don't judge progress only against the previous best.
Phase 4 is therefore re-aimed at C1. It is still the network playing alone; C1 is an opponent
and a yardstick, never the product.

**Start point.** The checkpoint with the best score on the fixed-seed bench
(`c1bench-l100`, 96 games: clone, run-1 iter_0010, run-2 iter_0035, run-3 iter_0005). Ties go
to the most recent.

**Settings.** Phase 3's settings, plus:
- search targets on 15% of learner decisions (`--label-p 0.15 --label-k 8 --ce 1.0`);
- **10% of training games against C1 at l100** (`--c1-share 0.10 --c1-lk l100`);
- **a C1 gate**: at every gate, 96 games against C1 at l100 on FIXED seeds (`c1gate-fixed`).
  Promotion needs a pair score ≥ 0.55 against the anchor **and** a C1 score ≥ the anchor's
  − 0.05.

**Stops.** Ceiling, rollback, budget (60 iterations) and safety unchanged.

**Success**, judged on the same `c1bench-l100` seeds as the start checkpoint:
1. The final anchor's C1 score must beat the start's, with a paired 95% CI excluding 0.
2. Then fresh-seed C1 checks at l100 and l200gear, plus the panel (siblings, Maison).

**If it fails** (no C1 gain by the ceiling or budget): stop, report, and rethink the base. The
next candidates are larger search budgets as the teacher, and C1's own choices as targets.

### 2026-10-16 02:25 — fixed-seed C1 bench: **RL so far has NOT moved the network against C1**

`rl_c1bench.py`, tag `c1bench-l100`: 96 games (48 pairs) on identical seeds for every model,
argmax, network alone.

| model | pentanomial (both lost / split / both won) | score against C1 (95% CI) | paired difference vs clone (95% CI) |
|---|---|---|---|
| clone | 38 / 9 / 1 | 0.115 (0.049–0.181) | — |
| run-1 iter_0010 | 33 / 14 / 1 | **0.167** (0.094–0.239) | +0.052 (−0.031 to +0.135) |
| run-2 iter_0035 | 37 / 10 / 1 | 0.125 (0.057–0.193) | +0.010 (−0.069 to +0.089) |
| run-3 iter_0005 | 34 / 14 / 0 | 0.146 (0.082–0.210) | +0.031 (−0.062 to +0.124) |

All the self-play gains (0.705, 0.668, phase-2 gates up to 0.76, then 0.559, each step
confirmed against its predecessor) were gains **against our own networks**. None is
significant against C1. Phase 3 stopped at 01:18 (STOP; anchor iter_0005).

**E2 rerun completed:** the network alone vs C1 at l200gear = **0.094** (0.026–0.161), 32
pairs (26 lost / 6 split), against **0.344** for S_6 on the same seeds. So the search lifts
the network against C1 at both levels: 0.11 → 0.375 at l100 and 0.09 → 0.34 at l200gear.

**Phase 4 starts per the amendment.**
- **Start point:** best on the bench = run-1 `iter_0010` (0.167).
- **Critic:** phase 3's critic (`rl1-run3/state.pt`).
- **Run:** `rl1-run4`.
- **Success bar:** a paired gain on these same `c1bench-l100` seeds against run-1
  `iter_0010`, with the CI excluding 0.

### 2026-10-16 04:30 — phase 4, operational change: search labels at l100 only

Iterations 0–1 took **57 min each**:
- play time 3,454 s and 3,389 s, of which **1,857 s and 2,003 s were heat pauses** (the Mac
  stays at level 2);
- 3,140–3,323 labels per iteration;
- C1 games: 4/62 and 1/50 won.

At that pace the first gate would arrive around 08:30. The search costs about 8× more per
decision at l200gear (S_6: 522 ms against 68 ms at l100). The success bar and C1 gate are at
l100.

**Change (before any gate):** labels only in l100 games (`--label-lk l100`, worker option
checked: 67/67 labels at l100 in a mixed 8-game test). Everything else is unchanged. Phase 4
was stopped during iteration 2 (partial rollout discarded) and resumed from `state.pt`
(iteration 1).

### 2026-10-16 09:55 — phase 4 stopped on Vincent's request (resumable)

Stopped by killing the process group (trainer + 3 workers; caffeinate exits with it). Saved
state: iteration 12, anchor `rl1-run4/pool/iter_0005`. Relaunching the same command resumes at
iteration 13. Nothing else is running.

**Where it stood.**
- **Iteration 5:** promoted (0.625 against its start, run-1 iter_0010). The fixed C1 gate
  (`c1gate-fixed`, 96 games) gave 0.177 for the start and 0.167 for iteration 5. Promotion
  panel (64 games each): s7 0.75, s8 0.75, s12 0.672, IA Maison 0.656, C1 0.078.
- **Iteration 10:** no promotion (0.508 against the anchor). C1 gate: 0.2135 for the
  candidate against 0.1667 for the anchor, +0.047 on 96 games, *not significant*. IA Maison
  gate **74/128**, against 99/128 at iteration 5. Training-game win rate against IA Maison also
  fell from about 60–75% to about 40–55% over iterations 8–12. **Not verified** whether that is
  noise or a real regression caused by the C1 / search targets.
- Training games against C1: 2–12 wins out of 40–64 per iteration, with no clear trend.
- Heat froze workers 0–1,448 s per iteration; iterations took 8–39 min.

**Status against the success bar:** no measured C1 gain yet (the bar is a paired gain on the
`c1bench-l100` seeds against run-1 iter_0010).
