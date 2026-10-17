#!/usr/bin/env python3
# RL1 phase 3 (docs/selfplay-rl1.md, examen en ligne du 2026-10-15) — PPO self-play avec:
#  - PFSP: versions passées + clones frères (--siblings) tirés avec un poids (1 − p_gain)²
#    (p estimé sur les parties d'entraînement, décroissance 0,8 par itération, a priori ½),
#    IA Maison avec une part plancher, l'ancre (dernier champion promu) en argmax;
#  - ancre MOBILE: KL CONSTANT (--bc-kl) vers le dernier champion promu (R-NaD, Lux 2021);
#    promotion quand une porte (graines neuves) donne ≥ --promote contre l'ancre: elle devient
#    l'ancre, l'adversaire fixe et la référence des portes; panel de généralité à chaque promotion;
#  - façonnage À POTENTIEL, somme nulle: r_t += c·(γ·Φ_{t+1} − Φ_t), Φ = PV(moi) − PV(lui) en
#    fraction, Φ(terminal) = 0 (Ng 1999) — remplace le bonus de marge terminal (--margin 0);
#  - critique informée: le réseau de VALEUR reçoit le type d'adversaire (la politique, non);
#  - (phase 4, RL2) --label-p P: la recherche réseau (rl2_search) étiquette P des décisions des
#    parties d'entraînement (Gumbel-top-k, cible π' = softmax(logit + 50·q̂)); perte ajoutée
#    --ce × CE(π', π) sur ces pas (Expert Iteration + PPO, comme Muesli/kickstarting);
#  - plafond: --ceiling portes de suite sans promotion → arrêt; recul: 2 portes < --rollback-below
#    → retour à l'ancre, LR ÷ 2 (une fois; la 2e fois → arrêt).
# Sûreté et machinerie: celles de rl1_train.py (frein thermique, garde mémoire, RUN/STOP).
#   python3 scripts/rl/rl3_train.py --out RUN --init BEST_DIR --init-value STATE_PT [options]
import argparse
import json
import shutil
import sys
import time
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

sys.path.insert(0, str(Path(__file__).parent))
import rl1_train as r1  # noqa: E402
tp = r1.tp
KINDS = ["self", "pool", "clone0", "maison", "c1"]


class CriticNet(r1.ValueNet):
    """ValueNet + type d'adversaire (one-hot) concaténé avant v1."""

    def __init__(self):
        super().__init__()
        self.v1 = nn.Linear(4 * 48 + 128 + len(KINDS), 256)

    def forward(self, x, kind):
        b = x.shape[0]
        planes = x[:, :tp.PLANE].view(b, tp.N_PLANES, tp.H, tp.W)
        h = torch.cat([planes, self.coords.expand(b, -1, -1, -1)], 1)
        for conv in (self.conv1, self.conv2, self.conv3, self.conv4):
            h = F.gelu(conv(h))
        g = F.gelu(self.g2(F.gelu(self.g1(x[:, tp.PLANE:]))))
        you, foe = planes[:, 6:7], planes[:, 3:4]
        at_you = (h * you).sum(dim=(2, 3))
        at_foe = (h * foe).sum(dim=(2, 3)) / foe.sum(dim=(2, 3)).clamp(min=1)
        z = torch.cat([h.mean(dim=(2, 3)), h.amax(dim=(2, 3)), at_you, at_foe, g, kind], 1)
        return self.v2(F.gelu(self.v1(z))).squeeze(-1)


def critic_from_value_state(sd):
    """Poids d'un ValueNet (rl1) → CriticNet identique au départ (colonnes « type » à zéro)."""
    c = CriticNet()
    own = c.state_dict()
    for k, v in sd.items():
        if k == "v1.weight":
            w = torch.zeros_like(own[k]); w[:, :v.shape[1]] = v; own[k] = w
        else:
            own[k] = v
    c.load_state_dict(own)
    return c


def load_policy(d, dev):
    net = tp.SpatialPolicyNet(r1.ACTION_DIM)
    net.load_state_dict(torch.load(Path(d) / "policy.pt", map_location="cpu")["model"])
    return net.to(dev)


