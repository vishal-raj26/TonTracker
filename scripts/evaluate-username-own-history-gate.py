#!/usr/bin/env python3
"""Frozen research-only prediction-time gate between v25 and own-history HGB."""
import argparse
from collections import Counter, defaultdict
import hashlib
import json
import math
from pathlib import Path
import random

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler


ROOT = Path(__file__).resolve().parents[1]
PROTOCOL = ROOT / 'research/telegram-usernames/secondary-own-history-gate-development-protocol-2026-09-27.json'
OUTPUT = ROOT / 'research/telegram-usernames/data/username-secondary-own-history-gate-development-2026-09-27.json'


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def positive(value):
    return isinstance(value, (int, float)) and math.isfinite(value) and value > 0


def own_prediction(row):
    value = row['ownHistoryCandidate']
    return value if value and all(positive(value.get(key)) for key in ('estimateUsd', 'lowerUsd', 'upperUsd')) \
        and value['lowerUsd'] <= value['estimateUsd'] <= value['upperUsd'] else None


def v25_prediction(row):
    if all(positive(row.get(key)) for key in ('v25EstimateUsd', 'v25LowUsd', 'v25HighUsd')) \
            and row['v25LowUsd'] <= row['v25EstimateUsd'] <= row['v25HighUsd']:
        return {'estimateUsd': row['v25EstimateUsd'], 'lowerUsd': row['v25LowUsd'], 'upperUsd': row['v25HighUsd']}
    return None


def features(row):
    prior = row['priorOwnPriceUsd']
    age = row['priorOwnAgeDays']
    base = v25_prediction(row)
    candidate = own_prediction(row)
    if not row['hasPriorOwnSale'] or not positive(prior) or not isinstance(age, (int, float)) \
            or not math.isfinite(age) or age < 0 or not base or not candidate:
        return None
    return [math.log(base['estimateUsd']), math.log(candidate['estimateUsd'] / base['estimateUsd']),
            math.log(prior / base['estimateUsd']), math.log1p(age),
            math.log(base['upperUsd'] / base['lowerUsd'])]


def blend(base, candidate, weight):
    value = {key: math.exp((1 - weight) * math.log(base[key]) + weight * math.log(candidate[key]))
             for key in ('estimateUsd', 'lowerUsd', 'upperUsd')}
    if not value['lowerUsd'] <= value['estimateUsd'] <= value['upperUsd']:
        raise ValueError('Blended interval does not contain its point')
    return value


def load_rows(protocol):
    loaded = []
    for name in ('pairedV25Report', 'ownHistoryReport'):
        source = protocol['sources'][name]
        file = ROOT / source['path']
        if sha256(file) != source['sha256']:
            raise ValueError(f'{name} changed after protocol freeze')
        loaded.append(json.loads(file.read_text(encoding='utf8')))
    paired, own = loaded
    if paired['caseSetSha256'] != protocol['sources']['pairedV25Report']['caseSetSha256']:
        raise ValueError('Case set changed')
    keyed = {}
    for row in own['results']:
        key = (row['eventId'], row['nftAddress'], row['eventTime'], row['username'])
        if key in keyed:
            raise ValueError('Duplicate own-history case')
        keyed[key] = row
    rows = []
    for row in paired['pairedCases']:
        key = (row['eventId'], row['nftAddress'], row['eventTime'], row['username'])
        source = keyed.pop(key, None)
        if source is None or row['actualUsd'] != source['actualUsd'] or row['realizedVenue'] != source['realizedVenue']:
            raise ValueError('Outcome or case mismatch')
        rows.append({**row, 'hasPriorOwnSale': source['hasPriorOwnSale'],
                     'priorOwnAgeDays': source['priorOwnAgeDays'], 'priorOwnPriceUsd': source['priorOwnPriceUsd']})
    if keyed or len(rows) != paired['attempts']:
        raise ValueError('Unmatched case population')
    return rows


def window(rows, limits):
    return [row for row in rows if limits[0] <= row['eventTime'] < limits[1]]


