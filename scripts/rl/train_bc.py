#!/usr/bin/env python3
"""Behavior cloning de l'IA Maison — phase 0 du pipeline RL.

Entraîne un MLP (obs → action parmi 5251) sur les tenseurs produits par
encode_dataset.cjs, sur MPS (GPU Apple) si disponible. Split train/val par
MATCH (pas par décision) pour éviter la fuite. Exporte les poids en binaire
brut + shapes.json pour l'inférence JS (scripts/rl/bot_net.cjs).

  python3 scripts/rl/train_bc.py --data local-observations/rl/ds-v1/tensors \
      --epochs 4 --batch 1024
"""
import argparse
import json
import time
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    ap.add_argument("--epochs", type=int, default=4)
    ap.add_argument("--batch", type=int, default=1024)
    ap.add_argument("--lr", type=float, default=3e-4)
    ap.add_argument("--hidden", type=int, default=1024)
    ap.add_argument("--out", default=None, help="dossier d'export (défaut: <data>/../model-bc)")
    args = ap.parse_args()

    data = Path(args.data)
    meta = json.loads((data / "meta.json").read_text())
    n, obs_dim, action_dim = meta["rows"], meta["obsDim"], meta["actionDim"]
    out_dir = Path(args.out) if args.out else data.parent / "model-bc"
    out_dir.mkdir(parents=True, exist_ok=True)

    feats = np.memmap(data / "features.f32", dtype=np.float32, mode="r", shape=(n, obs_dim))
    labels = np.memmap(data / "labels.u32", dtype=np.uint32, mode="r", shape=(n,))
    aux = np.memmap(data / "aux.f32", dtype=np.float32, mode="r", shape=(n, 4))

    val_mask = aux[:, 2] < meta["valPermil"]
    train_idx = np.flatnonzero(~val_mask)
    val_idx = np.flatnonzero(val_mask)
    print(f"{n} décisions — train {len(train_idx)}, val {len(val_idx)} (split par match)")

    device = "mps" if torch.backends.mps.is_available() else "cpu"
    print(f"device: {device}")
    torch.manual_seed(0)

    model = nn.Sequential(
        nn.Linear(obs_dim, args.hidden), nn.GELU(), nn.Dropout(0.1),
        nn.Linear(args.hidden, args.hidden), nn.GELU(),
        nn.Linear(args.hidden, action_dim),
    ).to(device)
    opt = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
    steps_per_epoch = (len(train_idx) + args.batch - 1) // args.batch
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=args.epochs * steps_per_epoch)
    loss_fn = nn.CrossEntropyLoss()
    rng = np.random.default_rng(0)

    def batches(idx, batch, shuffle):
        order = rng.permutation(idx) if shuffle else idx
        for i in range(0, len(order), batch):
            sel = np.sort(order[i:i + batch])  # tri → lecture memmap quasi séquentielle
            x = torch.from_numpy(np.ascontiguousarray(feats[sel]))
            y = torch.from_numpy(labels[sel].astype(np.int64))
            yield x.to(device), y.to(device)

    @torch.no_grad()
    def evaluate():
        model.eval()
        top1 = top3 = count = 0
        by_type = {0: [0, 0], 1: [0, 0], 2: [0, 0]}  # type → [ok, total]
        for x, y in batches(val_idx, 4096, shuffle=False):
            logits = model(x)
            pred3 = logits.topk(3, dim=1).indices
            hit1 = (pred3[:, 0] == y)
            top1 += int(hit1.sum())
            top3 += int((pred3 == y.unsqueeze(1)).any(dim=1).sum())
            count += len(y)
            types = torch.where(y == 0, 0, torch.where(y <= 210, 1, 2))
            for t in (0, 1, 2):
                m = types == t
                by_type[t][0] += int((hit1 & m).sum())
                by_type[t][1] += int(m.sum())
        model.train()
        named = {"pass": by_type[0], "move": by_type[1], "cast": by_type[2]}
        return top1 / count, top3 / count, {k: (v[0] / v[1] if v[1] else 0) for k, v in named.items()}

    best = 0.0
    for epoch in range(args.epochs):
        t0 = time.time()
        running, steps = 0.0, 0
        for x, y in batches(train_idx, args.batch, shuffle=True):
            opt.zero_grad(set_to_none=True)
            loss = loss_fn(model(x), y)
            loss.backward()
            opt.step()
            sched.step()
            running += float(loss.detach())
            steps += 1
            if steps % 50 == 0:
                print(f"  epoch {epoch} step {steps} loss {running / steps:.3f}", flush=True)
        top1, top3, by_type = evaluate()
        print(f"epoch {epoch}: loss {running / max(steps, 1):.3f} | val top1 {top1:.3f} top3 {top3:.3f} "
              f"| par type {json.dumps({k: round(v, 3) for k, v in by_type.items()})} "
              f"| {time.time() - t0:.0f}s", flush=True)
        if top1 > best:
            best = top1
            export(model, out_dir, meta, args, {"top1": top1, "top3": top3, "byType": by_type, "epoch": epoch})
            print(f"  → exporté dans {out_dir} (top1 {top1:.3f})", flush=True)


def export(model, out_dir, meta, args, metrics):
    layers = [m for m in model if isinstance(m, nn.Linear)]
    blobs, shapes = [], []
    for lin in layers:
        w = lin.weight.detach().cpu().numpy().astype(np.float32)
        b = lin.bias.detach().cpu().numpy().astype(np.float32)
        shapes.append({"out": w.shape[0], "in": w.shape[1]})
        blobs += [w.tobytes(), b.tobytes()]
    (out_dir / "weights.bin").write_bytes(b"".join(blobs))
    (out_dir / "shapes.json").write_text(json.dumps({
        "featureVersion": meta["featureVersion"],
        "obsDim": meta["obsDim"], "actionDim": meta["actionDim"],
        "hidden": args.hidden, "layers": shapes, "activation": "gelu",
        "metrics": metrics, "trainedOn": meta["rows"],
    }, indent=2))


if __name__ == "__main__":
    main()
