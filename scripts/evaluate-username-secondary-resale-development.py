"""Frozen, exposed-history resale development fit. Never a production valuation."""
import argparse
import csv
import hashlib
import importlib.util
import json
import math
from datetime import datetime
from pathlib import Path

import numpy as np
import scipy
import sklearn
from sklearn.ensemble import HistGradientBoostingRegressor


ROOT = Path(__file__).resolve().parents[1]
PROTOCOL = ROOT / 'research/telegram-usernames/secondary-resale-development-protocol-2026-09-26.json'
AUDIT = ROOT / 'research/telegram-usernames/data/username-secondary-resale-protocol-audit-2026-09-26.json'
AUDIT_SHA256 = '3522375f055652de6ee1a89d620d73717ece15447bf31c91ba260da17f8c56bc'
TABULAR_PATH = Path(__file__).with_name('evaluate-username-tabular.py')
spec = importlib.util.spec_from_file_location('username_tabular', TABULAR_PATH)
tabular = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tabular)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def utc_millis(value):
    parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if parsed.tzinfo is None or parsed.utcoffset().total_seconds() != 0:
        raise ValueError('Expected explicit UTC timestamp')
    return round(parsed.timestamp() * 1000)


def load_inputs():
    protocol_bytes = PROTOCOL.read_bytes()
    protocol = json.loads(protocol_bytes)
    if protocol['version'] != 'secondary-resale-development-v1':
        raise ValueError('Unexpected frozen development protocol')
    audit_bytes = AUDIT.read_bytes()
    if digest(audit_bytes) != AUDIT_SHA256 or json.loads(audit_bytes)['protocolSha256'] != digest(protocol_bytes):
        raise ValueError('Protocol audit changed')
    source = protocol['sourceFiles']
    sales_path = ROOT / source['historicalSales']['path']
    feature_path = ROOT / source['pointInTimeFeatures']['path']
    sales_bytes = sales_path.read_bytes()
    feature_bytes = feature_path.read_bytes()
    if digest(sales_bytes) != source['historicalSales']['sha256'] or digest(feature_bytes) != source['pointInTimeFeatures']['sha256']:
        raise ValueError('Frozen historical input changed')
    prepared = json.loads(feature_bytes)
    if len(prepared['featureNames']) != 118 or len(prepared['rows']) != 81617:
        raise ValueError('Prepared feature schema or count changed')
    return protocol, prepared, sales_path, digest(protocol_bytes)


def design(row):
    # The 118 exported features were stamped strictly as of each historical sale.
    # The spelling hashes are the predeclared, price-free existing implementation.
    stub = dict(row, baseUsd=1, vectorUsd=None, candidateCount=0)
    values = row['features'] + tabular.features(stub)[8:]
    if len(values) != 246 or not np.isfinite(values).all():
        raise ValueError('Invalid frozen feature row')
    return values


def join_stage(prepared, sales_path):
    by_id = {row['eventId']: row for row in prepared['rows']}
    if len(by_id) != len(prepared['rows']):
        raise ValueError('Duplicate prepared event')
    seen = set()
    earliest = {}
    source_rows = 0
    with sales_path.open('r', encoding='utf-8', newline='') as handle:
        for sale in csv.DictReader(handle):
            source_rows += 1
            identity = sale['nft_item_address']
            time = float(sale['sale_timestamp']) * 1000
            earliest[identity] = min(earliest.get(identity, math.inf), time)
            event_id = f"{identity}:{sale['sale_timestamp']}:{sale['price_native']}"
            row = by_id.get(event_id)
            if row is None:
                continue
            if event_id in seen or row['nftAddress'] != identity or row['actualUsd'] != float(sale['price_usd']):
                raise ValueError('Prepared/historical event mismatch')
            if abs(time - utc_millis(row['eventTime'])) > 1:
                raise ValueError('Prepared event time mismatch')
            venue = f"{sale['market_stage']}/{sale['sale_type']}"
            if venue not in ('primary/auction', 'secondary/auction', 'secondary/sale'):
                raise ValueError('Unknown realized historical venue')
            row['realizedVenue'] = venue  # diagnostic/training-history selection only
            row['eventTimeMs'] = time
            seen.add(event_id)
    if source_rows != 340000 or len(seen) != len(by_id):
        raise ValueError('Incomplete historical join')
    rows = sorted(prepared['rows'], key=lambda row: (row['eventTimeMs'], row['eventId']))
    for row in rows:
        row['hasPriorOwnSale'] = earliest[row['nftAddress']] < row['eventTimeMs']
    return rows


