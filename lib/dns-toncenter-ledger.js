"use strict";

const crypto = require("node:crypto");
const { classifyTonDns } = require("./dns-structural");
const { dnsLengthBucket } = require("./dns-engine");
const { attributeHistoricalUsd } = require("./gram-usd-history");
const { canonicalTonAddress } = require("./ton-address");
const { createValuationLedgerClient } = require("./valuation-ledger-client");

const PIPELINE_KEY = "dns-toncenter-history-v1";
const DNS_COLLECTION = "0:b774d95eb20543f186c06b371ab88ad704f7e256130caf96189368a7d0cb6ccf";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function compactFeatures(domain) {
  const feature = classifyTonDns(domain);
  return {
    primaryRoute: feature.primaryRoute,
    lengthBucket: dnsLengthBucket(feature.characterLength),
    script: feature.primaryScript,
    scarcityClass: feature.scarcityClass,
    feature,
  };
}

function createDnsTonCenterLedger(options = {}) {
  const ledger = options.ledger || createValuationLedgerClient();
  const historicalUsd = options.attributeHistoricalUsd || attributeHistoricalUsd;
  const fetchImpl = options.fetch || fetch;
  const baseUrl = String(options.baseUrl || process.env.TONCENTER_API_BASE_URL || "https://toncenter.com/api/v3").replace(/\/+$/, "");
  const apiKey = String(options.apiKey ?? process.env.TONCENTER_API_KEY ?? "").trim();
  const requestDelayMs = Math.max(0, Number(options.requestDelayMs ?? (apiKey ? 0 : 1_100)));
  const pageLimit = Math.max(10, Math.min(500, Number(options.pageLimit ?? process.env.DNS_TONCENTER_PAGE_LIMIT ?? 100)));
  const historyDays = Math.max(30, Number(options.historyDays ?? process.env.DNS_TONCENTER_HISTORY_DAYS ?? 730));
  const now = options.now || (() => Date.now());
  let lastRequestAt = 0;

  async function request(pathname, parameters, attempt = 0) {
    const wait = requestDelayMs - (Date.now() - lastRequestAt);
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();
    const query = new URLSearchParams();
    for (const [key, value] of parameters) query.append(key, String(value));
    const headers = { accept: "application/json", "user-agent": "TonTrack-DNS-Market/2.0" };
    if (apiKey) headers["x-api-key"] = apiKey;
    const response = await fetchImpl(`${baseUrl}${pathname}?${query}`, { headers, signal: AbortSignal.timeout(30_000) });
    if ((response.status === 429 || response.status >= 500) && attempt < 3) {
      await sleep(Math.min(12_000, 1_000 * 2 ** attempt));
      return request(pathname, parameters, attempt + 1);
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`TON Center ${pathname} returned ${response.status}: ${payload.error || payload.message || "unknown error"}`);
    return payload;
  }

  async function runPage() {
    const saved = await ledger.readState(PIPELINE_KEY);
    const cursor = saved.state?.cursor || {};
    const backfillComplete = Boolean(cursor.backfillComplete);
    const beforeLt = backfillComplete ? null : Number(cursor.beforeLt || 0) || null;
    const cutoffSeconds = Math.floor((now() - historyDays * 86_400_000) / 1000);
    const transferParams = [
      ["collection_address", DNS_COLLECTION],
      ["start_utime", cutoffSeconds],
      ["limit", pageLimit],
    ];
    if (beforeLt) transferParams.push(["end_lt", beforeLt]);
    const page = await request("/nft/transfers", transferParams);
    const transfers = Array.isArray(page.nft_transfers) ? page.nft_transfers : [];
    const saleContracts = new Set(Object.entries(page.address_book || {}).flatMap(([address, details]) => (
      (details?.interfaces || []).some((value) => String(value).startsWith("nft_sale_"))
        ? [canonicalTonAddress(address)] : []
    )));
    const candidates = new Map();
    for (const transfer of transfers) {
      if (transfer.transaction_aborted === true) continue;
      const oldOwner = canonicalTonAddress(transfer.old_owner);
      const nftAddress = canonicalTonAddress(transfer.nft_address);
      if (oldOwner && nftAddress && saleContracts.has(oldOwner)) candidates.set(oldOwner, { transfer, nftAddress });
    }
    const salePage = candidates.size
      ? await request("/nft/sales", [...candidates.keys()].map((address) => ["address", address]))
      : { nft_sales: [] };
    const staged = [];
    const assets = [];
    for (const sale of salePage.nft_sales || []) {
      const contract = canonicalTonAddress(sale.address);
      const candidate = candidates.get(contract);
      const nftAddress = canonicalTonAddress(sale.nft_address);
      const details = sale.details || {};
      const domain = String(sale.nft_item?.content?.domain || "").trim().toLowerCase().replace(/\.+$/u, "");
      const priceNano = Number(details.full_price || 0);
      const soldAt = Number(candidate?.transfer?.transaction_now || 0);
      if (!candidate || details.is_complete !== true || nftAddress !== candidate.nftAddress || !domain || !(priceNano > 0) || !(soldAt >= cutoffSeconds)) continue;
      let features;
      try { features = compactFeatures(domain); } catch { continue; }
      const eventTime = new Date(soldAt * 1000).toISOString();
      const priceGram = priceNano / 1_000_000_000;
      const saleId = `toncenter-dns-sale:${crypto.createHash("sha256").update(`${contract}|${nftAddress}|${candidate.transfer.transaction_hash || soldAt}`).digest("hex")}`;
      assets.push({
        assetKind: "dns", assetKey: nftAddress, normalizedName: features.feature.normalizedDomain,
        displayName: features.feature.normalizedDomain, ...features, semantic: {}, sourceUpdatedAt: eventTime,
      });
      staged.push({
        eventId: saleId, nftAddress, domain: features.feature.normalizedDomain, eventType: "sale", eventTime,
        priceGram, paymentAsset: "GRAM", finalized: true, marketplace: "Getgems", features,
      });
    }
    const priced = await historicalUsd(staged, { logger: console });
    const sales = priced.flatMap((event) => Number(event.priceUsd) > 0 && Number(event.historicalUsdRate) > 0 ? [{
      saleId: event.eventId, assetKind: "dns", assetKey: event.nftAddress, normalizedName: event.domain,
      soldAt: event.eventTime, priceGram: event.priceGram, historicalUsdRate: event.historicalUsdRate,
      priceUsd: event.priceUsd, marketplace: "Getgems", source: "toncenter-indexed-sale", reliabilityScore: 1,
      qualityFlags: { verificationTier: "toncenter-completed-sale-contract", historicalUsdSource: event.historicalUsdSource, historicalUsdMethod: event.historicalUsdMethod },
      primaryRoute: event.features.primaryRoute, lengthBucket: event.features.lengthBucket,
      script: event.features.script, scarcityClass: event.features.scarcityClass,
    }] : []);
    const pendingHistoricalUsd = staged.length - sales.length;
    const oldestLt = transfers.reduce((lowest, transfer) => {
      const value = Number(transfer.transaction_lt || 0);
      return value > 0 && (!lowest || value < lowest) ? value : lowest;
    }, 0);
    const exhausted = transfers.length < pageLimit;
    const nextCursor = pendingHistoricalUsd
      ? { beforeLt, backfillComplete }
      : { beforeLt: exhausted || !oldestLt ? null : oldestLt - 1, backfillComplete: backfillComplete || exhausted };
    const [assetsWritten, salesWritten] = await Promise.all([ledger.ingestAssets(assets), ledger.ingestSales(sales)]);
    await ledger.writeState(PIPELINE_KEY, nextCursor, {
      transfers: transfers.length, saleContracts: candidates.size, assets: assetsWritten, sales: salesWritten,
      pendingHistoricalUsd, processedAt: new Date(now()).toISOString(),
    });
    return { ok: true, pipeline: PIPELINE_KEY, transfers: transfers.length, saleContracts: candidates.size, assets: assetsWritten, sales: salesWritten, pendingHistoricalUsd, backfillComplete: nextCursor.backfillComplete };
  }

  return { runPage };
}

module.exports = {
  DNS_COLLECTION,
  PIPELINE_KEY,
  compactFeatures,
  createDnsTonCenterLedger,
  createLedgerClient: createValuationLedgerClient,
};
