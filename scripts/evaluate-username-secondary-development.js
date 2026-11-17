"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { loadHistoricalSales } = require("./evaluate-username-rebuild");
const { evaluateStreams, cohortSummaries, clusteredBootstrapImprovement } = require("./evaluate-username-secondary-qualification");
const { summarize } = require("../lib/username-backtest");

const FOLDS = [
  { name: "2024-Q4", from: "2024-10-01T00:00:00Z", until: "2025-01-01T00:00:00Z" },
  { name: "2025-Q1", from: "2025-01-01T00:00:00Z", until: "2025-04-01T00:00:00Z" },
  { name: "2025-Q2", from: "2025-04-01T00:00:00Z", until: "2025-07-01T00:00:00Z" },
];
const PREMIUM_THRESHOLD_USD = 500;

const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const fileHash = (file) => hash(fs.readFileSync(file));

function fixedSaleTargets(sales, fold) {
  const from = Date.parse(fold.from), until = Date.parse(fold.until);
  return sales.filter((row) => row.marketStage === "secondary" && row.saleType === "sale"
    && Date.parse(row.eventTime) >= from && Date.parse(row.eventTime) < until);
}

function developmentSample(rows) {
  const ordinary = rows.filter((row) => row.priceUsd < 100)
    .slice().sort((left, right) => hash(left.eventId).localeCompare(hash(right.eventId))).slice(0, 100);
  return [...ordinary, ...rows.filter((row) => row.priceUsd >= 100)]
    .sort((left, right) => Date.parse(left.eventTime) - Date.parse(right.eventTime));
}

function selectCohort(rows, cohort) {
  if (cohort === "ordinary") return rows.filter((row) => row.sale.priceUsd < 100);
  if (cohort === "intermediate") return rows.filter((row) => row.sale.priceUsd >= 100 && row.sale.priceUsd < PREMIUM_THRESHOLD_USD);
  if (cohort === "premium") return rows.filter((row) => row.sale.priceUsd >= PREMIUM_THRESHOLD_USD);
  return rows;
}

function variantSummary(rows, variant) {
  return summarize(rows.map((row) => ({ sale: row.sale, prediction: row[variant].prediction,
    factorError: row[variant].factorError, insideRange: row[variant].insideRange })));
}

function pairedCohorts(rows) {
  return Object.fromEntries(["overall", "ordinary", "intermediate", "premium"].map((cohort) => {
    const paired = selectCohort(rows, cohort).filter((row) => row.baseline.available && row.candidate.available);
    const baseline = variantSummary(paired, "baseline"), candidate = variantSummary(paired, "candidate");
    const improvement = baseline.meanAbsoluteLogError > 0
      ? (baseline.meanAbsoluteLogError - candidate.meanAbsoluteLogError) / baseline.meanAbsoluteLogError : null;
    const intervalScoreImprovement = baseline.meanLogIntervalScore80 > 0
      ? (baseline.meanLogIntervalScore80 - candidate.meanLogIntervalScore80) / baseline.meanLogIntervalScore80 : null;
    return [cohort, { samples: paired.length, baseline, candidate, maleImprovement: improvement, intervalScoreImprovement }];
  }));
}

