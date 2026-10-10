#!/usr/bin/env python3
"""Fit the forgemagie weight law on captured server attempts.

Law (one formula for every rune):
    X  = weight at stake: the rune's weight on a natural line, the whole line's
         weight after the rune for an over or exo (what the 101 cap limits)
    r  = K / X - M                      (score in %, natural lines also capped)
    SC = r within [1, 66]    N = min(50, r + 50, 100 - SC), at least 0    EC = rest
The split is the 2009 devblog one: SC never below 1 %, N at most 50 % and close
to it unless the attempt is very easy (-> SC) or very hard (-> EC).

Reading of the server messages (consistent with every capture so far):
    no message -> SC        194 -> SN (also when only the puits paid)
    117        -> EC not fully covered by the puits (sent even on an empty item)
    183        -> nothing lost: EC covered by the puits, or an SN that nothing
                  could pay (devblog: an unfunded neutral result has no effect)
The puits is not sent by the server. It is re-estimated from the visible losses,
starting at 0 for each captured item; this assumption is written to the output.

Rows whose natural cap would bind (light runes on natural lines) carry no
information on K or M; they are reported, not fitted.
"""
import argparse
import json
import math
from pathlib import Path

from observe_retro import ROOT
from summarize_forgemagie import summarize

DATA = json.loads((ROOT / 'src/engine/forgemagieData.json').read_text())
EQUIPMENT = json.loads((ROOT / 'src/engine/equipmentData.json').read_text())
STATS = DATA['stats']
BY_EFFECT = {}
for stat, d in STATS.items():
    BY_EFFECT[d['effect']] = (stat, 1)
    if d.get('negativeEffect'):
        BY_EFFECT[d['negativeEffect']] = (stat, -1)
for legacy, modern in {110: 125, 121: 112, 127: 169, 2100: 168}.items():
    BY_EFFECT.setdefault(legacy, BY_EFFECT[modern])
RUNES = {(r['stat'], r['power']): r for r in DATA['runes'] if r.get('supported')}
# Piles that never succeeded cannot be identified from server data alone.
PILE_HINTS = {408815464: ('pa', 1, 'inferred from the player workflow: restore the AP after filling vitality')}
ADOPTED = {'K': 1000, 'M': 70}
OUTPUT = ROOT / 'src/engine/forgemagieCalibration.json'


def items_by_id():
    found = {}

    def walk(x):
        if isinstance(x, dict):
            if 'effects' in x and isinstance(x.get('id'), int) and 'level' in x:
                found[x['id']] = x
            for v in x.values():
                walk(v)
        elif isinstance(x, list):
            for v in x:
                walk(v)
    walk(EQUIPMENT)
    return found


ITEMS = items_by_id()


def engine_stats(snapshot):
    out = {}
    for effect, value in (snapshot or {}).items():
        mapped = BY_EFFECT.get(int(effect))
        if mapped and value is not None:
            stat, sign = mapped
            out[stat] = out.get(stat, 0) + sign * value
    return out


def bounds(item):
    b = {}
    for effect, low, high, *_ in item['effects']:
        mapped = BY_EFFECT.get(effect)
        if not mapped:
            continue
        stat, sign = mapped
        lo, hi = (low, max(low, high)) if sign > 0 else (-max(low, high), -low)
        old = b.get(stat, (0, 0))
        b[stat] = (old[0] + lo, old[1] + hi)
    return b


def load(path):
    data = path.read_bytes()
    # A live writer may be midway through its last JSON line.
    lines = data.splitlines() if data.endswith(b'\n') else data.splitlines()[:-1]
    return [json.loads(line) for line in lines if line]


def tag(attempt):
    meanings = {m['meaning'] for m in attempt['information']}
    if attempt['result'] == 'success':
        return 'S-' if 'success_with_stat_loss' in meanings else 'S+'
    return 'F-' if 'failure_with_stat_loss' in meanings else 'F0'


def identify_piles(attempts):
    """Map each consumed pile to (stat, power) from a success that added a whole rune."""
    piles = {}
    for a in attempts:
        if a['tag'] not in ('S+', 'S-') or not a.get('before_known'):
            continue
        before, after = engine_stats(a['before_stats']), engine_stats(a['after_stats'])
        gains = {s: after.get(s, 0) - before.get(s, 0) for s in set(before) | set(after)}
        gains = {s: n for s, n in gains.items() if n > 0}
        # A neutral success can be partly paid by its own line: only whole gains identify.
        if len(gains) == 1:
            (stat, power), = gains.items()
            if (stat, power) in RUNES:
                if a['pile'] is not None:
                    piles.setdefault(a['pile'], (stat, power, 'observed success'))
                a['rune_from_gain'] = (stat, power, 'observed success')
    return piles


