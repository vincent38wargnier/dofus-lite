#!/bin/bash
# Sondes d'entraînement (audit de base B1 de docs/selfplay-loop1.md): chaque SPEC
# « NOM=OPTIONS » entraîne local-observations/rl/loop1/model-NOM (8 époques, tous les
# shards, OPTIONS passées telles quelles à train_afterstate.py) puis passe la porte G1.
# Une sonde à la fois; une ligne de résultat par sonde dans le journal.
#
# Partage la machine avec un test SPRT (workers calc_duel sur CPU) — voulu: la sonde
# prend le GPU. Refuse seulement si un autre entraînement ou pilote tourne.
# Sûreté identique à loop1_train.sh: caffeinate -i; garde 10 s (libre < 30 %, pression
# ≠ normale, ou thermique ≥ 2 trois fois → arrêt).
#
#   bash scripts/rl/base_probe.sh 'pcap-s7=--target wdl --sib 4 --seed 7 --ch 64 --gdim 192' ...
#   arrêt: touch local-observations/rl/loop1/STOP-probe-driver
cd "$(dirname "$0")/../.." || exit 1
R=local-observations/rl/loop1
LOG=$R/logs/probe-driver.log
PIDF=$R/probe-driver.pid
STOPF=$R/STOP-probe-driver
CHILD=$R/probe-driver.child
DONE=$R/probe-driver.done
mkdir -p "$R/logs"
[ $# -ge 1 ] || { echo "usage: base_probe.sh 'NOM=OPTIONS' ..."; exit 1; }

if [ "${PROBE_DETACHED:-0}" != 1 ]; then
  for p in "$PIDF" "$R/train-driver.pid" "$R/train1b-driver.pid"; do
    if [ -f "$p" ] && kill -0 "$(cat "$p")" 2>/dev/null; then echo "REFUS: pilote actif ($p)"; exit 1; fi
  done
  if pgrep -f 'train_afterstate\.py|afterstate_offline\.py' > /dev/null; then echo "REFUS: un entraînement tourne déjà"; exit 1; fi
  free=$(sysctl -n kern.memorystatus_level); prs=$(sysctl -n kern.memorystatus_vm_pressure_level)
  if [ "$prs" -ne 1 ] || [ "$free" -lt 60 ]; then echo "REFUS: mémoire pas saine (libre ${free} %, pression $prs)"; exit 1; fi
  for spec in "$@"; do
    [ -e "$R/model-${spec%%=*}" ] && { echo "REFUS: $R/model-${spec%%=*} existe déjà"; exit 1; }
  done
  rm -f "$STOPF" "$DONE" "$CHILD"
  for fd in 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do eval "exec $fd>&-"; done
  PROBE_DETACHED=1 nohup perl -e 'use POSIX qw(setsid); setsid(); exec @ARGV or die "exec: $!"' \
    bash "$0" "$@" >> "$LOG" 2>&1 < /dev/null &
  disown
  sleep 2
  if [ -f "$PIDF" ] && kill -0 "$(cat "$PIDF")" 2>/dev/null; then echo "pilote lancé (pid $(cat "$PIDF")) — journal: $LOG"; exit 0; fi
  echo "ÉCHEC du lancement — voir $LOG"; exit 1
fi

echo $$ > "$PIDF"
say() { echo "$(date +%H:%M:%S) $*"; }
quit() { touch "$DONE"; rm -f "$PIDF"; say "$1"; exit "${2:-1}"; }
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

say "début sondes: $* — git $(git rev-parse --short HEAD)"
for spec in "$@"; do
  N=${spec%%=*}; M=$R/model-$N
  # shellcheck disable=SC2086  # OPTIONS découpées en mots exprès
  if ! run python3 scripts/rl/train_afterstate.py --shards "$R/shards/*.meta.json" --out "$M" --epochs 8 ${spec#*=} \
      > "$R/logs/train-$N.log" 2>&1; then
    quit "ARRÊT ou échec pendant $N (voir logs/train-$N.log)"
  fi
  if ! run python3 scripts/rl/afterstate_offline.py "$M" "$R/shards/v*.meta.json" > "$R/logs/g1-$N.json" 2>&1; then
    quit "ARRÊT ou échec pendant G1 de $N (voir logs/g1-$N.json)"
  fi
  say "résultat $N: $(python3 -c 'import json,sys
g = json.load(open(sys.argv[1])); b = [json.loads(l) for l in open(sys.argv[2]) if l.startswith("{\"export\"")][-1]["best"]
d = g["N0b_proxy_minus_C1proxy"]
print("rho=%s N0b=%s N0b-C1proxy=%s (se %s) N0a-C1reel=%s valR2=%s ctrR2=%s epoch=%s" % (g["spearmanV0vsT"], g["N0b_proxy"]["meanRegret"],
      d["mean"], d["se"], g["N0a_minus_C1reel"]["mean"], b["valR2"], b["valCtrR2"], b["epoch"]))' "$R/logs/g1-$N.json" "$R/logs/train-$N.log")"
done
quit "terminé" 0
