#!/usr/bin/env python3
# Banc C1 FIXE: plusieurs réseaux (argmax, seuls) contre C1 sur les MÊMES graines appariées
# (tag fixe) → courbe comparable dans le temps. Frein thermique de rl1_train.run_workers.
#   python3 scripts/rl/rl_c1bench.py OUT --lk l100 --games 96 --tag c1bench-l100 NAME=DIR ...
import argparse, json, sys, types
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
import rl1_train as rt  # noqa: E402
import rl2_eval as e2  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument("out"); ap.add_argument("models", nargs="+")
ap.add_argument("--lk", default="l100"); ap.add_argument("--games", type=int, default=96)
ap.add_argument("--tag", default="c1bench-l100"); ap.add_argument("--workers", type=int, default=2)
a = ap.parse_args()
out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
res = json.loads((out / "result.json").read_text()) if (out / "result.json").exists() else {}
for spec in a.models:
    name, _, d = spec.partition("=")
    if name in res:
        continue
    if not rt.machine_ok(lambda x: print(json.dumps(x), flush=True)):
        sys.exit("arrêt: garde machine")
    args = types.SimpleNamespace(workers=a.workers, lk=a.lk, search=0)
    rt.run_workers(args, d, [], d, 0, out / name, "c1:1", a.games, 0, 0.0, a.tag)
    for f in (out / name).glob("w*.obs.f16"):
        f.unlink()
    res[name] = {"dir": d, **e2.summary(out / name)}
    (out / "result.json").write_text(json.dumps(res, indent=1))
    print(json.dumps({name: res[name]}), flush=True)
