#!/usr/bin/env python3
# RL1 (docs/selfplay-rl1.md) — boucle PPO de self-play pour la politique spatiale.
# Chaque itération:
#   1. exporte la politique courante → RUN/pool/iter_NNNN (policy.pt + shapes.json +
#      model.onnx, format du clone: policy_net.cjs / rl1_policy.cjs la lisent telle quelle)
#   2. lance W workers rl1_selfplay.cjs (CPU) contre le mélange d'adversaires
#   3. recalcule logp_old (politique exportée) et valeurs, GAE (récompense terminale)
#   4. mises à jour PPO: clip, entropie masquée, KL d'ancrage au clone (décroissante),
#      arrêt précoce sur KL; réseau de VALEUR séparé (tronc copié du clone + lecture
#      positionnelle: moyenne, max, case du joueur au trait, cases ennemies)
#   5. tous les --gate-every: portes en argmax (vs IA Maison, vs le clone de départ)
# Départ = le clone dont les têtes sont multipliées par --fold (2 → la politique à T = 1
# EST le clone à T = 0,5, mesuré aussi fort que l'argmax; l'argmax est inchangé).
# Sûreté: phases séquentielles (jamais CPU + GPU en même temps), pause tant que la
# pression thermique ≥ 2, arrêt si mémoire libre < 30 %; RUN/STOP = arrêt propre.
#   python3 scripts/rl/rl1_train.py --out RUN --init CLONE_DIR [--iters N ...]
import argparse
import json
import os
import shutil
import signal
import subprocess
import sys
import time
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

SCRIPTS = Path(__file__).parent
ROOT = SCRIPTS.parent.parent
sys.path.insert(0, str(SCRIPTS))
import train_policy as tp  # noqa: E402

OBS_DIM, ACTION_DIM, MASK_BYTES = 6122, 5251, 657
heat = {"pauses": 0, "pausedSec": 0.0, "max": 0, "exitAborts": 0}  # frein thermique de la dernière phase de parties
tp.REST = OBS_DIM - tp.PLANE
tp.ACTION_DIM = ACTION_DIM


class ValueNet(nn.Module):
    """Tronc du clone (copié à l'init) + lecture positionnelle (audit B1)."""

    def __init__(self, ch=48, gdim=128):
        super().__init__()
        self.register_buffer("coords", tp.SpatialPolicyNet(ACTION_DIM).coords.clone())
        self.conv1 = nn.Conv2d(tp.N_PLANES + 2, ch, 3, padding=1)
        self.conv2 = nn.Conv2d(ch, ch, 3, padding=1)
        self.conv3 = nn.Conv2d(ch, ch, 3, padding=1)
        self.conv4 = nn.Conv2d(ch, ch, 3, padding=1)
        self.g1 = nn.Linear(tp.REST, 256)
        self.g2 = nn.Linear(256, gdim)
        self.v1 = nn.Linear(4 * ch + gdim, 256)
        self.v2 = nn.Linear(256, 1)

    def forward(self, x):
        b = x.shape[0]
        planes = x[:, :tp.PLANE].view(b, tp.N_PLANES, tp.H, tp.W)
        h = torch.cat([planes, self.coords.expand(b, -1, -1, -1)], 1)
        for conv in (self.conv1, self.conv2, self.conv3, self.conv4):
            h = F.gelu(conv(h))
        g = F.gelu(self.g2(F.gelu(self.g1(x[:, tp.PLANE:]))))
        you, foe = planes[:, 6:7], planes[:, 3:4]
        at_you = (h * you).sum(dim=(2, 3))
        at_foe = (h * foe).sum(dim=(2, 3)) / foe.sum(dim=(2, 3)).clamp(min=1)
        z = torch.cat([h.mean(dim=(2, 3)), h.amax(dim=(2, 3)), at_you, at_foe, g], 1)
        return self.v2(F.gelu(self.v1(z))).squeeze(-1)


