"use strict";

// Exposed historical development comparison only. This never writes estimator
// behavior or touches the reserved prospective outcome streams.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { loadHistoricalSales } = require("./evaluate-username-rebuild");
const { backtestTelegramUsernameSales } = require("../lib/username-backtest");
const { completedSale } = require("../lib/username-estimator");
const { USERNAME_ESTIMATOR_VERSION, USERNAME_CALIBRATION_VERSION } = require("../lib/username-engine");

const ROOT = path.join(__dirname, "..");
const DATA = path.join(ROOT, "research/telegram-usernames/data");
const REPORT = path.join(DATA, "username-secondary-own-history-development-2026-09-27.json");
const PROTOCOL = path.join(ROOT, "research/telegram-usernames/secondary-own-history-v25-comparison-protocol-2026-09-27.json");
const EPSILON = 1e-12;

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function eventKey(row) {
  const time = Date.parse(row.eventTime);
  const nft = String(row.nftAddress || "").toLowerCase();
  const username = String(row.username || "").toLowerCase();
  if (!Number.isFinite(time) || !nft || !username) throw new Error("Comparison event lacks exact NFT/time/name identity");
  return `${nft}|${time}|${username}`;
}

function caseSetHash(rows) {
  const identifiers = rows.map(row => {
    const actual = Number(row.actualUsd ?? row.priceUsd);
    if (!(actual > 0) || !Number.isFinite(actual)) throw new Error("Comparison case lacks its positive historical outcome label");
    return `${eventKey(row)}|${actual.toPrecision(15)}`;
  }).sort();
  return crypto.createHash("sha256").update(identifiers.join("\n")).digest("hex");
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
}

function summarize(rows) {
  const point = rows.filter(row => row.v25EstimateUsd > 0);
  if (!point.length) return { attempts: rows.length, evaluated: 0, abstentions: rows.length };
  const logErrors = point.map(row => Math.abs(Math.log(row.v25EstimateUsd / row.actualUsd)));
  const factors = point.map(row => Math.max(row.v25EstimateUsd / row.actualUsd, row.actualUsd / row.v25EstimateUsd));
  const intervals = point.filter(row => row.v25LowUsd > 0 && row.v25HighUsd >= row.v25LowUsd);
  const scores = intervals.map(row => Math.log(row.v25HighUsd / row.v25LowUsd)
    + 10 * Math.max(0, Math.log(row.v25LowUsd / row.actualUsd))
    + 10 * Math.max(0, Math.log(row.actualUsd / row.v25HighUsd)));
  return {
    attempts: rows.length,
    evaluated: point.length,
    abstentions: rows.length - point.length,
    meanAbsoluteLogError: logErrors.reduce((sum, value) => sum + value, 0) / point.length,
    medianFactorError: median(factors),
    p95FactorError: medianQuantile(factors, 0.95),
    coverage80: intervals.length ? intervals.filter(row => row.actualUsd >= row.v25LowUsd && row.actualUsd <= row.v25HighUsd).length / intervals.length : null,
    meanLogIntervalScore80: scores.length ? scores.reduce((sum, value) => sum + value, 0) / scores.length : null,
  };
}

function medianQuantile(values, quantile) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor(quantile * sorted.length))];
}

function candidateSummary(rows, predictionField) {
  const samples = rows.filter(row => row[predictionField]);
  if (!samples.length) return { attempts: rows.length, evaluated: 0, abstentions: rows.length };
  const factors = samples.map(row => Math.max(row[predictionField].estimateUsd / row.actualUsd,
    row.actualUsd / row[predictionField].estimateUsd));
  const scores = samples.map(row => Math.log(row[predictionField].upperUsd / row[predictionField].lowerUsd)
    + 10 * Math.max(0, Math.log(row[predictionField].lowerUsd / row.actualUsd))
    + 10 * Math.max(0, Math.log(row.actualUsd / row[predictionField].upperUsd)));
  return {
    attempts: rows.length,
    evaluated: samples.length,
    abstentions: rows.length - samples.length,
    meanAbsoluteLogError: factors.reduce((sum, value) => sum + Math.log(value), 0) / samples.length,
    medianFactorError: median(factors),
    p95FactorError: medianQuantile(factors, 0.95),
    coverage80: samples.filter(row => row.actualUsd >= row[predictionField].lowerUsd && row.actualUsd <= row[predictionField].upperUsd).length / samples.length,
    meanLogIntervalScore80: scores.reduce((sum, value) => sum + value, 0) / samples.length,
  };
}

