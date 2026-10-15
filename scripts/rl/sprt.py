#!/usr/bin/env python3
"""SPRT séquentiel sur PAIRES de parties (méthode fishtest): chaque graine est
jouée 2× sièges inversés (calc_duel.cjs: jeux i et i+1 = même graine, i>>1);
le score de la paire pour SPEC_A = (victoires + ½ nuls) / 2 ∈ {0, ¼, ½, ¾, 1}
(pentanomial; sans nuls → {0, ½, 1}). Les paires réduisent la variance quand la
graine décide l'issue (≈60% de paires 1-1 entre bots proches, mesuré ici).

GSPRT, approximation normale (M. Van den Bergh): avec N paires de moyenne m et
variance v (par paire), LLR = N·(s1−s0)·(2m−s0−s1) / (2v), s = 1/(1+10^(−elo/400))
(Elo LOGISTIQUE). Arrêt: LLR ≥ ln((1−β)/α) → H1 (gain ≥ elo1), LLR ≤ ln(β/(1−α))
→ H0 (gain ≤ elo0). Sinon on continue — jusqu'au plafond PRÉDÉCLARÉ (--max-pairs),
au-delà: « non conclu » = non promu.

  python3 scripts/rl/sprt.py 'value-cra3/sprt-*.jsonl' --elo0 0 --elo1 35 [--max-pairs 400]
  python3 scripts/rl/sprt.py --selftest      # taux d'erreur simulés (α, β)

Sortie JSON: paires (gagnées 2-0 / 1-1 / perdues 0-2), score, Elo ± IC95, LLR,
bornes, verdict, et le rapport de temps de réflexion A/B si les lignes portent msA/msB.
"""
import argparse
import glob
import json
import math
import random
import sys


def score_of(elo):
    return 1.0 / (1.0 + 10.0 ** (-elo / 400.0))


def elo_of(score):
    score = min(max(score, 1e-6), 1 - 1e-6)
    return -400.0 * math.log10(1.0 / score - 1.0)


NELO_K = 800.0 / math.log(10.0)


def llr(pairs, elo0, elo1, normalized=False):
    n = len(pairs)
    if n < 2:
        return 0.0, None, None
    m = sum(pairs) / n
    v = sum((x - m) ** 2 for x in pairs) / n
    if v <= 1e-12:  # toutes les paires identiques: pas d'information de variance
        v = 1e-12
    if normalized:
        # Elo NORMALISÉ (fishtest, M. Van den Bergh): bornes exprimées en unités
        # du bruit observé — nElo = (800/ln10)·(µ−½)/σ_pg, σ_pg = σ_paire·√2.
        spg = math.sqrt(v) * math.sqrt(2.0)
        s0, s1 = 0.5 + elo0 * spg / NELO_K, 0.5 + elo1 * spg / NELO_K
    else:
        s0, s1 = score_of(elo0), score_of(elo1)
    return n * (s1 - s0) * (2 * m - s0 - s1) / (2 * v), m, v


def load_pairs(patterns):
    games = {}
    ms = {"A": 0.0, "B": 0.0, "decA": 0, "decB": 0}
    for pat in patterns:
        for path in sorted(glob.glob(pat)):
            with open(path) as fh:
                for line in fh:
                    line = line.strip()
                    if not line:
                        continue
                    r = json.loads(line)
                    key = (path, r["i"] >> 1)
                    games.setdefault(key, {})[r["i"] & 1] = r["result"]
                    if "msA" in r:
                        ms["A"] += r["msA"]; ms["B"] += r["msB"]
                        ms["decA"] += r.get("decA", 0); ms["decB"] += r.get("decB", 0)
    pairs, counts = [], {"2-0": 0, "split": 0, "0-2": 0, "other": 0}
    pts = {"W": 1.0, "D": 0.5, "L": 0.0}
    for key in sorted(games):
        g = games[key]
        if 0 in g and 1 in g:  # paire COMPLÈTE uniquement
            s = (pts[g[0]] + pts[g[1]]) / 2
            pairs.append(s)
            counts["2-0" if s == 1 else "0-2" if s == 0 else "split" if s == 0.5 else "other"] += 1
    return pairs, counts, ms


def verdict(pairs, elo0, elo1, alpha, beta, max_pairs, normalized=False):
    lo, hi = math.log(beta / (1 - alpha)), math.log((1 - beta) / alpha)
    L, m, v = llr(pairs, elo0, elo1, normalized)
    if L >= hi:
        return "H1", L, lo, hi, m, v
    if L <= lo:
        return "H0", L, lo, hi, m, v
    if max_pairs and len(pairs) >= max_pairs:
        return "TRUNCATED", L, lo, hi, m, v
    return "CONTINUE", L, lo, hi, m, v


