#!/bin/bash
# Loop 1 — superviseur « mode sûr » (2026-10-14, après deux gels du Mac: 18 workers
# lancés d'un coup → compresseur mémoire saturé → apps suspendues → reset au bouton).
# Lance les slots du protocole (§3 génération, §4 étalonnage, banc §7) PAR PALIERS et
# garde la mémoire du Mac en zone sûre, contrôlée toutes les 5 s:
#  - arrêt d'urgence de tous les slots si pression noyau critique (4), mémoire
#    disponible < STOP_FREE %, ou compresseur > départ + COMP_STOP_GB;
#  - délestage du slot le plus récent (plafond abaissé d'autant) si pression ≥ 2,
#    disponible < SHED_FREE %, RSS de la flotte > FLEET_CAP_MB ou compresseur
#    > départ + COMP_SHED_GB; au plus un délestage par COOLDOWN s;
#  - un node > PROC_CAP_MB = fuite: slot tué et abandonné;
#  - un slot de plus toutes les RAMP_EVERY s, seulement si la mémoire est saine.
# Règle d'arrêt §3: STOP-train à 1,8M records train (≥ 35 % l200gear) ou TRAIN_WALL;
# STOP-loop1 à ≥ 400 décisions GT (≥ 150 l200gear) après STOP-train, ou ALL_WALL.
# Un seul superviseur (supervisor.pid). Arrêt complet: kill <pid du superviseur>.
# Lancer via scripts/rl/loop1_safe_launch.sh. TEST_CMD=… remplace chaque slot (essais).
# Pas de `set -m`: le contrôle de tâches de bash se dispute le terminal avec l'appelant
# (blocages vus en essai). Chaque slot devient chef de son propre groupe via setpgrp.
cd "$(dirname "$0")/../.." || exit 1
ROOT=${LOOP1_ROOT:-local-observations/rl/loop1}
L=$ROOT/logs; SH=$ROOT/shards; PIDF=$ROOT/supervisor.pid; STAT=$ROOT/supervisor.status
mkdir -p "$L" "$SH" "$ROOT/calib"
echo $$ > "$PIDF"

MAX_ACTIVE=${MAX_ACTIVE:-12}; START_ACTIVE=${START_ACTIVE:-4}; RAMP_EVERY=${RAMP_EVERY:-300}
RAMP_MIN_FREE=${RAMP_MIN_FREE:-50}; SHED_FREE=${SHED_FREE:-38}; STOP_FREE=${STOP_FREE:-28}
COMP_SHED_GB=${COMP_SHED_GB:-6}; COMP_STOP_GB=${COMP_STOP_GB:-10}
EST_SLOT_MB=${EST_SLOT_MB:-600}; FLEET_CAP_MB=${FLEET_CAP_MB:-$((MAX_ACTIVE * EST_SLOT_MB))}
PROC_CAP_MB=${PROC_CAP_MB:-1500}; COOLDOWN=${COOLDOWN:-120}; START_GAP=${START_GAP:-10}
TRAIN_WALL=${TRAIN_WALL:-21600}; ALL_WALL=${ALL_WALL:-28800}
export NODE_OPTIONS="--max-old-space-size=${HEAP_MB:-1024}"
export LOOP1_REQUIRE_SUPERVISOR=1
MAX_NOW=$MAX_ACTIVE

log() { echo "$(date '+%H:%M:%S') $*"; }

