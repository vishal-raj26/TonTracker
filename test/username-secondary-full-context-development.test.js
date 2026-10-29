"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { evaluateFullContext } = require("../scripts/evaluate-username-secondary-full-context-development");

const sale = (eventId, username, eventTime, priceUsd = 100) => ({ eventId, username,
  nftAddress: `nft-${username}`, eventTime, priceUsd, eventType: "sale", finalized: true,
  paymentAsset: "GRAM", reliabilityScore: 1 });

test("full-context development admits unselected prior sales but not same-time outcomes", () => {
  const before = sale("unselected-own", "alpha", "2025-01-02T00:00:00Z", 80);
  const target = sale("selected", "alpha", "2025-01-03T00:00:00Z", 200);
  const simultaneous = sale("simultaneous", "beta", target.eventTime, 500);
  const later = sale("later-selected", "beta", "2025-01-04T00:00:00Z", 600);
  const results = evaluateFullContext([sale("old", "gamma", "2024-01-01T00:00:00Z")],
    [before, target, simultaneous, later], [target, later], { maxHistory: 25 });
  assert.deepEqual(results.map((row) => row.priorSecondaryEvidence), [1, 3]);
  assert.equal(results[0].baseline.prediction.ownSaleCount, 0);
  assert.ok(results[0].candidate.prediction.ownSaleCount > 0);
});
