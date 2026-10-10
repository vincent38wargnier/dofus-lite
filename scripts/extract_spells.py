#!/usr/bin/env python3
"""Extract real Dofus 1.29 spell data from the AncestraRemake SQL dump.

Source: emulators/AncestraRemake/BDD/AncestraR_Game.sql, table `sorts`.
Each spell row: id, name, sprite, spriteInfos, lvl1..lvl6 (grade strings), effectTarget.

Grade string layout (20 comma-separated fields):
  0  effects            "|"-separated; each "id;p1;p2;p3;chance;trigger[;dice]"
  1  critical effects   same format, or -1
  2  PA cost
  3  range min
  4  range max
  5  critical rate      (1 in X; 0 = never)
  6  failure rate       (1 in X échec critique; 0/100 typical)
  7  line only          true/false
  8  needs line of sight
  9  empty cell only
  10 adjustable range
  11 ? (always 0)
  12 max per turn       (0 = unlimited; SQLManager.parseSortStats)
  13 max per target     (0 = unlimited)
  14 cooldown           (intervalle de relance)
  15 zones              two chars per effect (P=point, C=circle, X=cross, L=line + size letter)
  16 required states
  17 forbidden states
  18 required character level
  19 ends turn on failure (true/false)

Usage:
  python3 scripts/extract_spells.py report 141 142 146 ...   # inspect spells
  python3 scripts/extract_spells.py generate                 # write src/engine/spellData.js
"""

import json
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SQL = ROOT / 'emulators/AncestraRemake/BDD/AncestraR_Game.sql'
OUT = ROOT / 'src/engine/spellData.js'

CHAR_LEVEL = 100  # Koliséum fighters are level 100: take the best grade <= 100


def read_sql_lines():
    """The dump is mostly UTF-8 with some permanently mangled bytes: keep the
    valid UTF-8 sequences, turn the broken bytes into '?' (repaired below)."""
    with open(SQL, 'rb') as f:
        for raw in f:
            yield raw.decode('utf-8', errors='replace').replace('�', '?')