function clusterBootstrap(rows, iterations = 2000, seed = 27092026) {
  const groups = new Map();
  for (const row of rows) {
    if (!(row.v25EstimateUsd > 0) || !row.ownHistoryCandidate) continue;
    const key = row.username;
    const group = groups.get(key) || [];
    group.push(row);
    groups.set(key, group);
  }
  const clusters = [...groups.values()];
  if (clusters.length < 2) return { identities: clusters.length, iterations: 0, lower95: null, median: null, upper95: null };
  let state = seed >>> 0;
  const random = () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  const improvements = [];
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    let candidateError = 0, v25Error = 0, count = 0;
    for (let sample = 0; sample < clusters.length; sample += 1) {
      const cluster = clusters[Math.floor(random() * clusters.length)];
      for (const row of cluster) {
        candidateError += Math.abs(Math.log(row.ownHistoryCandidate.estimateUsd / row.actualUsd));
        v25Error += Math.abs(Math.log(row.v25EstimateUsd / row.actualUsd));
        count += 1;
      }
    }
    if (count && v25Error > 0) improvements.push(1 - candidateError / v25Error);
  }
  return {
    identities: clusters.length,
    iterations: improvements.length,
    seed,
    lower95: medianQuantile(improvements, 0.025),
    median: median(improvements),
    upper95: medianQuantile(improvements, 0.975),
  };
}

function cohortReports(rows) {
  const cohorts = {
    all: () => true,
    "secondary/fixed": row => row.realizedVenue === "secondary/fixed",
    "secondary/auction": row => row.realizedVenue === "secondary/auction",
    "primary/auction": row => row.realizedVenue === "primary/auction",
    ordinary: row => row.actualUsd < 100,
    intermediate: row => row.actualUsd >= 100 && row.actualUsd < 500,
    premium: row => row.actualUsd >= 500,
    "secondary/ordinary": row => row.realizedVenue.startsWith("secondary/") && row.actualUsd < 100,
    "secondary/intermediate": row => row.realizedVenue.startsWith("secondary/") && row.actualUsd >= 100 && row.actualUsd < 500,
    "secondary/premium": row => row.realizedVenue.startsWith("secondary/") && row.actualUsd >= 500,
  };
  return Object.fromEntries(Object.entries(cohorts).map(([name, predicate]) => {
    const cases = rows.filter(predicate);
    const common = cases.filter(row => row.v25EstimateUsd > 0);
    return [name, {
      attempts: cases.length,
      v25: summarize(cases),
      staticControl: candidateSummary(cases, "staticControl"),
      ownHistoryCandidate: candidateSummary(cases, "ownHistoryCandidate"),
      commonCases: common.length,
      candidateVsV25ClusterBootstrap: name === "secondary/premium" ? clusterBootstrap(common) : undefined,
    }];
  }));
}

