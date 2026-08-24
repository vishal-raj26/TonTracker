"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { backtestTelegramUsernameSales } = require("../lib/username-backtest");

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
});
