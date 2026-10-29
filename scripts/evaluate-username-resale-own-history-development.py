"""Frozen exposed-history own-sale fusion experiment; never production inference."""
import argparse
import hashlib
import importlib.util
import json
import math
from pathlib import Path

import numpy as np
import scipy
import sklearn
from sklearn.ensemble import HistGradientBoostingRegressor


ROOT = Path(__file__).resolve().parents[1]
PROTOCOL = ROOT / 'research/telegram-usernames/secondary-own-history-development-protocol-2026-09-27.json'
FEATURE_SUPPLEMENT = ROOT / 'research/telegram-usernames/data/username-secondary-own-history-feature-supplement-2026-09-27.json'
FIT_SUPPLEMENT = ROOT / 'research/telegram-usernames/data/username-secondary-own-history-fit-supplement-2026-09-27.json'
FEATURE_SUPPLEMENT_SHA256 = 'de56726c83c394a76483aba39360d744e7464f93c1e9a749225756d827fd4281'
FEATURE_AUDIT_SHA256 = '3411b039e48f1e6b8a92ba5759fa5aa5c40bf40b23a10219a2122b133df1c84c'
OWN_FEATURE_SHA256 = '03746b61f77a9a203f5a877303f071409549e731ab6098a4d61c076d29b64aca'
BASE_FEATURE_SHA256 = '00b13883db59d511ee1625f0186c115c1d765e6e9b504c4a0980de15acaec77a'
SALES_SHA256 = '6d724b74f727a797d553190cb72e408d3c70d6069202636a60f7ea2b2850682f'
OWN_FEATURES_PATH = ROOT / 'research/telegram-usernames/data/username-secondary-own-history-features-2026-09-27.json'
BASE_FEATURES_PATH = ROOT / 'research/telegram-usernames/data/username-broad-training-2026-09-09.json'
SALES_PATH = ROOT / 'research/telegram-usernames/data/dune_username_sales.part'
STATIC_SCRIPT = ROOT / 'scripts/evaluate-username-secondary-resale-development.py'
spec = importlib.util.spec_from_file_location('static_resale', STATIC_SCRIPT)
static = importlib.util.module_from_spec(spec)
spec.loader.exec_module(static)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def verify_fit_seal():
    supplement = json.loads(FIT_SUPPLEMENT.read_bytes())
    if not supplement.get('sealedBeforeCandidateFit') or supplement.get('reservedLabelsOpened'):
        raise ValueError('Candidate fit supplement is not sealed before labels')
    for entry in supplement['frozenCode'].values():
        if digest((ROOT / entry['path']).read_bytes()) != entry['sha256']:
            raise ValueError(f"Frozen evaluator dependency changed: {entry['path']}")
    return digest(FIT_SUPPLEMENT.read_bytes())


def protocol_inputs():
    protocol_bytes = PROTOCOL.read_bytes()
    protocol = json.loads(protocol_bytes)
    if digest(protocol_bytes) != protocol.get('sha256', digest(protocol_bytes)):
        raise ValueError('Protocol checksum mismatch')
    if protocol.get('version') != 'secondary-own-history-development-v1' or not protocol.get('frozenBeforeFitting'):
        raise ValueError('Own-history protocol is not frozen')
    supplement_bytes = FEATURE_SUPPLEMENT.read_bytes()
    if digest(supplement_bytes) != FEATURE_SUPPLEMENT_SHA256:
        raise ValueError('Feature supplement changed')
    supplement = json.loads(supplement_bytes)
    if supplement['protocolSha256'] != digest(protocol_bytes):
        raise ValueError('Feature supplement protocol lineage mismatch')
    for path, expected in ((OWN_FEATURES_PATH, OWN_FEATURE_SHA256),
                           (BASE_FEATURES_PATH, BASE_FEATURE_SHA256), (SALES_PATH, SALES_SHA256)):
        if digest(path.read_bytes()) != expected:
            raise ValueError(f'Frozen input changed: {path.name}')
    feature_audit = ROOT / 'research/telegram-usernames/data/username-secondary-own-history-feature-audit-2026-09-27.json'
    if digest(feature_audit.read_bytes()) != FEATURE_AUDIT_SHA256:
        raise ValueError('Feature audit changed')
    base = json.loads(BASE_FEATURES_PATH.read_bytes())
    own = json.loads(OWN_FEATURES_PATH.read_bytes())
    if len(base['rows']) != 81617 or len(own['rows']) != 81617 or len(base['featureNames']) != 118:
        raise ValueError('Prepared feature shape changed')
    if own.get('schemaVersion') != 'username-own-history-features-v1' or own['protocolSha256'] != digest(protocol_bytes):
        raise ValueError('Own feature lineage mismatch')
    own_by_id = {row['eventId']: row for row in own['rows']}
    if len(own_by_id) != len(own['rows']):
        raise ValueError('Duplicate own-feature event identity')
    return protocol, base, own, own_by_id, digest(protocol_bytes)


