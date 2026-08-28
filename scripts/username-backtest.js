"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { backtestTelegramUsernameSales } = require("../lib/username-backtest");
const { createValuationLedgerClient } = require("../lib/valuation-ledger-client");

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
    const page = await ledger.readSales("username", cursor, Math.min(5_000, limit - rows.length));
    rows.push(...(page.records || []));
    cursor = page.nextCursor;
  } while (cursor && rows.length < limit);
  return rows.map((row) => ({
    eventId: row.sale_id,
    username: row.normalized_name,
    eventTime: new Date(Number(row.sold_at) * 1000).toISOString(),
    priceUsd: Number(row.price_usd),
    paymentAsset: "GRAM",
    eventType: "sale",
    finalized: true,
    cancelled: false,
    reliabilityScore: Number(row.reliability_score) || 1,
    knowledge: row.semantic_json || {},
  }));
}

function applyKnowledge(rows) {
  const cachePath = path.join(__dirname, "..", "data", "username-knowledge-cache.json");
  let cache = {};
  if (fs.existsSync(cachePath)) {
    try { cache = JSON.parse(fs.readFileSync(cachePath, "utf8")); } catch { cache = {}; }
  }
  return rows.map((row) => {
    let current = row.knowledge;
    if (typeof current === "string") {
      try { current = JSON.parse(current); } catch { current = {}; }
    }
    if (!current || typeof current !== "object") current = {};
    return {
      ...row,
      knowledge: Object.keys(current).length ? current : (cache[String(row.username || "").toLowerCase()] || {}),
    };
  });
}

async function main() {
  const rows = await readSales(Math.max(100, Number(process.env.USERNAME_BACKTEST_MAX_SALES || 20_000)));
  const enriched = applyKnowledge(rows);
  const summary = backtestTelegramUsernameSales(enriched, {
    maxEvaluations: Math.max(1, Number(process.env.USERNAME_BACKTEST_MAX_EVALUATIONS || 500)),
    maxHistory: Math.max(1, Number(process.env.USERNAME_BACKTEST_MAX_HISTORY || 1_500)),
  });
  console.log(JSON.stringify({
    source: "compact-d1",
    sales: rows.length,
    attempted: summary.attempted,
    evaluated: summary.evaluated,
    abstained: summary.abstained,
    medianFactorError: summary.medianFactorError,
    coverage: summary.coverage,
    byRoute: summary.byRoute,
    byConfidence: summary.byConfidence,
    byPriceBand: summary.byPriceBand,
    bySemanticCategory: summary.bySemanticCategory,
    preparedKnowledgeCoverage: summary.preparedKnowledgeCoverage,
    byPreparedKnowledgeSignal: summary.byPreparedKnowledgeSignal,
    byOwnSaleHistory: summary.byOwnSaleHistory,
    byStructuralCohort: summary.byStructuralCohort,
    premiumCalibration: summary.premiumCalibration,
    largestMisses: summary.largestMisses,
  }, null, 2));
}

if (require.main === module) {
  loadLocalEnv();
  main().catch((error) => { console.error(error.stack || error.message); process.exit(1); });
}

module.exports = { applyKnowledge, loadLocalEnv, main, readSales };
