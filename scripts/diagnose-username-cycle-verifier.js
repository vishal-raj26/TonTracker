"use strict";

// Fixed exposed-history coverage test. No target prices or bid amounts are emitted.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { selectSample } = require("./diagnose-username-prior-bid-cycles");
const { verifyHistoricalAuctionCycles } = require("../lib/username-historical-auction-cycles");

const DATA = path.resolve(__dirname, "../research/telegram-usernames/data");
const hash = value => crypto.createHash("sha256").update(value).digest("hex");

async function fetchHistory(target) {
  const url = new URL("https://toncenter.com/api/v3/transactions");
  for (const [key, value] of Object.entries({ account: target.nftAddress,
    start_utime: 1660000000, end_utime: Math.floor(Date.parse(target.eventTime) / 1000),
    limit: 1000, sort: "asc" })) url.searchParams.set(key, String(value));
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(15000) });
    if ((response.status === 429 || response.status >= 500) && attempt < 2) {
      await new Promise(resolve => setTimeout(resolve, 1500 * (attempt + 1)));
      continue;
    }
    if (!response.ok) throw new Error(`TON Center HTTP ${response.status}`);
    const body = await response.json();
    if (!Array.isArray(body.transactions)) throw new Error("TON Center transactions missing");
    return body.transactions;
  }
  throw new Error("TON Center retry limit reached");
}

async function main() {
  const at = process.argv.indexOf("--output");
  if (at < 0 || !process.argv[at + 1]) throw new Error("--output required");
  const output = path.resolve(process.argv[at + 1]);
  if (fs.existsSync(output)) throw new Error("Output already exists");
  const comparisonName = "username-secondary-own-history-v25-comparison-2026-09-27.json";
  const featureName = "username-secondary-own-history-features-2026-09-27.json";
  const comparisonBytes = fs.readFileSync(path.join(DATA, comparisonName));
  const featureBytes = fs.readFileSync(path.join(DATA, featureName));
  const selected = selectSample(JSON.parse(comparisonBytes), JSON.parse(featureBytes));
  const cases = [];
  for (let index = 0; index < selected.length; index += 1) {
    const target = selected[index];
    let result;
    try {
      const transactions = await fetchHistory(target);
      const verified = verifyHistoricalAuctionCycles(transactions,
        { nftAddress: target.nftAddress, username: target.username },
        { cutoff: Date.parse(target.eventTime), observedAt: new Date().toISOString() });
      result = { status: verified.status, transactionCount: verified.accountTransactions,
        cycleCount: verified.cycles.length,
        inCycleBidCount: verified.cycles.reduce((sum, cycle) => sum + cycle.bids.length, 0),
        currentCycleBidCount: verified.cycles.at(-1)?.bids.length || 0,
        ignoredAfterAuction: verified.ignoredAfterAuction };
    } catch (error) { result = { status: "unavailable", reason: error.message }; }
    cases.push({ index, caseKeySha256: hash(`${target.nftAddress}|${target.eventTime}`), ...result });
    console.log(JSON.stringify({ index, status: result.status, reason: result.reason || null }));
    if (index < selected.length - 1) await new Promise(resolve => setTimeout(resolve, 1100));
  }
  const report = { qualification: false, exposedDevelopmentOnly: true, reservedLabelsOpened: false,
    pricesEmitted: false, sourceSha256: { comparison: hash(comparisonBytes), features: hash(featureBytes),
      verifier: hash(fs.readFileSync(path.resolve(__dirname, "../lib/username-historical-auction-cycles.js"))) },
    limitation: "Coverage/chain parsing only; no target-price comparison or predictive quality evidence",
    cases };
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
  console.log(JSON.stringify({ cases: cases.length,
    reconstructed: cases.filter(row => row.status === "cycle-history-reconstructed").length,
    unavailable: cases.filter(row => row.status === "unavailable").length,
    reasons: cases.filter(row => row.reason).reduce((counts, row) =>
      ({ ...counts, [row.reason]: (counts[row.reason] || 0) + 1 }), {}) }));
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
