#!/bin/bash
# Loop 1 §4 — étalonnage « double temps »: C1@2400 vs C1@1200 (même profil sinon),
# 32 parties par worker (16 paires), l100 puis l200gear.
#   loop1_calib.sh W   (W = 0..3 → offsets 300000+16W puis 310000+16W)
# Mode sûr: un niveau déjà complet (32 parties) est sauté; un fichier partiel
# (worker délesté puis relancé) est mis de côté, car calc_duel AJOUTE ses résultats
# et rejouerait les mêmes graines → doublons. Pas de nouveau niveau sans superviseur.
W=$1
ROOT=local-observations/rl/loop1
OUT=$ROOT/calib
mkdir -p "$OUT"
A='fc=1+rv=1+b=2400+h=1'; B='fc=1+rv=1+b=1200+h=1'
run() { # LK OFFSET
  local f="$OUT/c2x-$1-w$W.jsonl" n
  if [ -n "$LOOP1_REQUIRE_SUPERVISOR" ] && ! kill -0 "$(cat "$ROOT/supervisor.pid" 2>/dev/null)" 2>/dev/null; then
    echo "superviseur absent: $1 non lancé"; return 1
  fi
  if [ -f "$f" ]; then
    n=$(wc -l < "$f" | tr -d ' ')
    [ "$n" -ge 32 ] && { echo "$1 déjà complet ($n parties)"; return 0; }
    mv "$f" "$f.partial-$(date +%Y%m%d-%H%M%S)"; echo "$1: fichier partiel ($n parties) mis de côté"
  fi
  SB_SEED_OFFSET=$2 node scripts/rl/calc_duel.cjs 32 "$1" "$A" "$B" "$f" >> "$OUT/c2x-$1-w$W.log" 2>&1
}
run l100 $((300000 + 16 * W)) && run l200gear $((310000 + 16 * W))
echo "fin calib w$W"
