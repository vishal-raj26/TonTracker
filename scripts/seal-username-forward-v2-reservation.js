"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { USERNAME_ESTIMATOR_VERSION, USERNAME_CALIBRATION_VERSION } = require("../lib/username-engine");
const { FROM, UNTIL, DIRECTORY, MAX_SALE_ROWS } = require("./collect-username-forward-v2-local");

const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const fileHash = (file) => sha256(fs.readFileSync(file));

function makeManifest(repo, createdAt) {
  if (Date.parse(createdAt) >= Date.parse(FROM)) throw new Error("Forward-v2 reservation must be sealed before its start");
  const files = (names) => Object.fromEntries(names.map((name) => [name, fileHash(path.join(repo, name))]));
  const data = path.join(repo, "research/telegram-usernames/data");
  return {
    schemaVersion: "username-forward-v2-reservation-v1",
    sealedBeforeWindow: true,
    createdAt,
    predecessor: {
      originalForwardManifestSha256: fileHash(path.join(data, "username-forward-reservation-manifest-2026-09-20.json")),
      lateQualificationReportSha256: fileHash(path.join(data, "username-late-qualification-result-2026-09-20.json")),
      earlierForwardLabelsRemainUnopened: true,
    },
    window: {
      fromInclusive: FROM, untilExclusive: UNTIL, directory: DIRECTORY,
      maximumRawSaleRows: MAX_SALE_ROWS,
      weeklyBlocks: [FROM, "2026-10-04T00:00:00Z", "2026-10-11T00:00:00Z", "2026-10-18T00:00:00Z", UNTIL],
    },
    candidate: {
      estimatorVersion: USERNAME_ESTIMATOR_VERSION,
      calibrationVersion: USERNAME_CALIBRATION_VERSION,
      modelVersion: "telegram-username-learned-v15",
      maxHistory: 30000,
      strategy: "same-case v25 fallback plus exact independently verified active-auction bid at 24h/6h/1h; never portfolio eligible",
      horizonsHours: [24, 6, 1],
      files: files(["lib/username-estimator.js", "lib/username-learned-model.js", "lib/username-backtest.js",
        "lib/username-active-auction-nowcast.js", "lib/username-auction-bid-evidence.js"]),
    },
    collectionFiles: files(["lib/toncenter-username-settlement-ledger.js", "scripts/collect-username-forward-v2-local.js",
      "scripts/audit-username-forward-v2-reservation.js", "scripts/audit-reserved-username-collection.js"]),
    trainingSources: files(["research/telegram-usernames/data/dune_username_sales.part",
      "research/telegram-usernames/data/tonapi_username_universe.csv"]),
    selection: {
      chronologicalUnfilteredCollection: true,
      includeEveryContractVerifiedUsernameSettlement: true,
      noPriceNameOutcomeOrPredictionFiltering: true,
      retainAllLifecycleFailuresAndUnavailableCases: true,
      stopAtFirstOf: ["maximumRawSaleRows", "untilExclusive"],
      capacitySafety: "Collector counts all raw sale rows; if fewer than ten slots remain, stop below cap rather than risk exceeding it",
      noPoolingWithOriginalForwardCohort: true,
    },
    evaluation: {
      baseline: "same-case v25 historical-only plus strictly prior new-cohort sales; no original forward holdout labels",
      candidate: "baseline plus exact verified chain bid available at each frozen pre-close horizon",
      allCasesAttempted: true,
      developmentCalibrationCutoff: "2026-09-27T00:00:00Z",
      noHoldoutOutcomeTuning: true,
      reportBy: ["overall", "ordinary", "intermediate", "premium", "weekly-block"],
      metrics: ["median-factor-error", "mean-absolute-log-error", "80-percent-interval-score",
        "80-percent-interval-coverage", "availability", "abstentions", "premium-unique-identities"],
      uncertainty: "deterministic identity-clustered bootstrap 95-percent confidence interval for paired premium MALE improvement",
      finalEvaluator: "implementation and exact hash must be sealed in a supplement before any holdout label is opened",
    },
    gates: {
      minimumPremiumUniqueIdentities: 100,
      minimumPremiumWeeklyBlocks: 2,
      premiumThresholdUsd: 500,
      premiumMedianFactorErrorMaximum: 3,
      premiumMaleImprovementVsV25Minimum: 0.25,
      premiumImprovementLowerConfidenceBoundPositive: true,
      ordinaryAndIntermediateMaleRegressionMaximum: 0.05,
      overallIntervalCoverageMinimum: 0.75,
      overallIntervalCoverageMaximum: 0.85,
      premiumIntervalCoverageMinimum: 0.70,
      noOverallIntervalScoreRegression: true,
      noAvailabilityRegression: true,
    },
    limitations: [
      "This cohort tests active-auction nowcasting only, never inactive resale or portfolio valuation.",
      "A one-week cap, fewer than 100 premium identities, or inconclusive clustered uncertainty fails qualification.",
      "No best-in-market claim without separate competitor evidence.",
    ],
  };
}

function main() {
  const repo = path.resolve(__dirname, "..");
  const output = path.join(repo, "research/telegram-usernames/data/username-forward-v2-reservation-manifest-2026-09-25.json");
  if (fs.existsSync(output)) throw new Error("Forward-v2 reservation already exists");
  const manifest = makeManifest(repo, new Date().toISOString());
  fs.writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
  console.log(JSON.stringify({ output: path.basename(output), sha256: fileHash(output), createdAt: manifest.createdAt,
    window: manifest.window, gates: manifest.gates }, null, 2));
}

if (require.main === module) try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
module.exports = { makeManifest };
