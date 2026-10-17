#!/usr/bin/env python3
# Audit du juge main (base audit B2): ajuste ses poids sur les ISSUES réelles des matchs
# (méthode Texel) et compare, en validation croisée PAR MATCH, le juge actuel (forme fixe,
# seule l'échelle est ajustée) aux poids libres et à quelques features candidates.
# Entrée: sortie de texel_probe.cjs. Lecture seule.
#   python3 scripts/rl/texel_fit.py local-observations/rl/loop1/texel-roots.jsonl
import json
import sys

import numpy as np

rows = [json.loads(l) for l in open(sys.argv[1])]
y = np.array([(r["outcome"] + 1) / 2 for r in rows])  # 1 victoire, 0 défaite, 0,5 nul
hp = np.array([r["hp"] for r in rows])
thr = np.array([r["mine"] / max(1, r["oppMax"]) - r["theirs"] / max(1, r["myMax"]) for r in rows])
lm = np.array([float(r["mine"] >= r["oppHp"]) for r in rows])
lt = np.array([float(r["theirs"] >= r["myHp"]) for r in rows])
hand = np.array([r["hand"] for r in rows])
l200 = np.array([float(r["lk"] != "l100") for r in rows])
dist = np.array([r["dist"] / 20 for r in rows])
turn = np.array([r["turn"] / 40 for r in rows])
games = np.array([f'{r["shard"]}:{r["g"]}' for r in rows])  # clé stable (hash() varie par process)

# Contrôle: le juge recomposé = la colonne hand (même formule que heuristicLeaf).
rebuilt = 1000 * hp + 350 * thr + 300 * lm - 300 * lt
print(json.dumps({"rows": len(rows), "games": int(len(np.unique(games))), "draws": int((y == 0.5).sum()),
                  "handRebuildMaxErr": round(float(np.abs(rebuilt - hand).max()), 6)}))


def fit(X, y, l2=1e-3, iters=50):
    w = np.zeros(X.shape[1])
    for _ in range(iters):  # Newton (IRLS) avec un petit L2 hors intercept
        p = 1 / (1 + np.exp(-X @ w))
        g = X.T @ (p - y) + l2 * np.r_[0, w[1:]]
        H = (X * (p * (1 - p))[:, None]).T @ X + l2 * np.diag(np.r_[0, np.ones(len(w) - 1)])
        step = np.linalg.solve(H, g)
        w -= step
        if np.abs(step).max() < 1e-9:
            break
    return w


def logloss(X, y, w):
    p = np.clip(1 / (1 + np.exp(-X @ w)), 1e-9, 1 - 1e-9)
    return -(y * np.log(p) + (1 - y) * np.log(1 - p))


one = np.ones(len(y))
models = {
    "M0_current_shape": np.c_[one, hand / 1000],
    "M1_free_weights": np.c_[one, hp, thr, lm, lt],
    "M2_free_by_level": np.c_[one, hp, thr, lm, lt, l200, hp * l200, thr * l200, lm * l200, lt * l200],
    "M3_plus_dist_turn": np.c_[one, hp, thr, lm, lt, dist, turn, hp * turn],
}
# Validation croisée 5 plis PAR MATCH (les positions d'un match sont corrélées).
ug = np.unique(games)
rng = np.random.default_rng(7)
fold_of = dict(zip(rng.permutation(ug), np.arange(len(ug)) % 5))
fold = np.array([fold_of[g] for g in games])
loss = {}
for name, X in models.items():
    per = np.zeros(len(y))
    for k in range(5):
        tr, te = fold != k, fold == k
        per[te] = logloss(X[te], y[te], fit(X[tr], y[tr]))
    loss[name] = per
out = {"cvLogLoss": {n: round(float(v.mean()), 5) for n, v in loss.items()}}
# Écart apparié au juge actuel, erreur-type par bootstrap DE MATCHS.
idx_by_game = {g: np.flatnonzero(games == g) for g in ug}
for n in models:
    if n == "M0_current_shape":
        continue
    diff = loss[n] - loss["M0_current_shape"]
    per_game = np.array([diff[idx_by_game[g]].sum() for g in ug])
    boots = [per_game[rng.integers(0, len(ug), len(ug))].sum() / len(y) for _ in range(2000)]
    out[f"{n}_minus_M0"] = {"mean": round(float(diff.mean()), 5), "ci95": [round(float(np.percentile(boots, 2.5)), 5),
                                                                         round(float(np.percentile(boots, 97.5)), 5)]}
# Poids ajustés sur tout, exprimés comme le juge (coefficient PV ramené à 1000).
w1 = fit(models["M1_free_weights"], y)
scale = 1000 / w1[1]
out["M1_weights_in_judge_units"] = {"hp": 1000, "thr": round(float(w1[2] * scale), 1), "lethalMine": round(float(w1[3] * scale), 1),
                                    "lethalTheirs": round(float(w1[4] * scale), 1), "current": {"hp": 1000, "thr": 350, "lethalMine": 300, "lethalTheirs": -300}}
# Même CALIBRATION que le juge actuel: M0 dit qu'un juge J vaut le logit a0 + k0·J/1000; le
# juge ajusté exprimé dans ces unités (J' = (w·x − a)·1000/k0) garde le sens des ±999 et
# des issues ±1000 de la recherche — seule la pondération des termes change.
w0 = fit(models["M0_current_shape"], y)
c = 1000 / w0[1]
out["M0_fit"] = {"intercept": round(float(w0[0]), 4), "slopePer1000": round(float(w0[1]), 4)}
out["M1_calibrated_judge"] = {"hp": round(float(w1[1] * c), 1), "thr": round(float(w1[2] * c), 1),
                              "lethalMine": round(float(w1[3] * c), 1), "lethalTheirs": round(float(w1[4] * c), 1),
                              "interceptLogit": round(float(w1[0]), 4)}
boot_w = []
for _ in range(300):
    gs = ug[rng.integers(0, len(ug), len(ug))]
    ii = np.concatenate([idx_by_game[g] for g in gs])
    w = fit(models["M1_free_weights"][ii], y[ii])
    boot_w.append([w[2] / w[1] * 1000, w[3] / w[1] * 1000, w[4] / w[1] * 1000])
bw = np.array(boot_w)
out["M1_weights_ci95"] = {k: [round(float(np.percentile(bw[:, i], 2.5)), 1), round(float(np.percentile(bw[:, i], 97.5)), 1)]
                          for i, k in enumerate(["thr", "lethalMine", "lethalTheirs"])}
w2 = fit(models["M2_free_by_level"], y)
out["M2_l200_weights_in_judge_units"] = {"hp": 1000, "thr": round(float((w2[2] + w2[7]) / (w2[1] + w2[6]) * 1000), 1),
                                         "lethalMine": round(float((w2[3] + w2[8]) / (w2[1] + w2[6]) * 1000), 1),
                                         "lethalTheirs": round(float((w2[4] + w2[9]) / (w2[1] + w2[6]) * 1000), 1)}
out["M2_l100_weights_in_judge_units"] = {"hp": 1000, "thr": round(float(w2[2] / w2[1] * 1000), 1),
                                         "lethalMine": round(float(w2[3] / w2[1] * 1000), 1), "lethalTheirs": round(float(w2[4] / w2[1] * 1000), 1)}
print(json.dumps(out, indent=1))
