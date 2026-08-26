"use strict";

const { createFragmentUsernameSource, liveCursor } = require("../lib/fragment-username-source");
const { createPublicSettlementSource } = require("../lib/username-settlement-source");
const { createTonCenterUsernameVerifier } = require("../lib/toncenter-username-verifier");
const { attributeHistoricalUsd } = require("../lib/gram-usd-history");
const { classifyTelegramUsername } = require("../lib/username-structural");
const { usernameLengthBucket } = require("../lib/username-engine");
const { USERNAME_COLLECTION } = require("../lib/username-collection");
const { createValuationLedgerClient } = require("../lib/valuation-ledger-client");

const PIPELINE_KEY = "username-fragment-sales-v1";
const continuous = process.argv.includes("--continuous");
const source = createFragmentUsernameSource();
const publicSettlementSourceUrl = String(process.env.USERNAME_PUBLIC_SETTLEMENT_SOURCE_URL || "").trim();
const publicSettlementSource = publicSettlementSourceUrl ? createPublicSettlementSource() : null;
let ledger = createValuationLedgerClient();
const chainVerificationEnabled = !/^(0|false|no)$/i.test(String(process.env.USERNAME_TONCENTER_VERIFY_ENABLED || ""));
const chainVerificationBatchSize = Math.max(0, Math.min(10, Number(process.env.USERNAME_TONCENTER_VERIFY_BATCH_SIZE || 2)));
const identityResolveBatchSize = Math.max(0, Math.min(10, Number(process.env.USERNAME_FRAGMENT_IDENTITY_RESOLVE_BATCH_SIZE || 3)));
const historyBackfillBatchSize = Math.max(1, Math.min(10, Number(process.env.USERNAME_FRAGMENT_HISTORY_BATCH_SIZE || 3)));
const fragmentPageDelayMs = Math.max(1_500, Number(process.env.USERNAME_FRAGMENT_PAGE_DELAY_MS || 5_000));
const fragmentDeferredDelayMs = Math.max(60_000, Number(process.env.USERNAME_FRAGMENT_DEFERRED_DELAY_MS || 15 * 60 * 1000));
const historySweepIntervalMs = Math.max(6 * 60 * 60 * 1000, Number(process.env.USERNAME_FRAGMENT_HISTORY_SWEEP_INTERVAL_MS || 7 * 24 * 60 * 60 * 1000));
const chainVerifier = chainVerificationEnabled && chainVerificationBatchSize ? createTonCenterUsernameVerifier() : null;
const identityResolver = identityResolveBatchSize ? createTonCenterUsernameVerifier() : null;

function evidencePriority(event) {
  return Math.max(0, Number(event?.priceUsd || 0), Number(event?.priceGram || 0));
}

function marketEvidenceOrder(events) {
  return (events || []).map((event, index) => ({ event, index, priority: evidencePriority(event) }))
    .sort((left, right) => right.priority - left.priority || left.index - right.index)
    .map(({ event }) => event);
}

function marketPriorityUsernames(events) {
  const best = new Map();
  for (const event of (events || []).map((row, index) => ({ row, index, priority: evidencePriority(row) }))) {
    const name = String(event.row?.username || "").toLowerCase();
    if (!name) continue;
    const current = best.get(name);
    if (!current || event.priority > current.priority || (event.priority === current.priority && event.index < current.index)) best.set(name, event);
  }
  return [...best.entries()].sort((left, right) => right[1].priority - left[1].priority || left[1].index - right[1].index).map(([name]) => name);
}

function compactAsset(event, feature) {
  return {
    assetKind: "username",
    assetKey: String(event.nftAddress).toLowerCase(),
    normalizedName: feature.normalizedUsername,
    displayName: feature.displayUsername,
    primaryRoute: feature.primaryRoute,
    lengthBucket: usernameLengthBucket(feature.characterLength),
    script: feature.primaryScript,
    scarcityClass: feature.scarcityClass,
    feature: {
      characterLength: feature.characterLength,
      characterClass: feature.characterClass,
      routes: feature.routes,
      patternSignature: feature.patternSignature,
      uniqueCharacterCount: feature.uniqueCharacterCount,
      maxRunLength: feature.maxRunLength,
      palindrome: feature.palindrome,
      sequence: feature.sequence,
      containsUnderscore: feature.containsUnderscore,
      wordHint: feature.wordHint,
    },
    sourceUpdatedAt: new Date(event.eventTime).toISOString(),
  };
}