def load_clone(d, fold):
    net = tp.SpatialPolicyNet(ACTION_DIM)
    net.load_state_dict(torch.load(Path(d) / "policy.pt", map_location="cpu")["model"])
    with torch.no_grad():
        for head in (net.move_head, net.cast_head, net.pass_head):
            head.weight.mul_(fold)
            head.bias.mul_(fold)
    return net


def export_policy(pi, src_shapes, out_dir, meta):
    out_dir.mkdir(parents=True, exist_ok=True)
    sd = {k: v.detach().cpu() for k, v in pi.state_dict().items()}
    torch.save({"model": sd, "arch": "policy-spatial-v1", **meta}, out_dir / "policy.pt")
    shapes = {**src_shapes, "rl1": meta}
    (out_dir / "shapes.json").write_text(json.dumps(shapes))
    r = subprocess.run([sys.executable, str(SCRIPTS / "export_policy_onnx.py"), str(out_dir)], capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"export ONNX: {r.stderr[-800:]}")


def thermal():
    out = subprocess.run(["notifyutil", "-g", "com.apple.system.thermalpressurelevel"], capture_output=True, text=True).stdout.split()
    return int(out[-1]) if out else 0


def memory():
    free = int(subprocess.run(["sysctl", "-n", "kern.memorystatus_level"], capture_output=True, text=True).stdout or 100)
    prs = int(subprocess.run(["sysctl", "-n", "kern.memorystatus_vm_pressure_level"], capture_output=True, text=True).stdout or 1)
    return free, prs


def machine_ok(log):
    """Pause tant que la pression thermique ≥ 2; False si la mémoire est en danger."""
    waited = 0
    while True:
        free, prs = memory()
        th = thermal()
        if free < 30 or prs != 1:
            log({"guard": "memory", "free": free, "pressure": prs})
            return False
        if th < 2:
            if waited:
                log({"guard": "thermal-resume", "waitedSec": waited})
            return True
        if waited == 0:
            log({"guard": "thermal-pause", "level": th})
        time.sleep(15)
        waited += 15