def own_matrix(rows, own_by_id):
    values = []
    for row in rows:
        own = own_by_id.get(row['eventId'])
        if own is None or (own['nftAddress'], own['username'], own['eventTime']) != (
                row['nftAddress'], row['username'], row['eventTime']):
            raise ValueError('Own-feature event identity/cutoff mismatch')
        if own['hasPriorOwnSale']:
            if not (own['priorOwnPriceUsd'] > 0 and own['priorOwnAgeDays'] >= 0 and own['priorOwnSaleCount'] > 0):
                raise ValueError('Invalid available own-history feature')
            values.append([1., math.log(own['priorOwnPriceUsd']), math.log1p(own['priorOwnAgeDays']),
                           math.log1p(own['priorOwnSaleCount'])])
        else:
            if any(own[key] is not None for key in ('priorOwnPriceUsd', 'priorOwnAgeDays')) or own['priorOwnSaleCount'] != 0:
                raise ValueError('Missing own history has nonempty evidence')
            values.append([0., np.nan, np.nan, 0.])
    matrix = np.asarray(values, dtype=np.float64)
    if matrix.shape != (len(rows), 4) or not np.isfinite(matrix[:, [0, 3]]).all():
        raise ValueError('Invalid own-history matrix')
    return matrix


def audit_only(output_path):
    protocol, base, own, own_by_id, protocol_hash = protocol_inputs()
    base_by_id = {row['eventId']: row for row in base['rows']}
    if len(base_by_id) != len(base['rows']) or set(base_by_id) != set(own_by_id):
        raise ValueError('Base/own feature event sets differ')
    ages, availability = [], {'available': 0, 'absent': 0, 'ambiguous': 0}
    for row in base['rows']:
        own_row = own_by_id[row['eventId']]
        if (row['nftAddress'], row['username'], row['eventTime']) != (
                own_row['nftAddress'], own_row['username'], own_row['eventTime']):
            raise ValueError('Base/own feature identity mismatch')
        if own_row['hasPriorOwnSale']:
            if not (own_row['priorOwnPriceUsd'] > 0 and own_row['priorOwnAgeDays'] >= 0
                    and own_row['priorOwnSaleCount'] > 0):
                raise ValueError('Invalid strictly-prior own feature')
            ages.append(own_row['priorOwnAgeDays'])
            availability['available'] += 1
        else:
            availability['absent'] += 1
    report = {'qualification': False, 'reservedLabelsOpened': False, 'fitRun': False,
              'protocolSha256': protocol_hash, 'featureSupplementSha256': FEATURE_SUPPLEMENT_SHA256,
              'evaluatorSha256': digest(Path(__file__).read_bytes()),
              'baseFeatureSha256': BASE_FEATURE_SHA256, 'ownFeatureSha256': OWN_FEATURE_SHA256,
              'historicalSalesSha256': SALES_SHA256, 'rows': len(base['rows']),
              'uniqueEventIds': len(base_by_id), 'featureWidth': 250,
              'ownHistoryAvailability': availability,
              'ownHistoryAgeDays': {'minimum': min(ages) if ages else None, 'maximum': max(ages) if ages else None,
                                    'median': float(np.median(ages)) if ages else None},
              'evaluationWindows': [fold['id'] for fold in protocol['folds']],
              'limitations': ['This audit does not fit a model or inspect reserved current-market outcomes.',
                              'Historical folds are exposed development windows, not untouched qualification.']}
    with open(output_path, 'x', encoding='utf-8') as handle:
        json.dump(report, handle, indent=2, allow_nan=False)
        handle.write('\n')
    print(json.dumps(report, indent=2))


def conformal_expansion(lower, upper, actual):
    scores = np.maximum(lower - actual, actual - upper)
    rank = min(len(scores), math.ceil((len(scores) + 1) * .8))
    return max(0., float(np.sort(scores)[rank - 1]))


