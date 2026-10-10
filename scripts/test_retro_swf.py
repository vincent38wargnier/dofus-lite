import tempfile
from pathlib import Path
import struct
import unittest

from retro_swf import (adapt_effect, adapt_sprite, display_bounds, exports, function, matrix, movie,
                       place, read, read_matrix, read_rect, rect, tag, tags, timeline_lengths)


class SwfAdapterTests(unittest.TestCase):
    def test_function_body_is_outside_action_header_length(self):
        body = b'\x96\x02\x00\x05\x01\x3e'
        data = function('ready', [], body)
        header_length = struct.unpack_from('<H', data, 1)[0]
        self.assertEqual(data[3 + header_length:], body + b'\0')
        self.assertEqual(struct.unpack_from('<H', data, 3 + header_length - 2)[0], len(body) + 1)

    def test_short_and_long_tag_boundaries(self):
        for length in (0, 1, 62, 63, 64, 70000):
            payload = b'x' * length
            self.assertEqual(list(tags(tag(87, payload))), [(87, payload)])

    def test_rejects_truncated_payload(self):
        with self.assertRaises(ValueError):
            list(tags(tag(87, b'example')[:-1]))

    def test_signed_rect_and_mirrored_matrix(self):
        bounds = (-100, 100, -140, 40)
        self.assertEqual(read_rect(rect(bounds)), bounds)
        values = read_matrix(matrix(17, -9, -1, .5), 0)
        self.assertEqual(values, (-1, 0, 0, .5, 17, -9))

    def test_nested_registration_points(self):
        shape = struct.pack('<H', 1) + rect((-10, 20, -30, 0))
        nested = struct.pack('<HH', 2, 1) + place(1, x=5, y=10, sx=-1) + tag(1) + tag(0)
        items = [(2, shape), (39, nested), *list(tags(place(2, x=100, y=50))), (1, b'')]
        self.assertEqual(display_bounds(items), (85, 115, 30, 60))

    def test_full_timeline_bounds_include_later_nested_motion(self):
        shape = struct.pack('<H', 1) + rect((-10, 20, -30, 0))
        nested = struct.pack('<HH', 2, 2) + place(1) + tag(1) + place(1, x=100, y=50) + tag(1) + tag(0)
        items = [(2, shape), (39, nested), *list(tags(place(2))), (1, b'')]
        self.assertEqual(display_bounds(items), (-10, 20, -30, 0))
        self.assertEqual(display_bounds(items, all_frames=True), (-10, 120, -30, 50))

    def test_adaptation_preserves_nested_timeline_and_exports(self):
        sprite = struct.pack('<HH', 7, 2) + tag(1) + tag(1) + tag(0)
        link = struct.pack('<HH', 1, 7) + b'staticR\0'
        source = movie([tag(39, sprite), tag(56, link), tag(12, b'\x07\0'), tag(1)], (0, 100, 0, 100), 60)
        with tempfile.TemporaryDirectory() as tmp:
            a, b = Path(tmp) / 'source.swf', Path(tmp) / 'adapted.swf'
            a.write_bytes(source)
            meta = adapt_sprite(a, b)
            _, fps, items = read(b)
            self.assertEqual(a.read_bytes(), source)
            self.assertIn((39, sprite), items)
            self.assertEqual(exports(items), {'staticR': 7})
            self.assertEqual(fps, 60)
            self.assertEqual(meta['animations'], ['staticR'])

    def test_duration_includes_delayed_nested_animation_in_one_frame_wrapper(self):
        child = struct.pack('<HH', 1, 30) + tag(1) * 30 + tag(0)
        wrapper = struct.pack('<HH', 2, 1) + place(1) + tag(1) + tag(0)
        items = [(39, child), (39, wrapper), (1, b''), (1, b''),
                 *list(tags(place(2))), (1, b'')]
        duration, lengths = timeline_lengths(items)
        self.assertEqual(lengths[2], 30)
        self.assertEqual(duration, 32)

    def test_projectile_exports_are_instantiated_and_impact_duration_is_preserved(self):
        moving = struct.pack('<HH', 1, 1) + tag(1) + tag(0)
        impact = struct.pack('<HH', 2, 90) + tag(1) * 90 + tag(0)
        links = struct.pack('<HH', 2, 1) + b'move\0' + struct.pack('<H', 2) + b'shoot\0'
        source = movie([tag(39, moving), tag(39, impact), tag(56, links), tag(1)], (0, 100, 0, 100), 60)
        with tempfile.TemporaryDirectory() as tmp:
            a, b = Path(tmp) / 'source.swf', Path(tmp) / 'adapted.swf'
            a.write_bytes(source)
            meta = adapt_effect(a, b)
            _, _, items = read(b)
            self.assertEqual(a.read_bytes(), source)
        self.assertEqual(meta['duration'], 1500)  # Native impact, plus distance-dependent motion in JS.
        self.assertEqual(meta['exportFrames'], {'move': 1, 'shoot': 90})
        self.assertEqual(sum(code == 1 for code, _ in items), 1)
        self.assertIn((39, impact), items)
        actions = [payload for code, payload in items if code == 12]
        self.assertIn(b'move\0', actions[0])
        self.assertIn(b'shoot\0', actions[-1])
        self.assertIn(b'effectType\0', actions[0])
        self.assertIn(b'cellFrom\0', actions[0])


if __name__ == '__main__':
    unittest.main()
