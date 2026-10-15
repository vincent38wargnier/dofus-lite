#!/bin/bash
# Gate FIXE d'un clone vs maison: 4 blocs × 32 parties (miroir CRA, graines
# appariées, sièges alternés) — les mêmes blocs que la référence
# policy-spatial-d1 (77-51) et que l'ancien clone plat (0/96 sur o8000/o10000/o0).
#   scripts/rl/clone_gate.sh MODEL_DIR TAG   → value-cra3/gate-TAG-*.jsonl + résumé
MODEL=$1; TAG=$2
[ -z "$MODEL" ] || [ -z "$TAG" ] && { echo "usage: clone_gate.sh MODEL_DIR TAG"; exit 1; }
OUT=local-observations/rl/value-cra3
pids=()
for spec in "l100 0" "l100 8000" "l200gear 0" "l200gear 10000"; do
  set -- $spec
  f="$OUT/gate-$TAG-$1-o$2.jsonl"; rm -f "$f"
  SB_SEED_OFFSET=$2 node scripts/rl/policy_eval.cjs 32 CRA "$1" "$MODEL" "$f" > "$f.log" 2>&1 &
  pids+=($!)
done
wait "${pids[@]}"
node -e '
const fs=require("fs"); const [out,tag]=process.argv.slice(1);
let W=0,N=0; const rows=[];
for (const [lk,o] of [["l100",0],["l100",8000],["l200gear",0],["l200gear",10000]]) {
  const f=`${out}/gate-${tag}-${lk}-o${o}.jsonl`;
  const r=fs.existsSync(f)?fs.readFileSync(f,"utf8").trim().split("\n").filter(Boolean).map(JSON.parse):[];
  const w=r.filter(x=>x.result==="W").length; W+=w; N+=r.length;
  const ms=r.length?r.reduce((a,x)=>a+x.ms,0)/r.length:0; const inv=r.reduce((a,x)=>a+x.inv,0);
  rows.push(`${lk} o${o}: ${w}-${r.length-w} (n=${r.length}, invalid=${inv}, ${ms.toFixed(0)} ms/dec)`);
}
console.log(JSON.stringify({gate:tag, wins:W, games:N, winRate:+(W/Math.max(1,N)).toFixed(3), blocks:rows}));' "$OUT" "$TAG"