# Effect IDs (Dofus 1.29 protocol, cross-checked against emulator sources).
# kind: how the Koliséum engine interprets it.
EFFECTS = {
    4:   {'kind': 'teleport'},
    5:   {'kind': 'push'},                       # repousse de p1 cases
    6:   {'kind': 'pull'},                       # attire de p1 cases
    50:  {'kind': 'ignore'},                     # porter (carry)
    91:  {'kind': 'lifeSteal', 'element': 'eau'},
    92:  {'kind': 'lifeSteal', 'element': 'terre'},
    93:  {'kind': 'lifeSteal', 'element': 'air'},
    94:  {'kind': 'lifeSteal', 'element': 'feu'},
    95:  {'kind': 'lifeSteal', 'element': 'neutre'},
    96:  {'kind': 'damage', 'element': 'eau'},
    97:  {'kind': 'damage', 'element': 'terre'},
    98:  {'kind': 'damage', 'element': 'air'},
    99:  {'kind': 'damage', 'element': 'feu'},
    100: {'kind': 'damage', 'element': 'neutre'},
    101: {'kind': 'removePa'},                   # retrait PA (esquivable)
    108: {'kind': 'heal'},
    111: {'kind': 'buffPa'},                     # +PA
    112: {'kind': 'buffDamage'},                 # +dommages fixes
    114: {'kind': 'buffPower'},                  # +puissance (%)
    115: {'kind': 'buffCrit'},                   # +coups critiques
    118: {'kind': 'buffStat', 'stat': 'force'},
    119: {'kind': 'buffStat', 'stat': 'agilite'},
    123: {'kind': 'buffStat', 'stat': 'chance'},
    126: {'kind': 'buffStat', 'stat': 'intelligence'},
    127: {'kind': 'removePm'},                   # retrait PM (esquivable)
    128: {'kind': 'buffPm'},                     # +PM
    168: {'kind': 'debuffPa'},                   # -PA (non esquivable)
    169: {'kind': 'debuffPm'},                   # -PM (non esquivable)
    77:  {'kind': 'stealPm'},                    # vol de PM (esquivable)
    84:  {'kind': 'stealPa'},                    # vol de PA (esquivable)
    138: {'kind': 'buffPower'},                  # +puissance (% dommages) — cf. Puissance iop
    265: {'kind': 'armor'},                      # armure (réduit les dégâts subis)
    105: {'kind': 'armor'},                      # réduction de dégâts
    181: {'kind': 'summon'},                     # invocation (p1 = id de monstre)
    8:   {'kind': 'swap'},                       # échange de positions (Transposition…)
    9:   {'kind': 'swapAlly'},                   # échange avec un ALLIÉ (Dérobade)
    82:  {'kind': 'lifeSteal', 'element': 'neutre'},  # vol de vie neutre (Folie sanguinaire)
    672: {'kind': 'punitionDamage'},             # Punition: cloche sur les PV du lanceur
    788: {'kind': 'punishment'},                 # Châtiment: gagne p1 quand frappé (cap p2/tour)
    776: {'kind': 'damageSuffer'},               # revers du châtiment: +p1% dégâts subis
    116: {'kind': 'debuffRange'},                # -portée (Clé Réductrice…)
    117: {'kind': 'buffRange'},                  # +portée (Tir Eloigné, Mot d'Envol…)
    125: {'kind': 'buffVitality'},               # +vitalité (PV max et courants)
    132: {'kind': 'dispel'},                     # désenvoûtement (retire les effets)
    # buffs/malus de résistances élémentaires en % (Bouclier Féca, Vulnérabilités)
    210: {'kind': 'resistBuff', 'element': 'terre'},
    211: {'kind': 'resistBuff', 'element': 'eau'},
    212: {'kind': 'resistBuff', 'element': 'air'},
    213: {'kind': 'resistBuff', 'element': 'feu'},
    214: {'kind': 'resistBuff', 'element': 'neutre'},
    215: {'kind': 'resistDebuff', 'element': 'terre'},
    216: {'kind': 'resistDebuff', 'element': 'eau'},
    217: {'kind': 'resistDebuff', 'element': 'air'},
    218: {'kind': 'resistDebuff', 'element': 'feu'},
    # markers/states the arena doesn't simulate (spell links, états, sprites)
    89:  {'kind': 'ignore'},
    268: {'kind': 'ignore'},                     # vols de caracs secondaires
    271: {'kind': 'ignore'},
    120: {'kind': 'refundPa'},                   # PA au lanceur (proc Xélor)
    293: {'kind': 'ignore'},
    320: {'kind': 'ignore'},
    666: {'kind': 'ignore'},                     # no-op
    950: {'kind': 'ignore'},
    # mécaniques hors périmètre (pièges/glyphes, invisibilité, double,
    # châtiments, renvois de sort, porter/lancer, sommeil, sacrifices…)
    400: {'kind': 'ignore'}, 401: {'kind': 'ignore'},
    150: {'kind': 'ignore'}, 180: {'kind': 'ignore'},
    106: {'kind': 'ignore'}, 107: {'kind': 'ignore'},
    50:  {'kind': 'ignore'}, 51: {'kind': 'ignore'},
    140: {'kind': 'ignore'}, 149: {'kind': 'ignore'},
    90:  {'kind': 'ignore'}, 79: {'kind': 'ignore'},
    765: {'kind': 'ignore'}, 783: {'kind': 'ignore'},
    160: {'kind': 'ignore'}, 161: {'kind': 'ignore'}, 162: {'kind': 'ignore'},
    171: {'kind': 'ignore'}, 178: {'kind': 'ignore'}, 182: {'kind': 'ignore'},
    183: {'kind': 'ignore'}, 184: {'kind': 'ignore'}, 185: {'kind': 'ignore'},
    186: {'kind': 'ignore'}, 202: {'kind': 'ignore'},
    109: {'kind': 'ignore'}, 122: {'kind': 'ignore'}, 130: {'kind': 'ignore'},
    131: {'kind': 'ignore'}, 142: {'kind': 'ignore'}, 145: {'kind': 'ignore'},
    155: {'kind': 'ignore'}, 951: {'kind': 'ignore'},
}

