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
TYPES = {1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 16, 17, 18, 19, 20, 21, 22, 23, 81, 82, 83, 97, 99, 114}
CLASS_IDS = ['FECA', 'OSAMODAS', 'ENUTROF', 'SRAM', 'XELOR', 'ECAFLIP', 'ENIRIPSA', 'IOP', 'CRA', 'SADIDA', 'SACRIEUR', 'PANDAWA']
# items.I.u[id].ef uses characteristic IDs, not effect IDs. Several combat
# effects share a characteristic: explicitly select permanent equipment bonuses.
CHARACTERISTIC_EFFECTS = {1: 111, 10: 118, 11: 125, 12: 124, 13: 123, 14: 119,
    15: 126, 17: 138, 19: 117, 23: 128, 26: 182, 33: 210, 34: 213, 35: 211,
    36: 212, 37: 214, 44: 174, 48: 176, 49: 178, 50: 220, 80: 112, 96: 158}
# Pet feeding units, distinct from forgemagie weights. Potion effect 939 stores
# additional capacity units in argument 2 and the target pet ID in argument 3.
PET_WEIGHTS = {118: 1, 119: 1, 123: 1, 124: 3, 125: 1, 126: 1, 138: 2,
    158: 1, 174: 1, 176: 3, 178: 20, 210: 4, 211: 4, 212: 4, 213: 4, 214: 4,
    220: 30, 112: 20}


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


def maximum_effects(raw):
    return [[CHARACTERISTIC_EFFECTS[int(key[1:])], value, 0, f'0d0+{value}']
            for key, value in raw.get('ef', {}).items()]


def pet_capacities(definitions, templates):
    result = {}
    for item_id, raw in definitions['u'].items():
        if raw['t'] != 116:
            continue
        for effect, _, capacity, target in effects(templates.get(item_id, '')):
            if effect == 939 and capacity > 0:
                pet_id = int(target, 16)
                if capacity > result.get(pet_id, {}).get('increase', 0):
                    result[pet_id] = {'increase': capacity, 'potionId': item_id}
    return result


def import_pet(item, raw, capacity):
    maxima = maximum_effects(raw)
    if raw.get('ce'):
        item['pet'] = {'kind': 'cosmetic'}
    elif any(row[0] in CHARACTERISTIC_EFFECTS.values() for row in item['effects']):
        # Fixed pets (Kouin-Kouin, Chienchien, MJ pets...) really have several
        # simultaneous bonuses. Do not turn them into a feeding choice.
        item['pet'] = {'kind': 'fixed'}
    elif maxima:
        budget = max(row[1] * PET_WEIGHTS[row[0]] for row in maxima)
        increase = capacity.get('increase', 0)
        choices = []
        for effect, _, _, _ in maxima:
            value = (budget + increase) // PET_WEIGHTS[effect]
            choices.append([effect, value, 0, f'0d0+{value}'])
        # Prefer a Bwak's element to vitality, retaining the client's order for
        # other choices. A maximum in every line at once would exceed its budget.
        choices.sort(key=lambda row: row[0] == 125)
        item['pet'] = {'kind': 'trained', 'naturalEffects': maxima, 'choices': choices,
                       'capacity': capacity, 'budget': budget + increase}
        item['effects'] = [choices[0]] + ([[940, increase, 0, '']] if increase else [])


def build_catalogue(tables, sources):
    definitions = tables['items']['I']
    templates = tables['itemstats']['ISTA']
    capacities = pet_capacities(definitions, templates)
    rides = {raw['n'].casefold(): (id, raw) for id, raw in tables['rides']['RI'].items()}
    items = {}
    for item_id, raw in definitions['u'].items():
        if raw['t'] not in TYPES:
            continue
        # Wild mounts and the generic certificate have no wearable bonuses.
        if raw['t'] == 97 and (not raw.get('ef') or raw['n'].casefold() not in rides):
            continue
        item = {'id': item_id, 'name': raw['n'], 'type': raw['t'], 'gfx': raw['g'],
                'level': raw['l'], 'effects': effects(templates.get(item_id, ''))}
        for source, field in [('s', 'set'), ('c', 'condition'), ('et', 'ethereal')]:
            if raw.get(source):
                item[field] = raw[source]
        if raw['t'] == 18:
            import_pet(item, raw, capacities.get(item_id, {}))
        elif raw['t'] == 97:
            ride_id, ride = rides[raw['n'].casefold()]
            # A certificate's raw l is its generation, NOT the rider's level.
            item['level'] = 60
            item['effects'] = maximum_effects(raw)
            item['mount'] = {'id': ride_id, 'level': 100, 'generation': raw['l'],
                             'gfx': ride['g'], 'colors': [int(ride[f'c{i}']) for i in [1, 2, 3]]}
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
            'types': {id: 'Monture' if id == 97 else raw['n'] for id, raw in definitions['t'].items() if id in TYPES},
            'effectLabels': {id: raw.get('d', '') for id, raw in tables['effects']['E'].items()}}


def main():
    destination = ROOT / 'public/dofus-local/equipment'
    tables, sources = cached_tables(['items', 'itemstats', 'itemsets', 'effects', 'classes', 'rides'], destination / 'source', CLIENT)
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
