#!/usr/bin/env python3
"""État de la loop 1: shards terminés par groupe, records par niveau/split, décisions
GT, sanité du champion (G0), étalonnage double temps (SPRT + ratio de temps), disque.
  python3 scripts/rl/loop1_status.py"""
import glob, json, os, subprocess, time
from collections import defaultdict
R = "local-observations/rl/loop1"
grp = defaultdict(lambda: {"shards": 0, "records": 0, "matches": 0, "gt": 0, "mw": 0, "mg": 0, "iw": 0, "ig": 0,
                           "aborts": 0, "invalid": 0})
first = None
for p in glob.glob(f"{R}/shards/*.meta.json"):
    m = json.load(open(p)); g = grp[(m["lk"], m["split"])]
    g["shards"] += 1; g["records"] += m["records"]; g["matches"] += m["matches"]; g["gt"] += m["stats"]["gtDecisions"]
    g["aborts"] += m["aborts"]; g["invalid"] += m["stats"]["invalid"]
    r = m["results"]; g["mw"] += r["maison"]["c1Wins"]; g["mg"] += r["maison"]["games"]
    g["iw"] += r["ingame"]["c1Wins"]; g["ig"] += r["ingame"]["games"]
    t = os.path.getmtime(p); first = t if first is None else min(first, t)
tr = sum(v["records"] for (lk, sp), v in grp.items() if sp == "train")
tr200 = sum(v["records"] for (lk, sp), v in grp.items() if sp == "train" and lk == "l200gear")
out = {"time": time.strftime("%H:%M"), "groups": {f"{lk}/{sp}": v for (lk, sp), v in sorted(grp.items())},
       "trainRecords": tr, "trainL200Share": round(tr200 / tr, 3) if tr else None,
       "gtDecisions": sum(v["gt"] for v in grp.values()),
       "inProgressShards": len([p for p in glob.glob(f"{R}/shards/*.x.f16") if not os.path.exists(p[:-6] + ".meta.json")]),
       "stopFile": os.path.exists(f"{R}/shards/STOP-loop1")}
calib = {}
for lk in ("l100", "l200gear"):
    files = glob.glob(f"{R}/calib/c2x-{lk}-w*.jsonl")
    if files:
        o = subprocess.run(["python3", "scripts/rl/sprt.py", *files, "--normalized", "--elo0", "0", "--elo1", "40"],
                           capture_output=True, text=True).stdout
        try:
            d = json.loads(o); calib[lk] = {k: d.get(k) for k in ("pairs", "counts", "verdict", "llr", "nElo", "elo", "elo95", "timeRatioAoverB")}
        except Exception:
            calib[lk] = o[:200]
out["calib2x"] = calib
out["diskGB"] = round(sum(os.path.getsize(p) for p in glob.glob(f"{R}/**/*", recursive=True) if os.path.isfile(p)) / 1e9, 2)
print(json.dumps(out))