# Keep unimplemented effects in the catalogue; only confirmed handlers belong here.
EFFECTS.update({
    124: {'kind': 'buffStat', 'stat': 'sagesse'},
    142: {'kind': 'buffStat', 'stat': 'physicalDamage'},
    160: {'kind': 'buffStat', 'stat': 'dodgePa'},
    161: {'kind': 'buffStat', 'stat': 'dodgePm'},
    182: {'kind': 'buffStat', 'stat': 'summons'},
    145: {'kind': 'debuffStat', 'stat': 'damage'},
    155: {'kind': 'debuffStat', 'stat': 'intelligence'},
    162: {'kind': 'debuffStat', 'stat': 'dodgePa'},
    171: {'kind': 'debuffStat', 'stat': 'crit'},
    268: {'kind': 'stealStat', 'stat': 'agilite'},
    271: {'kind': 'stealStat', 'stat': 'force'},
    320: {'kind': 'stealStat', 'stat': 'range'},
    950: {'kind': 'state'}, 951: {'kind': 'removeState'},
    109: {'kind': 'selfDamage'},
    89: {'kind': 'percentLifeDamage'},
    293: {'kind': 'spellBoost'},
    400: {'kind': 'trap'}, 401: {'kind': 'glyph'},
})


def parse_tuple(line):
    """Parse the parenthesized VALUES tuple of one INSERT line."""
    inner = line[line.index('(') + 1:line.rindex(')')]
    fields = []
    cur = []
    in_str = False
    i = 0
    while i < len(inner):
        c = inner[i]
        if in_str:
            if c == '\\' and i + 1 < len(inner):
                cur.append(inner[i + 1])
                i += 2
                continue
            if c == "'":
                in_str = False
            else:
                cur.append(c)
        else:
            if c == "'":
                in_str = True
            elif c == ',':
                fields.append(''.join(cur).strip())
                cur = []
            elif c not in ' ':
                cur.append(c)
        i += 1
    fields.append(''.join(cur).strip())
    return fields


