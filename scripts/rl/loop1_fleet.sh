#!/bin/bash
# Loop 1 — boucle d'UN worker de génération: enchaîne des shards de PER matchs
# (chacun exploitable dès que son .meta.json existe) jusqu'à K shards ou jusqu'au
# fichier STOP (arrêt propre en frontière de shard). Relance idempotente.
#   loop1_fleet.sh NAME LK SPLIT SEED_BASE PER K [args afterstate_gen...]
# Mode sûr (2026-10-14, après deux gels mémoire du Mac): lancé par
# loop1_supervisor.sh, qui exporte LOOP1_REQUIRE_SUPERVISOR=1 → aucun nouveau shard
# si le superviseur (gardien mémoire) n'est plus vivant. STOP-train / STOP-val
# n'arrêtent qu'un split (règle d'arrêt §3). 3 échecs de suite → arrêt.
NAME=$1; LK=$2; SPLIT=$3; SEED_BASE=$4; PER=$5; K=$6; shift 6
ROOT=local-observations/rl/loop1
SHARDS=$ROOT/shards
STOP=$SHARDS/STOP-loop1
mkdir -p "$SHARDS"
fails=0
for ((k = 0; k < K; k++)); do
  [ -f "$STOP" ] && { echo "STOP vu avant ${NAME}-k${k}"; break; }
  [ -f "$SHARDS/STOP-$SPLIT" ] && { echo "STOP-$SPLIT vu avant ${NAME}-k${k}"; break; }
  if [ -n "$LOOP1_REQUIRE_SUPERVISOR" ] && ! kill -0 "$(cat "$ROOT/supervisor.pid" 2>/dev/null)" 2>/dev/null; then
    echo "superviseur absent: arrêt avant ${NAME}-k${k}"; break
  fi
  out="$SHARDS/${NAME}-k${k}"
  [ -f "$out.meta.json" ] && continue
  if node scripts/rl/afterstate_gen.cjs --out "$out" --matches "$PER" --lk "$LK" --split "$SPLIT" \
    --seed0 $((SEED_BASE + k * PER)) "$@"; then
    fails=0
  else
    echo "ÉCHEC ${NAME}-k${k} (code $?)"; fails=$((fails + 1))
    [ "$fails" -ge 3 ] && { echo "3 échecs de suite: arrêt de ${NAME}"; break; }
  fi
done
echo "fin ${NAME}"
