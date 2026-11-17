"use strict";

// Read-only correction/qualification audit over the frozen paired report. It
// never reruns models, edits the original report, or reads reserved outcomes.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { caseSetHash, cohortReports, eventKey } = require("./compare-username-resale-own-history-v25");

const ROOT = path.join(__dirname, "..");
const DATA = path.join(ROOT, "research/telegram-usernames/data");
const PROTOCOL = path.join(ROOT, "research/telegram-usernames/secondary-own-history-v25-comparison-protocol-2026-09-27.json");
const COMPARISON = path.join(DATA, "username-secondary-own-history-v25-comparison-2026-09-27.json");
const CANDIDATE = path.join(DATA, "username-secondary-own-history-development-2026-09-27.json");
const OUTPUT = path.join(DATA, "username-secondary-own-history-v25-comparison-audit-2026-09-27.json");
const EXPECTED_COMPARISON_SHA = "be022970b33b8662b266496e652da60299d4e677be4020920148173ee3c32186";
const EXPECTED_CANDIDATE_SHA = "209077a97ece045bf4c9acd6d3184fdcdfa6b3777fd83fa7b940e186ed45de12";

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function normalizeVenue(value) {
  if (value === "secondary/sale") return "secondary/fixed";
  return value;
}

function evaluateGates(cohorts, identities, blocks) {
  const premium = cohorts["secondary/premium"];
  const overall = cohorts.all;
  const ordinary = cohorts.ordinary;
  const intermediate = cohorts.intermediate;
  const premiumImprovement = 1 - premium.ownHistoryCandidate.meanAbsoluteLogError / premium.v25.meanAbsoluteLogError;
  const ordinaryRegression = ordinary.ownHistoryCandidate.meanAbsoluteLogError / ordinary.v25.meanAbsoluteLogError - 1;
  const intermediateRegression = intermediate.ownHistoryCandidate.meanAbsoluteLogError / intermediate.v25.meanAbsoluteLogError - 1;
  return {
    secondaryPremiumUniqueIdentities: { value: identities, minimum: 100, pass: identities >= 100 },
    secondaryPremiumBlocks: { value: blocks, minimum: 2, pass: blocks >= 2 },
    secondaryPremiumMedianFactorError: { value: premium.ownHistoryCandidate.medianFactorError, maximum: 3, pass: premium.ownHistoryCandidate.medianFactorError <= 3 },
    secondaryPremiumMaleImprovementVsV25: {
      value: premiumImprovement,
      minimum: 0.25,
      clusteredLower95: premium.candidateVsV25ClusterBootstrap?.lower95 ?? null,
      lower95MustBePositive: true,
      pass: premiumImprovement >= 0.25 && premium.candidateVsV25ClusterBootstrap?.lower95 > 0,
    },
    ordinaryMaleRegressionVsV25: { value: ordinaryRegression, maximum: 0.05, pass: ordinaryRegression <= 0.05 },
    intermediateMaleRegressionVsV25: { value: intermediateRegression, maximum: 0.05, pass: intermediateRegression <= 0.05 },
    secondaryPremiumCoverage80: { value: premium.ownHistoryCandidate.coverage80, minimum: 0.70, pass: premium.ownHistoryCandidate.coverage80 >= 0.70 },
    overallCoverage80: { value: overall.ownHistoryCandidate.coverage80, range: [0.75, 0.85], pass: overall.ownHistoryCandidate.coverage80 >= 0.75 && overall.ownHistoryCandidate.coverage80 <= 0.85 },
    overallIntervalScore80VsV25: { value: overall.ownHistoryCandidate.meanLogIntervalScore80, v25: overall.v25.meanLogIntervalScore80, pass: overall.ownHistoryCandidate.meanLogIntervalScore80 <= overall.v25.meanLogIntervalScore80 },
    availabilityVsV25: {
      candidate: overall.ownHistoryCandidate.evaluated / overall.attempts,
      v25: overall.v25.evaluated / overall.attempts,
      pass: overall.ownHistoryCandidate.evaluated >= overall.v25.evaluated,
    },
    prospectiveCurrentMarket: { pass: false, required: true, note: "Still pending; exposed historical folds cannot qualify production." },
  };
}

