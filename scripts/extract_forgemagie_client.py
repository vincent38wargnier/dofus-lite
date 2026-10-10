#!/usr/bin/env python3
"""Preserve local client evidence for forgemagie; never execute the client.

Outputs original AS2 bytecode units (minimal SWF containers), a symbol index,
and the rune/item/effect tables with SHA256 provenance. No account data is read.
Decompilation is a separate, optional FFDec operation on these copies.
"""
import argparse
import hashlib
import json
from pathlib import Path
import struct
import zlib

from retro_data import cached_tables
from retro_swf import exports, tag, tags

DEFAULT_CLIENT = Path('/Applications/Ankama/Retro/Dofus Retro.app/Contents/Resources/app/retroclient')
DEFAULT_OUTPUT = Path(__file__).resolve().parents[1] / 'local-observations/forgemagie/client'


def digest(data):
    return hashlib.sha256(data).hexdigest()


def save_json(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')


def extract(client, output):
    output.mkdir(parents=True, exist_ok=True)
    tables, sources = cached_tables(['items', 'itemstats', 'effects'], output / 'source', client)
    items = tables['items']['I']['u']
    stats = tables['itemstats']['ISTA']
    runes = []
    for item_id, item in items.items():
        if item.get('t') != 78:
            continue
        raw = stats.get(item_id, '')
        power = next((int(part.split('#')[1], 16) for part in raw.split(',')
                      if part.startswith('2bd#')), None)
        runes.append({'id': item_id, 'name': item['n'], 'power': power,
                      'inventoryWeight': item.get('w'), 'fmWeight': None,
                      'level': item.get('l'), 'description': item.get('d'),
                      'rawEffects': raw})
    save_json(output / 'runes.json', {'sources': sources, 'runes': runes,
        'note': 'power is effect 701 (Puissance); inventoryWeight is pods, not FM weight. '
                'Presence in the catalogue does not establish availability on this server.'})
    save_json(output / 'items.json', {'sources': sources, 'items': items, 'stats': stats,
                                     'effects': tables['effects']['E']})

    data = (client / 'loader.swf').read_bytes()
    if data[:3] not in (b'CWS', b'FWS'):
        raise ValueError('Unsupported loader SWF signature')
    body = zlib.decompress(data[8:]) if data[:3] == b'CWS' else data[8:]
    start = (5 + 4 * (body[0] >> 3) + 7) // 8 + 4
    entries = list(tags(body, start))
    names = {value: key for key, value in exports(entries).items()}
    units = output / 'as2-units'
    units.mkdir(exist_ok=True)
    index = []
    root_index = 0
    for code, payload in entries:
        if code not in (12, 59):
            continue
        if code == 59:
            cid = struct.unpack_from('<H', payload)[0]
            name = names.get(cid, f'unnamed-{cid}')
            filename = f'init-{cid}.swf'
            # Definitions provide names to a decompiler; bytecode is unchanged.
            preamble = tag(39, struct.pack('<HH', cid, 1) + tag(0))
            preamble += tag(56, struct.pack('<HH', 1, cid) + name.encode() + b'\0')
        else:
            root_index += 1
            cid, name = None, f'root-action-{root_index}'
            filename = f'{name}.swf'
            preamble = b''
        unit_body = body[:start] + preamble + tag(code, payload) + tag(1) + tag(0)
        unit = b'FWS' + data[3:4] + struct.pack('<I', len(unit_body) + 8) + unit_body
        (units / filename).write_bytes(unit)
        relevant = any(word in name.lower() for word in ('forgemag', 'exchange', 'craft', 'chat'))
        relevant = relevant or any(term in payload for term in
            (b'XMLSocket', b'CRAFT_FAILED', b'getWeightText', b'CRAFT_SUCCESS_SELF'))
        index.append({'file': filename, 'name': name, 'characterId': cid,
                      'bytecodeSha256': digest(payload), 'bytes': len(payload),
                      'forgemagieCandidate': relevant})
    manifest = {'client': str(client), 'loaderSha256': digest(data),
                'staticSources': sources, 'runeCount': len(runes), 'units': index,
                'limitations': ['No server formula recovered by this extraction.',
                    'AS2 names/control flow remain obfuscated.',
                    'Root and init actions are preserved; nested UI event scripts remain in loader.swf.']}
    save_json(output / 'manifest.json', manifest)
    # Retain the full original container so nested event scripts can be inspected.
    (output / 'source/loader.swf').write_bytes(data)
    print(f'{len(runes)} rune definitions; {len(index)} AS2 units; '
          f'{sum(x["forgemagieCandidate"] for x in index)} candidate units. Output: {output}')
    return manifest


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--client', type=Path, default=DEFAULT_CLIENT)
    parser.add_argument('--output', type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    extract(args.client, args.output)
