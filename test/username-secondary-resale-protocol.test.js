"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { band, period, summarize } = require("../scripts/audit-username-secondary-resale-protocol");

const fold = {
  trainUntilExclusive: "2024-07-01T00:00:00Z",
  calibrationFromInclusive: "2024-07-01T00:00:00Z",
  calibrationUntilExclusive: "2024-10-01T00:00:00Z",
  evaluationFromInclusive: "2024-10-01T00:00:00Z",
  evaluationUntilExclusive: "2025-01-01T00:00:00Z",
};

test("resale protocol has strict contiguous temporal boundaries and retains identity counts", () => {
  assert.equal(period(fold, Date.parse("2024-06-30T23:59:59Z")), "training");
  assert.equal(period(fold, Date.parse("2024-07-01T00:00:00Z")), "calibration");
  assert.equal(period(fold, Date.parse("2024-10-01T00:00:00Z")), "evaluation");
  assert.equal(period(fold, Date.parse("2025-01-01T00:00:00Z")), null);
  assert.throws(() => period({ ...fold, evaluationFromInclusive: "2024-10-02T00:00:00Z" }, Date.now()), /Invalid contiguous/);
  assert.equal(band(500), "premium");
  assert.equal(band(100), "intermediate");
  const counts = summarize([{ nftAddress: "x", actualUsd: 500 }, { nftAddress: "x", actualUsd: 600 }, { nftAddress: "y", actualUsd: 50 }]);
  assert.equal(counts.attempts, 3);
  assert.equal(counts.premium.attempts, 2);
  assert.equal(counts.premium.uniqueIdentities, 1);
});