def load_rollout(rdir, ks):
    obs, masks, acts, phis, kinds, eps, done = [], [], [], [], [], [], []
    tsteps, tcand, tprob = [], [], []
    cur = 0
    for k in ks:
        p = rdir / f"w{k}"
        e = [json.loads(l) for l in open(f"{p}.ep.jsonl")]
        n = sum(x["steps"] for x in e)
        obs.append(np.fromfile(f"{p}.obs.f16", np.float16).reshape(n, r1.OBS_DIM))
        masks.append(np.fromfile(f"{p}.mask.bin", np.uint8).reshape(n, r1.MASK_BYTES))
        a = np.fromfile(f"{p}.act.u32", np.uint32).astype(np.int64)
        ph = np.fromfile(f"{p}.phi.f32", np.float32)
        assert len(a) == n == len(ph), (p, len(a), len(ph), n)
        acts.append(a); phis.append(ph)
        kv = np.zeros(n, np.int64)
        for x in e:
            kv[x["start"]:x["start"] + x["steps"]] = KINDS.index(x["kind"])
            eps.append({**x, "start": x["start"] + cur})
        kinds.append(kv)
        tf = Path(f"{p}.tgt.jsonl")
        if tf.exists():
            for l in open(tf):
                t = json.loads(l)
                tsteps.append(t["step"] + cur)
                tcand.append(t["labels"]); tprob.append(t["probs"])
        cur += n
        done.append(json.loads(Path(f"{p}.done.json").read_text()))
    masks = np.unpackbits(np.concatenate(masks), axis=1, count=r1.ACTION_DIM, bitorder="little").astype(bool)
    n = cur
    K = max([len(c) for c in tcand], default=1)
    cand = np.full((len(tcand), K), -1, np.int64); prob = np.zeros((len(tcand), K), np.float32)
    for i, (c, q) in enumerate(zip(tcand, tprob)):
        cand[i, :len(c)] = c; prob[i, :len(q)] = q
    pos = np.full(n, -1, np.int64); pos[np.array(tsteps, np.int64)] = np.arange(len(tsteps))
    labels = {"pos": pos, "cand": cand, "prob": prob}
    return (np.concatenate(obs), masks, np.concatenate(acts), np.concatenate(phis), np.concatenate(kinds), eps, done, labels)


def onehot(kv, dev):
    return F.one_hot(torch.from_numpy(kv).to(dev), len(KINDS)).float()


@torch.no_grad()
def recompute(pi, critic, dev, obs, masks, acts, kinds, bs=4096):
    lp, vals = np.zeros(len(obs), np.float32), np.zeros(len(obs), np.float32)
    for i in range(0, len(obs), bs):
        x = torch.from_numpy(obs[i:i + bs].astype(np.float32)).to(dev)
        m = torch.from_numpy(masks[i:i + bs]).to(dev)
        a = torch.from_numpy(acts[i:i + bs]).to(dev)
        lp[i:i + bs] = r1.masked_logp(pi(x), m).gather(1, a[:, None]).squeeze(1).cpu().numpy()
        vals[i:i + bs] = critic(x, onehot(kinds[i:i + bs], dev)).cpu().numpy()
    return lp, vals