def window_masks(fold, times):
    train = utc_millis(fold['trainUntilExclusive'])
    calibration = utc_millis(fold['calibrationUntilExclusive'])
    evaluation = utc_millis(fold['evaluationUntilExclusive'])
    if fold['calibrationFromInclusive'] != fold['trainUntilExclusive'] or fold['evaluationFromInclusive'] != fold['calibrationUntilExclusive'] or not train < calibration < evaluation:
        raise ValueError('Invalid frozen temporal fold')
    return times < train, (times >= train) & (times < calibration), (times >= calibration) & (times < evaluation)


def expansion(lower, upper, actual):
    if not len(actual):
        raise ValueError('No secondary calibration examples')
    scores = np.maximum(lower - actual, actual - upper)
    rank = min(len(scores), math.ceil((len(scores) + 1) * .8))
    return max(0., float(np.sort(scores)[rank - 1]))


def fit_predict(x, y, train_mask, calibration_mask, evaluation_mask, params):
    if train_mask.sum() < 50 or calibration_mask.sum() < 20 or not evaluation_mask.any():
        raise ValueError('Insufficient frozen training/calibration/evaluation support')
    later = calibration_mask | evaluation_mask
    models = [
        HistGradientBoostingRegressor(loss='absolute_error', **params),
        HistGradientBoostingRegressor(loss='quantile', quantile=.1, **params),
        HistGradientBoostingRegressor(loss='quantile', quantile=.9, **params),
    ]
    predictions = []
    for model in models:
        model.fit(x[train_mask], y[train_mask])
        predictions.append(model.predict(x[later]))
    center, qlo, qhi = predictions
    lower = np.minimum(np.minimum(qlo, qhi), center)
    upper = np.maximum(np.maximum(qlo, qhi), center)
    calibration_in_later = calibration_mask[later]
    amount = expansion(lower[calibration_in_later], upper[calibration_in_later], y[calibration_mask])
    evaluation_in_later = evaluation_mask[later]
    output = [center[evaluation_in_later], lower[evaluation_in_later] - amount, upper[evaluation_in_later] + amount]
    if any(not np.isfinite(values).all() for values in output):
        raise ValueError('Nonfinite model prediction')
    return output, amount


def metrics(rows, name):
    if not rows:
        return {'attempts': 0, 'uniqueIdentities': 0, 'abstentions': 0}
    actual = np.log([row['actualUsd'] for row in rows])
    point = np.log([row[name]['estimateUsd'] for row in rows])
    lower = np.log([row[name]['lowerUsd'] for row in rows])
    upper = np.log([row[name]['upperUsd'] for row in rows])
    errors = np.abs(point - actual)
    scores = upper - lower + 10 * np.maximum(lower - actual, 0) + 10 * np.maximum(actual - upper, 0)
    return {
        'attempts': len(rows), 'uniqueIdentities': len({row['nftAddress'] for row in rows}),
        'abstentions': 0, 'meanAbsoluteLogError': float(errors.mean()),
        'medianFactorError': float(np.exp(np.median(errors))),
        'p95FactorError': float(np.exp(np.quantile(errors, .95))),
        'coverage80': float(np.mean((lower <= actual) & (actual <= upper))),
        'meanLogIntervalScore80': float(scores.mean()),
    }


def summarize(rows):
    groups = {
        'all': rows,
        'secondary': [row for row in rows if row['realizedVenue'].startswith('secondary/')],
        'primary': [row for row in rows if row['realizedVenue'] == 'primary/auction'],
        'secondaryAuction': [row for row in rows if row['realizedVenue'] == 'secondary/auction'],
        'secondaryFixed': [row for row in rows if row['realizedVenue'] == 'secondary/sale'],
        'firstObserved': [row for row in rows if not row['hasPriorOwnSale']],
        'repeated': [row for row in rows if row['hasPriorOwnSale']],
    }
    for venue in ('all', 'secondary', 'primary'):
        selected = groups[venue]
        for band, predicate in (
            ('ordinary', lambda usd: usd < 100),
            ('intermediate', lambda usd: 100 <= usd < 500),
            ('premium', lambda usd: usd >= 500),
        ):
            groups[f'{venue}/{band}'] = [row for row in selected if predicate(row['actualUsd'])]
    return {key: {'secondaryOnly': metrics(selected, 'secondaryOnly'), 'allStageControl': metrics(selected, 'allStageControl')}
            for key, selected in groups.items()}


