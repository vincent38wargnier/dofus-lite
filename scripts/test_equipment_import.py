from pathlib import Path
import tempfile
import unittest

from import_equipment import effects, build_catalogue
from retro_data import data_tables
from retro_swf import action, movie, push, tag, variable


class EquipmentImportTests(unittest.TestCase):
    def test_hex_ranges_set_rows_and_spell_arguments_are_not_confused(self):
        self.assertEqual(effects('76#1#28#1d40+0,6f#1##0d0+1'), [[118, 1, 40, '1d40+0'], [111, 1, 0, '0d0+1']])
        self.assertEqual(effects('11f#91#0#19'), [[287, 145, 0, '19']])
        self.assertEqual(effects('3d7#-1'), [[983, -1, 0, '']])
        self.assertEqual(effects('76#32#0#0'), [[118, 50, 0, '0']])

    def test_linear_data_reader_concatenates_condition_fragments_without_evaluation(self):
        code = push('I') + push(0) + push('Object') + action(0x40) + action(0x1d)
        code += variable('I') + push('condition') + push('CS>80&') + push('CV>40') + action(0x47) + action(0x4f)
        with tempfile.TemporaryDirectory() as tmp:
            file = Path(tmp) / 'items.swf'
            file.write_bytes(movie([tag(12, code + b'\0'), tag(1)], (0, 1, 0, 1)))
            self.assertEqual(data_tables(file)['I']['condition'], 'CS>80&CV>40')

    def test_source_fixture_matches_generated_known_items(self):
        root = Path(__file__).resolve().parent.parent
        source = root / 'public/dofus-local/equipment/source'
        if not source.is_dir():
            self.skipTest('Original local client cache not imported on this machine')
        tables = {}
        for name in ['items', 'itemstats', 'itemsets', 'classes', 'effects']:
            file = max(source.glob(f'{name}_fr_*.swf'), key=lambda p: int(p.stem.rsplit('_', 1)[1]))
            tables[name] = data_tables(file)
        result = build_catalogue(tables, {})
        self.assertEqual(len(result['items']), 6419)
        self.assertEqual(result['items'][2469]['effects'], [[111, 1, 0, '0d0+1']])
        self.assertEqual(result['items'][2416]['weapon']['pa'], 5)
        self.assertTrue(result['items'][2416]['weapon']['twoHanded'])
        self.assertEqual(len(result['sets'][1]['items']), 7)
        self.assertEqual(result['caps']['SACRIEUR']['vitalite'], [[0, 1, 2]])


if __name__ == '__main__':
    unittest.main()
