"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { loadHistoricalSales } = require("./evaluate-username-rebuild");
const { backtestTelegramUsernameSales, summarize } = require("../lib/username-backtest");
const { quoteUsernameActiveAuction } = require("../lib/username-active-auction-nowcast");

const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const fileHash = (file) => hash(fs.readFileSync(file));
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

function saleRecord(sale, qualificationBlock) {
  return {
    username: sale.normalizedName,
    nftAddress: sale.assetKey,
    eventId: sale.saleId,
    eventTime: sale.soldAt,
    priceUsd: Number(sale.priceUsd),
    priceGram: Number(sale.priceGram),
    historicalUsdRate: Number(sale.historicalUsdRate),
    eventType: "sale",
    finalized: true,
    paymentAsset: "GRAM",
    marketplace: sale.marketplace,
    source: sale.source,
    reliabilityScore: Number(sale.reliabilityScore),
    qualificationBlock,
  };
}

function loadPages(dir, block, expectedCount) {
  const rows = [];
  const seen = new Set();
  for (const page of block.pageHashes || block.pages) {
    const file = path.join(dir, block.directory, page.name);
    if (fileHash(file) !== page.sha256) throw new Error(`Frozen page changed: ${block.directory}/${page.name}`);
    for (const sale of readJson(file).sales || []) {
      if (seen.has(sale.saleId)) continue;
      seen.add(sale.saleId);
      rows.push(saleRecord(sale, block.directory));
    }
  }
  if (rows.length !== expectedCount) throw new Error(`Event count changed for ${block.directory}: ${rows.length}`);
  return rows;
}

function factorError(predicted, actual) {
  return predicted > 0 && actual > 0 ? Math.max(predicted / actual, actual / predicted) : null;
}

function overlayRow(row, lifecycle, horizonHours) {
  if (lifecycle?.status !== "verified-bid-lifecycle" || !Array.isArray(lifecycle.bids)) return row;
  const endMs = Date.parse(row.sale.eventTime);
  const quoteMs = endMs - horizonHours * 36e5;
  const bid = lifecycle.bids
    .filter((item) => Date.parse(item.eventTime) <= quoteMs && BigInt(item.amountNano || 0) > 0n)
    .sort((left, right) => Date.parse(left.eventTime) - Date.parse(right.eventTime)).at(-1);
  if (!bid) return row;
  const bidGram = Number(BigInt(bid.amountNano)) / 1e9;
  const prediction = quoteUsernameActiveAuction({
    schemaVersion: "username-verified-auction-state-v1",
    status: "active",
    identityVerified: true,
    independentlyConfirmed: true,
    nowcastEligible: true,
    portfolioEligible: false,
    username: row.sale.username,
    nftAddress: row.sale.nftAddress,
    currentBidGram: bidGram,
    observedAt: new Date(quoteMs).toISOString(),
    staleAt: new Date(quoteMs + 60_000).toISOString(),
    endTime: row.sale.eventTime,
  }, { gramUsdRate: row.sale.historicalUsdRate, now: quoteMs });
  if (prediction.status !== "active-auction-nowcast") return row;
  return {
    ...row,
    prediction: { ...row.prediction, ...prediction, source: "verified-chain-bid" },
    factorError: factorError(prediction.estimateUsd, Number(row.sale.priceUsd)),
    insideRange: Number(row.sale.priceUsd) >= prediction.rangeLowUsd && Number(row.sale.priceUsd) <= prediction.rangeHighUsd,
    activeAuctionOverlay: true,
    quoteBid: bid,
  };
}

function cohorts(rows, premiumThresholdUsd) {
  return {
    overall: summarize(rows),
    ordinary: summarize(rows.filter((row) => Number(row.sale.priceUsd) < 100)),
    intermediate: summarize(rows.filter((row) => Number(row.sale.priceUsd) >= 100 && Number(row.sale.priceUsd) < premiumThresholdUsd)),
    premium: summarize(rows.filter((row) => Number(row.sale.priceUsd) >= premiumThresholdUsd)),
  };
}

