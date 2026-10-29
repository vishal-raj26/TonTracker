"use strict";

// Exposed historical development only. Realized venue is a diagnostic label,
// never an input available to a pre-sale or inactive-wallet estimate.
const fs = require("node:fs");
const path = require("node:path");
const { readCsv } = require("./evaluate-username-rebuild");
const { sha256 } = require("./audit-username-evaluation-exposure");

const SOURCE_SHA256 = "6d724b74f727a797d553190cb72e408d3c70d6069202636a60f7ea2b2850682f";
const PREDICTIONS_SHA256 = "96a5712520ec002cb2f54b0c8836a9036b4741f73213ca14e84fa1a97d9abab4";

function cohort(usd) {
  if (!Number.isFinite(usd) || usd <= 0) throw new Error("Invalid historical USD label");
  return usd >= 500 ? "premium" : usd >= 100 ? "intermediate" : "ordinary";
}

function quarter(seconds) {
  const time = Number(seconds);
  if (!Number.isFinite(time) || time <= 0) throw new Error("Invalid historical timestamp");
  const date = new Date(time * 1000);
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid historical date");
  return `${date.getUTCFullYear()}Q${Math.floor(date.getUTCMonth() / 3) + 1}`;
}

function pointMetrics(rows, key) {
  if (!rows.length) return { samples: 0 };
  const errors = rows.map(row => {
    const estimate = Number(row[key]?.estimateUsd);
    if (!Number.isFinite(estimate) || estimate <= 0) throw new Error(`Invalid ${key} estimate`);
    return Math.abs(Math.log(estimate / row.actualUsd));
  }).sort((a, b) => a - b);
  return {
    samples: rows.length,
    meanAbsoluteLogError: errors.reduce((sum, value) => sum + value, 0) / rows.length,
    medianFactorError: Math.exp(errors[Math.floor(errors.length / 2)]),
  };
}

function denseIntervals(rows) {
  if (!rows.length) return { samples: 0 };
  let covered = 0, score = 0;
  for (const row of rows) {
    const { lowerUsd, upperUsd } = row.dense;
    if (![lowerUsd, upperUsd].every(value => Number.isFinite(value) && value > 0) || lowerUsd > upperUsd)
      throw new Error("Invalid dense interval");
    const actual = Math.log(row.actualUsd), lower = Math.log(lowerUsd), upper = Math.log(upperUsd);
    covered += Number(lower <= actual && actual <= upper);
    score += upper - lower + 10 * Math.max(lower - actual, 0) + 10 * Math.max(actual - upper, 0);
  }
  return { samples: rows.length, coverage: covered / rows.length, meanLogIntervalScore: score / rows.length };
}

function summarize(rows) {
  return {
    attempts: rows.length,
    uniqueIdentities: new Set(rows.map(row => row.nftAddress)).size,
    baseline: pointMetrics(rows, "baseline"),
    globalFusion: pointMetrics(rows, "globalFusion"),
    dense: { ...pointMetrics(rows, "dense"), interval: denseIntervals(rows) },
  };
}

async function main() {
  const root = path.resolve(__dirname, "../research/telegram-usernames/data");
  const sourcePath = path.join(root, "dune_username_sales.part");
  const predictionPath = path.join(root, "username-broad-density-development-2026-09-09.json");
  if (await sha256(sourcePath) !== SOURCE_SHA256 || await sha256(predictionPath) !== PREDICTIONS_SHA256)
    throw new Error("Exposed development source changed");
  const saved = JSON.parse(fs.readFileSync(predictionPath, "utf8"));
  const predictions = new Map(saved.results.map(row => [row.eventId, row]));
  if (predictions.size !== saved.results.length) throw new Error("Duplicate saved evaluation event");
  const matched = new Set(), allIds = new Set(), full = new Map(), byVenue = new Map();
  const secondaryPremiumByQuarter = new Map();
  let sourceRows = 0;
  await readCsv(sourcePath, row => {
    const actualUsd = Number(row.price_usd);
    const band = cohort(actualUsd);
    const venue = `${row.market_stage}/${row.sale_type}`;
    if (!["primary/auction", "secondary/auction", "secondary/sale"].includes(venue))
      throw new Error(`Unexpected sale venue ${venue}`);
    const id = `${row.nft_item_address}:${row.sale_timestamp}:${row.price_native}`;
    if (allIds.has(id)) throw new Error("Duplicate historical economic event");
    allIds.add(id);
    sourceRows++;
    const key = `${venue}/${band}`;
    const count = full.get(key) || { sales: 0, identities: new Set(), withTransactionHash: 0 };
    count.sales++;
    count.identities.add(row.nft_item_address);
    count.withTransactionHash += Number(Boolean(row.tx_hash && row.tx_hash !== "<nil>"));
    full.set(key, count);
    if (venue.startsWith("secondary/") && band === "premium") {
      const period = quarter(row.sale_timestamp);
      const q = secondaryPremiumByQuarter.get(period) || { sales: 0, identities: new Set() };
      q.sales++;
      q.identities.add(row.nft_item_address);
      secondaryPremiumByQuarter.set(period, q);
    }
    const candidate = predictions.get(id);
    if (!candidate) return;
    if (matched.has(id) || candidate.actualUsd !== actualUsd || candidate.nftAddress !== row.nft_item_address)
      throw new Error("Saved prediction identity or label mismatch");
    matched.add(id);
    const cases = byVenue.get(key) || [];
    cases.push(candidate);
    byVenue.set(key, cases);
  });
  if (await sha256(sourcePath) !== SOURCE_SHA256 || matched.size !== predictions.size)
    throw new Error("Historical source changed or saved predictions were not fully joined");
  const counts = Object.fromEntries([...full].sort().map(([key, item]) =>
    [key, { sales: item.sales, uniqueIdentities: item.identities.size, withTransactionHash: item.withTransactionHash }]));
  const quarters = Object.fromEntries([...secondaryPremiumByQuarter].sort().map(([key, item]) =>
    [key, { sales: item.sales, uniqueIdentities: item.identities.size }]));
  const diagnostic = Object.fromEntries([...byVenue].sort().map(([key, cases]) => [key, summarize(cases)]));
  const report = {
    qualification: false, reservedLabelsOpened: false, sourceSha256: SOURCE_SHA256,
    predictionsSha256: PREDICTIONS_SHA256, sourceRows, matchedDevelopmentAttempts: matched.size,
    limitation: "Realized venue is outcome metadata, not a permissible target feature. Historical Dune export ends July 2025; transaction-hash absence is not itself a disproof of an indexed sale. This is an exposed-sample diagnostic, not a current-market or production qualification.",
    fullHistoricalCounts: counts, secondaryPremiumByQuarter: quarters, savedCandidateErrorsByVenue: diagnostic,
  };
  const index = process.argv.indexOf("--output");
  if (index < 0 || !process.argv[index + 1]) throw new Error("--output required");
  fs.writeFileSync(path.resolve(process.argv[index + 1]), JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ sourceRows, matchedDevelopmentAttempts: matched.size, secondaryPremiumByQuarter: quarters, savedCandidateErrorsByVenue: diagnostic }, null, 2));
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { cohort, quarter, pointMetrics, denseIntervals, summarize };