# ------------------------------------------------------------- slots (priorité)
N=0
add() { NAME[$N]=$1; KIND[$N]=$2; CMD[$N]=${TEST_CMD:-$3}; STATE[$N]=pending; PG[$N]=0; TS[$N]=0; N=$((N + 1)); }
gen() { add "$1" "$3" "bash scripts/rl/loop1_fleet.sh $1 $2 $3 $4 10 999 $5"; } # NAME LK SPLIT SEED [extra]
GT='--gt-prob 0.25 --gt-k 16'
gen t200-w0 l200gear train 3000000
gen t100-w0 l100 train 2000000
gen v200-w0 l200gear val 5000000 "$GT"
[ -f "$ROOT/bench-positions-l200gear.jsonl" ] || add tbuild-l200gear bench "node scripts/rl/time_bench.cjs build l200gear 60"
gen t200-w1 l200gear train 3100000
gen v100-w0 l100 val 4000000 "$GT"
add calib-w0 calib "bash scripts/rl/loop1_calib.sh 0"
gen t200-w2 l200gear train 3200000
gen t100-w1 l100 train 2100000
gen v200-w1 l200gear val 5100000 "$GT"
gen t200-w3 l200gear train 3300000
add calib-w1 calib "bash scripts/rl/loop1_calib.sh 1"
gen t200-w4 l200gear train 3400000
gen t100-w2 l100 train 2200000
add calib-w2 calib "bash scripts/rl/loop1_calib.sh 2"
gen t200-w5 l200gear train 3500000
gen t100-w3 l100 train 2300000
add calib-w3 calib "bash scripts/rl/loop1_calib.sh 3"

start_slot() { # i
  local i=$1
  perl -e 'setpgrp(0, 0); exec @ARGV or die "exec: $!"' nice -n 10 bash -c "${CMD[$i]}" >> "$L/${NAME[$i]}.log" 2>&1 < /dev/null &
  PG[$i]=$!; STATE[$i]=active; TS[$i]=$(date +%s)
  log "START ${NAME[$i]} (pgid ${PG[$i]})"
}
kill_slot() { # i reason — tue tout le groupe du slot (boucle bash + node)
  local i=$1 pg=${PG[$1]}
  [ "$pg" -gt 1 ] 2>/dev/null || return
  kill -TERM -- "-$pg" 2>/dev/null; sleep 3; kill -KILL -- "-$pg" 2>/dev/null
  log "KILL ${NAME[$i]} (pgid $pg): $2"
}
count_active() { local c=0 i; for ((i = 0; i < N; i++)); do [ "${STATE[$i]}" = active ] && c=$((c + 1)); done; echo $c; }
next_pending() {
  local i
  for ((i = 0; i < N; i++)); do
    [ "${STATE[$i]}" = pending ] || continue
    [ "${KIND[$i]}" = train ] && [ -f "$SH/STOP-train" ] && continue
    { [ "${KIND[$i]}" = train ] || [ "${KIND[$i]}" = val ]; } && [ -f "$SH/STOP-loop1" ] && continue
    echo $i; return
  done
  echo -1
}
youngest_active() {
  local i best=-1 bt=-1
  for ((i = 0; i < N; i++)); do
    [ "${STATE[$i]}" = active ] && [ "${TS[$i]}" -ge "$bt" ] && { best=$i; bt=${TS[$i]}; }
  done
  echo $best
}
slot_of_pgid() { local i; for ((i = 0; i < N; i++)); do [ "${STATE[$i]}" = active ] && [ "${PG[$i]}" = "$1" ] && { echo $i; return; }; done; echo -1; }
fleet() { # → "totalMB maxNodeMB pgidOfMaxNode" sur les groupes des slots actifs; vide si ps > 5 s
  local ids=" " i out
  for ((i = 0; i < N; i++)); do [ "${STATE[$i]}" = active ] && ids="$ids${PG[$i]} "; done
  out=$(perl -e 'alarm 5; exec @ARGV' ps -axo pgid=,rss=,comm= 2>/dev/null) || return 0
  awk -v ids="$ids" 'index(ids, " " $1 " ") { t += $2; if ($3 ~ /node$/ && $2 > m) { m = $2; g = $1 } } END { printf "%d %d %d\n", t / 1024, m / 1024, g + 0 }' <<< "$out"
}
comp_gb() { vm_stat | awk '/Pages stored in compressor/ { gsub(/\./, "", $5); printf "%d\n", $5 * 16384 / 1073741824 }'; }
stop_all() { # TERM à tous les groupes d'un coup, puis KILL 3 s plus tard
  local i
  touch "$SH/STOP-loop1"
  for ((i = 0; i < N; i++)); do
    [ "${STATE[$i]}" = active ] && [ "${PG[$i]}" -gt 1 ] && kill -TERM -- "-${PG[$i]}" 2>/dev/null
  done
  sleep 3
  for ((i = 0; i < N; i++)); do
    if [ "${STATE[$i]}" = active ]; then
      [ "${PG[$i]}" -gt 1 ] && kill -KILL -- "-${PG[$i]}" 2>/dev/null
      STATE[$i]=stopped; log "KILL ${NAME[$i]} (pgid ${PG[$i]}): $1"
    fi
  done
}
stop_rule() { # règle d'arrêt §3, à partir des manifests de shards
  local tr sh gt gt200
  read -r tr sh gt gt200 <<< "$(python3 scripts/rl/loop1_status.py 2>/dev/null | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin); g = d.get("groups", {})
    print(d.get("trainRecords", 0), d.get("trainL200Share") or 0, d.get("gtDecisions", 0),
          sum(v.get("gt", 0) for k, v in g.items() if k.startswith("l200gear/")))
except Exception:
    print(0, 0, 0, 0)')"
  if [ ! -f "$SH/STOP-train" ] && [ "${tr:-0}" -ge 1800000 ] && awk -v s="${sh:-0}" 'BEGIN { exit !(s >= 0.35) }'; then
    touch "$SH/STOP-train"; log "règle §3: $tr records train (part l200gear $sh) → STOP-train"
  fi
  if [ -f "$SH/STOP-train" ] && [ ! -f "$SH/STOP-loop1" ] && [ "${gt:-0}" -ge 400 ] && [ "${gt200:-0}" -ge 150 ]; then
    touch "$SH/STOP-loop1"; log "règle §3: $gt décisions GT ($gt200 l200gear) → STOP-loop1"
  fi
}
trap 'log "signal reçu: arrêt de tous les slots"; stop_all signal; rm -f "$PIDF"; exit 0' TERM INT

