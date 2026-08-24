"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { boundedTrainingSample } = require("../scripts/refresh-identity-baselines");

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