function relativeImprovement(baseline, candidate) {
  return Number.isFinite(baseline) && baseline > 0 && Number.isFinite(candidate) ? (baseline - candidate) / baseline : null;
}

async function main() {
  const repo = path.resolve(__dirname, "..");
  const dir = path.join(repo, "research/telegram-usernames/data");
  const manifestFile = path.join(dir, "username-late-qualification-manifest-2026-09-20.json");
  const lifecycleFile = path.join(dir, "username-late-lifecycles-2026-09-20.jsonl");
  const earlyAuditFile = path.join(dir, "username-reserved-integrity-2026-09-19-final.json");
  const output = path.join(dir, "username-late-qualification-result-2026-09-20.json");
  if (fs.existsSync(output)) throw new Error("Late qualification report already exists");
  const manifest = readJson(manifestFile);

  for (const [name, expected] of Object.entries(manifest.candidate.files)) {
    if (fileHash(path.join(repo, name)) !== expected) throw new Error(`Frozen candidate changed: ${name}`);
  }
  if (fileHash(path.join(dir, "dune_username_sales.part")) !== manifest.trainingSources.historicalSalesSha256
    || fileHash(path.join(dir, "tonapi_username_universe.csv")) !== manifest.trainingSources.inventorySha256
    || fileHash(earlyAuditFile) !== manifest.trainingSources.earlyIntegritySha256) {
    throw new Error("Frozen training source changed");
  }
  const lifecycleHash = fileHash(lifecycleFile);
  const lifecycles = fs.readFileSync(lifecycleFile, "utf8").trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
  if (lifecycles.length !== manifest.holdout.uniqueEvents) throw new Error(`Lifecycle count changed: ${lifecycles.length}`);
  const lifecycleByEvent = new Map(lifecycles.map((row) => [row.eventId, row]));
  if (lifecycleByEvent.size !== lifecycles.length) throw new Error("Duplicate lifecycle event IDs");

  const holdout = loadPages(dir, manifest.holdout, manifest.holdout.uniqueEvents);
  const earlyAudit = readJson(earlyAuditFile);
  const early = earlyAudit.directories.flatMap((block) => loadPages(dir, block, block.uniqueEvents));
  const historical = await loadHistoricalSales(undefined, { fingerprint: true });
  const result = backtestTelegramUsernameSales([...historical.sales, ...early, ...holdout], {
    evaluationFrom: manifest.holdout.fromInclusive,
    evaluationUntil: manifest.holdout.untilExclusive,
    maxEvaluations: holdout.length,
    evaluationStride: 1,
    maxHistory: manifest.candidate.maxHistory,
    modelRefreshInterval: 50,
  });
  if (result.attempted !== holdout.length || result.results.length !== holdout.length) {
    throw new Error(`Baseline coverage changed: attempted ${result.attempted}, evaluated ${result.results.length}`);
  }

  const baseline = cohorts(result.results, manifest.gates.premiumThresholdUsd);
  const premiumIdentities = new Set(holdout.filter((row) => row.priceUsd >= manifest.gates.premiumThresholdUsd).map((row) => row.nftAddress));
  const horizons = Object.fromEntries(manifest.candidate.horizonsHours.map((hours) => {
    const rows = result.results.map((row) => overlayRow(row, lifecycleByEvent.get(row.sale.eventId), hours));
    const summary = cohorts(rows, manifest.gates.premiumThresholdUsd);
    const availability = {
      all: rows.filter((row) => row.activeAuctionOverlay).length,
      ordinary: rows.filter((row) => row.activeAuctionOverlay && row.sale.priceUsd < 100).length,
      intermediate: rows.filter((row) => row.activeAuctionOverlay && row.sale.priceUsd >= 100 && row.sale.priceUsd < manifest.gates.premiumThresholdUsd).length,
      premium: rows.filter((row) => row.activeAuctionOverlay && row.sale.priceUsd >= manifest.gates.premiumThresholdUsd).length,
    };
    const premiumMaleImprovement = relativeImprovement(baseline.premium.meanAbsoluteLogError, summary.premium.meanAbsoluteLogError);
    const ordinaryMaleRegression = -relativeImprovement(baseline.ordinary.meanAbsoluteLogError, summary.ordinary.meanAbsoluteLogError);
    const intermediateMaleRegression = -relativeImprovement(baseline.intermediate.meanAbsoluteLogError, summary.intermediate.meanAbsoluteLogError);
    const gates = {
      minimumPremiumIdentities: premiumIdentities.size >= manifest.gates.minimumPremiumUniqueIdentities,
      premiumMedian: summary.premium.medianFactorError != null && summary.premium.medianFactorError <= manifest.gates.premiumMedianFactorErrorMaximum,
      premiumMaleImprovementVsV25: premiumMaleImprovement != null && premiumMaleImprovement >= manifest.gates.premiumMaleImprovementVsV25Minimum,
      ordinaryRegressionVsV25: ordinaryMaleRegression != null && ordinaryMaleRegression <= manifest.gates.ordinaryAndIntermediateMaleRegressionMaximum,
      intermediateRegressionVsV25: intermediateMaleRegression != null && intermediateMaleRegression <= manifest.gates.ordinaryAndIntermediateMaleRegressionMaximum,
      overallIntervalCoverage: summary.overall.coverage >= manifest.gates.overallIntervalCoverageMinimum && summary.overall.coverage <= manifest.gates.overallIntervalCoverageMaximum,
      premiumIntervalCoverage: summary.premium.coverage >= manifest.gates.premiumIntervalCoverageMinimum,
    };
    return [String(hours), { hoursBeforeClose: hours, availability, premiumMaleImprovement, ordinaryMaleRegression, intermediateMaleRegression,
      passed: Object.values(gates).every(Boolean), gates, cohorts: summary }];
  }));

  const lifecycleCoverage = {
    attempted: lifecycles.length,
    verifiedWithBids: lifecycles.filter((row) => row.status === "verified-bid-lifecycle" && row.bids?.length).length,
    latestBidMatchesSale: lifecycles.filter((row) => row.latestBidMatchesSale).length,
    unavailable: lifecycles.filter((row) => row.status !== "verified-bid-lifecycle").length,
    fetchErrors: lifecycles.filter((row) => row.status === "fetch-error").length,
    parseErrors: lifecycles.filter((row) => row.status === "parse-error").length,
  };
  const report = {
    schemaVersion: "username-late-qualification-result-v1",
    qualification: true,
    passed: Object.values(horizons).some((row) => row.passed),
    evaluatedAt: new Date().toISOString(),
    manifest: path.basename(manifestFile),
    manifestSha256: fileHash(manifestFile),
    lifecycleFile: path.basename(lifecycleFile),
    lifecycleSha256: lifecycleHash,
    sources: { historicalSales: historical.sales.length, historicalRejected: historical.rejected, earlyEvents: early.length,
      holdoutEvents: holdout.length, holdoutUniqueIdentities: new Set(holdout.map((row) => row.nftAddress)).size, premiumUniqueIdentities: premiumIdentities.size },
    lifecycleCoverage,
    baselineV25: baseline,
    horizons,
    limitations: [
      "The active-auction candidate is never portfolio eligible and does not qualify inactive resale valuation.",
      "Uncovered auction states fall back to v25 and are retained in all aggregate metrics.",
      "Historical event-day GRAM/USD labels convert both bid and settlement; factor errors are therefore equivalent to native-GRAM errors, not an intraday FX test.",
      "The single non-monotonic decoded bid lifecycle remains a parse error and is not repaired.",
      "Late holdout labels are exposed by this one-time report and are development-only after evaluation.",
    ],
  };
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
  console.log(JSON.stringify({ output: path.basename(output), sha256: fileHash(output), passed: report.passed, sources: report.sources,
    lifecycleCoverage, baselineV25: baseline, horizons }, null, 2));
}

if (require.main === module) main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });

