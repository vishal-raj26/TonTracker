"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { fitConditionalFusion, predictConditionalFusion } = require("../lib/username-conditional-fusion");
test("conditional blend excludes future outcomes and stays between evidence estimates", () => {
  const rows = Array.from({ length: 60 }, (_, i) => ({ time: i + 1, username: "example", baseUsd: 100, vectorUsd: 400, actualUsd: 200 }));
  const model = fitConditionalFusion(rows, 61);
  assert.deepEqual(fitConditionalFusion([...rows, { ...rows[0], time: 61, actualUsd: 1e9 }], 61), model);
  const result = predictConditionalFusion(model, 100, 400, "example", 61);
  assert.ok(result.estimateUsd >= 100 && result.estimateUsd <= 400);
  assert.equal(predictConditionalFusion(model, 100, 400, "example", 60), null);
  assert.equal(fitConditionalFusion(rows.slice(0, 49), 61), null);
  assert.deepEqual(fitConditionalFusion(rows.map(row => row.time > 40 ? { ...row, actualUsd: 1e6 } : row), 61), model);
});
