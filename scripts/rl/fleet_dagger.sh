#!/bin/bash
# Worker DAgger: attend la fin du process WAIT_PID (shard en cours d'un autre
# worker → aucun travail perdu, pas de sur-occupation), puis enchaîne des
# shards où le CLONE joue (proba 1−β) et le PROF étiquette chaque position.
#   fleet_dagger.sh WAIT_PID NAME LK SEED_BASE MATCHES_PER_SHARD K ACTOR BETA
WAIT_PID=$1; NAME=$2; LK=$3; SEED_BASE=$4; PER=$5; K=$6; ACTOR=$7; BETA=$8
SHARDS=local-observations/rl/value-cra3/shards
STOP=local-observations/rl/value-cra3/STOP-dg1
while kill -0 "$WAIT_PID" 2>/dev/null; do sleep 15; done
echo "slot libéré (pid $WAIT_PID) → DAgger $NAME $LK β=$BETA acteur=$ACTOR"
for ((k = 0; k < K; k++)); do
  [ -f "$STOP" ] && { echo "STOP vu avant ${NAME}-k${k}"; break; }
  out="$SHARDS/${NAME}-k${k}"
  [ -f "$out.meta.json" ] && continue
  node scripts/rl/value_gen.cjs --out "$out" --matches "$PER" --mode search --lk "$LK" \
    --seed0 $((SEED_BASE + k * PER)) --eps 0.08 --budget 4000 --actor "$ACTOR" --beta "$BETA" \
    || echo "ÉCHEC ${NAME}-k${k} (code $?)"
done
echo "fin ${NAME}"
