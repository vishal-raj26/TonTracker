"""Boundary and interval safety for the fixed offline resale evaluator."""
import importlib.util
import math
import unittest
from pathlib import Path

import numpy as np

spec = importlib.util.spec_from_file_location('resale', Path(__file__).with_name('evaluate-username-secondary-resale-development.py'))
resale = importlib.util.module_from_spec(spec)
spec.loader.exec_module(resale)


class ResaleDevelopmentTests(unittest.TestCase):
    def test_strict_temporal_partitions_and_gap_rejection(self):
        fold = dict(trainUntilExclusive='2024-07-01T00:00:00Z',
                    calibrationFromInclusive='2024-07-01T00:00:00Z',
                    calibrationUntilExclusive='2024-10-01T00:00:00Z',
                    evaluationFromInclusive='2024-10-01T00:00:00Z',
                    evaluationUntilExclusive='2025-01-01T00:00:00Z')
        times = np.array([np.datetime64(day).astype('datetime64[ms]').astype(int)
                          for day in ('2024-06-30T23:59:59', '2024-07-01T00:00:00',
                                      '2024-10-01T00:00:00', '2025-01-01T00:00:00')])
        train, calibration, evaluation = resale.window_masks(fold, times)
        self.assertEqual(train.tolist(), [True, False, False, False])
        self.assertEqual(calibration.tolist(), [False, True, False, False])
        self.assertEqual(evaluation.tolist(), [False, False, True, False])
        with self.assertRaisesRegex(ValueError, 'temporal fold'):
            resale.window_masks({**fold, 'evaluationFromInclusive': '2024-10-02T00:00:00Z'}, times)

    def test_finite_sample_expansion_never_shrinks_intervals(self):
        lower = np.array([0., 0., 0., 0.])
        upper = np.array([1., 1., 1., 1.])
        actual = np.array([.5, 1.2, 2., .7])
        self.assertAlmostEqual(resale.expansion(lower, upper, actual), 1.)
        self.assertEqual(resale.expansion(lower, upper, np.array([.5, .7, .6, .5])), 0.)
        with self.assertRaisesRegex(ValueError, 'calibration'):
            resale.expansion(np.array([]), np.array([]), np.array([]))

    def test_all_attempt_metrics_include_failures_and_exact_identity_count(self):
        rows = [dict(eventId='a1', nftAddress='a', actualUsd=500, realizedVenue='secondary/auction', hasPriorOwnSale=False,
                     secondaryOnly=dict(estimateUsd=250, lowerUsd=200, upperUsd=600),
                     allStageControl=dict(estimateUsd=500, lowerUsd=400, upperUsd=600)),
                dict(eventId='a2', nftAddress='a', actualUsd=1000, realizedVenue='secondary/sale', hasPriorOwnSale=True,
                     secondaryOnly=dict(estimateUsd=500, lowerUsd=400, upperUsd=800),
                     allStageControl=dict(estimateUsd=1000, lowerUsd=800, upperUsd=1200))]
        result = resale.summarize(rows)
        self.assertEqual(result['secondary/premium']['secondaryOnly']['attempts'], 2)
        self.assertEqual(result['secondary/premium']['secondaryOnly']['uniqueIdentities'], 1)
        self.assertAlmostEqual(result['secondary/premium']['secondaryOnly']['meanAbsoluteLogError'], math.log(2))
        self.assertEqual(result['secondary/premium']['secondaryOnly']['coverage80'], .5)


if __name__ == '__main__':
    unittest.main()