def run_workers(args, learner, pool, clone0, it, rdir, mix, games, temp, margin, seed_tag):
    rdir.mkdir(parents=True, exist_ok=True)
    # Par PAIRES (même graine, sièges inversés): chaque worker reçoit un nombre pair de parties.
    pairs = games // 2
    per = [2 * (pairs // args.workers + (1 if k < pairs % args.workers else 0)) for k in range(args.workers)]
    per[-1] += games % 2
    env = {**os.environ, "CLONE_ORT": "1"}
    procs = []
    for k, n in enumerate(per):
        if n == 0:
            continue
        cmd = ["node", str(SCRIPTS / "rl1_selfplay.cjs"), "--learner", str(learner), "--out", str(rdir / f"w{k}"),
               "--games", str(n), "--seed", f"{seed_tag}-w{k}", "--temp", str(temp), "--margin", f"{margin:.4f}",
               "--mix", mix, "--clone0", str(clone0), "--lk", args.lk]
        if pool:
            cmd += ["--pool", ",".join(str(p) for p in pool)]
        if getattr(args, "search", 0):
            cmd += ["--search", str(args.search)]
        cmd += list(getattr(args, "worker_extra", []))
        procs.append(subprocess.Popen(cmd, cwd=ROOT, env=env, stdout=open(rdir / f"w{k}.log", "w"), stderr=subprocess.STDOUT))
    # Frein thermique PENDANT la phase (2026-10-15: 4 workers → niveaux 2 à 4): pression
    # ≥ 2 → SIGSTOP de tous les workers; reprise (SIGCONT) à ≤ 1 après au moins 30 s.
    # Mémoire en danger → workers tués, itération en échec.
    heat["pauses"], heat["pausedSec"], heat["max"], heat["exitAborts"] = 0, 0.0, 0, 0
    paused_at = None
    while any(p.poll() is None for p in procs):
        th = thermal()
        heat["max"] = max(heat["max"], th)
        free, prs = memory()
        if free < 30 or prs != 1:
            for p in procs:
                if p.poll() is None:
                    p.kill()
            raise RuntimeError(f"mémoire en danger pendant les parties (libre {free} %, pression {prs})")
        if paused_at is None and th >= 2:
            for p in procs:
                if p.poll() is None:
                    os.kill(p.pid, signal.SIGSTOP)
            paused_at = time.time(); heat["pauses"] += 1
        elif paused_at is not None and th <= 1 and time.time() - paused_at >= 30:
            for p in procs:
                if p.poll() is None:
                    os.kill(p.pid, signal.SIGCONT)
            heat["pausedSec"] += time.time() - paused_at; paused_at = None
        time.sleep(5)
    rc = [p.wait() for p in procs]
    ks = [k for k, n in enumerate(per) if n > 0]
    # ONNX Runtime peut avorter À LA SORTIE du process (SIGABRT dans sa télémétrie,
    # « recursive_mutex lock failed », 2026-10-15) après que le worker a tout écrit:
    # un worker compte comme réussi si son done.json existe (écrit en dernier);
    # la cohérence des fichiers est revérifiée au chargement.
    bad = [k for k, c in zip(ks, rc) if c != 0 and not (rdir / f"w{k}.done.json").exists()]
    if bad:
        raise RuntimeError(f"worker en échec (codes {rc}), voir {rdir}/w*.log")
    heat["exitAborts"] = sum(1 for c in rc if c != 0)
    return ks


def load_rollout(rdir, ks):
    obs, masks, acts, eps, done = [], [], [], [], []
    cur = 0
    for k in ks:
        p = rdir / f"w{k}"
        e = [json.loads(l) for l in open(f"{p}.ep.jsonl")]
        n = sum(x["steps"] for x in e)
        o = np.fromfile(f"{p}.obs.f16", np.float16).reshape(n, OBS_DIM)
        m = np.fromfile(f"{p}.mask.bin", np.uint8).reshape(n, MASK_BYTES)
        a = np.fromfile(f"{p}.act.u32", np.uint32).astype(np.int64)
        assert len(a) == n, (p, len(a), n)
        for x in e:
            eps.append({**x, "start": x["start"] + cur})
        cur += n
        obs.append(o); masks.append(m); acts.append(a)
        done.append(json.loads(Path(f"{p}.done.json").read_text()))
    masks = np.unpackbits(np.concatenate(masks), axis=1, count=ACTION_DIM, bitorder="little").astype(bool)
    return np.concatenate(obs), masks, np.concatenate(acts), eps, done


def masked_logp(logits, mask):
    return F.log_softmax(logits.masked_fill(~mask, -1e9), dim=-1)


@torch.no_grad()
def recompute(pi, vnet, dev, obs, masks, acts, bs=4096):
    lp, vals = np.zeros(len(obs), np.float32), np.zeros(len(obs), np.float32)
    for i in range(0, len(obs), bs):
        x = torch.from_numpy(obs[i:i + bs].astype(np.float32)).to(dev)
        m = torch.from_numpy(masks[i:i + bs]).to(dev)
        a = torch.from_numpy(acts[i:i + bs]).to(dev)
        lp[i:i + bs] = masked_logp(pi(x), m).gather(1, a[:, None]).squeeze(1).cpu().numpy()
        vals[i:i + bs] = vnet(x).cpu().numpy()
    return lp, vals


def gae(eps, values, gamma, lam):
    adv = np.zeros(len(values), np.float32)
    for e in eps:
        s, k = e["start"], e["steps"]
        last, nextv = 0.0, 0.0
        for t in range(s + k - 1, s - 1, -1):
            r = e["reward"] if t == s + k - 1 else 0.0
            delta = r + gamma * nextv - values[t]
            last = delta + gamma * lam * last
            adv[t] = last
            nextv = values[t]
    return adv, adv + values


def gate(args, it_dir, clone0, run, it, log):
    """Argmax contre IA Maison et contre l'ancre (clone0). Graines fixes (mêmes à chaque
    porte) ou NEUVES à chaque porte (--gate-fresh); score par paires contre l'ancre."""
    res = {"iter": it}
    for name, mix in (("maison", "maison:1"), ("clone0", "clone0:1")):
        gdir = run / "gates" / f"iter_{it:04d}-{name}"
        tag = f"gate-{name}-it{it}" if args.gate_fresh else f"gate-{name}"
        ks = run_workers(args, it_dir, [], clone0, it, gdir, mix, args.gate_games, 0, 0.0, tag)
        eps = [json.loads(l) for k in ks for l in open(gdir / f"w{k}.ep.jsonl")]
        res[name] = {"n": len(eps), "win": sum(e["outcome"] > 0 for e in eps), "draw": sum(e["outcome"] == 0 for e in eps),
                     "byLk": {lk: sum(e["outcome"] > 0 for e in eps if e["lk"] == lk) for lk in sorted({e["lk"] for e in eps})}}
        pairs = {}
        for k in ks:
            for l in open(gdir / f"w{k}.ep.jsonl"):
                e = json.loads(l)
                pairs.setdefault((k, e["game"] >> 1), []).append((e["outcome"] + 1) / 2)
        ps = [sum(v) / 2 for v in pairs.values() if len(v) == 2]
        res[name]["pairScore"] = round(float(np.mean(ps)), 4) if ps else None
        for f in gdir.glob("w*.obs.f16"):
            f.unlink()
    with open(run / "gates.jsonl", "a") as f:
        f.write(json.dumps(res) + "\n")
    log({"gate": res})
    return res


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--init", required=True, help="dossier du clone (policy.pt + shapes.json)")
    ap.add_argument("--iters", type=int, default=40)
    ap.add_argument("--games", type=int, default=256, help="parties par itération")
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--fold", type=float, default=2.0)
    ap.add_argument("--mix", default="self:0.5,pool:0.3,clone0:0.1,maison:0.1")
    ap.add_argument("--lk", default="l100,l200gear")
    ap.add_argument("--margin0", type=float, default=0.1)
    ap.add_argument("--margin-decay", type=float, default=0.95)
    ap.add_argument("--lr", type=float, default=1e-4)
    ap.add_argument("--vlr", type=float, default=3e-4)
    ap.add_argument("--epochs", type=int, default=3)
    ap.add_argument("--mb", type=int, default=2048)
    ap.add_argument("--clip", type=float, default=0.2)
    ap.add_argument("--ent", type=float, default=0.003)
    ap.add_argument("--gamma", type=float, default=0.995)
    ap.add_argument("--lam", type=float, default=0.95)
    ap.add_argument("--bc-kl", type=float, default=0.2)
    ap.add_argument("--bc-kl-decay", type=float, default=0.98)
    ap.add_argument("--kl-stop", type=float, default=0.03)
    ap.add_argument("--value-warmup", type=int, default=2, help="itérations où seule la valeur apprend")
    ap.add_argument("--gate-every", type=int, default=10)
    ap.add_argument("--gate-games", type=int, default=128)
    ap.add_argument("--device", default="mps" if torch.backends.mps.is_available() else "cpu")
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--init-value", default=None, help="state.pt d'un run précédent: réseau de valeur de départ")
    ap.add_argument("--gate-fresh", action="store_true", help="graines neuves à chaque porte")
    ap.add_argument("--rollback-below", type=float, default=0.0,
                    help="2 portes de suite sous ce score par paires contre l'ancre → retour au meilleur, LR ÷ 2 (0 = jamais)")
    args = ap.parse_args()

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
    assert src_shapes["arch"] == "policy-spatial-v1" and src_shapes["obsDim"] == OBS_DIM, src_shapes["arch"]
    state_f = run / "state.pt"
    pi = load_clone(args.init, args.fold).to(dev)
    bc = load_clone(args.init, args.fold).to(dev).eval()
    for p in bc.parameters():
        p.requires_grad_(False)
    vnet = ValueNet().to(dev)
    vnet.load_state_dict({k: v for k, v in pi.state_dict().items() if k.split(".")[0] in ("conv1", "conv2", "conv3", "conv4", "g1", "g2")}, strict=False)
    if args.init_value:
        vnet.load_state_dict(torch.load(args.init_value, map_location=dev)["v"])
    opt_pi = torch.optim.Adam(pi.parameters(), lr=args.lr)
    opt_v = torch.optim.Adam(vnet.parameters(), lr=args.vlr)
    it0 = 0
    track = {"best_iter": 0, "best_score": 0.5, "bad": 0, "rolled": False, "lr": args.lr}
    if state_f.exists():
        ck = torch.load(state_f, map_location=dev)
        pi.load_state_dict(ck["pi"]); vnet.load_state_dict(ck["v"])
        opt_pi.load_state_dict(ck["opt_pi"]); opt_v.load_state_dict(ck["opt_v"]); it0 = ck["iter"] + 1
        track = ck.get("track", track)
        for g in opt_pi.param_groups:
            g["lr"] = track["lr"]
        log({"resume": it0, "track": track})
    else:
        log({"start": vars(args), "params": {"pi": sum(p.numel() for p in pi.parameters()), "v": sum(p.numel() for p in vnet.parameters())}})
    clone0 = run / "pool" / "iter_0000"
    if not (clone0 / "model.onnx").exists():
        export_policy(bc, src_shapes, clone0, {"iter": 0, "fold": args.fold, "init": args.init})

    for it in range(it0, args.iters):
        if (run / "STOP").exists():
            log({"stop": "STOP file", "iter": it}); break
        t0 = time.time()
        it_dir = run / "pool" / f"iter_{it:04d}"
        if it > 0 or not (it_dir / "model.onnx").exists():
            export_policy(pi, src_shapes, it_dir, {"iter": it, "fold": args.fold, "init": args.init})
        if it % args.gate_every == 0:  # it 0 = référence (l'ancre elle-même)
            if not machine_ok(log):
                break
            g = gate(args, it_dir, clone0, run, it, log)
            sc = g["clone0"]["pairScore"]
            if it > 0 and sc is not None and args.rollback_below > 0:
                if sc > track["best_score"]:
                    track["best_iter"], track["best_score"] = it, sc
                track["bad"] = track["bad"] + 1 if sc < args.rollback_below else 0
                log({"track": track})
                if track["bad"] >= 2:
                    if track["rolled"]:
                        log({"stop": "second rollback condition", "track": track}); break
                    best = run / "pool" / f"iter_{track['best_iter']:04d}" / "policy.pt"
                    pi.load_state_dict(torch.load(best, map_location=dev)["model"])
                    track["lr"] /= 2; track["rolled"] = True; track["bad"] = 0
                    opt_pi = torch.optim.Adam(pi.parameters(), lr=track["lr"])
                    log({"rollback": track["best_iter"], "lr": track["lr"]})
                    continue
        # Adversaires passés: les 6 dernières itérations + 1 sur 5 plus anciennes (≤ 12).
        past = sorted(run.glob("pool/iter_*"))[:-1]
        pool = (past[:-6][::5] + past[-6:])[-12:]
        mix = args.mix if pool else ",".join(kv for kv in args.mix.split(",") if not kv.startswith("pool:"))
        margin = args.margin0 * args.margin_decay ** it
        if not machine_ok(log):
            break
        rdir = run / "rollout"
        shutil.rmtree(rdir, ignore_errors=True)
        ks = run_workers(args, it_dir, pool, clone0, it, rdir, mix, args.games, 1.0, margin, f"it{it}")
        t_play = time.time() - t0
        obs, masks, acts, eps, done = load_rollout(rdir, ks)
        if not machine_ok(log):
            break
        lp_old, vals = recompute(pi, vnet, dev, obs, masks, acts)
        adv, ret = gae(eps, vals, args.gamma, args.lam)
        adv_n = (adv - adv.mean()) / (adv.std() + 1e-8)
        policy_on = it >= args.value_warmup
        rho = args.bc_kl * args.bc_kl_decay ** max(0, it - args.value_warmup)
        stats = {"pl": 0.0, "vl": 0.0, "ent": 0.0, "kl": 0.0, "klBc": 0.0, "clip": 0.0, "n": 0}
        stop = False
        for ep in range(args.epochs):
            perm = np.random.default_rng(args.seed * 1000 + it * 10 + ep).permutation(len(obs))
            for i in range(0, len(perm), args.mb):
                idx = perm[i:i + args.mb]
                x = torch.from_numpy(obs[idx].astype(np.float32)).to(dev)
                m = torch.from_numpy(masks[idx]).to(dev)
                a = torch.from_numpy(acts[idx]).to(dev)
                v = vnet(x)
                vl = F.mse_loss(v, torch.from_numpy(ret[idx]).to(dev))
                opt_v.zero_grad(set_to_none=True); vl.backward()
                nn.utils.clip_grad_norm_(vnet.parameters(), 0.5); opt_v.step()
                stats["vl"] += vl.item(); stats["n"] += 1
                if not policy_on:
                    continue
                lp_all = masked_logp(pi(x), m)
                lp = lp_all.gather(1, a[:, None]).squeeze(1)
                ratio = torch.exp(lp - torch.from_numpy(lp_old[idx]).to(dev))
                ad = torch.from_numpy(adv_n[idx]).to(dev)
                pl = -torch.min(ratio * ad, ratio.clamp(1 - args.clip, 1 + args.clip) * ad).mean()
                p_all = lp_all.exp()
                ent = -(p_all * lp_all.masked_fill(~m, 0)).sum(1).mean()
                with torch.no_grad():
                    lb = masked_logp(bc(x), m)
                kl_bc = (lb.exp() * (lb - lp_all).masked_fill(~m, 0)).sum(1).mean()
                loss = pl - args.ent * ent + rho * kl_bc
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
        kinds = {}
        for e in eps:
            k = kinds.setdefault(e["kind"], [0, 0]); k[0] += e["outcome"] > 0; k[1] += 1
        log({"iter": it, "steps": len(obs), "episodes": len(eps), "policyOn": policy_on, "rho": round(rho, 4),
             "winByKind": {k: f"{w}/{n}" for k, (w, n) in kinds.items()}, "margin": round(margin, 4),
             **{k: round(v / nb, 5) for k, v in stats.items()}, "earlyStop": stop, "explVar": round(float(ev), 3),
             "msPerDec": round(float(np.mean([d["msPerLearnerDecision"] for d in done])), 2),
             "playSec": round(t_play, 1), "iterSec": round(time.time() - t0, 1),
             "heatPauses": heat["pauses"], "heatPausedSec": round(heat["pausedSec"]), "heatMax": heat["max"], "exitAborts": heat["exitAborts"]})
        torch.save({"pi": pi.state_dict(), "v": vnet.state_dict(), "opt_pi": opt_pi.state_dict(), "opt_v": opt_v.state_dict(),
                    "iter": it, "track": track}, state_f)
    else:
        it_dir = run / "pool" / f"iter_{args.iters:04d}"
        export_policy(pi, src_shapes, it_dir, {"iter": args.iters, "fold": args.fold, "init": args.init})
        if machine_ok(log):
            gate(args, it_dir, clone0, run, args.iters, log)
        log({"done": args.iters})


if __name__ == "__main__":
    main()
