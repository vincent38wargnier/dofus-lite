#!/bin/bash
# Loop 1b (amendement A2 de docs/selfplay-loop1.md) — grille « frères »: cible wdl,
# --sib λ ∈ {1, 4} × graines 7, 8, 9, précédée d'un TÉMOIN --sib 0 graine 7 (recette de
# model-wdl-s7: montre que le chemin par défaut n'a pas bougé et donne la R² centrée de
# référence; jamais candidat). Puis la porte G1 de chacun et le tableau de la barre A2
# (logs/loop1b-summary.json). Une variante à la fois.
#
# Sûreté identique à loop1_train.sh: caffeinate -i; garde 10 s (libre < 30 %, pression
# ≠ normale, ou thermique ≥ 2 trois fois → arrêt); refuse si des workers loop1 tournent.
# AFTER_PID=pid: le pilote détaché attend d'abord la fin de ce process (ex. le pilote
# SPRT en cours), puis la disparition de tout worker loop1 (≤ 5 min), avant de démarrer.
#
#   [AFTER_PID=…] bash scripts/rl/loop1b_train.sh      (se détache tout seul)
#   arrêt: touch local-observations/rl/loop1/STOP-train1b-driver
cd "$(dirname "$0")/../.." || exit 1
R=local-observations/rl/loop1
LOG=$R/logs/train1b-driver.log
PIDF=$R/train1b-driver.pid
STOPF=$R/STOP-train1b-driver
CHILD=$R/train1b-driver.child
DONE=$R/train1b-driver.done
WORKERS='scripts/rl/(afterstate_gen|calc_duel|time_bench)\.cjs|train_afterstate\.py'
VARIANTS="0:7 1:7 1:8 1:9 4:7 4:8 4:9"   # λ:graine, le premier = témoin
mkdir -p "$R/logs"

if [ "${LOOP1B_DETACHED:-0}" != 1 ]; then
  if [ -f "$PIDF" ] && kill -0 "$(cat "$PIDF")" 2>/dev/null; then echo "REFUS: pilote déjà actif (pid $(cat "$PIDF"))"; exit 1; fi
  if [ -z "${AFTER_PID:-}" ] && pgrep -f "$WORKERS" > /dev/null; then echo "REFUS: des processus loop1 tournent déjà"; exit 1; fi
  free=$(sysctl -n kern.memorystatus_level); prs=$(sysctl -n kern.memorystatus_vm_pressure_level)
  if [ "$prs" -ne 1 ] || [ "$free" -lt 60 ]; then echo "REFUS: mémoire pas saine (libre ${free} %, pression $prs)"; exit 1; fi
  rm -f "$STOPF" "$DONE" "$CHILD"
  for fd in 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do eval "exec $fd>&-"; done
  LOOP1B_DETACHED=1 AFTER_PID=${AFTER_PID:-} nohup perl -e 'use POSIX qw(setsid); setsid(); exec @ARGV or die "exec: $!"' \
    bash "$0" >> "$LOG" 2>&1 < /dev/null &
  disown
  sleep 2
  if [ -f "$PIDF" ] && kill -0 "$(cat "$PIDF")" 2>/dev/null; then echo "pilote lancé (pid $(cat "$PIDF")) — journal: $LOG"; exit 0; fi
  echo "ÉCHEC du lancement — voir $LOG"; exit 1
fi

echo $$ > "$PIDF"
say() { echo "$(date +%H:%M:%S) $*"; }
quit() { touch "$DONE"; rm -f "$PIDF"; say "$1"; exit "${2:-1}"; }

if [ -n "${AFTER_PID:-}" ]; then
  say "attente de la fin du pid $AFTER_PID"
  while kill -0 "$AFTER_PID" 2>/dev/null; do [ -f "$STOPF" ] && quit "STOP pendant l'attente"; sleep 30; done
  for _ in $(seq 30); do pgrep -f "$WORKERS" > /dev/null || break; sleep 10; done
  pgrep -f "$WORKERS" > /dev/null && quit "REFUS: des workers loop1 tournent encore 5 min après la fin du pid $AFTER_PID"
  free=$(sysctl -n kern.memorystatus_level); prs=$(sysctl -n kern.memorystatus_vm_pressure_level)
  { [ "$prs" -ne 1 ] || [ "$free" -lt 60 ]; } && quit "REFUS: mémoire pas saine (libre ${free} %, pression $prs)"
fi
caffeinate -i -w $$ &

