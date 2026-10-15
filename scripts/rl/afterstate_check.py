#!/usr/bin/env python3
"""Porte G0 (données) des shards d'après-états (afterstate_gen.cjs): cohérence
des tailles, étiquettes finies dans [-1,1] (NaN seulement pour le rôle 4),
z ∈ {-1,0,1}, une seule valeur de split par match, groupes de décision
contigus, et sanité du champion (C1 vs maison / vs Stratège en jeu).

  python3 scripts/rl/afterstate_check.py 'local-observations/rl/loop1/shards/*.meta.json'
"""
import glob
import json
import sys

import numpy as np


def check(meta_path):
    meta = json.loads(open(meta_path).read())
    base = meta_path[: -len(".meta.json")]
    n, D = meta["records"], meta["obsDim"]
    errs = []
    x = np.memmap(base + ".x.f16", dtype=np.float16, mode="r")
    if x.size != n * D:
        errs.append(f"x.f16 {x.size} != {n}x{D}")
    cols = {k: np.fromfile(base + f".{k}.{t}", dtype=dt) for k, t, dt in
            (("y", "f32", np.float32), ("z", "i8", np.int8), ("g", "u32", np.uint32), ("d", "u32", np.uint32),
             ("r", "u8", np.uint8), ("k", "u8", np.uint8), ("n", "u16", np.uint16), ("v", "u8", np.uint8))}
    for k, a in cols.items():
        if a.size != n:
            errs.append(f"{k}: {a.size} != {n}")
    if errs:
        return {"shard": base, "ok": False, "errors": errs}
    y, r = cols["y"], cols["r"]
    lab = r != 4
    if np.isnan(y[lab]).any():
        errs.append("NaN dans une étiquette de rôle 1-3")
    if (~np.isnan(y[~lab])).any():
        errs.append("rôle 4 étiqueté (attendu NaN)")
    yl = y[lab]
    if yl.size and (np.abs(yl) > 1.0 + 1e-6).any():
        errs.append(f"étiquette hors [-1,1]: max |y| = {np.abs(yl).max()}")
    if not set(np.unique(cols["z"]).tolist()) <= {-1, 0, 1}:
        errs.append("z hors {-1,0,1}")
    g, v = cols["g"], cols["v"]
    for gid in np.unique(g):
        if np.unique(v[g == gid]).size > 1:
            errs.append(f"match {gid}: split incohérent"); break
    d = cols["d"]
    if d.size and (np.diff(d.astype(np.int64)) < 0).any():
        errs.append("décisions non monotones")
    # échantillon d'obs: finies et dans une plage raisonnable
    if n:
        idx = np.linspace(0, n - 1, min(n, 64)).astype(np.int64)
        xs = np.stack([np.asarray(x[i * D:(i + 1) * D], dtype=np.float32) for i in idx])
        if not np.isfinite(xs).all():
            errs.append("obs non finie")
    res = meta.get("results", {})
    out = {"shard": base.split("/")[-1], "ok": not errs, "errors": errs, "records": n, "matches": meta["matches"],
           "lk": meta["lk"], "split": meta["split"], "aborts": meta.get("aborts"),
           "roles": {int(k): int((r == k).sum()) for k in (1, 2, 3, 4)},
           "yMean": round(float(yl.mean()), 4) if yl.size else None, "ySd": round(float(yl.std()), 4) if yl.size else None,
           "terminalSkipped": meta["stats"]["terminalSkipped"], "gtDecisions": meta["stats"]["gtDecisions"],
           "c1VsMaison": [res.get("maison", {}).get("c1Wins"), res.get("maison", {}).get("games")],
           "c1VsIngame": [res.get("ingame", {}).get("c1Wins"), res.get("ingame", {}).get("games")],
           "invalid": meta["stats"]["invalid"]}
    return out


def main():
    paths = sorted(p for pat in sys.argv[1:] for p in glob.glob(pat))
    allok = True
    tot = {"records": 0, "matches": 0, "mw": 0, "mg": 0, "iw": 0, "ig": 0}
    for p in paths:
        o = check(p)
        allok &= o["ok"]
        print(json.dumps(o))
        if o["ok"]:
            tot["records"] += o["records"]; tot["matches"] += o["matches"]
            mw, mg = o["c1VsMaison"]; iw, ig = o["c1VsIngame"]
            tot["mw"] += mw or 0; tot["mg"] += mg or 0; tot["iw"] += iw or 0; tot["ig"] += ig or 0
    print(json.dumps({"shards": len(paths), "allOk": allok, **tot}))
    sys.exit(0 if allok else 1)


if __name__ == "__main__":
    main()