# Les noms de la table `sorts` sont mutilés dans le dump ('?' à la place des
# accents, dernière lettre accentuée parfois perdue). Réparation déterministe.
NAME_TOKEN_REPAIRS = {
    'Fl?che': 'Flèche', 'Ep?e': 'Épée', 'X?lor': 'Xélor', 'F?ca': 'Féca',
    'T?l?portation': 'Téléportation', 'Col?re': 'Colère', 'Temp?te': 'Tempête',
    'C?leste': 'Céleste', 'Pers?cutrice': 'Persécutrice', 'Ma?trise': 'Maîtrise',
    'Fl?trissement': 'Flétrissement', 'Poussi?re': 'Poussière',
    'D?vouement': 'Dévouement', 'D?placement': 'Déplacement', 'F?lin': 'Félin',
    'Piq?re': 'Piqûre', 'R?sistance': 'Résistance', 'Cl?': 'Clé',
    'R?ductrice': 'Réductrice', 'D?sinvocation': 'Désinvocation',
    'Bo?te': 'Boîte', 'Acc?l?ration': 'Accélération', 'Tr?fle': 'Trèfle',
    'R?flexes': 'Réflexes', 'R?peuse': 'Râpeuse', 'Pr?vention': 'Prévention',
    'R?g?n?ration': 'Régénération', 'Vuln?rabilit?': 'Vulnérabilité',
    'Rep?rage': 'Repérage', 'b?ton': 'bâton', 'Tr?ve': 'Trêve',
    'Zato?shwan': 'Zatoïshwan', 'B?n?diction': 'Bénédiction',
    'D?motivation': 'Démotivation', 'Ch?timent': 'Châtiment',
    'D?robade': 'Dérobade', 'Coop?ration': 'Coopération', 'D?tour': 'Détour',
    'Pi?ge': 'Piège', 'r?pulsif': 'répulsif', 'Invisibilit?': 'Invisibilité',
    'Pi?ces': 'Pièces', '?  ': 'à ',
    'Enflamm?e': 'Enflammée', 'Glac?e': 'Glacée', 'Emmoisonn': 'Empoisonn',
    'Poup?es': 'Poupées', 'Aveuglant?': 'Aveuglante',
}
NAME_FULL_REPAIRS = {
    'Sac Anim': 'Sac Animé', 'Pelle Anim': 'Pelle Animée', 'Coffre Anim': 'Coffre Animé',
    'Flèche Glac': 'Flèche Glacée', 'Flèche Empoisonn': 'Flèche Empoisonnée',
    'Flèche Enflamm': 'Flèche Enflammée', 'Vent Empoisonn': 'Vent Empoisonné',
    'Tir Eloign': 'Tir Éloigné', 'Souffle Alcoolis': 'Souffle Alcoolisé',
    'Poing Enflamm': 'Poing Enflammé', 'La Sacrifi': 'La Sacrifiée',
    "Mot d'Amiti": "Mot d'Amitié", 'Vitalit': 'Vitalité', 'Cupidit': 'Cupidité',
    'Immunit': 'Immunité', 'Invisibilit': 'Invisibilité', 'Epouvante': 'Épouvante',
    'Glyphe Enflamm': 'Glyphe Enflammé', 'Pi?ge Empoisonn': 'Piège Empoisonné',
    'Ep?e du destin': 'Épée du Destin', 'Force de l\'Age': "Force de l'Âge",
    'Poison insidieux': 'Poison Insidieux', 'Ep?e volante': 'Épée Volante',
    'Ep?e de Iop': 'Épée de Iop',
}


def repair_name(name):
    if name in NAME_FULL_REPAIRS:
        return NAME_FULL_REPAIRS[name]
    for bad, good in NAME_TOKEN_REPAIRS.items():
        name = name.replace(bad, good)
    return NAME_FULL_REPAIRS.get(name, name)


def load_sorts():
    sorts = {}
    rx = re.compile(r"INSERT INTO `sorts` VALUES \(")
    for line in read_sql_lines():
        if rx.match(line):
            t = parse_tuple(line.rstrip().rstrip(';'))
            sorts[int(t[0])] = {'id': int(t[0]), 'name': repair_name(t[1]),
                               'sprite': t[2], 'spriteInfos': t[3],
                               'grades': t[4:10], 'effectTarget': t[10] if len(t) > 10 else ''}
    return sorts


DICE = re.compile(r'^(\d+)d(\d+)\+(\d+)$')


def parse_effect(raw, zone):
    p = raw.split(';')
    eid = int(p[0])
    meta = EFFECTS.get(eid, {'kind': f'unknown_{eid}'})
    out = {'id': eid, **meta, 'zone': zone, 'raw': raw}
    nums = []
    for x in p[1:6]:
        try:
            nums.append(int(x))
        except ValueError:
            nums.append(None)
    p1 = nums[0] if len(nums) > 0 else None
    p2 = nums[1] if len(nums) > 1 else None
    # dice notation is authoritative when present ("XdY+Z" -> min X+Z, max X*Y+Z)
    dice = DICE.match(p[6]) if len(p) > 6 else None
    if dice:
        n, faces, fix = (int(dice.group(1)), int(dice.group(2)), int(dice.group(3)))
        out['min'] = n + fix if n else fix
        out['max'] = n * faces + fix if n else fix
    else:
        out['min'] = p1
        out['max'] = p2 if p2 is not None and p2 != -1 else p1
    out['p1'] = p1
    out['p2'] = p2
    out['p3'] = nums[2] if len(nums) > 2 else None
    # format: id;p1;p2;p3;turns;chance;dice
    out['duration'] = nums[3] if len(nums) > 3 and nums[3] not in (None, -1) else 0
    # per-effect probability in % (Ecaflip coin flips); 0 = always applies
    chance = nums[4] if len(nums) > 4 and nums[4] not in (None, -1) else 0
    out['chance'] = chance if 0 < chance < 100 else 0
    # 1.29: une ligne de dégâts AVEC durée = poison (dégâts sur X tours)
    if out['kind'] in ('damage', 'lifeSteal') and out['duration'] > 0:
        out['kind'] = 'poison'
    return out


