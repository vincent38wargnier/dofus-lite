#!/bin/bash
# A/B sur LE MÊME dataset (déjà construit): bras A = recette de base, bras B =
# même recette + TRAIN_EXTRA_B. B lance son entraînement (GPU) dès que A a fini
# le sien, pendant que les gates de A tournent (CPU). À lancer détaché (nohup):
# un entraînement de 12 modèles dépasse la limite de 2 h des tâches suivies.
#   clone_ab.sh PREFIXES TAG "SEEDS" RUN_B "TRAIN_EXTRA_B"
set -u
PREFIXES=$1; TAG=$2; SEEDS=$3; RUN_B=$4; EXTRA_B=$5
D=local-observations/rl/value-cra3
EPOCHS=${EPOCHS:-60}
export EPOCHS
echo "[$(date +%H:%M)] A/B $TAG: bras A (base) seeds $SEEDS"
SKIP_LABELS=1 bash scripts/rl/clone_round.sh "$PREFIXES" "$TAG" "$SEEDS" > $D/round-$TAG-A.log 2>&1 &
A=$!
need=$(echo $SEEDS | wc -w)
until [ "$(for S in $SEEDS; do [ -f $D/policy-spatial-$TAG-e${EPOCHS}c-s$S/ep$EPOCHS/parity_v.json ] && echo x; done | wc -l)" -ge "$need" ]; do
  kill -0 $A 2>/dev/null || { echo "ARRÊT: bras A terminé sans ses instantanés"; exit 1; }
  sleep 30
done
echo "[$(date +%H:%M)] bras A entraîné → bras B ($RUN_B: $EXTRA_B)"
SKIP_LABELS=1 RUN="$RUN_B" TRAIN_EXTRA="$EXTRA_B" bash scripts/rl/clone_round.sh "$PREFIXES" "$TAG" "$SEEDS" > $D/round-$TAG$RUN_B-B.log 2>&1
wait $A
echo "[$(date +%H:%M)] fin A/B $TAG"
