"use strict";

const { classifyTelegramUsername } = require("./username-structural");
const { estimateTelegramUsernameValue } = require("./username-estimator");
const { trainUsernameLearnedModel } = require("./username-learned-model");
const { usernameSemanticProfile } = require("./username-semantic");

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
  return {
    samples: valid.length,
    medianFactorError: median(valid.map((row) => row.factorError)),
    medianPredictionRatio: median(valid.map((row) => Number(row.prediction.estimateUsd) / Number(row.sale.priceUsd))),
    coverage: valid.length ? valid.filter((row) => row.insideRange).length / valid.length : null,
  };
}

function priceBand(priceUsd) {
  const value = Number(priceUsd);
  if (value < 25) return "under-25";
  if (value < 100) return "25-100";
  if (value < 500) return "100-500";
  return "500-plus";
}

function backtestTelegramUsernameSales(sales, options = {}) {
  const chronological = (sales || []).filter((sale) => Number(sale.priceUsd) > 0 && sale.eventTime)
    .slice().sort((a, b) => Date.parse(a.eventTime) - Date.parse(b.eventTime));
  const maxEvaluations = Math.max(1, Number(options.maxEvaluations || Number.POSITIVE_INFINITY));
  const maxHistory = Math.max(1, Number(options.maxHistory || Number.POSITIVE_INFINITY));
  const firstEvaluation = Math.max(0, chronological.length - maxEvaluations);
  const modelRefreshInterval = Math.max(1, Number(options.modelRefreshInterval || 25));
  const results = [];
  const attempted = [];
  let learnedModel = null;
  let learnedAtIndex = -1;
  for (let index = firstEvaluation; index < chronological.length; index += 1) {
    const sale = chronological[index];
    // Sales are already chronological, so an indexed window prevents this
    // offline quality check from becoming quadratic as the compact ledger grows.
    const before = chronological.slice(Math.max(0, index - maxHistory), index);
    if (before.length >= 25 && (learnedAtIndex < 0 || index - learnedAtIndex >= modelRefreshInterval)) {
      learnedModel = trainUsernameLearnedModel(before, { nowMs: Date.parse(sale.eventTime) });
      learnedAtIndex = index;
    }
    const target = classifyTelegramUsername(sale.username);
    target.knowledge = sale.knowledge || {};
    const prediction = estimateTelegramUsernameValue(target, before, {
      nowMs: Date.parse(sale.eventTime),
      learnedModel,
      ...options,
    });
    const route = classifyTelegramUsername(sale.username).primaryRoute;
    attempted.push({ route, status: prediction.status, confidenceBand: prediction.confidenceBand });
    if (Number(prediction.estimateUsd) > 0 && prediction.status !== "unavailable") results.push({
      sale,
      prediction,
      route,
      priceBand: priceBand(sale.priceUsd),
      semanticCategories: usernameSemanticProfile(sale.username).categories,
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
  const overall = summarize(results);
  return {
    attempted: attempted.length,
    evaluated: results.length,
    abstained: attempted.length - results.length,
    medianFactorError: overall.medianFactorError,
    coverage: overall.coverage,
    byRoute,
    byConfidence,
    byPriceBand,
    bySemanticCategory,
    byOwnSaleHistory,
    largestMisses: [...results].sort((left, right) => right.factorError - left.factorError).slice(0, 25).map((row) => ({
      username: row.sale.username,
      actualUsd: Number(row.sale.priceUsd),
      predictedUsd: Number(row.prediction.estimateUsd),
      factorError: row.factorError,
      route: row.route,
      semanticCategories: row.semanticCategories,
      ownSaleCount: Number(row.prediction.ownSaleCount || 0),
      learnedEstimateUsd: Number(row.prediction.learnedModel?.estimateUsd || 0),
      premiumProbability: Number(row.prediction.learnedModel?.premiumProbability || 0),
      rawPremiumProbability: Number(row.prediction.learnedModel?.rawPremiumProbability || 0),
      cohortEvidenceCount: Number(row.prediction.learnedModel?.cohortEvidenceCount || 0),
      baseEstimateUsd: Number(row.prediction.learnedModel?.baseEstimateUsd || 0),
      premiumEstimateUsd: Number(row.prediction.learnedModel?.premiumEstimateUsd || 0),
    })),
    results,
  };
}
module.exports = { backtestTelegramUsernameSales, priceBand, summarize };
