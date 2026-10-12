#!/usr/bin/env python3
"""BC v2 — réseau SPATIAL (style AlphaZero): tronc conv sur les 7 planes du
plateau, têtes d'action PAR CASE (1 logit MOVE + 24 logits CAST par case),
PASS depuis le vecteur global. Mêmes tenseurs et même layout d'actions que
v1 (PASS, 1+cell, 211+slot*210+cell). Export: weights.bin + shapes.json
(arch "spatial-v2") pour le forward JS de bot_net.cjs.

  python3 scripts/rl/train_bc2.py --data local-observations/rl/ds-v1/tensors \
      --epochs 24 --batch 1024
"""
import argparse
import json
import time
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn

N_PLANES, H, W = 7, 14, 15
CELLS = H * W
SPELL_SLOTS = 24
PLANE_DIM = N_PLANES * CELLS


class SpatialNet(nn.Module):
    def __init__(self, obs_dim, ch=64, gdim=256):
        super().__init__()
        rest = obs_dim - PLANE_DIM
        self.conv1 = nn.Conv2d(N_PLANES, ch, 3, padding=1)
        self.conv2 = nn.Conv2d(ch, ch, 3, padding=1)
        self.conv3 = nn.Conv2d(ch, ch, 3, padding=1)
        self.g1 = nn.Linear(rest, 512)
        self.g2 = nn.Linear(512, gdim)
        self.fuse = nn.Conv2d(ch + gdim, 128, 1)
        self.move_head = nn.Conv2d(128, 1, 1)
        self.cast_head = nn.Conv2d(128, SPELL_SLOTS, 1)
        self.pass_head = nn.Linear(gdim + ch, 1)
        self.act = nn.GELU()

    def forward(self, x):
        b = x.shape[0]
        planes = x[:, :PLANE_DIM].view(b, N_PLANES, H, W)
        rest = x[:, PLANE_DIM:]
        t = self.act(self.conv1(planes))
        t = self.act(self.conv2(t))
        t = self.act(self.conv3(t))
        g = self.act(self.g2(self.act(self.g1(rest))))
        gmap = g.unsqueeze(-1).unsqueeze(-1).expand(-1, -1, H, W)
        f = self.act(self.fuse(torch.cat([t, gmap], dim=1)))
        move = self.move_head(f).view(b, CELLS)
        cast = self.cast_head(f).view(b, SPELL_SLOTS * CELLS)
        pooled = t.mean(dim=(2, 3))
        pas = self.pass_head(torch.cat([g, pooled], dim=1))
        return torch.cat([pas, move, cast], dim=1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    ap.add_argument("--epochs", type=int, default=24)
    ap.add_argument("--batch", type=int, default=1024)
    ap.add_argument("--lr", type=float, default=1e-3)
    ap.add_argument("--ch", type=int, default=64)
    ap.add_argument("--out", default=None)
    args = ap.parse_args()

    data = Path(args.data)
    meta = json.loads((data / "meta.json").read_text())
    n, obs_dim, action_dim = meta["rows"], meta["obsDim"], meta["actionDim"]
    assert action_dim == 1 + CELLS + SPELL_SLOTS * CELLS
    out_dir = Path(args.out) if args.out else data.parent / "model-bc2"
    out_dir.mkdir(parents=True, exist_ok=True)

    feats = np.memmap(data / "features.f32", dtype=np.float32, mode="r", shape=(n, obs_dim))
    labels = np.memmap(data / "labels.u32", dtype=np.uint32, mode="r", shape=(n,))
    aux = np.memmap(data / "aux.f32", dtype=np.float32, mode="r", shape=(n, 4))
    val_mask = aux[:, 2] < meta["valPermil"]
    train_idx = np.flatnonzero(~val_mask)
    val_idx = np.flatnonzero(val_mask)
    print(f"{n} décisions — train {len(train_idx)}, val {len(val_idx)}")

    device = "mps" if torch.backends.mps.is_available() else "cpu"
    print(f"device: {device}")
    torch.manual_seed(0)
    model = SpatialNet(obs_dim, ch=args.ch).to(device)
    print(f"paramètres: {sum(p.numel() for p in model.parameters()):,}")
    opt = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
    steps_per_epoch = (len(train_idx) + args.batch - 1) // args.batch
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=args.epochs * steps_per_epoch)
    loss_fn = nn.CrossEntropyLoss()
    rng = np.random.default_rng(0)

    def batches(idx, batch, shuffle):
        order = rng.permutation(idx) if shuffle else idx
        for i in range(0, len(order), batch):
            sel = np.sort(order[i:i + batch])
            x = torch.from_numpy(np.ascontiguousarray(feats[sel]))
            y = torch.from_numpy(labels[sel].astype(np.int64))
            yield x.to(device), y.to(device)

    @torch.no_grad()
    def evaluate():
        model.eval()
        top1 = top3 = count = 0
        by_type = {0: [0, 0], 1: [0, 0], 2: [0, 0]}
        for x, y in batches(val_idx, 4096, shuffle=False):
            logits = model(x)
            pred3 = logits.topk(3, dim=1).indices
            hit1 = (pred3[:, 0] == y)
            top1 += int(hit1.sum())
            top3 += int((pred3 == y.unsqueeze(1)).any(dim=1).sum())
            count += len(y)
            types = torch.where(y == 0, 0, torch.where(y <= CELLS, 1, 2))
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
            if steps % 100 == 0:
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
    order = ["conv1", "conv2", "conv3", "g1", "g2", "fuse", "move_head", "cast_head", "pass_head"]
    blobs, layers = [], []
    mods = dict(model.named_modules())
    for name in order:
        m = mods[name]
        w = m.weight.detach().cpu().numpy().astype(np.float32)
        b = m.bias.detach().cpu().numpy().astype(np.float32)
        layers.append({"name": name, "type": "conv" if isinstance(m, nn.Conv2d) else "linear",
                       "shape": list(w.shape)})
        blobs += [w.tobytes(), b.tobytes()]
    (out_dir / "weights.bin").write_bytes(b"".join(blobs))
    (out_dir / "shapes.json").write_text(json.dumps({
        "arch": "spatial-v2",
        "featureVersion": meta["featureVersion"],
        "obsDim": meta["obsDim"], "actionDim": meta["actionDim"],
        "planes": {"n": N_PLANES, "h": H, "w": W}, "spellSlots": SPELL_SLOTS,
        "ch": args.ch, "layers": layers, "metrics": metrics, "trainedOn": meta["rows"],
    }, indent=2))


if __name__ == "__main__":
    main()
