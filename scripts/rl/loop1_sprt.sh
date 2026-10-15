#!/bin/bash
# Loop 1 §8 — test en ligne SPRT d'un challenger contre C1 à temps égal. Paires de
# parties (même graine, sièges inversés); sprt.py --normalized toutes les 60 s;
# arrêt sur H1, H0, plafond de MAXP paires (TRUNCATED = « non prouvé »), ou rapport
# de temps courant A/B > 1,10 après 16 paires (VOID-TIME: test nul, §7).
#
# Travail en BLOCS de BP paires: bloc b = graines OFFSET + b·BP …, fichier bNNN.jsonl
# propre au bloc (une graine n'est jamais rejouée; un bloc interrompu est abandonné,
# ses paires complètes comptent). Nombre de workers piloté par la CHALEUR, comme le
# superviseur de génération: départ W_START; pression thermique ≥ 2 trois contrôles
# de suite → le worker le plus récent est tué et la cible baisse de 1; COOL_MIN
# minutes à 0 → la cible remonte de 1 (plafond W_MAX). Reprise: relancer avec le même
# NAME et RESUME=1 continue au bloc suivant (compteur NAME/next-block); tout fichier
# *.jsonl déjà écrit dans NAME compte.
#
# Sûreté (leçons du 14→15 oct.): caffeinate -i pendant toute la durée; mémoire libre
# < 30 % ou pression ≠ normale → arrêt de tout. Chaque worker est chef de son groupe.
#
#   bash scripts/rl/loop1_sprt.sh NAME LK OFFSET ELO0 ELO1 SPEC_A [SPEC_B] [W_MAX]
#   env: W_START=2  BP=25  COOL_MIN=10  MAXP=600  RESUME=0
#   arrêt: touch local-observations/rl/loop1/sprt/NAME/STOP
cd "$(dirname "$0")/../.." || exit 1
if [ $# -lt 6 ]; then echo "usage: NAME LK OFFSET ELO0 ELO1 SPEC_A [SPEC_B=C1] [W_MAX=4]"; exit 1; fi
NAME=$1; LK=$2; OFFSET=$3; ELO0=$4; ELO1=$5; SPEC_A=$6
SPEC_B=${7:-fc=1+rv=1+b=1200+h=1}; W_MAX=${8:-4}
W_START=${W_START:-2}; BP=${BP:-25}; COOL_MIN=${COOL_MIN:-10}; MAXP=${MAXP:-600}
[ "$W_START" -gt "$W_MAX" ] && W_START=$W_MAX
D=local-observations/rl/loop1/sprt/$NAME
LOG=$D/driver.log
mkdir -p "$D"

if [ "${LOOP1_SPRT_DETACHED:-0}" != 1 ]; then
  if [ -f "$D/driver.pid" ] && kill -0 "$(cat "$D/driver.pid")" 2>/dev/null; then echo "REFUS: $NAME déjà en cours"; exit 1; fi
  if [ -f "$D/done" ]; then
    [ "${RESUME:-0}" = 1 ] || { echo "REFUS: $NAME terminé ($(cat "$D/done")) — RESUME=1 pour continuer"; exit 1; }
    mv "$D/done" "$D/done.$(date +%Y%m%d-%H%M%S)"
  fi
  if pgrep -f 'scripts/rl/(afterstate_gen|calc_duel|time_bench)\.cjs|train_afterstate\.py' > /dev/null; then
    echo "REFUS: des processus loop1 tournent déjà"; exit 1
  fi
  free=$(sysctl -n kern.memorystatus_level); prs=$(sysctl -n kern.memorystatus_vm_pressure_level)
  if [ "$prs" -ne 1 ] || [ "$free" -lt 60 ]; then echo "REFUS: mémoire pas saine (libre ${free} %, pression $prs)"; exit 1; fi
  rm -f "$D/STOP"
  for fd in 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do eval "exec $fd>&-"; done
  LOOP1_SPRT_DETACHED=1 W_START=$W_START BP=$BP COOL_MIN=$COOL_MIN MAXP=$MAXP nohup \
    perl -e 'use POSIX qw(setsid); setsid(); exec @ARGV or die "exec: $!"' \
    bash "$0" "$@" >> "$LOG" 2>&1 < /dev/null &
  disown
  sleep 2
  if [ -f "$D/driver.pid" ] && kill -0 "$(cat "$D/driver.pid")" 2>/dev/null; then echo "test $NAME lancé (pid $(cat "$D/driver.pid")) — journal: $LOG"; exit 0; fi
  echo "ÉCHEC du lancement — voir $LOG"; exit 1
fi

echo $$ > "$D/driver.pid"
say() { echo "$(date +%H:%M:%S) $*"; }
caffeinate -i -w $$ &
NB=$(cat "$D/next-block" 2>/dev/null || echo 0)
MAXB=$(( 10000 / BP ))   # l'espace de graines d'un test = 10 000 graines au-dessus d'OFFSET
declare -a PG BLK T0
running() { # slot → vrai si son process vit (zombie = mort)
  local p=${PG[$1]:-}
  [ -n "$p" ] && kill -0 "$p" 2>/dev/null && [ "$(ps -o stat= -p "$p" 2>/dev/null | cut -c1)" != Z ]
}
alive() { local n=0 s; for ((s = 0; s < W_MAX; s++)); do running "$s" && n=$((n + 1)); done; echo $n; }
start_block() {
  local s b off f
  for ((s = 0; s < W_MAX; s++)); do running "$s" || break; done
  [ "$s" -ge "$W_MAX" ] && return 1
  [ "$NB" -ge "$MAXB" ] && return 1
  b=$NB; off=$((OFFSET + b * BP)); NB=$((NB + 1)); echo "$NB" > "$D/next-block"
  f=$(printf '%s/b%03d.jsonl' "$D" "$b")
  SB_SEED_OFFSET=$off perl -e 'setpgrp(0, 0); exec @ARGV or die "exec: $!"' \
    node scripts/rl/calc_duel.cjs $((2 * BP)) "$LK" "$SPEC_A" "$SPEC_B" "$f" >> "${f%.jsonl}.log" 2>&1 &
  PG[$s]=$!; BLK[$s]=$b; T0[$s]=$(date +%s)
  say "bloc $b → slot $s (pgid ${PG[$s]}, graines $off..$((off + BP - 1)))"
}
kill_slot() { [ -n "${PG[$1]:-}" ] && kill -TERM -"${PG[$1]}" 2>/dev/null; say "bloc ${BLK[$1]:-?} interrompu (slot $1)"; PG[$1]=""; }
newest_slot() {
  local s best=-1 bt=0
  for ((s = 0; s < W_MAX; s++)); do running "$s" && [ "${T0[$s]}" -ge "$bt" ] && { best=$s; bt=${T0[$s]}; }; done
  echo $best
}
stop_all() { local s; for ((s = 0; s < W_MAX; s++)); do running "$s" && kill -TERM -"${PG[$s]}" 2>/dev/null; PG[$s]=""; done; }
readout() { python3 scripts/rl/sprt.py "$D/*.jsonl" --normalized --elo0 "$ELO0" --elo1 "$ELO1" --max-pairs "$MAXP" 2>/dev/null; }
finish() { # verdict
  stop_all
  local st; st=$(readout); echo "$st" > "$D/status.json"
  say "FIN ($1): $st"
  echo "$1" > "$D/done"; rm -f "$D/driver.pid"; exit 0
}
trap 'say "signal reçu"; finish SIGNAL' TERM INT

say "test $NAME | $LK | A=$SPEC_A | B=$SPEC_B | bornes nElo [$ELO0, $ELO1] | blocs de $BP paires dès le bloc $NB (graines dès $((OFFSET + NB * BP))) | workers $W_START→max $W_MAX, +1 après ${COOL_MIN} min froides | git $(git rev-parse --short HEAD)"
target=$W_START; hot=0; cool=0; tick=0
while true; do
  for ((s = 0; s < W_MAX; s++)); do
    if [ -n "${PG[$s]:-}" ] && ! running "$s"; then say "bloc ${BLK[$s]} terminé (slot $s)"; PG[$s]=""; fi
  done
  [ -f "$D/STOP" ] && finish STOP
  while [ "$(alive)" -lt "$target" ]; do start_block || break; done
  sleep 10; tick=$((tick + 1))
  free=$(sysctl -n kern.memorystatus_level); prs=$(sysctl -n kern.memorystatus_vm_pressure_level)
  th=$(notifyutil -g com.apple.system.thermalpressurelevel 2>/dev/null | awk '{print $2+0}')
  if [ "$free" -lt 30 ] || [ "$prs" -ne 1 ]; then say "GARDE mémoire: libre=${free}% pression=${prs}"; finish STOPPED-MEMORY; fi
  if [ "${th:-0}" -ge 2 ]; then hot=$((hot + 1)); cool=0; elif [ "${th:-0}" -eq 0 ]; then cool=$((cool + 1)); hot=0; else hot=0; cool=0; fi
  if [ "$hot" -ge 3 ]; then
    [ "$(alive)" -le 1 ] && { say "GARDE thermique ($th) avec un seul worker"; finish STOPPED-THERMAL; }
    target=$(( $(alive) - 1 )); kill_slot "$(newest_slot)"; hot=0; cool=0
    say "GARDE thermique ($th): cible ramenée à $target worker(s)"
  fi
  if [ "$cool" -ge $((COOL_MIN * 6)) ] && [ "$target" -lt "$W_MAX" ]; then
    target=$((target + 1)); cool=0; say "froid depuis ${COOL_MIN} min: cible portée à $target worker(s)"
  fi
  if [ $((tick % 6)) -eq 0 ]; then
    st=$(readout); echo "$st" > "$D/status.json"
    read -r vd np tr llr ne <<< "$(python3 -c 'import json,sys
d = json.loads(sys.stdin.read() or "{}")
print(d.get("verdict", "?"), d.get("pairs", 0), d.get("timeRatioAoverB", 0), d.get("llr", 0), d.get("nElo"))' <<< "$st")"
    say "paires=$np llr=$llr nElo=$ne tempsA/B=$tr verdict=$vd workers=$(alive)/$target libre=${free}% thermique=${th}"
    case "$vd" in H1|H0|TRUNCATED) finish "$vd" ;; esac
    if [ "$np" -ge 16 ] && awk -v r="$tr" 'BEGIN { exit !(r > 1.10) }'; then finish VOID-TIME; fi
    [ "$(alive)" -eq 0 ] && [ "$NB" -ge "$MAXB" ] && finish EXHAUSTED
  fi
done
