"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { boundedTrainingSample, learnedUsernameSale } = require("../scripts/refresh-identity-baselines");

test("bounds learned-model training while retaining rare high-value sales", () => {
  const rows = Array.from({ length: 5000 }, (_, index) => ({
    sale_id: `sale-${index}`,
    normalized_name: `name${index}`,
    sold_at: 1_700_000_000 + index,
    price_usd: index === 4999 ? 1_000_000 : 10 + (index % 100),
  }));
  const first = boundedTrainingSample(rows, 512);
  const second = boundedTrainingSample(rows, 512);

  assert.equal(first.length, 512);
  assert.ok(first.some((row) => row.sale_id === "sale-4999"));
  assert.deepEqual(first.map((row) => row.sale_id), second.map((row) => row.sale_id));
});

test("username baseline training keeps prepared D1 semantic knowledge", () => {
  const semantic = JSON.stringify({ schemaVersion: "username-knowledge-v5", dictionaryMatch: true });
  assert.deepEqual(learnedUsernameSale({
    normalized_name: "conviction",
    price_usd: "1555.31",
    sold_at: "1770000000",
    reliability_score: "0.95",
    semantic_json: semantic,
  }), {
    normalized_name: "conviction",
    price_usd: 1555.31,
    sold_at: 1770000000,
    reliability_score: 0.95,
    semantic_json: semantic,
  });
});