def parse_zones(z):
    return [z[i:i + 2] for i in range(0, len(z), 2)]


def parse_grade(raw, effect_targets=''):
    f = [x.strip() for x in raw.split(',')]
    if len(f) < 20:
        return None
    zones = parse_zones(f[15])
    fx = [] if f[0] == '-1' else [e for e in f[0].split('|') if e.strip()]
    cfx = [] if f[1] == '-1' else [e for e in f[1].split('|') if e.strip()]
    effects = [parse_effect(e, zones[i] if i < len(zones) else 'Pa') for i, e in enumerate(fx)]
    crit_effects = [parse_effect(e, zones[len(fx) + i] if len(fx) + i < len(zones) else 'Pa')
                    for i, e in enumerate(cfx)]
    masks = effect_targets.split(':')
    for rows, mask in ((effects, masks[0]), (crit_effects, masks[1] if len(masks) > 1 else masks[0])):
        flags = [int(x.strip()) if x.strip().isdigit() else 0 for x in mask.split(';')]
        for i, effect in enumerate(rows):
            effect['targetMask'] = flags[i] if i < len(flags) else 0
    states = lambda value: [int(x) for x in re.findall(r'-?\d+', value) if int(x) >= 0]
    return {
        'effects': effects,
        'critEffects': crit_effects,
        'pa': int(f[2]),
        'rangeMin': int(f[3]),
        'rangeMax': int(f[4]),
        'critRate': int(f[5]),
        'failRate': int(f[6]),
        'lineOnly': f[7] == 'true',
        'needsLos': f[8] == 'true',
        'emptyCellOnly': f[9] == 'true',
        'adjustableRange': f[10] == 'true',
        'maxPerTurn': int(f[12]),
        'maxPerTarget': int(f[13]),
        'cooldown': int(f[14]),
        'requiredLevel': int(f[18]),
        'endsTurnOnFailure': f[19] == 'true',
        'requiredStates': states(f[16]),
        'forbiddenStates': states(f[17]),
    }


def best_grade(spell, char_level=CHAR_LEVEL):
    chosen = None
    chosen_idx = 0
    for i, raw in enumerate(spell['grades']):
        g = parse_grade(raw, spell.get('effectTarget', ''))
        if g and g['requiredLevel'] <= char_level:
            chosen = g
            chosen_idx = i + 1
    return chosen, chosen_idx


def cmd_report(ids):
    sorts = load_sorts()
    for sid in ids:
        s = sorts.get(sid)
        if not s:
            print(f'{sid}: NOT FOUND')
            continue
        g, gi = best_grade(s)
        if g is None:
            print(f"\n#{sid} {s['name']} — NO GRADE at level {CHAR_LEVEL}")
            continue
        print(f"\n#{sid} {s['name']} — grade {gi} (niv. requis {g['requiredLevel']})")
        print(f"  PA {g['pa']} · PO {g['rangeMin']}-{g['rangeMax']}"
              f"{' · ligne' if g['lineOnly'] else ''}{' · LdV' if g['needsLos'] else ''}"
              f"{' · case vide' if g['emptyCellOnly'] else ''}"
              f" · CC 1/{g['critRate']} · EC 1/{g['failRate']}"
              f"{' (fin de tour!)' if g['endsTurnOnFailure'] else ''}"
              f" · {g['maxPerTurn'] or '∞'}/tour · relance {g['cooldown']}")
        for e in g['effects']:
            print(f"    effet: {e}")
        for e in g['critEffects']:
            print(f"    crit : {e}")


