"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { auditReports } = require("../scripts/audit-username-evaluation-exposure");
test("partial historical target logs never certify a fresh qualification set", () => {
  const result = auditReports([{ file: "old.json", hash: "hash", report: { attempted: 200, evaluated: 200,
    largestMisses: [{ nftAddress: "contract", eventId: "event" }] } }]);
  assert.equal(result.reportsWithIncompleteTargets, 1);
  assert.equal(result.knownTargetIdentities, 1);
  assert.equal(result.qualificationEligible, false);
  assert.equal(result.reports[0].sourceHashesRecorded, false);
});
test("complete attempted logs include abstentions and deduplicate repeated identities", () => {
  const report = { attempted: 2, evaluated: 1, evaluationCases: [
    { nftAddress: "contract", eventId: "one", status: "estimated" },
    { nftAddress: "contract", eventId: "two", status: "unavailable" }] };
  const result = auditReports([{ file: "new.json", report }]);
  assert.equal(result.reportsWithIncompleteTargets, 0);
  assert.equal(result.knownTargetIdentities, 1);
  assert.equal(result.knownSettlementIds, 2);
  assert.equal(result.qualificationEligible, false);
});
