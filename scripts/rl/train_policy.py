#!/usr/bin/env python3
# Réseau de POLITIQUE (clone du PROF) pour le calculateur miroir-CRA.
# Imitation: entrée = obs V3 (vue du joueur au trait), cible = index plat de
# l'action CHOISIE par le prof (calculateur). Même tronc que ValueNet; tête
# plate ACTION_DIM logits. Export weights.bin/shapes.json (arch policy-v1)
# lisible par scripts/rl/policy_net.cjs + lot de parité.
#
#   python3 scripts/rl/train_policy.py --data DIR --out DIR_MODEL
import argparse
import json
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

N_PLANES, H, W = 7, 14, 15
PLANE = N_PLANES * H * W
REST = None
ACTION_DIM = None


class PolicyNet(nn.Module):
    def __init__(self, action_dim, ch=32, gdim=96):
        super().__init__()
        self.ch, self.gdim = ch, gdim
        self.conv1 = nn.Conv2d(N_PLANES, ch, 3, padding=1)
        self.conv2 = nn.Conv2d(ch, ch, 3, padding=1)
        self.conv3 = nn.Conv2d(ch, ch, 3, padding=1)
        self.g1 = nn.Linear(REST, 128)
        self.g2 = nn.Linear(128, gdim)
        self.h1 = nn.Linear(ch + gdim, 128)
        self.h2 = nn.Linear(128, action_dim)

    def forward(self, x):
        p = x[:, :PLANE].view(-1, N_PLANES, H, W)
        r = x[:, PLANE:]
        h = F.gelu(self.conv1(p))
        h = F.gelu(self.conv2(h))
        h = F.gelu(self.conv3(h))
        pooled = h.mean(dim=(2, 3))
        g = F.gelu(self.g2(F.gelu(self.g1(r))))
        v = F.gelu(self.h1(torch.cat([pooled, g], 1)))
        return self.h2(v)  # logits


SPELL_SLOTS = 24


class SpatialPolicyNet(nn.Module):
    """Têtes PAR CASE (style spatial-v2 / AlphaZero). La tête plate de PolicyNet
    écrase le plateau en 32 moyennes avant de choisir parmi 5251 actions: elle
    ne peut pas savoir OÙ viser (clone 0/32: flèches à côté de l'ennemi). Ici
    chaque case reçoit son logit MOVE et ses 24 logits CAST depuis SES features
    (tronc conv + contexte global diffusé + coordonnées), PASS depuis le global.
    Même layout d'actions: 0 PASS, 1+cell MOVE, 211+slot*210+cell CAST."""

    def __init__(self, action_dim, ch=48, gdim=128, fdim=96):
        super().__init__()
        assert action_dim == 1 + H * W + SPELL_SLOTS * H * W
        self.ch, self.gdim, self.fdim = ch, gdim, fdim
        ys, xs = torch.meshgrid(torch.arange(H) / (H - 1), torch.arange(W) / (W - 1), indexing="ij")
        self.register_buffer("coords", torch.stack([xs, ys]).float().unsqueeze(0))  # 1×2×H×W
        self.conv1 = nn.Conv2d(N_PLANES + 2, ch, 3, padding=1)
        self.conv2 = nn.Conv2d(ch, ch, 3, padding=1)
        self.conv3 = nn.Conv2d(ch, ch, 3, padding=1)
        self.conv4 = nn.Conv2d(ch, ch, 3, padding=1)
        self.g1 = nn.Linear(REST, 256)
        self.g2 = nn.Linear(256, gdim)
        self.fuse1 = nn.Conv2d(ch + gdim + 2, fdim, 1)
        self.fuse2 = nn.Conv2d(fdim, fdim, 1)
        self.move_head = nn.Conv2d(fdim, 1, 1)
        self.cast_head = nn.Conv2d(fdim, SPELL_SLOTS, 1)
        self.pass_head = nn.Linear(gdim + ch, 1)

    def forward(self, x):
        b = x.shape[0]
        coords = self.coords.expand(b, -1, -1, -1)
        p = torch.cat([x[:, :PLANE].view(b, N_PLANES, H, W), coords], 1)
        r = x[:, PLANE:]
        h = F.gelu(self.conv1(p))
        h = F.gelu(self.conv2(h))
        h = F.gelu(self.conv3(h))
        h = F.gelu(self.conv4(h))
        g = F.gelu(self.g2(F.gelu(self.g1(r))))
        gmap = g.view(b, -1, 1, 1).expand(-1, -1, H, W)
        f = F.gelu(self.fuse1(torch.cat([h, gmap, coords], 1)))
        f = F.gelu(self.fuse2(f))
        move = self.move_head(f).view(b, H * W)
        cast = self.cast_head(f).view(b, SPELL_SLOTS * H * W)
        pas = self.pass_head(torch.cat([g, h.mean(dim=(2, 3))], 1))
        return torch.cat([pas, move, cast], 1)


