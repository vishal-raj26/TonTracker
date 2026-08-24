"use strict";

/*
 * Completed Telegram Username sales are collected directly from Fragment by
 * default. A custom canonical bridge remains supported through
 * USERNAME_EVENT_SOURCE_URL. Every completed sale is labelled in historical
 * USD at its own timestamp before it can enter the estimator ledger.
 */
const os = require("node:os");
const { Pool } = require("pg");
const { createUsernameStore } = require("../lib/username-store");
const { USERNAME_COLLECTION } = require("../lib/username-collection");
const { USERNAME_ESTIMATOR_VERSION, USERNAME_FEATURE_VERSION } = require("../lib/username-engine");
const { classifyTelegramUsername } = require("../lib/username-structural");
const { assessUsernameMarketEvent } = require("../lib/username-market-risk");
const { createFragmentUsernameSource, liveCursor } = require("../lib/fragment-username-source");
const { createTonCenterUsernameVerifier, isRealNftAddress } = require("../lib/toncenter-username-verifier");
const { attributeHistoricalUsd } = require("../lib/gram-usd-history");

const sourceUrl = String(process.env.USERNAME_EVENT_SOURCE_URL || "").replace(/\/+$/, "");
const databaseUrl = String(process.env.USERNAME_DATABASE_URL || process.env.DNS_DATABASE_URL || process.env.DATABASE_URL || "").trim();
const sourceName = String(process.env.USERNAME_EVENT_SOURCE_NAME || (sourceUrl ? "ton-lake-bridge" : "fragment-market"));
const limit = Math.max(1, Math.min(1000, Number(process.env.USERNAME_EVENT_INGEST_LIMIT || 500)));
const continuous = process.argv.includes("--continuous");
const pollMs = Math.max(60_000, Number(process.env.USERNAME_EVENT_INGEST_POLL_MS || 6 * 60 * 60 * 1000));
const historyBatchSize = Math.max(0, Math.min(50, Number(process.env.USERNAME_FRAGMENT_HISTORY_BATCH_SIZE || 10)));
const chainVerificationEnabled = !/^(0|false|no)$/i.test(String(process.env.USERNAME_TONCENTER_VERIFY_ENABLED || ""));
if (!databaseUrl) throw new Error("USERNAME_DATABASE_URL, DNS_DATABASE_URL, or DATABASE_URL is required");

const pool = new Pool({ connectionString: databaseUrl, ssl: /localhost|127\.0\.0\.1/i.test(databaseUrl) ? false : { rejectUnauthorized: false }, max: 4 });
const store = createUsernameStore(pool);
const fragmentSource = createFragmentUsernameSource();
const chainVerifier = chainVerificationEnabled ? createTonCenterUsernameVerifier() : null;
const historyWorkerId = `${os.hostname()}:${process.pid}:fragment-history`;

