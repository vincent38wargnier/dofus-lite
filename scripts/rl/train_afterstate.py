#!/usr/bin/env python3
"""Loop 1 — réseau de valeur d'APRÈS-ÉTATS (distillation du verdict de C1).

Données: shards afterstate_gen.cjs (x.f16 + y/z/g/d/r/k/n/v). Entrée = obs V3 du
joueur AU TRAIT de l'après-état; cible = y (score C1 riposte+juge / 1000, même
perspective), éventuellement mélangée à l'issue z: t = λ·y + (1−λ)·z (λ=1:
distillation pure, convention nnue-pytorch « lambda »). Architecture INCHANGÉE
(value-v1 de train_value.py: port JS + ONNX déjà vérifiés) — une variable à la
fois: seules les données et la cible changent.

Split: par MATCH, flag v écrit à la génération (jamais par position: fuite).
Rapporte aussi le plancher de bruit des étiquettes (variance entre échantillons
k d'un même plan — une étiquette à 1 riposte est bruitée: MSE irréductible).

  python3 scripts/rl/train_afterstate.py --shards 'local-observations/rl/loop1/shards/*.meta.json' \
      --out local-observations/rl/loop1/model-a1-s7 --epochs 8 --seed 7 [--lam 1.0] [--init DIR]
"""
import argparse
import glob
import json
import math
import time
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F

import train_value as tv


def load(patterns, roles):
    shards = []
    for p in sorted(x for pat in patterns for x in glob.glob(pat)):
        meta = json.loads(Path(p).read_text())
        base = p[: -len(".meta.json")]
        n, D = meta["records"], meta["obsDim"]
        if n == 0:
            continue
        assert meta["kind"] == "afterstates-v1" and meta["featureVersion"] == 3 and meta["dtype"] == "f16", p
        cols = {k: np.fromfile(f"{base}.{k}.{t}", dtype=dt) for k, t, dt in
                (("y", "f32", np.float32), ("z", "i8", np.int8), ("g", "u32", np.uint32), ("d", "u32", np.uint32),
                 ("r", "u8", np.uint8), ("k", "u8", np.uint8), ("n", "u16", np.uint16), ("v", "u8", np.uint8))}
        x = np.memmap(base + ".x.f16", dtype=np.float16, mode="r", shape=(n, D))
        keep = np.isin(cols["r"], roles) & np.isfinite(cols["y"])
        shards.append({"base": base, "meta": meta, "x": x, **cols, "keep": keep})
    return shards


