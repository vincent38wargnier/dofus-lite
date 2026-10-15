#!/bin/bash
# Lance la loop 1 en MODE SÛR: un seul superviseur détaché (loop1_supervisor.sh).
# Refuse si un superviseur ou des workers loop1 tournent déjà (pas de flotte en
# double), ou si la mémoire n'est pas saine au départ. Rend la main tout de suite:
# les descripteurs hérités de l'appelant sont fermés avant de détacher.
# Paramètres du superviseur passables en environnement (MAX_ACTIVE=…, etc.).
cd "$(dirname "$0")/../.." || exit 1
ROOT=${LOOP1_ROOT:-local-observations/rl/loop1}
PIDF=$ROOT/supervisor.pid
mkdir -p "$ROOT/logs"
if [ -f "$PIDF" ] && kill -0 "$(cat "$PIDF")" 2>/dev/null; then
  echo "REFUS: superviseur déjà actif (pid $(cat "$PIDF"))"; exit 1
fi
if pgrep -f 'scripts/rl/(afterstate_gen|calc_duel|time_bench)\.cjs' > /dev/null; then
  echo "REFUS: des workers loop1 tournent déjà:"; pgrep -lf 'scripts/rl/(afterstate_gen|calc_duel|time_bench)\.cjs'; exit 1
fi
free=$(sysctl -n kern.memorystatus_level); prs=$(sysctl -n kern.memorystatus_vm_pressure_level)
if [ "$prs" -ne 1 ] || [ "$free" -lt "${START_MIN_FREE:-60}" ]; then
  echo "REFUS: mémoire pas saine (libre ${free} %, pression $prs)"; exit 1
fi
rm -f "$ROOT/shards/STOP-loop1" "$ROOT/shards/STOP-train" "$ROOT/shards/STOP-val"
for fd in 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do eval "exec $fd>&-"; done
# setsid: nouvelle session sans terminal de contrôle, hors du groupe de l'appelant.
nohup perl -e 'use POSIX qw(setsid); setsid(); exec @ARGV or die "exec: $!"' \
  bash scripts/rl/loop1_supervisor.sh >> "$ROOT/logs/supervisor.log" 2>&1 < /dev/null &
disown
sleep 3
if [ -f "$PIDF" ] && kill -0 "$(cat "$PIDF")" 2>/dev/null; then
  echo "superviseur lancé (pid $(cat "$PIDF")) — journal: $ROOT/logs/supervisor.log"
else
  echo "ÉCHEC du lancement — voir $ROOT/logs/supervisor.log"; exit 1
fi
