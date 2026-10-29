"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { useAugmented, evaluation } = require("../scripts/replay-username-secondary-own-anchor-gate");

test("own-anchor gate selects only a new exact-name own sale without reading the outcome", () => {
  const row = { actualUsd: 1000, baseline: { available: true, ownSaleCount: 1, estimateUsd: 100,
    rangeLowUsd: 50, rangeHighUsd: 200 }, candidate: { available: true, ownSaleCount: 2,
    estimateUsd: 500, rangeLowUsd: 300, rangeHighUsd: 700 } };
  assert.equal(useAugmented(row), true);
  assert.equal(evaluation(row, "gated").prediction.estimateUsd, 500);
  assert.equal(useAugmented({ ...row, actualUsd: 1 }), true);
  assert.equal(useAugmented({ ...row, candidate: { ...row.candidate, ownSaleCount: 1 } }), false);
  assert.equal(evaluation({ ...row, candidate: { ...row.candidate, ownSaleCount: 1 } }, "gated").prediction.estimateUsd, 100);
});
