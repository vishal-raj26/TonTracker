"""Fixed chronological, sparse-vs-dense direct-price development ablation."""
import argparse
import hashlib
import importlib.util
import json
import math
from bisect import bisect_left
from datetime import datetime, timezone, timedelta
from pathlib import Path
import numpy as np
from sklearn.ensemble import HistGradientBoostingRegressor

spec = importlib.util.spec_from_file_location('tabular', Path(__file__).with_name('evaluate-username-tabular.py'))
tabular = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tabular)
ROOT = Path(__file__).resolve().parents[1] / 'research/telegram-usernames'


def design(row):
    # Exclude all price-derived inputs. Reuse only the fixed spelling hashes.
    stub = dict(row, baseUsd=1, vectorUsd=None, candidateCount=0)
    values = row['features'] + tabular.features(stub)[8:]
    if not np.isfinite(values).all():
        raise ValueError('Invalid feature matrix')
    return values


def fit_predict(train, calibration, evaluation, native=False):
    if len(train) < 50 or len(calibration) < 20 or not evaluation:
        raise ValueError('Insufficient temporal support')
    x = np.asarray([design(row) for row in train])
    y = np.log([row['actualNative' if native else 'actualUsd'] for row in train])
    later = calibration + evaluation
    later_x = np.asarray([design(row) for row in later])
    predictions = []
    for loss, quantile in [('absolute_error', None), ('quantile', .1), ('quantile', .9)]:
        model = HistGradientBoostingRegressor(loss=loss, quantile=quantile, **tabular.PARAMS)
        model.fit(x, y)
        values = model.predict(later_x)
        if native:
            values += np.log([row['priorFxUsd'] for row in later])
        predictions.append(values)
    center, qlo, qhi = predictions
    lo = np.minimum(np.minimum(qlo, qhi), center)
    hi = np.maximum(np.maximum(qlo, qhi), center)
    n = len(calibration)
    actual = np.log([row['actualUsd'] for row in calibration])
    scores = np.maximum(lo[:n] - actual, actual - hi[:n])
    rank = min(n, math.ceil((n + 1) * .8))
    expansion = max(0., float(np.sort(scores)[rank - 1]))
    return [dict(estimateUsd=float(np.exp(mid)), lowerUsd=float(np.exp(low - expansion)),
                 upperUsd=float(np.exp(high + expansion))) for mid, low, high in zip(center[n:], lo[n:], hi[n:])], expansion


def summarize(rows):
    result = {}
    for band, check in [('overall', lambda p: True), ('ordinary', lambda p: p < 100),
                        ('intermediate', lambda p: 100 <= p < 500), ('premium', lambda p: p >= 500)]:
        selected = [row for row in rows if check(row['actualUsd'])]
        actual = np.log([row['actualUsd'] for row in selected])
        summary = {'uniqueIdentities': len({row['nftAddress'] for row in selected})}
        for name in ('baseline', 'globalFusion', 'sparse', 'dense'):
            estimates = np.log([row[name]['estimateUsd'] for row in selected])
            intervals = ([np.log([row[name][field] for row in selected]) for field in ('lowerUsd', 'upperUsd')]
                         if name in ('sparse', 'dense') else [])
            summary[name] = tabular.metrics(actual, estimates, *intervals)
            if len(actual):
                summary[name]['p95FactorError'] = float(np.exp(np.quantile(np.abs(estimates-actual), .95)))
        result[band] = summary
    return result


def prepare_native(rows, metadata):
    records = {row['eventId']: row for row in metadata['records']}
    days = [datetime.fromisoformat(row['day']).replace(tzinfo=timezone.utc) for row in metadata['rates']]
    available = [day + timedelta(days=2) for day in days]
    if available != sorted(set(available)):
        raise ValueError('Unordered/duplicate FX days')
    for row in rows:
        label = records[row['eventId']]
        if (label['nftAddress'], label['eventTime'], label['actualUsd']) != (row['nftAddress'], row['eventTime'], row['actualUsd']):
            raise ValueError('Native source identity/value mismatch')
        timestamp = datetime.fromisoformat(row['eventTime'].replace('Z', '+00:00'))
        index = bisect_left(available, timestamp) - 1
        if index < 0 or timestamp - days[index] > timedelta(days=7):
            raise ValueError('Unavailable/stale prior daily FX; do not silently drop case')
        rate = metadata['rates'][index]['usd']
        if not math.isfinite(rate) or rate <= 0 or not math.isfinite(label['actualNative']) or label['actualNative'] <= 0:
            raise ValueError('Invalid native label or FX')
        row.update(actualNative=label['actualNative'], priorFxUsd=rate, priorFxDay=metadata['rates'][index]['day'])


