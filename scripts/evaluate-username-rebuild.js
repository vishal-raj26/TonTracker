"use strict";

// Read-only offline evaluation. No credentials, network, database writes or
// worker startup. Inventory supplies immutable NFT-name identity, never asks.
const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");
const { backtestTelegramUsernameSales } = require("../lib/username-backtest");
const { USERNAME_ESTIMATOR_VERSION, USERNAME_CALIBRATION_VERSION } = require("../lib/username-engine");
const { createHistoricalUsernameRetrieval } = require("../lib/username-historical-retrieval");
const { sha256 } = require("./audit-username-evaluation-exposure");

function csvFields(line) {
  const values = []; let value = ""; let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    if (line[i] === '"') {
      if (quoted && line[i + 1] === '"') { value += '"'; i += 1; } else quoted = !quoted;
    } else if (line[i] === "," && !quoted) { values.push(value); value = ""; }
    else value += line[i];
  }
  values.push(value); return values;
}
async function readCsv(file, visit) {
  const lines = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  let header;
  for await (const line of lines) {
    const fields = csvFields(line);
    if (!header) { header = fields; continue; }
    if (fields.length !== header.length) continue;
    visit(Object.fromEntries(header.map((key, i) => [key, fields[i]])));
  }
}
async function loadHistoricalSales(dir = path.join(__dirname, "../research/telegram-usernames/data"), options = {}) {
  const sourceFiles = ["dune_username_sales.part", "tonapi_username_universe.csv"];
  const sourceHashes = options.fingerprint ? Object.fromEntries(await Promise.all(sourceFiles.map(async file =>
    [file, await sha256(path.join(dir, file))]))) : undefined;
  const names = new Map();
  await readCsv(path.join(dir, "tonapi_username_universe.csv"), (row) => {
    const name = (row.username || row.dns.replace(/\.t\.me$/i, "")).toLowerCase();
    if (/^[a-z0-9_]{1,32}$/.test(name)) names.set(row.nft_address, name);
  });
  const sales = [];
  let rejected = 0;
  await readCsv(path.join(dir, "dune_username_sales.part"), (row) => {
    const username = names.get(row.nft_item_address);
    const time = Number(row.sale_timestamp) * 1000;
    const price = Number(row.price_usd);
    if (!username || !(price > 0) || !Number.isFinite(price) || !Number.isFinite(time)
      || (row.seller_address !== "<nil>" && row.seller_address && row.seller_address === row.buyer_address)) { rejected += 1; return; }
    sales.push({ username, nftAddress: row.nft_item_address, eventTime: new Date(time).toISOString(),
      priceUsd: price, priceGram: Number(row.price_native), eventType: "sale", finalized: true,
      paymentAsset: row.payment_asset, marketplace: row.marketplace_address, source: "Dune canonical export",
      // Preserve source distinctions for audits. They are realized-event
      // metadata, not target predictors unless independently known pre-cutoff.
      marketStage: row.market_stage || null, marketStageBasis: "seller-null-heuristic",
      saleType: row.sale_type || null,
      sellerAddress: row.seller_address && row.seller_address !== "<nil>" ? row.seller_address : null,
      buyerAddress: row.buyer_address && row.buyer_address !== "<nil>" ? row.buyer_address : null,
      transactionHash: row.tx_hash && row.tx_hash !== "<nil>" ? row.tx_hash : null,
      traceId: row.trace_id && row.trace_id !== "<nil>" ? row.trace_id : null,
      historicalUsdRate: Number.isFinite(Number(row.event_usd_rate)) && Number(row.event_usd_rate) > 0 ? Number(row.event_usd_rate) : null,
      historicalUsdRateResolution: "daily-source-label-not-intraday-quote",
      eventId: `${row.nft_item_address}:${row.sale_timestamp}:${row.price_native}`, reliabilityScore: 0.8 });
  });
  sales.sort((a, b) => Date.parse(a.eventTime) - Date.parse(b.eventTime));
  if (sourceHashes) for (const file of sourceFiles) {
    if (await sha256(path.join(dir, file)) !== sourceHashes[file]) throw new Error(`Historical source changed while loading: ${file}`);
  }
  return { sales, rejected, sourceHashes };
}
async function main() {
  if (process.env.USERNAME_BACKTEST_CONDITIONAL_CALIBRATION) throw new Error("Conditional calibration was retired after interval-score regression; unset USERNAME_BACKTEST_CONDITIONAL_CALIBRATION. See the checkpoint.");
  if (process.env.USERNAME_BACKTEST_SELECTION) throw new Error("Experimental selection was retired after held-out accuracy regressed; unset USERNAME_BACKTEST_SELECTION. See the rebuild checkpoint.");
  const { sales, rejected, sourceHashes } = await loadHistoricalSales(undefined, { fingerprint: true });
  const semanticVectors = process.env.USERNAME_BACKTEST_GLOVE === "1";
  if (semanticVectors && process.env.USERNAME_BACKTEST_WORDNET === "1") throw new Error("Choose one historical semantic snapshot per experiment.");
  const snapshot = semanticVectors ? require("./username-glove-snapshot").loadGloveSnapshot()
    : process.env.USERNAME_BACKTEST_WORDNET === "1" ? require("./username-wordnet-snapshot").loadWordnetSnapshot() : null;
  if (snapshot) for (const sale of sales) sale.knowledge = snapshot.knowledge(sale.username);
  const maxEvaluations = Number(process.env.USERNAME_BACKTEST_MAX_EVALUATIONS || 200);
  const evaluationStride = Math.max(1, Number(process.env.USERNAME_BACKTEST_STRIDE || 1));
  const maxHistory = Math.max(25, Number(process.env.USERNAME_BACKTEST_MAX_HISTORY || 1500));
  const historicalRetrieval = process.env.USERNAME_BACKTEST_RETRIEVAL === "1";
  const semanticRetrieval = process.env.USERNAME_BACKTEST_SEMANTIC_RETRIEVAL === "1";
  if (semanticRetrieval && !snapshot) throw new Error("Semantic retrieval requires USERNAME_BACKTEST_WORDNET=1 for point-in-time evidence.");
  const retrieveHistorical = historicalRetrieval || semanticRetrieval ? createHistoricalUsernameRetrieval(sales, {
    lexical: historicalRetrieval, knowledge: semanticRetrieval ? snapshot.knowledge : undefined,
  }) : undefined;
  if (process.env.USERNAME_BACKTEST_POSTFIT_SHRINKAGE === "0") throw new Error("The post-fit shrinkage ablation failed independent evaluation and has been retired.");
  const postFitShrinkage = true;
  const standardizeClassifier = process.env.USERNAME_BACKTEST_STANDARDIZE_CLASSIFIER === "1";
  const evaluationFrom = process.env.USERNAME_BACKTEST_FROM;
  const evaluationUntil = process.env.USERNAME_BACKTEST_UNTIL;
  const result = backtestTelegramUsernameSales(sales, { evaluationFrom, evaluationUntil, maxEvaluations, evaluationStride, maxHistory, retrieveHistorical, semanticVectors, standardizeClassifier, modelRefreshInterval: Math.max(50, evaluationStride) });
  const { results, ...summary } = result;
  const report = { source: "local partial Dune export joined to TON API collection inventory", sales: sales.length,
    sourceHashes,
    evaluationWindow: { fromInclusive: evaluationFrom || null, untilExclusive: evaluationUntil || null },
    estimatorVersion: USERNAME_ESTIMATOR_VERSION, calibrationVersion: USERNAME_CALIBRATION_VERSION,
    semanticSnapshot: snapshot ? { release: snapshot.release, availableBy: snapshot.availableBy, words: snapshot.size } : null,
    modelVersions: [...new Set(results.map(row => row.prediction.learnedModel?.modelVersion).filter(Boolean))],
    rejected, evaluationStride, maxHistory, historicalRetrieval, semanticRetrieval, postFitShrinkage, standardizeClassifier, comparableSelection: "weighted", firstSale: sales[0]?.eventTime, lastSale: sales.at(-1)?.eventTime,
    limitations: ["Partial historical export; not representative of today's market", snapshot ? "Only a versioned historical language snapshot is available; current entity/popularity signals excluded" : "No point-in-time semantic snapshots; external semantics excluded", "Historical USD labels inherited from research export; no current FX substitution"],
    ...summary };
  const output = process.argv.indexOf("--output");
  if (output >= 0 && process.argv[output + 1]) fs.writeFileSync(path.resolve(process.argv[output + 1]), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ ...report, largestMisses: report.largestMisses.slice(0, 3) }, null, 2));
}
if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
module.exports = { csvFields, readCsv, loadHistoricalSales };
