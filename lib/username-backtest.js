"use strict";

const { classifyTelegramUsername } = require("./username-structural");
const { estimateTelegramUsernameValue } = require("./username-estimator");

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
    coverage: valid.length ? valid.filter((row) => row.insideRange).length / valid.length : null,
  };
}

function backtestTelegramUsernameSales(sales, options = {}) {
  const chronological = (sales || []).filter((sale) => Number(sale.priceUsd) > 0 && sale.eventTime)
    .slice().sort((a, b) => Date.parse(a.eventTime) - Date.parse(b.eventTime));
  const maxEvaluations = Math.max(1, Number(options.maxEvaluations || Number.POSITIVE_INFINITY));
  const maxHistory = Math.max(1, Number(options.maxHistory || Number.POSITIVE_INFINITY));
  const firstEvaluation = Math.max(0, chronological.length - maxEvaluations);
  const results = [];
  const attempted = [];
  for (let index = firstEvaluation; index < chronological.length; index += 1) {
    const sale = chronological[index];
    // Sales are already chronological, so an indexed window prevents this
    // offline quality check from becoming quadratic as the compact ledger grows.
    const before = chronological.slice(Math.max(0, index - maxHistory), index);
    const prediction = estimateTelegramUsernameValue(classifyTelegramUsername(sale.username), before, { nowMs: Date.parse(sale.eventTime), ...options });
    const route = classifyTelegramUsername(sale.username).primaryRoute;
    attempted.push({ route, status: prediction.status, confidenceBand: prediction.confidenceBand });
    if (prediction.status === "estimated") results.push({
      sale,
      prediction,
      route,
      factorError: factorError(prediction.estimateUsd, Number(sale.priceUsd)),
      insideRange: Number(sale.priceUsd) >= prediction.rangeLowUsd && Number(sale.priceUsd) <= prediction.rangeHighUsd,
    });
  }
  const byRoute = Object.fromEntries([...new Set(attempted.map((row) => row.route))].map((route) => [route, summarize(results.filter((row) => row.route === route))]));
  const byConfidence = Object.fromEntries(["low", "medium", "high"].map((band) => [band, summarize(results.filter((row) => row.prediction.confidenceBand === band))]));
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
    byOwnSaleHistory,
    results,
  };
}
module.exports = { backtestTelegramUsernameSales, summarize };
