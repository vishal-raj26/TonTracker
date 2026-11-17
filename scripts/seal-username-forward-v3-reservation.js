"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { USERNAME_ESTIMATOR_VERSION, USERNAME_CALIBRATION_VERSION } = require("../lib/username-engine");
const { BLOCKS, DIRECTORY, MAX_SALE_ROWS_PER_BLOCK } = require("./collect-username-forward-v3-local");

const sha256 = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const fileHash = file => sha256(fs.readFileSync(file));

function makeManifest(repo, createdAt) {
  if (!Number.isFinite(Date.parse(createdAt)) || Date.parse(createdAt) >= Date.parse(BLOCKS[0].from))
    throw new Error("Forward-v3 reservation must be sealed before its first block");
  const data = path.join(repo, "research/telegram-usernames/data");
  if (fs.existsSync(path.join(data, DIRECTORY)))
    throw new Error("Forward-v3 collection already exists; reservation is too late");
  const files = names => Object.fromEntries(names.map(name => [name, fileHash(path.join(repo, name))]));
  return {
    schemaVersion: "username-forward-v3-reservation-v1", sealedBeforeWindow: true, createdAt,
    predecessor: {
      forwardV2ManifestSha256: fileHash(path.join(data, "username-forward-v2-reservation-manifest-2026-09-25.json")),
      forwardV2PriceBlindAuditSha256: fileHash(path.join(data, "username-forward-v2-integrity-2026-09-27-batch3.json")),
      earlierReservedOutcomeLabelsRemainUnopened: true,
    },
    window: { directory: DIRECTORY, blocks: BLOCKS,
      maximumRawSaleRowsPerBlock: MAX_SALE_ROWS_PER_BLOCK, maximumRawSaleRowsOverall: BLOCKS.length * MAX_SALE_ROWS_PER_BLOCK },
    rationale: "The v2 cohort recorded 1,076 verified sales by 06:35 UTC on its first day; its global 10,000-sale cap may be exhausted before a second weekly block. Three future disjoint, time-predeclared blocks reserve capacity for later weeks without selecting by price, name, prediction or outcome.",
    selection: {
      chronologicalUnfilteredWithinEachBlock: true,
      everyContractVerifiedUsernameSettlementWithinThePage: true,
      noPriceNameOutcomePredictionOrVenueFiltering: true,
      noPoolingWithEarlierCohorts: true,
      rejectAnyEventOverlapWithV2: true,
      stopEachBlockAtFirstOf: ["blockEndCaughtUp", "blockRawSaleCapSafety"],
      capacitySafety: "At fewer than ten remaining raw-sale slots, stop that block; never skip messages or raise its frozen cap",
      everySaleAndFailedLifecycleAttemptRetainedForFinalEvaluation: true,
    },
    candidate: {
      estimatorVersion: USERNAME_ESTIMATOR_VERSION,
      calibrationVersion: USERNAME_CALIBRATION_VERSION,
      modelVersion: "telegram-username-learned-v15",
      maxHistory: 30000,
      strategy: "Same-case v25 historical-only baseline plus exact independently verified active-auction bid at 24h/6h/1h; never portfolio eligible",
      horizonsHours: [24, 6, 1],
      files: files(["lib/username-estimator.js", "lib/username-learned-model.js", "lib/username-backtest.js",
        "lib/username-active-auction-nowcast.js", "lib/username-auction-bid-evidence.js"]),
    },
    collectionFiles: files(["lib/toncenter-username-settlement-ledger.js",
      "scripts/collect-username-forward-v3-local.js", "scripts/audit-username-forward-v3-reservation.js",
      "scripts/audit-reserved-username-collection.js", "scripts/seal-username-forward-v3-reservation.js"]),
    trainingSources: files(["research/telegram-usernames/data/dune_username_sales.part",
      "research/telegram-usernames/data/tonapi_username_universe.csv"]),
    evaluation: {
      baseline: "same-case v25 historical-only plus strictly prior selected v3 sales; no earlier reserved outcomes",
      candidate: "baseline plus exact verified chain bid available at each frozen pre-close horizon",
      allCasesAttempted: true, noHoldoutOutcomeTuning: true,
      developmentCalibrationCutoff: BLOCKS[0].from,
      reportBy: ["overall", "ordinary", "intermediate", "premium", "block"],
      metrics: ["median-factor-error", "mean-absolute-log-error", "80-percent-interval-score",
        "80-percent-interval-coverage", "availability", "abstentions", "premium-unique-identities"],
      uncertainty: "deterministic exact-identity-clustered bootstrap 95-percent confidence interval for paired premium MALE improvement",
      finalEvaluator: "implementation and exact hash must be sealed before any v3 outcome label is opened",
    },
    gates: {
      minimumPremiumUniqueIdentities: 100, minimumPremiumWeeklyBlocks: 2,
      premiumThresholdUsd: 500, premiumMedianFactorErrorMaximum: 3,
      premiumMaleImprovementVsV25Minimum: 0.25, premiumImprovementLowerConfidenceBoundPositive: true,
      ordinaryAndIntermediateMaleRegressionMaximum: 0.05,
      overallIntervalCoverageMinimum: 0.75, overallIntervalCoverageMaximum: 0.85,
      premiumIntervalCoverageMinimum: 0.7, noOverallIntervalScoreRegression: true,
      noAvailabilityRegression: true,
    },
    limitations: [
      "This cohort tests active-auction nowcasting only, not inactive resale or portfolio valuation.",
      "Each block covers at most its first 48 hours; the result is not a complete-week market sample.",
      "An insufficient premium count, fewer than two premium-bearing blocks, cap-safe gaps or inconclusive clustered uncertainty fails qualification.",
      "No best-in-market claim without independent competitor evidence.",
    ],
  };
}

function main() {
  const repo = path.resolve(__dirname, "..");
  const output = path.join(repo, "research/telegram-usernames/data/username-forward-v3-reservation-manifest-2026-09-27.json");
  const manifest = makeManifest(repo, new Date().toISOString());
  fs.writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
  console.log(JSON.stringify({ path: output, sha256: fileHash(output), createdAt: manifest.createdAt,
    blocks: manifest.window.blocks.length }, null, 2));
}

if (require.main === module) { try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; } }
module.exports = { makeManifest };
