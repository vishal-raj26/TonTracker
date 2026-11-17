"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { backtestTelegramUsernameSales, knowledgeBefore, premiumProbabilityBucket, preparedKnowledgeSignals, summarize } = require("../lib/username-backtest");
const { applyKnowledge } = require("../scripts/username-backtest");

test("explicit evaluation windows retain earlier evidence but exclude later targets", () => {
  const sales = [1, 2, 3, 4].map(day => ({ username: "example", eventTime: `2025-01-0${day}T00:00:00Z`,
    priceUsd: 100, paymentAsset: "TON", eventType: "sale", finalized: true }));
  const result = backtestTelegramUsernameSales(sales, { evaluationFrom: "2025-01-02T00:00:00Z", evaluationUntil: "2025-01-04T00:00:00Z" });
  assert.equal(result.attempted, 2);
  assert.equal(result.evaluationCases.length, 2);
  assert.deepEqual(result.evaluationCases.map(row => row.eventTime), sales.slice(1, 3).map(row => row.eventTime));
  assert.deepEqual(result.results.map(row => row.sale.eventTime), sales.slice(1, 3).map(row => row.eventTime));
  assert.equal(result.results[0].prediction.ownSaleCount, 1);
  assert.equal(backtestTelegramUsernameSales(sales, { evaluationFrom: "2026-01-01" }).attempted, 0);
  assert.throws(() => backtestTelegramUsernameSales(sales, { evaluationFrom: "invalid" }), /Invalid evaluation window/);
  assert.throws(() => backtestTelegramUsernameSales(sales, { evaluationFrom: "2025-01-04", evaluationUntil: "2025-01-02" }), /Invalid evaluation window/);
});

test("interval diagnostics penalize both excessive width and missed prices", () => {
  const row = { sale: { priceUsd: 100 }, factorError: 1, insideRange: true,
    prediction: { estimateUsd: 100, rangeLowUsd: 80, rangeHighUsd: 125 } };
  const narrow = summarize([row]);
  const wide = summarize([{ ...row, prediction: { ...row.prediction, rangeLowUsd: 1, rangeHighUsd: 10000 } }]);
  assert.ok(wide.meanLogIntervalScore80 > narrow.meanLogIntervalScore80);
  const miss = summarize([{ ...row, sale: { priceUsd: 1000 }, insideRange: false }]);
  assert.ok(miss.meanLogIntervalScore80 > narrow.meanLogIntervalScore80);
  const invalid = summarize([{ ...row, prediction: { ...row.prediction, rangeHighUsd: Infinity } }]);
  assert.equal(invalid.samples, 1);
  assert.equal(invalid.intervalSamples, 0);
  assert.equal(invalid.meanLogIntervalScore80, null);
});

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

test("simultaneous settlements and duplicate indexing cannot leak the target price", () => {
  const sale = { username: "alpha", eventTime: "2025-01-01T00:00:00Z", priceUsd: 100, eventType: "sale", finalized: true, paymentAsset: "GRAM" };
  const result = backtestTelegramUsernameSales([sale, { ...sale }, { ...sale, priceUsd: 150 }], { nowMs: Date.now(), learnedModel: { estimateUsd: 9999 } });
  assert.equal(result.attempted, 2);
  assert.equal(result.evaluated, 0);
});

test("saved misses identify the exact settlement when a username sells repeatedly", () => {
  const sale = { username: "alpha", eventTime: "2025-01-01T00:00:00Z", priceUsd: 100, eventType: "sale", finalized: true, paymentAsset: "GRAM", nftAddress: "fixture-nft" };
  const target = { ...sale, eventTime: "2025-02-01T00:00:00Z", eventId: "second-settlement", priceUsd: 120 };
  const result = backtestTelegramUsernameSales([sale, target]);
  assert.equal(result.largestMisses.length, 1);
  assert.equal(result.largestMisses[0].eventTime, target.eventTime);
  assert.equal(result.largestMisses[0].eventId, target.eventId);
  assert.equal(result.largestMisses[0].nftAddress, target.nftAddress);
});

test("semantic evidence must have been observed before the valuation cutoff", () => {
  const cutoff = Date.parse("2025-01-01T00:00:00Z");
  const knowledge = { schemaVersion: "username-knowledge-v5", dictionaryMatch: true };
  assert.deepEqual(knowledgeBefore(knowledge, cutoff), {});
  assert.deepEqual(knowledgeBefore({ ...knowledge, observedAt: "2026-01-01" }, cutoff), {});
  const historical = { ...knowledge, observedAt: "2024-01-01" };
  assert.deepEqual(knowledgeBefore(historical, cutoff), historical);
});

test("backtest bounds the market window without losing older own sales", () => {
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
  assert.deepEqual(result.results.map((row) => row.prediction.ownSaleCount), [5, 6, 7]);
  assert.ok(result.byStructuralCohort);
  assert.ok(result.premiumCalibration);
});