# ---------------------------------------------------------------- summons

MONSTER_EMOJI = [
    ('tofu', '🐤'), ('bouftou', '🐏'), ('prespic', '🦔'), ('craqueleur', '🪨'),
    ('sanglier', '🐗'), ('moskito', '🦟'), ('arakne', '🕷️'), ('bloqueuse', '🎎'),
    ('folle', '🎎'), ('sacrifi', '🪆'), ('surpuissante', '🪆'), ('gonflable', '🎈'),
    ('epee', '⚔️'), ('épée', '⚔️'), ('ours', '🐻'), ('dragon', '🐉'), ('wabbit', '🐰'),
    ('corbeau', '🐦‍⬛'), ('chest', '🧰'), ('coffre', '🧰'), ('crapaud', '🐸'),
]


def monster_emoji(name):
    low = slugify(name)
    for k, e in MONSTER_EMOJI:
        if k in low:
            return e
    return '🐾'


def parse_monsters(wanted_ids):
    """Read `monsters` grade 5: stats, hp, pa/pm and the first attack spell."""
    rx = re.compile(r"INSERT INTO `monsters` VALUES \('(\d+)',")
    out = {}
    for line in read_sql_lines():
        m = rx.match(line)
        if not m or int(m.group(1)) not in wanted_ids:
            continue
        mid = int(m.group(1))
        t = parse_tuple(line.rstrip().rstrip(';'))
        try:
            grade5 = t[4].split('|')[4].split('@')[1].split(';')
            stats = [max(0, int(x)) for x in grade5[:5]]
            hp = int(t[8].split('|')[4])
            pa, pm = (int(x) for x in t[9].split('|')[4].split(';'))
            spells_g5 = t[7].split('|')[4] if t[7] and t[7] != '-1' else ''
            first_spell = None
            for entry in spells_g5.split(';'):
                if '@' in entry:
                    first_spell = int(entry.split('@')[0])
                    break
        except (IndexError, ValueError):
            continue
        name = t[1]
        out[mid] = {
            'monsterId': mid,
            'key': slugify(name),
            'name': name,
            'emoji': monster_emoji(name),
            'spell': first_spell,
            'hp': hp, 'pa': pa, 'pm': pm,
            'stats': {'force': stats[0], 'sagesse': stats[1], 'intelligence': stats[2],
                      'chance': stats[3], 'agilite': stats[4]},
        }
    return out


# ---------------------------------------------------------------- metadata

def slugify(name):
    s = unicodedata.normalize('NFD', name)
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    s = re.sub(r'[^a-z0-9]+', '_', s.lower()).strip('_')
    return s or 'sort'


OFFENSIVE = {
    'damage', 'lifeSteal', 'poison', 'removePa', 'removePm', 'stealPa', 'stealPm',
    'debuffPa', 'debuffPm', 'push', 'pull', 'debuffRange', 'resistDebuff',
    'punitionDamage', 'debuffStat', 'stealStat',
}
SELFISH = {
    'buffPa', 'buffPm', 'buffPower', 'buffDamage', 'buffCrit', 'buffStat',
    'armor', 'buffVitality', 'buffRange', 'resistBuff', 'punishment', 'damageSuffer',
}
KIND_EMOJI = {
    'heal': '💚', 'poison': '☠️', 'removePa': '⏳', 'debuffPa': '⏳', 'stealPa': '⏳',
    'removePm': '🐌', 'debuffPm': '🐌', 'stealPm': '🐌', 'push': '🌀', 'pull': '🧲',
    'teleport': '🌀', 'swap': '🔄', 'swapAlly': '🔄', 'dispel': '🧹', 'buffRange': '🔭',
    'punishment': '⛓️', 'punitionDamage': '🥊', 'damageSuffer': '🩸',
    'debuffRange': '📏', 'resistBuff': '🛡️', 'resistDebuff': '💔', 'armor': '🛡️',
    'buffPa': '⚡', 'buffPm': '💨', 'buffPower': '🔥', 'buffDamage': '💪',
    'buffCrit': '🎯', 'buffStat': '✨', 'buffVitality': '❤️',
}
ELEM_EMOJI = {'terre': '🪨', 'feu': '🔥', 'eau': '💧', 'air': '💨', 'neutre': '⚔️'}


