"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { loadHistoricalSales } = require("./evaluate-username-rebuild");
const { completedSale, estimateTelegramUsernameValue } = require("../lib/username-estimator");
const { trainUsernameLearnedModel } = require("../lib/username-learned-model");
const { classifyTelegramUsername } = require("../lib/username-structural");
const { knowledgeBefore, summarize } = require("../lib/username-backtest");

const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const fileHash = (file) => hash(fs.readFileSync(file));
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

function factorError(predicted, actual) {
  return predicted > 0 && actual > 0 ? Math.max(predicted / actual, actual / predicted) : null;
}

function eventKey(row) {
  return String(row.eventId || `${row.username}|${row.eventTime}|${row.priceUsd}`);
}

function normalizedEvidence(rows) {
  const seen = new Set();
  return (rows || []).filter((row) => {
    if (!completedSale(row) || !Number.isFinite(Date.parse(row.eventTime))) return false;
    const key = eventKey(row);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice().sort((left, right) => Date.parse(left.eventTime) - Date.parse(right.eventTime));
}

function evidenceBefore(history, target, maxHistory) {
  const cutoff = Date.parse(target.eventTime);
  const prior = history.filter((row) => Date.parse(row.eventTime) < cutoff);
  const recent = prior.slice(Math.max(0, prior.length - maxHistory));
  const own = prior.filter((row) => row.username === target.username);
  return [...new Map([...recent, ...own].map((row) => [eventKey(row), row])).values()]
    .map((row) => ({ ...row, knowledge: knowledgeBefore(row.knowledge, cutoff), classification: undefined, semantic: undefined, semantic_json: undefined }));
}

function predictionRow(target, evidence, learnedModel) {
  const cutoff = Date.parse(target.eventTime);
  const classification = classifyTelegramUsername(target.username);
  classification.knowledge = knowledgeBefore(target.knowledge, cutoff);
  const prediction = estimateTelegramUsernameValue(classification, evidence, { nowMs: cutoff, learnedModel });
  const available = Number(prediction.estimateUsd) > 0 && prediction.status !== "unavailable";
  return {
    status: prediction.status,
    confidenceBand: prediction.confidenceBand,
    available,
    prediction,
    factorError: available ? factorError(Number(prediction.estimateUsd), Number(target.priceUsd)) : null,
    insideRange: available && Number(target.priceUsd) >= Number(prediction.rangeLowUsd)
      && Number(target.priceUsd) <= Number(prediction.rangeHighUsd),
  };
}

function evaluateStreams(historicalRows, reservedRows, options = {}) {
  const maxHistory = Math.max(25, Number(options.maxHistory || 30000));
  const refreshInterval = Math.max(1, Number(options.modelRefreshInterval || 50));
  const historical = normalizedEvidence(historicalRows);
  const reserved = normalizedEvidence(reservedRows);
  const firstTarget = Date.parse(reserved[0]?.eventTime || 0);
  const historicalPrior = historical.filter((row) => Date.parse(row.eventTime) < firstTarget);
  const historicalRecent = historicalPrior.slice(-maxHistory);
  const historicalOwn = new Map();
  for (const row of historicalPrior) {
    const own = historicalOwn.get(row.username) || [];
    own.push(row);
    historicalOwn.set(row.username, own);
  }
  const prepare = (row, cutoff) => ({ ...row, knowledge: knowledgeBefore(row.knowledge, cutoff),
    classification: undefined, semantic: undefined, semantic_json: undefined });
  const baselinePrepared = historicalRecent.map((row) => prepare(row, firstTarget));
  const baselineModel = baselinePrepared.length >= 25
    ? trainUsernameLearnedModel(baselinePrepared, { nowMs: firstTarget }) : null;
  const priorReserved = [];
  let processedReserved = 0;
  let candidateModel = null;
  let candidateModelAt = -1;
  return reserved.map((target, index) => {
    const cutoff = Date.parse(target.eventTime);
    while (processedReserved < index && Date.parse(reserved[processedReserved].eventTime) < cutoff) {
      const earlier = reserved[processedReserved];
      priorReserved.push(earlier);
      processedReserved += 1;
    }
    const baselineRecent = historicalRecent.filter((row) => Date.parse(row.eventTime) < cutoff);
    const baselineOwn = (historicalOwn.get(target.username) || []).filter((row) => Date.parse(row.eventTime) < cutoff);
    const baselineEvidence = [...new Map([...baselineRecent, ...baselineOwn].map((row) => [eventKey(row), row])).values()]
      .map((row) => prepare(row, cutoff));
    const candidateRecent = [...historicalRecent, ...priorReserved].slice(-maxHistory);
    const candidateOwn = priorReserved.filter((row) => row.username === target.username);
    const candidateEvidence = [...new Map([...candidateRecent, ...baselineOwn, ...candidateOwn]
      .map((row) => [eventKey(row), row])).values()].map((row) => prepare(row, cutoff));
    if (candidateRecent.length >= 25 && (candidateModelAt < 0 || index - candidateModelAt >= refreshInterval)) {
      candidateModel = trainUsernameLearnedModel(candidateRecent.map((row) => prepare(row, cutoff)), { nowMs: cutoff });
      candidateModelAt = index;
    }
    const result = {
      sale: target,
      baseline: predictionRow(target, baselineEvidence, baselineModel),
      candidate: predictionRow(target, candidateEvidence, candidateModel),
      priorSecondaryEvidence: priorReserved.length,
    };
    if (options.collectGarbage && typeof global.gc === "function" && index % 10 === 0) global.gc();
    if (typeof options.onProgress === "function") options.onProgress(index + 1, reserved.length);
    return result;
  });
}

function summaryFor(rows, variant) {
  return summarize(rows.filter((row) => row[variant].available).map((row) => ({
    sale: row.sale,
    prediction: row[variant].prediction,
    factorError: row[variant].factorError,
    insideRange: row[variant].insideRange,
  })));
}

function cohortRows(rows, threshold, cohort) {
  if (cohort === "ordinary") return rows.filter((row) => Number(row.sale.priceUsd) < 100);
  if (cohort === "intermediate") return rows.filter((row) => Number(row.sale.priceUsd) >= 100 && Number(row.sale.priceUsd) < threshold);
  if (cohort === "premium") return rows.filter((row) => Number(row.sale.priceUsd) >= threshold);
  return rows;
}

function cohortSummaries(rows, threshold) {
  return Object.fromEntries(["overall", "ordinary", "intermediate", "premium"].map((cohort) => {
    const selected = cohortRows(rows, threshold, cohort);
    return [cohort, {
      attempts: selected.length,
      baseline: summaryFor(selected, "baseline"),
      candidate: summaryFor(selected, "candidate"),
      paired: selected.filter((row) => row.baseline.available && row.candidate.available).length,
      baselineAbstentions: selected.filter((row) => !row.baseline.available).length,
      candidateAbstentions: selected.filter((row) => !row.candidate.available).length,
    }];
  }));
}

function relativeImprovement(baseline, candidate) {
  return Number.isFinite(baseline) && baseline > 0 && Number.isFinite(candidate) ? (baseline - candidate) / baseline : null;
}

function pairedMetric(rows, cohort, threshold) {
  const paired = cohortRows(rows, threshold, cohort).filter((row) => row.baseline.available && row.candidate.available);
  const baseline = summaryFor(paired, "baseline");
  const candidate = summaryFor(paired, "candidate");
  return {
    samples: paired.length,
    baseline,
    candidate,
    maleImprovement: relativeImprovement(baseline.meanAbsoluteLogError, candidate.meanAbsoluteLogError),
    intervalScoreImprovement: relativeImprovement(baseline.meanLogIntervalScore80, candidate.meanLogIntervalScore80),
  };
}

function rng(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function percentile(values, proportion) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(proportion * sorted.length)))];
}

