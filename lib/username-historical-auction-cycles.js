"use strict";

// Research-only Telemint cycle reconstruction. This is indexed chain evidence,
// not a funded current offer, completed sale, resale floor, or portfolio value.
const { canonicalTonAddress } = require("./ton-address");
const { initialBidEvidence } = require("./username-auction-bid-evidence");

const NANO = 1_000_000_000n;
const DEFAULT_LIMIT = 1000;

function positiveInteger(value, label, allowZero = false) {
  if (!/^\d+$/.test(String(value))) throw new Error(`Invalid ${label}`);
  const parsed = BigInt(value);
  if (allowZero ? parsed < 0n : parsed <= 0n) throw new Error(`Invalid ${label}`);
  return parsed;
}

function auctionConfig(decoded) {
  const config = decoded?.auction_config;
  if (config?.["@type"] !== "teleitem_auction_config") throw new Error("Auction configuration unavailable");
  const initialMinimum = positiveInteger(config.initial_min_bid?.amount?.value, "initial minimum");
  const maximum = positiveInteger(config.max_bid?.amount?.value, "maximum bid", true);
  const step = positiveInteger(config.min_bid_step, "minimum bid step");
  const extension = positiveInteger(config.min_extend_time, "minimum extension", true);
  const duration = positiveInteger(config.duration, "auction duration");
  if (initialMinimum < 2n * NANO || (maximum > 0n && maximum < initialMinimum))
    throw new Error("Invalid minimum or maximum bid");
  if (duration > 365n * 86400n || extension > 7n * 86400n || step > 10000n)
    throw new Error("Auction configuration out of range");
  return { initialMinimum, maximum, step, extension, duration };
}

function completeAccountChain(transactions, address, cutoff, maxRows = DEFAULT_LIMIT) {
  if (!Array.isArray(transactions) || transactions.length === 0 || transactions.length >= maxRows)
    throw new Error("Account history absent or at page cap");
  const ordered = [...transactions].sort((a, b) => {
    const left = positiveInteger(a?.lt, "transaction LT"), right = positiveInteger(b?.lt, "transaction LT");
    return left < right ? -1 : left > right ? 1 : 0;
  });
  if (String(ordered[0].prev_trans_lt) !== "0") throw new Error("Account genesis missing");
  for (let index = 0; index < ordered.length; index += 1) {
    const current = ordered[index], previous = ordered[index - 1];
    const time = Number(current.now) * 1000;
    if (canonicalTonAddress(current.account) !== address || !current.hash
      || !Number.isFinite(time) || time <= 0 || time > cutoff)
      throw new Error("Account transaction identity or time mismatch");
    if (previous && (String(current.prev_trans_lt) !== String(previous.lt)
      || current.prev_trans_hash !== previous.hash)) throw new Error("Account predecessor gap");
  }
  return ordered;
}

function successful(transaction) {
  return transaction?.description?.aborted === false
    && transaction?.description?.compute_ph?.success === true
    && transaction?.description?.action?.success === true;
}

function changedData(transaction) {
  const before = transaction?.account_state_before?.data_hash;
  const after = transaction?.account_state_after?.data_hash;
  return typeof before === "string" && before.length > 0
    && typeof after === "string" && after.length > 0 && before !== after;
}

function advanceBid(cycle, bid) {
  const amount = positiveInteger(bid.amountNano, "bid amount");
  if (amount < cycle.minimum) throw new Error("Bid below reconstructed minimum");
  const time = Date.parse(bid.eventTime);
  if (!Number.isFinite(time) || time < cycle.startedAtMs || time >= cycle.endMs)
    throw new Error("Bid outside reconstructed auction");
  cycle.bids.push(bid);
  cycle.endMs = Math.max(cycle.endMs, time + Number(cycle.config.extension) * 1000);
  cycle.minimum = amount + NANO > (amount * (100n + cycle.config.step) + 99n) / 100n
    ? amount + NANO : (amount * (100n + cycle.config.step) + 99n) / 100n;
  if (cycle.config.maximum > 0n && amount >= cycle.config.maximum) {
    cycle.endMs = time;
    cycle.closedByMaximum = true;
  }
}

