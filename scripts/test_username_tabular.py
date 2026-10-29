import importlib.util
from pathlib import Path
import unittest
import numpy as np

spec = importlib.util.spec_from_file_location('tabular', Path(__file__).with_name('evaluate-username-tabular.py'))
tabular = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tabular)


class TemporalFeatureTests(unittest.TestCase):
    def test_features_ignore_outcome_and_future_fields(self):
        row = dict(username='example_name', baseUsd=20, vectorUsd=None, candidateCount=0)
        a = tabular.features(row)
        b = tabular.features(dict(row, actualUsd=100000, fusedUsd=90000, futurePopularity=100))
        np.testing.assert_equal(a, b)
        self.assertEqual(len(a), 136)
        self.assertTrue(np.isnan(a[1]))

    def test_same_time_groups_never_cross_boundaries(self):
        rows = [dict(eventTime=str(i // 3)) for i in range(20)]
        a, b = tabular.boundaries(rows)
        self.assertNotEqual(rows[a - 1]['eventTime'], rows[a]['eventTime'])
        self.assertNotEqual(rows[b - 1]['eventTime'], rows[b]['eventTime'])

    def test_interval_score_penalizes_misses(self):
        result = tabular.metrics(np.array([3.]), np.array([1.]), np.array([0.]), np.array([2.]))
        self.assertEqual(result['coverage'], 0)
        self.assertEqual(result['intervalScore'], 12)


if __name__ == '__main__':
    unittest.main()
