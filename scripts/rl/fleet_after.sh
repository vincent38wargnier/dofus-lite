#!/bin/bash
# Reconversion d'un slot de la flotte SANS perte: attend la fin du shard en
# cours (WAIT_PID) puis lance fleet_loop.sh avec les nouveaux paramètres.
#   fleet_after.sh WAIT_PID NAME MODE SEED_BASE MATCHES_PER_SHARD K [args value_gen...]
WAIT_PID=$1; shift
while kill -0 "$WAIT_PID" 2>/dev/null; do sleep 15; done
echo "slot libéré (pid $WAIT_PID) → fleet_loop $*"
exec "$(dirname "$0")/fleet_loop.sh" "$@"
