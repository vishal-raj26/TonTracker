"use strict";

const { classifyTonDns } = require("./dns-structural");
const { estimateTonDnsValue } = require("./dns-estimator");

function median(values) {
  const rows = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!rows.length) return null;
  const middle = Math.floor(rows.length / 2);
  return rows.length % 2 ? rows[middle] : (rows[middle - 1] + rows[middle]) / 2;
}

function summarize(rows) {
  const valid = rows.filter((row) => row.actualGram > 0 && row.estimateGram > 0);
  return {
    samples: valid.length,
    medianAbsoluteLogError: median(valid.map((row) => Math.abs(Math.log(row.estimateGram / row.actualGram)))),
    medianAbsolutePercentageError: median(valid.map((row) => Math.abs(row.estimateGram - row.actualGram) / row.actualGram)),
    intervalCoverage: valid.length ? valid.filter((row) => row.actualGram >= row.rangeLowGram && row.actualGram <= row.rangeHighGram).length / valid.length : null,
  };
}

function temporalBacktest(events = [], options = {}) {
  const sorted = [...events].filter((row) => Number(row.priceGram) > 0 && row.eventTime).sort((a, b) => new Date(a.eventTime) - new Date(b.eventTime));
  const minTraining = Math.max(1, Number(options.minTraining || 20));
  const estimate = options.estimate || estimateTonDnsValue;
  const maxEvaluations = Math.max(1, Number(options.maxEvaluations || Number.POSITIVE_INFINITY));
  const maxHistory = Math.max(1, Number(options.maxHistory || Number.POSITIVE_INFINITY));
  const results = [];
  const firstEvaluation = Math.max(minTraining, sorted.length - maxEvaluations);
  for (let index = firstEvaluation; index < sorted.length; index += 1) {
    const targetEvent = sorted[index];
    const target = classifyTonDns(targetEvent.domain);
    const history = sorted.slice(Math.max(0, index - maxHistory), index).map((row) => ({
      ...row,
      classification: row.classification || classifyTonDns(row.domain),
      eventType: "sale",
      completed: true,
      cancelled: false,
      verified: true,
      paymentAsset: "GRAM",
    }));
    const output = estimate(target, history, { asks: [], bids: [] }, { now: targetEvent.eventTime });
    if (!(Number(output.estimateGram) > 0)) continue;
    results.push({
      eventId: targetEvent.eventId,
      domain: target.normalizedDomain,
      route: target.primaryRoute,
      eventTime: targetEvent.eventTime,
      actualGram: Number(targetEvent.priceGram),
      estimateGram: Number(output.estimateGram),
      rangeLowGram: Number(output.rangeLowGram),
      rangeHighGram: Number(output.rangeHighGram),
      confidenceBand: output.confidenceBand,
    });
  }
  const byRoute = Object.fromEntries([...new Set(results.map((row) => row.route))].map((route) => [route, summarize(results.filter((row) => row.route === route))]));
  const overall = summarize(results);
  const thresholds = {
    minimumSamples: Number(options.minimumSamples || 25),
    maximumMedianAbsoluteLogError: Number(options.maximumMedianAbsoluteLogError || Math.log(2)),
    minimumIntervalCoverage: Number(options.minimumIntervalCoverage || 0.5),
  };
  const passed = overall.samples >= thresholds.minimumSamples
    && overall.medianAbsoluteLogError != null
    && overall.medianAbsoluteLogError <= thresholds.maximumMedianAbsoluteLogError
    && overall.intervalCoverage >= thresholds.minimumIntervalCoverage;
  return { passed, thresholds, overall, byRoute, results };
}

module.exports = { median, summarize, temporalBacktest };
