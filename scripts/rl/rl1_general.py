#!/usr/bin/env python3
# RL1 — contrôle de GÉNÉRALITÉ (docs/selfplay-rl1.md): le candidat et la référence
# (le clone de départ) jouent, sur les MÊMES graines appariées et en argmax, contre des
# adversaires JAMAIS vus à l'entraînement: clones frères (même recette, autres graines)
# et C1 (le champion recherche). Écart apparié par paire de graines, IC95.
#   python3 scripts/rl/rl1_general.py CANDIDATE BASELINE OUT --opps sib7=DIR,sib8=DIR,c1
#     [--games 128] [--c1-games 128] [--c1-lk l100] [--tag gen1]
import argparse
import collections
import json
import statistics as st
import sys
import types
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import rl1_train as rt  # noqa: E402


def pairs_by_key(d):
    pairs = collections.defaultdict(list)
    for f in sorted(Path(d).glob("w*.ep.jsonl")):
        for l in open(f):
            e = json.loads(l)
            pairs[(f.name, e["game"] >> 1)].append((e["outcome"] + 1) / 2)
    return {k: sum(v) / 2 for k, v in pairs.items() if len(v) == 2}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("candidate"); ap.add_argument("baseline"); ap.add_argument("out")
    ap.add_argument("--opps", required=True, help="nom=DIR (clone adverse, argmax) ou c1, séparés par des virgules")
    ap.add_argument("--games", type=int, default=128)
    ap.add_argument("--c1-games", type=int, default=128)
    ap.add_argument("--c1-lk", default="l100")
    ap.add_argument("--lk", default="l100,l200gear")
    ap.add_argument("--tag", default="gen1")
    ap.add_argument("--workers", type=int, default=3)
    a = ap.parse_args()
    out = Path(a.out)
    if out.exists():
        sys.exit(f"REFUS: {out} existe (graines déjà jouées?)")
    res = {"candidate": a.candidate, "baseline": a.baseline, "tag": a.tag, "opps": {}}
    for spec in a.opps.split(","):
        name, _, d = spec.partition("=")
        is_c1 = name == "c1"
        args = types.SimpleNamespace(workers=a.workers, lk=a.c1_lk if is_c1 else a.lk)
        games = a.c1_games if is_c1 else a.games
        sc = {}
        for who, learner in (("candidate", a.candidate), ("baseline", a.baseline)):
            if not rt.machine_ok(lambda x: print(json.dumps(x), flush=True)):
                sys.exit("arrêt: garde machine")
            rdir = out / f"{name}-{who}"
            rt.run_workers(args, learner, [], d if not is_c1 else a.baseline, 0, rdir, "c1:1" if is_c1 else "clone0:1",
                           games, 0, 0.0, f"{a.tag}-{name}")
            for f in rdir.glob("w*.obs.f16"):
                f.unlink()
            sc[who] = pairs_by_key(rdir)
            print(json.dumps({"done": f"{name}-{who}", "heat": rt.heat}), flush=True)
        keys = sorted(set(sc["candidate"]) & set(sc["baseline"]))
        diff = [sc["candidate"][k] - sc["baseline"][k] for k in keys]
        m = st.mean(diff); half = 1.96 * st.pstdev(diff) / len(diff) ** 0.5
        res["opps"][name] = {"pairs": len(keys), "lk": args.lk,
                             "candidateScore": round(st.mean(sc["candidate"][k] for k in keys), 4),
                             "baselineScore": round(st.mean(sc["baseline"][k] for k in keys), 4),
                             "diff": round(m, 4), "diffCi95": [round(m - half, 4), round(m + half, 4)]}
        print(json.dumps({name: res["opps"][name]}), flush=True)
    (out / "result.json").write_text(json.dumps(res, indent=1))
    print(json.dumps(res, indent=1))


if __name__ == "__main__":
    main()
