import unittest
from extract_spells import parse_grade, parse_effect


class SpellImportTest(unittest.TestCase):
    def test_distinct_limits_and_state_lists(self):
        raw = '99;10;12;-1;0;0;1d3+9,-1,3,1,10,50,100,false,true,false,true,0,4,2,0,Pa,1,18;19,1,false'
        grade = parse_grade(raw)
        self.assertEqual(grade['maxPerTurn'], 4)
        self.assertEqual(grade['maxPerTarget'], 2)
        self.assertEqual(grade['requiredStates'], [1])
        self.assertEqual(grade['forbiddenStates'], [18, 19])

    def test_normal_and_critical_target_masks(self):
        raw = '111;3;-1;-1;3;0;0d0+3|111;2;-1;-1;2;0;0d0+2,111;4;-1;-1;3;0;0d0+4,3,1,4,50,100,false,true,false,true,0,0,0,4,XbXbXb,-1,-1,26,false'
        grade = parse_grade(raw, '18;8:8')
        self.assertEqual([e['targetMask'] for e in grade['effects']], [18, 8])
        self.assertEqual(grade['critEffects'][0]['targetMask'], 8)

    def test_preserves_third_parameter_and_original_effect(self):
        raw = '293;159;-1;240;4;0'
        effect = parse_effect(raw, 'Pa')
        self.assertEqual(effect['p3'], 240)
        self.assertEqual(effect['duration'], 4)
        self.assertEqual(effect['raw'], raw)

    def test_missing_grade_and_unsupported_effect_are_not_invented(self):
        self.assertIsNone(parse_grade('-1'))
        effect = parse_effect('9999;4;-1;-1;0;0', 'Pa')
        self.assertEqual(effect['kind'], 'unknown_9999')


if __name__ == '__main__':
    unittest.main()
