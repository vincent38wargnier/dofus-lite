from pathlib import Path
import struct
import tempfile
import unittest

from retro_audio import audio_tables, sound_cues
from retro_swf import action, movie, push, tag, variable


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

    def test_rejects_code_instead_of_executing_it(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'audio.swf'
            path.write_bytes(movie([tag(12, action(0x99, b'\0\0') + b'\0'), tag(1)], (0, 1, 0, 1)))
            with self.assertRaisesRegex(ValueError, 'Unsupported static data opcode'):
                audio_tables(path)


if __name__ == '__main__':
    unittest.main()