function compactSale(event, feature) {
  return {
    saleId: event.eventId,
    assetKind: "username",
    assetKey: String(event.nftAddress).toLowerCase(),
    normalizedName: feature.normalizedUsername,
    soldAt: event.eventTime,
    priceGram: Number(event.priceGram),
    historicalUsdRate: Number(event.historicalUsdRate),
    priceUsd: Number(event.priceUsd),
    marketplace: event.marketplace || "Fragment",
    source: event.chainEvidence?.verified ? "fragment-market+toncenter" : "fragment-market-reported",
    // A public Fragment row is useful discovery evidence, but not independent
    // on-chain verification. Only a matched real item settlement can enter a
    // trusted market baseline.
    reliabilityScore: event.chainEvidence?.verified ? 1 : 0.6,
    qualityFlags: { fragment: event.qualityFlags || [], chainEvidence: event.chainEvidence || null, verificationTier: event.chainEvidence?.verified ? "chain-confirmed" : "market-reported" },
    primaryRoute: feature.primaryRoute,
    lengthBucket: usernameLengthBucket(feature.characterLength),
    script: feature.primaryScript,
    scarcityClass: feature.scarcityClass,
  };
}

async function enrichChainEvidence(events) {
  if (!chainVerifier || !events.length) return events;
  const names = [...new Set(events.map((event) => String(event.username || "").toLowerCase()).filter(Boolean))];
  const aliases = await ledger.readAliases("username", names);
  const byName = new Map();
  for (const row of aliases.records || []) {
    const name = String(row.normalized_name || "").toLowerCase();
    if (!name || !row.alias_key) continue;
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(row.alias_key);
  }
  let attempted = 0;
  const enriched = [];
  for (const event of marketEvidenceOrder(events)) {
    const addresses = [...new Set([event.nftAddress, ...(byName.get(String(event.username || "").toLowerCase()) || [])])];
    if (!addresses.length || attempted >= chainVerificationBatchSize) {
      enriched.push(event);
      continue;
    }
    attempted += 1;
    try {
      const chainEvidence = await chainVerifier.verifyFragmentSale(event, addresses);
      enriched.push({ ...event, chainEvidence });
    } catch (error) {
      // Chain confirmation is additive. A temporary public API error must not
      // stop the durable Fragment sales cursor or discard a completed sale.
      enriched.push({ ...event, chainEvidence: { verified: false, reason: "toncenter-deferred", detail: String(error.message || error).slice(0, 160) } });
    }
  }
  return enriched;
}

async function resolveDiscoveredItemIdentity(events) {
  if (publicSettlementSource || !identityResolver || !identityResolveBatchSize) return events;
  const resolved = [...events];
  const names = marketPriorityUsernames(events).slice(0, identityResolveBatchSize);
  for (const username of names) {
    try {
      const record = await source.fetchUsernameRecord(username);
      if (!record.currentOwnerAddress) continue;
      const nftAddress = await identityResolver.findOwnedUsernameNft(record.currentOwnerAddress, username, USERNAME_COLLECTION);
      if (!nftAddress) continue;
      for (let index = 0; index < resolved.length; index += 1) {
        if (String(resolved[index].username || "").toLowerCase() === username) resolved[index] = { ...resolved[index], nftAddress };
      }
      for (const event of record.events || []) resolved.push({ ...event, nftAddress });
    } catch (error) {
      console.warn(`[username-ledger] identity resolve ${username} deferred: ${String(error.message || error).slice(0, 160)}`);
    }
  }
  return resolved;
}

async function fetchHistoryBackfillPage(cursor = null) {
  const page = await ledger.readAssets("username", cursor, historyBackfillBatchSize);
  const events = [];
  for (const asset of page.records || []) {
    const username = String(asset.normalized_name || "").toLowerCase();
    if (!username) continue;
    try {
      const record = await source.fetchUsernameRecord(username);
      let nftAddress = String(asset.asset_key || "").toLowerCase();
      if (!/^([+-]?[01]):[0-9a-f]{64}$/i.test(nftAddress) && record.currentOwnerAddress && identityResolver) {
        nftAddress = await identityResolver.findOwnedUsernameNft(record.currentOwnerAddress, username, USERNAME_COLLECTION) || "";
      }
      if (!nftAddress) continue;
      for (const event of record.events || []) events.push({ ...event, nftAddress });
    } catch (error) {
      console.warn(`[username-ledger] history backfill ${username} deferred: ${String(error.message || error).slice(0, 160)}`);
    }
  }
  return { events, nextCursor: page.nextCursor || null, inspected: (page.records || []).length };
}

