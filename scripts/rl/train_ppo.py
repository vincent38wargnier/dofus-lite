#!/usr/bin/env python3
"""PPO self-play — l'IA Maison ne sert QUE de scoreboard (éval), jamais
d'adversaire d'entraînement. Boucle par itération:

  1. export des poids politique (format weights.bin+shapes.json de bot_net)
  2. selfplay_iter.cjs: rollouts échantillonnés masqués — miroir + pool de
     checkpoints passés (matchups/cartes aléatoires = max de combinaisons)
  3. recalcul batché (logp_old, valeurs) sous les MÊMES poids → GAE
  4. updates PPO (clip, entropie masquée, tête valeur) sur MPS/CUDA
  5. éval périodique vs maison (eval_net.cjs, seeds appariés) → eval.jsonl

Architecture: tronc spatial de train_bc2 (mêmes noms de modules → le
checkpoint BC se charge tel quel) + tête valeur v1/v2 (Python seulement,
le JS n'a besoin que de la politique). Reprise: --run contient state.json,
latest.pt, pool/. Stop propre via --max-hours (relançable à l'identique).

  python3 scripts/rl/train_ppo.py --run local-observations/rl/ppo-v1 \
      --seed-model local-observations/rl/ds-v1/model-bc2 --matches 448
"""
import argparse
import json
import shutil
import subprocess
import sys
import time
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

REPO = Path(__file__).resolve().parents[2]
SCRIPTS = REPO / "scripts" / "rl"

N_PLANES, H, W = 7, 14, 15
CELLS = H * W
SPELL_SLOTS = 24
PLANE_DIM = N_PLANES * CELLS


class PolicyValueNet(nn.Module):
    """SpatialNet de train_bc2 (mêmes noms → load direct des poids BC)
    + tête valeur v1/v2 branchée sur (g, pooled) comme pass_head."""

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
        self.v1 = nn.Linear(gdim + ch, 256)
        self.v2 = nn.Linear(256, 1)
        self.act = nn.GELU()
        nn.init.zeros_(self.v2.bias)
        with torch.no_grad():
            self.v2.weight.mul_(0.01)

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
        gp = torch.cat([g, pooled], dim=1)
        pas = self.pass_head(gp)
        logits = torch.cat([pas, move, cast], dim=1)
        value = self.v2(self.act(self.v1(gp))).squeeze(-1)
        return logits, value


POLICY_EXPORT_ORDER = ["conv1", "conv2", "conv3", "g1", "g2", "fuse",
                       "move_head", "cast_head", "pass_head"]


def load_js_export(model, model_dir):
    """Inverse de l'export: weights.bin + shapes.json → modules politique."""
    shapes = json.loads((Path(model_dir) / "shapes.json").read_text())
    raw = np.fromfile(Path(model_dir) / "weights.bin", dtype=np.float32)
    off = 0
    sd = model.state_dict()
    for spec in shapes["layers"]:
        shape = spec["shape"]
        size = int(np.prod(shape))
        sd[f"{spec['name']}.weight"] = torch.from_numpy(raw[off:off + size].reshape(shape).copy())
        off += size
        sd[f"{spec['name']}.bias"] = torch.from_numpy(raw[off:off + shape[0]].copy())
        off += shape[0]
    assert off == raw.size, f"export inattendu: {off} ≠ {raw.size}"
    model.load_state_dict(sd)
    return shapes


def export_js(model, out_dir, meta, metrics):
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    blobs, layers = [], []
    mods = dict(model.named_modules())
    for name in POLICY_EXPORT_ORDER:
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
        "ch": meta["ch"], "layers": layers, "metrics": metrics,
    }))


def load_rollout(data_dir):
    man = json.loads((Path(data_dir) / "manifest.json").read_text())
    obs_l, mask_l, act_l, episodes = [], [], [], []
    cur = 0
    for sh in man["shards"]:
        n = sh["steps"]
        if not n:
            continue
        obs_l.append(np.fromfile(Path(data_dir) / sh["obs"], dtype=np.float32).reshape(n, man["obsDim"]))
        mask_l.append(np.fromfile(Path(data_dir) / sh["mask"], dtype=np.uint8).reshape(n, man["maskBytes"]))
        act_l.append(np.fromfile(Path(data_dir) / sh["act"], dtype=np.uint32).astype(np.int64))
        for ep in sh["episodes"]:
            episodes.append({**ep, "start": cur})
            cur += ep["steps"]
    obs = np.concatenate(obs_l)
    masks = np.unpackbits(np.concatenate(mask_l), axis=1, count=man["actionDim"], bitorder="little").astype(bool)
    acts = np.concatenate(act_l)
    assert cur == len(obs) == len(acts), f"épisodes {cur} ≠ steps {len(obs)}"
    return man, obs, masks, acts, episodes


