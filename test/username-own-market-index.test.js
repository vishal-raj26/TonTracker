"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { buildMarketIndex, addIndexFeatures, metrics } = require("../scripts/diagnose-username-own-market-index");

test("market index excludes same-day and future sales from the reference window", () => {
  const sales = [];
  for (let day = 1; day < 32; day += 1) {
    for (let n = 0; n < 10; n += 1) {
      sales.push({ eventTime: new Date(Date.UTC(2024, 0, day)).toISOString(), username: "sample", priceUsd: 100 });
    }
  }
  const reference = Date.UTC(2024, 0, 31, 12);
  const baseline = buildMarketIndex(sales).p90(reference, 0, 1);
  sales.push({ eventTime: new Date(Date.UTC(2024, 0, 31, 1)).toISOString(), username: "sample", priceUsd: 10000000 });
  sales.push({ eventTime: new Date(Date.UTC(2024, 1, 1)).toISOString(), username: "sample", priceUsd: 10000000 });
  assert.equal(buildMarketIndex(sales).p90(reference, 0, 1), baseline);
});

test("adjusted own sale uses only prediction-time evidence and retains unavailable cases", () => {
  const eventTime = "2024-10-10T12:00:00.000Z";
  const row = { eventId: "a", nftAddress: "0:abc", eventTime, username: "sample",
    actualUsd: 1000, realizedVenue: "secondary/sale", v25EstimateUsd: 150,
    ownHistoryCandidate: { estimateUsd: 170 } };
  const own = { ...row, hasPriorOwnSale: true, priorOwnPriceUsd: 100, priorOwnAgeDays: 2 };
  const key = `${row.eventId}\u001f${row.nftAddress}\u001f${row.eventTime}\u001f${row.username}`;
  const market = { p90: ms => ms === Date.parse(eventTime) ? Math.log(200) : Math.log(100) };
  const first = addIndexFeatures([row], new Map([[key, own]]), market)[0];
  const relabeled = addIndexFeatures([{ ...row, actualUsd: 10, realizedVenue: "primary/auction" }],
    new Map([[key, { ...own, actualUsd: 10, realizedVenue: "primary/auction" }]]), market)[0];
  assert.equal(first.raw, 100);
  assert.ok(Math.abs(first.globalAdjusted - 200) < 1e-9);
  assert.deepEqual([first.raw, first.globalAdjusted, first.lengthAdjusted, first.lengthSpecific],
    [relabeled.raw, relabeled.globalAdjusted, relabeled.lengthAdjusted, relabeled.lengthSpecific]);
  const absent = addIndexFeatures([{ ...row, eventId: "b" }], new Map([[`b\u001f${row.nftAddress}\u001f${row.eventTime}\u001f${row.username}`,
    { ...own, eventId: "b", hasPriorOwnSale: false }]]), market)[0];
  assert.equal(absent.globalAdjusted, null);
  assert.equal(metrics([absent], "globalAdjusted").abstentions, 1);
});