async function fetchBridgePage(cursor) {
  const url = new URL(sourceUrl);
  url.searchParams.set("limit", String(limit));
  if (cursor) url.searchParams.set("cursor", cursor);
  const response = await fetch(url, { headers: { accept: "application/json", "user-agent": "TonTrack-Username-Ledger/1.0" }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`username source returned ${response.status}`);
  return response.json();
}
async function fetchPage(cursor) { return sourceUrl ? fetchBridgePage(cursor) : fragmentSource.fetchPage(cursor); }

async function withHistoricalUsd(events) {
  const rows = Array.isArray(events) ? events : [];
  const missing = rows.filter((event) => !(Number(event.historicalUsdRate) > 0) || !(Number(event.priceUsd) > 0));
  if (!missing.length) return rows;
  const attributed = await attributeHistoricalUsd(missing, { logger: console });
  const byId = new Map(attributed.map((event) => [event.eventId, event]));
  return rows.map((event) => byId.get(event.eventId) || event);
}
async function recentEvents(nftAddress) {
  const result = await pool.query("SELECT seller_address AS \"sellerAddress\", buyer_address AS \"buyerAddress\", price_gram AS \"priceGram\" FROM username_market_events WHERE nft_address=$1 AND event_time >= NOW()-INTERVAL '90 days' ORDER BY event_time DESC LIMIT 20", [String(nftAddress).toLowerCase()]);
  return result.rows;
}
async function ingest(event, options = {}) {
  if (String(event.collectionAddress || "").toLowerCase() !== USERNAME_COLLECTION) throw new Error("event is outside verified Telegram Username collection");
  const feature = classifyTelegramUsername(event.username || event.displayName || "");
  const eventTime = new Date(event.eventTime || event.timestamp || "");
  const eventType = String(event.eventType || "").toLowerCase();
  const priceGram = Number(event.priceGram);
  const historicalUsdRate = Number(event.historicalUsdRate);
  const priceUsd = Number(event.priceUsd);
  const completedSale = ["sale", "completed-sale", "auction-settlement", "auction_settlement", "fixed-sale", "fixed_sale"].includes(eventType) && Boolean(event.isFinalized);
  if (!event.eventId || !event.nftAddress || !Number.isFinite(eventTime.getTime())) throw new Error("event identity or time is missing");
  if (!(priceGram > 0)) throw new Error("market event is missing a native GRAM price");
  if (completedSale && (!(historicalUsdRate > 0) || !(priceUsd > 0))) throw new Error("completed sale is missing historical native/USD evidence");
  if (completedSale && Math.abs((priceGram * historicalUsdRate) - priceUsd) / priceUsd > 0.03) throw new Error("event USD price does not match its historical native/USD rate");

  const stored = await store.upsertAsset({
    nftAddress: event.nftAddress,
    collectionAddress: USERNAME_COLLECTION,
    usernameNormalized: feature.normalizedUsername,
    displayName: `@${feature.normalizedUsername}`,
    ownerAddress: event.buyerAddress,
    nftIndex: event.nftIndex,
    metadata: { source: sourceName, fragmentUrl: `https://fragment.com/username/${encodeURIComponent(feature.normalizedUsername)}` },
  });
  const canonicalNftAddress = String(stored.nft_address).toLowerCase();
  await store.upsertAlias(event.nftAddress, canonicalNftAddress, sourceName, { username: feature.normalizedUsername });
  let chainEvidence = { verified: false, reason: chainVerificationEnabled ? "real-nft-address-unavailable" : "disabled" };
  const assetIdentity = chainVerifier ? await store.getAssetByUsername(feature.normalizedUsername) : null;
  const chainAddresses = [canonicalNftAddress, ...(assetIdentity?.aliases || [])];
  if (chainVerifier && chainAddresses.some(isRealNftAddress) && completedSale) {
    // Fragment discovers completed marketplace rows. TON Center only confirms
    // them when their real item account, native amount, and time agree.
    chainEvidence = await chainVerifier.verifyFragmentSale(event, chainAddresses);
  }
  const enrichedEvent = chainEvidence.verified ? {
    ...event,
    txHash: event.txHash || chainEvidence.match.txHash,
    traceId: event.traceId || chainEvidence.match.traceId,
  } : event;
  const risk = assessUsernameMarketEvent({ ...enrichedEvent, nftAddress: canonicalNftAddress }, await recentEvents(canonicalNftAddress));
  // Fragment's public row confirms that the market reported a completed sale.
  // It is not chain-confirmed unless the real item settlement was matched.
  const sourceReliability = chainEvidence.verified ? 1 : 0.6;
  const inserted = await store.insertMarketEvent({
    ...enrichedEvent,
    nftAddress: canonicalNftAddress,
    usernameNormalized: feature.normalizedUsername,
    eventTime,
    paymentAsset: "GRAM",
    isFinalized: Boolean(event.isFinalized),
    isCancelled: Boolean(event.isCancelled),
    source: sourceName,
    sourceEventId: event.sourceEventId || event.eventId,
    reliabilityScore: Math.min(risk.reliabilityScore, sourceReliability),
    qualityFlags: { flags: risk.flags, sourceQuality: event.qualityFlags || [], historicalUsdSource: event.historicalUsdSource, historicalUsdMethod: event.historicalUsdMethod, chainEvidence, verificationTier: chainEvidence.verified ? "chain-confirmed" : "market-reported" },
    rawPayload: { ...event, chainEvidence },
  });
  if (["listing", "active-listing", "bid", "offer"].includes(eventType) && !event.isCancelled) {
    await store.upsertMarketState({ nftAddress: canonicalNftAddress, lowestAskGram: ["listing", "active-listing"].includes(eventType) ? priceGram : null, highestBidGram: ["bid", "offer"].includes(eventType) ? priceGram : null, marketplace: event.marketplace, observedAt: eventTime, staleAt: event.staleAt ? new Date(event.staleAt) : null, verified: Boolean(event.verified), metadata: { source: sourceName, eventId: event.eventId } });
  }
  if (inserted) {
    await store.enqueueJob({ jobType: "username-feature", dedupeKey: `${canonicalNftAddress}:${USERNAME_FEATURE_VERSION}`, priority: 60, payload: { nftAddress: canonicalNftAddress, username: feature.normalizedUsername } });
    await store.enqueueJob({ jobType: "username-valuation", dedupeKey: `${canonicalNftAddress}:${USERNAME_ESTIMATOR_VERSION}`, priority: 70, requeueCompleted: true, payload: { nftAddress: canonicalNftAddress, username: feature.normalizedUsername } });
  }
  if (!sourceUrl && options.scheduleHistory !== false) {
    await store.enqueueJob({ jobType: "username-fragment-history", dedupeKey: feature.normalizedUsername, priority: 5, maxAttempts: 8, requeueCompleted: true, payload: { username: feature.normalizedUsername, latestEventId: event.eventId } });
  }
  return Boolean(inserted);
}

async function ingestRows(events, options = {}) {
  let inserted = 0; let rejected = 0;
  const attributed = await withHistoricalUsd(events);
  for (const event of attributed) {
    try { if (await ingest(event, options)) inserted += 1; }
    catch (error) { rejected += 1; console.warn(`[username-ingest] rejected ${event?.eventId || "unknown"}: ${error.message}`); }
  }
  return { inserted, rejected };
}

async function runHistoryBatch() {
  if (sourceUrl || !historyBatchSize) return { processed: 0, inserted: 0, rejected: 0 };
  const jobs = await store.claimJobs(historyWorkerId, historyBatchSize, ["username-fragment-history"]);
  let inserted = 0; let rejected = 0;
  for (const job of jobs) {
    try {
      const events = await fragmentSource.fetchUsernameHistory(job.payload_json?.username);
      const result = await ingestRows(events, { scheduleHistory: false });
      inserted += result.inserted; rejected += result.rejected;
      await store.completeJob(job.id, historyWorkerId);
    } catch (error) {
      await store.failJob(job.id, historyWorkerId, error);
      console.warn(`[username-ingest] history ${job.payload_json?.username || job.id} failed: ${error.message}`);
    }
  }
  return { processed: jobs.length, inserted, rejected };
}

async function runOnce() {
  const checkpoint = await pool.query("SELECT cursor_json FROM username_worker_checkpoints WHERE worker_name=$1 AND checkpoint_key='market-events'", [sourceName]);
  const cursor = checkpoint.rows[0]?.cursor_json?.cursor || "";
  const page = await fetchPage(cursor);
  const latest = await ingestRows(page.events);
  const history = await runHistoryBatch();
  const historyOnlyDone = Boolean(page.historyOnly) && history.processed === 0;
  const nextCursor = historyOnlyDone && !sourceUrl ? liveCursor(page.cycle || 1) : historyOnlyDone ? "" : (page.nextCursor || "");
  await pool.query(`INSERT INTO username_worker_checkpoints (worker_name,checkpoint_key,cursor_json,metadata_json) VALUES ($1,'market-events',$2::jsonb,$3::jsonb) ON CONFLICT (worker_name,checkpoint_key) DO UPDATE SET cursor_json=EXCLUDED.cursor_json,metadata_json=EXCLUDED.metadata_json,updated_at=NOW()`, [sourceName, JSON.stringify({ cursor: nextCursor }), JSON.stringify({ inserted: latest.inserted + history.inserted, rejected: latest.rejected + history.rejected, prefix: page.prefix || null, historyProcessed: history.processed, cycleComplete: historyOnlyDone, observedAt: new Date().toISOString() })]);
  console.log(`[username-ingest] prefix=${page.prefix || "history"} inserted=${latest.inserted + history.inserted} rejected=${latest.rejected + history.rejected} history=${history.processed} next=${nextCursor ? "yes" : "no"}`);
  return !historyOnlyDone;
}

async function main() {
  try {
    await store.init();
    do {
      const hasMore = await runOnce();
      if (!continuous) break;
      if (!hasMore) await new Promise((resolve) => setTimeout(resolve, pollMs));
    } while (true);
  } finally { await pool.end(); }
}

if (require.main === module) main().catch((error) => { console.error(`[username-ingest] fatal: ${error.stack || error.message}`); process.exit(1); });
module.exports = { fetchBridgePage, ingest, ingestRows, main, runHistoryBatch, runOnce, withHistoricalUsd };
