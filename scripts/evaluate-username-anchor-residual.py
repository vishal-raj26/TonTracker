"""One fixed exposed-history residual experiment. Never production inference."""
import argparse
from collections import Counter, defaultdict
from datetime import datetime
import hashlib
import json
import math
from pathlib import Path

import numpy as np
import sklearn
from sklearn.ensemble import HistGradientBoostingRegressor

ROOT = Path(__file__).resolve().parents[1]
PROTOCOL = ROOT / 'research/telegram-usernames/anchor-residual-development-protocol-2026-09-30.json'


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def positive(value):
    return isinstance(value, (float, int)) and not isinstance(value, bool) and math.isfinite(value) and value > 0


def in_window(event_time, bounds):
    moment = datetime.fromisoformat(event_time.replace('Z', '+00:00'))
    lower, upper = [datetime.fromisoformat(value.replace('Z', '+00:00')) for value in bounds]
    return lower <= moment < upper


def v25(row):
    values = [row.get(k) for k in ('v25EstimateUsd', 'v25LowUsd', 'v25HighUsd')]
    if all(positive(v) for v in values) and values[1] <= values[0] <= values[2]:
        return dict(zip(('estimateUsd', 'lowerUsd', 'upperUsd'), values))
    return None


def features(row):
    base = v25(row)
    age, count, prior = (row.get(k) for k in ('priorOwnAgeDays', 'priorOwnSaleCount', 'priorOwnPriceUsd'))
    if not row.get('hasPriorOwnSale') or base is None or not positive(prior) or not positive(age) \
            or not isinstance(count, int) or isinstance(count, bool) or count <= 0:
        return None
    return [math.log(base['estimateUsd']), math.log(prior / base['estimateUsd']),
            math.log1p(age), math.log1p(count), math.log(base['upperUsd'] / base['lowerUsd']),
            len(row['username'])]


def join_features(paired, own):
    keyed = {}
    for row in own['rows']:
        if row['eventId'] in keyed:
            raise ValueError('Duplicate own-feature event')
        keyed[row['eventId']] = row
    rows, seen = [], set()
    for row in paired['pairedCases']:
        if row['eventId'] in seen:
            raise ValueError('Duplicate paired event')
        seen.add(row['eventId'])
        prior = keyed.get(row['eventId'])
        if prior is None or any(prior[k] != row[k] for k in ('eventId', 'nftAddress', 'username', 'eventTime')):
            raise ValueError('Exact-NFT/name/time feature mismatch')
        if not positive(row.get('actualUsd')):
            raise ValueError('Invalid historical outcome')
        if prior['hasPriorOwnSale']:
            if not positive(prior['priorOwnPriceUsd']) or not positive(prior['priorOwnAgeDays']) \
                    or not isinstance(prior['priorOwnSaleCount'], int) or prior['priorOwnSaleCount'] <= 0:
                raise ValueError('Own feature is not valid strictly-prior evidence')
        elif prior['priorOwnPriceUsd'] is not None or prior['priorOwnAgeDays'] is not None \
                or prior['priorOwnSaleCount'] != 0:
            raise ValueError('Unavailable anchor has numeric evidence')
        rows.append({**row, **{k: prior[k] for k in ('hasPriorOwnSale', 'priorOwnPriceUsd',
                                                      'priorOwnAgeDays', 'priorOwnSaleCount')}})
    if len(rows) != paired['attempts']:
        raise ValueError('Paired attempt mismatch')
    return rows


def conformal_expansion(lower, upper, actual):
    if not len(actual) or not np.isfinite(np.column_stack((lower, upper, actual))).all():
        raise ValueError('Invalid calibration population')
    scores = np.maximum(lower - actual, actual - upper)
    rank = min(len(scores), math.ceil((len(scores) + 1) * .8))
    return max(0., float(np.sort(scores)[rank - 1]))


def prediction(base, center, lower, upper, expansion):
    low, high = min(lower, upper, center), max(lower, upper, center)
    logs = [math.log(base['estimateUsd']) + value for value in (center, low - expansion, high + expansion)]
    try:
        values = [math.exp(value) for value in logs]
    except OverflowError:
        return None
    if not all(positive(value) for value in values):
        return None
    return dict(zip(('estimateUsd', 'lowerUsd', 'upperUsd'), values))


def metrics(rows, field):
    valid = [r for r in rows if r.get(field) is not None]
    result = {'attempts': len(rows), 'estimates': len(valid), 'abstentions': len(rows) - len(valid),
              'male': None, 'medianFactor': None, 'p95Factor': None, 'coverage80': None, 'intervalScore': None}
    if not valid:
        return result
    errors, scores, hits = [], [], 0
    for row in valid:
        value, actual = row[field], row['actualUsd']
        center, lower, upper = [value[k] for k in ('estimateUsd', 'lowerUsd', 'upperUsd')]
        if not all(positive(v) for v in (center, lower, upper, actual)) or not lower <= center <= upper:
            raise ValueError('Invalid metric prediction')
        errors.append(abs(math.log(center / actual)))
        scores.append(math.log(upper / lower) + 10 * max(0, math.log(lower / actual))
                      + 10 * max(0, math.log(actual / upper)))
        hits += lower <= actual <= upper
    result.update(male=float(np.mean(errors)), medianFactor=float(np.median(np.exp(errors))),
                  p95Factor=float(np.quantile(np.exp(errors), .95)), coverage80=hits / len(valid),
                  intervalScore=float(np.mean(scores)))
    return result