def main(output, native=False):
    protocol_bytes = (ROOT / 'tabular-broad-protocol.json').read_bytes()
    broad_bytes = (ROOT / 'data/username-broad-training-2026-09-09.json').read_bytes()
    source_bytes = (ROOT / 'data/username-evidence-fusion-development-2026-09-08.json').read_bytes()
    semantic_bytes = (ROOT / 'data/username-tabular-semantics-2026-09-09.json').read_bytes()
    digest = lambda data: hashlib.sha256(data).hexdigest()
    if digest(source_bytes) != tabular.SOURCE_HASH:
        raise ValueError('Source changed')
    broad, source, semantic = map(json.loads, (broad_bytes, source_bytes, semantic_bytes))
    if broad['protocolSha256'] != digest(protocol_bytes) or semantic['sourceSha256'] != digest(source_bytes):
        raise ValueError('Protocol/source mismatch')
    semantic_lookup = {row['eventId']: row for row in semantic['rows']}
    if len(semantic_lookup) != len(source['evidence']):
        raise ValueError('Semantic identities incomplete/duplicated')
    targets = []
    for row in source['evidence']:
        features = semantic_lookup[row['eventId']]
        if (features['nftAddress'], features['eventTime']) != (row['nftAddress'], row['eventTime']):
            raise ValueError('Semantic identity/cutoff mismatch')
        targets.append(dict(row, features=features['features']))
    history = {row['eventId']: row for row in broad['rows']}
    if len(history) != len(broad['rows']):
        raise ValueError('Duplicate historical IDs')
    native_bytes = None
    if native:
        native_bytes = (ROOT / 'data/username-native-labels-2026-09-09.json').read_bytes()
        metadata = json.loads(native_bytes)
        if metadata['sourceSha256'] != broad['sourceHashes']['dune_username_sales.part']:
            raise ValueError('Native source hash mismatch')
        prepare_native(targets + list(history.values()), metadata)
    folds, results = [], []
    for fold in broad['folds']:
        dense = [history[key] for key in fold['eventIds']]
        dense_ids = set(fold['eventIds'])
        # Sparse training is an exact subset of the SAME historical window.
        sparse = [row for row in targets if row['eventId'] in dense_ids]
        calibration = [row for row in targets if fold['trainingUntil'] <= row['eventTime'] < fold['evaluationFrom']]
        evaluation = [row for row in targets if fold['evaluationFrom'] <= row['eventTime'] < fold['evaluationUntil']]
        if any(row['eventTime'] >= fold['trainingUntil'] for row in dense + sparse):
            raise ValueError('Future training row')
        for row in sparse:
            original = history[row['eventId']]
            if (row['nftAddress'], row['eventTime'], row['actualUsd']) != (original['nftAddress'], original['eventTime'], original['actualUsd']):
                raise ValueError('Training source identity/value mismatch')
        sparse_pred, sparse_expansion = fit_predict(sparse, calibration, evaluation, native)
        dense_pred, dense_expansion = fit_predict(dense, calibration, evaluation, native)
        current = [dict(eventId=row['eventId'], nftAddress=row['nftAddress'], eventTime=row['eventTime'], actualUsd=row['actualUsd'],
                        baseline={'estimateUsd': row['baseUsd']}, globalFusion={'estimateUsd': row['fusedUsd'] or row['baseUsd']},
                        sparse=sp, dense=de) for row, sp, de in zip(evaluation, sparse_pred, dense_pred)]
        results.extend(current)
        counts = {name: {'rows': len(rows), 'premium': sum(row['actualUsd'] >= 500 for row in rows),
                         'uniqueIdentities': len({row['nftAddress'] for row in rows})}
                  for name, rows in [('sparse', sparse), ('dense', dense), ('calibration', calibration), ('evaluation', evaluation)]}
        record = dict(id=fold['id'], trainingUntil=fold['trainingUntil'], evaluationFrom=fold['evaluationFrom'],
                      evaluationUntil=fold['evaluationUntil'], counts=counts,
                      intervalExpansion=dict(sparse=sparse_expansion, dense=dense_expansion), metrics=summarize(current))
        folds.append(record)
        print(json.dumps({'completedFold': fold['id'], 'counts': counts, 'premium': record['metrics']['premium']}), flush=True)
    if len({row['eventId'] for row in results}) != len(results):
        raise ValueError('Overlapping evaluation events')
    report = dict(qualification=False, baselineIntervalsAvailable=False, attempts=len(results), abstentions=0,
                  publicationEligible=0, publicationNote='Research-only candidates; no production publication policy qualified',
                  params=tabular.PARAMS, versions=dict(sklearn=tabular.sklearn.__version__, numpy=np.__version__, scipy=tabular.scipy.__version__),
                  protocolSha256=digest(protocol_bytes), trainingExportSha256=digest(broad_bytes), sourceSha256=digest(source_bytes),
                  semanticFeaturesSha256=digest(semantic_bytes), scriptSha256=digest(Path(__file__).read_bytes()),
                  sparsePolicy='Exact intersection of saved stride50 targets with dense training IDs',
                  folds=folds, pooled=summarize(results), results=results)
    report['nativeTraining'] = native
    if native_bytes:
        report['nativeMetadataSha256'] = digest(native_bytes)
        report['fxPolicy'] = 'Rate-day midnight plus48h strictly before target; maximum7day age; current/target event rate never used for prediction'
    with open(output, 'x', encoding='utf-8') as handle:
        json.dump(report, handle, indent=2, allow_nan=False)
    print(json.dumps({'pooled': report['pooled'], 'attempts': len(results)}, indent=2), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', required=True)
    parser.add_argument('--native', action='store_true')
    args = parser.parse_args()
    main(args.output, args.native)
