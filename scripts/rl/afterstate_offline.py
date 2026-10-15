#!/usr/bin/env python3
"""Loop 1 — porte HORS-LIGNE G1: un juge d'après-états appris choisit-il aussi
bien que C1, sur des décisions jamais vues (shards de validation avec GT)?

Pour chaque décision GT (16 ripostes indépendantes par nominé, dec.jsonl):
  vérité T(n)     = moyenne des échantillons GT 3..15 (jamais utilisés pour choisir)
  finale « 3 éch. » = moyenne des échantillons GT 0..2 (une finale fraîche simulée)
  regret(choix)   = max_n T(n) − T(choix)   (points du juge C1, échelle ±1000)
Politiques comparées:
  C1_reel      choix réel de C1 (s0 étape 1 → 6 finalistes → s3)
  C1_proxy     finalistes réels de C1 → finale « 3 éch. »
  N0b_proxy    top-6 par V(k=0) parmi les nominés → finale « 3 éch. » (V remplace l'étape 1)
  N0a          argmax de la moyenne V(k=0,1,2) — AUCUNE riposte simulée
  V_finale     finalistes réels de C1 → argmax moyenne V (V remplace la finale)
  oracle_prelim top-6 par T → finale « 3 éch. » (plafond d'une étape 1 parfaite)

  python3 scripts/rl/afterstate_offline.py MODEL_DIR 'local-observations/rl/loop1/shards/gt-*.meta.json'
"""
import glob
import json
import sys
from pathlib import Path

import numpy as np
import torch

import train_value as tv


def spearman(a, b):
    if len(a) < 3:
        return float("nan")
    ra = np.argsort(np.argsort(a)); rb = np.argsort(np.argsort(b))
    if ra.std() == 0 or rb.std() == 0:
        return float("nan")
    return float(np.corrcoef(ra, rb)[0, 1])


def main():
    model_dir, pattern = sys.argv[1], sys.argv[2]
    shapes = json.loads((Path(model_dir) / "shapes.json").read_text())
    D = shapes["obsDim"]
    tv.REST = D - tv.PLANE
    net = tv.ValueNet(ch=shapes["ch"], gdim=shapes["gdim"], depth=shapes.get("depth", 3), readout=shapes.get("readout", "mean"))
    net.load_state_dict(torch.load(Path(model_dir) / "value.pt", map_location="cpu")["model"])
    net.eval()
    pols = ["C1_reel", "C1_proxy", "N0b_proxy", "N0a", "V_finale", "oracle_prelim"]
    reg = {p: [] for p in pols}
    sp_v, sp_s0 = [], []
    ndec = 0
    for mp in sorted(glob.glob(pattern)):
        base = mp[: -len(".meta.json")]
        meta = json.loads(Path(mp).read_text())
        n = meta["records"]
        if n == 0:
            continue
        d = np.fromfile(base + ".d.u32", dtype=np.uint32)
        nn = np.fromfile(base + ".n.u16", dtype=np.uint16)
        kk = np.fromfile(base + ".k.u8", dtype=np.uint8)
        rr = np.fromfile(base + ".r.u8", dtype=np.uint8)
        x = np.memmap(base + ".x.f16", dtype=np.float16, mode="r", shape=(n, D))
        lines = [json.loads(l) for l in open(base + ".dec.jsonl") if l.strip()]
        gt_lines = [L for L in lines if "gt" in L]
        if not gt_lines:
            continue
        gt_d = np.array([L["d"] for L in gt_lines])
        rows = np.flatnonzero(np.isin(d, gt_d) & (rr != 3))
        with torch.no_grad():
            v = np.concatenate([net(torch.from_numpy(np.asarray(x[rows[i:i + 4096]], dtype=np.float32))).numpy()
                                for i in range(0, len(rows), 4096)]) if len(rows) else np.array([])
        vs = -1000.0 * v  # perspective du CHERCHEUR (y est celle du joueur au trait)
        byk = {}
        for j, row in enumerate(rows):
            byk.setdefault((int(d[row]), int(nn[row])), {})[int(kk[row])] = float(vs[j])
        for L in gt_lines:
            noms = [g[0] for g in L["gt"]]
            samples = {g[0]: np.array(g[1], dtype=np.float64) for g in L["gt"]}
            T = {m: samples[m][3:].mean() for m in noms}
            fin3 = {m: samples[m][:3].mean() for m in noms}
            s0 = dict((a, b) for a, b in L["s0"])
            fins = [a for a, _ in L["s3"]]
            vk = {m: byk.get((L["d"], m), {}) for m in noms}
            v0 = {m: vk[m].get(0, s0.get(m, 0.0)) for m in noms}  # absent = après-état terminal → score exact s0
            vmean = {m: (np.mean(list(vk[m].values())) if vk[m] else s0.get(m, 0.0)) for m in noms}
            tmax = max(T.values())
            pick = lambda cands, score: max(cands, key=lambda m: score[m])
            top6 = lambda score: sorted(noms, key=lambda m: -score[m])[:6]
            choices = {
                "C1_reel": L["chosen"] if L["chosen"] >= 0 else pick(fins, fin3),
                "C1_proxy": pick(fins, fin3),
                "N0b_proxy": pick(top6(v0), fin3),
                "N0a": pick(noms, vmean),
                "V_finale": pick(fins, vmean),
                "oracle_prelim": pick(top6(T), fin3),
            }
            for p, c in choices.items():
                reg[p].append(tmax - T[c])
            tv_ = np.array([T[m] for m in noms])
            sp_v.append(spearman(np.array([v0[m] for m in noms]), tv_))
            sp_s0.append(spearman(np.array([s0.get(m, 0.0) for m in noms]), tv_))
            ndec += 1
    out = {"model": model_dir, "gtDecisions": ndec}
    for p in pols:
        a = np.array(reg[p])
        out[p] = {"meanRegret": round(float(a.mean()), 2) if a.size else None,
                  "se": round(float(a.std(ddof=1) / np.sqrt(a.size)), 2) if a.size > 1 else None,
                  "zeroRegret": round(float((a <= 1e-9).mean()), 3) if a.size else None,
                  "regretLe10": round(float((a <= 10).mean()), 3) if a.size else None}
    out["spearmanV0vsT"] = round(float(np.nanmean(sp_v)), 3) if sp_v else None
    out["spearmanS0vsT"] = round(float(np.nanmean(sp_s0)), 3) if sp_s0 else None
    # paires sur les MÊMES décisions. Règle G1 (§5 du protocole): N0a contre C1_reel,
    # N0b_proxy contre C1_proxy (les deux avec la finale « 3 éch. » simulée);
    # borne haute IC95 = moyenne + 1,96·se.
    for p, ref in (("N0a", "C1_reel"), ("N0b_proxy", "C1_reel"), ("V_finale", "C1_reel"), ("N0b_proxy", "C1_proxy")):
        diff = np.array(reg[p]) - np.array(reg[ref])
        if diff.size > 1:
            se = float(diff.std(ddof=1) / np.sqrt(diff.size))
            out[f"{p}_minus_{ref.replace('_', '')}"] = {"mean": round(float(diff.mean()), 2), "se": round(se, 2),
                                                        "upper95": round(float(diff.mean()) + 1.96 * se, 2)}
    ok = lambda k: k in out and out[k]["mean"] <= 5 and out[k]["upper95"] <= 10
    out["G1eligible"] = {"N0a": ok("N0a_minus_C1reel"), "N0b": ok("N0b_proxy_minus_C1proxy")}
    print(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
