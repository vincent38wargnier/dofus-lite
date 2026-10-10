from pathlib import Path
import struct
import tempfile
import unittest

from retro_audio import audio_tables, sound_cues, animation_sounds, action_strings, normalize_sound
from retro_swf import action, movie, push, tag, variable, place, function


class AudioImportTests(unittest.TestCase):
    def test_aliases_and_recordings_across_action_blocks(self):
        # AUEC.PRESSURE = 61; AUE[61] = {f:'fx_61.mp3',v:40,o:0}
        aliases = push('AUEC') + push(0) + push('Object') + action(0x40) + action(0x1d)
        aliases += variable('AUEC') + push('PRESSURE') + push(61) + action(0x4f)
        definitions = push('AUE') + push(0) + push('Array') + action(0x40) + action(0x1d)
        definitions += variable('AUE') + push(61)
        definitions += push('f') + push('fx_61.mp3') + push('v') + push(40) + push('o') + push(0)
        definitions += push(3) + action(0x43) + action(0x4f)
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'audio.swf'
            path.write_bytes(movie([tag(12, aliases + b'\0'), tag(12, definitions + b'\0'), tag(1)], (0, 1, 0, 1)))
            tables = audio_tables(path)
        cues, missing = sound_cues(tables, {'fx_61.mp3': 'audio/288.mp3'})
        self.assertEqual(missing, [])
        self.assertEqual(cues['PRESSURE'], {'url': 'audio/288.mp3', 'volume': .4, 'offset': 0})
        self.assertEqual(cues['61'], cues['PRESSURE'])
        self.assertEqual(sound_cues(tables, {'FX_61.mp3': 'audio/288.mp3'})[0], cues)
        self.assertEqual(sound_cues(tables, {})[1], ['PRESSURE'])

    def test_constant_pool_references(self):
        from retro_audio import push_values
        self.assertEqual(push_values(b'\x08\x00\x09\x01\x00\x07' + struct.pack('<i', 753), ['AUEC', 'AIE_F']),
                         ['AUEC', 'AIE_F', 753])

    def test_native_soma_normalization(self):
        self.assertEqual(normalize_sound('attack tourni pere noel-01'), 'ATTACK_TOURNI_PERE_NOEL_01')
        self.assertEqual(normalize_sound('é-à'), 'E_A')

    def test_function_literals_inherit_the_constant_pool(self):
        pool = action(0x88, struct.pack('<H', 2) + b'playSound\0jump\0')
        code = function('sound', [], action(0x96, b'\x08\x01'))
        self.assertEqual(action_strings(pool + code), ['playSound', 'jump', 'jump'])

    def test_exported_sounds_follow_nested_placements_and_ignore_other_animations(self):
        sound = tag(12, push('playSound') + push('blop-step') + b'\0')
        child = struct.pack('<HH', 1, 2) + tag(1) + sound + tag(1) + tag(0)
        wrapper = struct.pack('<HH', 2, 1) + place(1) + tag(1) + tag(0)
        quiet = struct.pack('<HH', 3, 1) + tag(1) + tag(0)
        link = struct.pack('<HH', 2, 2) + b'walkR\0' + struct.pack('<H', 3) + b'anim1R\0'
        items = [(39, child), (39, wrapper), (39, quiet), (56, link), (1, b'')]
        animations, all_cues = animation_sounds(items, {'cues': {'BLOP_STEP': {}}, 'effects': {}})
        self.assertEqual(animations, {'walkR': ['blop-step'], 'anim1R': []})
        self.assertEqual(all_cues, ['blop-step'])

    def test_rejects_code_instead_of_executing_it(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'audio.swf'
            path.write_bytes(movie([tag(12, action(0x99, b'\0\0') + b'\0'), tag(1)], (0, 1, 0, 1)))
            with self.assertRaisesRegex(ValueError, 'Unsupported static data opcode'):
                audio_tables(path)


if __name__ == '__main__':
    unittest.main()