def build_rows(paths):
    rows = []
    for session, path in enumerate(paths, 1):
        attempts = summarize(load(path))['attempts']
        previous = None
        for a in attempts:
            a['tag'] = tag(a)
            used = a['quantity_decreases_observed']
            a['pile'] = used[0]['uid'] if used else None
            # The last unit of a pile is removed (OR) instead of decremented (OQ).
            if a['pile'] is None and previous and previous['quantity_after'] == 1:
                a['pile'] = previous['pile']
            a['quantity_after'] = used[0]['after'] if used else None
            previous = a
        piles = {**identify_piles(attempts), **PILE_HINTS}
        puits = {}
        for a in attempts:
            item = ITEMS.get(a.get('template'))
            rune = a.get('rune_from_gain') or piles.get(a['pile'])
            # Committed beside the engine: no object UIDs, addresses or timestamps.
            row = {'session': session, 'attempt': a['attempt'], 'item': a.get('item'), 'template': a.get('template'),
                   'tag': a['tag']}
            if not item or not rune or not a.get('before_known'):
                row['excluded'] = 'unknown rune' if item and a.get('before_known') else 'unknown item state'
                rows.append(row)
                continue
            stat, power, provenance = rune
            before, after = engine_stats(a['before_stats']), engine_stats(a['after_stats'])
            b = bounds(item)
            sw = STATS[stat]['weight']
            current = before.get(stat, 0)
            natural_max = max(0, b.get(stat, (0, 0))[1])
            mode = 'natural' if stat in b and current + power <= natural_max else ('over' if natural_max > 0 else 'exo')
            stake = power * sw if mode == 'natural' else (current + power) * sw
            # Visible losses, including the part of the target line that paid.
            lost = 0.0
            for s in set(before) | set(after):
                delta = after.get(s, 0) - before.get(s, 0)
                if s == stat and a['tag'] in ('S+', 'S-'):
                    delta -= power
                lost += max(0, -delta) * STATS[s]['weight']
            cost = math.ceil(round(power * sw, 6))
            key = (path.name, a['template'])
            puits_before = puits.get(key, 0)
            if a['tag'] == 'S+':
                outcome, puits_after = 'SC', puits_before
            elif a['tag'] == 'S-':
                outcome, puits_after = 'SN', max(0, puits_before + math.ceil(round(lost, 6)) - cost)
            elif a['tag'] == 'F-':
                outcome, puits_after = 'EC', max(0, puits_before + math.ceil(round(lost, 6)) - cost)
            elif puits_before >= cost:
                outcome, puits_after = 'EC', puits_before - cost
            else:
                outcome, puits_after = 'SN', puits_before
            puits[key] = puits_after
            row.update(rune=RUNES[(stat, power)]['name'], runeId=RUNES[(stat, power)]['id'], provenance=provenance,
                       stat=stat, power=power, current=current, naturalMax=natural_max, mode=mode,
                       stake=round(stake, 6), outcome=outcome, puitsBefore=puits_before, puitsAfter=puits_after,
                       before=before)
            rows.append(row)
    return rows


def split(score):
    sc = min(66, max(1, score))
    n = max(0, min(50, score + 50, 100 - sc))
    # Floors only keep the likelihood finite; the engine uses the exact split.
    return {'SC': sc / 100, 'SN': max(1e-12, n / 100), 'EC': max(1e-12, (100 - sc - n) / 100)}


def law(row, k, m):
    # Fitted rows never reach the natural cap, so the cap is left out here.
    return split(k / row['stake'] - m)


def power_law(row, a, b):
    sc = min(0.66, (a / row['stake']) ** 2)
    sn = min(0.5, 1 - sc, (b / row['stake']) ** 2)
    return {'SC': sc, 'SN': sn, 'EC': max(1e-12, 1 - sc - sn)}


def informative(row):
    # A natural light rune hits the devblog cap (15-66 %): no information on K or M.
    return row['mode'] != 'natural' or ADOPTED['K'] / row['stake'] - ADOPTED['M'] < 15


def nll(rows, k, m, model=law):
    return -sum(math.log(model(r, k, m)[r['outcome']]) for r in rows)