function buildAudit(comparison, candidate, protocolHash) {
  const candidateByKey = new Map(candidate.results.map(row => [eventKey(row), row]));
  const pairedKeys = new Set();
  const joined = comparison.pairedCases.map(row => {
    const key = eventKey(row);
    const target = candidateByKey.get(key);
    if (!target || pairedKeys.has(key)) throw new Error(`Missing or duplicate candidate case in frozen paired report: ${key}`);
    pairedKeys.add(key);
    if (Math.abs(Number(row.actualUsd) - Number(target.actualUsd)) > 1e-12 * Math.max(1, Number(target.actualUsd))
      || row.eventId !== target.eventId || row.realizedVenue !== target.realizedVenue) {
      throw new Error(`Paired target data differs from frozen candidate case: ${key}`);
    }
    return { ...row, realizedVenue: normalizeVenue(row.realizedVenue) };
  });
  if (pairedKeys.size !== candidate.results.length || comparison.caseSetSha256 !== caseSetHash(candidate.results)
    || comparison.attempts !== candidate.results.length || !comparison.caseSetMatchesExactly) {
    throw new Error("Frozen paired comparison does not contain the full exact candidate case set");
  }
  const cohorts = cohortReports(joined);
  const folds = {
    "2024q4": cohortReports(joined.filter(row => Date.parse(row.eventTime) < Date.parse("2025-01-01T00:00:00Z"))),
    "2025jan": cohortReports(joined.filter(row => Date.parse(row.eventTime) >= Date.parse("2025-01-01T00:00:00Z"))),
  };
  const premiumIdentities = new Set(joined.filter(row => row.realizedVenue.startsWith("secondary/") && row.actualUsd >= 500).map(row => row.username));
  const premiumBlocks = Object.values(folds).filter(fold => fold["secondary/premium"].attempts > 0).length;
  const gates = evaluateGates(cohorts, premiumIdentities.size, premiumBlocks);
  return {
    qualification: false,
    productionIntegrated: false,
    reservedLabelsOpened: false,
    correction: "Normalize the already-recorded realized venue label secondary/sale to secondary/fixed for cohort aggregation. No predictions, labels, candidate parameters, or gates changed.",
    protocolSha256: protocolHash,
    comparisonSha256: sha256(COMPARISON),
    candidateSha256: sha256(CANDIDATE),
    caseSetSha256: comparison.caseSetSha256,
    attempts: joined.length,
    venueCounts: Object.fromEntries([...new Set(joined.map(row => row.realizedVenue))].sort().map(venue => [venue, joined.filter(row => row.realizedVenue === venue).length])),
    cohorts,
    folds,
    gates,
    gateDecision: Object.values(gates).every(gate => gate.pass) ? "not-qualified-current-market-pending" : "rejected",
    limitations: [
      "This audit recomputes aggregates from a frozen, exposed historical comparison; it is not a new fit or untouched evaluation.",
      "The two temporal folds were already exposed during candidate development.",
      "Prospective current-market qualification remains mandatory before any production promotion.",
    ],
  };
}

function main() {
  const protocol = JSON.parse(fs.readFileSync(PROTOCOL, "utf8"));
  if (sha256(COMPARISON) !== EXPECTED_COMPARISON_SHA || sha256(CANDIDATE) !== EXPECTED_CANDIDATE_SHA) throw new Error("Frozen comparison/candidate report hash mismatch");
  if (sha256(path.join(ROOT, "scripts/compare-username-resale-own-history-v25.js")) !== protocol.comparatorSha256) throw new Error("Frozen comparator source hash mismatch");
  if (fs.existsSync(OUTPUT)) throw new Error("Refusing to overwrite an existing audit supplement");
  const comparison = JSON.parse(fs.readFileSync(COMPARISON, "utf8"));
  const candidate = JSON.parse(fs.readFileSync(CANDIDATE, "utf8"));
  const report = buildAudit(comparison, candidate, sha256(PROTOCOL));
  fs.writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
  console.log(JSON.stringify({ output: OUTPUT, attempts: report.attempts, venueCounts: report.venueCounts,
    cohorts: Object.fromEntries(Object.entries(report.cohorts).map(([key, row]) => [key, { v25: row.v25, candidate: row.ownHistoryCandidate, bootstrap: row.candidateVsV25ClusterBootstrap }])),
    gateDecision: report.gateDecision, gates: report.gates }, null, 2));
}

if (require.main === module) {
  try { main(); } catch (error) { console.error(error.stack || error.message); process.exitCode = 1; }
}
module.exports = { buildAudit, evaluateGates, normalizeVenue };
