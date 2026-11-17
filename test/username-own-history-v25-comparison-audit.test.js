"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { evaluateGates, normalizeVenue } = require("../scripts/audit-username-own-history-v25-comparison");

test("frozen resale venue alias is normalized for reporting only", () => {
  assert.equal(normalizeVenue("secondary/sale"), "secondary/fixed");
  assert.equal(normalizeVenue("secondary/auction"), "secondary/auction");
});

test("paired premium MALE improvement cannot override failed absolute and broad-cohort gates", () => {
  const cohorts = {
    "secondary/premium": { v25: { meanAbsoluteLogError: 2.05 }, ownHistoryCandidate: { meanAbsoluteLogError: 1.41, medianFactorError: 3.051, coverage80: 0.724 }, candidateVsV25ClusterBootstrap: { lower95: 0.267 } },
    all: { attempts: 1000, v25: { evaluated: 1000, meanLogIntervalScore80: 3.63 }, ownHistoryCandidate: { evaluated: 1000, coverage80: 0.894, meanLogIntervalScore80: 3.70 } },
    ordinary: { v25: { meanAbsoluteLogError: 0.25 }, ownHistoryCandidate: { meanAbsoluteLogError: 0.349 } },
    intermediate: { v25: { meanAbsoluteLogError: 1.0 }, ownHistoryCandidate: { meanAbsoluteLogError: 1.32 } },
  };
  const gates = evaluateGates(cohorts, 338, 2);
  assert.equal(gates.secondaryPremiumMaleImprovementVsV25.pass, true);
  assert.equal(gates.secondaryPremiumCoverage80.pass, true);
  assert.equal(gates.secondaryPremiumMedianFactorError.pass, false);
  assert.equal(gates.ordinaryMaleRegressionVsV25.pass, false);
  assert.equal(gates.intermediateMaleRegressionVsV25.pass, false);
  assert.equal(gates.overallCoverage80.pass, false);
  assert.equal(gates.overallIntervalScore80VsV25.pass, false);
  assert.equal(gates.prospectiveCurrentMarket.pass, false);
});
