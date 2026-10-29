"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), path = require("node:path");
const { loadHistoricalSales } = require("../scripts/evaluate-username-rebuild");
test("historical loader preserves stage, transaction and daily FX provenance without changing prices", async () => {
  const {sales} = await loadHistoricalSales(path.join(__dirname,"fixtures/username-history-source"));
  assert.equal(sales.length,2);
  assert.equal(sales[0].priceUsd,208);
  assert.equal(sales[0].marketStage,"primary");
  assert.equal(sales[0].marketStageBasis,"seller-null-heuristic");
  assert.equal(sales[0].transactionHash,null);
  assert.equal(sales[0].historicalUsdRate,2);
  assert.equal(sales[0].historicalUsdRateResolution,"daily-source-label-not-intraday-quote");
  assert.equal(sales[1].transactionHash,"tx-2");
  assert.equal(sales[1].sellerAddress,"buyer");
  assert.equal(sales[1].eventId,"contract-a:1704153600:10");
});
