"""Development-only discrimination assay; no price prediction or gate promotion."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import numpy as np
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import average_precision_score, roc_auc_score, brier_score_loss

spec = importlib.util.spec_from_file_location('broad', Path(__file__).with_name('evaluate-username-broad-training.py'))
broad = importlib.util.module_from_spec(spec)
spec.loader.exec_module(broad)


def summarize(rows):
    labels = np.asarray([row['actualUsd'] >= 500 for row in rows], dtype=int)
    scores = np.asarray([row['premiumProbability'] for row in rows])
    return dict(samples=len(rows), premium=int(labels.sum()),
                rocAuc=float(roc_auc_score(labels, scores)) if len(set(labels)) == 2 else None,
                averagePrecision=float(average_precision_score(labels, scores)) if labels.sum() else None,
                brier=float(brier_score_loss(labels, scores)),
                thresholds=[dict(threshold=threshold, selected=int((scores >= threshold).sum()),
                                 truePremium=int(((scores >= threshold) & (labels == 1)).sum()),
                                 ordinaryFalsePositive=sum(row['actualUsd'] < 100 and row['premiumProbability'] >= threshold for row in rows),
                                 intermediateSelected=sum(100 <= row['actualUsd'] < 500 and row['premiumProbability'] >= threshold for row in rows))
                            for threshold in (.1, .25, .5, .75, .9)])


def main(output):
    root = broad.ROOT
    training_bytes = (root / 'data/username-broad-training-2026-09-09.json').read_bytes()
    target_bytes = (root / 'data/username-evidence-fusion-development-2026-09-08.json').read_bytes()
    semantic_bytes = (root / 'data/username-tabular-semantics-2026-09-09.json').read_bytes()
    digest = lambda data: hashlib.sha256(data).hexdigest()
    if digest(target_bytes) != broad.tabular.SOURCE_HASH:
        raise ValueError('Development source changed')
    history, source, semantics = map(json.loads, (training_bytes, target_bytes, semantic_bytes))
    if semantics['sourceSha256'] != digest(target_bytes):
        raise ValueError('Semantic source mismatch')
    if history['protocolSha256'] != digest((root / 'tabular-broad-protocol.json').read_bytes()):
        raise ValueError('Temporal protocol changed')
    features = {row['eventId']: row for row in semantics['rows']}
    training = {row['eventId']: row for row in history['rows']}
    targets = []
    for row in source['evidence']:
        record = features[row['eventId']]
        if (record['nftAddress'], record['eventTime']) != (row['nftAddress'], row['eventTime']):
            raise ValueError('Target feature identity/cutoff mismatch')
        targets.append(dict(row, features=record['features']))
    results, folds = [], []
    for fold in history['folds']:
        train = [training[key] for key in fold['eventIds']]
        if any(row['eventTime'] >= fold['trainingUntil'] for row in train):
            raise ValueError('Future training label')
        model = HistGradientBoostingClassifier(**broad.tabular.PARAMS)
        model.fit(np.asarray([broad.design(row) for row in train]), [int(row['actualUsd'] >= 500) for row in train])
        calibration = [row for row in targets if fold['trainingUntil'] <= row['eventTime'] < fold['evaluationFrom']]
        evaluation = [row for row in targets if fold['evaluationFrom'] <= row['eventTime'] < fold['evaluationUntil']]
        def predict(rows):
            scores = model.predict_proba(np.asarray([broad.design(row) for row in rows]))[:, 1]
            return [dict(eventId=row['eventId'], nftAddress=row['nftAddress'], eventTime=row['eventTime'],
                         actualUsd=row['actualUsd'], premiumProbability=float(score)) for row, score in zip(rows, scores)]
        calibration_predictions, evaluated = predict(calibration), predict(evaluation)
        # Calibration is inspected separately, not used for post-hoc thresholds.
        record = dict(id=fold['id'], trainCount=len(train), trainPremium=sum(row['actualUsd'] >= 500 for row in train),
                      calibration=summarize(calibration_predictions), evaluation=summarize(evaluated))
        folds.append(record)
        results.extend(evaluated)
        print(json.dumps(record), flush=True)
    if len({row['eventId'] for row in results}) != len(results):
        raise ValueError('Overlapping evaluation events')
    report = dict(qualification=False, probabilitiesCalibrated=False, params=broad.tabular.PARAMS,
                  featurePolicy='Same118 historical structural/semantic and128 spelling hash features; no target price input',
                  thresholdsPredeclared=[.1,.25,.5,.75,.9], sourceSha256=digest(target_bytes), trainingSha256=digest(training_bytes),
                  semanticSha256=digest(semantic_bytes), scriptSha256=digest(Path(__file__).read_bytes()),
                  sklearnVersion=broad.tabular.sklearn.__version__, folds=folds, pooled=summarize(results), results=results)
    with open(output, 'x', encoding='utf-8') as handle:
        json.dump(report, handle, indent=2, allow_nan=False)
    print(json.dumps(report['pooled'], indent=2), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', required=True)
    main(parser.parse_args().output)