def gather(shards, sel):
    """sel = liste de (shard_idx, row_idx triés) → float32 [N, D]."""
    parts = []
    for si, rows in sel:
        if len(rows):
            parts.append(np.asarray(shards[si]["x"][rows], dtype=np.float32))
    return np.concatenate(parts) if parts else np.empty((0, tv.OBS_DIM), np.float32)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--shards", nargs="+", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--epochs", type=int, default=8)
    ap.add_argument("--bs", type=int, default=2048)
    ap.add_argument("--lr", type=float, default=1e-3)
    ap.add_argument("--wd", type=float, default=1e-5)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--lam", type=float, default=1.0, help="poids du verdict de recherche (1−λ sur l'issue z)")
    ap.add_argument("--roles", default="1,2,3")
    ap.add_argument("--init", default=None, help="MODEL_DIR value-v1 pour démarrage à chaud (ex. model-v5)")
    ap.add_argument("--max-train", type=int, default=0, help="sous-échantillon aléatoire du train (0 = tout)")
    ap.add_argument("--target", choices=["linear", "wdl"], default="linear",
                    help="linear: t = J/1000 (C1 natif); wdl: t = tanh(J/L) = 2·σ(J/s)−1 avec s AJUSTÉ sur les "
                         "issues (convention NNUE: score → probabilité de gain), L = s/2")
    ap.add_argument("--ch", type=int, default=32)
    ap.add_argument("--gdim", type=int, default=96)
    ap.add_argument("--depth", type=int, default=3, help="couches conv (3 = value-v1; > 3 = résiduelles en plus, value-v2)")
    ap.add_argument("--readout", choices=["mean", "fighters"], default="mean",
                    help="mean = value-v1; fighters = moyenne + max + case du joueur au trait + cases ennemies (value-v2)")
    ap.add_argument("--sib", type=float, default=0.0,
                    help="poids du terme FRÈRES (loop 1b): MSE des valeurs centrées par décision, "
                         "(V − moyenne des frères) contre (cible − moyenne des frères); lots = décisions "
                         "entières. 0 = entraînement d'origine, inchangé")
    args = ap.parse_args()
    if args.sib > 0 and args.max_train:
        ap.error("--sib exige des décisions entières: incompatible avec --max-train")

    torch.manual_seed(args.seed)
    rng = np.random.default_rng(args.seed)
    device = "mps" if torch.backends.mps.is_available() else "cpu"
    roles = [int(r) for r in args.roles.split(",")]
    shards = load(args.shards, roles)
    D = shards[0]["meta"]["obsDim"]
    tv.OBS_DIM = D
    tv.REST = D - tv.PLANE

    # Index globaux (shard, ligne) train / val
    tr, va = [], []
    for si, s in enumerate(shards):
        rows = np.flatnonzero(s["keep"])
        isv = s["v"][rows] == 1
        tr += [(si, r) for r in rows[~isv]]
        va += [(si, r) for r in rows[isv]]
    tr = np.array(tr, dtype=np.int64).reshape(-1, 2)
    va = np.array(va, dtype=np.int64).reshape(-1, 2)
    if args.max_train and len(tr) > args.max_train:
        tr = tr[np.sort(rng.choice(len(tr), args.max_train, replace=False))]

    # Groupes de FRÈRES = après-états d'une même décision (même shard, même d): ils
    # sont contigus dans tr/va (split par match, d monotone par shard).
    def decision_groups(idx):
        dk = np.empty(len(idx), np.int64)
        for si in np.unique(idx[:, 0]):
            m = idx[:, 0] == si
            dk[m] = shards[si]["d"][idx[m, 1]]
        cut = np.flatnonzero((np.diff(idx[:, 0]) != 0) | (np.diff(dk) != 0)) + 1
        starts = np.concatenate([[0], cut]).astype(np.int64)
        ends = np.concatenate([cut, [len(idx)]]).astype(np.int64)
        gid = np.repeat(np.arange(len(starts)), ends - starts)
        return starts, ends, gid

    def centered(a, gid):
        return a - (np.bincount(gid, weights=a) / np.bincount(gid))[gid]

    g_start, g_end, _ = decision_groups(tr)
    _, _, va_gid = decision_groups(va)

    # Échelle « WDL » (NNUE: scaling_factor dépend du moteur ET des données):
    # P(gain du joueur au trait | J) ≈ σ(J/s), J = y·1000, ajusté sur le TRAIN
    # (parties décidées), log-vraisemblance maximisée sur une grille.
    wdl_s = None
    if args.target == "wdl":
        Js, wins = [], []
        for si, s_ in enumerate(shards):
            m = s_["keep"] & (s_["v"] == 0) & (s_["z"] != 0)
            Js.append(s_["y"][m].astype(np.float64) * 1000.0); wins.append((s_["z"][m] > 0).astype(np.float64))
        J = np.concatenate(Js); W = np.concatenate(wins)
        if J.size > 200_000:
            pick = rng.choice(J.size, 200_000, replace=False); J, W = J[pick], W[pick]
        best_s, best_ll = None, None
        for s_try in np.geomspace(20, 5000, 200):
            pz = np.clip(1 / (1 + np.exp(-J / s_try)), 1e-6, 1 - 1e-6)
            ll = float(np.mean(W * np.log(pz) + (1 - W) * np.log(1 - pz)))
            if best_ll is None or ll > best_ll:
                best_s, best_ll = float(s_try), ll
        wdl_s = best_s
        print(json.dumps({"wdlScaleFit": round(wdl_s, 1), "logLik": round(best_ll, 4), "fitN": int(J.size),
                          "labelScaleL": round(wdl_s / 2, 1)}), flush=True)
    L = None if wdl_s is None else wdl_s / 2

    def tf(y):  # cible dans l'espace d'apprentissage
        return y if L is None else np.tanh(y * 1000.0 / L)

    def targets(idx):
        y = np.array([shards[si]["y"][r] for si, r in idx], dtype=np.float32)
        z = np.array([shards[si]["z"][r] for si, r in idx], dtype=np.float32)
        return args.lam * tf(y) + (1 - args.lam) * z, y

    def batches(idx, order):
        for k in range(0, len(order), args.bs):
            b = idx[np.sort(order[k:k + args.bs])]
            sel = [(si, b[b[:, 0] == si][:, 1]) for si in np.unique(b[:, 0])]
            # ordre de gather = ordre des shards → réaligner les cibles
            b2 = np.concatenate([np.stack([np.full(len(rows), si), rows], 1) for si, rows in sel])
            yield gather(shards, sel), b2

    def group_batches(order):
        """Lots de DÉCISIONS entières (≥ bs records, dernier lot plus petit), avec
        l'identifiant de groupe de chaque record, dans l'ordre de gather."""
        def make(gl):
            idx = np.concatenate([np.arange(g_start[g], g_end[g]) for g in gl])
            gid = np.repeat(np.arange(len(gl)), [g_end[g] - g_start[g] for g in gl])
            b = tr[idx]
            o = np.lexsort((b[:, 1], b[:, 0]))  # = ordre de gather (shard, puis ligne)
            b, gid = b[o], gid[o]
            sel = [(si, b[b[:, 0] == si][:, 1]) for si in np.unique(b[:, 0])]
            return gather(shards, sel), b, gid, len(gl)
        cur, n = [], 0
        for gi in order:
            cur.append(gi)
            n += g_end[gi] - g_start[gi]
            if n >= args.bs:
                yield make(cur)
                cur, n = [], 0
        if cur:
            yield make(cur)

    # Plancher de bruit (val): variance intra-(décision, nominé) des étiquettes
    # P/F (même plan, flux de dés différents) = MSE irréductible d'une étiquette
    # à 1 échantillon.
    def noise_floor():
        acc, cnt = 0.0, 0
        for s in shards:
            m = (s["v"] == 1) & np.isin(s["r"], [1, 2]) & np.isfinite(s["y"])
            if not m.any():
                continue
            key = s["d"][m].astype(np.int64) * 65536 + s["n"][m]
            yy = s["y"][m].astype(np.float64)
            order = np.argsort(key, kind="stable")
            key, yy = key[order], yy[order]
            bounds = np.flatnonzero(np.diff(key)) + 1
            for grp in np.split(yy, bounds):
                if grp.size >= 2:
                    acc += grp.var(ddof=1) * grp.size; cnt += grp.size
        return acc / cnt if cnt else float("nan")

    model = tv.ValueNet(ch=args.ch, gdim=args.gdim, depth=args.depth, readout=args.readout).to(device)
    arch = "value-v1" if args.depth == 3 and args.readout == "mean" else "value-v2"
    if args.init:
        ck = torch.load(Path(args.init) / "value.pt", map_location=device)
        model.load_state_dict(ck["model"])
    n_params = sum(p.numel() for p in model.parameters())
    steps_per_epoch = math.ceil(len(tr) / args.bs)
    opt = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=args.wd)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=args.lr, total_steps=max(1, steps_per_epoch * args.epochs),
                                                pct_start=0.05, anneal_strategy="cos")
    nf = noise_floor()
    print(json.dumps({"shards": len(shards), "train": int(len(tr)), "val": int(len(va)), "params": int(n_params),
                      "device": device, "lam": args.lam, "roles": roles, "init": args.init,
                      "labelNoiseVar": round(nf, 5), "seed": args.seed, "sib": args.sib,
                      "decisionsTrain": int(len(g_start))}), flush=True)

    vt, vy = targets(va)
    va_sorted = va  # déjà trié par (shard, ligne)

    def validate():
        model.eval()
        preds, ys, rs = [], [], []
        with torch.no_grad():
            for xb, b2 in batches(va_sorted, np.arange(len(va_sorted))):
                preds.append(model(torch.from_numpy(xb).to(device)).cpu().numpy())
                ys.append(np.array([shards[si]["y"][r] for si, r in b2], np.float32))
                rs.append(np.array([shards[si]["r"][r] for si, r in b2], np.uint8))
        model.train()
        p, y, r = np.concatenate(preds), tf(np.concatenate(ys)), np.concatenate(rs)
        mse = float(((p - y) ** 2).mean())
        r2 = 1 - mse / float(y.var())
        by_role = {int(k): round(float(((p[r == k] - y[r == k]) ** 2).mean()), 5) for k in np.unique(r)}
        # Part INTRA-décision (ce qui départage les frères): valeurs centrées par décision.
        pc, yc = centered(p.astype(np.float64), va_gid), centered(y.astype(np.float64), va_gid)
        ctr = float(((pc - yc) ** 2).mean())
        return {"valMseY": round(mse, 5), "valR2": round(r2, 4), "excessOverNoise": round(mse - nf, 5), "mseByRole": by_role,
                "valCtrMse": round(ctr, 5), "valCtrR2": round(1 - ctr / float(yc.var()), 4)}

    t0 = time.time()
    best, best_state = None, None
    # Sélection de l'époque: MSE de validation; avec --sib, MSE + sib × MSE centrée
    # (le même critère que la perte d'entraînement).
    crit = (lambda m: m["valMseY"]) if args.sib <= 0 else (lambda m: m["valMseY"] + args.sib * m["valCtrMse"])
    for epoch in range(args.epochs):
        tot, nb = 0.0, 0
        if args.sib <= 0:
            order = rng.permutation(len(tr))
            for xb, b2 in batches(tr, order):
                t, _ = targets(b2)
                loss = F.mse_loss(model(torch.from_numpy(xb).to(device)), torch.from_numpy(t).to(device))
                opt.zero_grad(set_to_none=True)
                loss.backward()
                opt.step()
                sched.step()
                tot += loss.item(); nb += 1
        else:
            for xb, b2, gid, G in group_batches(rng.permutation(len(g_start))):
                t, _ = targets(b2)
                p = model(torch.from_numpy(xb).to(device))
                tt = torch.from_numpy(t).to(device)
                g = torch.from_numpy(gid).to(device)
                cnt = torch.zeros(G, device=device).index_add_(0, g, torch.ones_like(p))
                pc = p - (torch.zeros(G, device=device).index_add_(0, g, p) / cnt)[g]
                tc = tt - (torch.zeros(G, device=device).index_add_(0, g, tt) / cnt)[g]
                loss = F.mse_loss(p, tt) + args.sib * F.mse_loss(pc, tc)
                opt.zero_grad(set_to_none=True)
                loss.backward()
                opt.step()
                sched.step()
                tot += loss.item(); nb += 1
        m = validate()
        print(json.dumps({"epoch": epoch, ("trainMse" if args.sib <= 0 else "trainLoss"): round(tot / nb, 5), **m, "min": round((time.time() - t0) / 60, 1)}), flush=True)
        if best is None or crit(m) < crit(best):
            best = {**m, "epoch": epoch}
            best_state = {k: v.detach().cpu().clone() for k, v in model.state_dict().items()}

    model.load_state_dict(best_state)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    torch.save({"model": model.state_dict()}, out / "value.pt")
    layers = [
        {"name": "conv1", "type": "conv", "shape": [model.ch, tv.N_PLANES, 3, 3]},
        {"name": "conv2", "type": "conv", "shape": [model.ch, model.ch, 3, 3]},
        {"name": "conv3", "type": "conv", "shape": [model.ch, model.ch, 3, 3]},
        *({"name": f"extra.{i}", "type": "conv-residual", "shape": [model.ch, model.ch, 3, 3]} for i in range(len(model.extra))),
        {"name": "g1", "type": "linear", "shape": [128, tv.REST]},
        {"name": "g2", "type": "linear", "shape": [model.gdim, 128]},
        {"name": "h1", "type": "linear", "shape": [128, model.h1.in_features]},
        {"name": "h2", "type": "linear", "shape": [1, 128]},
    ]
    sd = model.state_dict()
    blobs = []
    for spec in layers:
        blobs.append(sd[spec["name"] + ".weight"].cpu().numpy().astype(np.float32).ravel())
        blobs.append(sd[spec["name"] + ".bias"].cpu().numpy().astype(np.float32).ravel())
    np.concatenate(blobs).tofile(out / "weights.bin")
    (out / "shapes.json").write_text(json.dumps({
        "arch": arch, "featureVersion": 3, "obsDim": D, "planes": {"n": tv.N_PLANES, "h": tv.H, "w": tv.W},
        "ch": model.ch, "gdim": model.gdim, "depth": model.depth, "readout": model.readout, "layers": layers, "params": int(n_params),
        "kind": "afterstate", "perspective": "joueur au trait de l'après-état",
        "targetKind": "linear" if L is None else "tanh", "labelScale": 1000.0 if L is None else L, "wdlScale": wdl_s,
        "target": "C1 depth2Score h=1 / 1000 (riposte maison + juge main)", "lam": args.lam, "init": args.init,
        "seed": args.seed, "epochs": args.epochs, "bestEpoch": best["epoch"], "val": best,
        "labelNoiseVar": nf, "sib": args.sib, "shards": [s["base"] for s in shards], "train": int(len(tr)), "valN": int(len(va)),
    }))
    pk = va_sorted[np.sort(rng.choice(len(va_sorted), min(8, len(va_sorted)), replace=False))]
    sel = [(si, pk[pk[:, 0] == si][:, 1]) for si in np.unique(pk[:, 0])]
    pobs = gather(shards, sel)
    pobs.tofile(out / "parity_obs.bin")
    model.eval()
    with torch.no_grad():
        pv = model(torch.from_numpy(pobs).to(device)).cpu().numpy()
    (out / "parity_v.json").write_text(json.dumps([float(v) for v in pv]))
    print(json.dumps({"export": str(out), "best": best, "min": round((time.time() - t0) / 60, 1)}), flush=True)


if __name__ == "__main__":
    main()
