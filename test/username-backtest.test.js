"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { backtestTelegramUsernameSales, premiumProbabilityBucket, preparedKnowledgeSignals } = require("../lib/username-backtest");
const { applyKnowledge } = require("../scripts/username-backtest");

test("premium probability diagnostics use stable non-overlapping buckets", () => {
  assert.equal(premiumProbabilityBucket(0), "0-1%");
  assert.equal(premiumProbabilityBucket(0.01), "1-3%");
  assert.equal(premiumProbabilityBucket(0.03), "3-7%");
  assert.equal(premiumProbabilityBucket(0.15), "15%+");
});

test("prepared knowledge diagnostics distinguish meaningful stored signals", () => {
  assert.deepEqual(preparedKnowledgeSignals({}), []);
  assert.deepEqual(preparedKnowledgeSignals({ schemaVersion: "username-knowledge-v3", dictionaryMatch: true, lexicalFrequency: 12, attentionScore: 0.5 }), ["dictionary", "frequency"]);
  assert.deepEqual(preparedKnowledgeSignals({ schemaVersion: "username-knowledge-v4", dictionaryMatch: true, lexicalFrequency: 12, attentionScore: 0.5 }), ["dictionary", "frequency", "attention"]);
});

test("backtest preserves prepared D1 semantic knowledge over an incomplete local cache", () => {
  const prepared = { schemaVersion: "username-knowledge-v4", dictionaryMatch: true };
  const rows = [{ username: "example", knowledge: prepared }];
  assert.deepEqual(applyKnowledge(rows), rows);
});

test("backtest parses prepared D1 semantic JSON before falling back to a local cache", () => {
  const prepared = { schemaVersion: "username-knowledge-v4", ecosystemRelevance: true };
  const rows = [{ username: "example", knowledge: JSON.stringify(prepared) }];
  assert.deepEqual(applyKnowledge(rows), [{ username: "example", knowledge: prepared }]);
});

test("backtest never uses the future sale it is asked to predict", () => {
  const result = backtestTelegramUsernameSales([
    { username: "alpha", eventTime: "2025-01-01T00:00:00Z", priceUsd: 100, eventType: "sale", finalized: true, paymentAsset: "GRAM" },
    { username: "alpha", eventTime: "2025-02-01T00:00:00Z", priceUsd: 120, eventType: "sale", finalized: true, paymentAsset: "GRAM" },
    { username: "alpha", eventTime: "2025-03-01T00:00:00Z", priceUsd: 140, eventType: "sale", finalized: true, paymentAsset: "GRAM" },
  ]);
  assert.equal(result.evaluated, 2);
  assert.ok(result.results.every((row) => row.prediction.ownSaleCount >= 1));
});

test("backtest bounds its evaluated tail and the history exposed to each prediction", () => {
  const sales = Array.from({ length: 8 }, (_, index) => ({
    username: "alpha",
    eventTime: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
    priceUsd: 100 + index,
    eventType: "sale",
    finalized: true,
    paymentAsset: "GRAM",
  }));
  const result = backtestTelegramUsernameSales(sales, { maxEvaluations: 3, maxHistory: 2 });
  assert.equal(result.results.length, 3);
  assert.ok(result.results.every((row) => row.prediction.evidenceCount <= 2));
  assert.ok(result.byStructuralCohort);
  assert.ok(result.premiumCalibration);
});
