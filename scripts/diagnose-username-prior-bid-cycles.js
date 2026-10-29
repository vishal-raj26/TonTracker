"use strict";

// Exposed-history feasibility only. Never read a prospective reservation or emit prices.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { bidLifecycleEvidence } = require("../lib/username-auction-bid-evidence");
const { canonicalTonAddress } = require("../lib/ton-address");

const DATA = path.resolve(__dirname, "../research/telegram-usernames/data");
const COMPARISON = "username-secondary-own-history-v25-comparison-2026-09-27.json";
const FEATURES = "username-secondary-own-history-features-2026-09-27.json";
const EXPECTED_SAMPLE_HASH = "269c73fc4d9dca418a919782635ef3c133fb6bbe2d9bfcb63bc6fa520b4c9c23";
const START = 1660000000;
const LIMIT = 1000;
const hash = value => crypto.createHash("sha256").update(value).digest("hex");
const success = tx => tx?.description?.aborted === false && tx?.description?.compute_ph?.success === true
  && tx?.description?.action?.success === true;

function selectSample(comparison, features) {
  const own = new Map(features.rows.map(row => [row.eventId, row]));
  const eligible = comparison.pairedCases.filter(row => row.realizedVenue?.includes("secondary")
    && row.eventTime >= "2024-12-01" && row.eventTime < "2025-02-01"
    && own.get(row.eventId)?.hasPriorOwnSale);
  const selected = eligible.sort((a, b) => hash(`${a.nftAddress}|${a.eventTime}`)
    .localeCompare(hash(`${b.nftAddress}|${b.eventTime}`))).slice(0, 24);
  const keys = selected.map(row => `${row.nftAddress}|${row.eventTime}`);
  if (eligible.length !== 3715 || selected.length !== 24
    || new Set(selected.map(row => row.nftAddress)).size !== selected.length
    || hash(keys.join("\\n")) !== EXPECTED_SAMPLE_HASH) throw new Error("Historical pilot sample changed");
  return selected;
}

function auditHistory(transactions, target) {
  const cutoff = Date.parse(target.eventTime);
  const address = canonicalTonAddress(target.nftAddress);
  if (!Number.isFinite(cutoff) || !address || !Array.isArray(transactions)) throw new Error("Invalid history target");
  const ordered = [...transactions].sort((a, b) => {
    try { return BigInt(a.lt) < BigInt(b.lt) ? -1 : BigInt(a.lt) > BigInt(b.lt) ? 1 : 0; }
    catch { return 0; }
  });
  let gaps = 0;
  for (let index = 0; index < ordered.length; index += 1) {
    const tx = ordered[index], previous = ordered[index - 1];
    if (canonicalTonAddress(tx.account) !== address || !tx.hash || !/^\d+$/.test(String(tx.lt))
      || !Number.isFinite(Number(tx.now)) || Number(tx.now) * 1000 > cutoff) gaps += 1;
    if (previous && (String(tx.prev_trans_lt) !== String(previous.lt)
      || tx.prev_trans_hash !== previous.hash)) gaps += 1;
  }
  const genesis = String(ordered[0]?.prev_trans_lt) === "0";
  const complete = ordered.length > 0 && ordered.length < LIMIT && genesis && gaps === 0;
  const prior = ordered.filter(tx => Number(tx.now) * 1000 < cutoff);
  const starts = prior.filter(tx => success(tx)
    && tx.in_msg?.message_content?.decoded?.["@type"] === "teleitem_msg_start_auction");
  const latestStart = starts.at(-1);
  const plain = prior.filter(tx => success(tx) && tx.in_msg?.opcode == null
    && tx.in_msg?.message_content?.decoded?.["@type"] === "empty_cell");
  const afterLatestStart = latestStart
    ? plain.filter(tx => BigInt(tx.lt) > BigInt(latestStart.lt)) : [];
  let lifetimeParserStatus;
  try { lifetimeParserStatus = bidLifecycleEvidence(ordered, target,
    { cutoff, observedAt: new Date().toISOString() }).status; }
  catch (error) { lifetimeParserStatus = `error:${error.message}`; }
  return { transactionCount: ordered.length, genesis, chainGaps: gaps, complete,
    successfulAuctionStarts: starts.length,
    latestStartBeforeTarget: latestStart ? new Date(Number(latestStart.now) * 1000).toISOString() : null,
    successfulPlainTransfers: plain.length, successfulPlainAfterLatestStart: afterLatestStart.length,
    changedStateAfterLatestStart: afterLatestStart.filter(tx => tx.account_state_before?.data_hash
      && tx.account_state_after?.data_hash
      && tx.account_state_before.data_hash !== tx.account_state_after.data_hash).length,
    lifetimeParserStatus };
}

async function fetchHistory(target) {
  const url = new URL("https://toncenter.com/api/v3/transactions");
  for (const [key, value] of Object.entries({ account: target.nftAddress,
    start_utime: START, end_utime: Math.floor(Date.parse(target.eventTime) / 1000),
    limit: LIMIT, sort: "asc" })) url.searchParams.set(key, String(value));
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
  const comparisonBytes = fs.readFileSync(path.join(DATA, COMPARISON));
  const featuresBytes = fs.readFileSync(path.join(DATA, FEATURES));
  const sample = selectSample(JSON.parse(comparisonBytes), JSON.parse(featuresBytes));
  const cases = [];
  for (let index = 0; index < sample.length; index += 1) {
    const target = sample[index];
    let result;
    try { result = auditHistory(await fetchHistory(target), target); }
    catch (error) { result = { error: error.message }; }
    cases.push({ index, caseKeySha256: hash(`${target.nftAddress}|${target.eventTime}`), ...result });
    console.log(JSON.stringify({ index, complete: result.complete || false, starts: result.successfulAuctionStarts || 0,
      parserStatus: result.lifetimeParserStatus || null, error: result.error || null }));
    if (index < sample.length - 1) await new Promise(resolve => setTimeout(resolve, 1100));
  }
  const report = { qualification: false, exposedDevelopmentOnly: true, reservedLabelsOpened: false,
    priceValuesEmitted: false, sampleSha256: EXPECTED_SAMPLE_HASH,
    sourceSha256: { comparison: hash(comparisonBytes), features: hash(featuresBytes) },
    source: "TON Center v3 account-scoped transactions, genesis-to-target, max 1000 rows per NFT",
    limitation: "Cycle and chain-integrity feasibility only; no bid-depth prediction or valuation claim",
    cases };
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
  console.log(JSON.stringify({ completeHistories: cases.filter(row => row.complete).length,
    multiCycleHistories: cases.filter(row => row.successfulAuctionStarts > 0).length,
    parserErrors: cases.filter(row => row.lifetimeParserStatus?.startsWith("error:")).length,
    requestErrors: cases.filter(row => row.error).length }));
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { selectSample, auditHistory };
