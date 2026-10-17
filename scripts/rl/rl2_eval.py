#!/usr/bin/env python3
# RL2 expérience E (docs/selfplay-rl2.md), pré-enregistrée — argmax partout, graines neuves:
#   E1: S_k (réseau + recherche rl2_search) contre le MÊME réseau seul, l100 + l200gear;
#       passe si score par paires ≥ 0,60.
#   E2: S_k contre C1 à l100 et à l200gear, et le réseau seul contre C1 sur les mêmes
#       graines (référence); descriptif, avec ms/décision des deux camps.
#   python3 scripts/rl/rl2_eval.py NET OUT [--k 6] [--e1-games 128] [--e2-games 64] [--workers 2]
import argparse
import collections
import json
import statistics as st
import sys
import types
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import rl1_train as rt  # noqa: E402


def pair_scores(d):
    pairs = collections.defaultdict(list)
    for f in sorted(Path(d).glob("w*.ep.jsonl")):
        for l in open(f):
            e = json.loads(l)
            pairs[(f.name, e["game"] >> 1)].append((e["outcome"] + 1) / 2)
    return {k: sum(v) / 2 for k, v in pairs.items() if len(v) == 2}


def summary(d):
    ps = list(pair_scores(d).values())
    m = st.mean(ps); h = 1.96 * st.pstdev(ps) / len(ps) ** 0.5
    done = [json.loads(f.read_text()) for f in sorted(Path(d).glob("w*.done.json"))]
    dec = sum(x["learnerDec"] for x in done); c1d = sum(x.get("c1Dec", 0) for x in done)
    return {"pairs": len(ps), "pentanomial": {str(k): v for k, v in sorted(collections.Counter(ps).items())},
            "score": round(m, 4), "ci95": [round(m - h, 4), round(m + h, 4)],
            "msPerDecision": round(sum(x["learnerMs"] for x in done) / max(1, dec), 1),
            "c1MsPerDecision": round(sum(x.get("c1Ms", 0) for x in done) / c1d, 1) if c1d else None}


def run(out, name, net, k, lk, mix, games, tag, workers):
    if not rt.machine_ok(lambda x: print(json.dumps(x), flush=True)):
        sys.exit("arrêt: garde machine")
    args = types.SimpleNamespace(workers=workers, lk=lk, search=k)
    rdir = out / name
    rt.run_workers(args, net, [], net, 0, rdir, mix, games, 0, 0.0, tag)
    for f in rdir.glob("w*.obs.f16"):
        f.unlink()
    s = summary(rdir)
    print(json.dumps({name: s, "heat": rt.heat}), flush=True)
    return s


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("net"); ap.add_argument("out")
    ap.add_argument("--k", type=int, default=6)
    ap.add_argument("--e1-games", type=int, default=128)
    ap.add_argument("--e2-games", type=int, default=64)
    ap.add_argument("--workers", type=int, default=2)
    a = ap.parse_args()
    out = Path(a.out)
    if out.exists():
        sys.exit(f"REFUS: {out} existe (graines déjà jouées?)")
    res = {"net": a.net, "k": a.k}
    res["E1_search_vs_net"] = run(out, "E1", a.net, a.k, "l100,l200gear", "clone0:1", a.e1_games, "rl2e1", a.workers)
    res["E1_search_vs_net"]["pass"] = res["E1_search_vs_net"]["score"] >= 0.60
    for lk in ("l100", "l200gear"):
        res[f"E2_search_vs_c1_{lk}"] = run(out, f"E2-search-{lk}", a.net, a.k, lk, "c1:1", a.e2_games, f"rl2e2-{lk}", a.workers)
        res[f"E2_net_vs_c1_{lk}"] = run(out, f"E2-net-{lk}", a.net, 0, lk, "c1:1", a.e2_games, f"rl2e2-{lk}", a.workers)
    (out / "result.json").write_text(json.dumps(res, indent=1))
    print(json.dumps(res, indent=1))


if __name__ == "__main__":
    main()
