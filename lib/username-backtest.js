"use strict";

const { classifyTelegramUsername } = require("./username-structural");
const { estimateTelegramUsernameValue, completedSale } = require("./username-estimator");
const { trainUsernameLearnedModel } = require("./username-learned-model");
const { usernameSemanticProfile } = require("./username-semantic");
const { usableUsernameKnowledge } = require("./username-knowledge");

function factorError(predicted, actual) {
  if (!(predicted > 0) || !(actual > 0)) return null;
  return Math.max(predicted / actual, actual / predicted);
}
function median(values) {
  const rows = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!rows.length) return null;
  return rows[Math.floor(rows.length / 2)];
}

function summarize(rows) {
  const valid = rows.filter((row) => Number.isFinite(row.factorError));
  const intervals = valid.flatMap(row => {
    const low = Number(row.prediction.rangeLowUsd), high = Number(row.prediction.rangeHighUsd), actual = Number(row.sale.priceUsd);
    if (![low, high, actual].every(Number.isFinite) || !(low > 0 && high >= low && actual > 0)) return [];
    const width = Math.log(high / low);
    // Central 80% interval score in log-price units; penalize both excessive
    // width and missed outcomes. Actual price is evaluation-only.
    const score = width + 10 * Math.max(0, Math.log(low / actual)) + 10 * Math.max(0, Math.log(actual / high));
    return [{ width, score }];
  });
  return {
    samples: valid.length,
    intervalSamples: intervals.length,
    medianFactorError: median(valid.map((row) => row.factorError)),
    medianPredictionRatio: median(valid.map((row) => Number(row.prediction.estimateUsd) / Number(row.sale.priceUsd))),
    coverage: valid.length ? valid.filter((row) => row.insideRange).length / valid.length : null,
    meanAbsoluteLogError: valid.length ? valid.reduce((sum, row) => sum + Math.log(row.factorError), 0) / valid.length : null,
    medianRelativeError: median(valid.map((row) => Math.abs(row.prediction.estimateUsd / row.sale.priceUsd - 1))),
    meanLogIntervalWidth: intervals.length ? intervals.reduce((sum, row) => sum + row.width, 0) / intervals.length : null,
    meanLogIntervalScore80: intervals.length ? intervals.reduce((sum, row) => sum + row.score, 0) / intervals.length : null,
  };
}

function priceBand(priceUsd) {
  const value = Number(priceUsd);
  if (value < 25) return "under-25";
  if (value < 100) return "25-100";
  if (value < 500) return "100-500";
  return "500-plus";
}

function structuralCohort(row) {
  const target = classifyTelegramUsername(row.sale.username);
  const length = Number(target.characterLength) || 0;
  const lengthBucket = length <= 3 ? "1-3" : length === 4 ? "4" : length === 5 ? "5" : length <= 8 ? "6-8" : length <= 12 ? "9-12" : "13+";
  return `${target.primaryRoute}|${target.primaryScript}|${lengthBucket}`;
}

function premiumProbabilityBucket(value) {
  const probability = Math.max(0, Math.min(1, Number(value) || 0));
  if (probability < 0.01) return "0-1%";
  if (probability < 0.03) return "1-3%";
  if (probability < 0.07) return "3-7%";
  if (probability < 0.15) return "7-15%";
  return "15%+";
}

function premiumCalibration(rows) {
  const buckets = ["0-1%", "1-3%", "3-7%", "7-15%", "15%+"];
  return Object.fromEntries(buckets.map((bucket) => {
    const group = rows.filter((row) => premiumProbabilityBucket(row.prediction.learnedModel?.premiumProbability) === bucket);
    const actualPremiums = group.filter((row) => Number(row.sale.priceUsd) >= 100).length;
    const predicted = group.length ? group.reduce((sum, row) => sum + Number(row.prediction.learnedModel?.premiumProbability || 0), 0) / group.length : null;
    return [bucket, {
      ...summarize(group),
      actualPremiumRate: group.length ? actualPremiums / group.length : null,
      averagePredictedPremiumProbability: predicted,
    }];
  }));
}
function preparedKnowledgeSignals(knowledge = {}) {
  const value = usableUsernameKnowledge(knowledge);
  const signals = [];
  if (value.dictionaryMatch) signals.push("dictionary");
  if (Array.isArray(value.semanticVector) && value.semanticVector.length === 50 && value.semanticVector.every(Number.isFinite)) signals.push("historical-vector");
  if (value.entityMatch) signals.push("entity");
  if (value.ecosystemRelevance) signals.push("ecosystem");
  if (Number(value.lexicalFrequency || 0) > 0) signals.push("frequency");
  if (Number(value.attentionScore || 0) > 0) signals.push("attention");
  return signals;
}

