#!/bin/bash
# Enchaînement détaché (indépendant du terminal): attend la fin de la phase 3 (rl1-run3),
# puis lance la phase 4 (rl1-run4) depuis la dernière ancre de la phase 3 (docs/selfplay-rl2.md).
cd "$(dirname "$0")/../.." || exit 1
R3=local-observations/rl/rl1-run3; O=local-observations/rl/rl1-run1/opponents
LOG=local-observations/rl/chain-p4.log
echo "$(date +%H:%M:%S) attente de la fin de la phase 3" >> $LOG
until [ -f $R3/train.pid ] && ! kill -0 "$(cat $R3/train.pid)" 2>/dev/null; do sleep 60; done
END=$(grep '"end"' $R3/log.jsonl | tail -1)
echo "$(date +%H:%M:%S) phase 3 terminée: $END" >> $LOG
[ -n "$END" ] || { echo "$(date +%H:%M:%S) pas de ligne end (arrêt anormal): phase 4 NON lancée" >> $LOG; exit 1; }
ANCHOR=$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["anchor"])' "$END")
TRAINER=rl3_train.py ALLOW_SHARED=1 bash scripts/rl/rl1_launch.sh local-observations/rl/rl1-run4 --init "$ANCHOR" --init-value $R3/state.pt \
  --siblings $O/sib7,$O/sib8,$O/sib12 --label-p 0.1 --label-k 8 --ce 1.0 --seed 13 >> $LOG 2>&1
