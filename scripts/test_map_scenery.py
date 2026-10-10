"""Check the exported decor against the installed client's MapHandler rules.

loader.swf, init 20518: Ground and Object1 are separate containers; tiles and
objects share cell-centre registration; quarter turns use 51.85% / 192.86%.
"""
import hashlib
import json
import re
import struct
import unittest
from collections import Counter

from import_dofus_maps import H, VOID, decode
from import_retro_client import DEFAULT_CLIENT, OUT, map_symbol_transform
from retro_data import data_tables
from retro_swf import read, read_matrix


def placed_symbols(path):
    result = []
    for code, payload in read(path)[2]:
        if code != 26:
            continue
        name = re.search(rb'(background|ground|object1|object2)_(-?\d+)\0$', payload)
        if not name:
            raise AssertionError(f'Unnamed map symbol in {path}')
        result.append((name[1].decode(), int(name[2]), struct.unpack_from('<H', payload, 1)[0], read_matrix(payload, 5)))
    return result


class MapSceneryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.maps = json.loads((OUT / 'manifest.json').read_text())['maps']
        cls.terrain = json.loads((OUT / 'dungeons/terrain.json').read_text())

    def test_every_original_decor_is_present_with_floors_behind_all_object1_scenery(self):
        for terrain in self.terrain:
            with self.subTest(map=terrain['MapId']):
                art = self.maps[f'dungeon_{terrain["MapId"]}']
                expected = Counter()
                for offset in range(0, len(terrain['MapData']), 10):
                    b = [H[c] for c in terrain['MapData'][offset:offset + 10]]
                    if not b[0] & 32:
                        continue
                    for kind, graphic in [
                        ('ground', ((b[0] & 24) << 6) + ((b[2] & 7) << 6) + b[3]),
                        ('object1', ((b[0] & 4) << 11) + ((b[4] & 1) << 12) + (b[5] << 6) + b[6]),
                        ('object2', ((b[0] & 2) << 12) + ((b[7] & 1) << 12) + (b[8] << 6) + b[9]),
                    ]:
                        if graphic:
                            expected[kind, offset // 10] += 1
                actual = Counter((kind, cid) for layer in art['layers'] for kind, cid, _, _ in placed_symbols(OUT / layer['swf']) if kind != 'background')
                self.assertEqual(actual, expected)
                self.assertEqual(art['layers'][0]['name'], 'ground')
                ground = placed_symbols(OUT / art['layers'][0]['swf'])
                categories = [{'background': 0, 'ground': 1, 'object1': 2}[kind] for kind, *_ in ground]
                self.assertEqual(categories, sorted(categories))

    def test_tiles_objects_and_background_share_native_cell_coordinates(self):
        for terrain in self.terrain:
            with self.subTest(map=terrain['MapId']):
                art = self.maps[f'dungeon_{terrain["MapId"]}']
                active = [p for p, kind in decode(terrain).items() if kind != VOID]
                x0, y0 = min(p[0] for p in active), min(p[1] for p in active)
                origin_x = (art['originX'] - x0 + y0) * 26.75
                origin_y = art['top'] + (1 - x0 - y0) * 13.375
                for layer in art['layers']:
                    for kind, cid, _, (_, _, _, _, tx, ty) in placed_symbols(OUT / layer['swf']):
                        if kind == 'background':
                            expected_x, expected_y = origin_x, origin_y
                        else:
                            # Independent client loop: alternate full and short screen rows.
                            strip, column = divmod(cid, 2 * terrain['Width'] - 1)
                            short = column >= terrain['Width']
                            if short:
                                column -= terrain['Width']
                            b1 = H[terrain['MapData'][cid * 10 + 1]]
                            expected_x = origin_x + column * 53.5 + (26.75 if short else 0)
                            expected_y = origin_y + strip * 26.75 + (13.375 if short else 0) - ((b1 & 15) - 7) * 20
                        self.assertAlmostEqual(tx, expected_x, delta=.026)
                        self.assertAlmostEqual(ty, expected_y, delta=.026)

    def test_backgrounds_and_linked_graphics_are_from_the_installed_client(self):
        for terrain in self.terrain:
            mid = terrain['MapId']
            metadata = data_tables(sorted((DEFAULT_CLIENT / 'data/maps').glob(f'{mid}_*.swf'))[-1])
            art = self.maps[f'dungeon_{mid}']
            self.assertEqual(art['backgroundId'], metadata['backgroundNum'])
            self.assertEqual(art['sceneryCounts'].get('background', 0), int(metadata['backgroundNum'] != 0))
        for source in (DEFAULT_CLIENT / 'clips/gfx').glob('*.swf'):
            if source.stem[0] not in 'go':
                continue
            self.assertEqual(hashlib.sha256(source.read_bytes()).digest(),
                             hashlib.sha256((OUT / 'raw/clips/gfx' / source.name).read_bytes()).digest())

    def test_quarter_turns_mirroring_and_slopes_use_the_flash_rules(self):
        self.assertEqual(map_symbol_transform(0, False), (1, 1, 0, 0))
        self.assertEqual(map_symbol_transform(1, False), (0, 0, .5185, -1.9286))
        self.assertEqual(map_symbol_transform(2, True), (1, -1, 0, 0))
        self.assertEqual(map_symbol_transform(3, True), (0, 0, .5185, 1.9286))
        self.assertEqual(map_symbol_transform(1, False, slope=10), (1, 1, 0, 0))


if __name__ == '__main__':
    unittest.main()
