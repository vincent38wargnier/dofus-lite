"""Check item/set references and record the scope of the Barbok spot checks."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
# Compositions read on Barbok, 2026-10-09. This is a composition check, not
# confirmation of every historical stat or Dofus 2 equipment on that website.
BARBOK = {1: ('bouftou', 7), 14: ('kwakterre', 8), 37: ('feudala', 8), 55: ('meulou', 6)}

def audit(data):
    entries = []
    for sid, group in data['sets'].items():
        missing = [i for i in group['items'] if str(i) not in data['items']]
        inverse = [i for i in group['items'] if str(i) in data['items'] and data['items'][str(i)].get('set') != int(sid)]
        entries.append({'id': int(sid), 'name': group['name'], 'items': group['items'],
                        'missingItems': missing, 'inverseMismatches': inverse})
    checks = []
    for sid, (slug, expected) in BARBOK.items():
        group = data['sets'][str(sid)]
        checks.append({'setId': sid, 'name': group['name'], 'source': f'https://barbok.fr/index.php?type={slug}',
                       'expectedPieces': expected, 'clientPieces': len(group['items']),
                       'matchesCount': len(group['items']) == expected,
                       'scope': 'composition; statistics not exhaustively compared'})
    return {'items': len(data['items']), 'sets': len(entries), 'sources': data.get('sources'),
            'completeSets': sum(not e['missingItems'] for e in entries), 'panoplies': entries,
            'barbokChecks': checks, 'limits': [
                'Les références manquantes sont déjà absentes de la table objets du client installé.',
                'Barbok contient aussi du contenu Dofus 2 ; aucun objet absent du client Retro n’a été inventé.',
                'Bouftou complet : Barbok annonce 4 dommages, le client installé 5 ; priorité au client.',
                'Familiers : plafonds items.ef et capacités des potions 939 ; un bonus maximal choisi pour les familiers entraînables.',
                'Montures : bonus maximaux items.ef, identification rides ; niveau 100, personnage niveau 60 minimum.',
                'Les familiers d’apparat n’ont pas de bonus propre ; élevage et apparence montée en combat non simulés.']}

if __name__ == '__main__':
    result = audit(json.loads((ROOT / 'src/engine/equipmentData.json').read_text()))
    (ROOT / 'public/dofus-local/equipment-audit.json').write_text(json.dumps(result, ensure_ascii=False, indent=2))
    print(json.dumps({k: result[k] for k in ('items', 'sets', 'completeSets')}, ensure_ascii=False))
    print('Inverse mismatches:', sum(len(e['inverseMismatches']) for e in result['panoplies']))
