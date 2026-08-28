"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
process.env.D1_REGISTRY_URL ||= "https://ledger.test.invalid";
const { marketEvidenceOrder, marketPriorityUsernames } = require("../scripts/rebuild-username-ledger");

test("username market evidence prioritizes the highest completed value first", () => {
  const rows = [
    { eventId: "ordinary", username: "ordinary", priceUsd: 20 },
    { eventId: "premium", username: "premium", priceUsd: 4_000 },
    { eventId: "mid", username: "mid", priceGram: 300 },
  ];
  assert.deepEqual(marketEvidenceOrder(rows).map((row) => row.eventId), ["premium", "mid", "ordinary"]);
});

test("username identity resolution uses each name's highest-value observation", () => {
  const rows = [
    { username: "repeat", priceUsd: 20 },
    { username: "ordinary", priceUsd: 200 },
    { username: "repeat", priceUsd: 2_000 },
    { username: "premium", priceUsd: 1_000 },
  ];
  assert.deepEqual(marketPriorityUsernames(rows), ["repeat", "premium", "ordinary"]);
});