def main():
    global REST, ACTION_DIM
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default="local-observations/rl/value-cra3/policy-d1")
    ap.add_argument("--out", default="local-observations/rl/value-cra3/policy-model")
    ap.add_argument("--epochs", type=int, default=30)
    ap.add_argument("--bs", type=int, default=512)
    ap.add_argument("--lr", type=float, default=7e-4)
    ap.add_argument("--arch", default="flat", choices=["flat", "spatial"])
    ap.add_argument("--cosine", action="store_true")  # LR cosinus → 0 sur tout l'entraînement (par pas)
    ap.add_argument("--frac", type=float, default=1.0)  # sous-échantillon train par blocs de 32 lignes (~1 match)
    ap.add_argument("--seed", type=int, default=7)  # 7 = runs historiques (init torch + ordre des batchs)
    # Instantanés à epoch fixe (out/epN/): la précision val NE prédit PAS la force en jeu
    # (e60: top-1 50.5% mais 52/128 vs 77/128 pour e30) → on choisit par PARTIES, pas par top-1.
    ap.add_argument("--save-every", type=int, default=0)
    # Niveaux à parts égales par epoch (tirage pondéré 1/effectif du niveau, avec remise):
    # d12 (tout le neuf en l100) → l100 +21 pts mais l200 en baisse.
    ap.add_argument("--balance-levels", action="store_true")
    # Cibles SOUPLES: imiter tout le classement du prof (softmax(score/T) sur ses
    # candidats) en plus de son choix. Lignes sans classement: CE dure seule.
    ap.add_argument("--soft-temp", type=float, default=0.0)  # 0 = désactivé
    ap.add_argument("--soft-weight", type=float, default=1.0)
    args = ap.parse_args()

    data = Path(args.data)
    meta = json.loads((data / "meta.json").read_text())
    n, obs_dim = meta["rows"], meta["obsDim"]
    ACTION_DIM = meta["actionDim"]
    REST = obs_dim - PLANE
    fv = int(meta.get("featureVersion", 3))

    obs = np.memmap(data / "obs.f32", dtype=np.float32, mode="r", shape=(n, obs_dim))
    lab = np.fromfile(data / "lab.i32", dtype=np.int32)
    vflags = np.fromfile(data / "v.u8", dtype=np.uint8).astype(bool)
    assert lab.size == n and vflags.size == n, f"désalign: lab {lab.size} v {vflags.size} vs {n}"

    train_idx = np.flatnonzero(~vflags)
    val_idx = np.flatnonzero(vflags)
    if args.frac < 1.0:
        blocks = train_idx[: len(train_idx) // 32 * 32].reshape(-1, 32)
        keep = np.random.default_rng(11).permutation(len(blocks))[: max(1, int(len(blocks) * args.frac))]
        train_idx = np.sort(blocks[keep].ravel())
    soft = args.soft_temp > 0
    if soft:
        K = int(meta.get("kCand", 32))
        cand_lab = np.fromfile(data / "cand_lab.i32", dtype=np.int32).reshape(n, K)
        cand_s = np.fromfile(data / "cand_s.f32", dtype=np.float32).reshape(n, K)
        n_soft = int((cand_lab[train_idx, 0] >= 0).sum())
        print(f"cibles souples: T={args.soft_temp} poids={args.soft_weight} | lignes train classées {n_soft}/{len(train_idx)}")
    sample_p = None
    if args.balance_levels:
        lkf = np.fromfile(data / "lk.u8", dtype=np.uint8)
        assert lkf.size == n, f"lk.u8 {lkf.size} vs {n}"
        tr_lk = lkf[train_idx]
        counts = np.bincount(tr_lk)
        sample_p = 1.0 / counts[tr_lk]
        sample_p /= sample_p.sum()
        print(f"équilibrage niveaux: effectifs train par code {counts.tolist()}")
    device = "mps" if torch.backends.mps.is_available() else "cpu"
    torch.manual_seed(args.seed)
    print(f"total {n} | train {len(train_idx)} | val {len(val_idx)} | actionDim {ACTION_DIM} | fv {fv}")

    out = Path(args.out); out.mkdir(parents=True, exist_ok=True)
    model = (SpatialPolicyNet(ACTION_DIM) if args.arch == "spatial" else PolicyNet(ACTION_DIM)).to(device)
    n_params = sum(p.numel() for p in model.parameters())
    print(f"{type(model).__name__} {n_params} paramètres, device={device}")
    opt = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-5)
    steps_per_epoch = (len(train_idx) + args.bs - 1) // args.bs
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=args.epochs * steps_per_epoch) if args.cosine else None

    val_obs = torch.from_numpy(np.ascontiguousarray(obs[val_idx]))
    val_lab = torch.from_numpy(lab[val_idx].astype(np.int64))

    CELLS = H * W
    vtype = torch.where(val_lab == 0, 0, torch.where(val_lab <= CELLS, 1, 2))
    last_detail = {}

    def validate():
        model.eval()
        tops = []
        with torch.no_grad():
            for k in range(0, len(val_idx), 8192):
                xb = val_obs[k:k + 8192].to(device)
                tops.append(model(xb).topk(5, dim=1).indices.cpu())
        t5 = torch.cat(tops)
        hit1 = t5[:, 0] == val_lab
        top1 = hit1.float().mean().item()
        last_detail.clear()
        last_detail["top5"] = round((t5 == val_lab.unsqueeze(1)).any(1).float().mean().item(), 4)
        for name, t in (("pass", 0), ("move", 1), ("cast", 2)):
            m = vtype == t
            last_detail[name] = round(hit1[m].float().mean().item(), 4) if m.any() else None
        model.train()
        return top1

    rng = np.random.default_rng(args.seed)
    best = -1.0
    best_state = None
    best_epoch = -1
    for epoch in range(args.epochs):
        order = rng.choice(train_idx, size=len(train_idx), replace=True, p=sample_p) if sample_p is not None else rng.permutation(train_idx)
        tot, steps = 0.0, 0
        for k in range(0, len(order), args.bs):
            idx = np.sort(order[k:k + args.bs])
            xb = torch.from_numpy(np.ascontiguousarray(obs[idx])).to(device)
            yb = torch.from_numpy(lab[idx].astype(np.int64)).to(device)
            logits = model(xb)
            loss = F.cross_entropy(logits, yb)
            if soft:
                cl = torch.from_numpy(cand_lab[idx].astype(np.int64)).to(device)
                has = cl[:, 0] >= 0
                if bool(has.any()):
                    cl_h = cl[has]
                    mask = cl_h >= 0
                    z = (torch.from_numpy(cand_s[idx]).to(device)[has] / args.soft_temp).masked_fill(~mask, float("-inf"))
                    target = torch.softmax(z, dim=1)
                    lp = F.log_softmax(logits[has], dim=1).gather(1, cl_h.clamp(min=0))
                    soft_ce = -(target * lp).masked_fill(~mask, 0.0).sum(1).mean()
                    loss = loss + args.soft_weight * soft_ce
            opt.zero_grad(set_to_none=True)
            loss.backward()
            opt.step()
            if sched is not None:
                sched.step()
            tot += loss.item(); steps += 1
        top1 = validate()
        tag = ""
        if top1 > best:
            best = top1
            best_epoch = epoch
            best_state = {k: v.detach().cpu().clone() for k, v in model.state_dict().items()}
            tag = " *best"
        print(json.dumps({"epoch": epoch, "trainCE": round(tot / steps, 4), "valTop1": round(top1, 4), **last_detail}) + tag, flush=True)
        if args.save_every and ((epoch + 1) % args.save_every == 0 or epoch + 1 == args.epochs):
            export_to(out / f"ep{epoch + 1}", model, args, fv, obs_dim, n_params, top1, len(train_idx), val_idx, obs, device, epoch)

    if best_state is not None:  # exporte le MEILLEUR epoch (top-1 val), pas le dernier
        model.load_state_dict(best_state)
    plogits = export_to(out, model, args, fv, obs_dim, n_params, best, len(train_idx), val_idx, obs, device, best_epoch)
    print(json.dumps({"export": str(out), "params": int(n_params), "bestTop1": round(best, 4), "bestEpoch": best_epoch,
                      "argmax": [int(x) for x in plogits.argmax(1)]}))


