"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { loadHistoricalSales } = require("./evaluate-username-rebuild");
const { backtestTelegramUsernameSales } = require("../lib/username-backtest");
const { cohortSummaries, clusteredBootstrapImprovement, gateResults } = require("./evaluate-username-secondary-qualification");
const { bidOverlay, horizonRows } = require("./evaluate-username-forward-v2-qualification");
const { loadTargets } = require("./collect-username-forward-v3-lifecycles");

const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const fileHash = (file) => hash(fs.readFileSync(file));
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

function blockFor(eventTime, blocks) {
  const time = Date.parse(eventTime);
  const block = blocks.find((item) => time >= Date.parse(item.from) && time < Date.parse(item.until));
  if (!block) throw new Error(`Sale outside selected forward-v3 blocks: ${eventTime}`);
  return `${block.from}/${block.until}`;
}

function blockSummaries(rows, manifest) {
  return Object.fromEntries(manifest.blocks.map((block) => {
    const key = `${block.from}/${block.until}`;
    const selected = rows.filter((row) => blockFor(row.sale.eventTime, manifest.blocks) === key);
    return [key, { attempts: selected.length,
      premiumUniqueIdentities: new Set(selected.filter((row) => row.sale.priceUsd >= manifest.gates.premiumThresholdUsd)
        .map((row) => row.sale.nftAddress)).size,
      cohorts: cohortSummaries(selected, manifest.gates.premiumThresholdUsd) }];
  }));
}

function loadSealedSales(root, manifest) {
  return loadTargets(root, manifest).map((target) => {
    if (!(target.actualUsd > 0) || !(target.historicalUsdRate > 0))
      throw new Error(`Invalid sealed sale: ${target.eventId}`);
    blockFor(target.eventTime, manifest.blocks);
    return { username: target.username, nftAddress: target.nftAddress, eventId: target.eventId,
      eventTime: target.eventTime, priceUsd: target.actualUsd, priceGram: target.priceNative,
      historicalUsdRate: target.historicalUsdRate, eventType: "sale", finalized: true,
      paymentAsset: "GRAM", marketplace: "Fragment", source: "toncenter-telemint-settlement", reliabilityScore: 1 };
  }).sort((a, b) => Date.parse(a.eventTime) - Date.parse(b.eventTime) || a.eventId.localeCompare(b.eventId));
}