async function main() {
  const candidate = JSON.parse(fs.readFileSync(REPORT, "utf8"));
  const { sales, rejected, sourceHashes } = await loadHistoricalSales(DATA, { fingerprint: true });
  const window = { fromInclusive: "2024-10-01T00:00:00Z", untilExclusive: "2025-02-01T00:00:00Z" };
  const seen = new Set();
  const eligible = sales.filter(row => {
    if (!completedSale(row)) return false;
    const time = Date.parse(row.eventTime);
    if (time < Date.parse(window.fromInclusive) || time >= Date.parse(window.untilExclusive)) return false;
    const dedupeKey = `${row.username}|${time}|${Number(row.priceUsd)}`;
    if (seen.has(dedupeKey)) return false;
    seen.add(dedupeKey);
    return true;
  });
  const expectedKeys = new Set(candidate.results.map(eventKey));
  const eligibleKeys = new Set(eligible.map(eventKey));
  const missingAudit = [...expectedKeys].filter(key => !eligibleKeys.has(key));
  const unexpectedAudit = [...eligibleKeys].filter(key => !expectedKeys.has(key));
  if (process.argv.includes("--audit-only")) {
    console.log(JSON.stringify({ sourceSales: sales.length, rejectedSales: rejected,
      candidateCases: candidate.results.length, eligibleV25Cases: eligible.length,
      missingFromV25: missingAudit.length, unexpectedForCandidate: unexpectedAudit.length,
      candidateCaseSetSha256: caseSetHash(candidate.results),
      v25CaseSetSha256: caseSetHash(eligible), sourceHashes }, null, 2));
    if (missingAudit.length || unexpectedAudit.length || eligible.length !== candidate.results.length) process.exitCode = 2;
    return;
  }
  if (!fs.existsSync(PROTOCOL)) throw new Error("Frozen comparator protocol is missing");
  const protocol = JSON.parse(fs.readFileSync(PROTOCOL, "utf8"));
  if (protocol.runtime.estimatorVersion !== USERNAME_ESTIMATOR_VERSION
    || protocol.runtime.calibrationVersion !== USERNAME_CALIBRATION_VERSION
    || protocol.runtime.evaluationStride !== 1 || protocol.runtime.maxHistory !== 1500
    || protocol.runtime.modelRefreshInterval !== 50 || protocol.runtime.historicalSemanticSnapshot !== null
    || protocol.runtime.historicalRetrieval !== false || protocol.runtime.classifierStandardization !== false
    || protocol.runtime.postFitShrinkage !== true) throw new Error("Runtime settings differ from frozen protocol");
  for (const [relative, expected] of Object.entries(protocol.sourceSha256)) {
    if (sha256(path.join(ROOT, relative)) !== expected) throw new Error(`Frozen source changed: ${relative}`);
  }
  if (sha256(__filename) !== protocol.comparatorSha256) throw new Error("Comparator script differs from frozen protocol");
  if (sha256(REPORT) !== protocol.candidateReportSha256) throw new Error("Candidate report differs from frozen protocol");
  if (fs.existsSync(protocol.outputPath)) throw new Error("Refusing to overwrite an existing one-time comparison report");

  if (sourceHashes["dune_username_sales.part"] !== protocol.duneSalesSha256) throw new Error("Dune sales source changed");
  if (missingAudit.length || unexpectedAudit.length || eligible.length !== candidate.results.length) throw new Error("Exact target-set audit failed before fitting");
  const run = backtestTelegramUsernameSales(sales, {
    evaluationFrom: protocol.window.fromInclusive,
    evaluationUntil: protocol.window.untilExclusive,
    maxEvaluations: protocol.attempts,
    evaluationStride: 1,
    maxHistory: 1500,
    modelRefreshInterval: 50,
  });
  if (expectedKeys.size !== candidate.results.length) throw new Error("Candidate report has duplicate NFT/time/name cases");
  if (caseSetHash(candidate.results) !== protocol.caseSetSha256) throw new Error("Candidate exact case-set hash differs from frozen protocol");
  const attemptedByKey = new Map();
  for (const row of run.evaluationCases) {
    const key = eventKey(row);
    if (attemptedByKey.has(key)) throw new Error(`Duplicate v25 target event: ${key}`);
    attemptedByKey.set(key, row);
  }
  const missing = [...expectedKeys].filter(key => !attemptedByKey.has(key));
  const unexpected = [...attemptedByKey.keys()].filter(key => !expectedKeys.has(key));
  if (missing.length || unexpected.length || attemptedByKey.size !== expectedKeys.size) {
    throw new Error(`Case-set mismatch: expected ${expectedKeys.size}; v25 attempted ${attemptedByKey.size}; missing ${missing.length}; unexpected ${unexpected.length}`);
  }

  const resultByKey = new Map();
  for (const row of run.results) {
    const key = eventKey(row.sale);
    if (resultByKey.has(key)) throw new Error(`Duplicate current-v25 prediction: ${key}`);
    resultByKey.set(key, row);
  }
  const joined = candidate.results.map(row => {
    const attempt = attemptedByKey.get(eventKey(row));
    const runtime = resultByKey.get(eventKey(row));
    if (runtime && Math.abs(runtime.sale.priceUsd - row.actualUsd) > EPSILON * Math.max(1, row.actualUsd)) {
      throw new Error(`Target outcome mismatch despite identity match: ${eventKey(row)}`);
    }
    return {
      eventId: row.eventId,
      nftAddress: row.nftAddress,
      eventTime: row.eventTime,
      username: row.username,
      actualUsd: row.actualUsd,
      realizedVenue: row.realizedVenue,
      primaryStatus: attempt.status,
      primaryAvailable: Boolean(runtime),
      v25EstimateUsd: runtime ? runtime.prediction.estimateUsd : null,
      v25LowUsd: runtime ? runtime.prediction.rangeLowUsd : null,
      v25HighUsd: runtime ? runtime.prediction.rangeHighUsd : null,
      staticControl: row.staticControl,
      ownHistoryCandidate: row.ownHistoryCandidate,
    };
  });
  const reports = cohortReports(joined);
  const folds = {
    "2024q4": cohortReports(joined.filter(row => Date.parse(row.eventTime) < Date.parse("2025-01-01T00:00:00Z"))),
    "2025jan": cohortReports(joined.filter(row => Date.parse(row.eventTime) >= Date.parse("2025-01-01T00:00:00Z"))),
  };
  const content = {
    qualification: false,
    productionIntegrated: false,
    reservedLabelsOpened: false,
    exposedDevelopmentOnly: true,
    protocolSha256: sha256(PROTOCOL),
    comparatorSha256: sha256(__filename),
    candidateReportSha256: sha256(REPORT),
    sourceSha256: { ...sourceHashes,
      "scripts/evaluate-username-rebuild.js": sha256(path.join(ROOT, "scripts/evaluate-username-rebuild.js")),
      "lib/username-backtest.js": sha256(path.join(ROOT, "lib/username-backtest.js")),
      "lib/username-estimator.js": sha256(path.join(ROOT, "lib/username-estimator.js")),
      "lib/username-learned-model.js": sha256(path.join(ROOT, "lib/username-learned-model.js")),
      "lib/username-engine.js": sha256(path.join(ROOT, "lib/username-engine.js")),
    },
    settings: { evaluationStride: 1, maxHistory: 1500, modelRefreshInterval: 50, semanticSnapshot: null, retrieval: false },
    estimatorVersion: USERNAME_ESTIMATOR_VERSION,
    calibrationVersion: USERNAME_CALIBRATION_VERSION,
    window: protocol.window,
    sourceSales: sales.length,
    rejectedSales: rejected,
    attempts: run.attempted,
    caseSetMatchesExactly: true,
    caseSetSha256: protocol.caseSetSha256,
    estimatedByCurrentV25: run.evaluated,
    abstentionsByCurrentV25: run.abstained,
    cohorts: reports,
    folds,
    limitations: [
      "Both evaluation blocks are exposed historical development data; this paired replay cannot qualify the model or current-market performance.",
      "The candidate report and current v25 may use different model families and features; this compares their frozen outputs on identical outcome events.",
      "Realized venue and price cohorts are used only for retrospective stratification, never for v25 prediction or routing.",
      "The partial Dune export does not establish representative current-market accuracy.",
    ],
    pairedCases: joined,
  };
  fs.writeFileSync(protocol.outputPath, `${JSON.stringify(content, null, 2)}\n`, { flag: "wx" });
  console.log(JSON.stringify({ output: protocol.outputPath, attempts: content.attempts,
    estimatedByCurrentV25: content.estimatedByCurrentV25, abstentionsByCurrentV25: content.abstentionsByCurrentV25,
    caseSetMatchesExactly: content.caseSetMatchesExactly, cohorts: Object.fromEntries(
      Object.entries(reports).map(([name, item]) => [name, { v25: item.v25, candidate: item.ownHistoryCandidate, bootstrap: item.candidateVsV25ClusterBootstrap }])) }, null, 2));
}

if (require.main === module) main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
module.exports = { candidateSummary, caseSetHash, clusterBootstrap, cohortReports, eventKey, medianQuantile, summarize };
