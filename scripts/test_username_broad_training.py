import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('broad', Path(__file__).with_name('evaluate-username-broad-training.py'))
broad = importlib.util.module_from_spec(spec)
spec.loader.exec_module(broad)


class BroadTrainingTests(unittest.TestCase):
    def row(self, i):
        return dict(username='name' + str(i), features=[i % 3, i % 5], actualUsd=10 + i)

    def test_design_has_no_price_inputs(self):
        row = self.row(1)
        self.assertEqual(broad.design(row), broad.design(dict(row, actualUsd=999999, baseUsd=9, vectorUsd=99)))

    def test_evaluation_outcomes_do_not_change_predictions(self):
        train = [self.row(i) for i in range(60)]
        calibration = [self.row(i) for i in range(60, 80)]
        evaluation = [self.row(i) for i in range(80, 83)]
        before = broad.fit_predict(train, calibration, evaluation)
        after = broad.fit_predict(train, calibration, [dict(row, actualUsd=999999) for row in evaluation])
        self.assertEqual(before, after)

    def test_native_fx_excludes_target_day_and_future_rates(self):
        row = dict(eventId='e', nftAddress='contract', eventTime='2024-01-04T12:00:00Z', actualUsd=20)
        metadata = dict(records=[dict(row,actualNative=10)], rates=[
            dict(day='2024-01-01',usd=1),dict(day='2024-01-02',usd=2),
            dict(day='2024-01-03',usd=999),dict(day='2024-01-04',usd=1000)])
        broad.prepare_native([row],metadata)
        self.assertEqual(row['priorFxUsd'],2)
        self.assertEqual(row['priorFxDay'],'2024-01-02')
        stale = dict(row,eventTime='2024-02-01T12:00:00Z')
        metadata['records'] = [dict(stale,actualNative=10)]
        with self.assertRaisesRegex(ValueError,'stale'):
            broad.prepare_native([stale],metadata)

    def test_native_predictions_ignore_evaluation_native_labels(self):
        rows = [dict(self.row(i),actualNative=10+i,priorFxUsd=2) for i in range(83)]
        before = broad.fit_predict(rows[:60],rows[60:80],rows[80:],True)
        after = broad.fit_predict(rows[:60],rows[60:80],[dict(row,actualNative=99999,actualUsd=99999) for row in rows[80:]],True)
        self.assertEqual(before,after)


if __name__ == '__main__':
    unittest.main()
