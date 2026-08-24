#!/usr/bin/env node
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { temporalBacktest } = require("../lib/dns-backtest");
const { createValuationLedgerClient } = require("../lib/valuation-ledger-client");
const { DNS_ESTIMATOR_VERSION } = require("../lib/dns-engine");

function loadLocalEnv() {
  const envPath = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  }
}

async function readSales(limit = 20_000) {
  const ledger = createValuationLedgerClient();
  const rows = [];
  let cursor = null;
  do {
    const page = await ledger.readSales("dns", cursor, Math.min(5_000, limit - rows.length));
    rows.push(...(page.records || []));
    cursor = page.nextCursor;
  } while (cursor && rows.length < limit);
  return rows.map((row) => ({
    eventId: row.sale_id,
    nftAddress: row.asset_key,
    domain: row.normalized_name,
    eventTime: new Date(Number(row.sold_at) * 1000).toISOString(),
    priceGram: Number(row.price_gram),
  })).reverse();
}

loadLocalEnv();
async function main() {
  const rows = await readSales(Math.max(100, Number(process.env.DNS_BACKTEST_MAX_SALES || 20_000)));
  const report = temporalBacktest(rows, {
    minTraining: Number(process.env.DNS_BACKTEST_MIN_TRAINING || 100),
    minimumSamples: Number(process.env.DNS_BACKTEST_MIN_SAMPLES || 100),
    maximumMedianAbsoluteLogError: Number(process.env.DNS_BACKTEST_MAX_MEDIAN_LOG_ERROR || Math.log(2)),
    minimumIntervalCoverage: Number(process.env.DNS_BACKTEST_MIN_INTERVAL_COVERAGE || 0.6),
    // Keep the routine D1 quality gate inexpensive; deeper offline runs can
    // explicitly raise these environment overrides.
    maxEvaluations: Number(process.env.DNS_BACKTEST_MAX_EVALUATIONS || 150),
    maxHistory: Number(process.env.DNS_BACKTEST_MAX_HISTORY || 400),
  });
  const output = JSON.stringify({ generatedAt: new Date().toISOString(), source: "compact-d1", sales: rows.length, estimatorVersion: DNS_ESTIMATOR_VERSION, ...report, results: undefined }, null, 2);
  const target = process.argv[2];
  if (target) fs.writeFileSync(target, output);
  console.log(output);
  if (!report.passed) process.exitCode = 2;
}
if (require.main === module) main().catch((error) => { console.error(`[dns-backtest] ${error.stack || error.message}`); process.exitCode = 1; });
module.exports = { main, readSales };
