"""Import every player spell/grade from the installed Retro client, with an audit.

Client SWFs are the authority for displayed numbers. Target masks and monster
combat stats are server data: the local SQL remains a separately named source.
Never silently label those server behaviours as verified against Ankama.
"""
import copy
import json
import re
from pathlib import Path

from retro_data import cached_tables
from import_equipment import CLIENT, CLASS_IDS
from extract_spells import (EFFECTS, parse_grade, load_sorts, read_sql_lines,
                            parse_tuple, derive_meta, slugify, monster_emoji)

ROOT = Path(__file__).resolve().parent.parent
COMMON = [350, 364, 366, 367, 368, 369, 370, 373, *range(390, 398), 413, 414]
SPECIAL = dict(zip(CLASS_IDS, [422, 420, 425, 416, 424, 412, 427, 410, 418, 426, 421, 423]))

# Each kind has a dedicated combat handler. Cosmetic/economy effects are retained
# in the catalogue but do not change a standalone arena fight.
EFFECTS.update({
    9: {'kind': 'dodgeMelee'}, 50: {'kind': 'carry'}, 51: {'kind': 'throw'},
    79: {'kind': 'ecaflipLuck'}, 82: {'kind': 'fixedLifeSteal'},
    90: {'kind': 'lifeTransfer'}, 106: {'kind': 'spellReflection'},
    107: {'kind': 'damageReflection'}, 122: {'kind': 'buffStat', 'stat': 'fail'},
    130: {'kind': 'outOfCombat'}, 131: {'kind': 'apPoison'},
    140: {'kind': 'skipTurn'}, 143: {'kind': 'fixedHeal'},
    149: {'kind': 'cosmetic'}, 150: {'kind': 'invisibility'},
    165: {'kind': 'weaponMastery'}, 178: {'kind': 'buffStat', 'stat': 'heal'},
    180: {'kind': 'double'}, 183: {'kind': 'buffStat', 'stat': 'armorMagic'},
    184: {'kind': 'buffStat', 'stat': 'armorPhysical'}, 185: {'kind': 'staticSummon'},
    186: {'kind': 'debuffStat', 'stat': 'power'}, 202: {'kind': 'reveal'},
    765: {'kind': 'sacrifice'}, 780: {'kind': 'revive'},
    781: {'kind': 'minRolls'}, 782: {'kind': 'maxRolls'},
    783: {'kind': 'fear'}, 784: {'kind': 'rollback'},
    787: {'kind': 'delayedSpell'}, 2182: {'kind': 'resistAllBuff'},
    300: {'kind': 'outOfCombat'}, 1810: {'kind': 'outOfCombat'},
    750: {'kind': 'outOfCombat'}, 751: {'kind': 'outOfCombat'},
    671: {'kind': 'selfPercentDamage'}, 776: {'kind': 'erosion'},
    141: {'kind': 'kill'}, 154: {'kind': 'debuffStat', 'stat': 'agilite'},
    163: {'kind': 'debuffStat', 'stat': 'dodgePm'}, 176: {'kind': 'outOfCombat'},
})


# Server-side selectors are not present in client SWFs. These explicit,
# reviewable corrections replace absent/reversed Ancestra masks. Pair ordering
# for Osa follows client descriptions and Nao/Rubrum's Crapaud/Piqûre entries.
# Do not treat these reconstructed selectors as observations of Ankama's server.
TARGET_RULES = {
    1: [4], 6: [4], 14: [4, 4], 18: [4, 4],  # elemental armors: allies
    22: [8, 18], 23: [8, 18], 25: [12, 22], 27: [8, 18],
    28: [8, 18], 29: [8, 18], 32: [8, 18],
    54: [1], 59: [1, 2, 0, 4], 89: [4, 32, 0, 32],
    102: [0, 1, 4], 108: [0, 32, 32], 119: [0, 1, 4],
    139: [4, 4], 147: [4], 192: [2, 1, 4],
    1999: [0, 32, 0], 2005: [0, 0, 4], 647: [4],
    369: [2], 412: [1, 4, 2], 421: [6, 6], 440: [4],
}
NOTES = {
    4: ['Renvoi et ordre des protections reconstitués ; cumul non validé sur serveur officiel.'],
    25: ['Sélecteurs invocation/personnage reconstitués ; masques absents du client.'],
    59: ['Séparation soin allié/ennemi reconstituée ; formule particulière de soin ennemi à confirmer.'],
    82: ['Ordre des protections et renvois à confirmer sur serveur officiel.'],
    94: ['Ordre des protections et renvois à confirmer sur serveur officiel.'],
    102: ['Séparation des soins allié/ennemi à confirmer sur serveur officiel.'],
    119: ['Séparation et calendrier des soins périodiques à confirmer sur serveur officiel.'],
    192: ['Séparation des soins allié/ennemi à confirmer sur serveur officiel.'],
    413: ['Capture hors combat : aucun inventaire d’âmes dans cette arène.'],
    414: ['Capture hors combat : aucun élevage de montures dans cette arène.'],
    420: ['Résurrection disponible ; en duel, la mort du chef termine déjà le combat.'],
    370: ['Rattachement des attaques d’Arakne reconstitué ; statistiques et IA à confirmer.'],
    373: ['Statistiques et choix des cibles du Chaferfu : modèle communautaire.'],
    423: ['Beuverie/Tournée générale et états importés du client ; statistiques et IA reconstituées.'],
}