async function main() {
  const repo = path.resolve(__dirname, "..");
  const dir = path.join(repo, "research/telegram-usernames/data");
  const output = path.join(dir, "username-secondary-development-2026-09-22.json");
  if (fs.existsSync(output)) throw new Error("Secondary development report already exists");
  const historical = await loadHistoricalSales(undefined, { fingerprint: true });
  const allRows = [];
  const folds = [];
  for (const fold of FOLDS) {
    const population = fixedSaleTargets(historical.sales, fold);
    const targets = developmentSample(population);
    const history = historical.sales.filter((row) => Date.parse(row.eventTime) < Date.parse(fold.from));
    const rows = evaluateStreams(history, targets, { maxHistory: 30000, modelRefreshInterval: 50,
      collectGarbage: true, onProgress: (done, total) => { if (done % 25 === 0 || done === total) console.error(`${fold.name} ${done}/${total}`); } });
    allRows.push(...rows);
    const summary = { ...fold, populationEvents: population.length, attempts: rows.length, uniqueIdentities: new Set(rows.map((row) => row.sale.nftAddress)).size,
      premiumEvents: rows.filter((row) => row.sale.priceUsd >= PREMIUM_THRESHOLD_USD).length,
      premiumIdentities: new Set(rows.filter((row) => row.sale.priceUsd >= PREMIUM_THRESHOLD_USD).map((row) => row.sale.nftAddress)).size,
      baselineOwnAnchors: rows.filter((row) => Number(row.baseline.prediction.ownSaleCount) > 0).length,
      candidateOwnAnchors: rows.filter((row) => Number(row.candidate.prediction.ownSaleCount) > 0).length,
      cohorts: cohortSummaries(rows, PREMIUM_THRESHOLD_USD), paired: pairedCohorts(rows) };
    folds.push(summary);
    console.log(JSON.stringify({ completedFold: fold.name, attempts: summary.attempts,
      premiumIdentities: summary.premiumIdentities, pairedPremium: summary.paired.premium }, null, 2));
  }
  const premiumRows = allRows.filter((row) => row.sale.priceUsd >= PREMIUM_THRESHOLD_USD);
  const bootstrap = clusteredBootstrapImprovement(premiumRows, { iterations: 2000, seed: 22092026 });
  const report = { schemaVersion: "username-secondary-development-v1", qualification: false, developmentOnly: true,
    productionChanged: false, reserved2026OutcomesOpened: false, createdAt: new Date().toISOString(),
    design: { folds: FOLDS, target: "historical secondary fixed sales only", baseline: "v25 using only sales before each fold",
      candidate: "same v25 plus strictly earlier sampled secondary fixed sales inside each fold", maxHistory: 30000,
      modelRefreshInterval: 50, everySelectedTargetRetained: true, sameTimeExcluded: true },
    sources: { ...historical.sourceHashes, loadedSales: historical.sales.length, rejected: historical.rejected },
    code: { evaluatorSha256: fileHash(__filename), frozenSecondaryEvaluatorSha256: fileHash(path.join(repo, "scripts/evaluate-username-secondary-qualification.js")) },
    attempts: allRows.length, uniqueIdentities: new Set(allRows.map((row) => row.sale.nftAddress)).size,
    premiumEvents: premiumRows.length, premiumIdentities: new Set(premiumRows.map((row) => row.sale.nftAddress)).size,
    folds, cohorts: cohortSummaries(allRows, PREMIUM_THRESHOLD_USD), paired: pairedCohorts(allRows),
    bootstrapPremiumMaleImprovement: bootstrap,
    limitations: ["The folds and labels are exposed development evidence, not untouched qualification.",
      "All intermediate and premium fixed-sale targets are included, with 100 deterministic ordinary controls per fold. The sampled result is not a representative full-market overall metric.",
      "Within-fold candidate evidence includes only previously sampled targets; it understates what full ingestion would supply.",
      "Market stage and sale type select evaluation targets only; they are realized-event metadata and are not estimator inputs.",
      "This experiment tests the marginal value of prior verified secondary outcomes, not private offers or active-auction bids.",
      "No result from this report changes production behavior or the sealed 2026 reservation."] };
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
  console.log(JSON.stringify({ output: path.basename(output), sha256: fileHash(output), attempts: report.attempts,
    premiumIdentities: report.premiumIdentities, cohorts: report.cohorts, paired: report.paired,
    bootstrapPremiumMaleImprovement: bootstrap }, null, 2));
}

module.exports = { FOLDS, fixedSaleTargets, developmentSample, pairedCohorts };
if (require.main === module) main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