# ------------------------------------------------------------- boucle
T0=$(date +%s); COMP0=$(comp_gb); LAST_SHED=0; LAST_LOG=0; LAST_RULE=$T0; LAST_GROW=$T0
log "superviseur pid $$ | slots=$N max=$MAX_ACTIVE départ=$START_ACTIVE palier=${RAMP_EVERY}s | ajout si libre≥${RAMP_MIN_FREE}% | délestage si libre<${SHED_FREE}%, pression≥2, flotte>${FLEET_CAP_MB}MB ou compresseur+${COMP_SHED_GB}GB | urgence si libre<${STOP_FREE}%, pression 4 ou compresseur+${COMP_STOP_GB}GB | node≤${PROC_CAP_MB}MB, tas ${HEAP_MB:-1024}MB | compresseur au départ ${COMP0}GB"
for ((s = 0; s < START_ACTIVE; s++)); do
  i=$(next_pending); [ "$i" -ge 0 ] || break
  start_slot "$i"; sleep "$START_GAP"
done
LAST_RAMP=$(date +%s)
FMB=0; PMAX=0; PGMAX=0
while :; do
  now=$(date +%s); el=$((now - T0))
  # 1) urgence d'abord, sur les seuls compteurs noyau (sysctl, vm_stat: jamais lents).
  #    ps peut bloquer plusieurs secondes (vu: 8 s, ~60 s) — il ne doit pas retarder le frein.
  free=$(sysctl -n kern.memorystatus_level); prs=$(sysctl -n kern.memorystatus_vm_pressure_level)
  comp=$(comp_gb); dcomp=$((comp - COMP0))
  if [ "$prs" -ge 4 ] || [ "$free" -lt "$STOP_FREE" ] || [ "$dcomp" -ge "$COMP_STOP_GB" ]; then
    log "ARRÊT D'URGENCE: libre=${free}% pression=$prs compresseur=${comp}GB(+$dcomp) flotte=${FMB}MB"
    stop_all urgence; break
  fi
  f=$(fleet)
  if [ -n "$f" ]; then read -r FMB PMAX PGMAX <<< "$f"; else log "ps > 5 s: mesure de la flotte sautée (dernière: ${FMB}MB)"; PMAX=0; fi
  fmb=$FMB; pmax=$PMAX; pgmax=$PGMAX
  for ((i = 0; i < N; i++)); do
    if [ "${STATE[$i]}" = active ] && ! kill -0 -- "-${PG[$i]}" 2>/dev/null; then STATE[$i]=done; log "FIN ${NAME[$i]}"; fi
  done
  act=$(count_active)
  # 2) fuite d'un processus
  if [ "$pmax" -gt "$PROC_CAP_MB" ]; then
    i=$(slot_of_pgid "$pgmax")
    if [ "$i" -ge 0 ]; then kill_slot "$i" "node à ${pmax}MB > ${PROC_CAP_MB}MB (fuite?)"; STATE[$i]=failed; continue; fi
  fi
  # 3) délestage
  if [ "$act" -gt 0 ] && [ $((now - LAST_SHED)) -ge "$COOLDOWN" ] && { [ "$prs" -ge 2 ] || [ "$free" -lt "$SHED_FREE" ] || [ "$fmb" -gt "$FLEET_CAP_MB" ] || [ "$dcomp" -ge "$COMP_SHED_GB" ]; }; then
    i=$(youngest_active)
    kill_slot "$i" "délestage: libre=${free}% pression=$prs flotte=${fmb}MB compresseur+${dcomp}GB"
    STATE[$i]=pending; MAX_NOW=$((act - 1)); LAST_SHED=$now; LAST_GROW=$now; LAST_RAMP=$now
    continue
  fi
  healthy=0
  [ "$prs" -eq 1 ] && [ "$free" -ge "$RAMP_MIN_FREE" ] && [ "$dcomp" -lt $((COMP_SHED_GB / 2)) ] && healthy=1
  # 4) plafond remonté lentement après un délestage
  if [ "$healthy" -eq 1 ] && [ "$MAX_NOW" -lt "$MAX_ACTIVE" ] && [ $((now - LAST_GROW)) -ge $((2 * RAMP_EVERY)) ]; then
    MAX_NOW=$((MAX_NOW + 1)); LAST_GROW=$now; log "plafond remonté à $MAX_NOW"
  fi
  # 5) montée en charge
  if [ "$healthy" -eq 1 ] && [ "$act" -lt "$MAX_NOW" ] && [ $((now - LAST_RAMP)) -ge "$RAMP_EVERY" ] && [ $((fmb + EST_SLOT_MB)) -le "$FLEET_CAP_MB" ]; then
    i=$(next_pending)
    if [ "$i" -ge 0 ]; then start_slot "$i"; LAST_RAMP=$now; fi
  fi
  # 6) règle d'arrêt du protocole
  if [ $((now - LAST_RULE)) -ge 600 ]; then LAST_RULE=$now; stop_rule; fi
  [ "$el" -ge "$TRAIN_WALL" ] && [ ! -f "$SH/STOP-train" ] && { touch "$SH/STOP-train"; log "TRAIN_WALL atteint → STOP-train"; }
  [ "$el" -ge "$ALL_WALL" ] && [ ! -f "$SH/STOP-loop1" ] && { touch "$SH/STOP-loop1"; log "ALL_WALL atteint → STOP-loop1"; }
  # 7) sortie
  if [ "$act" -eq 0 ] && { [ "$(next_pending)" -lt 0 ] || [ "$el" -ge "$ALL_WALL" ]; }; then log "plus rien en cours ni à lancer: fin"; break; fi
  # journal + statut chaque minute
  if [ $((now - LAST_LOG)) -ge 60 ]; then
    LAST_LOG=$now; names=""
    for ((i = 0; i < N; i++)); do [ "${STATE[$i]}" = active ] && names="$names ${NAME[$i]}"; done
    log "libre=${free}% pression=$prs compresseur=${comp}GB(+$dcomp) flotte=${fmb}MB maxnode=${pmax}MB actifs=$act/$MAX_NOW:$names"
    printf '{"t":"%s","elapsedSec":%d,"freePct":%d,"pressure":%d,"compressorGB":%d,"compressorDeltaGB":%d,"fleetMB":%d,"maxNodeMB":%d,"active":%d,"cap":%d}\n' \
      "$(date '+%H:%M:%S')" "$el" "$free" "$prs" "$comp" "$dcomp" "$fmb" "$pmax" "$act" "$MAX_NOW" > "$STAT"
  fi
  [ $(( $(date +%s) - now )) -gt 20 ] && log "itération lente: $(( $(date +%s) - now )) s"
  sleep 5
done
rm -f "$PIDF"
log "superviseur terminé"