def export_to(out, model, args, fv, obs_dim, n_params, best, n_train, val_idx, obs, device, epoch):
    """Écrit policy.pt, weights.bin, shapes.json + lots de parité (parity_obs.bin,
    parity_v.json, parity_full.f32 = 5251 logits). RNG DÉDIÉ pour les échantillons
    de parité: un instantané en cours d'entraînement ne perturbe pas l'ordre des batchs."""
    out = Path(out); out.mkdir(parents=True, exist_ok=True)
    was_training = model.training
    model.eval()
    torch.save({"model": model.state_dict(), "arch": args.arch, "epoch": epoch, "seed": args.seed}, out / "policy.pt")
    if args.arch == "spatial":
        c, gd, fd = model.ch, model.gdim, model.fdim
        layers = [
            {"name": "conv1", "type": "conv", "shape": [c, N_PLANES + 2, 3, 3]},
            {"name": "conv2", "type": "conv", "shape": [c, c, 3, 3]},
            {"name": "conv3", "type": "conv", "shape": [c, c, 3, 3]},
            {"name": "conv4", "type": "conv", "shape": [c, c, 3, 3]},
            {"name": "g1", "type": "linear", "shape": [256, REST]},
            {"name": "g2", "type": "linear", "shape": [gd, 256]},
            {"name": "fuse1", "type": "conv", "shape": [fd, c + gd + 2, 1, 1]},
            {"name": "fuse2", "type": "conv", "shape": [fd, fd, 1, 1]},
            {"name": "move_head", "type": "conv", "shape": [1, fd, 1, 1]},
            {"name": "cast_head", "type": "conv", "shape": [SPELL_SLOTS, fd, 1, 1]},
            {"name": "pass_head", "type": "linear", "shape": [1, gd + c]},
        ]
    else:
        layers = [
            {"name": "conv1", "type": "conv", "shape": [model.ch, N_PLANES, 3, 3]},
            {"name": "conv2", "type": "conv", "shape": [model.ch, model.ch, 3, 3]},
            {"name": "conv3", "type": "conv", "shape": [model.ch, model.ch, 3, 3]},
            {"name": "g1", "type": "linear", "shape": [128, REST]},
            {"name": "g2", "type": "linear", "shape": [model.gdim, 128]},
            {"name": "h1", "type": "linear", "shape": [128, model.ch + model.gdim]},
            {"name": "h2", "type": "linear", "shape": [ACTION_DIM, 128]},
        ]
    blobs = []
    sd = model.state_dict()
    for spec in layers:
        blobs.append(sd[spec["name"] + ".weight"].cpu().numpy().astype(np.float32).ravel())
        blobs.append(sd[spec["name"] + ".bias"].cpu().numpy().astype(np.float32).ravel())
    np.concatenate(blobs).tofile(out / "weights.bin")
    (out / "shapes.json").write_text(json.dumps({
        "arch": "policy-spatial-v1" if args.arch == "spatial" else "policy-v1",
        "featureVersion": fv, "obsDim": obs_dim, "actionDim": ACTION_DIM,
        "planes": {"n": N_PLANES, "h": H, "w": W}, "ch": model.ch, "gdim": model.gdim,
        **({"fdim": model.fdim, "coords": True, "spellSlots": SPELL_SLOTS} if args.arch == "spatial" else {}),
        "layers": layers, "params": int(n_params), "bestTop1": round(best, 4), "trainRows": int(n_train),
        "epoch": epoch, "seed": args.seed, "cosine": bool(args.cosine), "data": str(args.data),
    }))
    pk = np.sort(val_idx[np.random.default_rng(123).permutation(len(val_idx))[:8]])
    pobs = np.ascontiguousarray(obs[pk])
    pobs.tofile(out / "parity_obs.bin")
    with torch.no_grad():
        plogits = model(torch.from_numpy(pobs).to(device)).cpu().numpy().astype(np.float32)
    plogits.tofile(out / "parity_full.f32")
    (out / "parity_v.json").write_text(json.dumps({
        "argmax": [int(x) for x in plogits.argmax(1)],
        "head": [[round(float(v), 5) for v in row[:8]] for row in plogits],
    }))
    if was_training:
        model.train()
    return plogits


if __name__ == "__main__":
    main()