def main(output):
    protocol, prepared, sales_path, protocol_hash = load_inputs()
    rows = join_stage(prepared, sales_path)
    x = np.asarray([design(row) for row in rows], dtype=np.float64)
    y = np.log(np.asarray([row['actualUsd'] for row in rows], dtype=np.float64))
    times = np.asarray([row['eventTimeMs'] for row in rows], dtype=np.float64)
    secondary = np.asarray([row['realizedVenue'].startswith('secondary/') for row in rows], dtype=bool)
    if not np.isfinite(y).all() or not np.isfinite(x).all():
        raise ValueError('Nonfinite frozen inputs')
    results, folds = [], []
    for fold in protocol['folds']:
        train, calibration, evaluation = window_masks(fold, times)
        fold_predictions = {}
        expansions = {}
        for name, training_mask in [('secondaryOnly', train & secondary), ('allStageControl', train)]:
            print(json.dumps({'fitting': fold['id'], 'model': name, 'training': int(training_mask.sum())}), flush=True)
            output_values, amount = fit_predict(x, y, training_mask, calibration & secondary, evaluation, protocol['model']['params'])
            fold_predictions[name] = output_values
            expansions[name] = amount
        indices = np.flatnonzero(evaluation)
        current = []
        for offset, index in enumerate(indices):
            row = rows[index]
            item = {key: row[key] for key in ('eventId', 'nftAddress', 'eventTime', 'username', 'actualUsd', 'realizedVenue', 'hasPriorOwnSale')}
            for name, (center, lower, upper) in fold_predictions.items():
                item[name] = {'estimateUsd': float(np.exp(center[offset])),
                              'lowerUsd': float(np.exp(lower[offset])), 'upperUsd': float(np.exp(upper[offset]))}
            current.append(item)
        folds.append({'id': fold['id'], 'attempts': len(current), 'secondaryCalibration': int((calibration & secondary).sum()),
                      'secondaryTraining': int((train & secondary).sum()), 'intervalExpansion': expansions,
                      'metrics': summarize(current)})
        results.extend(current)
        print(json.dumps({'finishedFold': fold['id'], 'attempts': len(current),
                          'secondaryPremium': folds[-1]['metrics']['secondary/premium']}), flush=True)
    if len({row['eventId'] for row in results}) != len(results):
        raise ValueError('Overlapping evaluation event')
    report = {
        'qualification': False, 'productionIntegrated': False, 'v25ComparisonComplete': False,
        'reservedLabelsOpened': False, 'attempts': len(results), 'abstentions': 0,
        'protocolSha256': protocol_hash, 'protocolAuditSha256': AUDIT_SHA256,
        'inputSha256': {key: item['sha256'] for key, item in protocol['sourceFiles'].items()},
        'scriptSha256': digest(Path(__file__).read_bytes()),
        'versions': {'pythonSklearn': sklearn.__version__, 'numpy': np.__version__, 'scipy': scipy.__version__},
        'modelParams': protocol['model']['params'], 'folds': folds, 'pooled': summarize(results),
        'limitations': [
            'Exposed historical development and latest-row prepared feature sample, not a full-market or current-market qualification.',
            'Realized venue is used only to select known historical training sales and to stratify retrospective outcomes, never as a target predictor.',
            'Same-case v25 baseline, identity-clustered uncertainty and full viability gate remain incomplete; do not promote either model from this report.',
        ],
        'results': results,
    }
    with open(output, 'x', encoding='utf-8') as handle:
        json.dump(report, handle, indent=2, allow_nan=False)
        handle.write('\n')
    print(json.dumps({'attempts': len(results), 'pooledSecondaryPremium': report['pooled']['secondary/premium'],
                      'pooledSecondaryOrdinary': report['pooled']['secondary/ordinary']}, indent=2), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    main(args.output)
