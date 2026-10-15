#!/usr/bin/env python3
"""Bilan d'un duel calc_duel.cjs (fichiers jsonl, globs acceptés): victoires de
SPEC_A par niveau, paires de graines (sièges inversés), test du signe sur les
paires décidées, et taux de changement du candidat-politique (A3).

  python3 scripts/rl/duel_tally.py 'local-observations/rl/value-cra3/cduel-a3r4s9-vs-a1-b600-*.jsonl'
"""
import collections
import glob
import json
import math
import sys

rows = []
for pat in sys.argv[1:]:
    for f in sorted(glob.glob(pat)):
        rows += [json.loads(line) for line in open(f) if line.strip()]
if not rows:
    sys.exit("aucune partie")


def sign_p(k, n):  # bilatéral, H0 p=0.5
    if n == 0:
        return 1.0
    lo = min(k, n - k)
    return min(1.0, 2 * sum(math.comb(n, i) for i in range(lo + 1)) / 2 ** n)


def report(name, R):
    n = len(R)
    w = sum(r["result"] == "W" for r in R)
    d = sum(r["result"] == "D" for r in R)
    se = math.sqrt(max(w / n * (1 - w / n), 1e-9) / n)
    by = collections.defaultdict(list)
    for r in R:
        by[(r["lk"], r["offset"], r["i"] >> 1)].append(r["result"])
    pc = collections.Counter(tuple(sorted(v)) for v in by.values() if len(v) == 2)
    ww, ll = pc.get(("W", "W"), 0), pc.get(("L", "L"), 0)
    nom = sum(r.get("nomA", 0) for r in R)
    chg = sum(r.get("chgA", 0) for r in R)
    dec = sum(r.get("decA", 0) for r in R)
    print(f"{name}: A wins {w}/{n} = {w / n:.1%} ± {se:.1%} (draws {d}) | pairs {sum(pc.values())}: "
          f"won both {ww}, split {pc.get(('L', 'W'), 0)}, lost both {ll} → sign p={sign_p(ww, ww + ll):.3g}"
          + (f" | candidate nominated {nom}/{dec} decisions, changed the move {chg} ({chg / max(1, dec):.1%})" if nom else ""))


specs = {(r["specA"], r["specB"]) for r in rows}
print("specs:", specs)
for lk in sorted({r["lk"] for r in rows}):
    report(f"  {lk}", [r for r in rows if r["lk"] == lk])
report("  all", rows)