def groups(rows, fit_ids):
    out = {'all': rows, 'secondary': [r for r in rows if r['realizedVenue'].startswith('secondary/')]}
    for population in ('all', 'secondary'):
        for band, accept in [('ordinary', lambda v: v < 100), ('intermediate', lambda v: 100 <= v < 500),
                             ('premium', lambda v: v >= 500)]:
            name = band if population == 'all' else f'{population}/{band}'
            out[name] = [r for r in out[population] if accept(r['actualUsd'])]
    out.update(ownAvailable=[r for r in rows if features(r) is not None],
               ownAbsent=[r for r in rows if features(r) is None],
               newToFitIdentity=[r for r in rows if r['nftAddress'] not in fit_ids],
               seenFitIdentity=[r for r in rows if r['nftAddress'] in fit_ids])
    return out


def summaries(grouped):
    return {name: {'identities': len({r['nftAddress'] for r in rows}),
                   **{field: metrics(rows, field) for field in ('v25', 'residual', 'ownHistoryCandidate', 'staticControl')}}
            for name, rows in grouped.items()}


def bootstrap(rows, iterations, seed):
    totals = defaultdict(lambda: [0., 0., 0])
    for row in rows:
        if row['v25'] is not None and row['residual'] is not None:
            total = totals[row['nftAddress']]
            total[0] += abs(math.log(row['v25']['estimateUsd'] / row['actualUsd']))
            total[1] += abs(math.log(row['residual']['estimateUsd'] / row['actualUsd']))
            total[2] += 1
    if not totals:
        return None
    matrix = np.asarray([totals[key] for key in sorted(totals)])
    rng = np.random.default_rng(seed)
    samples = matrix[rng.integers(0, len(matrix), size=(iterations, len(matrix)))].sum(axis=1)
    gains = (samples[:, 0] - samples[:, 1]) / samples[:, 0]
    return {'identities': len(matrix), 'pairedEvents': int(matrix[:, 2].sum()), 'iterations': iterations,
            'lower95': float(np.quantile(gains, .025)), 'median': float(np.median(gains)),
            'upper95': float(np.quantile(gains, .975))}