function startCycle(transaction, config, initialBid = null) {
  const startedAtMs = Number(transaction.now) * 1000;
  const endMs = startedAtMs + Number(config.duration) * 1000;
  if (!Number.isSafeInteger(endMs)) throw new Error("Invalid auction end time");
  const cycle = { startTxHash: transaction.hash, startedAtMs, endMs,
    config, minimum: config.initialMinimum, bids: [], closedByMaximum: false, cancelled: false };
  if (initialBid) advanceBid(cycle, initialBid);
  return cycle;
}

function verifyHistoricalAuctionCycles(transactions, target, { cutoff, observedAt, maxRows = DEFAULT_LIMIT } = {}) {
  const address = canonicalTonAddress(target?.nftAddress);
  if (!/^0:[0-9a-f]{64}$/.test(address) || !Number.isFinite(cutoff)
    || !Number.isFinite(Date.parse(observedAt || ""))) throw new Error("Invalid historical auction target");
  const ordered = completeAccountChain(transactions, address, cutoff, maxRows);
  const initial = initialBidEvidence(ordered[0], { nftAddress: address, username: target.username },
    { cutoff, observedAt });
  if (!initial) throw new Error("Verified initial deploy missing at account genesis");
  const initialConfig = auctionConfig(ordered[0].in_msg?.message_content?.decoded);
  const cycles = [startCycle(ordered[0], initialConfig, {
    eventTime: initial.eventTime, bidderAddress: initial.bidderAddress,
    amountNano: initial.amountNano, txHash: initial.txHash, kind: "initial" })];
  let ignoredAfterAuction = 0, failedTransactions = 0;
  for (const tx of ordered.slice(1)) {
    const time = Number(tx.now) * 1000;
    if (time >= cutoff) break;
    if (!successful(tx)) { failedTransactions += 1; continue; }
    const message = tx.in_msg, decoded = message?.message_content?.decoded;
    let cycle = cycles.at(-1);
    if (decoded?.["@type"] === "teleitem_msg_cancel_auction") {
      if (message.opcode !== "0x371638ae" || canonicalTonAddress(message.destination) !== address
        || !canonicalTonAddress(message.source) || message.bounced === true || !changedData(tx)
        || cycle.bids.length > 0 || cycle.cancelled || time >= cycle.endMs)
        throw new Error("Auction cancellation lacks cycle/state proof");
      cycle.cancelled = true;
      cycle.endMs = time;
      continue;
    }
    if (decoded?.["@type"] === "teleitem_msg_start_auction") {
      if (message.opcode !== "0x487a8e81" || canonicalTonAddress(message.destination) !== address
        || !canonicalTonAddress(message.source) || message.bounced === true)
        throw new Error("Auction start identity unavailable");
      if (!changedData(tx)) throw new Error("Auction start lacks state-change proof");
      if (time < cycle.endMs && !cycle.closedByMaximum) throw new Error("Auction start overlaps prior cycle");
      cycle = startCycle(tx, auctionConfig(decoded));
      cycles.push(cycle);
      continue;
    }
    if (message?.opcode != null || decoded?.["@type"] !== "empty_cell") continue;
    if (canonicalTonAddress(message.destination) !== address || !canonicalTonAddress(message.source)
      || message.bounced === true) throw new Error("Plain transfer identity unavailable");
    if (cycle.closedByMaximum || time >= cycle.endMs) { ignoredAfterAuction += 1; continue; }
    if (!changedData(tx)) throw new Error("In-cycle transfer lacks state-change proof");
    const amount = positiveInteger(message.value, "plain transfer amount");
    advanceBid(cycle, { eventTime: new Date(time).toISOString(),
      bidderAddress: canonicalTonAddress(message.source), amountNano: amount.toString(),
      txHash: tx.hash, kind: "in-cycle" });
  }
  return { status: "cycle-history-reconstructed", nftAddress: address, username: target.username,
    cutoff: new Date(cutoff).toISOString(), accountTransactions: ordered.length,
    accountChainComplete: true, ignoredAfterAuction, failedTransactions,
    cycles: cycles.map(cycle => ({ startTxHash: cycle.startTxHash,
      startedAt: new Date(cycle.startedAtMs).toISOString(),
      scheduledEnd: new Date(cycle.endMs).toISOString(), closedByMaximum: cycle.closedByMaximum,
      cancelled: cycle.cancelled,
      bids: cycle.bids })),
    valuationEligible: false, portfolioEligible: false,
    limitation: "Historical cycle reconstruction is not resale demand, a price floor, or a qualified estimator feature" };
}

module.exports = { verifyHistoricalAuctionCycles, completeAccountChain, auctionConfig };