@torch.no_grad()
def recompute(model, device, obs, masks, acts, batch=8192):
    """logp_old et valeurs sous les poids courants (≡ poids des rollouts,
    parité JS/torch vérifiée) — évite de stocker quoi que ce soit côté JS."""
    model.eval()
    n = len(obs)
    logp = np.zeros(n, dtype=np.float32)
    vals = np.zeros(n, dtype=np.float32)
    for i in range(0, n, batch):
        sl = slice(i, min(i + batch, n))
        x = torch.from_numpy(obs[sl]).to(device)
        m = torch.from_numpy(masks[sl]).to(device)
        a = torch.from_numpy(acts[sl]).to(device)
        logits, v = model(x)
        logits = logits.masked_fill(~m, -1e9)
        lp = F.log_softmax(logits, dim=-1)
        logp[sl] = lp.gather(1, a.unsqueeze(1)).squeeze(1).float().cpu().numpy()
        vals[sl] = v.float().cpu().numpy()
    model.train()
    return logp, vals


def gae(episodes, values, gamma, lam):
    n = len(values)
    adv = np.zeros(n, dtype=np.float32)
    for ep in episodes:
        s, k, r = ep["start"], ep["steps"], ep["reward"]
        last = 0.0
        nextv = 0.0  # terminal: pas de bootstrap
        for t in range(s + k - 1, s - 1, -1):
            rt = r if t == s + k - 1 else 0.0
            delta = rt + gamma * nextv - values[t]
            last = delta + gamma * lam * last
            adv[t] = last
            nextv = values[t]
    ret = adv + values
    return adv, ret


def run_selfplay(args, weights_dir, pool, out_dir, tag, it=0):
    # Marge PV annealée: dense au départ, nulle à maturité (sinon elle se
    # farme — cf. la boucle vitalite du champion observée au playtest).
    margin_coef = args.margin_coef0 * (args.margin_decay ** it)
    cmd = ["node", str(SCRIPTS / "selfplay_iter.cjs"),
           "--weights", str(weights_dir), "--out", str(out_dir),
           "--matches", str(args.matches), "--workers", str(args.workers),
           "--poolP", str(args.pool_p), "--tag", tag,
           "--marginCoef", f"{margin_coef:.4f}", "--kiterP", str(args.kiter_p)]
    if pool:
        cmd += ["--pool", ",".join(str(p) for p in pool)]
    if args.net_summons:
        cmd += ["--net-summons"]
    cmd += monster_args(args)
    r = subprocess.run(cmd, cwd=REPO, capture_output=True, text=True, timeout=3600)
    if r.returncode != 0:
        raise RuntimeError(f"selfplay_iter a échoué:\n{r.stderr[-2000:]}")
    return json.loads(r.stdout.strip().splitlines()[-1])


def monster_args(args):
    if args.monster_p <= 0:
        return []
    out = ["--monsterP", str(args.monster_p), "--monsterId", str(args.monster_id),
           "--monsterGrade", str(args.monster_grade), "--mbrainP", str(args.mbrain_p)]
    if args.monster_map:
        out += ["--monsterMap", args.monster_map]
    return out


def run_eval(args, model_dir):
    cmd = ["node", str(SCRIPTS / "eval_net.cjs"), "--model", str(model_dir),
           "--seedsPerPair", str(args.eval_seeds), "--workers", str(args.workers),
           "--vs", "maison"]
    if args.net_summons:
        cmd += ["--net-summons"]
    r = subprocess.run(cmd, cwd=REPO, capture_output=True, text=True, timeout=3600)
    if r.returncode != 0:
        raise RuntimeError(f"eval_net a échoué:\n{r.stderr[-2000:]}")
    txt = r.stdout
    return json.loads(txt[txt.find("{"):])


