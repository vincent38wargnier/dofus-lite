#!/bin/bash
# RL1 (docs/selfplay-rl1.md) — lance rl1_train.py détaché (setsid + nohup), sous
# caffeinate -i, après les refus de sûreté (pas d'autre entraînement / test en cours,
# mémoire saine). Arrêt propre: touch RUN/STOP (fin d'itération); reprise = relancer.
#   [TRAINER=rl3_train.py] [ALLOW_SHARED=1] bash scripts/rl/rl1_launch.sh RUN [options du trainer…]
# ALLOW_SHARED=1: n'exige pas une machine vide (le frein thermique de run_workers protège).
cd "$(dirname "$0")/../.." || exit 1
RUN=$1; shift
[ -n "$RUN" ] || { echo "usage: rl1_launch.sh RUN [options rl1_train.py]"; exit 1; }
mkdir -p "$RUN"
if [ -f "$RUN/train.pid" ] && kill -0 "$(cat "$RUN/train.pid")" 2>/dev/null; then echo "REFUS: déjà en cours (pid $(cat "$RUN/train.pid"))"; exit 1; fi
TRAINER=${TRAINER:-rl1_train.py}
if [ "${ALLOW_SHARED:-0}" != 1 ] && pgrep -f 'scripts/rl/(afterstate_gen|calc_duel|time_bench|rl1_selfplay|selfplay_iter)\.cjs|train_afterstate\.py|rl[13]_train\.py|train_ppo\.py' > /dev/null; then
  echo "REFUS: un autre entraînement ou test tourne"; exit 1
fi
free=$(sysctl -n kern.memorystatus_level); prs=$(sysctl -n kern.memorystatus_vm_pressure_level)
if [ "$prs" -ne 1 ] || [ "$free" -lt 60 ]; then echo "REFUS: mémoire pas saine (libre ${free} %, pression $prs)"; exit 1; fi
rm -f "$RUN/STOP"
for fd in 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do eval "exec $fd>&-"; done
nohup perl -e 'use POSIX qw(setsid); setsid(); exec @ARGV or die "exec: $!"' \
  python3 "scripts/rl/$TRAINER" --out "$RUN" "$@" >> "$RUN/train.out" 2>&1 < /dev/null &
pid=$!
echo "$pid" > "$RUN/train.pid"
nohup caffeinate -i -w "$pid" > /dev/null 2>&1 &
disown -a
sleep 3
if kill -0 "$pid" 2>/dev/null; then echo "RL1 lancé (pid $pid) — journal: $RUN/log.jsonl"; exit 0; fi
echo "ÉCHEC du lancement — voir $RUN/train.out"; exit 1
