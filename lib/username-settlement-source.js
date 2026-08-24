"use strict";

// Strict adapter for a public chain-indexed username settlement feed. It has
// no browser sessions, private-source support, or acceptance path for asks.
const crypto = require("node:crypto");
const { USERNAME_COLLECTION } = require("./username-collection");
const { normalizeTelegramUsername } = require("./username-structural");
const { isRealNftAddress } = require("./toncenter-username-verifier");

const FINALIZED_TYPES = new Set(["sale", "completed-sale", "auction-settlement", "auction_settlement", "fixed-sale", "fixed_sale"]);
const text = (value) => String(value || "").trim();
const native = (value) => text(value).toLowerCase();
const positive = (value) => { const number = Number(value); return Number.isFinite(number) && number > 0 ? number : 0; };

function stableEventId(sourceId, event) {
  const explicit = text(event.eventId || event.event_id || event.sourceEventId || event.source_event_id);
  if (explicit) return `${sourceId}:${explicit}`;
  const identity = [sourceId, text(event.txHash || event.tx_hash || event.traceId || event.trace_id), native(event.nftAddress || event.nft_address), event.eventTime || event.event_time].join("|");
  return `${sourceId}:${crypto.createHash("sha256").update(identity).digest("hex")}`;
}

function normalizePublicSettlementEvent(input = {}, options = {}) {
  const sourceId = text(options.sourceId || "public-settlement-index").replace(/[^a-z0-9._-]/gi, "-").toLowerCase();
  const collection = native(input.collectionAddress || input.collection_address);
  const nftAddress = native(input.nftAddress || input.nft_address);
  const eventType = native(input.eventType || input.event_type || "sale");
  const eventTime = new Date(input.eventTime || input.event_time || input.soldAt || input.sold_at);
  const txHash = text(input.txHash || input.tx_hash);
  const traceId = text(input.traceId || input.trace_id);
  const priceGram = positive(input.priceGram || input.price_gram);
  const historicalUsdRate = positive(input.historicalUsdRate || input.historical_usd_rate);
  const priceUsd = positive(input.priceUsd || input.price_usd);
  const username = normalizeTelegramUsername(input.username || input.normalizedName || input.normalized_name || input.displayName || "");
  if (collection !== USERNAME_COLLECTION) throw new TypeError("settlement is outside the verified Telegram Username collection");
  if (!isRealNftAddress(nftAddress)) throw new TypeError("settlement needs a real collectible NFT address");
  if (!FINALIZED_TYPES.has(eventType) || input.isFinalized === false || input.isCancelled || input.cancelled) throw new TypeError("settlement must be a finalized sale");
  if (!Number.isFinite(eventTime.getTime())) throw new TypeError("settlement needs an event timestamp");
  if (!txHash && !traceId) throw new TypeError("settlement needs a public transaction hash or trace ID");
  if (!(priceGram > 0)) throw new TypeError("settlement needs a positive native GRAM amount");
  if (historicalUsdRate > 0 && priceUsd > 0 && Math.abs(priceGram * historicalUsdRate - priceUsd) / priceUsd > 0.03) throw new TypeError("settlement USD does not match the sale-time GRAM/USD rate");
  return { eventId: stableEventId(sourceId, input), sourceEventId: text(input.sourceEventId || input.source_event_id) || null, nftAddress, collectionAddress: USERNAME_COLLECTION, username, displayName: `@${username}`, eventType, eventTime: eventTime.toISOString(), priceGram, paymentAsset: "GRAM", historicalUsdRate, priceUsd, txHash: txHash || null, traceId: traceId || null, marketplace: text(input.marketplace || "Fragment"), buyerAddress: text(input.buyerAddress || input.buyer_address) || null, sellerAddress: text(input.sellerAddress || input.seller_address) || null, isFinalized: true, isCancelled: false, verified: false, qualityFlags: ["public-chain-index-settlement"], sourceId };
}

function createPublicSettlementSource(options = {}) {
  const baseUrl = text(options.baseUrl || process.env.USERNAME_PUBLIC_SETTLEMENT_SOURCE_URL).replace(/\/+$/, "");
  const sourceId = text(options.sourceId || process.env.USERNAME_PUBLIC_SETTLEMENT_SOURCE_NAME || "public-settlement-index");
  const fetchImpl = options.fetch || fetch;
  if (!baseUrl) throw new Error("USERNAME_PUBLIC_SETTLEMENT_SOURCE_URL is required");
  async function fetchPage(cursor = "") {
    const url = new URL(baseUrl); if (cursor) url.searchParams.set("cursor", cursor);
    const response = await fetchImpl(url, { headers: { accept: "application/json", "user-agent": "TonTrack-Public-Settlement-Indexer/1.0" }, signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`public settlement source returned ${response.status}`);
    const payload = await response.json();
    return { events: (Array.isArray(payload?.events) ? payload.events : []).map((event) => normalizePublicSettlementEvent(event, { sourceId })), nextCursor: text(payload?.nextCursor || payload?.next_cursor), source: sourceId };
  }
  return { fetchPage, normalize: (event) => normalizePublicSettlementEvent(event, { sourceId }) };
}

module.exports = { FINALIZED_TYPES, createPublicSettlementSource, normalizePublicSettlementEvent, stableEventId };