async function main() {
  const repo = path.resolve(__dirname, "..");
  const root = path.join(repo, "research/telegram-usernames/data");
  const manifestFile = path.join(root, "username-forward-v3-qualification-final-manifest.json");
  const lifecycleFile = path.join(root, "username-forward-v3-lifecycles.jsonl");
  const output = path.join(root, "username-forward-v3-qualification-result.json");
  if (fs.existsSync(output)) throw new Error("Forward-v3 qualification has already run");
  const manifest = readJson(manifestFile);
  if (!manifest.sealedBeforeOutcomeLabelsOpened || manifest.blocks?.length !== 3)
    throw new Error("Final pre-label manifest missing");
  const protocolFile = path.join(root, manifest.evaluationProtocol?.file || "");
  if (!manifest.evaluationProtocol?.file || fileHash(protocolFile) !== manifest.evaluationProtocol.sha256)
    throw new Error("Frozen evaluation protocol missing or changed");
  const protocol = readJson(protocolFile);
  if (protocol.reservationSha256 !== manifest.reservation.sha256)
    throw new Error("Frozen reservation lineage changed");
  for (const [name, expected] of Object.entries({ ...protocol.frozenFiles,
    ...manifest.candidate.files, ...manifest.trainingSources })) {
    if (fileHash(path.join(repo, name)) !== expected) throw new Error(`Frozen file changed: ${name}`);
  }
  const sales = loadSealedSales(root, manifest);
  const lifecycles = fs.readFileSync(lifecycleFile, "utf8").trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
  const lifecycleById = new Map(lifecycles.map((row) => [row.eventId, row]));
  if (lifecycles.length !== sales.length || lifecycleById.size !== sales.length)
    throw new Error("Not every sealed case has one lifecycle attempt");
  for (const sale of sales) {
    const lifecycle = lifecycleById.get(sale.eventId);
    if (!lifecycle || lifecycle.nftAddress !== sale.nftAddress || lifecycle.eventTime !== sale.eventTime
      || lifecycle.actualUsd !== sale.priceUsd)
      throw new Error(`Lifecycle identity/label mismatch: ${sale.eventId}`);
  }
  const historical = await loadHistoricalSales(undefined, { fingerprint: true });
  const baseline = backtestTelegramUsernameSales([...historical.sales, ...sales], {
    evaluationFrom: manifest.blocks[0].from, evaluationUntil: manifest.blocks.at(-1).until,
    maxEvaluations: sales.length, evaluationStride: 1, maxHistory: manifest.candidate.maxHistory,
    modelRefreshInterval: 50,
  });
  const selectedIds = new Set(sales.map((sale) => sale.eventId));
  const attemptedIds = baseline.evaluationCases.map((row) => row.eventId);
  if (attemptedIds.length !== sales.length || new Set(attemptedIds).size !== sales.length
    || attemptedIds.some((id) => !selectedIds.has(id)))
    throw new Error("Baseline did not attempt exactly the sealed v3 cases");
  const baselineById = new Map(baseline.results.map((row) => [row.sale.eventId, row]));
  if (baselineById.size !== baseline.results.length) throw new Error("Duplicate baseline event ID");
  const horizons = Object.fromEntries(manifest.candidate.horizonsHours.map((hours) => {
    const rows = horizonRows(sales, baselineById, lifecycleById, hours);
    const premium = rows.filter((row) => row.sale.priceUsd >= manifest.gates.premiumThresholdUsd);
    const bootstrap = clusteredBootstrapImprovement(premium);
    const decision = gateResults(rows, manifest, bootstrap);
    return [String(hours), { hoursBeforeClose: hours, ...decision,
      bootstrapPremiumMaleImprovement: bootstrap,
      blocks: blockSummaries(rows, manifest),
      availability: { overall: rows.filter((row) => row.activeAuctionOverlay).length,
        premium: premium.filter((row) => row.activeAuctionOverlay).length },
      cases: rows.map((row) => ({ eventId: row.sale.eventId, nftAddress: row.sale.nftAddress,
        block: blockFor(row.sale.eventTime, manifest.blocks), actualUsd: row.sale.priceUsd,
        lifecycleStatus: row.lifecycleStatus, baselineAvailable: row.baseline.available,
        candidateAvailable: row.candidate.available, activeAuctionOverlay: row.activeAuctionOverlay,
        baselineFactorError: row.baseline.factorError, candidateFactorError: row.candidate.factorError })) }];
  }));
  const report = { schemaVersion: "username-forward-v3-qualification-result-v1", qualification: true,
    passed: Object.values(horizons).some((row) => row.passed), evaluatedAt: new Date().toISOString(),
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
      "Each weekly block covers at most its first 48 hours; gaps are not evaluation cases.",
      "Uncovered cases and lifecycle failures remain in every cohort denominator.",
      "Historical event-day GRAM/USD is shared by bid and settlement; native-GRAM error is tested, not intraday FX forecasting.",
      "No competitor estimator comparison is established by this report.",
      "After this one-time report, the sealed outcome labels become development-only.",
    ] };
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
  console.log(JSON.stringify({ output: path.basename(output), sha256: fileHash(output), passed: report.passed,
    sources: report.sources, lifecycleCoverage: report.lifecycleCoverage,
    horizons: Object.fromEntries(Object.entries(horizons).map(([key, row]) => [key, {
      passed: row.passed, gates: row.gates, premiumUniqueIdentities: row.premiumUniqueIdentities,
      premiumWeeklyBlocks: row.premiumWeeklyBlocks }])) }, null, 2));
}

if (require.main === module) main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
module.exports = { blockFor, blockSummaries, loadSealedSales, bidOverlay };
