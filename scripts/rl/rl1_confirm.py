#!/usr/bin/env python3
# RL1 §5 (docs/selfplay-rl1.md) — confirmation PRÉ-ENREGISTRÉE d'un point de contrôle
# « prometteur », sur des graines NEUVES (tag jamais utilisé), argmax partout:
#   A. candidat vs clone de départ: --games-clone parties appariées (même graine,
#      sièges inversés); score par paire (nul = ½); passe si score ≥ 0,55 ET borne
#      basse de l'IC95 > 0,50.
#   B. candidat vs IA Maison et clone vs IA Maison sur les MÊMES graines
#      (--games-maison chacun); passe si taux(candidat) ≥ taux(clone) − 5 points.
# Frein thermique et garde mémoire: rl1_train.run_workers.
#   python3 scripts/rl/rl1_confirm.py CANDIDATE_DIR CLONE0_DIR OUT_DIR [--tag confirm1]
import argparse
import collections
import json
import statistics as st
import sys
import types
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import rl1_train as rt  # noqa: E402


def episodes(d):
    return [json.loads(l) for f in sorted(Path(d).glob("w*.ep.jsonl")) for l in open(f)]


def pair_scores(d):
    pairs = collections.defaultdict(list)
    for f in sorted(Path(d).glob("w*.ep.jsonl")):
        for l in open(f):
            e = json.loads(l)
            pairs[(f.name, e["game"] >> 1)].append((e["outcome"] + 1) / 2)
    return [sum(v) / 2 for v in pairs.values() if len(v) == 2]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("candidate"); ap.add_argument("clone0"); ap.add_argument("out")
    ap.add_argument("--tag", default="confirm1")
    ap.add_argument("--games-clone", type=int, default=400)
    ap.add_argument("--games-maison", type=int, default=256)
    ap.add_argument("--workers", type=int, default=3)
    ap.add_argument("--lk", default="l100,l200gear")
    a = ap.parse_args()
    out = Path(a.out)
    if out.exists():
        sys.exit(f"REFUS: {out} existe (graines déjà jouées?)")
    args = types.SimpleNamespace(workers=a.workers, lk=a.lk)
    runs = {"A_vs_clone": (a.candidate, "clone0:1", a.games_clone, f"{a.tag}-clone"),
            "B_cand_vs_maison": (a.candidate, "maison:1", a.games_maison, f"{a.tag}-maison"),
            "B_clone_vs_maison": (a.clone0, "maison:1", a.games_maison, f"{a.tag}-maison")}
    for name, (learner, mix, games, tag) in runs.items():
        if not rt.machine_ok(lambda d: print(json.dumps(d), flush=True)):
            sys.exit("arrêt: garde machine")
        rt.run_workers(args, learner, [], a.clone0, 0, out / name, mix, games, 0, 0.0, tag)
        for f in (out / name).glob("w*.obs.f16"):
            f.unlink()
        print(json.dumps({"done": name, "heat": rt.heat}), flush=True)
    ps = pair_scores(out / "A_vs_clone")
    m = st.mean(ps); half = 1.96 * st.pstdev(ps) / len(ps) ** 0.5
    pent = collections.Counter(ps)
    eA = episodes(out / "A_vs_clone")
    rate = lambda eps: sum(e["outcome"] > 0 for e in eps) / len(eps)
    ec, ek = episodes(out / "B_cand_vs_maison"), episodes(out / "B_clone_vs_maison")
    res = {
        "candidate": a.candidate, "tag": a.tag,
        "A": {"pairs": len(ps), "pentanomial": {str(k): v for k, v in sorted(pent.items())}, "score": round(m, 4),
              "ci95": [round(m - half, 4), round(m + half, 4)], "games": len(eA),
              "byLk": {lk: f"{sum(e['outcome'] > 0 for e in eA if e['lk'] == lk)}/{sum(e['lk'] == lk for e in eA)}" for lk in sorted({e['lk'] for e in eA})},
              "pass": m >= 0.55 and m - half > 0.50},
        "B": {"candidate": f"{sum(e['outcome'] > 0 for e in ec)}/{len(ec)}", "clone": f"{sum(e['outcome'] > 0 for e in ek)}/{len(ek)}",
              "diffPts": round(100 * (rate(ec) - rate(ek)), 1), "pass": rate(ec) >= rate(ek) - 0.05},
    }
    res["confirmed"] = res["A"]["pass"] and res["B"]["pass"]
    (out / "result.json").write_text(json.dumps(res, indent=1))
    print(json.dumps(res, indent=1))


if __name__ == "__main__":
    main()