function knowledgeBefore(value, cutoff) {
  return require("./username-snapshot-knowledge").knowledgeAsOf(value, cutoff);
}

function backtestTelegramUsernameSales(sales, options = {}) {
  const windowStart = options.evaluationFrom == null ? -Infinity : Date.parse(options.evaluationFrom);
  const windowEnd = options.evaluationUntil == null ? Infinity : Date.parse(options.evaluationUntil);
  if (Number.isNaN(windowStart) || Number.isNaN(windowEnd) || windowStart >= windowEnd) {
    throw new Error("Invalid evaluation window: use increasing ISO timestamps (start inclusive, end exclusive)");
  }
  const seen = new Set();
  const chronological = (sales || []).filter((sale) => {
    if (!completedSale(sale) || !Number.isFinite(Date.parse(sale.eventTime))) return false;
    const key = `${sale.username}|${Date.parse(sale.eventTime)}|${Number(sale.priceUsd)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  })
    .slice().sort((a, b) => Date.parse(a.eventTime) - Date.parse(b.eventTime));
  const maxEvaluations = Math.max(1, Number(options.maxEvaluations || Number.POSITIVE_INFINITY));
  const maxHistory = Math.max(1, Number(options.maxHistory || Number.POSITIVE_INFINITY));
  const evaluationStride = Math.max(1, Number(options.evaluationStride) || 1);
  const eligibleIndices = chronological.flatMap((sale, index) => {
    const time = Date.parse(sale.eventTime);
    return time >= windowStart && time < windowEnd ? [index] : [];
  });
  const firstEvaluation = Math.max(0, eligibleIndices.length - maxEvaluations * evaluationStride);
  const modelRefreshInterval = Math.max(1, Number(options.modelRefreshInterval || 25));
  const results = [];
  const attempted = [];
  const ownHistory = new Map();
  for (const row of chronological) {
    const rows = ownHistory.get(row.username) || [];
    rows.push(row); ownHistory.set(row.username, rows);
  }
  let learnedModel = null;
  let learnedAtIndex = -1;
  for (let position = firstEvaluation; position < eligibleIndices.length; position += evaluationStride) {
    const index = eligibleIndices[position];
    const sale = chronological[index];
    // Sales are already chronological, so an indexed window prevents this
    // offline quality check from becoming quadratic as the compact ledger grows.
    const cutoff = Date.parse(sale.eventTime);
    let boundary = index;
    while (boundary > 0 && Date.parse(chronological[boundary - 1].eventTime) >= cutoff) boundary -= 1;
    const recent = chronological.slice(Math.max(0, boundary - maxHistory), boundary);
    const exact = (ownHistory.get(sale.username) || []).filter((row) => Date.parse(row.eventTime) < cutoff);
    const before = [...new Set([...recent, ...exact])].map((row) => ({ ...row, knowledge: knowledgeBefore(row.knowledge, cutoff), classification: undefined, semantic: undefined, semantic_json: undefined }));
    if (before.length >= 25 && (learnedAtIndex < 0 || index - learnedAtIndex >= modelRefreshInterval)) {
      learnedModel = trainUsernameLearnedModel(before, { nowMs: Date.parse(sale.eventTime), semanticVectors: options.semanticVectors, standardizeClassifier: options.standardizeClassifier });
      learnedAtIndex = index;
    }
    const target = classifyTelegramUsername(sale.username);
    target.knowledge = knowledgeBefore(sale.knowledge, cutoff);
    const retrieved = typeof options.retrieveHistorical === "function" ? options.retrieveHistorical(sale.username, cutoff) : [];
    const scoringEvidence = [...before, ...retrieved.filter(row => Date.parse(row.eventTime) < cutoff)
      .map(row => ({ ...row, knowledge: knowledgeBefore(row.knowledge, cutoff), classification: undefined, semantic: undefined, semantic_json: undefined }))];
    const prediction = estimateTelegramUsernameValue(target, scoringEvidence, {
      ...options,
      nowMs: cutoff,
      learnedModel,
    });
    const route = classifyTelegramUsername(sale.username).primaryRoute;
    attempted.push({ username: sale.username, nftAddress: sale.nftAddress || null,
      eventId: sale.eventId || null, eventTime: sale.eventTime,
      route, status: prediction.status, confidenceBand: prediction.confidenceBand });
    if (Number(prediction.estimateUsd) > 0 && prediction.status !== "unavailable") results.push({
      sale,
      prediction,
      route,
      priceBand: priceBand(sale.priceUsd),
      semanticCategories: usernameSemanticProfile(sale.username).categories,
      preparedKnowledgeSignals: preparedKnowledgeSignals(target.knowledge),
      factorError: factorError(prediction.estimateUsd, Number(sale.priceUsd)),
      insideRange: Number(sale.priceUsd) >= prediction.rangeLowUsd && Number(sale.priceUsd) <= prediction.rangeHighUsd,
    });
  }
  const byRoute = Object.fromEntries([...new Set(attempted.map((row) => row.route))].map((route) => [route, summarize(results.filter((row) => row.route === route))]));
  const byConfidence = Object.fromEntries(["low", "medium", "high"].map((band) => [band, summarize(results.filter((row) => row.prediction.confidenceBand === band))]));
  const byPriceBand = Object.fromEntries(["under-25", "25-100", "100-500", "500-plus"]
    .map((band) => [band, summarize(results.filter((row) => row.priceBand === band))]));
  const semanticCategories = [...new Set(results.flatMap((row) => row.semanticCategories))].sort();
  const bySemanticCategory = Object.fromEntries(semanticCategories.map((category) => [
    category,
    summarize(results.filter((row) => row.semanticCategories.includes(category))),
  ]));
  const ownSaleBuckets = [
    ["none", (count) => count === 0],
    ["one", (count) => count === 1],
    ["repeated", (count) => count >= 2],
  ];
  const byOwnSaleHistory = Object.fromEntries(ownSaleBuckets.map(([label, matches]) => [
    label,
    summarize(results.filter((row) => matches(Number(row.prediction.ownSaleCount) || 0))),
  ]));
  const preparedKnowledgeCoverage = Object.fromEntries(["none", "present"].map((label) => [
    label,
    summarize(results.filter((row) => label === "present"
      ? row.preparedKnowledgeSignals.length > 0
      : row.preparedKnowledgeSignals.length === 0)),
  ]));
  const knowledgeSignals = [...new Set(results.flatMap((row) => row.preparedKnowledgeSignals))].sort();
  const byPreparedKnowledgeSignal = Object.fromEntries(knowledgeSignals.map((signal) => [
    signal,
    summarize(results.filter((row) => row.preparedKnowledgeSignals.includes(signal))),
  ]));
  const structuralCohorts = [...new Set(results.map(structuralCohort))].sort();
  const byStructuralCohort = Object.fromEntries(structuralCohorts.map((cohort) => [
    cohort,
    summarize(results.filter((row) => structuralCohort(row) === cohort)),
  ]));
  const overall = summarize(results);
  return {
    attempted: attempted.length,
    evaluationCases: attempted,
    evaluated: results.length,
    abstained: attempted.length - results.length,
    medianFactorError: overall.medianFactorError,
    coverage: overall.coverage,
    meanAbsoluteLogError: overall.meanAbsoluteLogError,
    medianRelativeError: overall.medianRelativeError,
    intervalSamples: overall.intervalSamples,
    meanLogIntervalWidth: overall.meanLogIntervalWidth,
    meanLogIntervalScore80: overall.meanLogIntervalScore80,
    byRoute,
    byConfidence,
    byPriceBand,
    bySemanticCategory,
    preparedKnowledgeCoverage,
    byPreparedKnowledgeSignal,
    byOwnSaleHistory,
    byStructuralCohort,
    premiumCalibration: premiumCalibration(results),
    largestMisses: [...results].sort((left, right) => right.factorError - left.factorError).slice(0, 25).map((row) => ({
      username: row.sale.username,
      eventTime: row.sale.eventTime,
      eventId: row.sale.eventId || null,
      nftAddress: row.sale.nftAddress || null,
      actualUsd: Number(row.sale.priceUsd),
      predictedUsd: Number(row.prediction.estimateUsd),
      factorError: row.factorError,
      route: row.route,
      semanticCategories: row.semanticCategories,
      ownSaleCount: Number(row.prediction.ownSaleCount || 0),
      learnedEstimateUsd: Number(row.prediction.learnedModel?.estimateUsd || 0),
      mixtureEstimateUsd: Number(row.prediction.learnedModel?.mixtureEstimateUsd || 0),
      postFitAdjustmentRatio: Number(row.prediction.learnedModel?.postFitAdjustmentRatio ?? 1),
      premiumProbability: Number(row.prediction.learnedModel?.premiumProbability || 0),
      rawPremiumProbability: Number(row.prediction.learnedModel?.rawPremiumProbability || 0),
      cohortEvidenceCount: Number(row.prediction.learnedModel?.cohortEvidenceCount || 0),
      baseEstimateUsd: Number(row.prediction.learnedModel?.baseEstimateUsd || 0),
      premiumEstimateUsd: Number(row.prediction.learnedModel?.premiumEstimateUsd || 0),
    })),
    results,
  };
}
module.exports = { backtestTelegramUsernameSales, knowledgeBefore, priceBand, premiumProbabilityBucket, preparedKnowledgeSignals, summarize };