def metrics(rows, field):
    valid = [row for row in rows if row[field] is not None]
    if not valid:
        return {'attempts': len(rows), 'estimates': 0, 'abstentions': len(rows), 'male': None,
                'medianFactor': None, 'coverage80': None, 'intervalScore': None}
    errors = [abs(math.log(row[field]['estimateUsd'] / row['actualUsd'])) for row in valid]
    factors = sorted(math.exp(error) for error in errors)
    middle = len(factors) // 2
    median = factors[middle] if len(factors) % 2 else (factors[middle - 1] + factors[middle]) / 2
    coverage = sum(row[field]['lowerUsd'] <= row['actualUsd'] <= row[field]['upperUsd'] for row in valid) / len(valid)
    score = sum(math.log(row[field]['upperUsd'] / row[field]['lowerUsd'])
                + 10 * max(0, math.log(row[field]['lowerUsd'] / row['actualUsd']))
                + 10 * max(0, math.log(row['actualUsd'] / row[field]['upperUsd'])) for row in valid) / len(valid)
    return {'attempts': len(rows), 'estimates': len(valid), 'abstentions': len(rows) - len(valid),
            'male': sum(errors) / len(errors), 'medianFactor': median,
            'coverage80': coverage, 'intervalScore': score}


def cohorts(rows):
    groups = {'all': rows, 'ordinary': [r for r in rows if r['actualUsd'] < 100],
              'intermediate': [r for r in rows if 100 <= r['actualUsd'] < 500],
              'premium': [r for r in rows if r['actualUsd'] >= 500]}
    secondary = [r for r in rows if r['realizedVenue'].startswith('secondary/')]
    for name, predicate in [('ordinary', lambda usd: usd < 100),
                            ('intermediate', lambda usd: 100 <= usd < 500),
                            ('premium', lambda usd: usd >= 500)]:
        groups[f'secondary/{name}'] = [r for r in secondary if predicate(r['actualUsd'])]
    return {name: {'v25': metrics(group, 'v25'), 'gate': metrics(group, 'gate')}
            for name, group in groups.items()}


def bootstrap(rows):
    groups = defaultdict(list)
    for row in rows:
        if row['v25'] and row['gate']:
            groups[row['nftAddress']].append(row)
    identities = sorted(groups)
    if not identities:
        return None
    rng = random.Random(27092026)
    results = []
    for _ in range(2000):
        selected = [row for _ in identities for row in groups[rng.choice(identities)]]
        base = metrics(selected, 'v25')['male']
        gate = metrics(selected, 'gate')['male']
        results.append((base - gate) / base)
    results.sort()
    return {'identities': len(identities), 'lower95': results[49], 'median': results[999],
            'upper95': results[1949]}


