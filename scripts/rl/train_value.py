#!/usr/bin/env python3
# Réseau de VALEUR (siège TD-Gammon) pour le calculateur miroir-CRA.
# Entrée: obs encoder.cjs (vue du joueur au trait), cible: z = ±1/0 (issue du
# match pour ce joueur). Split par MATCH (pas par position — sinon fuite).
# Export: weights.bin/shapes.json lisibles par scripts/rl/value_net.cjs
# (couches concaténées poids-puis-biais, layout torch row-major) + lot de
# parité (obs aléatoires de val + sorties attendues) pour verrouiller le port JS.
import argparse
import json
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

OBS_DIM = None  # lu depuis les metas des shards (v1: 4082, v2: 5126)
FEATURE_VERSION = None  # lu depuis les metas — JAMAIS codé en dur (audit F10:
# un modèle V1 exporté « featureVersion: 2 » ferait choisir le mauvais encodeur
# à useValueModel alors que les dimensions coïncident par accident ailleurs)
N_PLANES, H, W = 7, 14, 15
PLANE = N_PLANES * H * W
REST = None  # calculé dans load_shards une fois obsDim connu


class ValueNet(nn.Module):
    def __init__(self, ch=32, gdim=96):
        super().__init__()
        self.ch, self.gdim = ch, gdim
        self.conv1 = nn.Conv2d(N_PLANES, ch, 3, padding=1)
        self.conv2 = nn.Conv2d(ch, ch, 3, padding=1)
        self.conv3 = nn.Conv2d(ch, ch, 3, padding=1)
        self.g1 = nn.Linear(globals()['REST'], 128)
        self.g2 = nn.Linear(128, gdim)
        self.h1 = nn.Linear(ch + gdim, 128)
        self.h2 = nn.Linear(128, 1)

    def forward(self, x):
        p = x[:, :PLANE].view(-1, N_PLANES, H, W)
        r = x[:, PLANE:]
        h = F.gelu(self.conv1(p))
        h = F.gelu(self.conv2(h))
        h = F.gelu(self.conv3(h))
        pooled = h.mean(dim=(2, 3))
        g = F.gelu(self.g2(F.gelu(self.g1(r))))
        v = F.gelu(self.h1(torch.cat([pooled, g], 1)))
        return torch.tanh(self.h2(v)).squeeze(-1)


def load_shards(shard_dir):
    global OBS_DIM, FEATURE_VERSION
    metas = sorted(Path(shard_dir).glob("*.meta.json"))
    obs_list, z_list, m_list, step_list, val_list = [], [], [], [], []
    mat_offset = 0
    for meta_path in metas:
        meta = json.loads(meta_path.read_text())
        base = str(meta_path)[: -len(".meta.json")]
        n = meta["records"]
        fv = int(meta.get("featureVersion", 1))
        if OBS_DIM is None:
            OBS_DIM = int(meta["obsDim"])
            FEATURE_VERSION = fv
            globals()["REST"] = OBS_DIM - PLANE
        assert meta["obsDim"] == OBS_DIM, f"obsDim mixte: {meta['obsDim']} vs {OBS_DIM}"
        assert fv == FEATURE_VERSION, f"featureVersion mixte: {fv} vs {FEATURE_VERSION}"
        obs = np.memmap(base + ".obs.f32", dtype=np.float32, mode="r", shape=(n, OBS_DIM))
        z = np.fromfile(base + ".z.f32", dtype=np.float32)
        m_raw = np.fromfile(base + ".m.u32", dtype=np.uint32).astype(np.int64)
        # Split STABLE (audit F11): flag écrit à la GÉNÉRATION (.v.u8, dérivé
        # de l'uid immuable du match) quand présent. Fallback legacy: m%17 sur
        # l'id BRUT du shard — jamais sur l'id décalé, dont la valeur dépendait
        # de l'ordre des shards (la frontière train/val bougeait en réordonnant).
        vpath = Path(base + ".v.u8")
        if vpath.exists():
            vflags = np.fromfile(vpath, dtype=np.uint8).astype(bool)
            assert vflags.size == n, f"v.u8 désaligné: {vflags.size} vs {n}"
        else:
            vflags = (m_raw % 17) == 0
        val_list.append(vflags)
        m = m_raw + mat_offset
        mat_offset = int(m.max()) + 1
        # index du pas dans son match (phase de partie), vectorisé
        step = np.zeros(n, dtype=np.int32)
        boundaries = np.flatnonzero(np.diff(m)) + 1
        starts = np.concatenate([[0], boundaries])
        lengths = np.diff(np.concatenate([starts, [n]]))
        for s, L in zip(starts, lengths):
            step[s:s + L] = np.arange(L)
            step[s:s + L] = (step[s:s + L] * 3) // max(1, L)  # bucket 0/1/2
        obs_list.append(obs); z_list.append(z); m_list.append(m); step_list.append(step)
        print(f"shard {base}: {n} records, {meta['matches']} matchs, mode={meta['mode']}, val={int(vflags.sum())}")
    return (obs_list, np.concatenate(z_list), np.concatenate(m_list),
            np.concatenate(step_list), np.concatenate(val_list))