async function runPage() {
  const saved = await ledger.readState(PIPELINE_KEY);
  const cursor = saved.state?.cursor?.value || "";
  let page;
  try {
    page = publicSettlementSource ? await publicSettlementSource.fetchPage(cursor) : await source.fetchPage(cursor);
  } catch (error) {
    if (error?.code !== "FRAGMENT_DEFERRED") throw error;
    await ledger.writeState(PIPELINE_KEY, { value: cursor }, {
      ...(saved.state?.meta || {}),
      deferred: true,
      deferredAt: new Date().toISOString(),
      lastError: String(error.message || error).slice(0, 240),
    });
    console.warn(`[username-ledger] deferred at persisted cursor: ${String(error.message || error).slice(0, 180)}`);
    return { hasMore: false, delayMs: fragmentDeferredDelayMs, deferred: true };
  }
  let historyBackfill = null;
  if (!publicSettlementSource && page.historyOnly) {
    const completedAt = Date.parse(saved.state?.meta?.historyCompletedAt || "");
    const recentlyCompleted = !saved.state?.meta?.historyAssetCursor && Number.isFinite(completedAt) && Date.now() - completedAt < historySweepIntervalMs;
    historyBackfill = recentlyCompleted
      ? { events: [], nextCursor: null, inspected: 0, skippedRecentSweep: true }
      : await fetchHistoryBackfillPage(saved.state?.meta?.historyAssetCursor || null);
    page = { ...page, events: historyBackfill.events };
  }
  const resolvedEvents = await resolveDiscoveredItemIdentity(page.events || []);
  const historicalSales = await attributeHistoricalUsd(resolvedEvents, { logger: console });
  const sales = await enrichChainEvidence(historicalSales);
  const assets = [];
  const records = [];
  let rejected = 0;
  for (const event of sales) {
    try {
      const feature = classifyTelegramUsername(event.username || event.displayName || "");
      if (!(Number(event.historicalUsdRate) > 0) || !(Number(event.priceUsd) > 0)) throw new Error("historical USD rate unavailable");
      assets.push(compactAsset(event, feature));
      records.push(compactSale(event, feature));
    } catch { rejected += 1; }
  }
  const assetsChanged = await ledger.ingestAssets(assets);
  const salesInserted = await ledger.ingestSales(records);
  const historyComplete = Boolean(page.historyOnly && historyBackfill && !historyBackfill.nextCursor);
  const nextCursor = publicSettlementSource
    ? (page.nextCursor || cursor)
    : (page.historyOnly ? (historyComplete ? liveCursor(page.cycle || 1) : cursor) : (page.nextCursor || cursor));
  await ledger.writeState(PIPELINE_KEY, { value: nextCursor }, {
    prefix: page.prefix || null,
    cycle: page.cycle || 1,
    historyOnly: Boolean(page.historyOnly),
    sourceRows: page.events?.length || 0,
    accepted: records.length,
    rejected,
    deferred: false,
    budgetExhausted: Boolean(page.budgetExhausted),
    searchRequests: Number(page.searchRequests || 0),
    historyAssetCursor: page.historyOnly ? (historyBackfill?.nextCursor || null) : (saved.state?.meta?.historyAssetCursor || null),
    historyAssetsInspected: Number(historyBackfill?.inspected || 0),
    historyComplete,
    historyCompletedAt: historyComplete && !historyBackfill?.skippedRecentSweep
      ? new Date().toISOString()
      : (saved.state?.meta?.historyCompletedAt || null),
    updatedAt: new Date().toISOString(),
  });
  console.log(`[username-ledger] prefix=${page.prefix || (page.historyOnly ? "history" : "latest")} assets=${assetsChanged} sales=${salesInserted} rejected=${rejected} searches=${Number(page.searchRequests || 0)}${page.budgetExhausted ? " budget-exhausted" : ""}`);
  return publicSettlementSource
    ? { hasMore: Boolean(page.nextCursor), delayMs: page.nextCursor ? fragmentPageDelayMs : 6 * 60 * 60 * 1000 }
    : { hasMore: !page.historyOnly || !historyComplete, delayMs: page.historyOnly && historyComplete ? 6 * 60 * 60 * 1000 : fragmentPageDelayMs };
}

function configureLedger(options = {}) {
  ledger = createValuationLedgerClient(options);
}

async function main() {
  do {
    const result = await runPage();
    if (!continuous) break;
    await new Promise((resolve) => setTimeout(resolve, result.delayMs));
  } while (true);
}

if (require.main === module) main().catch((error) => {
  console.error(`[username-ledger] fatal: ${error.stack || error.message}`);
  process.exit(1);
});

module.exports = { PIPELINE_KEY, compactAsset, compactSale, enrichChainEvidence, fetchHistoryBackfillPage, resolveDiscoveredItemIdentity, runPage, configureLedger, marketEvidenceOrder, marketPriorityUsernames };
