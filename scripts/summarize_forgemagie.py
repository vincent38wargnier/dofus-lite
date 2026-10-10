#!/usr/bin/env python3
"""Summarize observed craft outcomes, following confirmed object UID replacement.

This does not estimate pass probabilities or infer the hidden puits. Missing
initial snapshots and ambiguous replacement associations stay explicit.
"""
import argparse
import json
from pathlib import Path

from observe_retro import ROOT, STAT_LABELS, create_output


def stats(item):
    return {str(e['effect']): e['args'][0] for e in item.get('effects', [])
            if e['effect'] in STAT_LABELS and e['args'] and e['args'][0] is not None}


def summarize(rows):
    known, quantities, pending, last = {}, {}, {}, {}
    attempts = []
    for event in rows:
        if event.get('direction') != 'server_to_client':
            continue
        connection = event.get('connection')
        state = pending.setdefault(connection, {'removed': [], 'updates': {}, 'information': [], 'consumption': []})
        kind = event.get('kind')
        if kind in ('exchange_open', 'exchange_closed'):
            pending.pop(connection, None)
            last.pop(connection, None)
            continue
        if kind == 'item_removed':
            uid = event['uid']
            if (connection, uid) in known:
                state['removed'].append(known[(connection, uid)])
        if kind == 'item_quantity':
            uid, quantity = event['uid'], event['quantity']
            before = quantities.get((connection, uid))
            if before is not None and before > quantity:
                state['consumption'].append({'uid': uid, 'before': before, 'after': quantity,
                                             'consumed': before - quantity})
            quantities[(connection, uid)] = quantity
        for item in event.get('items', []):
            uid = item['uid']
            if 'quantity' in item:
                quantities[(connection, uid)] = item['quantity']
            if 'effects' not in item:
                continue
            # OAKO/OCO are object snapshots; exchange echoes do not add an attempt.
            if kind == 'item_update':
                before = known.get((connection, uid))
                state['updates'][uid] = {'after': item, 'before_same_uid': before}
            known[(connection, uid)] = item
        if kind == 'fm_information':
            previous = last.get(connection)
            destination = (previous['information'] if previous is not None and
                           event.get('time') == previous['time'] else state['information'])
            destination.extend(event['messages'])
        if kind != 'craft_result':
            continue
        updates = list(state['updates'].values())
        if 'template' in event:
            updates = [u for u in updates if u['after'].get('template') == event['template']]
        result = {'attempt': len(attempts) + 1, 'time': event.get('time'),
                  'connection': connection, 'result': event['result'],
                  'information': list(state['information']),
                  'quantity_decreases_observed': list(state['consumption']),
                  'critical_success': None, 'puits': None, 'before_known': False}
        if len(updates) == 1:
            update = updates[0]
            after = update['after']
            matches = [x for x in state['removed'] if x.get('template') == after.get('template')]
            # Never associate just by template across all inventory objects.
            before = update['before_same_uid']
            if before is None and len(matches) == 1:
                before = matches[0]
                result['association'] = 'one_known_removed_object_of_same_template_in_result_batch'
            elif before is not None:
                result['association'] = 'same_uid'
            result.update(item=after.get('name'), template=after.get('template'),
                          after_uid=after['uid'], after_stats=stats(after))
            if before is not None:
                old, new = stats(before), stats(after)
                result.update(before_known=True, before_uid=before['uid'], before_stats=old,
                    stat_deltas={k: new.get(k, 0) - old.get(k, 0) for k in old.keys() | new.keys()
                                 if old.get(k, 0) != new.get(k, 0)})
        else:
            result['snapshot_association'] = 'missing' if not updates else 'ambiguous'
        attempts.append(result)
        last[connection] = result
        pending.pop(connection, None)
    return {'attempts_observed': len(attempts), 'attempts': attempts,
            'probabilities_verified': False, 'puits_reconstructed': False,
            'note': 'A success alone does not distinguish SC from SN. '
                    'Comparisons use observed snapshots and conditional UID associations only.'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('journal', type=Path, nargs='?')
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    journal = args.journal
    if journal is None:
        candidates = list((ROOT / 'local-observations/forgemagie').glob('network-*.jsonl'))
        if not candidates:
            parser.error('No observation journal found')
        journal = max(candidates, key=lambda p: p.stat().st_mtime)
    data = journal.read_bytes()
    # A live writer may be midway through its last JSON line.
    lines = data.splitlines() if data.endswith(b'\n') else data.splitlines()[:-1]
    result = summarize([json.loads(line) for line in lines if line])
    result['journal'] = str(journal)
    if args.output:
        with create_output(args.output) as output:
            output.write(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    else:
        print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
