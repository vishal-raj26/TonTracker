"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { oracleSummary } = require("../scripts/diagnose-username-existing-candidate-ceiling");

test("post-hoc routing oracle is bounded by the better saved point on each case", () => {
  const rows = [
    { actualUsd: 100, baselineUsd: 50, candidateUsd: 100 },
    { actualUsd: 100, baselineUsd: 100, candidateUsd: 200 },
  ];
  const result = oracleSummary(rows);
  assert.equal(result.cases, 2);
  assert.equal(result.candidateBetterCases, 1);
  assert.equal(result.oracleMale, 0);
  assert.ok(result.candidateMale > result.oracleMale);
  assert.ok(result.baselineMale > result.oracleMale);
});