function clusteredBootstrapImprovement(rows, options = {}) {
  const iterations = Math.max(100, Number(options.iterations || 2000));
  const random = rng(Number(options.seed || 25092026));
  const paired = rows.filter((row) => row.baseline.available && row.candidate.available);
  const clusters = new Map();
  for (const row of paired) {
    const key = String(row.sale.nftAddress || row.sale.username);
    const values = clusters.get(key) || [];
    values.push(row); clusters.set(key, values);
  }
  const identities = [...clusters.keys()].sort();
  if (identities.length < 2) return { identities: identities.length, iterations: 0, lower95: null, median: null, upper95: null };
  const results = [];
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const sample = [];
    for (let index = 0; index < identities.length; index += 1) {
      sample.push(...clusters.get(identities[Math.floor(random() * identities.length)]));
    }
    const metric = pairedMetric(sample, "overall", 500).maleImprovement;
    if (Number.isFinite(metric)) results.push(metric);
  }
  return { identities: identities.length, iterations: results.length,
    lower95: percentile(results, 0.025), median: percentile(results, 0.5), upper95: percentile(results, 0.975) };
}

function weeklyBlock(eventTime, boundaries) {
  const time = Date.parse(eventTime);
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    if (time >= Date.parse(boundaries[index]) && time < Date.parse(boundaries[index + 1])) return `${boundaries[index]}/${boundaries[index + 1]}`;
  }
  return null;
}