def derive_meta(sid, name, grade, summons):
    fx = [e for e in grade['effects'] if e['kind'] != 'ignore'
          and not e['kind'].startswith('unknown')]
    kinds = [e['kind'] for e in fx]

    if 'swap' in kinds or 'swapAlly' in kinds:
        target = 'fighter'
    elif grade['emptyCellOnly'] or any(k in kinds for k in ('summon', 'teleport', 'trap', 'glyph')):
        target = 'freeCell'
    elif any(k in OFFENSIVE for k in kinds):
        # une zone (cercle/croix/ligne de taille > 0) se cible au sol
        aoe = any(e.get('zone', 'Pa')[0] in 'CXL' and e.get('zone', 'Pa')[1:] > 'a' for e in fx)
        target = 'cell' if aoe else 'enemy'
    elif 'heal' in kinds or 'dispel' in kinds:
        target = 'fighter'
    elif any(k in SELFISH for k in kinds) or 'state' in kinds or 'removeState' in kinds:
        target = 'self' if grade['rangeMax'] == 0 else 'fighter'
    else:
        target = 'enemy'

    emoji = None
    for e in fx:
        if e['kind'] in ('damage', 'lifeSteal'):
            emoji = ELEM_EMOJI.get(e.get('element'), '⚔️')
            break
        if e['kind'] == 'summon':
            emoji = (summons.get(e['p1']) or {}).get('emoji', '🐾')
            break
    if not emoji:
        for e in fx:
            if e['kind'] in KIND_EMOJI:
                emoji = KIND_EMOJI[e['kind']]
                break
    return {'key': slugify(name), 'emoji': emoji or '✨', 'targetMode': target}


# ---------------------------------------------------------------- generate

# Sorts présents dans les plages de classes mais qui ne sont PAS la version
# joueur (variantes GM/monstre du dump) — exclus avec motif.
SPELL_BLACKLIST = {
    450: 'Folie sanguinaire: version GM du dump (vol 300 PV, 2 PA, 5x/tour) — pas le sort joueur',
}

# Les 20 sorts de classe de 1.29 sont des plages d'ids contiguës.
CLASS_RANGES = {
    'FECA': range(1, 21), 'OSAMODAS': range(21, 41), 'ENUTROF': range(41, 61),
    'SRAM': range(61, 81), 'XELOR': range(81, 101), 'ECAFLIP': range(101, 121),
    'ENIRIPSA': range(121, 141), 'IOP': range(141, 161), 'CRA': range(161, 181),
    'SADIDA': range(181, 201), 'SACRIEUR': range(432, 452), 'PANDAWA': range(686, 706),
}


