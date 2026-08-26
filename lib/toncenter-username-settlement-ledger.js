"use strict";

const crypto = require("node:crypto");
const { attributeHistoricalUsd } = require("./gram-usd-history");
const { USERNAME_COLLECTION } = require("./username-collection");
const { classifyTelegramUsername } = require("./username-structural");
const { usernameLengthBucket } = require("./username-engine");
const { canonicalTonAddress } = require("./ton-address");
const { createValuationLedgerClient } = require("./valuation-ledger-client");

const PIPELINE_KEY = "username-toncenter-settlements-v1";
const OWNERSHIP_ASSIGNED_OPCODE = "0x05138d91";
// Fragment launched collectible username auctions at the end of October 2022.
// Keep a one-day safety margin while avoiding an irrelevant chain-genesis scan.
const USERNAME_MARKET_START_UTIME = 1666742400;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function settlementPayload(message) {
  if (message?.bounced === true || message?.transaction_aborted === true) return null;
  if (String(message?.opcode || "").toLowerCase() !== OWNERSHIP_ASSIGNED_OPCODE) return null;
  if (String(message?.decoded_opcode || "").toLowerCase() !== "nft_ownership_assigned") return null;
  const value = message?.message_content?.decoded?.forward_payload?.value;
  if (value?.["@type"] !== "teleitem_bid_info") return null;
  const amountNano = Number(value?.bid?.amount?.value || 0);
  const settledAt = Number(message?.created_at || 0);
  if (!(amountNano > 0) || !(settledAt > 0) || !message?.source || !message?.out_msg_tx_hash) return null;
  return { amountNano, settledAt, bidAt: Number(value.bid_ts || 0) || null };
}

function usernameFromItem(item) {
  const raw = String(item?.content?.domain || item?.content?.name || "")
    .trim().toLowerCase().replace(/^@/u, "").replace(/\.t\.me$/u, "");
  return raw;
}

function nextCursor(cursor, messages, pageLimit) {
  if (!messages.length) return { ...cursor, caughtUp: true };
  const lastLt = String(messages.at(-1).created_lt || cursor.startLt || "1");
  const trailing = messages.reduceRight((count, message) => (
    String(message.created_lt || "") === lastLt ? count + 1 : count
  ), 0);
  const sameBoundary = lastLt === String(cursor.startLt || "1");
  return {
    startLt: lastLt,
    offset: sameBoundary ? Number(cursor.offset || 0) + messages.length : trailing,
    caughtUp: messages.length < pageLimit,
  };
}

function stableSaleId(message, nftAddress) {
  const identity = `${nftAddress}|${message.out_msg_tx_hash}|${message.hash}|${message.created_lt}`;
  return `toncenter-username-sale:${crypto.createHash("sha256").update(identity).digest("hex")}`;
}

