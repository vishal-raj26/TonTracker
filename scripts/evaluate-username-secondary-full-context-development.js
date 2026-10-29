"use strict";

// Development-only replay on already exposed historical labels. The target
// sample is identical to the earlier study; context includes every strictly
// prior completed secondary sale, including non-target ordinary sales.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { loadHistoricalSales } = require("./evaluate-username-rebuild");
const { FOLDS, fixedSaleTargets, developmentSample, pairedCohorts } = require("./evaluate-username-secondary-development");
const { cohortSummaries, clusteredBootstrapImprovement } = require("./evaluate-username-secondary-qualification");
const { completedSale, estimateTelegramUsernameValue } = require("../lib/username-estimator");
const { trainUsernameLearnedModel } = require("../lib/username-learned-model");
const { classifyTelegramUsername } = require("../lib/username-structural");
const { knowledgeBefore } = require("../lib/username-backtest");

const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const fileHash = (file) => hash(fs.readFileSync(file));
const eventKey = (row) => String(row.eventId || `${row.username}|${row.eventTime}|${row.priceUsd}`);
const eventTime = (row) => Date.parse(row.eventTime);

function normalized(rows) {
  const seen = new Set();
  return rows.filter((row) => {
    if (!completedSale(row) || !Number.isFinite(eventTime(row))) return false;
    const key = eventKey(row);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice().sort((a, b) => eventTime(a) - eventTime(b));
}

function prepared(row, cutoff) {
  return { ...row, knowledge: knowledgeBefore(row.knowledge, cutoff),
    classification: undefined, semantic: undefined, semantic_json: undefined };
}

function prediction(target, evidence, model) {
  const cutoff = eventTime(target);
  const classification = classifyTelegramUsername(target.username);
  classification.knowledge = knowledgeBefore(target.knowledge, cutoff);
  const result = estimateTelegramUsernameValue(classification, evidence, { nowMs: cutoff, learnedModel: model });
  const available = Number(result.estimateUsd) > 0 && result.status !== "unavailable";
  return { status: result.status, confidenceBand: result.confidenceBand, available, prediction: result,
    factorError: available ? Math.max(result.estimateUsd / target.priceUsd, target.priceUsd / result.estimateUsd) : null,
    insideRange: available && target.priceUsd >= Number(result.rangeLowUsd) && target.priceUsd <= Number(result.rangeHighUsd) };
}

function evaluateFullContext(historicalRows, contextRows, targetRows, options = {}) {
  const maxHistory = Math.max(25, Number(options.maxHistory || 30000));
  const refreshInterval = Math.max(1, Number(options.modelRefreshInterval || 50));
  const context = normalized(contextRows);
  const targets = normalized(targetRows);
  const firstTarget = eventTime(targets[0] || {});
  if (!Number.isFinite(firstTarget)) return [];
  const historical = normalized(historicalRows).filter((row) => eventTime(row) < firstTarget);
  const historicalRecent = historical.slice(-maxHistory);
  const historicalOwn = new Map();
  for (const row of historical) {
    const own = historicalOwn.get(row.username) || [];
    own.push(row);
    historicalOwn.set(row.username, own);
  }
  const baselineModel = historicalRecent.length >= 25
    ? trainUsernameLearnedModel(historicalRecent.map((row) => prepared(row, firstTarget)), { nowMs: firstTarget }) : null;
  let nextContext = 0;
  const priorContext = [];
  const contextOwn = new Map();
  let candidateModel = null;
  let modelAt = -1;
  return targets.map((target, index) => {
    const cutoff = eventTime(target);
    while (nextContext < context.length && eventTime(context[nextContext]) < cutoff) {
      const row = context[nextContext++];
      priorContext.push(row);
      const own = contextOwn.get(row.username) || [];
      own.push(row);
      contextOwn.set(row.username, own);
    }
    const historicalOwnRows = historicalOwn.get(target.username) || [];
    const baselineRows = [...historicalRecent, ...historicalOwnRows];
    const candidateRecent = [...historicalRecent, ...priorContext].slice(-maxHistory);
    const candidateRows = [...candidateRecent, ...historicalOwnRows, ...(contextOwn.get(target.username) || [])];
    const uniquePrepared = (rows) => [...new Map(rows.map((row) => [eventKey(row), row])).values()]
      .map((row) => prepared(row, cutoff));
    if (candidateRecent.length >= 25 && (modelAt < 0 || index - modelAt >= refreshInterval)) {
      candidateModel = trainUsernameLearnedModel(candidateRecent.map((row) => prepared(row, cutoff)), { nowMs: cutoff });
      modelAt = index;
    }
    const result = { sale: target,
      baseline: prediction(target, uniquePrepared(baselineRows), baselineModel),
      candidate: prediction(target, uniquePrepared(candidateRows), candidateModel),
      priorSecondaryEvidence: priorContext.length };
    if (options.collectGarbage && typeof global.gc === "function" && index % 10 === 0) global.gc();
    if (typeof options.onProgress === "function") options.onProgress(index + 1, targets.length);
    return result;
  });
}

async function main() {
  const chosen = process.argv.indexOf("--fold");
  const selected = chosen < 0 ? FOLDS : FOLDS.filter((fold) => fold.name === process.argv[chosen + 1]);
  if (!selected.length) throw new Error("Unknown --fold");
  const repo = path.resolve(__dirname, "..");
  const dir = path.join(repo, "research/telegram-usernames/data");
  const suffix = chosen < 0 ? "all" : selected[0].name;
  const output = path.join(dir, `username-secondary-full-context-development-${suffix}-2026-09-25.json`);
  if (fs.existsSync(output)) throw new Error("Full-context development report already exists");
  const historical = await loadHistoricalSales(undefined, { fingerprint: true });
  const all = [], folds = [];
  for (const fold of selected) {
    const population = fixedSaleTargets(historical.sales, fold);
    const targets = developmentSample(population);
    const history = historical.sales.filter((row) => eventTime(row) < Date.parse(fold.from));
    const rows = evaluateFullContext(history, population, targets, { maxHistory: 30000, modelRefreshInterval: 50,
      collectGarbage: true, onProgress: (done, total) => {
        if (done % 25 === 0 || done === total) console.error(`${fold.name} ${done}/${total}`);
      } });
    all.push(...rows);
    const premium = rows.filter((row) => row.sale.priceUsd >= 500);
    const summary = { ...fold, populationEvents: population.length, attempts: rows.length,
      premiumEvents: premium.length, premiumIdentities: new Set(premium.map((row) => row.sale.nftAddress)).size,
      baselineOwnAnchors: rows.filter((row) => Number(row.baseline.prediction.ownSaleCount) > 0).length,
      candidateOwnAnchors: rows.filter((row) => Number(row.candidate.prediction.ownSaleCount) > 0).length,
      cohorts: cohortSummaries(rows, 500), paired: pairedCohorts(rows) };
    folds.push(summary);
    console.log(JSON.stringify({ completedFold: fold.name, attempts: rows.length,
      premiumIdentities: summary.premiumIdentities, premiumPaired: summary.paired.premium }, null, 2));
  }
  const premium = all.filter((row) => row.sale.priceUsd >= 500);
  const report = { schemaVersion: "username-secondary-full-context-development-v1", qualification: false,
    developmentOnly: true, productionChanged: false, reserved2026OutcomesOpened: false,
    createdAt: new Date().toISOString(), design: { folds: selected, target: "historical secondary fixed sales",
      targetSelection: "all intermediate and premium outcomes plus 100 deterministic ordinary controls per fold",
      baseline: "v25 on frozen pre-fold historical evidence",
      candidate: "same v25 plus every strictly earlier secondary sale in the fold, including unselected sales",
      sameTimeExcluded: true, maxHistory: 30000, modelRefreshInterval: 50 },
    sources: { ...historical.sourceHashes, loadedSales: historical.sales.length, rejected: historical.rejected },
    code: { evaluatorSha256: fileHash(__filename), frozenQualificationEvaluatorSha256: fileHash(path.join(repo, "scripts/evaluate-username-secondary-qualification.js")) },
    attempts: all.length, premiumEvents: premium.length,
    premiumIdentities: new Set(premium.map((row) => row.sale.nftAddress)).size,
    folds, cohorts: cohortSummaries(all, 500), paired: pairedCohorts(all),
    caseDetails: all.map((row) => ({ eventId: row.sale.eventId, username: row.sale.username,
      nftAddress: row.sale.nftAddress, eventTime: row.sale.eventTime, actualUsd: row.sale.priceUsd,
      priorSecondaryEvidence: row.priorSecondaryEvidence,
      baseline: { status: row.baseline.status, confidenceBand: row.baseline.confidenceBand,
        available: row.baseline.available, estimateUsd: row.baseline.prediction.estimateUsd,
        rangeLowUsd: row.baseline.prediction.rangeLowUsd, rangeHighUsd: row.baseline.prediction.rangeHighUsd,
        ownSaleCount: row.baseline.prediction.ownSaleCount, evidenceCount: row.baseline.prediction.evidenceCount },
      candidate: { status: row.candidate.status, confidenceBand: row.candidate.confidenceBand,
        available: row.candidate.available, estimateUsd: row.candidate.prediction.estimateUsd,
        rangeLowUsd: row.candidate.prediction.rangeLowUsd, rangeHighUsd: row.candidate.prediction.rangeHighUsd,
        ownSaleCount: row.candidate.prediction.ownSaleCount, evidenceCount: row.candidate.prediction.evidenceCount } })),
    bootstrapPremiumMaleImprovement: clusteredBootstrapImprovement(premium, { iterations: 2000, seed: 25092026 }),
    limitations: ["Historical labels are exposed development data, not untouched qualification.",
      "The ordinary sample is not population-representative; pooled overall metrics must not be marketed as market accuracy.",
      "Baseline and candidate use only pre-fold global history; within-fold primary auctions are excluded from both.",
      "No private offer, seller ask or active bid is used as a secondary resale label.",
      "This report cannot change the sealed 2026 candidate or production without separate qualification."] };
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
  console.log(JSON.stringify({ output: path.basename(output), sha256: fileHash(output), attempts: report.attempts,
    premiumIdentities: report.premiumIdentities, premiumPaired: report.paired.premium,
    bootstrapPremiumMaleImprovement: report.bootstrapPremiumMaleImprovement }, null, 2));
}

module.exports = { evaluateFullContext };
if (require.main === module) main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