def _last_json_line(path):
    for line in reversed(Path(path).read_text().strip().splitlines()):
        line = line.strip()
        if line.startswith("{"):
            return json.loads(line)
    raise RuntimeError(f"pas de ligne JSON dans {path}")


def launch_selfplay(args, weights_dir, pool, out_dir, tag, it):
    """run_selfplay non bloquant (pipeline): le GPU entraîne l'itération N
    pendant que les 16 workers CPU génèrent N+1. stdout → fichier (un PIPE
    plein bloquerait le process node)."""
    out_dir = Path(out_dir)
    if out_dir.exists():
        shutil.rmtree(out_dir)
    margin_coef = args.margin_coef0 * (args.margin_decay ** it)
    cmd = ["node", str(SCRIPTS / "selfplay_iter.cjs"),
           "--weights", str(weights_dir), "--out", str(out_dir),
           "--matches", str(args.matches), "--workers", str(args.workers),
           "--poolP", str(args.pool_p), "--tag", tag,
           "--marginCoef", f"{margin_coef:.4f}", "--kiterP", str(args.kiter_p)]
    if pool:
        cmd += ["--pool", ",".join(str(p) for p in pool)]
    if args.net_summons:
        cmd += ["--net-summons"]
    cmd += monster_args(args)
    log = open(str(out_dir) + ".log", "w")
    proc = subprocess.Popen(cmd, cwd=REPO, stdout=log, stderr=subprocess.STDOUT)
    return {"proc": proc, "out": out_dir, "log": log}


def finish_selfplay(job, timeout=1800):
    try:
        rc = job["proc"].wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        job["proc"].kill()
        raise RuntimeError("selfplay_iter bloqué (>30 min), tué")
    finally:
        job["log"].close()
    log_path = str(job["out"]) + ".log"
    if rc != 0:
        # Teardown ORT/worker_threads parfois fatal (libc++abi recursive_mutex)
        # APRÈS écriture complète (vécu iter 180): si le manifeste final est là
        # et parsable, les données sont complètes → accepter en le notant.
        try:
            gen = _last_json_line(log_path)
            if (Path(job["out"]) / "manifest.json").exists() and "wallSec" in gen:
                print(f"selfplay_iter: exit {rc} au teardown, données complètes — accepté", flush=True)
                return gen
        except Exception:
            pass
        tail = Path(log_path).read_text()[-2000:]
        raise RuntimeError(f"selfplay_iter a échoué:\n{tail}")
    return _last_json_line(log_path)


def launch_eval(args, model_dir, it):
    """Éval vs maison en arrière-plan (moins de workers: elle partage les
    cœurs avec la génération au lieu de bloquer la boucle ~25 s)."""
    cmd = ["node", str(SCRIPTS / "eval_net.cjs"), "--model", str(model_dir),
           "--seedsPerPair", str(args.eval_seeds), "--workers", str(args.eval_workers),
           "--vs", "maison"]
    if args.net_summons:
        cmd += ["--net-summons"]
    path = str(model_dir) + ".eval.log"
    log = open(path, "w")
    proc = subprocess.Popen(cmd, cwd=REPO, stdout=log, stderr=subprocess.STDOUT)
    return {"proc": proc, "iter": it, "log": log, "path": path}


def collect_evals(evals, eval_f, block=False):
    done = []
    for ej in evals:
        if block:
            try:
                ej["proc"].wait(timeout=900)
            except subprocess.TimeoutExpired:
                ej["proc"].kill()
        if ej["proc"].poll() is None:
            continue
        ej["log"].close()
        try:
            txt = Path(ej["path"]).read_text()
            ev = json.loads(txt[txt.find("{"):])
            row = {"iter": ej["iter"], "winRate": ev["netWinRate"], "matches": ev["matches"],
                   "illegalArgmax": ev["illegalArgmaxRate"], "byClass": ev["winRateByClass"]}
            eval_f.write(json.dumps(row) + "\n"); eval_f.flush()
            print(f"EVAL iter {ej['iter']}: {ev['netWinRate']:.3f} vs maison ({ev['matches']} matchs)", flush=True)
        except Exception as e:
            print(f"éval iter {ej['iter']} illisible: {e}", flush=True)
        done.append(ej)
    for ej in done:
        evals.remove(ej)