def fit(rows, model=law, starts=((1000, 70), (700, 50), (1400, 90))):
    from scipy.optimize import minimize
    best = min((minimize(lambda p: nll(rows, *p, model) if min(p) > 0 else 1e9, x0, method='Nelder-Mead',
                         options={'xatol': 1e-8, 'fatol': 1e-10, 'maxiter': 20000})
                for x0 in starts), key=lambda r: r.fun)

    def interval(index):
        grid = [best.x[index] * (0.3 + 0.01 * i) for i in range(171)]
        inside = []
        for g in grid:
            other = minimize(lambda z: nll(rows, *((g, z[0]) if index == 0 else (z[0], g)), model) if z[0] > 0 else 1e9,
                             [best.x[1 - index]], method='Nelder-Mead')
            if other.fun - best.fun <= 1.920729:  # 95 % profile likelihood
                inside.append(g)
        return [round(min(inside), 3), round(max(inside), 3)]
    names = ('K', 'M') if model is law else ('A', 'B')
    return {names[0]: round(best.x[0], 4), names[1]: round(best.x[1], 4), 'nll': round(best.fun, 4),
            'ci95': {names[0]: interval(0), names[1]: interval(1)}}


def conditions(rows, a, b):
    groups = {}
    for r in rows:
        key = f"{r['item']} · {r['rune']} · {r['mode']} · X={r['stake']:g}"
        g = groups.setdefault(key, {'condition': key, 'n': 0, 'observed': {'SC': 0, 'SN': 0, 'EC': 0},
                                    'expected': {'SC': 0, 'SN': 0, 'EC': 0}, 'fitted': informative(r)})
        g['n'] += 1
        g['observed'][r['outcome']] += 1
        for k, v in law(r, a, b).items():
            g['expected'][k] = round(g['expected'][k] + v, 3)
    return sorted(groups.values(), key=lambda g: g['condition'])


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('journals', type=Path, nargs='*')
    parser.add_argument('--output', type=Path, default=OUTPUT)
    args = parser.parse_args()
    paths = args.journals or sorted((ROOT / 'local-observations/forgemagie').glob('network-*.jsonl'))
    rows = build_rows(paths)
    usable = [r for r in rows if 'excluded' not in r]
    fitted_rows = [r for r in usable if informative(r)]
    result = fit(fitted_rows)
    adopted = {**ADOPTED, 'nll': round(nll(fitted_rows, ADOPTED['K'], ADOPTED['M']), 4),
               'withinCi95': all(lo <= ADOPTED[k] <= hi for k, (lo, hi) in result['ci95'].items())}
    # Same data, previous candidate: SC = (A/X)^2, SN = (B/X)^2 (no devblog split).
    alternative = fit(fitted_rows, power_law, ((5, 10), (3, 6), (8, 15)))
    out = {'version': 2, 'model': 'retro-weight-law-v4',
           'law': 'r = K/X - M (%); SC = r within [1, 66]; N = min(50, r + 50, 100 - SC) >= 0; EC = rest. '
                  'X = rune weight (natural line, also under the devblog cap) or whole line weight after '
                  'the rune (over/exo).',
           'adopted': adopted, 'fit': result, 'alternatives': {'powerLaw': alternative},
           'messages': {'none': 'SC', '194': 'SN', '117': 'EC not covered by the puits',
                        '183': 'no loss: EC covered by the puits, or SN that nothing could pay'},
           'assumptions': ['Puits estimated from visible losses; starts at 0 for each captured item.',
                           'Only clean critical successes identify a rune pile; other piles are excluded '
                           'unless listed in PILE_HINTS.'],
           'sessions': len(paths), 'attemptsObserved': len(rows), 'attemptsUsable': len(usable),
           'attemptsFitted': len(fitted_rows), 'excluded': {k: sum(1 for r in rows if r.get('excluded') == k)
                                                           for k in {r['excluded'] for r in rows if 'excluded' in r}},
           'conditions': conditions(usable, ADOPTED['K'], ADOPTED['M']), 'rows': usable}
    args.output.write_text(json.dumps(out, ensure_ascii=False, indent=1) + '\n')
    print(json.dumps({k: out[k] for k in ('adopted', 'fit', 'alternatives', 'attemptsObserved', 'attemptsUsable', 'attemptsFitted', 'excluded')},
                     ensure_ascii=False, indent=1))


if __name__ == '__main__':
    main()