guard() {
  local hot=0 free prs th
  while [ ! -f "$DONE" ] && kill -0 "$1" 2>/dev/null; do
    free=$(sysctl -n kern.memorystatus_level); prs=$(sysctl -n kern.memorystatus_vm_pressure_level)
    th=$(notifyutil -g com.apple.system.thermalpressurelevel 2>/dev/null | awk '{print $2+0}')
    if [ "${th:-0}" -ge 2 ]; then hot=$((hot + 1)); else hot=0; fi
    if [ "$free" -lt 30 ] || [ "$prs" -ne 1 ] || [ "$hot" -ge 3 ]; then
      say "GARDE: libre=${free}% pression=${prs} thermique=${th} (x${hot}) → arrêt"
      touch "$STOPF"
      [ -f "$CHILD" ] && kill -TERM "$(cat "$CHILD")" 2>/dev/null
      return
    fi
    sleep 10
  done
}
guard $$ &

run() {  # lance la commande en enfant suivi par la garde; échoue si arrêt demandé
  [ -f "$STOPF" ] && return 1
  "$@" &
  echo $! > "$CHILD"
  wait $!
  local rc=$?
  rm -f "$CHILD"
  [ -f "$STOPF" ] && return 1
  return $rc
}

say "début loop 1b: $VARIANTS (λ:graine, cible wdl) + G1 — git $(git rev-parse --short HEAD)"
for v in $VARIANTS; do
  lam=${v%%:*}; seed=${v##*:}; N=wdl-sib$lam-s$seed; M=$R/model-$N
  say "entraînement $N"
  if ! run python3 scripts/rl/train_afterstate.py --shards "$R/shards/*.meta.json" --out "$M" \
      --epochs 8 --seed "$seed" --target wdl --sib "$lam" > "$R/logs/train-$N.log" 2>&1; then
    quit "ARRÊT ou échec pendant $N (voir logs/train-$N.log)"
  fi
  say "fini $N: $(tail -1 "$R/logs/train-$N.log" | cut -c1-260)"
  if ! run python3 scripts/rl/afterstate_offline.py "$M" "$R/shards/v*.meta.json" > "$R/logs/g1-$N.json" 2>&1; then
    say "G1 en échec pour $N (voir logs/g1-$N.json)"
    [ -f "$STOPF" ] && quit "ARRÊT pendant G1 de $N"
  fi
done

# Tableau A2 + sélection pré-enregistrée (§11, addendum A2): recette λ = plus faible regret
# N0b_proxy moyen sur ses 3 graines, puis sa meilleure graine; en ligne seulement si CE
# modèle a mean(N0b_proxy − C1_proxy) ≤ 0. Le témoin n'est jamais candidat.
python3 - "$R" > "$R/logs/loop1b-summary.json" <<'PY'
import json, sys
R = sys.argv[1]
rows = []
for lam, seed in [(0, 7)] + [(l, s) for l in (1, 4) for s in (7, 8, 9)]:
    n = f"wdl-sib{lam}-s{seed}"
    try:
        g = json.load(open(f"{R}/logs/g1-{n}.json"))
        best = [json.loads(l) for l in open(f"{R}/logs/train-{n}.log") if l.startswith('{"export"')][-1]["best"]
    except Exception as e:
        rows.append({"model": n, "error": repr(e)}); continue
    d = g["N0b_proxy_minus_C1proxy"]
    rows.append({"model": n, "sib": lam, "seed": seed, "control": lam == 0, "bestEpoch": best["epoch"],
                 "valR2": best["valR2"], "valCtrR2": best.get("valCtrR2"),
                 "rhoVsTruth": g["spearmanV0vsT"], "rhoC1stage1": g["spearmanS0vsT"],
                 "N0b_proxy": g["N0b_proxy"], "C1_proxy": g["C1_proxy"], "N0b_minus_C1proxy": d,
                 "A2bar": d["mean"] <= 0, "N0a_minus_C1reel": g["N0a_minus_C1reel"], "N0aEligible": g["G1eligible"]["N0a"]})
cand = [r for r in rows if "error" not in r and not r["control"]]
by = {}
for r in cand:
    by.setdefault(r["sib"], []).append(r)
pick = None
if by:
    lam = min(by, key=lambda l: sum(r["N0b_proxy"]["meanRegret"] for r in by[l]) / len(by[l]))
    pick = min(by[lam], key=lambda r: r["N0b_proxy"]["meanRegret"])
print(json.dumps({"rows": rows,
                  "recipeMeanN0bRegret": {l: round(sum(r["N0b_proxy"]["meanRegret"] for r in v) / len(v), 2) for l, v in by.items()},
                  "selected": pick and pick["model"], "selectedPassesA2": bool(pick and pick["A2bar"]),
                  "anyN0aEligible": any(r["N0aEligible"] for r in cand)}, indent=1))
PY
say "résumé: $(python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); print(d["selected"], "passe A2" if d["selectedPassesA2"] else "ÉCHOUE A2", d["recipeMeanN0bRegret"])' "$R/logs/loop1b-summary.json")"
quit "terminé" 0
