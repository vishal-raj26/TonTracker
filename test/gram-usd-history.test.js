"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { attributeHistoricalUsd, clearHistoricalRateCache, loadHistoricalGramUsd } = require("../lib/gram-usd-history");
const { normalizePoints } = require("../lib/dns-historical-rates");

test("normalizes Unix-second market timestamps before matching historical sales", () => {
  const points = normalizePoints([[1_754_000_000, 3.25]]);
  assert.equal(points[0].timestamp, 1_754_000_000_000);
  assert.equal(points[0].rate, 3.25);
});

test("labels a sale with the GRAM/USD rate at its own timestamp", async () => {
  clearHistoricalRateCache();
  const hour = 60 * 60 * 1000;
  const eventTime = 24 * hour;
  const fetch = async () => ({
    ok: true,
    json: async () => ({ coins: { "coingecko:the-open-network": { prices: [
      { timestamp: 12 * 60 * 60, price: 2 },
      { timestamp: 18 * 60 * 60, price: 3 },
      { timestamp: 24 * 60 * 60, price: 4 },
      { timestamp: 30 * 60 * 60, price: 5 },
      { timestamp: 36 * 60 * 60, price: 6 },
    ] } } }),
  });
  const [sale] = await attributeHistoricalUsd([{ eventId: "sale-1", eventTime: new Date(eventTime).toISOString(), priceGram: 10 }], { fetch });
  assert.equal(sale.historicalUsdRate, 4);
  assert.equal(sale.priceUsd, 40);
  assert.equal(sale.historicalUsdSource, "defillama");
});

test("does not require future observations when a range ends at now", async () => {
  clearHistoricalRateCache();
  const nowMs = Date.parse("2026-08-21T10:00:00.000Z");
  const fetch = async () => ({
    ok: true,
    json: async () => ({ coins: { "coingecko:the-open-network": { prices: [
      { timestamp: Math.floor((nowMs - 12 * 60 * 60 * 1000) / 1000), price: 3.1 },
      { timestamp: Math.floor(nowMs / 1000), price: 3.2 },
    ] } } }),
  });
  const series = await loadHistoricalGramUsd(nowMs - 12 * 60 * 60 * 1000, nowMs, { fetch, nowMs });
  assert.equal(series.source, "defillama");
  assert.equal(series.points.at(-1).timestamp, nowMs);
});
