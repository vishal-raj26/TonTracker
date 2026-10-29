"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { loadHistoricalSales } = require("./evaluate-username-rebuild");
const { backtestTelegramUsernameSales } = require("../lib/username-backtest");
const { quoteUsernameActiveAuction } = require("../lib/username-active-auction-nowcast");
const { cohortSummaries, clusteredBootstrapImprovement, gateResults, weeklyBlock } = require("./evaluate-username-secondary-qualification");
const { loadTargets } = require("./collect-username-forward-v2-lifecycles");

const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const fileHash = (file) => hash(fs.readFileSync(file));
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

function factorError(predicted, actual) {
  return predicted > 0 && actual > 0 ? Math.max(predicted / actual, actual / predicted) : null;
}

function variant(sale, prediction) {
  const available = Number(prediction?.estimateUsd) > 0 && prediction.status !== "unavailable";
  return { available, prediction: available ? prediction : null,
    factorError: available ? factorError(Number(prediction.estimateUsd), Number(sale.priceUsd)) : null,
    insideRange: available && Number(sale.priceUsd) >= Number(prediction.rangeLowUsd)
      && Number(sale.priceUsd) <= Number(prediction.rangeHighUsd) };
}

function bidOverlay(sale, lifecycle, hours) {
  if (lifecycle?.status !== "verified-bid-lifecycle" || !Array.isArray(lifecycle.bids)) return null;
  const quoteMs = Date.parse(sale.eventTime) - hours * 36e5;
  const bid = lifecycle.bids.filter((item) => Date.parse(item.eventTime) <= quoteMs && BigInt(item.amountNano || 0) > 0n)
    .sort((a, b) => Date.parse(a.eventTime) - Date.parse(b.eventTime)).at(-1);
  if (!bid) return null;
  const prediction = quoteUsernameActiveAuction({
    schemaVersion: "username-verified-auction-state-v1", status: "active",
    identityVerified: true, independentlyConfirmed: true, nowcastEligible: true, portfolioEligible: false,
    username: sale.username, nftAddress: sale.nftAddress,
    currentBidGram: Number(BigInt(bid.amountNano)) / 1e9,
    observedAt: new Date(quoteMs).toISOString(), staleAt: new Date(quoteMs + 60_000).toISOString(),
    endTime: sale.eventTime,
  }, { gramUsdRate: sale.historicalUsdRate, now: quoteMs });
  return prediction.status === "active-auction-nowcast" ? prediction : null;
}

function loadSealedSales(dir, manifest) {
  const targets = loadTargets(dir, manifest);
  return targets.map((target) => {
    if (!(target.actualUsd > 0) || !(target.historicalUsdRate > 0)) throw new Error(`Invalid sealed sale: ${target.eventId}`);
    return { username: target.username, nftAddress: target.nftAddress, eventId: target.eventId,
      eventTime: target.eventTime, priceUsd: target.actualUsd, priceGram: target.priceNative,
      historicalUsdRate: target.historicalUsdRate, eventType: "sale", finalized: true,
      paymentAsset: "GRAM", marketplace: "Fragment", source: "toncenter-telemint-settlement", reliabilityScore: 1 };
  }).sort((a, b) => Date.parse(a.eventTime) - Date.parse(b.eventTime) || a.eventId.localeCompare(b.eventId));
}

function horizonRows(sales, baselineById, lifecycleById, hours) {
  return sales.map((sale) => {
    const baseline = variant(sale, baselineById.get(sale.eventId)?.prediction);
    const overlay = bidOverlay(sale, lifecycleById.get(sale.eventId), hours);
    const candidate = variant(sale, overlay || baseline.prediction);
    return { sale, baseline, candidate, activeAuctionOverlay: Boolean(overlay),
      lifecycleStatus: lifecycleById.get(sale.eventId)?.status || "missing" };
  });
}

function weeklySummaries(rows, manifest) {
  const blocks = manifest.window.weeklyBlocks;
  return Object.fromEntries(blocks.slice(0, -1).map((from, index) => {
    const selected = rows.filter((row) => weeklyBlock(row.sale.eventTime, blocks) === `${from}/${blocks[index + 1]}`);
    return [`${from}/${blocks[index + 1]}`, { attempts: selected.length,
      premiumUniqueIdentities: new Set(selected.filter((row) => row.sale.priceUsd >= manifest.gates.premiumThresholdUsd)
        .map((row) => row.sale.nftAddress)).size,
      cohorts: cohortSummaries(selected, manifest.gates.premiumThresholdUsd) }];
  }));
}

