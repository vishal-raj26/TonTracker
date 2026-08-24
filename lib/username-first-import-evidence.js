"use strict";

const { createFragmentUsernameSource } = require("./fragment-username-source");
const { createTonCenterUsernameVerifier, isRealNftAddress } = require("./toncenter-username-verifier");
const { attributeHistoricalUsd } = require("./gram-usd-history");
const { classifyTelegramUsername } = require("./username-structural");
const { usernameLengthBucket } = require("./username-engine");

function address(asset = {}) { return String(asset.tokenAddress || asset.address || "").trim().toLowerCase(); }

function compactAsset(asset = {}) {
  const feature = classifyTelegramUsername(asset.username || asset.name || asset.displayName || "");
  return {
    assetKind: "username",
    assetKey: address(asset),
    normalizedName: feature.normalizedUsername,
    displayName: feature.displayUsername,
    primaryRoute: feature.primaryRoute,
    lengthBucket: usernameLengthBucket(feature.characterLength),
    script: feature.primaryScript,
    scarcityClass: feature.scarcityClass,
    metadata: { source: "wallet-priority-public-evidence" },
  };
}

function compactSale(event, assetRecord) {
  return {
    saleId: event.eventId,
    assetKind: "username",
    assetKey: assetRecord.assetKey,
    normalizedName: assetRecord.normalizedName,
    soldAt: event.eventTime,
    priceGram: Number(event.priceGram),
    historicalUsdRate: Number(event.historicalUsdRate),
    priceUsd: Number(event.priceUsd),
    marketplace: "Fragment",
    source: "fragment-market+toncenter",
    reliabilityScore: 1,
    qualityFlags: {
      verificationTier: "chain-confirmed",
      historicalUsdSource: event.historicalUsdSource,
      historicalUsdMethod: event.historicalUsdMethod,
      chainEvidence: event.chainEvidence,
      importPriority: true,
    },
    primaryRoute: assetRecord.primaryRoute,
    lengthBucket: assetRecord.lengthBucket,
    script: assetRecord.script,
    scarcityClass: assetRecord.scarcityClass,
  };
}

function createUsernameFirstImportEvidence(options = {}) {
  const maxAssets = Math.max(0, Math.min(24, Number(options.maxAssets ?? process.env.USERNAME_FIRST_IMPORT_EVIDENCE_LIMIT ?? 12)));
  const source = options.source || createFragmentUsernameSource({ requestDelayMs: options.requestDelayMs ?? Number(process.env.USERNAME_FIRST_IMPORT_FRAGMENT_DELAY_MS || 1_500) });
  const verifier = options.verifier || createTonCenterUsernameVerifier(options.verifierOptions);
  const historicalUsd = options.attributeHistoricalUsd || attributeHistoricalUsd;
  const logger = options.logger || console;
  const deadlineMs = Math.max(10_000, Math.min(90_000, Number(options.deadlineMs ?? process.env.USERNAME_FIRST_IMPORT_EVIDENCE_TIMEOUT_MS ?? 55_000)));

  async function enrich(assets = []) {
    const eligible = [];
    const seen = new Set();
    for (const asset of assets) {
      const key = address(asset);
      if (!key || seen.has(key) || !isRealNftAddress(key)) continue;
      try {
        const record = compactAsset(asset);
        seen.add(key);
        eligible.push({ asset, record });
      } catch { /* Ignore malformed username metadata. */ }
      if (eligible.length >= maxAssets) break;
    }
    const inspected = [];
    const verifiedEvents = [];
    const deadlineAt = Date.now() + deadlineMs;
    for (const target of eligible) {
      if (Date.now() >= deadlineAt) {
        break;
      }
      try {
        const history = await source.fetchUsernameRecord(target.record.normalizedName);
        let accepted = 0;
        for (const event of history.events || []) {
          const proof = await verifier.verifyFragmentSale(event, [target.record.assetKey]);
          if (!proof.verified) continue;
          accepted += 1;
          verifiedEvents.push({ ...event, nftAddress: target.record.assetKey, chainEvidence: proof });
        }
        inspected.push({ ...target, reportedSales: (history.events || []).length, verifiedSales: accepted });
      } catch (error) {
        logger.warn?.(`[username-first-import] ${target.record.normalizedName} deferred: ${String(error.message || error).slice(0, 160)}`);
        inspected.push({ ...target, reportedSales: 0, verifiedSales: 0, error: String(error.message || error) });
      }
    }
    const priced = await historicalUsd(verifiedEvents, { logger });
    const sales = [];
    for (const event of priced) {
      if (!(Number(event.historicalUsdRate) > 0) || !(Number(event.priceUsd) > 0)) continue;
      const target = inspected.find((item) => item.record.assetKey === address({ address: event.nftAddress }));
      if (target) sales.push(compactSale(event, target.record));
    }
    return {
      assets: inspected.map((item) => item.record),
      aliases: inspected.map((item) => ({ assetKind: "username", aliasKey: item.record.assetKey, normalizedName: item.record.normalizedName, source: "wallet-priority-public-evidence" })),
      sales,
      inspected: inspected.map(({ record, reportedSales, verifiedSales, error }) => ({ username: record.normalizedName, reportedSales, verifiedSales, error: error || null })),
    };
  }
  return { enrich };
}

module.exports = { createUsernameFirstImportEvidence, compactAsset, compactSale };