def pair_dist(true_elo, split, normalized):
    """(P(2-0), P(1-1), P(0-2)) avec P(1-1)=split et la moyenne voulue (Elo
    logistique, ou normalisé: nElo = K(µ−½)/σ_pg résolu par bissection)."""
    if not normalized:
        s = score_of(true_elo)
        a = s - split / 2
        return a, split, 1 - split - a
    lo, hi = (1 - split) / 2, 1 - split  # a ∈ [µ=½, max]
    if true_elo < 0:
        lo, hi = 0.0, (1 - split) / 2
    for _ in range(80):
        a = (lo + hi) / 2
        c = 1 - split - a
        mu = a + split / 2
        var = a + split / 4 - mu * mu
        ne = NELO_K * (mu - 0.5) / (math.sqrt(max(var, 1e-12)) * math.sqrt(2.0))
        if ne < true_elo:
            lo = a
        else:
            hi = a
    return a, split, 1 - split - a


def selftest(elo0, elo1, alpha, beta, max_pairs, split=0.55, runs=2000, normalized=False):
    """Simule des SPRT avec la forme de paires mesurée (≈55% de 1-1) et vérifie
    les taux d'erreur: vrai Elo = elo0 → H1 rare (≤ ~α); vrai Elo = elo1 → H1 ~1−β."""
    out = {}
    for label, true_elo in (("at_elo0", elo0), ("at_elo1", elo1), ("at_mid", (elo0 + elo1) / 2)):
        a, _, c = pair_dist(true_elo, split, normalized)
        assert a >= 0 and c >= 0, (a, c)
        rng = random.Random(7)
        res = {"H0": 0, "H1": 0, "TRUNCATED": 0}
        npairs = []
        for _ in range(runs):
            pairs = []
            while True:
                u = rng.random()
                pairs.append(1.0 if u < a else 0.5 if u < a + split else 0.0)
                if len(pairs) % 8 == 0 or (max_pairs and len(pairs) >= max_pairs):  # contrôle par lots, comme le banc
                    vd = verdict(pairs, elo0, elo1, alpha, beta, max_pairs, normalized)[0]
                    if vd != "CONTINUE":
                        res[vd] += 1
                        npairs.append(len(pairs))
                        break
        out[label] = {"trueElo": true_elo, **{k: round(v / runs, 4) for k, v in res.items()},
                      "meanPairs": round(sum(npairs) / len(npairs), 1)}
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("patterns", nargs="*")
    ap.add_argument("--elo0", type=float, default=0.0)
    ap.add_argument("--elo1", type=float, default=35.0)
    ap.add_argument("--alpha", type=float, default=0.05)
    ap.add_argument("--beta", type=float, default=0.05)
    ap.add_argument("--max-pairs", type=int, default=400)
    ap.add_argument("--selftest", action="store_true")
    ap.add_argument("--normalized", action="store_true", help="bornes en Elo NORMALISÉ (convention fishtest actuelle)")
    a = ap.parse_args()
    if a.selftest:
        print(json.dumps(selftest(a.elo0, a.elo1, a.alpha, a.beta, a.max_pairs, normalized=a.normalized), indent=1))
        return
    pairs, counts, ms = load_pairs(a.patterns)
    vd, L, lo, hi, m, v = verdict(pairs, a.elo0, a.elo1, a.alpha, a.beta, a.max_pairs, a.normalized)
    n = len(pairs)
    res = {"pairs": n, "games": 2 * n, "counts": counts, "verdict": vd,
           "llr": round(L, 3), "bounds": [round(lo, 3), round(hi, 3)], "elo0": a.elo0, "elo1": a.elo1,
           "eloModel": "normalized" if a.normalized else "logistic",
           "alpha": a.alpha, "beta": a.beta, "maxPairs": a.max_pairs}
    if m is not None:
        se = math.sqrt(v / n) if n else float("nan")
        res.update({"score": round(m, 4), "elo": round(elo_of(m), 1),
                    "elo95": [round(elo_of(m - 1.96 * se), 1), round(elo_of(m + 1.96 * se), 1)],
                    "pairVar": round(v, 4),
                    "nElo": round(NELO_K * (m - 0.5) / (math.sqrt(v) * math.sqrt(2.0)), 1) if v > 0 else None,
                    "los": round(0.5 * (1 + math.erf((m - 0.5) / (se * math.sqrt(2)))), 4) if se > 0 else None})
    if ms["decA"] and ms["decB"]:
        res["msPerDecA"] = round(ms["A"] / ms["decA"], 1)
        res["msPerDecB"] = round(ms["B"] / ms["decB"], 1)
        res["timeRatioAoverB"] = round((ms["A"] / ms["decA"]) / (ms["B"] / ms["decB"]), 3)
    print(json.dumps(res))
    sys.exit(0)


if __name__ == "__main__":
    main()