def decisions(summary, uncertainty, limits):
    def comparison(group, metric, scale):
        pair = summary[group]
        a, b = pair['residual'][metric], pair['v25'][metric]
        return a is not None and b is not None and a <= b * scale
    checks = {}
    for name in ('premium', 'secondary/premium'):
        values = summary[name]['residual']
        checks[f'{name}/median'] = values['medianFactor'] is not None and values['medianFactor'] <= limits['premiumMedianFactorMaximum']
        checks[f'{name}/improvement'] = comparison(name, 'male', 1 - limits['premiumMaleImprovementMinimum'])
        checks[f'{name}/coverage'] = values['coverage80'] is not None and values['coverage80'] >= limits['premiumCoverageMinimum']
        checks[f'{name}/positiveBootstrap'] = uncertainty[name] is not None and uncertainty[name]['lower95'] > 0
        checks[f'{name}/identities'] = summary[name]['identities'] >= limits['premiumIndependentIdentitiesMinimum']
    for name in ('ordinary', 'intermediate', 'secondary/ordinary', 'secondary/intermediate'):
        checks[f'{name}/regression'] = comparison(name, 'male', 1 + limits['ordinaryAndIntermediateMaleRegressionMaximum'])
    coverage = summary['all']['residual']['coverage80']
    checks['overallCoverage'] = coverage is not None and limits['overallCoverageRange'][0] <= coverage <= limits['overallCoverageRange'][1]
    checks['intervalScore'] = comparison('all', 'intervalScore', 1)
    checks['availability'] = summary['all']['residual']['abstentions'] <= summary['all']['v25']['abstentions']
    checks['independentTemporalSupport'] = 1 >= limits['independentTemporalBlocksMinimum']
    return {'checks': checks, 'numericalGatesPass': all(v for k, v in checks.items() if k != 'independentTemporalSupport'),
            'developmentPass': all(checks.values()), 'failed': [k for k, v in checks.items() if not v],
            'productionQualification': False}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--audit-only', action='store_true')
    args = parser.parse_args()
    protocol = json.loads(PROTOCOL.read_bytes())
    if protocol['version'] != 'username-anchor-residual-development-v1' or not protocol['frozenBeforeFit']:
        raise ValueError('Invalid fixed protocol')
    inputs = {}
    for name, source in protocol['sources'].items():
        source_path = ROOT / source['path']
        if digest(source_path) != source['sha256']:
            raise ValueError(f'Frozen input changed: {name}')
        inputs[name] = json.loads(source_path.read_bytes())
    if inputs['paired']['caseSetSha256'] != protocol['caseSetSha256']:
        raise ValueError('Case-set fingerprint changed')
    rows = join_features(inputs['paired'], inputs['ownFeatures'])
    if len(rows) != protocol['attempts']:
        raise ValueError('Unexpected case count')
    partitions = {name: [r for r in rows if in_window(r['eventTime'], bounds)]
                  for name, bounds in protocol['windows'].items()}
    if sum(map(len, partitions.values())) != len(rows):
        raise ValueError('Temporal partition mismatch')
    eligible = {name: [r for r in part if features(r) is not None] for name, part in partitions.items()}
    audit = {'fitRun': False, 'rows': len(rows), 'windowCases': {k: len(v) for k, v in partitions.items()},
             'eligible': {k: len(v) for k, v in eligible.items()}, 'protocolSha256': digest(PROTOCOL),
             'scriptSha256': digest(Path(__file__)), 'versions': {'numpy': np.__version__, 'sklearn': sklearn.__version__}}
    if args.audit_only:
        print(json.dumps(audit, indent=2))
        return
    output = ROOT / protocol['output']
    if output.exists():
        raise ValueError('Result exists; no repeat fit allowed')
    seal = json.loads((ROOT / protocol['codeSeal']).read_bytes())
    if not seal['sealedBeforeFit'] or seal['protocolSha256'] != digest(PROTOCOL) \
            or seal['scriptSha256'] != digest(Path(__file__)) or seal['versions'] != audit['versions']:
        raise ValueError('Code/protocol/runtime seal mismatch')
    counts = Counter(r['nftAddress'] for r in eligible['fit'])
    if len(eligible['fit']) < 100 or len(eligible['calibration']) < 100:
        raise ValueError('Insufficient fit/calibration cases')
    x = np.asarray([features(r) for r in eligible['fit']], dtype=float)
    y = np.asarray([math.log(r['actualUsd'] / r['v25EstimateUsd']) for r in eligible['fit']])
    weights = np.asarray([1 / math.sqrt(counts[r['nftAddress']]) for r in eligible['fit']])
    models = [HistGradientBoostingRegressor(loss='absolute_error', **protocol['model']['params'])] + \
        [HistGradientBoostingRegressor(loss='quantile', quantile=q, **protocol['model']['params']) for q in (.1, .9)]
    for model in models:
        model.fit(x, y, sample_weight=weights)
    cal = eligible['calibration']
    center, lo, hi = [model.predict(np.asarray([features(r) for r in cal])) for model in models]
    lower, upper = np.minimum.reduce((center, lo, hi)), np.maximum.reduce((center, lo, hi))
    expansion = conformal_expansion(lower, upper, np.asarray([math.log(r['actualUsd'] / r['v25EstimateUsd']) for r in cal]))
    check = partitions['check']
    for row in check:
        row['v25'] = v25(row)
        row['residual'] = row['v25']
    check_eligible = eligible['check']
    center, lo, hi = [model.predict(np.asarray([features(r) for r in check_eligible])) for model in models]
    for row, c, l, h in zip(check_eligible, center, lo, hi):
        row['residual'] = prediction(row['v25'], c, l, h, expansion)
    grouped = groups(check, set(counts))
    summary = summaries(grouped)
    uncertainty = {name: bootstrap(grouped[name], protocol['reporting']['bootstrap']['iterations'],
                                  protocol['reporting']['bootstrap']['seed']) for name in ('premium', 'secondary/premium')}
    report = {**audit, 'fitRun': True, 'qualification': False, 'productionIntegrated': False,
              'reservedLabelsOpened': False, 'codeSealSha256': digest(ROOT / protocol['codeSeal']),
              'createdAt': datetime.now().astimezone().isoformat(), 'caseSetSha256': protocol['caseSetSha256'],
              'trainingIdentities': len(counts), 'calibrationExpansionLog': expansion,
              'cohorts': summary, 'premiumUncertainty': uncertainty,
              'savedLogisticGateJanuary': inputs['savedGate']['windows']['laterCheck'],
              'decision': decisions(summary, uncertainty, protocol['gates']),
              'cases': [{k: r[k] for k in ('eventId', 'nftAddress', 'username', 'eventTime', 'actualUsd',
                                          'realizedVenue', 'v25', 'residual')} for r in check],
              'limitations': protocol['limits']}
    with output.open('x', encoding='utf8') as handle:
        json.dump(report, handle, indent=2, allow_nan=False)
        handle.write('\n')
    print(json.dumps({'output': str(output), 'sha256': digest(output), 'audit': audit,
                      'premium': summary['premium'], 'secondaryPremium': summary['secondary/premium'],
                      'ordinary': summary['ordinary'], 'decision': report['decision']}, indent=2))


if __name__ == '__main__':
    main()
