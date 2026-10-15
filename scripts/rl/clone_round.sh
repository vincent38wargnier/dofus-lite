#!/bin/bash
# Une MANCHE complète du clone, sans intervention: labels → N graines entraînées
# (même recette) → parité → gate 128 parties par graine (règle anti-oscillation).
# La force en jeu varie énormément d'une graine à l'autre (12%→68% sur d1):
# on juge une recette/un jeu de données sur la MOYENNE de plusieurs graines.
#   scripts/rl/clone_round.sh PREFIXES DATA_TAG "7 8 9"
#   ex: clone_round.sh d1-,d2- d12 "7 8 9"
set -u
PREFIXES=$1; TAG=$2; SEEDS=$3
D=local-observations/rl/value-cra3
# SKIP_LABELS=1: réutilise policy-$TAG déjà construit (contrôle et traitement
# construits au MÊME instant → mêmes shards de base, seule la variable testée diffère).
# TRAIN_EXTRA: options d'entraînement supplémentaires; RUN: suffixe des sorties.
RUN=${RUN:-}
EPOCHS=${EPOCHS:-60}  # dernier instantané gaté = ep$EPOCHS
if [ "${SKIP_LABELS:-0}" != "1" ]; then
  echo "[$(date +%H:%M)] manche $TAG$RUN: labels ($PREFIXES)"
  node scripts/rl/make_policy_labels.cjs --shards $D/shards --out $D/policy-$TAG --prefix "$PREFIXES" > $D/labels-$TAG.log 2>&1 || { echo "ÉCHEC labels"; exit 1; }
else
  echo "[$(date +%H:%M)] manche $TAG$RUN: labels existants réutilisés"
fi
node -e '
const m=JSON.parse(require("fs").readFileSync(process.argv[1]+"/meta.json"));
console.log(JSON.stringify({rows:m.rows, shards:m.shards, badLabel:m.badLabel, byType:m.byType, bySrc:m.bySrc}));
if (m.badLabel>0 || m.rows<1000) { console.log("ARRÊT: labels suspects"); process.exit(2); }' $D/policy-$TAG || exit 1
echo "[$(date +%H:%M)] entraînement graines: $SEEDS ${TRAIN_EXTRA:-}"
pids=()
for S in $SEEDS; do
  python3 scripts/rl/train_policy.py --arch spatial --epochs $EPOCHS --cosine --seed $S --save-every 20 ${TRAIN_EXTRA:-} \
    --data $D/policy-$TAG --out $D/policy-spatial-$TAG$RUN-e${EPOCHS}c-s$S > $D/train-sp-$TAG$RUN-e${EPOCHS}c-s$S.log 2>&1 &
  pids+=($!)
done
for p in "${pids[@]}"; do wait $p || echo "ÉCHEC entraînement pid $p"; done
for S in $SEEDS; do
  M=$D/policy-spatial-$TAG$RUN-e${EPOCHS}c-s$S/ep$EPOCHS
  [ -f $M/weights.bin ] || { echo "ARRÊT: $M manquant"; exit 1; }
  node scripts/rl/policy_net.cjs parity $M 2>&1 | grep -q '"ok":true' || { echo "ARRÊT: parité KO $M"; exit 1; }
done
echo "[$(date +%H:%M)] parité OK — gates"
for S in $SEEDS; do
  CLONE_NO_OSC=1 scripts/rl/clone_gate.sh $D/policy-spatial-$TAG$RUN-e${EPOCHS}c-s$S/ep$EPOCHS $TAG$RUN-s$S-ep$EPOCHS-noosc
done
echo "[$(date +%H:%M)] fin manche $TAG$RUN"