def decide(pooled, uncertainty, protocol):
    limits = protocol['developmentGates']
    premium = pooled['secondary/premium']
    checks = {
        'premiumMedian': premium['gate']['medianFactor'] <= limits['secondaryPremiumMedianFactorMaximum'],
        'premiumMale': premium['gate']['male'] <= premium['v25']['male'] *
                       (1 - limits['secondaryPremiumMaleImprovementVsV25Minimum']),
        'bootstrapLower': uncertainty is not None and uncertainty['lower95'] > 0,
        'ordinary': pooled['ordinary']['gate']['male'] <= pooled['ordinary']['v25']['male'] *
                    (1 + limits['ordinaryAndIntermediateMaleRegressionMaximum']),
        'intermediate': pooled['intermediate']['gate']['male'] <= pooled['intermediate']['v25']['male'] *
                        (1 + limits['ordinaryAndIntermediateMaleRegressionMaximum']),
        'premiumCoverage': premium['gate']['coverage80'] >= limits['secondaryPremiumCoverageMinimum'],
        'overallCoverage': limits['allCaseCoverageRange'][0] <= pooled['all']['gate']['coverage80']
                           <= limits['allCaseCoverageRange'][1],
        'intervalScore': pooled['all']['gate']['intervalScore'] <= pooled['all']['v25']['intervalScore'],
        'availability': pooled['all']['gate']['abstentions'] <= pooled['all']['v25']['abstentions']
    }
    return {'checks': checks, 'developmentPass': all(checks.values()), 'productionQualification': False}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--audit-only', action='store_true')
    args = parser.parse_args()
    protocol = json.loads(PROTOCOL.read_text(encoding='utf8'))
    if protocol['version'] != 'secondary-own-history-gate-development-v1' or not protocol['frozenBeforeFit']:
        raise ValueError('Unexpected protocol')
    if not args.audit_only and sha256(Path(__file__)) != protocol['sourceCodeSha256']:
        raise ValueError('Evaluator changed after protocol freeze')
    rows = load_rows(protocol)
    partitions = {name: window(rows, bounds) for name, bounds in protocol['windows'].items()}
    if sum(len(part) for part in partitions.values()) != len(rows):
        raise ValueError('Window partition does not cover all cases')
    eligible = {name: sum(features(row) is not None for row in part) for name, part in partitions.items()}
    if args.audit_only:
        print(json.dumps({'total': len(rows), 'windowCases': {k: len(v) for k, v in partitions.items()},
                          'eligible': eligible, 'fitExecuted': False}, indent=2))
        return
    fit_rows = [row for row in partitions['gateFit'] if features(row) is not None]
    counts = Counter(row['nftAddress'] for row in fit_rows)
    x = np.asarray([features(row) for row in fit_rows], dtype=float)
    y = np.asarray([int(abs(math.log(row['ownHistoryCandidate']['estimateUsd'] / row['actualUsd']))
                        < abs(math.log(row['v25EstimateUsd'] / row['actualUsd']))) for row in fit_rows])
    weight = np.asarray([1 / math.sqrt(counts[row['nftAddress']]) for row in fit_rows])
    if set(y) != {0, 1} or len(x) != eligible['gateFit']:
        raise ValueError('Fit population or target invalid')
    model = make_pipeline(StandardScaler(), LogisticRegression(C=0.25, max_iter=1000,
                          solver='lbfgs', random_state=17))
    model.fit(x, y, logisticregression__sample_weight=weight)
    for row in rows:
        base, candidate = v25_prediction(row), own_prediction(row)
        feature = features(row)
        row['v25'] = base
        if feature is not None:
            probability = float(model.predict_proba(np.asarray([feature]))[0, 1])
            row['gate'] = blend(base, candidate, probability)
        elif base:
            row['gate'] = base
        else:
            row['gate'] = candidate
    checks = {name: cohorts(part) for name, part in partitions.items()}
    pooled_rows = partitions['developmentCheck'] + partitions['laterCheck']
    pooled = cohorts(pooled_rows)
    uncertainty = bootstrap([row for row in pooled_rows if row['realizedVenue'].startswith('secondary/')
                             and row['actualUsd'] >= 500])
    report = {'qualification': False, 'productionIntegrated': False, 'reservedLabelsOpened': False,
              'protocolSha256': sha256(PROTOCOL), 'evaluatorSha256': sha256(Path(__file__)),
              'caseSetSha256': protocol['sources']['pairedV25Report']['caseSetSha256'],
              'training': {'events': len(fit_rows), 'identities': len(counts), 'candidateWins': int(y.sum()),
                           'coefficients': model[-1].coef_[0].tolist(), 'intercept': model[-1].intercept_[0]},
              'windowCases': {name: len(part) for name, part in partitions.items()}, 'eligible': eligible,
              'windows': checks, 'pooledDecemberJanuary': pooled, 'secondaryPremiumUncertainty': uncertainty,
              'decision': decide(pooled, uncertainty, protocol),
              'limitations': ['Both historical check windows have been exposed during prior model development.',
                              'The gate fit uses only October-November 2024, but this does not create an untouched test.',
                              'No 2026 prospective outcome or competitor data was evaluated.']}
    OUTPUT.write_text(json.dumps(report, indent=2, allow_nan=False) + '\n', encoding='utf8')
    print(json.dumps({'training': report['training'], 'windowCases': report['windowCases'],
                      'secondaryPremium': pooled['secondary/premium'], 'decision': report['decision']}, indent=2))


if __name__ == '__main__':
    main()
