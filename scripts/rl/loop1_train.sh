#!/bin/bash
# Loop 1 §5 — entraîne les 6 variantes du protocole (cible linear|wdl × graines
# 7, 8, 9), puis la porte hors-ligne G1 de chacune. Une variante à la fois.
#
# Sûreté (leçons du 14→15 oct.):
#  - caffeinate -i tant que ce script vit: la nuit du 14→15, la veille système
#    (≈500 cycles Sleep/DarkWake, dont des « Thermal Emergency Sleep ») a gelé
#    les workers à répétition. En éveil complet, la gestion thermique normale
#    (ventilateurs) s'applique au lieu de la mise en veille d'urgence.
#  - Garde toutes les 10 s: arrêt si mémoire libre < 30 % ou pression mémoire
#    ≠ normale, ou si la pression thermique est ≥ 2 (« heavy ») 3 fois de suite.
#  - Refuse de démarrer si un autre pilote ou des workers loop1 tournent.
#
#   bash scripts/rl/loop1_train.sh            (se détache tout seul)
#   arrêt: touch local-observations/rl/loop1/STOP-train-driver
cd "$(dirname "$0")/../.." || exit 1
R=local-observations/rl/loop1
LOG=$R/logs/train-driver.log
PIDF=$R/train-driver.pid
STOPF=$R/STOP-train-driver
CHILD=$R/train-driver.child
DONE=$R/train-driver.done
mkdir -p "$R/logs"

if [ "${LOOP1_TRAIN_DETACHED:-0}" != 1 ]; then
  if [ -f "$PIDF" ] && kill -0 "$(cat "$PIDF")" 2>/dev/null; then echo "REFUS: pilote déjà actif (pid $(cat "$PIDF"))"; exit 1; fi
  if pgrep -f 'scripts/rl/(afterstate_gen|calc_duel|time_bench)\.cjs|train_afterstate\.py' > /dev/null; then
    echo "REFUS: des processus loop1 tournent déjà"; exit 1
  fi
  free=$(sysctl -n kern.memorystatus_level); prs=$(sysctl -n kern.memorystatus_vm_pressure_level)
  if [ "$prs" -ne 1 ] || [ "$free" -lt 60 ]; then echo "REFUS: mémoire pas saine (libre ${free} %, pression $prs)"; exit 1; fi
  rm -f "$STOPF" "$DONE" "$CHILD"
  for fd in 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do eval "exec $fd>&-"; done
  LOOP1_TRAIN_DETACHED=1 nohup perl -e 'use POSIX qw(setsid); setsid(); exec @ARGV or die "exec: $!"' \
    bash "$0" >> "$LOG" 2>&1 < /dev/null &
  disown
  sleep 2
  if [ -f "$PIDF" ] && kill -0 "$(cat "$PIDF")" 2>/dev/null; then echo "pilote lancé (pid $(cat "$PIDF")) — journal: $LOG"; exit 0; fi
  echo "ÉCHEC du lancement — voir $LOG"; exit 1
fi

echo $$ > "$PIDF"
say() { echo "$(date +%H:%M:%S) $*"; }
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

say "début: 6 variantes (linear|wdl × 7,8,9) + G1 — git $(git rev-parse --short HEAD)"
for target in linear wdl; do
  for seed in 7 8 9; do
    M=$R/model-$target-s$seed
    say "entraînement $target s$seed"
    if ! run python3 scripts/rl/train_afterstate.py --shards "$R/shards/*.meta.json" --out "$M" \
        --epochs 8 --seed "$seed" --target "$target" > "$R/logs/train-$target-s$seed.log" 2>&1; then
      say "ARRÊT ou échec pendant $target s$seed (voir logs/train-$target-s$seed.log)"
      touch "$DONE"; rm -f "$PIDF"; exit 1
    fi
    say "fini $target s$seed: $(tail -1 "$R/logs/train-$target-s$seed.log" | cut -c1-220)"
    if ! run python3 scripts/rl/afterstate_offline.py "$M" "$R/shards/v*.meta.json" > "$R/logs/g1-$target-s$seed.json" 2>&1; then
      say "G1 en échec pour $target s$seed (voir logs/g1-$target-s$seed.json)"
      [ -f "$STOPF" ] && { touch "$DONE"; rm -f "$PIDF"; exit 1; }
    fi
  done
done
touch "$DONE"; rm -f "$PIDF"
say "terminé"
