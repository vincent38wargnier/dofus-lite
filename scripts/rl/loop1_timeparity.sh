#!/bin/bash
# Loop 1 §7 — parité de temps: budget B du challenger = le plus grand de
# {1200, 1800, 2400, 3000, 3600, 4800} dont le rapport des moyennes (ms/décision,
# challenger ÷ C1, chronométrés en alternance sur les 60 positions figées) est
# ≤ 1,00 aux DEUX niveaux. l100 d'abord pour tous les B (bon marché), puis l200gear
# en descendant parmi les B qui passent à l100, jusqu'au premier qui passe.
# À lancer machine CALME, sous caffeinate (la veille fausse les chronos).
#   caffeinate -i bash scripts/rl/loop1_timeparity.sh MODEL_DIR [MODE=prelim]
cd "$(dirname "$0")/../.." || exit 1
NET=$1; NM=${2:-prelim}
[ -f "$NET/model.onnx" ] || { echo "pas de $NET/model.onnx"; exit 1; }
OUT=local-observations/rl/loop1/timeparity-$(basename "$NET")-$NM.jsonl
spec() { echo "fc=1+b=$1+h=1+net=$NET+nm=$NM"; }
ratio() { python3 -c 'import json,sys; print(json.loads(sys.stdin.read())["ratioOfMeans"])'; }
le1() { awk -v r="$1" 'BEGIN { exit !(r <= 1.0) }'; }
pass=()
for B in 1200 1800 2400 3000 3600 4800; do
  line=$(node scripts/rl/time_bench.cjs time l100 "$(spec "$B")" | tail -1)
  echo "$line" | tee -a "$OUT"
  r=$(echo "$line" | ratio) || exit 1
  le1 "$r" && pass+=("$B")
done
[ ${#pass[@]} -eq 0 ] && { echo '{"chosen": null, "reason": "aucun B <= 1.00 a l100"}' | tee -a "$OUT"; exit 0; }
for B in $(printf '%s\n' "${pass[@]}" | sort -rn); do
  line=$(node scripts/rl/time_bench.cjs time l200gear "$(spec "$B")" | tail -1)
  echo "$line" | tee -a "$OUT"
  r=$(echo "$line" | ratio) || exit 1
  if le1 "$r"; then echo "{\"chosen\": $B}" | tee -a "$OUT"; exit 0; fi
done
echo '{"chosen": null, "reason": "aucun B <= 1.00 aux deux niveaux"}' | tee -a "$OUT"
