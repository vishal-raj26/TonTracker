"use strict";

/*
 * Fragment is useful for discovering completed username sales, but it is not
 * the chain of record. This module verifies a discovered sale against the
 * real collectible NFT account in TON Center. It deliberately does not turn
 * a bare NFT transfer into a sale: a Fragment event must already exist, and
 * the chain transaction must match its item, native amount and timestamp.
 */
const { canonicalTonAddress } = require("./ton-address");

const DEFAULT_BASE_URL = "https://toncenter.com/api/v3";
const NANO_PER_GRAM = 1_000_000_000n;

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function nativeAddress(value) { return canonicalTonAddress(value) || ""; }
function isRealNftAddress(value) { return /^([+-]?[01]):[0-9a-f]{64}$/i.test(nativeAddress(value)); }
function toNanograms(value) {
  const grams = Number(value);
  if (!Number.isFinite(grams) || grams <= 0) return null;
  return BigInt(Math.round(grams * Number(NANO_PER_GRAM)));
}
function messageValues(transaction) {
  const messages = [transaction?.in_msg, ...(Array.isArray(transaction?.out_msgs) ? transaction.out_msgs : [])];
  return messages.map((message) => {
    const raw = message?.value ?? message?.value_ng ?? message?.amount ?? message?.coins;
    try { return raw === undefined || raw === null ? null : BigInt(String(raw)); } catch { return null; }
  }).filter((value) => value !== null && value > 0n);
}
function paymentMatch(transaction, expectedAmount, maximumFeeRatio = 0.08) {
  const values = messageValues(transaction);
  const exact = values.find((value) => value === expectedAmount);
  if (exact) return { amount: exact, deviation: 0, kind: "gross" };
  // A Fragment collectible transfer can forward the seller's net proceeds
  // rather than the buyer's gross price. Accept only a small, downward fee
  // difference on the real NFT item at the same sale time.
  const candidates = values
    .filter((value) => value > 0n && value <= expectedAmount)
    .map((value) => ({ amount: value, deviation: Number(expectedAmount - value) / Number(expectedAmount) }))
    .filter((candidate) => candidate.deviation > 0 && candidate.deviation <= maximumFeeRatio)
    .sort((left, right) => left.deviation - right.deviation);
  return candidates[0] ? { ...candidates[0], kind: "net-proceeds" } : null;
}
function transactionTime(transaction) {
  const value = transaction?.utime ?? transaction?.now ?? transaction?.timestamp ?? transaction?.time;
  if (typeof value === "number" && Number.isFinite(value)) return value > 10_000_000_000 ? value : value * 1000;
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : null;
}
function transactionHash(transaction) { return String(transaction?.hash || transaction?.transaction_hash || transaction?.id?.hash || "").trim() || null; }
function traceId(transaction) { return String(transaction?.trace_id || transaction?.traceId || "").trim() || null; }
function nftDomain(item) { return String(item?.content?.domain || item?.metadata?.domain || "").toLowerCase().replace(/\.t\.me$/, ""); }

