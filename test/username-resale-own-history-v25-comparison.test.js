"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { eventKey, summarize } = require("../scripts/compare-username-resale-own-history-v25");

test("v25 comparator uses exact NFT, normalized name and event time for joins", () => {
  const base = { nftAddress: "0:ABC", username: "Example", eventTime: "2025-01-02T03:04:05Z" };
  assert.equal(eventKey(base), eventKey({ ...base, nftAddress: "0:abc", username: "example", eventTime: "2025-01-02T03:04:05.000Z" }));
  assert.notEqual(eventKey(base), eventKey({ ...base, nftAddress: "0:other" }));
  assert.throws(() => eventKey({ username: "example", eventTime: base.eventTime }), /exact NFT/);
});

test("v25 comparator reports every attempted case and counts abstentions", () => {
  const cases = [
    { actualUsd: 100, v25EstimateUsd: 100, v25LowUsd: 80, v25HighUsd: 120 },
    { actualUsd: 100, v25EstimateUsd: null, v25LowUsd: null, v25HighUsd: null },
  ];
  const summary = summarize(cases);
  assert.equal(summary.attempts, 2);
  assert.equal(summary.evaluated, 1);
  assert.equal(summary.abstentions, 1);
  assert.equal(summary.meanAbsoluteLogError, 0);
  assert.equal(summary.coverage80, 1);
});