def array(value):
    return [v for _, v in sorted((value or {}).items(), key=lambda x: int(x[0]))]


def client_grade(raw, masks=''):
    """Keep the old parser's schema; construct its fields from client arrays."""
    fields = []
    for i in range(20):
        v = raw.get(i)
        if i in (0, 1):
            effects = []
            for row in array(v):
                values = [row.get(j) for j in range(6)]
                values.append(row.get(8))  # client index 8 is dice, NOT index 6
                effects.append(';'.join(str(x) if x is not None else '-1' for x in values))
            fields.append('|'.join(effects) or '-1')
        elif i in (16, 17):
            fields.append(';'.join(map(str, array(v))) or '-1')
        elif isinstance(v, bool):
            fields.append(str(v).lower())
        else:
            fields.append(str(v) if v is not None else '0')
    result = parse_grade(','.join(fields), masks)
    result['clientGradeId'] = raw.get(20)
    return result


def monster_rows():
    rows = {}
    for line in read_sql_lines():
        if line.startswith('INSERT INTO `monsters` VALUES '):
            row = parse_tuple(line.rstrip().rstrip(';'))
            rows[int(row[0])] = row
    return rows


def main():
    destination = ROOT / 'public/dofus-local/spells/source'
    tables, sources = cached_tables(['spells', 'classes'], destination, CLIENT)
    originals = tables['spells']['S']
    old = load_sorts()
    classes = {cid: array(tables['classes']['G'][index + 1]['s']) + [SPECIAL[cid]]
               for index, cid in enumerate(CLASS_IDS)}
    player_ids = set(COMMON) | {sid for ids in classes.values() for sid in ids}
    catalogue = {}
    differences = []
    for sid, source in originals.items():
        if not isinstance(source, dict) or not source.get('n'):
            continue
        grades = []
        for gi in range(1, 7):
            if not source.get(f'l{gi}'):
                continue
            grade = client_grade(source[f'l{gi}'], old.get(sid, {}).get('effectTarget', ''))
            if sid in player_ids and sid in old:
                previous = parse_grade(old[sid]['grades'][gi - 1], old[sid]['effectTarget'])
                changed = [key for key in grade if key != 'clientGradeId' and previous and
                           (sorted(grade[key]) != sorted(previous[key]) if key.endswith('States')
                            else grade[key] != previous.get(key))]
                # Effects carry different raw encodings for null; compare semantic fields.
                for field in ('effects', 'critEffects'):
                    if field in changed:
                        semantic = lambda rows: [{k: v for k, v in e.items() if k != 'raw'}
                                                 for e in rows]
                        if semantic(grade[field]) == semantic(previous[field]):
                            changed.remove(field)
                if changed:
                    differences.append({'id': sid, 'name': source['n'], 'grade': gi, 'fields': changed})
            if sid in TARGET_RULES:
                for rows in (grade['effects'], grade['critEffects']):
                    for index, effect in enumerate(rows):
                        if index < len(TARGET_RULES[sid]):
                            effect['targetMask'] = TARGET_RULES[sid][index]
            # Rekop's normal result removes one AP from its caster; its crit
            # deals all four elemental damage lines to the chosen target.
            if sid == 114:
                for effect in grade['effects']:
                    effect['targetMask'] = 32
            grades.append({'grade': gi, **grade})
        if grades:
            catalogue[sid] = {'id': sid, 'name': source['n'], 'description': source.get('d', ''),
                              'grades': grades, 'iconId': source.get('i', {}).get('up'), 'source': sources['spells']['file'],
                              'targetSource': 'reconstructed-correction' if sid in TARGET_RULES or sid == 114 else 'AncestraRemake' if old.get(sid, {}).get('effectTarget') else 'unspecified',
                              'auditNotes': NOTES.get(sid, [])}

    monsters = monster_rows()
    fallback = {}
    fallback_file = ROOT / 'emulators/sundofus/SunDofus/Databases/sundofus.sql'
    for line in fallback_file.read_text().splitlines():
        if line.startswith('INSERT INTO `creatures_levels` VALUES '):
            row = parse_tuple(line.rstrip().rstrip(';'))
            fallback[(int(row[1]), int(row[2]))] = row
    # Explicit roster repair for empty emulator templates. Spell payloads still
    # come from client definitions. These links are reconstructed, not extracted.
    repaired_attacks = {246: [247], 2630: [229, 270], 1108: [646, 647],
                        264: [589, 590], 2727: [1674, 1675]}

    summon_data = {}
    visited = set()

    def enrich(spell, depth=0):
        if depth > 5:
            return
        for g in spell['grades']:
            for e in g['effects'] + g['critEffects']:
                if e['kind'] in ('trap', 'glyph', 'delayedSpell'):
                    child = catalogue.get(e['p1'])
                    cg = next((g for g in child['grades'] if g['grade'] == e['p2']), None) if child else None
                    if cg:
                        e['trigger'] = {'id': child['id'], 'name': spell['name'], **copy.deepcopy(cg)}
                    else:
                        e['kind'] = 'unknown_trigger'
                if e['kind'] not in ('summon', 'staticSummon'):
                    continue
                mid = e['p1']
                if mid in visited:
                    continue
                visited.add(mid)
                row = monsters.get(mid)
                if not row:
                    continue
                summon = {'monsterId': mid, 'name': row[1], 'gfx': int(row[2]), 'key': slugify(row[1]),
                          'emoji': monster_emoji(row[1]), 'source': 'AncestraRemake', 'grades': {}}
                for gi in range(1, 7):
                    try:
                        stats = list(map(int, row[6].split('|')[gi - 1].split(',')))
                        resist = list(map(int, row[4].split('|')[gi - 1].split('@')[1].split(';')))
                        hp = int(row[8].split('|')[gi - 1])
                        pa, pm = map(int, row[9].split('|')[gi - 1].split(';'))
                        attacks = []
                        entries = row[7].split('|')[gi - 1].split(';')
                        source = 'AncestraRemake'
                        alternate = fallback.get((mid, gi))
                        if alternate and (hp == 10 or mid in (246, 2630, 1108, 264, 2727, 2750)):
                            hp, pa, pm = int(alternate[6]), int(alternate[4]), max(0, int(alternate[5]))
                            stats = [int(alternate[i]) for i in (15, 14, 16, 17, 18)]
                            resist = list(map(int, alternate[7:12]))
                            source = 'SunDofus creatures_levels (replacement of incomplete template)'
                        if mid in repaired_attacks:
                            entries = [f"{sid}@{min(gi, max(g['grade'] for g in catalogue[sid]['grades']))}" for sid in repaired_attacks[mid] if sid in catalogue]
                        for entry in entries:
                            if '@' not in entry:
                                continue
                            sid, sg = map(int, entry.split('@'))
                            attack = catalogue.get(sid)
                            if not attack:
                                continue
                            ag = next((g for g in attack['grades'] if g['grade'] == sg), None)
                            if ag:
                                enrich({'grades': [ag], 'name': attack['name']}, depth + 1)
                                attacks.append({'id': sid, 'name': attack['name'], **derive_meta(sid, attack['name'], ag, {}), **ag})
                        if len(stats) != 5 or hp <= 0:
                            continue
                        summon['grades'][gi] = {'hp': hp, 'pa': max(0, pa), 'pm': max(0, pm), 'source': source,
                          'rosterSource': 'reconstructed' if mid in repaired_attacks else 'AncestraRemake',
                          'stats': dict(zip(['force', 'sagesse', 'intelligence', 'chance', 'agilite'], stats)),
                          'resistances': dict(zip(['neutre', 'terre', 'feu', 'eau', 'air'], resist[:5])),
                          'spells': attacks}
                    except (ValueError, IndexError):
                        continue
                if summon['grades']:
                    summon_data[mid] = summon

    for sid in sorted(player_ids):
        if sid in catalogue:
            enrich(catalogue[sid])
    for s in catalogue.values():
        for g in s['grades']:
            g.update(derive_meta(s['id'], s['name'], g, summon_data))
            # Combat allows ground targeting and friendly fire; masks decide
            # recipients. A damage line does not mean "enemy-only" targeting.
            if not g['emptyCellOnly'] and g['rangeMax'] > 0 and g['targetMode'] == 'enemy':
                g['targetMode'] = 'cell'

    library = {'version': 1, 'sources': sources, 'classes': classes, 'common': COMMON, 'special': SPECIAL,
               'spells': {sid: catalogue[sid] for sid in sorted(player_ids) if sid in catalogue}, 'summons': summon_data}
    (ROOT / 'src/engine/spellLibrary.json').write_text(json.dumps(library, ensure_ascii=False, separators=(',', ':')) + '\n')
    handlers = set(re.findall(r"case '([^']+)':", (ROOT / 'src/engine/engine.js').read_text()))

    def coverage(spell, visited=None):
        visited = set(visited or ())
        kinds, missing, zones = set(), set(), set()
        for grade in spell['grades']:
            for effect in grade['effects'] + grade['critEffects']:
                kinds.add(effect['kind']); zones.add(effect['zone'][0])
                if effect['kind'] not in handlers and effect['id'] != 666:
                    missing.add(effect['id'])
                children = []
                if effect.get('trigger'):
                    children.append({'grades': [effect['trigger']]})
                if effect['kind'] in ('summon', 'staticSummon') and effect['p1'] not in visited:
                    visited.add(effect['p1'])
                    model = summon_data.get(effect['p1'])
                    if not model or str(effect['p2']) not in map(str, model['grades']):
                        missing.add('summon:' + str(effect['p1']) + ':' + str(effect['p2']))
                    if model:
                        children += [{'grades': [attack]} for g in model['grades'].values() for attack in g['spells']]
                for child in children:
                    ck, cm, cz = coverage(child, visited)
                    kinds |= ck; missing |= cm; zones |= cz
        return kinds, missing, zones

    asset_manifest = json.loads((ROOT / 'public/dofus-local/manifest.json').read_text()) if (ROOT / 'public/dofus-local/manifest.json').exists() else {}
    # The client references an icon index (i.up), which is NOT always its spell
    # ID: all Pandawa spells and Dopeuls would otherwise lose their artwork.
    for sid, spell in library['spells'].items():
        icon_source = f"static/icons/{spell['iconId']}.swf"
        if (ROOT / 'public/dofus-local' / icon_source).exists():
            visual = asset_manifest.setdefault('spells', {}).setdefault(str(sid), {})
            if visual.get('iconSource') != icon_source:
                visual['iconNeedsRender'] = True
            visual.update({'icon': f'icons/{sid}.png', 'iconSource': icon_source})
    if asset_manifest:
        (ROOT / 'public/dofus-local/manifest.json').write_text(json.dumps(asset_manifest, ensure_ascii=False, separators=(',', ':')))
    entries = []
    for sid, spell in library['spells'].items():
        kinds, missing, zones = coverage(spell)
        entry = {'id': sid, 'name': spell['name'], 'grades': len(spell['grades']),
                 'class': next((cid for cid, ids in classes.items() if sid in ids), 'COMMON'),
                 'clientData': 'imported-and-compared', 'targetSource': spell['targetSource'],
                 'effectKinds': sorted(kinds), 'unhandledEffects': sorted(missing, key=str),
                 'unsupportedZones': sorted(zones - set('PCXLTO')),
                 'notes': spell['auditNotes'], 'officialServerValidated': False,
                 'animation': {k: v for k, v in asset_manifest.get('spells', {}).get(str(sid), {}).items() if k != 'iconNeedsRender'},
                 'summonDataValidated': False if any(k in kinds for k in ('summon', 'staticSummon')) else None}
        entries.append(entry)
    audit = {'sources': sources, 'playerSpells': len(library['spells']),
             'grades': sum(len(s['grades']) for s in library['spells'].values()),
             'differencesFromSql': differences, 'spells': entries, 'targetCorrections': TARGET_RULES,
             'limits': ['Masques de cible et caractéristiques des invocations : source serveur communautaire.',
                        'Données du client vérifiées ; comportement du serveur officiel non observé.']}
    (ROOT / 'public/dofus-local/spell-audit.json').write_text(json.dumps(audit, ensure_ascii=False, indent=2))
    full = {'source': sources['spells']['file'], 'sources': sources, 'classes': classes,
            'common': COMMON, 'special': SPECIAL, 'spells': list(catalogue.values())}
    (ROOT / 'public/dofus-local/spell-catalogue.json').write_text(json.dumps(full, ensure_ascii=False, separators=(',', ':')))
    print(json.dumps({k: v for k, v in audit.items() if k not in ('differencesFromSql', 'spells', 'targetCorrections')}, ensure_ascii=False, indent=2))
    print(f'{len(differences)} grades differ from SQL; {len(summon_data)} summon models imported.')


if __name__ == '__main__':
    main()