function createTonCenterUsernameVerifier(options = {}) {
  const baseUrl = String(options.baseUrl || process.env.USERNAME_TONCENTER_BASE_URL || process.env.TONCENTER_API_BASE_URL || process.env.TONCENTER_API_BASE || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const apiKey = String(options.apiKey ?? process.env.USERNAME_TONCENTER_API_KEY ?? process.env.TONCENTER_API_KEY ?? "").trim();
  const fetchImpl = options.fetch || fetch;
  const delayMs = Math.max(0, Number(options.requestDelayMs ?? (apiKey ? 0 : 1_050)));
  const retries = Math.max(0, Number(options.retries ?? 3));
  let lastRequestAt = 0;

  async function request(pathname, attempt = 0) {
    const wait = delayMs - (Date.now() - lastRequestAt);
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();
    const headers = { accept: "application/json", "user-agent": "TonTrack-Username-Chain-Verifier/1.0" };
    if (apiKey) headers["x-api-key"] = apiKey;
    const response = await fetchImpl(`${baseUrl}${pathname}`, { headers, signal: AbortSignal.timeout(20_000) });
    if ((response.status === 429 || response.status >= 500) && attempt < retries) {
      await sleep(Math.min(30_000, 1_000 * 2 ** attempt));
      return request(pathname, attempt + 1);
    }
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(`TON Center transactions returned ${response.status}: ${payload?.error || payload?.message || "unknown error"}`);
    return payload;
  }

  async function fetchTransactions(account, { startUtime, endUtime, limit = 100 } = {}) {
    const address = nativeAddress(account);
    if (!isRealNftAddress(address)) return [];
    const query = new URLSearchParams({ account: address, limit: String(Math.max(1, Math.min(100, limit))), sort: "asc" });
    if (Number.isFinite(startUtime)) query.set("start_utime", String(Math.floor(startUtime)));
    if (Number.isFinite(endUtime)) query.set("end_utime", String(Math.floor(endUtime)));
    const payload = await request(`/transactions?${query.toString()}`);
    return Array.isArray(payload?.transactions) ? payload.transactions : Array.isArray(payload?.data) ? payload.data : [];
  }

  async function findOwnedUsernameNft(owner, username, collectionAddress) {
    const account = nativeAddress(owner);
    const expected = String(username || "").replace(/^@/, "").toLowerCase();
    const collection = nativeAddress(collectionAddress);
    if (!account || !expected || !collection) return null;
    const query = new URLSearchParams({ owner_address: account, limit: "1000" });
    const payload = await request(`/nft/items?${query.toString()}`);
    const items = Array.isArray(payload?.nft_items) ? payload.nft_items : Array.isArray(payload?.items) ? payload.items : [];
    const found = items.find((item) => nativeAddress(item.collection_address || item.collection?.address) === collection && nftDomain(item) === expected);
    return found ? nativeAddress(found.address) : null;
  }

  async function verifyFragmentSale(event, addresses = []) {
    const targetTime = Date.parse(event?.eventTime || event?.timestamp || "");
    const targetAmount = toNanograms(event?.priceGram);
    const candidates = [...new Set(addresses.map(nativeAddress).filter(isRealNftAddress))];
    if (!Number.isFinite(targetTime) || !targetAmount || !candidates.length) {
      return { verified: false, reason: candidates.length ? "missing-sale-time-or-price" : "real-nft-address-unavailable" };
    }
    const windowMs = Math.max(60_000, Number(options.matchWindowMs ?? 12 * 60 * 1000));
    const startUtime = Math.floor((targetTime - windowMs) / 1000);
    const endUtime = Math.ceil((targetTime + windowMs) / 1000);
    const matches = [];
    for (const address of candidates) {
      const transactions = await fetchTransactions(address, { startUtime, endUtime });
      for (const transaction of transactions) {
        const observedTime = transactionTime(transaction);
        if (!observedTime || Math.abs(observedTime - targetTime) > windowMs) continue;
        const payment = paymentMatch(transaction, targetAmount, Number(options.maxPaymentFeeRatio ?? 0.08));
        if (!payment) continue;
        matches.push({
          nftAddress: address,
          txHash: transactionHash(transaction),
          traceId: traceId(transaction),
          eventTime: new Date(observedTime).toISOString(),
          timeDistanceMs: Math.abs(observedTime - targetTime),
          observedGram: Number(payment.amount) / Number(NANO_PER_GRAM),
          paymentDeviation: payment.deviation,
          paymentKind: payment.kind,
        });
      }
    }
    matches.sort((left, right) => left.timeDistanceMs - right.timeDistanceMs);
    if (!matches.length) return { verified: false, reason: "no-matching-chain-settlement" };
    return { verified: true, method: "fragment-sale-plus-toncenter-item-settlement", match: matches[0] };
  }

  return { fetchTransactions, findOwnedUsernameNft, verifyFragmentSale };
}

module.exports = { createTonCenterUsernameVerifier, isRealNftAddress, messageValues, paymentMatch, toNanograms, transactionTime };