function gateResults(rows, manifest, bootstrap) {
  const threshold = Number(manifest.gates.premiumThresholdUsd);
  const cohorts = cohortSummaries(rows, threshold);
  const paired = Object.fromEntries(["overall", "ordinary", "intermediate", "premium"]
    .map((cohort) => [cohort, pairedMetric(rows, cohort, threshold)]));
  const premiums = rows.filter((row) => Number(row.sale.priceUsd) >= threshold);
  const premiumIdentities = new Set(premiums.map((row) => row.sale.nftAddress));
  const premiumBlocks = new Set(premiums.map((row) => weeklyBlock(row.sale.eventTime, manifest.window.weeklyBlocks)).filter(Boolean));
  const ordinaryRegression = paired.ordinary.maleImprovement == null ? null : -paired.ordinary.maleImprovement;
  const intermediateRegression = paired.intermediate.maleImprovement == null ? null : -paired.intermediate.maleImprovement;
  const gates = {
    minimumPremiumIdentities: premiumIdentities.size >= manifest.gates.minimumPremiumUniqueIdentities,
    minimumPremiumWeeklyBlocks: premiumBlocks.size >= manifest.gates.minimumPremiumWeeklyBlocks,
    premiumMedian: cohorts.premium.candidate.medianFactorError != null
      && cohorts.premium.candidate.medianFactorError <= manifest.gates.premiumMedianFactorErrorMaximum,
    premiumMaleImprovementVsV25: paired.premium.maleImprovement != null
      && paired.premium.maleImprovement >= manifest.gates.premiumMaleImprovementVsV25Minimum,
    premiumImprovementConclusive: bootstrap.lower95 != null && bootstrap.lower95 > 0,
    ordinaryRegressionVsV25: ordinaryRegression != null && ordinaryRegression <= manifest.gates.ordinaryAndIntermediateMaleRegressionMaximum,
    intermediateRegressionVsV25: intermediateRegression != null && intermediateRegression <= manifest.gates.ordinaryAndIntermediateMaleRegressionMaximum,
    overallIntervalCoverage: cohorts.overall.candidate.coverage >= manifest.gates.overallIntervalCoverageMinimum
      && cohorts.overall.candidate.coverage <= manifest.gates.overallIntervalCoverageMaximum,
    premiumIntervalCoverage: cohorts.premium.candidate.coverage >= manifest.gates.premiumIntervalCoverageMinimum,
    overallIntervalScoreNoWorse: paired.overall.intervalScoreImprovement != null && paired.overall.intervalScoreImprovement >= 0,
    candidateAvailabilityNoWorse: cohorts.overall.candidate.samples >= cohorts.overall.baseline.samples,
  };
  return { passed: Object.values(gates).every(Boolean), gates, cohorts, paired,
    premiumUniqueIdentities: premiumIdentities.size, premiumWeeklyBlocks: [...premiumBlocks].sort() };
}

function saleRecord(sale) {
  return { username: sale.normalizedName, nftAddress: sale.assetKey, eventId: sale.saleId, eventTime: sale.soldAt,
    priceUsd: Number(sale.priceUsd), priceGram: Number(sale.priceGram), historicalUsdRate: Number(sale.historicalUsdRate),
    eventType: "sale", finalized: true, paymentAsset: "GRAM", marketplace: sale.marketplace, source: sale.source,
    reliabilityScore: Number(sale.reliabilityScore) };
}