def gather(obs_list, sizes, idx):
    out = np.empty((len(idx), OBS_DIM), dtype=np.float32)
    bounds = np.cumsum([0] + sizes)
    for k, ob in enumerate(obs_list):
        mask = (idx >= bounds[k]) & (idx < bounds[k + 1])
        if mask.any():
            out[mask] = ob[idx[mask] - bounds[k]]
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--shards", default="local-observations/rl/value-cra1/shards")
    ap.add_argument("--out", default="local-observations/rl/value-cra1/model")
    ap.add_argument("--epochs", type=int, default=4)
    ap.add_argument("--bs", type=int, default=2048)
    ap.add_argument("--lr", type=float, default=3e-4)
    args = ap.parse_args()

    device = "mps" if torch.backends.mps.is_available() else "cpu"
    torch.manual_seed(7)  # init reproductible (audit F12: le shuffle était seedé, pas l'init)
    obs_list, z, m, step, val_mask = load_shards(args.shards)
    sizes = [o.shape[0] for o in obs_list]
    n = int(sum(sizes))
    train_idx = np.flatnonzero(~val_mask)
    val_idx = np.flatnonzero(val_mask)
    print(f"total {n} positions | train {len(train_idx)} | val {len(val_idx)} (par match) | z moyen {z.mean():+.3f}")

    model = ValueNet().to(device)
    n_params = sum(p.numel() for p in model.parameters())
    print(f"ValueNet {n_params} paramètres, device={device}")
    opt = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-5)

    val_obs = torch.from_numpy(gather(obs_list, sizes, val_idx))
    val_z = torch.from_numpy(z[val_idx])
    val_step = step[val_idx]

    def validate():
        model.eval()
        preds = []
        with torch.no_grad():
            for k in range(0, len(val_idx), 8192):
                xb = val_obs[k:k + 8192].to(device)
                preds.append(model(xb).cpu())
        v = torch.cat(preds)
        mse = F.mse_loss(v, val_z).item()
        decided = val_z != 0
        acc = ((v[decided] > 0) == (val_z[decided] > 0)).float().mean().item()
        accs = []
        for b in (0, 1, 2):
            sel = decided.numpy() & (val_step == b)
            accs.append(((v.numpy()[sel] > 0) == (val_z.numpy()[sel] > 0)).mean() if sel.any() else float("nan"))
        model.train()
        return mse, acc, accs

    rng = np.random.default_rng(7)
    for epoch in range(args.epochs):
        order = rng.permutation(train_idx)
        tot, steps = 0.0, 0
        for k in range(0, len(order), args.bs):
            idx = np.sort(order[k:k + args.bs])
            xb = torch.from_numpy(gather(obs_list, sizes, idx)).to(device)
            zb = torch.from_numpy(z[idx]).to(device)
            loss = F.mse_loss(model(xb), zb)
            opt.zero_grad(set_to_none=True)
            loss.backward()
            opt.step()
            tot += loss.item(); steps += 1
        mse, acc, accs = validate()
        print(json.dumps({"epoch": epoch, "trainMse": round(tot / steps, 4), "valMse": round(mse, 4),
                          "valSignAcc": round(acc, 4),
                          "accDebut": round(float(accs[0]), 3), "accMilieu": round(float(accs[1]), 3),
                          "accFin": round(float(accs[2]), 3)}))

    out = Path(args.out); out.mkdir(parents=True, exist_ok=True)
    torch.save({"model": model.state_dict()}, out / "value.pt")
    layers = [
        {"name": "conv1", "type": "conv", "shape": [model.ch, N_PLANES, 3, 3]},
        {"name": "conv2", "type": "conv", "shape": [model.ch, model.ch, 3, 3]},
        {"name": "conv3", "type": "conv", "shape": [model.ch, model.ch, 3, 3]},
        {"name": "g1", "type": "linear", "shape": [128, globals()["REST"]]},
        {"name": "g2", "type": "linear", "shape": [model.gdim, 128]},
        {"name": "h1", "type": "linear", "shape": [128, model.ch + model.gdim]},
        {"name": "h2", "type": "linear", "shape": [1, 128]},
    ]
    blobs = []
    sd = model.state_dict()
    for spec in layers:
        wkey = spec["name"] + ".weight"
        blobs.append(sd[wkey].cpu().numpy().astype(np.float32).ravel())
        blobs.append(sd[spec["name"] + ".bias"].cpu().numpy().astype(np.float32).ravel())
    weights = np.concatenate(blobs)
    weights.tofile(out / "weights.bin")
    (out / "shapes.json").write_text(json.dumps({
        "arch": "value-v1", "featureVersion": FEATURE_VERSION, "obsDim": OBS_DIM,
        "planes": {"n": N_PLANES, "h": H, "w": W}, "ch": model.ch, "gdim": model.gdim,
        "layers": layers, "params": int(n_params),
    }))
    # Lot de parité pour le port JS: 8 obs de validation + sorties attendues.
    pk = val_idx[rng.permutation(len(val_idx))[:8]]
    pobs = gather(obs_list, sizes, np.sort(pk))
    pobs.tofile(out / "parity_obs.bin")
    model.eval()
    with torch.no_grad():
        pv = model(torch.from_numpy(pobs).to(device)).cpu().numpy()
    (out / "parity_v.json").write_text(json.dumps([float(x) for x in pv]))
    print(json.dumps({"export": str(out), "params": int(n_params), "parity": [round(float(x), 6) for x in pv]}))


if __name__ == "__main__":
    main()
