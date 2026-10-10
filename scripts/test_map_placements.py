import copy
import json
import unittest
import xml.etree.ElementTree as ET
from import_dofus_maps import (
    ROOT, PLACEMENTS_JSON, DEFAULT_MAPS, load, analyze, decode_places, starting_placement,
)


class PlacementImportTests(unittest.TestCase):
    def test_gp_two_character_decoding(self):
        self.assertEqual(decode_places('aaab-_ |ac'.replace(' ', '')), [[0, 1, 4031], [2]])
        self.assertEqual(decode_places('dbd6|cMcO'), [[193, 250], [166, 168]])

    def test_reject_empty_malformed_or_overlapping_lists(self):
        for value in ['', '|', 'aa|', '|ab', 'a|bb', 'ab|ab', 'aaab|acaa', 'aa|ab|ac', 'a!|ab']:
            with self.subTest(value=value), self.assertRaises(ValueError):
                decode_places(value)

    def test_every_reviewed_source_matches_generated_cells(self):
        records = json.loads(PLACEMENTS_JSON.read_text())
        source = {int(e.attrib['id']): e for e in ET.parse(ROOT / records['sources']['GDCore']['path']).getroot()}
        maps = {m['MapId']: m for m in load()}
        generated = json.loads((ROOT / 'src/engine/dofusMaps.js').read_text().split('export const DOFUS_MAPS_RAW = ')[1].strip().removesuffix(';'))
        by_id = {m['sourceId']: m for m in generated}
        self.assertEqual(set(map(int, records['maps'])), set(DEFAULT_MAPS))
        for mid in DEFAULT_MAPS:
            record = records['maps'][str(mid)]
            with self.subTest(map_id=mid):
                cells, metadata = starting_placement(maps[mid], analyze(maps[mid]), record)
                self.assertEqual(cells, by_id[mid]['startingCells'])
                self.assertEqual(metadata, by_id[mid]['placement'])
                if record['status'] == 'historical':
                    self.assertEqual(record['places'], source[mid].findtext('places'))
                    self.assertEqual(record['width'], int(source[mid].find('size').attrib['width']))
                    self.assertEqual(record['height'], int(source[mid].find('size').attrib['height']))
                    self.assertEqual([[c['cellId'] for c in team] for team in cells], decode_places(record['places']))

    def test_import_refuses_incompatible_data_without_filtering(self):
        maps = {m['MapId']: m for m in load()}
        records = json.loads(PLACEMENTS_JSON.read_text())['maps']
        record = copy.deepcopy(records['7423'])
        record['width'] = 14
        with self.assertRaisesRegex(ValueError, 'dimensions mismatch'):
            starting_placement(maps[7423], analyze(maps[7423]), record)
        record = dict(records['7423'], places='__|aa')
        with self.assertRaisesRegex(ValueError, 'blocked/invalid'):
            starting_placement(maps[7423], analyze(maps[7423]), record)
        # The distinct Dopeuls record is for an incompatible map version.
        rejected = dict(status='historical', source='GDCore', width=15, height=17,
                        places='bebfbIbJcaeveJfa|fifxgagogpgCgDgR')
        with self.assertRaisesRegex(ValueError, 'blocked/invalid'):
            starting_placement(maps[5383], analyze(maps[5383]), rejected)


if __name__ == '__main__':
    unittest.main()
