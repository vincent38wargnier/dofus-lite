import hashlib
import json
import unittest

from import_dungeon_maps import ROOT, OUT, RAW_MAPS, TERRAIN, KEYS, ENCOUNTERS, DEFAULT_CLIENT, read_terrain, build_map
from import_dofus_maps import decode_places
from retro_data import data_tables


class DungeonMapTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.rooms = json.loads(ENCOUNTERS.read_text())['encounters']
        cls.maps = json.loads(RAW_MAPS.read_text())
        cls.terrain = {m['MapId']: m for m in json.loads(TERRAIN.read_text())}
        cls.keys = json.loads(KEYS.read_text())['maps']
        cls.source = cls.maps[0]['placement']['source']
        cls.lang_file = OUT / 'dungeons/source' / cls.source['file']
        cls.metadata = data_tables(cls.lang_file)['MA']

    def test_every_room_uses_its_own_installed_map_revision(self):
        self.assertEqual(len(self.maps), len(self.rooms))
        for room, result in zip(self.rooms, self.maps):
            with self.subTest(room=room['name']):
                original = read_terrain(DEFAULT_CLIENT, room['mapId'], self.keys)
                self.assertEqual(original, self.terrain[room['mapId']])
                self.assertEqual(result['id'], room['combatMapId'])
                self.assertEqual(result, build_map(room, original, self.metadata, self.source))

    def test_placement_is_exactly_the_client_p1_p2_payload_in_original_order(self):
        self.assertEqual(hashlib.sha256(self.lang_file.read_bytes()).hexdigest(), self.source['sha256'])
        for m in self.maps:
            meta = self.metadata['m'][m['sourceId']]
            original = decode_places(meta['p1'] + '|' + meta['p2'])
            self.assertEqual([[c['cellId'] for c in team] for team in m['startingCells']], original, m['name'])

    def test_sensitive_room_ids_and_kralamoure_single_cell_are_preserved(self):
        by_boss = {boss: room for room in self.rooms for boss in room['bossIds']}
        for boss, mid in [(147, 2083), (257, 9126), (1159, 11941), (423, 11095),
                          (1170, 11976), (1195, 11975), (2793, 12266), (2786, 12263),
                          (182, 1776), (2997, 12307)]:
            self.assertEqual(by_boss[boss]['mapId'], mid)
        krala = next(m for m in self.maps if m['sourceId'] == 11095)
        self.assertEqual([c['cellId'] for c in krala['startingCells'][1]], [509])

    def test_every_final_room_has_decor_layers_and_rendered_images(self):
        manifest = json.loads((OUT / 'manifest.json').read_text())
        for m in self.maps:
            art = manifest['maps'][m['id']]
            self.assertTrue(art['layers'], m['name'])
            self.assertIn('originX', art, m['name'])
            for layer in art['layers']:
                self.assertTrue((OUT / layer['swf']).is_file(), layer['swf'])
                self.assertTrue((OUT / layer['image']).is_file(), layer['image'])


if __name__ == '__main__':
    unittest.main()
