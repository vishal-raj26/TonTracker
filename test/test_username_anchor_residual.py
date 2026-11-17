import importlib.util
from pathlib import Path
import unittest

import numpy as np

spec = importlib.util.spec_from_file_location('residual', Path(__file__).resolve().parents[1] / 'scripts/evaluate-username-anchor-residual.py')
residual = importlib.util.module_from_spec(spec)
spec.loader.exec_module(residual)


def row():
    return dict(eventId='event', nftAddress='contract', username='sample', eventTime='2025-01-01T01:00:00Z',
                actualUsd=200, realizedVenue='secondary/sale', v25EstimateUsd=100, v25LowUsd=50,
                v25HighUsd=200, hasPriorOwnSale=True, priorOwnPriceUsd=300, priorOwnAgeDays=20,
                priorOwnSaleCount=2)


class ResidualSafety(unittest.TestCase):
    def test_window_boundaries_ignore_timestamp_string_format(self):
        bounds = ['2024-12-01T00:00:00Z', '2025-01-01T00:00:00Z']
        self.assertTrue(residual.in_window('2024-12-01T00:00:00.000Z', bounds))
        self.assertFalse(residual.in_window('2025-01-01T00:00:00.000Z', bounds))
        self.assertFalse(residual.in_window('2024-11-30T23:59:59.999Z', bounds))

    def test_outcomes_venue_identity_and_spelling_do_not_change_features(self):
        target = row()
        expected = residual.features(target)
        target.update(actualUsd=1e9, realizedVenue='primary/auction', nftAddress='other', username='abcdef')
        self.assertEqual(expected, residual.features(target))

    def test_future_or_same_time_and_missing_anchor_cannot_correct(self):
        for age in (-1, 0, float('nan')):
            target = row()
            target['priorOwnAgeDays'] = age
            self.assertIsNone(residual.features(target))
        target = row()
        target['hasPriorOwnSale'] = False
        self.assertIsNone(residual.features(target))
        target = row()
        target['v25EstimateUsd'] = None
        self.assertIsNone(residual.features(target))

    def test_exact_feature_join_rejects_identity_mismatch_and_duplicates(self):
        target = row()
        own = {k: target[k] for k in ('eventId', 'nftAddress', 'username', 'eventTime', 'hasPriorOwnSale',
                                     'priorOwnPriceUsd', 'priorOwnAgeDays', 'priorOwnSaleCount')}
        paired = dict(attempts=1, pairedCases=[target])
        self.assertEqual(len(residual.join_features(paired, dict(rows=[own]))), 1)
        with self.assertRaises(ValueError):
            residual.join_features(paired, dict(rows=[{**own, 'nftAddress': 'other'}]))
        with self.assertRaises(ValueError):
            residual.join_features(paired, dict(rows=[own, own]))

    def test_correction_can_fall_below_both_prior_sale_and_baseline(self):
        result = residual.prediction(residual.v25(row()), -1, -.5, -1.5, .2)
        self.assertLess(result['estimateUsd'], 100)
        self.assertLessEqual(result['lowerUsd'], result['estimateUsd'])
        self.assertGreaterEqual(result['upperUsd'], result['estimateUsd'])
        self.assertIsNone(residual.prediction(residual.v25(row()), 1000, 999, 1001, 0))

    def test_calibration_and_metrics_keep_finite_sample_and_abstentions(self):
        self.assertEqual(residual.conformal_expansion(np.zeros(4), np.ones(4), np.array([0., 1., 2., 3.])), 2)
        with self.assertRaises(ValueError):
            residual.conformal_expansion(np.array([]), np.array([]), np.array([]))
        target = row()
        target['residual'] = None
        result = residual.metrics([target], 'residual')
        self.assertEqual((result['attempts'], result['abstentions']), (1, 1))
        self.assertIsNone(result['male'])


if __name__ == '__main__':
    unittest.main()
