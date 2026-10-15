#!/bin/bash
# Boucle de génération d'UN worker: enchaîne des shards courts (chacun = point
# de contrôle utilisable dès que son .meta.json existe) jusqu'à K shards ou
# jusqu'à l'apparition du fichier STOP (arrêt propre en frontière de shard).
#   fleet_loop.sh NAME MODE SEED_BASE MATCHES_PER_SHARD K [extra value_gen args...]
NAME=$1; MODE=$2; SEED_BASE=$3; PER=$4; K=$5; shift 5
SHARDS=local-observations/rl/value-cra3/shards
STOP=local-observations/rl/value-cra3/STOP-d2
for ((k = 0; k < K; k++)); do
  [ -f "$STOP" ] && { echo "STOP vu avant ${NAME}-k${k}"; break; }
  out="$SHARDS/${NAME}-k${k}"
  [ -f "$out.meta.json" ] && continue  # déjà complet (relance idempotente)
  node scripts/rl/value_gen.cjs --out "$out" --matches "$PER" --mode "$MODE" \
    --seed0 $((SEED_BASE + k * PER)) "$@" || echo "ÉCHEC ${NAME}-k${k} (code $?)"
done
echo "fin ${NAME}"
