"""Import original equipment templates, rolls, sets and characteristic costs.

Reads only the locally installed client's identified static-data SWFs. Source
versions and hashes travel with the catalogue; individual account inventories
and forged item rolls are neither read nor required.
"""
import json
from pathlib import Path

from retro_data import cached_tables
from retro_swf import adapt_static

ROOT = Path(__file__).resolve().parent.parent
CLIENT = Path('/Applications/Ankama/Retro/Dofus Retro.app/Contents/Resources/app/retroclient')
TYPES = {1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 16, 17, 18, 19, 20, 21, 22, 23, 81, 82, 83, 99, 114}
CLASS_IDS = ['FECA', 'OSAMODAS', 'ENUTROF', 'SRAM', 'XELOR', 'ECAFLIP', 'ENIRIPSA', 'IOP', 'CRA', 'SADIDA', 'SACRIEUR', 'PANDAWA']


def array(value):
    return [v for _, v in sorted(value.items(), key=lambda kv: int(kv[0]))]


def effects(template):
    # Keep all arguments: class-set modifiers encode a spell ID and value,
    # whereas ordinary bonuses encode a min/max roll. Do not conflate them.
    result = []
    for row in template.split(','):
        if not row:
            continue
        parts = (row.split('#') + ['', '', ''])[:4]
        result.append([int(parts[0], 16), int(parts[1] or '0', 16),
                       int(parts[2] or '0', 16), parts[3] if len(parts) > 3 else ''])
    return result


def build_catalogue(tables, sources):
    definitions = tables['items']['I']
    templates = tables['itemstats']['ISTA']
    items = {}
    for item_id, raw in definitions['u'].items():
        if raw['t'] not in TYPES:
            continue
        item = {'id': item_id, 'name': raw['n'], 'type': raw['t'], 'gfx': raw['g'],
                'level': raw['l'], 'effects': effects(templates.get(item_id, ''))}
        for source, field in [('s', 'set'), ('c', 'condition'), ('et', 'ethereal')]:
            if raw.get(source):
                item[field] = raw[source]
        if 'e' in raw:
            e = raw['e']
            item['weapon'] = {'critBonus': e.get(0, 0), 'pa': e.get(1, 0),
                              'range': [e.get(2, 1), e.get(3, 1)],
                              'critRate': e.get(4, 0), 'failRate': e.get(5, 0),
                              'twoHanded': bool(e.get(7)),
                              'animation': raw.get('an'),
                              'zone': definitions['t'][raw['t']].get('z', 'Pa')}
        items[item_id] = item
    sets = {id: {'id': id, 'name': raw['n'], 'items': array(raw['i']),
                 'bonuses': {int(k[1:]): effects(v) for k, v in raw.get('b', {}).items()}}
            for id, raw in tables['itemsets']['IS'].items()}
    characteristics = {'force': 10, 'vitalite': 11, 'sagesse': 12, 'chance': 13, 'agilite': 14, 'intelligence': 15}
    caps = {class_id: {stat: [array(row) for row in array(tables['classes']['G'][i + 1][f'b{stat_id}'])]
                      for stat, stat_id in characteristics.items()}
            for i, class_id in enumerate(CLASS_IDS)}
    return {'version': 1, 'sources': sources, 'items': items, 'sets': sets, 'caps': caps,
            'types': {id: raw['n'] for id, raw in definitions['t'].items() if id in TYPES},
            'effectLabels': {id: raw.get('d', '') for id, raw in tables['effects']['E'].items()}}


def main():
    destination = ROOT / 'public/dofus-local/equipment'
    tables, sources = cached_tables(['items', 'itemstats', 'itemsets', 'effects', 'classes'], destination / 'source', CLIENT)
    catalogue = build_catalogue(tables, sources)
    output = ROOT / 'src/engine/equipmentData.json'
    icons = {}
    for item in catalogue['items'].values():
        name = f"{item['type']}_{item['gfx']}"
        if name in icons:
            continue
        source = CLIENT / f"clips/items/{item['type']}/{item['gfx']}.swf"
        if not source.is_file():
            source = ROOT / f"public/dofus-local/raw/clips/items/{item['type']}/{item['gfx']}.swf"
        if not source.is_file():
            item['missingIcon'] = True
            continue
        wrapper = destination / f'static/{name}.swf'
        wrapper.parent.mkdir(parents=True, exist_ok=True)
        if not wrapper.exists() or wrapper.stat().st_mtime < source.stat().st_mtime:
            adapt_static(source, wrapper)
        icons[name] = {'source': f'equipment/static/{name}.swf', 'image': f'equipment/icons/{name}.png'}
    (destination / 'icons.json').write_text(json.dumps(icons, separators=(',', ':')))
    output.write_text(json.dumps(catalogue, ensure_ascii=False, separators=(',', ':')) + '\n')
    print(f"Imported {len(catalogue['items'])} items, {len(catalogue['sets'])} sets, {len(icons)} icon wrappers; {output.stat().st_size:,} bytes.")


if __name__ == '__main__':
    main()