def select_pool(pool_root, cur_iter, cap=12):
    """Derniers checkpoints + anciens espacés — tous = le réseau lui-même."""
    dirs = sorted(d for d in pool_root.glob("iter_*") if d.is_dir()
                  and int(d.name.split("_")[1]) < cur_iter)
    if not dirs:
        return []
    recent = dirs[-6:]
    older = dirs[:-6][::-5][::-1]  # tous les 5, en partant de la fin
    out = older + recent
    return out[-cap:]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", default="local-observations/rl/ppo-v1")
    ap.add_argument("--seed-model", default="local-observations/rl/ds-v1/model-bc2")
    ap.add_argument("--iters", type=int, default=100000)
    ap.add_argument("--matches", type=int, default=448)
    ap.add_argument("--workers", type=int, default=13)
    ap.add_argument("--pool-p", type=float, default=0.35)
    ap.add_argument("--lr", type=float, default=1.5e-4)
    ap.add_argument("--clip", type=float, default=0.2)
    ap.add_argument("--epochs", type=int, default=3)
    ap.add_argument("--minibatch", type=int, default=4096)
    ap.add_argument("--gamma", type=float, default=0.995)
    ap.add_argument("--margin-coef0", type=float, default=0.25,
                    help="coef initial du terme de marge PV (récompense façonnée)")
    ap.add_argument("--margin-decay", type=float, default=1.0,
                    help="décroissance du coef de marge par itération (anneal façon OpenAI Five)")
    ap.add_argument("--kiter-p", type=float, default=0.0,
                    help="part des matchs contre l'ancre kiteur (anti-kite, playtest 2026-10-11)")
    # Curriculum créatures simples (stage A: bouftou-vs-bouftou sur canyon,
    # demande Vincent 2026-10-11): mêmes règles, kit minimal, complexité par étapes.
    ap.add_argument("--monster-p", type=float, default=0.0,
                    help="part des matchs en miroir monstre (curriculum stage A)")
    ap.add_argument("--monster-id", type=int, default=101)
    ap.add_argument("--monster-grade", type=int, default=5)
    ap.add_argument("--monster-map", default="")
    ap.add_argument("--mbrain-p", type=float, default=0.0,
                    help="part des matchs monstres vs cerveau utilitaire monstre (ancre + jauge)")
    ap.add_argument("--random-init", action="store_true",
                    help="départ from scratch (pas de poids BC) — test du curriculum basics-first")
    ap.add_argument("--lam", type=float, default=0.95)
    ap.add_argument("--ent", type=float, default=0.01)
    # Recuit d'entropie: explore tôt (coef haut), affûte en fin (coef bas) —
    # casse le plateau self-play en laissant la politique mûre s'engager.
    ap.add_argument("--ent-final", type=float, default=-1.0)
    ap.add_argument("--ent-anneal-iters", type=int, default=120)
    ap.add_argument("--vcoef", type=float, default=0.5)
    ap.add_argument("--kl-stop", type=float, default=0.03)
    # Ancre KL(π_BC ‖ π) décroissante (arXiv 2402.02868 / AlphaStar): protège le
    # savoir BC pendant que la valeur/politique se calibrent, puis s'efface.
    ap.add_argument("--bc-kl", type=float, default=0.0)
    ap.add_argument("--bc-kl-start", type=int, default=0)
    ap.add_argument("--bc-kl-idecay", type=float, default=0.83)
    ap.add_argument("--value-warmup", type=int, default=1)
    ap.add_argument("--eval-every", type=int, default=8)
    ap.add_argument("--eval-seeds", type=int, default=1)
    ap.add_argument("--eval-workers", type=int, default=6)
    ap.add_argument("--sync", action="store_true",
                    help="désactive le pipeline gen↔train (ancienne boucle séquentielle)")
    ap.add_argument("--max-hours", type=float, default=0)
    ap.add_argument("--net-summons", action="store_true")  # phase 1.5: net pilote ses invocations
    # Phase 2 (exploiteur): n'affronte QUE ce checkpoint gelé (poolP=1, zéro
    # miroir, zéro pool auto) → apprend à exploiter les failles du champion.
    ap.add_argument("--frozen-opponent", default="")
    ap.add_argument("--fresh", action="store_true")
    ap.add_argument("--smoke", action="store_true")
    args = ap.parse_args()
    if args.smoke:
        args.matches, args.workers, args.epochs = 16, 4, 1
        args.iters, args.eval_every = 2, 0
        args.minibatch = 1024

    run = REPO / args.run
    pool_root = run / "pool"
    rollout_dir = run / "rollout"
    if args.fresh and run.exists():
        shutil.rmtree(run)
    pool_root.mkdir(parents=True, exist_ok=True)

    device = ("mps" if torch.backends.mps.is_available()
              else "cuda" if torch.cuda.is_available() else "cpu")
    seed_shapes = json.loads((REPO / args.seed_model / "shapes.json").read_text())
    meta = {"featureVersion": seed_shapes["featureVersion"], "obsDim": seed_shapes["obsDim"],
            "actionDim": seed_shapes["actionDim"], "ch": seed_shapes["ch"]}
    torch.manual_seed(0)
    model = PolicyValueNet(meta["obsDim"], ch=meta["ch"]).to(device)
    opt = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-5)

    bc_model = None
    if args.bc_kl > 0:
        bc_model = PolicyValueNet(meta["obsDim"], ch=meta["ch"]).to(device)
        load_js_export(bc_model, REPO / args.seed_model)
        bc_model.eval()
        for p in bc_model.parameters():
            p.requires_grad = False

    state_f = run / "state.json"
    ckpt_f = run / "latest.pt"
    start_iter = 0
    if state_f.exists() and ckpt_f.exists() and not args.fresh:
        ck = torch.load(ckpt_f, map_location=device, weights_only=True)
        model.load_state_dict(ck["model"])
        opt.load_state_dict(ck["opt"])
        start_iter = json.loads(state_f.read_text())["iter"]
        print(f"reprise à l'itération {start_iter}", flush=True)
    elif args.random_init:
        print(f"init ALÉATOIRE (curriculum from scratch) — meta depuis {args.seed_model}", flush=True)
    else:
        load_js_export(model, REPO / args.seed_model)
        print(f"seed: {args.seed_model} (top1 {seed_shapes.get('metrics', {}).get('top1')})", flush=True)
    print(f"device {device} | params {sum(p.numel() for p in model.parameters()):,} "
          f"| matches/iter {args.matches}", flush=True)

    log_f = (run / "log.jsonl").open("a")
    eval_f = (run / "eval.jsonl").open("a")
    t_start = time.time()

    # Pipeline gen↔train: pendant que MPS fait l'update de l'itération N, les
    # workers CPU génèrent N+1 (données vieilles d'UNE politique → logp_old
    # recalculés sous la politique de COMPORTEMENT snapshotée, pas la courante,
    # sinon les ratios PPO mentent). ~40 % de wall-time en moins, mesuré.
    torch.set_num_threads(4)  # les cœurs sont aux workers node, pas à torch
    subprocess.run(["pkill", "-f", f"selfplay_iter.*{run.name}"], capture_output=True)  # orphelins d'un crash
    behavior = PolicyValueNet(meta["obsDim"], ch=meta["ch"]).to(device)
    behavior.eval()
    for p in behavior.parameters():
        p.requires_grad = False
    bufs = [run / "rollout_a", run / "rollout_b"]
    pending = None  # {"job", "bsd" (None = politique courante), "it"}
    evals = []

    for k in range(start_iter, args.iters):
        if args.max_hours and (time.time() - t_start) / 3600 > args.max_hours:
            print(f"--max-hours atteint, arrêt propre à l'itération {k} (relancer pour reprendre)", flush=True)
            break
        it0 = time.time()
        cur_export = pool_root / f"iter_{k:04d}"
        export_js(model, cur_export, meta, {"iter": k})
        # model.onnx à côté de weights.bin → rollouts/éval via ORT (fallback JS sinon)
        r_onnx = subprocess.run([sys.executable, str(SCRIPTS / "export_onnx.py"), str(cur_export)],
                                capture_output=True, text=True, timeout=600)
        if r_onnx.returncode != 0:
            print(f"export_onnx a échoué (les rollouts retomberont sur le forward JS): "
                  f"{r_onnx.stderr[-300:]}", flush=True)

        collect_evals(evals, eval_f)
        if args.eval_every and k % args.eval_every == 0:
            if args.sync:
                ev = run_eval(args, cur_export)
                row = {"iter": k, "winRate": ev["netWinRate"], "matches": ev["matches"],
                       "illegalArgmax": ev["illegalArgmaxRate"], "byClass": ev["winRateByClass"]}
                eval_f.write(json.dumps(row) + "\n"); eval_f.flush()
                print(f"EVAL iter {k}: {ev['netWinRate']:.3f} vs maison ({ev['matches']} matchs)", flush=True)
            else:
                evals.append(launch_eval(args, cur_export, k))

        if args.frozen_opponent:
            pool = [Path(args.frozen_opponent).resolve()]  # exploiteur: adversaire gelé unique
            args.pool_p = 1.0  # 100% vs le champion gelé, aucun miroir
        else:
            pool = select_pool(pool_root, k)
        wait_sec = 0.0
        if args.sync:
            gen = run_selfplay(args, cur_export, pool, rollout_dir, tag=f"ppo:{k}", it=k)
            data_dir, bsd = rollout_dir, None
        else:
            if pending is None:  # 1re itération du segment: rien en vol
                pending = {"job": launch_selfplay(args, cur_export, pool, bufs[k % 2], f"ppo:{k}", k),
                           "bsd": None}
            tw = time.time()
            gen = finish_selfplay(pending["job"])
            wait_sec = round(time.time() - tw, 1)
            data_dir, bsd = pending["job"]["out"], pending["bsd"]
            # Gen suivante immédiatement: poids = export courant (W_k), snapshot
            # de W_k comme politique de comportement pour l'itération k+1.
            pending = {"job": launch_selfplay(args, cur_export, pool, bufs[(k + 1) % 2], f"ppo:{k + 1}", k + 1),
                       "bsd": {kk: v.detach().cpu().clone() for kk, v in model.state_dict().items()}}
        man, obs, masks, acts, episodes = load_rollout(data_dir)
        n = len(obs)
        if n < args.minibatch:
            print(f"iter {k}: trop peu de steps ({n}), skip", flush=True)
            continue

        if bsd is not None:
            behavior.load_state_dict(bsd)
            logp_old, _ = recompute(behavior, device, obs, masks, acts)
            logp_cur0, values = recompute(model, device, obs, masks, acts)
            # Décalage hérité du pipeline (données vieilles d'une politique):
            # sans lui, le kl-stop se déclenche au 1er minibatch après une
            # grosse update → itérations en dents de scie full/no-op.
            kl0 = float(np.mean(logp_old - logp_cur0))
        else:
            logp_old, values = recompute(model, device, obs, masks, acts)
            kl0 = 0.0
        adv, ret = gae(episodes, values, args.gamma, args.lam)
        adv = (adv - adv.mean()) / (adv.std() + 1e-8)

        warmup = k < args.value_warmup
        # Ratchet du pipeline: à kl0 élevé, même une update 1-epoch REGONFLE
        # kl0 (ratios dispersés → l'objectif clippé sur-corrige). Le reset
        # fiable = geler la politique une itération → on en profite pour
        # entraîner la valeur (GAE meilleure ensuite) au lieu d'un no-op.
        freeze_policy = warmup or kl0 > 0.045
        for name, p in model.named_parameters():
            p.requires_grad = True if not freeze_policy else name.startswith(("v1", "v2"))

        tr0 = time.time()
        ent_final = args.ent if args.ent_final < 0 else args.ent_final
        frac = min(1.0, k / max(1, args.ent_anneal_iters))
        ent_coef = args.ent + (ent_final - args.ent) * frac
        rho = args.bc_kl * (args.bc_kl_idecay ** max(0, k - args.bc_kl_start)) if bc_model is not None else 0.0
        sums = {"pl": 0.0, "vl": 0.0, "ent": 0.0, "kl": 0.0, "clip": 0.0, "klBc": 0.0}
        nmb = 0
        stop = False
        # Gouverneur de dérive pipeline: la divergence réelle n'apparaît que
        # sur le batch SUIVANT (kl0), jamais pendant l'update (distribution
        # shift) — donc quand l'héritage est gros, update douce (1 epoch) au
        # lieu d'un no-op au 1er minibatch (vu iter 158: kl0 0.056 > cap).
        n_epochs = args.epochs if (freeze_policy or kl0 <= 0.035) else 1
        for _ in range(n_epochs):
            if stop:
                break
            perm = np.random.permutation(n)
            for i in range(0, n - args.minibatch + 1, args.minibatch):
                sel = np.sort(perm[i:i + args.minibatch])
                x = torch.from_numpy(obs[sel]).to(device)
                m = torch.from_numpy(masks[sel]).to(device)
                a = torch.from_numpy(acts[sel]).to(device)
                lo = torch.from_numpy(logp_old[sel]).to(device)
                ad = torch.from_numpy(adv[sel]).to(device)
                rt = torch.from_numpy(ret[sel]).to(device)
                logits, v = model(x)
                logits = logits.masked_fill(~m, -1e9)
                lp_all = F.log_softmax(logits, dim=-1)
                lp = lp_all.gather(1, a.unsqueeze(1)).squeeze(1)
                ratio = (lp - lo).exp()
                pl = -torch.min(ratio * ad, ratio.clamp(1 - args.clip, 1 + args.clip) * ad).mean()
                ent = -(lp_all.exp() * lp_all).sum(-1).mean()
                vl = 0.5 * (v - rt).pow(2).mean()
                loss = vl * args.vcoef if freeze_policy else pl + args.vcoef * vl - ent_coef * ent
                if rho > 1e-3 and not freeze_policy:  # sous ~1e-3 l'ancre ne pèse plus rien: on économise le forward BC
                    with torch.no_grad():
                        bl, _ = bc_model(x)
                        bp = F.log_softmax(bl.masked_fill(~m, -1e9), dim=-1)
                    kl_bc = (bp.exp() * (bp - lp_all)).sum(-1).mean()
                    loss = loss + rho * kl_bc
                    sums["klBc"] += float(kl_bc.detach())
                opt.zero_grad(set_to_none=True)
                loss.backward()
                nn.utils.clip_grad_norm_([p for p in model.parameters() if p.requires_grad], 0.5)
                opt.step()
                with torch.no_grad():
                    kl = float((lo - lp).mean())
                    sums["pl"] += float(pl); sums["vl"] += float(vl); sums["ent"] += float(ent)
                    sums["kl"] += kl; sums["clip"] += float(((ratio - 1).abs() > args.clip).float().mean())
                nmb += 1
                # Nouvelle dérive bornée à kl_stop, divergence TOTALE vs la
                # politique de comportement bornée à 0.05 (validité des ratios).
                if not freeze_policy and (kl - kl0 > args.kl_stop or kl > 0.05):
                    stop = True
                    break

        torch.save({"model": model.state_dict(), "opt": opt.state_dict(), "iter": k + 1}, ckpt_f)
        state_f.write_text(json.dumps({"iter": k + 1, "time": time.time()}))
        row = {"iter": k, "steps": n, "matches": args.matches,
               "winVsPool": gen.get("winVsPool"), "winVsKiter": gen.get("winVsKiter"),
               "winVsMbrain": gen.get("winVsMbrain"),
               "marginCoef": gen.get("marginCoef"), "drawRate": gen.get("drawRate"),
               "rewardMean": gen.get("rewardMean"), "decMs": gen.get("avgDecisionMs"),
               "legal": gen.get("avgLegal"), "genSec": gen.get("wallSec"), "waitSec": wait_sec,
               "trainSec": round(time.time() - tr0, 1),
               "iterSec": round(time.time() - it0, 1), "kl0": round(kl0, 4),
               "warmup": warmup, "vOnly": bool(freeze_policy and not warmup), "rho": round(rho, 4),
               "entCoef": round(ent_coef, 4),
               **{kk: round(vv / max(1, nmb), 4) for kk, vv in sums.items()}}
        log_f.write(json.dumps(row) + "\n"); log_f.flush()
        print(json.dumps(row), flush=True)

    # Fin de segment: tuer la gen en vol (sera régénérée à la reprise),
    # attendre les évals en cours pour ne pas perdre de points de courbe.
    if pending is not None:
        pending["job"]["proc"].kill()
        pending["job"]["log"].close()
    collect_evals(evals, eval_f, block=True)


if __name__ == "__main__":
    main()
