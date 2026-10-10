import json
import unittest
import xml.etree.ElementTree as ET
from urllib.parse import unquote

from import_client_monsters import ROOT, OUT, DEFAULT_CLIENT, import_monsters, boss_ids, complete_grades, array
from import_dofus_maps import load
from retro_data import data_tables


class ClientMonsterTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = json.loads((ROOT / 'src/engine/monsterData.json').read_text())
        cls.tables = {name: data_tables(OUT / 'monsters/source' / source['file'])
                      for name, source in cls.data['sources'].items()}

    def test_generated_roster_matches_original_client_tables(self):
        data, tables = self.data, self.tables
        self.assertEqual(import_monsters(tables), data['monsters'])
        grades = data['monsters']['494']['grades']
        self.assertEqual([g['baseHp'] for g in grades.values()], [100, 500, 1500, 5000, 10000])
        for grade in grades.values():
            self.assertEqual((grade['basePa'], grade['basePm']), (0, -1))
            self.assertEqual(grade['spells'][0]['id'], 411)

    def test_all_boss_flags_and_boss_race_entries_are_accounted_for(self):
        available = self.data['bosses']
        unavailable = [boss['id'] for boss in self.data['unavailableBosses']]
        self.assertFalse(set(available) & set(unavailable))
        self.assertEqual(sorted(available + unavailable), boss_ids(self.tables))
        for mid in unavailable:
            self.assertFalse(complete_grades(self.tables['monsters']['M'][mid]))

    def test_every_boss_grade_preserves_client_stats_and_roster(self):
        for mid in self.data['bosses']:
            source = self.tables['monsters']['M'][mid]
            grades = self.data['monsters'][str(mid)]['grades']
            self.assertEqual(list(map(int, grades)), complete_grades(source))
            for grade, data in grades.items():
                raw = source['g' + grade]
                for key, original in [('level', 'l'), ('baseHp', 'lp'), ('basePa', 'ap'), ('basePm', 'mp'), ('initiative', 'i')]:
                    self.assertEqual(data[key], raw[original], (mid, grade, key))
                self.assertEqual(list(data['resistances'].values()), array(raw['r'])[:5])
                self.assertEqual(sorted((s['id'], s['grade']) for s in data['spells'])
                                 + sorted((s['i'], s['l']) for s in data['missingSpells']),
                                 sorted((s['i'], s['l']) for s in array(raw['s'])))

    def test_final_room_rosters_are_reproducible_and_have_client_monsters(self):
        rooms = json.loads((ROOT / 'src/engine/dungeonData.json').read_text())
        source = json.loads((ROOT / 'scripts/dungeon_encounters.json').read_text())
        self.assertEqual(rooms['encounters'], source['encounters'])
        for room in rooms['encounters']:
            self.assertTrue(room['sources'], room['name'])
            self.assertLessEqual(sum(m['count'] for m in room['members']), 8, room['name'])
            for member in room['members']:
                mid = member['monsterId']
                self.assertGreater(member['count'], 0)
                self.assertIn(str(mid), self.data['monsters'], room['name'])
                original = self.tables['monsters']['M'][mid]
                self.assertNotEqual(original.get('b'), 96, (room['name'], mid, 'player summon in starting roster'))
                self.assertEqual(self.data['monsters'][str(mid)]['name'], original['n'])

    def test_all_starting_companions_have_animated_client_assets(self):
        rooms = json.loads((ROOT / 'src/engine/dungeonData.json').read_text())
        manifest = json.loads((OUT / 'manifest.json').read_text())
        for mid in {m['monsterId'] for room in rooms['encounters'] for m in room['members']}:
            gfx = str(self.data['monsters'][str(mid)]['gfx'])
            self.assertEqual(manifest['monsters'][str(mid)], gfx)
            self.assertTrue((OUT / manifest['actors'][gfx]['url']).is_file(), mid)
            self.assertTrue((OUT / f'portraits/{gfx}.png').is_file(), mid)

    def test_gladiatrool_peki_is_not_confused_with_the_pandala_dungeon_boss(self):
        rooms = json.loads((ROOT / 'src/engine/dungeonData.json').read_text())
        by_boss = {boss: room for room in rooms['encounters'] for boss in room['bossIds']}
        for mid in (2891, 2928):
            raw = self.tables['monsters']['M'][mid]
            self.assertEqual(self.tables['monsters']['MR'][raw['b']]['n'], 'Gladiatrool')
            self.assertNotIn(mid, by_boss)
            record = next(r for r in rooms['unavailable'] if r['bossId'] == mid)
            self.assertEqual(record['category'], 'gladiatrool')
        self.assertEqual(self.tables['monsters']['M'][2997]['spawn']['a'], {0: 540})
        self.assertEqual(by_boss[2997]['members'], [{'monsterId': 2997, 'count': 1}])
        self.assertEqual(self.tables['monsters']['M'][182]['spawn']['m'], {0: by_boss[182]['mapId']})

    def test_all_selectable_bosses_have_their_original_animated_sprite(self):
        manifest = json.loads((OUT / 'manifest.json').read_text())
        for mid in self.data['bosses']:
            monster = self.data['monsters'][str(mid)]
            gfx = str(monster['gfx'])
            self.assertEqual(manifest['monsters'][str(mid)], gfx)
            self.assertTrue((OUT / manifest['actors'][gfx]['url']).is_file(), monster['name'])
            self.assertTrue((OUT / f'portraits/{gfx}.png').is_file(), monster['name'])

    def test_large_boss_standing_timelines_fit_their_sprite_stage(self):
        manifest = json.loads((OUT / 'manifest.json').read_text())
        for mid in self.data['bosses']:
            gfx = str(self.data['monsters'][str(mid)]['gfx'])
            actor = manifest['actors'][gfx]
            left, right, top, bottom = actor['bounds']
            for pose in actor['standingBounds']:
                self.assertLessEqual(left, pose[0])
                self.assertGreaterEqual(right, pose[1])
                self.assertLessEqual(top, pose[2])
                self.assertGreaterEqual(bottom, pose[3])

    def test_map_matches_decrypted_installed_client_cell_for_cell(self):
        # The server provides this map key, never credentials. The SWF holds
        # its encrypted terrain. Retro's XOR offset is twice the key checksum.
        record = ET.parse(ROOT / 'emulators/GDCore/data/map/gameMaps.xml').find('.//GameMap[@id="534"]')
        prepared = unquote(bytes.fromhex(record.find('data').get('key')).decode())
        offset = (sum(ord(c) for c in prepared) % 16) * 2
        source = data_tables(next(DEFAULT_CLIENT.glob('data/maps/534_*.swf')))
        decoded = unquote(''.join(chr(value ^ ord(prepared[(i + offset) % len(prepared)]))
                                 for i, value in enumerate(bytes.fromhex(source['mapData']))))
        imported = next(m for m in load() if m['MapId'] == 534)
        self.assertEqual(decoded, imported['MapData'])
        self.assertEqual((source['width'], source['height']), (imported['Width'], imported['Height']))
        self.assertEqual(imported['Coordinate'], '[0,0]')


if __name__ == '__main__':
    unittest.main()