def paired_cluster_bootstrap(rows, candidate, control, iterations=2000, seed=27092026):
    identities = {}
    for row in rows:
        identities.setdefault(row['nftAddress'], []).append(row)
    keys = sorted(identities)
    rng = np.random.default_rng(seed)
    values = []
    for _ in range(iterations):
        sampled = rng.choice(keys, size=len(keys), replace=True)
        sample = [row for key in sampled for row in identities[key]]
        base = np.mean([abs(math.log(row[control]['estimateUsd'] / row['actualUsd'])) for row in sample])
        cand = np.mean([abs(math.log(row[candidate]['estimateUsd'] / row['actualUsd'])) for row in sample])
        values.append((base - cand) / base if base > 0 else 0.)
    return {'identities': len(keys), 'iterations': iterations, 'seed': seed,
            'lower95': float(np.quantile(values, .025)), 'median': float(np.median(values)),
            'upper95': float(np.quantile(values, .975))}


def cohort_summaries(rows):
    groups = {'all': rows, 'secondary': [row for row in rows if row['realizedVenue'].startswith('secondary/')],
              'primary': [row for row in rows if row['realizedVenue'] == 'primary/auction']}
    for venue in ('all', 'secondary', 'primary'):
        selected = groups[venue]
        for band, predicate in [('ordinary', lambda usd: usd < 100),
                                ('intermediate', lambda usd: 100 <= usd < 500),
                                ('premium', lambda usd: usd >= 500)]:
            groups[f'{venue}/{band}'] = [row for row in selected if predicate(row['actualUsd'])]
    for venue, predicate in [('secondary/auction', lambda row: row['realizedVenue'] == 'secondary/auction'),
                             ('secondary/fixed', lambda row: row['realizedVenue'] == 'secondary/sale')]:
        groups[venue] = [row for row in rows if predicate(row)]
        for band, accept in [('ordinary', lambda usd: usd < 100), ('intermediate', lambda usd: 100 <= usd < 500),
                             ('premium', lambda usd: usd >= 500)]:
            groups[f'{venue}/{band}'] = [row for row in groups[venue] if accept(row['actualUsd'])]
    out = {key: {'attempts': len(value), 'candidate': static.metrics(value, 'ownHistoryCandidate'),
                 'staticControl': static.metrics(value, 'staticControl')}
           for key, value in groups.items()}
    premium = groups['secondary/premium']
    out['secondary/premium']['candidateVsStaticClusterBootstrap'] = paired_cluster_bootstrap(
        premium, 'ownHistoryCandidate', 'staticControl') if premium else None
    for name, accept in [('under30d', lambda row: row['priorOwnAgeDays'] is not None and row['priorOwnAgeDays'] < 30),
                         ('30to180d', lambda row: row['priorOwnAgeDays'] is not None and 30 <= row['priorOwnAgeDays'] < 180),
                         ('over180d', lambda row: row['priorOwnAgeDays'] is not None and row['priorOwnAgeDays'] >= 180),
                         ('noOwnHistory', lambda row: row['priorOwnAgeDays'] is None)]:
        chosen = [row for row in rows if accept(row)]
        out[f'ownHistory/{name}'] = {'attempts': len(chosen), 'candidate': static.metrics(chosen, 'ownHistoryCandidate'),
                                    'staticControl': static.metrics(chosen, 'staticControl')}
    return out


