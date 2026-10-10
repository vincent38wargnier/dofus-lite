import unittest
from import_retro_client import spell_visual


class SpellVisualTests(unittest.TestCase):
    def test_gesture_is_the_second_ga300_field_not_the_effect_type(self):
        for fields, gesture, kind in [('51,1,1', 'anim1', 51),  # Bond
                                      ('21,0,1', 'anim0', 21),  # Souffle
                                      ('31,2,1', 'anim2', 31),  # Flèche magique
                                      ('40,0,1', 'anim0', 40)]:
            result = spell_visual(fields)
            self.assertEqual((result['animation'], result['type']), (gesture, kind))
            self.assertTrue(result['front'])
            self.assertTrue(result['playEffect'])

    def test_packet_sentinels_and_effect_without_a_gesture(self):
        self.assertFalse(spell_visual('0,1,1')['playEffect'])
        self.assertFalse(spell_visual('11,-1,0')['playEffect'])
        self.assertTrue(spell_visual('11,-1,0')['skipAnimation'])
        self.assertFalse(spell_visual('11,-2,0')['skipAnimation'])
        self.assertIsNone(spell_visual('11,-2,0')['animation'])
        self.assertTrue(spell_visual('11,-2,0')['playEffect'])
        self.assertFalse(spell_visual('11,-2,0')['front'])


if __name__ == '__main__':
    unittest.main()
