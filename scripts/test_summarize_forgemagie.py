import unittest

from summarize_forgemagie import summarize


def event(kind, **data):
    return {'kind': kind, 'direction': 'server_to_client', 'connection': 'example', **data}


def item(uid, wisdom):
    return {'uid': uid, 'template': 9128, 'name': 'Blopanneau Coco Royal',
            'effects': [{'effect': 124, 'args': [wisdom, None, None]}]}


class SummaryTests(unittest.TestCase):
    def test_uid_replacement_keeps_the_observed_before_state(self):
        rows = [event('item_update', items=[item(10, 12)]),
                event('craft_result', result='failure'),
                event('item_removed', uid=10), event('item_update', items=[item(20, 13)]),
                event('exchange_item_update', items=[item(20, 13)]),
                event('craft_result', result='success', template=9128)]
        result = summarize(rows)['attempts']
        self.assertFalse(result[0]['before_known'])
        self.assertTrue(result[1]['before_known'])
        self.assertEqual(result[1]['stat_deltas'], {'124': 1})
        self.assertIsNone(result[1]['critical_success'])

    def test_two_possible_replacements_are_not_guessed(self):
        rows = [event('item_update', items=[item(10, 12), item(11, 14)]),
                event('craft_result', result='success', template=9128),
                event('item_removed', uid=10), event('item_removed', uid=11),
                event('item_update', items=[item(20, 13)]),
                event('craft_result', result='success', template=9128)]
        self.assertFalse(summarize(rows)['attempts'][-1]['before_known'])

    def test_information_after_result_in_same_batch_is_attached(self):
        rows = [event('craft_result', time='t1', result='failure'),
                event('fm_information', time='t1', messages=[{'id': 117}])]
        self.assertEqual(summarize(rows)['attempts'][0]['information'], [{'id': 117}])

    def test_consumed_quantities_use_server_counts(self):
        rows = [event('exchange_item_update', items=[{'uid': 4, 'quantity': 167}]),
                event('item_quantity', uid=4, quantity=166),
                event('craft_result', result='failure')]
        self.assertEqual(summarize(rows)['attempts'][0]['quantity_decreases_observed'][0]['consumed'], 1)


if __name__ == '__main__':
    unittest.main()