def gae_shaped(eps, values, phis, gamma, lam, c):
    """GAE avec façonnage à potentiel: r_t = c·(γΦ_{t+1} − Φ_t), dernier pas: R + c·(0 − Φ_T)."""
    adv = np.zeros(len(values), np.float32)
    for e in eps:
        s, k = e["start"], e["steps"]
        last, nextv = 0.0, 0.0
        for t in range(s + k - 1, s - 1, -1):
            nphi = phis[t + 1] if t < s + k - 1 else 0.0
            r = c * (gamma * nphi - phis[t]) + (e["reward"] if t == s + k - 1 else 0.0)
            delta = r + gamma * nextv - values[t]
            last = delta + gamma * lam * last
            adv[t] = last
            nextv = values[t]
    return adv, adv + values


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--init", required=True, help="champion de départ (policy.pt déjà « plié »)")
    ap.add_argument("--init-value", required=True, help="state.pt d'un run rl1 (réseau de valeur)")
    ap.add_argument("--siblings", default="", help="dossiers de clones frères (pool PFSP), séparés par des virgules")
    ap.add_argument("--iters", type=int, default=60)
    ap.add_argument("--games", type=int, default=512)
    ap.add_argument("--workers", type=int, default=3)
    ap.add_argument("--mix", default="self:0.4,pool:0.35,clone0:0.1,maison:0.15")
    ap.add_argument("--lk", default="l100,l200gear")
    ap.add_argument("--shape", type=float, default=0.5, help="c du façonnage à potentiel")
    ap.add_argument("--lr", type=float, default=5e-5)
    ap.add_argument("--vlr", type=float, default=3e-4)
    ap.add_argument("--epochs", type=int, default=3)
    ap.add_argument("--mb", type=int, default=2048)
    ap.add_argument("--clip", type=float, default=0.2)
    ap.add_argument("--ent", type=float, default=0.003)
    ap.add_argument("--gamma", type=float, default=0.995)
    ap.add_argument("--lam", type=float, default=0.95)
    ap.add_argument("--bc-kl", type=float, default=0.1, help="KL CONSTANT vers l'ancre mobile")
    ap.add_argument("--kl-stop", type=float, default=0.03)
    ap.add_argument("--value-warmup", type=int, default=1)
    ap.add_argument("--gate-every", type=int, default=5)
    ap.add_argument("--gate-games", type=int, default=128)
    ap.add_argument("--promote", type=float, default=0.55)
    ap.add_argument("--ceiling", type=int, default=2, help="portes de suite sans promotion → arrêt")
    ap.add_argument("--rollback-below", type=float, default=0.45)
    ap.add_argument("--panel-games", type=int, default=64)
    ap.add_argument("--device", default="mps" if torch.backends.mps.is_available() else "cpu")
    ap.add_argument("--seed", type=int, default=11)
    ap.add_argument("--label-p", type=float, default=0.0, help="part des décisions étiquetées par la recherche (phase 4)")
    ap.add_argument("--label-k", type=int, default=8)
    ap.add_argument("--label-lk", default="", help="étiqueter seulement les parties de ce niveau (ex. l100)")
    ap.add_argument("--ce", type=float, default=1.0, help="poids de la perte CE vers la cible de la recherche")
    ap.add_argument("--c1-share", type=float, default=0.0, help="part des parties d'entraînement contre C1 (au niveau --c1-lk)")
    ap.add_argument("--c1-lk", default="l100")
    ap.add_argument("--c1-gate-games", type=int, default=0,
                    help=">0: banc C1 à graines FIXES à chaque porte; promotion exige aussi c1(candidat) ≥ c1(ancre) − --c1-tol")
    ap.add_argument("--c1-tol", type=float, default=0.05)
    args = ap.parse_args()
    args.gate_fresh = True

    run = Path(args.out)
    run.mkdir(parents=True, exist_ok=True)
    logf = open(run / "log.jsonl", "a")

    def log(d):
        d = {"t": time.strftime("%H:%M:%S"), **d}
        logf.write(json.dumps(d) + "\n"); logf.flush()
        print(json.dumps(d), flush=True)

    torch.manual_seed(args.seed)
    dev = torch.device(args.device)
    src_shapes = json.loads((Path(args.init) / "shapes.json").read_text())
    state_f = run / "state.pt"
    siblings = [s for s in args.siblings.split(",") if s]
    st = {"anchor": None, "no_promo": 0, "bad": 0, "rolled": False, "lr": args.lr, "pfsp": {}, "promotions": []}
    if state_f.exists():
        ck = torch.load(state_f, map_location=dev)
        pi = tp.SpatialPolicyNet(r1.ACTION_DIM).to(dev); pi.load_state_dict(ck["pi"])
        critic = CriticNet().to(dev); critic.load_state_dict(ck["v"])
        st = ck["st"]; it0 = ck["iter"] + 1
        opt_pi = torch.optim.Adam(pi.parameters(), lr=st["lr"]); opt_pi.load_state_dict(ck["opt_pi"])
        opt_v = torch.optim.Adam(critic.parameters(), lr=args.vlr); opt_v.load_state_dict(ck["opt_v"])
        for g in opt_pi.param_groups:
            g["lr"] = st["lr"]
        log({"resume": it0, "anchor": st["anchor"], "noPromo": st["no_promo"]})
    else:
        pi = load_policy(args.init, dev)
        critic = critic_from_value_state(torch.load(args.init_value, map_location="cpu")["v"]).to(dev)
        opt_pi = torch.optim.Adam(pi.parameters(), lr=args.lr)
        opt_v = torch.optim.Adam(critic.parameters(), lr=args.vlr)
        it0 = 0
        anchor0 = run / "pool" / "iter_0000"
        r1.export_policy(pi, src_shapes, anchor0, {"iter": 0, "fold": 1, "init": args.init})
        st["anchor"] = str(anchor0)
        log({"start": vars(args), "siblings": siblings})
    bc = load_policy(st["anchor"], dev).eval()
    for p in bc.parameters():
        p.requires_grad_(False)

    stop_reason = None
    for it in range(it0, args.iters):
        if (run / "STOP").exists():
            stop_reason = "STOP file"; break
        t0 = time.time()
        it_dir = run / "pool" / f"iter_{it:04d}"
        if it > 0:
            r1.export_policy(pi, src_shapes, it_dir, {"iter": it, "fold": 1, "init": args.init})
        anchor = Path(st["anchor"])
        if it > 0 and it % args.gate_every == 0:
            if not r1.machine_ok(log):
                stop_reason = "machine"; break
            g = r1.gate(args, it_dir, anchor, run, it, log)
            sc = g["clone0"]["pairScore"]
            c1ok = True
            if args.c1_gate_games > 0:
                def c1bench(d, name):
                    a2 = argparse.Namespace(**{**vars(args), "lk": args.c1_lk, "worker_extra": []})
                    cdir = run / "c1gate" / name
                    if not (cdir / "score.json").exists():
                        ks2 = r1.run_workers(a2, d, [], d, it, cdir, "c1:1", args.c1_gate_games, 0, 0.0, "c1gate-fixed")
                        eps2 = [json.loads(l) for k in ks2 for l in open(cdir / f"w{k}.ep.jsonl")]
                        (cdir / "score.json").write_text(json.dumps(round(sum((e["outcome"] + 1) / 2 for e in eps2) / max(1, len(eps2)), 4)))
                        for f in cdir.glob("w*.obs.f16"):
                            f.unlink()
                    return json.loads((cdir / "score.json").read_text())
                c1a, c1c = c1bench(anchor, Path(anchor).parent.parent.name + "-" + Path(anchor).name), c1bench(it_dir, run.name + "-" + it_dir.name)
                c1ok = c1c >= c1a - args.c1_tol
                log({"c1gate": it, "anchor": c1a, "candidate": c1c, "ok": c1ok})
            if sc is not None and sc >= args.promote and c1ok:
                st["anchor"] = str(it_dir); st["no_promo"] = 0; st["bad"] = 0; st["promotions"].append([it, sc])
                bc = load_policy(it_dir, dev).eval()
                for p in bc.parameters():
                    p.requires_grad_(False)
                log({"promote": it, "score": sc})
                panel = {}
                for name, d in [(Path(s).name, s) for s in siblings] + [("maison", None), ("c1", None)]:
                    lk = "l100" if name == "c1" else args.lk
                    pdir = run / "panel" / f"iter_{it:04d}-{name}"
                    a2 = argparse.Namespace(**{**vars(args), "lk": lk})
                    ks = r1.run_workers(a2, it_dir, [], d or anchor, it, pdir, "c1:1" if name == "c1" else "maison:1" if name == "maison" else "clone0:1",
                                        args.panel_games, 0, 0.0, f"panel-{name}-it{it}")
                    eps = [json.loads(l) for k in ks for l in open(pdir / f"w{k}.ep.jsonl")]
                    panel[name] = round(sum((e["outcome"] + 1) / 2 for e in eps) / max(1, len(eps)), 4)
                    for f in pdir.glob("w*.obs.f16"):
                        f.unlink()
                log({"panel": it, "scores": panel, "min": min(panel.values())})
            else:
                st["no_promo"] += 1
                st["bad"] = st["bad"] + 1 if (sc is not None and sc < args.rollback_below) else 0
                log({"noPromotion": it, "score": sc, "noPromo": st["no_promo"], "bad": st["bad"]})
                if st["bad"] >= 2:
                    if st["rolled"]:
                        stop_reason = "second rollback condition"; break
                    pi.load_state_dict(torch.load(anchor / "policy.pt", map_location=dev)["model"])
                    st["lr"] /= 2; st["rolled"] = True; st["bad"] = 0
                    opt_pi = torch.optim.Adam(pi.parameters(), lr=st["lr"])
                    log({"rollback": str(anchor), "lr": st["lr"]})
                    continue
                if st["no_promo"] >= args.ceiling:
                    stop_reason = f"ceiling: {st['no_promo']} gates without promotion"; break
        # PFSP: versions passées (6 dernières + 1 sur 5 plus anciennes, ≤ 12) + frères, poids (1 − p)².
        past = [str(p) for p in sorted(run.glob("pool/iter_*")) if p != it_dir]
        cands = (past[:-6][::5] + past[-6:])[-12:] + siblings
        weights = []
        for d in cands:
            w_, n_ = st["pfsp"].get(d, [1.0, 2.0])
            weights.append(max(0.05, (1 - w_ / n_) ** 2))
        pool = [f"{d}@{w:.4f}" for d, w in zip(cands, weights)]
        if not r1.machine_ok(log):
            stop_reason = "machine"; break
        rdir = run / "rollout"
        shutil.rmtree(rdir, ignore_errors=True)
        args.worker_extra = (["--label-p", str(args.label_p), "--label-k", str(args.label_k)] if args.label_p > 0 else []) \
            + (["--label-lk", args.label_lk] if args.label_p > 0 and args.label_lk else []) \
            + (["--c1-lk", args.c1_lk] if args.c1_share > 0 else [])
        mix = args.mix + (f",c1:{args.c1_share}" if args.c1_share > 0 else "")
        ks = r1.run_workers(args, it_dir if it > 0 else anchor, pool, anchor, it, rdir, mix, args.games, 1.0, 0.0, f"rl3-it{it}")
        args.worker_extra = []
        t_play = time.time() - t0
        obs, masks, acts, phis, kinds, eps, done, lab = load_rollout(rdir, ks)
        for d in list(st["pfsp"]):  # décroissance: suivre l'apprenant COURANT
            st["pfsp"][d] = [x * 0.8 for x in st["pfsp"][d]]
        for e in eps:
            if e["kind"] == "pool" and e["opp"]:
                w_, n_ = st["pfsp"].get(e["opp"], [1.0, 2.0])
                st["pfsp"][e["opp"]] = [w_ + (e["outcome"] > 0) + 0.5 * (e["outcome"] == 0), n_ + 1]
        if not r1.machine_ok(log):
            stop_reason = "machine"; break
        lp_old, vals = recompute(pi, critic, dev, obs, masks, acts, kinds)
        adv, ret = gae_shaped(eps, vals, phis, args.gamma, args.lam, args.shape)
        adv_n = (adv - adv.mean()) / (adv.std() + 1e-8)
        policy_on = it >= args.value_warmup
        stats = {"pl": 0.0, "vl": 0.0, "ent": 0.0, "kl": 0.0, "klBc": 0.0, "clip": 0.0, "ceLoss": 0.0, "n": 0}
        stop = False
        for ep in range(args.epochs):
            perm = np.random.default_rng(args.seed * 1000 + it * 10 + ep).permutation(len(obs))
            for i in range(0, len(perm), args.mb):
                idx = perm[i:i + args.mb]
                x = torch.from_numpy(obs[idx].astype(np.float32)).to(dev)
                m = torch.from_numpy(masks[idx]).to(dev)
                a = torch.from_numpy(acts[idx]).to(dev)
                v = critic(x, onehot(kinds[idx], dev))
                vl = F.mse_loss(v, torch.from_numpy(ret[idx]).to(dev))
                opt_v.zero_grad(set_to_none=True); vl.backward()
                nn.utils.clip_grad_norm_(critic.parameters(), 0.5); opt_v.step()
                stats["vl"] += vl.item(); stats["n"] += 1
                if not policy_on:
                    continue
                lp_all = r1.masked_logp(pi(x), m)
                lp = lp_all.gather(1, a[:, None]).squeeze(1)
                ratio = torch.exp(lp - torch.from_numpy(lp_old[idx]).to(dev))
                ad = torch.from_numpy(adv_n[idx]).to(dev)
                pl = -torch.min(ratio * ad, ratio.clamp(1 - args.clip, 1 + args.clip) * ad).mean()
                ent = -(lp_all.exp() * lp_all.masked_fill(~m, 0)).sum(1).mean()
                with torch.no_grad():
                    lb = r1.masked_logp(bc(x), m)
                kl_bc = (lb.exp() * (lb - lp_all).masked_fill(~m, 0)).sum(1).mean()
                loss = pl - args.ent * ent + args.bc_kl * kl_bc
                li = lab["pos"][idx]
                sel = np.flatnonzero(li >= 0)
                if len(sel) and args.ce > 0:
                    rows = torch.from_numpy(sel).to(dev)
                    cand = torch.from_numpy(lab["cand"][li[sel]]).to(dev)
                    prob = torch.from_numpy(lab["prob"][li[sel]]).to(dev)
                    lpc = lp_all[rows].gather(1, cand.clamp(min=0))
                    ce = -(prob * lpc.masked_fill(cand < 0, 0)).sum(1).mean()
                    loss = loss + args.ce * ce
                    stats["ceLoss"] += ce.item()
                opt_pi.zero_grad(set_to_none=True); loss.backward()
                nn.utils.clip_grad_norm_(pi.parameters(), 0.5); opt_pi.step()
                with torch.no_grad():
                    kl = float((torch.from_numpy(lp_old[idx]).to(dev) - lp).mean())
                stats["pl"] += pl.item(); stats["ent"] += ent.item(); stats["klBc"] += kl_bc.item(); stats["kl"] += kl
                stats["clip"] += float(((ratio - 1).abs() > args.clip).float().mean())
                if kl > args.kl_stop:
                    stop = True; break
            if stop:
                break
        nb = max(1, stats.pop("n"))
        ev = 1 - np.var(ret - vals) / (np.var(ret) + 1e-8)
        kinds_w = {}
        for e in eps:
            k = kinds_w.setdefault(e["kind"], [0, 0]); k[0] += e["outcome"] > 0; k[1] += 1
        top_pfsp = sorted(((round(1 - (st["pfsp"].get(d, [1, 2])[0] / st["pfsp"].get(d, [1, 2])[1]), 2), Path(d).name) for d in cands), reverse=True)[:4]
        log({"iter": it, "steps": len(obs), "episodes": len(eps), "policyOn": policy_on,
             "winByKind": {k: f"{w}/{n}" for k, (w, n) in kinds_w.items()},
             **{k: round(v / nb, 5) for k, v in stats.items()}, "earlyStop": stop, "explVar": round(float(ev), 3),
             "hardestPool": top_pfsp, "labeled": int((lab["pos"] >= 0).sum()), "playSec": round(t_play, 1), "iterSec": round(time.time() - t0, 1),
             "heatPausedSec": round(r1.heat["pausedSec"]), "exitAborts": r1.heat["exitAborts"]})
        torch.save({"pi": pi.state_dict(), "v": critic.state_dict(), "opt_pi": opt_pi.state_dict(), "opt_v": opt_v.state_dict(),
                    "iter": it, "st": st}, state_f)
    log({"end": stop_reason or "iters", "anchor": st["anchor"], "promotions": st["promotions"]})


if __name__ == "__main__":
    main()