function createTonCenterUsernameSettlementLedger(options = {}) {
  const ledger = options.ledger || createValuationLedgerClient();
  const historicalUsd = options.attributeHistoricalUsd || attributeHistoricalUsd;
  const fetchImpl = options.fetch || fetch;
  const baseUrl = String(options.baseUrl || process.env.TONCENTER_API_BASE_URL || "https://toncenter.com/api/v3").replace(/\/+$/, "");
  const apiKey = String(options.apiKey ?? process.env.TONCENTER_API_KEY ?? "").trim();
  const requestDelayMs = Math.max(0, Number(options.requestDelayMs ?? (apiKey ? 0 : 1_100)));
  const pageLimit = Math.max(10, Math.min(250, Number(options.pageLimit ?? process.env.USERNAME_TONCENTER_SETTLEMENT_PAGE_LIMIT ?? 80)));
  const historyStartUtime = Math.max(0, Number(options.historyStartUtime ?? USERNAME_MARKET_START_UTIME));
  const now = options.now || (() => Date.now());
  let lastRequestAt = 0;

  async function request(pathname, parameters, attempt = 0) {
    const wait = requestDelayMs - (Date.now() - lastRequestAt);
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();
    const query = new URLSearchParams();
    for (const [key, value] of parameters) query.append(key, String(value));
    const headers = { accept: "application/json", "user-agent": "TonTrack-Username-Settlements/1.0" };
    if (apiKey) headers["x-api-key"] = apiKey;
    const response = await fetchImpl(`${baseUrl}${pathname}?${query}`, { headers, signal: AbortSignal.timeout(30_000) });
    if ((response.status === 429 || response.status >= 500) && attempt < 4) {
      await sleep(Math.min(15_000, 1_100 * 2 ** attempt));
      return request(pathname, parameters, attempt + 1);
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`TON Center ${pathname} returned ${response.status}: ${payload.error || payload.message || "unknown error"}`);
    return payload;
  }

  async function runPage() {
    const saved = await ledger.readState(PIPELINE_KEY);
    const cursor = saved?.state?.cursor || { startLt: "1", offset: 0, caughtUp: false };
    const messagePage = await request("/messages", [
      ["opcode", OWNERSHIP_ASSIGNED_OPCODE], ["start_lt", cursor.startLt || "1"],
      ["start_utime", historyStartUtime],
      ["offset", Number(cursor.offset || 0)], ["limit", pageLimit], ["sort", "asc"],
    ]);
    const messages = Array.isArray(messagePage.messages) ? messagePage.messages : [];
    const candidates = messages.flatMap((message) => {
      const settlement = settlementPayload(message);
      const source = canonicalTonAddress(message.source);
      return settlement && source ? [{ message, settlement, source }] : [];
    });
    const uniqueSources = [...new Set(candidates.map((candidate) => candidate.source))];
    const itemPage = uniqueSources.length ? await request("/nft/items", [
      ...uniqueSources.map((address) => ["address", address]),
      ["collection_address", USERNAME_COLLECTION], ["limit", uniqueSources.length],
    ]) : { nft_items: [] };
    const items = new Map((itemPage.nft_items || []).map((item) => [canonicalTonAddress(item.address), item]));
    const staged = [];
    const assets = [];
    let wrongCollection = 0;
    for (const candidate of candidates) {
      const item = items.get(candidate.source);
      if (!item || canonicalTonAddress(item.collection_address) !== USERNAME_COLLECTION) {
        wrongCollection += 1;
        continue;
      }
      const username = usernameFromItem(item);
      let feature;
      try { feature = classifyTelegramUsername(username); } catch { continue; }
      const eventTime = new Date(candidate.settlement.settledAt * 1000).toISOString();
      const priceGram = candidate.settlement.amountNano / 1_000_000_000;
      const eventId = stableSaleId(candidate.message, candidate.source);
      const compactFeature = {
        characterLength: feature.characterLength, characterClass: feature.characterClass,
        routes: feature.routes, patternSignature: feature.patternSignature,
        uniqueCharacterCount: feature.uniqueCharacterCount, maxRunLength: feature.maxRunLength,
        palindrome: feature.palindrome, sequence: feature.sequence,
        containsUnderscore: feature.containsUnderscore, wordHint: feature.wordHint,
      };
      assets.push({
        assetKind: "username", assetKey: candidate.source, normalizedName: feature.normalizedUsername,
        displayName: feature.displayUsername, primaryRoute: feature.primaryRoute,
        lengthBucket: usernameLengthBucket(feature.characterLength), script: feature.primaryScript,
        scarcityClass: feature.scarcityClass, feature: compactFeature, sourceUpdatedAt: eventTime,
      });
      staged.push({
        eventId, nftAddress: candidate.source, username: feature.normalizedUsername,
        eventTime, priceGram, bidAt: candidate.settlement.bidAt,
        txHash: candidate.message.out_msg_tx_hash, messageHash: candidate.message.hash,
        feature,
      });
    }
    const priced = await historicalUsd(staged, { logger: console });
    const sales = priced.flatMap((event) => Number(event.priceUsd) > 0 && Number(event.historicalUsdRate) > 0 ? [{
      saleId: event.eventId, assetKind: "username", assetKey: event.nftAddress,
      normalizedName: event.username, soldAt: event.eventTime, priceGram: event.priceGram,
      historicalUsdRate: event.historicalUsdRate, priceUsd: event.priceUsd,
      marketplace: "Fragment", source: "toncenter-telemint-settlement", reliabilityScore: 1,
      qualityFlags: {
        verificationTier: "toncenter-telemint-bid-settlement", historicalUsdSource: event.historicalUsdSource,
        historicalUsdMethod: event.historicalUsdMethod, txHash: event.txHash,
        messageHash: event.messageHash, bidAt: event.bidAt ? new Date(event.bidAt * 1000).toISOString() : null,
      },
      primaryRoute: event.feature.primaryRoute, lengthBucket: usernameLengthBucket(event.feature.characterLength),
      script: event.feature.primaryScript, scarcityClass: event.feature.scarcityClass,
    }] : []);
    const pendingHistoricalUsd = staged.length - sales.length;
    const advanced = pendingHistoricalUsd ? cursor : nextCursor(cursor, messages, pageLimit);
    const [assetsWritten, salesWritten] = await Promise.all([ledger.ingestAssets(assets), ledger.ingestSales(sales)]);
    await ledger.writeState(PIPELINE_KEY, advanced, {
      messages: messages.length, candidates: candidates.length, verifiedItems: staged.length,
      wrongCollection, assets: assetsWritten, sales: salesWritten, pendingHistoricalUsd,
      processedAt: new Date(now()).toISOString(),
    });
    return {
      ok: true, pipeline: PIPELINE_KEY, messages: messages.length, candidates: candidates.length,
      verifiedItems: staged.length, wrongCollection, assets: assetsWritten, sales: salesWritten,
      pendingHistoricalUsd, caughtUp: Boolean(advanced.caughtUp),
    };
  }

  return { runPage };
}

module.exports = {
  OWNERSHIP_ASSIGNED_OPCODE, PIPELINE_KEY, USERNAME_MARKET_START_UTIME, createTonCenterUsernameSettlementLedger,
  nextCursor, settlementPayload, stableSaleId, usernameFromItem,
};
