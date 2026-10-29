import importlib.util
import math
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name('evaluate-username-resale-own-history-development.py')
SPEC = importlib.util.spec_from_file_location('own_history_evaluator', SCRIPT)
evaluator = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(evaluator)


class OwnHistoryDevelopmentTests(unittest.TestCase):
    def test_own_features_are_log_scaled_and_missing_stays_missing(self):
        rows = [
            {'eventId': 'a', 'nftAddress': 'nft-a', 'username': 'one', 'eventTime': '2024-02-01T00:00:00Z'},
            {'eventId': 'b', 'nftAddress': 'nft-b', 'username': 'two', 'eventTime': '2024-02-01T00:00:00Z'},
        ]
        lookup = {
            'a': {'eventId': 'a', 'nftAddress': 'nft-a', 'username': 'one', 'eventTime': rows[0]['eventTime'],
                  'hasPriorOwnSale': True, 'priorOwnPriceUsd': 100, 'priorOwnAgeDays': 9, 'priorOwnSaleCount': 2},
            'b': {'eventId': 'b', 'nftAddress': 'nft-b', 'username': 'two', 'eventTime': rows[1]['eventTime'],
                  'hasPriorOwnSale': False, 'priorOwnPriceUsd': None, 'priorOwnAgeDays': None, 'priorOwnSaleCount': 0},
        }
        matrix = evaluator.own_matrix(rows, lookup)
        self.assertEqual(matrix[0, 0], 1)
        self.assertAlmostEqual(matrix[0, 1], math.log(100))
        self.assertAlmostEqual(matrix[0, 2], math.log1p(9))
        self.assertTrue(math.isnan(matrix[1, 1]))

    def test_own_feature_identity_mismatch_fails_closed(self):
        rows = [{'eventId': 'a', 'nftAddress': 'nft-a', 'username': 'one', 'eventTime': '2024-02-01T00:00:00Z'}]
        lookup = {'a': {'eventId': 'a', 'nftAddress': 'nft-other', 'username': 'one', 'eventTime': rows[0]['eventTime'],
                        'hasPriorOwnSale': False, 'priorOwnPriceUsd': None, 'priorOwnAgeDays': None, 'priorOwnSaleCount': 0}}
        with self.assertRaisesRegex(ValueError, 'identity/cutoff'):
            evaluator.own_matrix(rows, lookup)

    def test_identity_bootstrap_is_deterministic_and_paired(self):
        rows = [
            {'nftAddress': 'a', 'actualUsd': 1000, 'candidate': {'estimateUsd': 900}, 'control': {'estimateUsd': 500}},
            {'nftAddress': 'a', 'actualUsd': 2000, 'candidate': {'estimateUsd': 1800}, 'control': {'estimateUsd': 1000}},
            {'nftAddress': 'b', 'actualUsd': 1000, 'candidate': {'estimateUsd': 1100}, 'control': {'estimateUsd': 1500}},
        ]
        first = evaluator.paired_cluster_bootstrap(rows, 'candidate', 'control', iterations=100, seed=9)
        second = evaluator.paired_cluster_bootstrap(rows, 'candidate', 'control', iterations=100, seed=9)
        self.assertEqual(first, second)
        self.assertEqual(first['identities'], 2)


if __name__ == '__main__':
    unittest.main()
