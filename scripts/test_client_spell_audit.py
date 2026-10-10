import json
import unittest
from pathlib import Path
from retro_data import data_tables
from import_client_spells import array

ROOT = Path(__file__).resolve().parent.parent

class ClientSpellAuditTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.library = json.loads((ROOT / 'src/engine/spellLibrary.json').read_text())
        source = cls.library['sources']['spells']['file']
        path = ROOT / 'public/dofus-local/spells/source' / source
        if not path.exists():
            raise unittest.SkipTest('Local spell SWF is not installed')
        cls.client = data_tables(path)['S']

    def test_every_grade_matches_original_client_numbers_and_effect_payloads(self):
        checked = 0
        fields = {2: 'pa', 3: 'rangeMin', 4: 'rangeMax', 5: 'critRate', 6: 'failRate',
                  7: 'lineOnly', 8: 'needsLos', 9: 'emptyCellOnly', 10: 'adjustableRange',
                  12: 'maxPerTurn', 13: 'maxPerTarget', 14: 'cooldown', 18: 'requiredLevel', 19: 'endsTurnOnFailure'}
        for sid, spell in self.library['spells'].items():
            for grade in spell['grades']:
                original = self.client[int(sid)]['l' + str(grade['grade'])]
                for i, field in fields.items():
                    self.assertEqual(grade[field], original.get(i, 0), (sid, grade['grade'], field))
                for i, field in [(0, 'effects'), (1, 'critEffects')]:
                    original_effects = array(original.get(i))
                    self.assertEqual(len(grade[field]), len(original_effects))
                    for e, raw in zip(grade[field], original_effects):
                        self.assertEqual(e['id'], raw[0])
                        for j, name in [(1, 'p1'), (2, 'p2'), (3, 'p3')]:
                            self.assertEqual(e[name], raw.get(j) if raw.get(j) is not None else -1)
                        self.assertEqual(e['raw'].split(';')[6], str(raw.get(8) if raw.get(8) is not None else -1))
                checked += 1
        self.assertEqual(checked, 1692)

    def test_audit_has_one_entry_for_every_spell_and_includes_nested_coverage(self):
        audit = json.loads((ROOT / 'public/dofus-local/spell-audit.json').read_text())
        self.assertEqual(len(audit['spells']), 282)
        self.assertTrue(all(not s['officialServerValidated'] for s in audit['spells']))
        self.assertTrue(all(not s['unhandledEffects'] and not s['unsupportedZones'] for s in audit['spells']))

if __name__ == '__main__':
    unittest.main()
