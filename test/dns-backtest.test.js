"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const { temporalBacktest } = require("../lib/dns-backtest");
test("temporal backtest never exposes the tested sale to the estimator", () => {
  const events = Array.from({ length: 5 }, (_, index) => ({ eventId: String(index), domain: `${1000 + index}.ton`, eventTime: new Date(1000 + index * 1000), priceGram: 100 }));
  const observedHistory = [];
  const report = temporalBacktest(events, { minTraining: 2, minimumSamples: 1, estimate: (_target, history) => { observedHistory.push(history.map((row) => row.eventId)); return { estimateGram: 100, rangeLowGram: 80, rangeHighGram: 120, confidenceBand: "medium" }; } });
  assert.deepEqual(observedHistory, [["0", "1"], ["0", "1", "2"], ["0", "1", "2", "3"]]);
  assert.equal(report.passed, true);
  assert.equal(report.overall.intervalCoverage, 1);
});

test("temporal backtest evaluates historical sales at their historical timestamp", () => {
  const events = Array.from({ length: 4 }, (_, index) => ({
    eventId: String(index),
    domain: `${2000 + index}.ton`,
    eventTime: new Date(Date.UTC(2022, 7, index + 1)),
    priceGram: 100,
  }));
  const observedNow = [];
  temporalBacktest(events, {
    minTraining: 2,
    minimumSamples: 1,
    estimate: (_target, _history, _signals, options) => {
      observedNow.push(options.now);
      return { estimateGram: 100, rangeLowGram: 80, rangeHighGram: 120, confidenceBand: "medium" };
    },
  });
  assert.deepEqual(observedNow, events.slice(2).map((event) => event.eventTime));
});
