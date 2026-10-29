"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const sha256 = bytes => crypto.createHash("sha256").update(bytes).digest("hex");

function quantile(sorted, fraction) {
  if (!sorted.length) return null;
  const index = (sorted.length - 1) * fraction;
  const lower = Math.floor(index), upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function summarize(rows) {
  const statusCounts = {};
  for (const row of rows) statusCounts[row.status] = (statusCounts[row.status] || 0) + 1;
  const covered = rows.filter(row => row.status === "prior-bids-observed" && row.bids.length);
  const comparisons = covered.map(row => {
    const latestBid = row.bids.reduce((latest, bid) => Date.parse(bid.eventTime) > Date.parse(latest.eventTime) ? bid : latest);
    const ratio = latestBid.priceNative / row.priceNative;
    return {
      eventId: row.eventId,
      username: row.username,
      eventTime: row.eventTime,
      actualUsd: row.actualUsd,
      saleNative: row.priceNative,
      latestPriorBidNative: latestBid.priceNative,
      latestPriorBidTime: latestBid.eventTime,
      leadHours: (Date.parse(row.eventTime) - Date.parse(latestBid.eventTime)) / 36e5,
      bidToSaleRatio: ratio,
      factorError: Math.max(ratio, 1 / ratio),
      exactNativeMatch: latestBid.priceNative === row.priceNative,
      matchingPublicSale: row.matchingPublicSale
    };
  });
  const factors = comparisons.map(row => row.factorError).sort((a, b) => a - b);
  const leads = comparisons.map(row => row.leadHours).sort((a, b) => a - b);
  const baselineErrors = rows.filter(row => row.baseUsd > 0 && row.actualUsd > 0).map(row => ({
    covered: row.status === "prior-bids-observed" && row.bids.length > 0,
    error: Math.abs(Math.log(row.baseUsd / row.actualUsd))
  }));
  const totalBaselineError = baselineErrors.reduce((sum, row) => sum + row.error, 0);
  const coveredBaselineError = baselineErrors.filter(row => row.covered).reduce((sum, row) => sum + row.error, 0);
  return {
    attempted: rows.length,
    statusCounts,
    matchingPublicSale: rows.filter(row => row.matchingPublicSale).length,
    priorBidCovered: covered.length,
    priorBidCoverageRate: rows.length ? covered.length / rows.length : null,
    exactNativeMatches: comparisons.filter(row => row.exactNativeMatch).length,
    exactNativeMatchRateAmongCovered: comparisons.length ? comparisons.filter(row => row.exactNativeMatch).length / comparisons.length : null,
    medianFactorErrorAmongCovered: quantile(factors, 0.5),
    p90FactorErrorAmongCovered: quantile(factors, 0.9),
    medianLeadHours: quantile(leads, 0.5),
    p90LeadHours: quantile(leads, 0.9),
    baselineAbsoluteLogErrorShareAmongCovered: totalBaselineError ? coveredBaselineError / totalBaselineError : null,
    maximumBaselineMaleImprovementIfCoveredWerePerfect: totalBaselineError ? coveredBaselineError / totalBaselineError : null,
    comparisons
  };
}

function analyze(manifest, auditRows, sourceRows) {
  const source = new Map(sourceRows.map(row => [row.eventId, row]));
  if (source.size !== sourceRows.length) throw new Error("Duplicate source eventId");
  const audit = new Map();
  for (const row of auditRows) {
    if (audit.has(row.eventId)) throw new Error(`Duplicate audit eventId: ${row.eventId}`);
    if (!manifest.eventIds.includes(row.eventId)) throw new Error(`Unexpected audit eventId: ${row.eventId}`);
    const target = source.get(row.eventId);
    if (!target) throw new Error(`Missing source eventId: ${row.eventId}`);
    if (row.username !== target.username || row.nftAddress !== target.nftAddress || Date.parse(row.eventTime) !== Date.parse(target.eventTime)) {
      throw new Error(`Audit/source identity mismatch: ${row.eventId}`);
    }
    for (const bid of row.bids || []) {
      if (bid.eventType !== "bid" || !(Date.parse(bid.eventTime) < Date.parse(row.eventTime)) || !(bid.priceNative > 0)) {
        throw new Error(`Invalid prior bid: ${row.eventId}`);
      }
    }
    audit.set(row.eventId, {...target, ...row, bids: row.bids || []});
  }
  if (audit.size !== manifest.eventIds.length) throw new Error(`Incomplete audit: ${audit.size}/${manifest.eventIds.length}`);
  const rows = manifest.eventIds.map(eventId => audit.get(eventId));
  const strata = {};
  for (const name of ["premium-all", "ordinary-control"]) strata[name] = summarize(rows.filter(row => row.stratum === name));
  return {overall: summarize(rows), strata};
}

if (require.main === module) {
  const dataDir = path.resolve(__dirname, "../research/telegram-usernames/data");
  const files = {
    manifest: path.join(dataDir, "username-development-bids-expanded-2026-09-19.manifest.json"),
    audit: path.join(dataDir, "username-development-bids-expanded-2026-09-19.jsonl"),
    source: path.join(dataDir, "username-market-stage-development-2026-09-09.json")
  };
  const bytes = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file)]));
  const manifest = JSON.parse(bytes.manifest);
  const auditRows = bytes.audit.toString("utf8").trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  const sourceRows = JSON.parse(bytes.source).rows;
  const result = analyze(manifest, auditRows, sourceRows);
  const report = {
    qualification: false,
    developmentOnly: true,
    productionChanged: false,
    interpretation: "Coverage and strictly pre-sale bid agreement for public Fragment pages. This is active-auction evidence, not validated inactive-resale valuation accuracy.",
    selectionPolicy: manifest.policy,
    inputs: Object.fromEntries(Object.entries(bytes).map(([key, value]) => [key, {sha256: sha256(value)}])),
    ...result
  };
  const outputIndex = process.argv.indexOf("--output");
  if (outputIndex < 0 || !process.argv[outputIndex + 1]) throw new Error("--output required");
  fs.writeFileSync(path.resolve(process.argv[outputIndex + 1]), JSON.stringify(report, null, 2) + "\n", {flag: "wx"});
  console.log(JSON.stringify({...report, overall: {...report.overall, comparisons: undefined}, strata: Object.fromEntries(Object.entries(report.strata).map(([key, value]) => [key, {...value, comparisons: undefined}]))}, null, 2));
}

module.exports = {analyze, summarize};