def cmd_generate():
    sorts = load_sorts()

    # 1er passage: repérer tous les monstres invoqués par les sorts de classe
    wanted_monsters = set()
    for rng in CLASS_RANGES.values():
        for sid in rng:
            s = sorts.get(sid)
            if not s:
                continue
            g, _ = best_grade(s)
            if not g:
                continue
            for e in g['effects'] + g['critEffects']:
                if e['kind'] == 'summon' and e['p1']:
                    wanted_monsters.add(e['p1'])
    summons = parse_monsters(wanted_monsters)

    out = {}
    dropped = []
    for class_id, rng in CLASS_RANGES.items():
        out[class_id] = []
        for sid in rng:
            s = sorts.get(sid)
            if not s:
                continue
            if sid in SPELL_BLACKLIST:
                dropped.append((class_id, sid, s['name'], SPELL_BLACKLIST[sid]))
                continue
            g, gi = best_grade(s)
            if not g:
                dropped.append((class_id, sid, s['name'], 'niveau > 100'))
                continue
            for effect in g['effects'] + g['critEffects']:
                if effect['kind'] in ('trap', 'glyph'):
                    child = sorts.get(effect['p1'])
                    payload = parse_grade(child['grades'][effect['p2'] - 1], child['effectTarget']) if child and 1 <= effect['p2'] <= 6 else None
                    if payload:
                        effect['trigger'] = {'id': child['id'], 'name': s['name'], 'grade': effect['p2'], **payload}
                    else:
                        effect['kind'] = 'ignore'
            # invocations dont le monstre est introuvable → lignes ignorées
            for e in g['effects'] + g['critEffects']:
                if e['kind'] == 'summon' and e['p1'] not in summons:
                    e['kind'] = 'ignore'
            supported = [e for e in g['effects']
                         if e['kind'] not in ('ignore', 'refundPa') and not e['kind'].startswith('unknown')]
            if not supported:
                kinds = sorted({e['kind'] for e in g['effects']})
                dropped.append((class_id, sid, s['name'], f"effets non simulés: {kinds}"))
                continue
            meta = derive_meta(sid, s['name'], g, summons)
            out[class_id].append({'id': sid, 'name': s['name'], 'grade': gi, **meta, **g})

    # sorts d'attaque des invocations
    for m in summons.values():
        if m['spell'] and m['spell'] in sorts:
            g, gi = best_grade(sorts[m['spell']])
            if g:
                m['attack'] = {'id': m['spell'], 'name': sorts[m['spell']]['name'], **g}
        del m['spell']

    OUT.write_text(
        '// GENERATED by scripts/extract_spells.py — do not edit by hand.\n'
        '// Real Dofus 1.29 spell data (AncestraRemake `sorts` + `monsters`),\n'
        f'// grades chosen for level-{CHAR_LEVEL} fighters. Full class rosters.\n\n'
        'export const REAL_SPELLS = '
        + json.dumps(out, ensure_ascii=False, indent=2) + ';\n\n'
        'export const REAL_SUMMONS = '
        + json.dumps(summons, ensure_ascii=False, indent=2) + ';\n',
        encoding='utf-8',
    )
    total = sum(len(v) for v in out.values())
    print(f'wrote {OUT} — {total} spells, {len(summons)} summons')
    for class_id in CLASS_RANGES:
        names = ', '.join(sp['name'] for sp in out[class_id])
        print(f"  {class_id} ({len(out[class_id])}): {names}")
    print(f'\nexclus ({len(dropped)}):')
    for class_id, sid, name, why in dropped:
        print(f'  {class_id} #{sid} {name} — {why}')
    # Preserve EVERY spell and grade, including omitted mechanics and original
    # effect strings. The browser can inspect this without bundling it into combat.
    catalogue = {'source': str(SQL.relative_to(ROOT)), 'classes': {k: list(v) for k, v in CLASS_RANGES.items()}, 'spells': []}
    for s in sorts.values():
        grades = []
        for i, raw in enumerate(s['grades']):
            try:
                grade = parse_grade(raw, s['effectTarget'])
            except (ValueError, IndexError):
                grade = None
            if grade:
                grades.append({'grade': i + 1, **grade})
        catalogue['spells'].append({**s, 'rawGrades': s['grades'], 'grades': grades,
                                    'excludedReason': SPELL_BLACKLIST.get(s['id'])})
    destination = ROOT / 'public/dofus-local/spell-catalogue.json'
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(catalogue, ensure_ascii=False, separators=(',', ':')))
    print(f'Full catalogue: {len(catalogue["spells"])} spells, {sum(len(s["grades"]) for s in catalogue["spells"])} grades.')


if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == 'report':
        cmd_report([int(x) for x in sys.argv[2:]])
    elif len(sys.argv) > 1 and sys.argv[1] == 'generate':
        cmd_generate()
    else:
        print(__doc__)