def fit(output_path):
    fit_supplement_hash = verify_fit_seal()
    protocol, base, own, own_by_id, protocol_hash = protocol_inputs()
    static_protocol, prepared, sales_path, static_protocol_hash = static.load_inputs()
    if static_protocol_hash != 'f4963c21b0f22ba93ae1964826b761f33b1cc0c5e8fc681dcd104ee439ac59c9':
        raise ValueError('Static control protocol changed')
    rows = static.join_stage(prepared, sales_path)
    x_static = np.asarray([static.design(row) for row in rows], dtype=np.float64)
    x_own = np.column_stack((x_static, own_matrix(rows, own_by_id)))
    y = np.log(np.asarray([row['actualUsd'] for row in rows], dtype=np.float64))
    times = np.asarray([row['eventTimeMs'] for row in rows], dtype=np.float64)
    params = protocol['candidate']['params']
    results, fold_reports = [], []
    for fold in protocol['folds']:
        train, calibration, evaluation = static.window_masks(fold, times)
        if not evaluation.any():
            raise ValueError(f"Empty evaluation fold {fold['id']}")
        predictions = {}
        for name, matrix in [('staticControl', x_static), ('ownHistoryCandidate', x_own)]:
            models = [HistGradientBoostingRegressor(loss='absolute_error', **params),
                      HistGradientBoostingRegressor(loss='quantile', quantile=.1, **params),
                      HistGradientBoostingRegressor(loss='quantile', quantile=.9, **params)]
            later = calibration | evaluation
            fitted = []
            for model in models:
                model.fit(matrix[train], y[train])
                fitted.append(model.predict(matrix[later]))
            center, qlo, qhi = fitted
            lower, upper = np.minimum(np.minimum(qlo, qhi), center), np.maximum(np.maximum(qlo, qhi), center)
            cal_mask = calibration[later]
            cal_rows = np.flatnonzero(cal_mask)
            secondary_cal = np.asarray([rows[index]['realizedVenue'].startswith('secondary/') for index in np.flatnonzero(later)])[cal_mask]
            if not secondary_cal.any():
                raise ValueError('No secondary calibration rows')
            expansion = conformal_expansion(lower[cal_mask][secondary_cal], upper[cal_mask][secondary_cal],
                                            y[cal_rows][secondary_cal])
            eval_mask = evaluation[later]
            predictions[name] = (center[eval_mask], lower[eval_mask] - expansion, upper[eval_mask] + expansion)
        indices = np.flatnonzero(evaluation)
        own_evaluation = own_matrix([rows[index] for index in indices], own_by_id)
        current = []
        for offset, index in enumerate(indices):
            row = rows[index]
            item = {key: row[key] for key in ('eventId', 'nftAddress', 'eventTime', 'username', 'actualUsd', 'realizedVenue')}
            item['hasPriorOwnSale'] = bool(own_evaluation[offset, 0])
            own_row = own_by_id[row['eventId']]
            item['priorOwnAgeDays'] = own_row['priorOwnAgeDays'] if item['hasPriorOwnSale'] else None
            item['priorOwnPriceUsd'] = own_row['priorOwnPriceUsd'] if item['hasPriorOwnSale'] else None
            for name, values in predictions.items():
                center, lower, upper = values
                item[name] = {'estimateUsd': float(np.exp(center[offset])), 'lowerUsd': float(np.exp(lower[offset])),
                              'upperUsd': float(np.exp(upper[offset]))}
            current.append(item)
        summary = cohort_summaries(current)
        fold_reports.append({'id': fold['id'], 'attempts': len(current), 'calibrationSecondary': int(sum(
            calibration[i] and rows[i]['realizedVenue'].startswith('secondary/') for i in range(len(rows)))),
            'trainingRows': int(train.sum()), 'metrics': summary})
        results.extend(current)
        print(json.dumps({'finishedFold': fold['id'], 'attempts': len(current),
                          'secondaryPremium': summary['secondary/premium']}, allow_nan=False), flush=True)
    if len({row['eventId'] for row in results}) != len(results):
        raise ValueError('Overlapping evaluation events')
    pooled = cohort_summaries(results)
    report = {'qualification': False, 'productionIntegrated': False, 'v25ComparisonComplete': False,
              'reservedLabelsOpened': False, 'attempts': len(results), 'abstentions': 0,
              'protocolSha256': protocol_hash, 'featureSupplementSha256': FEATURE_SUPPLEMENT_SHA256,
              'fitSupplementSha256': fit_supplement_hash,
              'staticControlProtocolSha256': static_protocol_hash,
              'featureAuditSha256': FEATURE_AUDIT_SHA256, 'featureFileSha256': OWN_FEATURE_SHA256,
              'evaluatorSha256': digest(Path(__file__).read_bytes()),
              'versions': {'pythonSklearn': sklearn.__version__, 'numpy': np.__version__, 'scipy': scipy.__version__},
              'params': params, 'folds': fold_reports, 'pooled': pooled,
              'limitations': ['Both folds are exposed historical development, not untouched or current-market qualification.',
                              'Full same-case v25 comparison remains mandatory before promotion.',
                              'Realized venue is retrospective stratification only; it is never a model input or route.',
                              'No reserved 2026 outcomes were read and no production code was changed.'], 'results': results}
    with open(output_path, 'x', encoding='utf-8') as handle:
        json.dump(report, handle, indent=2, allow_nan=False)
        handle.write('\n')
    print(json.dumps({'attempts': report['attempts'], 'pooledSecondaryPremium': pooled['secondary/premium'],
                      'pooledSecondaryOrdinary': pooled['secondary/ordinary']}, indent=2), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--audit-only', action='store_true')
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    if args.audit_only:
        audit_only(Path(args.output))
    else:
        fit(Path(args.output))
