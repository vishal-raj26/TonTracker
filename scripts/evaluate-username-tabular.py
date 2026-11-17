"""Offline development only. No production inference or reserved-market labels."""
import argparse
import hashlib
import json
import math
from pathlib import Path

import numpy as np
import scipy
import sklearn
from sklearn.ensemble import HistGradientBoostingRegressor

SOURCE_HASH = '0807dc064b5a5653b004ddfd41ba559a6a95b0dd5c605f597214116371a81448'
PARAMS = dict(max_iter=100, max_leaf_nodes=15, min_samples_leaf=20,
              learning_rate=0.1, early_stopping=False, random_state=17)


def features(row):
    # Only target spelling and previously recorded point-in-time evidence.
    name = row['username'].lower().lstrip('@')
    vector = row.get('vectorUsd')
    basic = [math.log(row['baseUsd']), math.log(vector) if vector else np.nan,
             row.get('candidateCount', 0), len(name),
             sum(c.isdigit() for c in name), name.count('_'),
             len(set(name)), sum(c in 'aeiou' for c in name)]
    buckets = [0] * 128
    bounded = '^' + name + '$'
    for size in (3, 4, 5):
        for i in range(len(bounded) - size + 1):
            digest = hashlib.sha256(bounded[i:i + size].encode('ascii')).digest()
            buckets[int.from_bytes(digest[:4], 'big') % 128] = 1
    return basic + buckets


def boundaries(rows):
    cuts = [int(len(rows) * fraction) for fraction in (.6, .8)]
    for k, cut in enumerate(cuts):
        while cut < len(rows) and rows[cut]['eventTime'] == rows[cut - 1]['eventTime']:
            cut += 1
        cuts[k] = cut
    a, b = cuts
    if not 0 < a < b < len(rows):
        raise ValueError('Insufficient distinct temporal blocks')
    return a, b


def metrics(actual, predicted, lower=None, upper=None):
    if len(actual) == 0:
        return {'samples': 0}
    errors = np.sort(np.abs(predicted - actual))
    result = dict(samples=len(actual), meanAbsoluteLogError=float(errors.mean()),
                  medianFactorError=float(np.exp(errors[len(errors) // 2])))
    if lower is not None:
        result.update(coverage=float(np.mean((lower <= actual) & (actual <= upper))),
                      intervalScore=float(np.mean(upper - lower + 10 * np.maximum(lower - actual, 0)
                                                   + 10 * np.maximum(actual - upper, 0))))
    return result


def run(source, semantics=None):
    rows = sorted(source['evidence'], key=lambda row: row['eventTime'])
    if any(not math.isfinite(row['actualUsd']) or row['actualUsd'] <= 0 or
           not math.isfinite(row['baseUsd']) or row['baseUsd'] <= 0 for row in rows):
        raise ValueError('Invalid labels/baseline; do not silently filter attempts')
    a, b = boundaries(rows)
    x = np.asarray([features(row) for row in rows], dtype=float)
    if semantics is not None:
        if semantics['sourceSha256'] != SOURCE_HASH:
            raise ValueError('Semantic source mismatch')
        lookup = {row['eventId']: row for row in semantics['rows']}
        if len(lookup) != len(rows):
            raise ValueError('Duplicate or missing semantic events')
        extra = []
        for row in rows:
            record = lookup[row['eventId']]
            if (record['eventTime'], record['nftAddress']) != (row['eventTime'], row['nftAddress']):
                raise ValueError('Semantic identity/cutoff mismatch')
            extra.append(record['features'])
        extra = np.asarray(extra, dtype=float)
        if extra.shape != (len(rows), len(semantics['featureNames'])) or not np.isfinite(extra).all():
            raise ValueError('Invalid semantic feature matrix')
        x = np.column_stack((x, extra))
    actual = np.log([row['actualUsd'] for row in rows])
    base = np.log([row['baseUsd'] for row in rows])
    residual = actual - base
    models = [HistGradientBoostingRegressor(loss='absolute_error', **PARAMS),
              HistGradientBoostingRegressor(loss='quantile', quantile=.1, **PARAMS),
              HistGradientBoostingRegressor(loss='quantile', quantile=.9, **PARAMS)]
    predictions = []
    for model in models:
        model.fit(x[:a], residual[:a])
        predictions.append(base[a:] + model.predict(x[a:]))
    center, qlo, qhi = predictions
    lower = np.minimum(np.minimum(qlo, qhi), center)
    upper = np.maximum(np.maximum(qlo, qhi), center)
    calibration_count = b - a
    scores = np.maximum(lower[:calibration_count] - actual[a:b], actual[a:b] - upper[:calibration_count])
    rank = min(len(scores), math.ceil((len(scores) + 1) * .8))
    # Nonnegative expansion preserves ordering and inclusion of the point estimate.
    expansion = max(0., float(np.sort(scores)[rank - 1]))
    center, lower, upper = [values[calibration_count:] for values in (center, lower, upper)]
    lower, upper = lower - expansion, upper + expansion
    target = actual[b:]
    bands = {'overall': np.ones(len(target), dtype=bool), 'ordinary': target < math.log(100),
             'intermediate': (target >= math.log(100)) & (target < math.log(500)),
             'premium': target >= math.log(500)}
    summaries = {}
    for name, mask in bands.items():
        summaries[name] = {'baseline': metrics(target[mask], base[b:][mask]),
                           'candidate': metrics(target[mask], center[mask], lower[mask], upper[mask]),
                           'uniqueIdentities': len({row['nftAddress'] for row, keep in zip(rows[b:], mask) if keep})}
    return dict(qualification=False, baselineIntervalsAvailable=False, params=PARAMS,
                versions=dict(sklearn=sklearn.__version__, numpy=np.__version__, scipy=scipy.__version__),
                featureSchema='base-vector-structural8-sha256-binary-char3to5-128-v1',
                split=dict(train=a, calibration=b-a, evaluation=len(rows)-b,
                           calibrationFrom=rows[a]['eventTime'], evaluationFrom=rows[b]['eventTime']),
                attempts=len(rows)-b, abstentions=0, intervalExpansion=expansion, metrics=summaries,
                results=[dict(eventId=row['eventId'], nftAddress=row['nftAddress'], eventTime=row['eventTime'],
                              actualUsd=row['actualUsd'], baseUsd=row['baseUsd'],
                              estimateUsd=float(np.exp(mid)), lowerUsd=float(np.exp(lo)), upperUsd=float(np.exp(hi)))
                         for row, mid, lo, hi in zip(rows[b:], center, lower, upper)])


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', required=True)
    parser.add_argument('--semantics')
    args = parser.parse_args()
    path = Path(__file__).resolve().parents[1] / 'research/telegram-usernames/data/username-evidence-fusion-development-2026-09-08.json'
    data = path.read_bytes()
    if hashlib.sha256(data).hexdigest() != SOURCE_HASH:
        raise ValueError('Development source hash changed')
    semantic_bytes = Path(args.semantics).read_bytes() if args.semantics else None
    report = run(json.loads(data), json.loads(semantic_bytes) if semantic_bytes else None)
    if semantic_bytes:
        report['semanticFeaturesSha256'] = hashlib.sha256(semantic_bytes).hexdigest()
        report['featureSchema'] += '-historical-structural-semantic-v1'
    report['sourceSha256'] = SOURCE_HASH
    report['scriptSha256'] = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    with open(args.output, 'x', encoding='utf-8') as handle:
        json.dump(report, handle, indent=2, allow_nan=False)
    print(json.dumps({key: value for key, value in report.items() if key != 'results'}, indent=2))
