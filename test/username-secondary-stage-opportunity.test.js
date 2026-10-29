"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { cohort, quarter, summarize } = require("../scripts/diagnose-username-secondary-stage-opportunity");

test("secondary-stage diagnostic retains cohort boundaries and paired interval attempts", () => {
  assert.equal(cohort(99.99), "ordinary");
  assert.equal(cohort(100), "intermediate");
  assert.equal(cohort(500), "premium");
  assert.equal(quarter(Date.parse("2025-04-01T00:00:00Z") / 1000), "2025Q2");
  const rows = [
    { nftAddress: "a", actualUsd: 100, baseline: { estimateUsd: 50 }, globalFusion: { estimateUsd: 100 }, dense: { estimateUsd: 100, lowerUsd: 80, upperUsd: 120 } },
    { nftAddress: "a", actualUsd: 200, baseline: { estimateUsd: 100 }, globalFusion: { estimateUsd: 200 }, dense: { estimateUsd: 100, lowerUsd: 110, upperUsd: 150 } },
  ];
  const report = summarize(rows);
  assert.equal(report.attempts, 2);
  assert.equal(report.uniqueIdentities, 1);
  assert.equal(report.baseline.meanAbsoluteLogError, Math.log(2));
  assert.equal(report.globalFusion.meanAbsoluteLogError, 0);
  assert.equal(report.dense.interval.coverage, 0.5);
  assert.ok(report.dense.interval.meanLogIntervalScore > 0);
  assert.throws(() => summarize([{ ...rows[0], dense: { estimateUsd: 100, lowerUsd: 120, upperUsd: 80 } }]), /Invalid dense interval/);
});
