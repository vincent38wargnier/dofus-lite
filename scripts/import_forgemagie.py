#!/usr/bin/env python3
"""Build the offline FM catalogue and anonymized observations from local research.

Rune gains/names and item exclusions come from the installed client. Weights
are the Retro community table, not inventory pods or a recovered server formula.
No account, character, IP, object-instance ID or chat is exported.
"""
import json
from pathlib import Path
from summarize_forgemagie import summarize
from retro_swf import adapt_static

ROOT = Path(__file__).resolve().parents[1]
RESEARCH = ROOT / 'local-observations/forgemagie'
CLIENT = RESEARCH / 'client'
FAMILIES = {
    'Fo': ('force', 118, 157, 1), 'Ine': ('intelligence', 126, 155, 1),
    'Cha': ('chance', 123, 152, 1), 'Age': ('agilite', 119, 154, 1),
    'Vi': ('vitalite', 125, 153, .25), 'Sa': ('sagesse', 124, 156, 3),
    'Ga Pa': ('pa', 111, 168, 100), 'Ga Pme': ('pm', 128, 169, 90),
    'Po': ('range', 117, 116, 51), 'Cri': ('crit', 115, 171, 30),
    'So': ('heal', 178, 179, 20), 'Do': ('damage', 112, 145, 20),
    'Do Per': ('power', 138, None, 2), 'Do Ren': ('reflect', 220, None, 30),
    'Invo': ('summons', 182, None, 30), 'Pod': ('pods', 158, 159, .25),
    'Pi': ('trapDamage', 225, None, 15), 'Pi Per': ('trapPower', 226, None, 2),
    'Ini': ('initiative', 174, 175, .1), 'Prospe': ('prospecting', 176, 177, 3),
}
for i, (fr, element) in enumerate([('Terre', 'terre'), ('Eau', 'eau'), ('Air', 'air'), ('Feu', 'feu'), ('Neutre', 'neutre')]):
    FAMILIES['Ré ' + fr] = ('fixed_' + element, 240 + i, 245 + i, 5)
    FAMILIES['Ré Per ' + fr] = ('res_' + element, 210 + i, 215 + i, 4)


def main():
    raw = json.loads((CLIENT / 'items.json').read_text())
    source = json.loads((CLIENT / 'runes.json').read_text())
    runes = []
    for rune in source['runes']:
        family = rune['name'].removeprefix('Rune ').removeprefix('Pa ').removeprefix('Ra ')
        definition = FAMILIES.get(family)
        item = raw['items'][str(rune['id'])]
        row = {k: rune[k] for k in ('id', 'name', 'power')}
        row.update(type=78, gfx=item['g'], supported=definition is not None)
        if definition:
            row['stat'] = definition[0]
        else:
            row['reason'] = 'Variante spéciale du client : comportement serveur non vérifié.'
        runes.append(row)
    potions = []
    for ids, ratio in [([1333, 1335, 1337, 1338], 50), ([1343, 1341, 1342, 1340], 65), ([1345, 1346, 1347, 1348], 85)]:
        for id, element, effect in zip(ids, ['feu', 'eau', 'air', 'terre'], [99, 96, 98, 97]):
            item = raw['items'][str(id)]
            potions.append(dict(id=id, name=item['n'], type=26, gfx=item['g'], element=element,
                                effect=effect, ratio=ratio, level=item['l'], model='AncestraRemake; unverified on live server'))
    destination = ROOT / 'public/dofus-local/equipment'
    icons = {}
    for item in runes + potions:
        name = f"{item['type']}_{item['gfx']}"
        source_file = ROOT / f"public/dofus-local/raw/clips/items/{item['type']}/{item['gfx']}.swf"
        if not source_file.exists():
            item['missingIcon'] = True
            continue
        wrapper = destination / f'static/{name}.swf'
        wrapper.parent.mkdir(parents=True, exist_ok=True)
        if not wrapper.exists() or wrapper.stat().st_mtime < source_file.stat().st_mtime:
            adapt_static(source_file, wrapper)
        icons[name] = dict(source=f'equipment/static/{name}.swf', image=f'equipment/icons/{name}.png')
    destination.mkdir(parents=True, exist_ok=True)
    (destination / 'forgemagie-icons.json').write_text(json.dumps(icons, separators=(',', ':')))
    data = dict(version=1, clientSources=source['sources'], runes=runes, potions=potions,
        stats={stat: dict(effect=effect, negativeEffect=negative, weight=weight) for stat, effect, negative, weight in FAMILIES.values()},
        nonMageableIds=[int(id) for id, item in raw['items'].items() if item.get('fm') is False],
        sources=[
            dict(label='Poids des runes Retro — Dofuzion', url='https://dofuzion.wordpress.com/forgemagie/tableau-poids-des-runess-retro-2/'),
            dict(label='Poids, arrondis, puits et plafonds — Alterya (1.29)', url='https://alterya.over-blog.com/2017/11/tout-sur-la-forgemagie-en-1.29.html'),
            dict(label='Puits en SC, SN et EC — discussion Retro', url='https://forums.jeuxonline.info/sujet/1438434/forgemagie-calcul-du-puits-sur-dofus-retro'),
            dict(label='Devblog 1.27 archivé — probabilités historiques', url='https://web.archive.org/web/20090628101148/http://devblog.dofus.com/fr/'),
            dict(label='Copie historique du devblog — Ponza Divizion', url='https://ponzadivizion.wordpress.com/aide-forgemagie/'),
            dict(label='Devblog historique reproduit — effets lourds épargnés et neutres sans effet', url='https://bieresexeandfun.forumactif.org/t497-tuto-forgemagie'),
            dict(label='Papycha — priorités des pertes et échecs sans perte (guide Touch, mécanismes uniquement)', url='https://papycha.fr/guide-la-forgemagie/'),
            dict(label='Tofus — overs/exos avant le puits', url='https://www.tofus.fr/fiches/forgemagie'),
            dict(label='Adyxion — exemples de pertes sur overs/exos et PA exotique épargné', url='https://adyxion.wordpress.com/2013/01/10/forgemagie-over-et-exo/'),
        ])
    (ROOT / 'src/engine/forgemagieData.json').write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    # Keep all captured outcomes, without inventing rune identities for opaque requests.
    sessions = []
    seen = set()
    for path in sorted(RESEARCH.glob('network-*.jsonl')):
        rows = []
        for line in path.read_text().splitlines():
            try:
                rows.append(json.loads(line))
            except ValueError:
                pass
        for attempt in summarize(rows)['attempts']:
            key = (attempt.get('time'), attempt.get('after_uid'), attempt['result'])
            if key in seen:
                continue
            seen.add(key)
            entry = {k: attempt[k] for k in ('template', 'result', 'before_known', 'before_stats', 'after_stats', 'stat_deltas') if k in attempt}
            entry['information'] = [m['id'] for m in attempt['information']]
            entry['quantity_decrease_observed'] = sum(x['consumed'] for x in attempt['quantity_decreases_observed'])
            sessions.append(entry)
    observations = dict(version=1, date='2026-10-09', attempts=sessions, initialPuitsKnown=False,
        runeIdentitiesDecoded=False, probabilitiesVerified=False,
        note='Captured server outcomes only. Later unrecorded attempts cannot be reconstructed. No fit of pass probabilities.')
    (ROOT / 'src/engine/forgemagieObservations.json').write_text(json.dumps(observations, ensure_ascii=False, indent=2) + '\n')
    print(f'{len(runes)} rune definitions, {sum(r["supported"] for r in runes)} supported, {len(potions)} potions, {len(sessions)} observed attempts')


if __name__ == '__main__':
    main()