async function main() {
  const repo = path.resolve(__dirname, "..");
  const dir = path.join(repo, "research/telegram-usernames/data");
  const manifestFile = path.join(dir, "username-forward-v2-qualification-final-manifest.json");
  const lifecycleFile = path.join(dir, "username-forward-v2-lifecycles.jsonl");
  const output = path.join(dir, "username-forward-v2-qualification-result.json");
  if (fs.existsSync(output)) throw new Error("Forward-v2 qualification has already run");
  const manifest = readJson(manifestFile);
  if (!manifest.sealedBeforeOutcomeLabelsOpened) throw new Error("Final pre-label manifest missing");
  const protocolFile = path.join(dir, manifest.evaluationProtocol?.file || "");
  if (!manifest.evaluationProtocol?.file || fileHash(protocolFile) !== manifest.evaluationProtocol.sha256) {
    throw new Error("Frozen evaluation protocol missing or changed");
  }
  const protocol = readJson(protocolFile);
  for (const [name, expected] of Object.entries(protocol.frozenFiles)) {
    if (fileHash(path.join(repo, name)) !== expected) throw new Error(`Frozen evaluation file changed: ${name}`);
  }
  for (const [name, expected] of Object.entries({ ...manifest.candidate.files, ...manifest.trainingSources })) {
    if (fileHash(path.join(repo, name)) !== expected) throw new Error(`Frozen file changed: ${name}`);
  }
  const sales = loadSealedSales(dir, manifest);
  const lifecycles = fs.readFileSync(lifecycleFile, "utf8").trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
  const lifecycleById = new Map(lifecycles.map((row) => [row.eventId, row]));
  if (lifecycles.length !== sales.length || lifecycleById.size !== sales.length) throw new Error("Not every sealed case has one lifecycle attempt");
  for (const sale of sales) {
    const lifecycle = lifecycleById.get(sale.eventId);
    if (!lifecycle || lifecycle.nftAddress !== sale.nftAddress || lifecycle.eventTime !== sale.eventTime
      || lifecycle.actualUsd !== sale.priceUsd) throw new Error(`Lifecycle identity/label mismatch: ${sale.eventId}`);
  }
  const historical = await loadHistoricalSales(undefined, { fingerprint: true });
  const baseline = backtestTelegramUsernameSales([...historical.sales, ...sales], {
    evaluationFrom: manifest.window.fromInclusive, evaluationUntil: manifest.window.untilExclusive,
    maxEvaluations: sales.length, evaluationStride: 1, maxHistory: manifest.candidate.maxHistory,
    modelRefreshInterval: 50,
  });
  const baselineById = new Map(baseline.results.map((row) => [row.sale.eventId, row]));
  if (baselineById.size !== baseline.results.length) throw new Error("Duplicate baseline event ID");
  const horizons = Object.fromEntries(manifest.candidate.horizonsHours.map((hours) => {
    const rows = horizonRows(sales, baselineById, lifecycleById, hours);
    const premium = rows.filter((row) => row.sale.priceUsd >= manifest.gates.premiumThresholdUsd);
    const bootstrap = clusteredBootstrapImprovement(premium);
    const decision = gateResults(rows, manifest, bootstrap);
    return [String(hours), { hoursBeforeClose: hours, ...decision, bootstrapPremiumMaleImprovement: bootstrap,
      weekly: weeklySummaries(rows, manifest),
      availability: { overall: rows.filter((row) => row.activeAuctionOverlay).length,
        premium: premium.filter((row) => row.activeAuctionOverlay).length },
      cases: rows.map((row) => ({ eventId: row.sale.eventId, nftAddress: row.sale.nftAddress,
        weeklyBlock: weeklyBlock(row.sale.eventTime, manifest.window.weeklyBlocks),
        actualUsd: row.sale.priceUsd, lifecycleStatus: row.lifecycleStatus,
        baselineAvailable: row.baseline.available, candidateAvailable: row.candidate.available,
        activeAuctionOverlay: row.activeAuctionOverlay,
        baselineFactorError: row.baseline.factorError, candidateFactorError: row.candidate.factorError })) }];
  }));
  const report = {
    schemaVersion: "username-forward-v2-qualification-result-v1", qualification: true,
    passed: Object.values(horizons).some((row) => row.passed),
    evaluatedAt: new Date().toISOString(),
    manifest: path.basename(manifestFile), manifestSha256: fileHash(manifestFile),
    lifecycleFile: path.basename(lifecycleFile), lifecycleSha256: fileHash(lifecycleFile),
    sources: { historicalSales: historical.sales.length, historicalRejected: historical.rejected,
      historicalHashes: historical.sourceHashes, sealedEvents: sales.length,
      sealedUniqueIdentities: new Set(sales.map((row) => row.nftAddress)).size,
      baselineAttempted: baseline.attempted, baselineEvaluated: baseline.evaluated,
      baselineAbstained: sales.length - baseline.evaluated },
    lifecycleCoverage: { attempted: lifecycles.length,
      verifiedWithBids: lifecycles.filter((row) => row.status === "verified-bid-lifecycle" && row.bids?.length).length,
      unavailable: lifecycles.filter((row) => row.status !== "verified-bid-lifecycle").length,
      fetchErrors: lifecycles.filter((row) => row.status === "fetch-error").length,
      parseErrors: lifecycles.filter((row) => row.status === "parse-error").length },
    horizons,
    limitations: [
      "This evaluates active-auction nowcasting, not inactive resale or wallet portfolio value.",
      "Uncovered cases and lifecycle failures remain in every cohort denominator.",
      "Historical event-day GRAM/USD is shared by bid and settlement; native-GRAM error is tested, not intraday FX forecasting.",
      "No competitor estimator comparison is established by this report.",
      "After this one-time report, the sealed outcome labels become development-only.",
    ],
  };
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
  console.log(JSON.stringify({ output: path.basename(output), sha256: fileHash(output), passed: report.passed,
    sources: report.sources, lifecycleCoverage: report.lifecycleCoverage,
    horizons: Object.fromEntries(Object.entries(horizons).map(([key, row]) => [key, {
      passed: row.passed, gates: row.gates, cohorts: row.cohorts,
      premiumUniqueIdentities: row.premiumUniqueIdentities,
      premiumWeeklyBlocks: row.premiumWeeklyBlocks, bootstrapPremiumMaleImprovement: row.bootstrapPremiumMaleImprovement }])) }, null, 2));
}

if (require.main === module) main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
module.exports = { bidOverlay, horizonRows, weeklySummaries };