async function main() {
  const repo = path.resolve(__dirname, "..");
  const dir = path.join(repo, "research/telegram-usernames/data");
  const manifestFile = path.join(dir, "username-secondary-qualification-final-manifest.json");
  const output = path.join(dir, "username-secondary-qualification-result.json");
  if (fs.existsSync(output)) throw new Error("Secondary qualification report already exists");
  const manifest = readJson(manifestFile);
  if (typeof global.gc !== "function") throw new Error("Run the final evaluator with node --expose-gc");
  for (const [name, expected] of Object.entries(manifest.frozenFiles)) {
    if (fileHash(path.join(repo, name)) !== expected) throw new Error(`Frozen file changed: ${name}`);
  }
  if (fileHash(path.join(dir, manifest.reservation.file)) !== manifest.reservation.sha256
    || fileHash(path.join(dir, manifest.protocolSupplement.file)) !== manifest.protocolSupplement.sha256
    || fileHash(path.join(dir, manifest.integrityAudit.file)) !== manifest.integrityAudit.sha256) {
    throw new Error("Frozen manifest or audit changed");
  }
  const audit = readJson(path.join(dir, manifest.integrityAudit.file));
  const auditEvents = new Map(audit.events.map((row) => [row.saleId, row]));
  const reserved = [];
  for (const page of audit.pages) {
    const file = path.join(dir, manifest.window.directory, page.name);
    const bytes = fs.readFileSync(file);
    if (hash(bytes) !== page.sha256) throw new Error(`Frozen page changed: ${page.name}`);
    for (const sale of JSON.parse(bytes).sales || []) {
      const expected = auditEvents.get(sale.saleId);
      if (!expected || hash(JSON.stringify(sale)) !== expected.recordSha256) throw new Error(`Reserved event changed: ${sale.saleId}`);
      if (!reserved.some((row) => row.eventId === sale.saleId)) reserved.push(saleRecord(sale));
    }
  }
  if (reserved.length !== audit.uniqueEvents) throw new Error(`Reserved event count changed: ${reserved.length}`);
  const historical = await loadHistoricalSales(undefined, { fingerprint: true });
  for (const [name, expected] of Object.entries(manifest.trainingSources)) {
    if (historical.sourceHashes[name] !== expected) throw new Error(`Historical source changed: ${name}`);
  }
  const rows = evaluateStreams(historical.sales, reserved, { maxHistory: manifest.candidate.maxHistory, modelRefreshInterval: 50,
    collectGarbage: true, onProgress: (done, total) => { if (done % 50 === 0 || done === total) console.error(`evaluated ${done}/${total}`); } });
  const premiumRows = rows.filter((row) => Number(row.sale.priceUsd) >= manifest.gates.premiumThresholdUsd);
  const bootstrap = clusteredBootstrapImprovement(premiumRows);
  const decision = gateResults(rows, manifest, bootstrap);
  const report = { schemaVersion: "username-secondary-qualification-result-v1", qualification: true, passed: decision.passed,
    evaluatedAt: new Date().toISOString(), manifest: path.basename(manifestFile), manifestSha256: fileHash(manifestFile),
    sources: { historicalSales: historical.sales.length, historicalRejected: historical.rejected,
      reservedEvents: reserved.length, reservedUniqueIdentities: new Set(reserved.map((row) => row.nftAddress)).size },
    candidate: manifest.candidate, baseline: manifest.baseline, bootstrapPremiumMaleImprovement: bootstrap, ...decision,
    attempts: rows.map((row) => ({ eventId: row.sale.eventId, username: row.sale.username, nftAddress: row.sale.nftAddress,
      eventTime: row.sale.eventTime, actualUsd: row.sale.priceUsd, priorSecondaryEvidence: row.priorSecondaryEvidence,
      baseline: row.baseline, candidate: row.candidate })),
    limitations: ["This one-time report exposes the reserved labels; they are development-only after evaluation.",
      "The result qualifies only contract-verified completed secondary resale, not private offers or active auctions.",
      "No competitor was evaluated under the same inputs, so this report cannot support a best-in-market claim."] };
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
  console.log(JSON.stringify({ output: path.basename(output), sha256: fileHash(output), passed: report.passed,
    sources: report.sources, premiumUniqueIdentities: report.premiumUniqueIdentities,
    premiumWeeklyBlocks: report.premiumWeeklyBlocks, bootstrap, gates: report.gates, cohorts: report.cohorts, paired: report.paired }, null, 2));
}

module.exports = { clusteredBootstrapImprovement, cohortSummaries, evaluateStreams, evidenceBefore, gateResults, weeklyBlock };
if (require.main === module) main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
