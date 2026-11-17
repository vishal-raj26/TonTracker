"use strict";

// Research-only point-in-time feature export. Output contains no target prices.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { loadHistoricalSales } = require("./evaluate-username-rebuild");
const { ownEvidence } = require("./diagnose-username-own-evidence");

const PROTOCOL_SHA256 = "6c02cb4c743579def9e922c98736cbae658b6f3015e9b7e24fa82d1f4bfd1b25";
const SALES_SHA256 = "6d724b74f727a797d553190cb72e408d3c70d6069202636a60f7ea2b2850682f";
const BASE_FEATURE_SHA256 = "00b13883db59d511ee1625f0186c115c1d765e6e9b504c4a0980de15acaec77a";
const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");

function validateProtocol(protocolBytes) {
  if (hash(protocolBytes) !== PROTOCOL_SHA256) throw new Error("Frozen own-history protocol changed");
  const protocol = JSON.parse(protocolBytes);
  if (!protocol.frozenBeforeFitting || protocol.version !== "secondary-own-history-development-v1")
    throw new Error("Own-history protocol is not frozen");
  return protocol;
}

function buildFeatures(baseRows, sales) {
  const ids = new Set();
  const baseById = new Map();
  for (const row of baseRows) {
    if (!row.eventId || ids.has(row.eventId) || !row.nftAddress || !row.username || !Number.isFinite(Date.parse(row.eventTime)))
      throw new Error("Invalid or duplicate prepared event identity");
    ids.add(row.eventId);
    baseById.set(row.eventId, row);
  }
  const enriched = ownEvidence(sales, baseRows);
  if (enriched.length !== baseRows.length) throw new Error("Own-history join count mismatch");
  let available = 0, absent = 0, ambiguous = 0;
  const rows = enriched.map((row) => {
    const base = baseById.get(row.eventId);
    if (row.eventId !== base.eventId || row.nftAddress !== base.nftAddress || row.username !== base.username
      || row.eventTime !== base.eventTime) throw new Error("Prepared/own-history identity mismatch");
    if (row.ownStatus === "available") {
      available += 1;
      if (!(row.priorOwnUsd > 0 && row.ownAgeDays >= 0 && row.ownCount > 0)
        || Date.parse(row.priorOwnTime) >= Date.parse(row.eventTime) || row.priorOwnEventId === row.eventId)
        throw new Error("Own-history record is not strictly prior and valid");
    } else if (row.ownStatus === "absent") absent += 1;
    else if (row.ownStatus === "ambiguous") ambiguous += 1;
    else throw new Error(`Unknown own-history status: ${row.ownStatus}`);
    return {
      eventId: row.eventId, nftAddress: row.nftAddress, username: row.username, eventTime: row.eventTime,
      hasPriorOwnSale: row.ownStatus === "available",
      priorOwnPriceUsd: row.ownStatus === "available" ? row.priorOwnUsd : null,
      priorOwnAgeDays: row.ownStatus === "available" ? row.ownAgeDays : null,
      priorOwnSaleCount: row.ownStatus === "available" ? row.ownCount : 0,
    };
  });
  return { rows, availability: { available, absent, ambiguous } };
}

async function main() {
  const outIndex = process.argv.indexOf("--output");
  const auditIndex = process.argv.indexOf("--audit-output");
  if (outIndex < 0 || auditIndex < 0 || !process.argv[outIndex + 1] || !process.argv[auditIndex + 1])
    throw new Error("--output and --audit-output are required");
  const root = path.resolve(__dirname, "..");
  const data = path.join(root, "research/telegram-usernames/data");
  const protocolBytes = fs.readFileSync(path.join(root, "research/telegram-usernames/secondary-own-history-development-protocol-2026-09-27.json"));
  const protocol = validateProtocol(protocolBytes);
  const basePath = path.join(root, protocol.sources.pointInTimeFeatureExport.path);
  const baseBytes = fs.readFileSync(basePath);
  if (hash(baseBytes) !== BASE_FEATURE_SHA256) throw new Error("Frozen base feature export changed");
  const base = JSON.parse(baseBytes);
  if (base.rows.length !== protocol.sources.pointInTimeFeatureExport.rows || base.featureNames.length !== 118)
    throw new Error("Unexpected prepared feature schema/count");
  const { sales, sourceHashes, rejected } = await loadHistoricalSales(data, { fingerprint: true });
  if (sourceHashes["dune_username_sales.part"] !== SALES_SHA256 || sales.length !== 340000)
    throw new Error("Frozen historical sale source changed");
  const built = buildFeatures(base.rows, sales);
  const featurePayload = {
    schemaVersion: "username-own-history-features-v1", protocolSha256: PROTOCOL_SHA256,
    baseFeatureSha256: BASE_FEATURE_SHA256, historicalSalesSha256: SALES_SHA256,
    featureNames: ["hasPriorOwnSale", "priorOwnPriceUsd", "priorOwnAgeDays", "priorOwnSaleCount"],
    rows: built.rows,
  };
  const featureBytes = `${JSON.stringify(featurePayload)}\n`;
  const featurePath = path.resolve(process.argv[outIndex + 1]);
  fs.writeFileSync(featurePath, featureBytes, { flag: "wx" });
  const audit = {
    qualification: false, labelsOpened: false, protocolSha256: PROTOCOL_SHA256,
    protocolFeatureExporterSha256: hash(fs.readFileSync(__filename)),
    baseFeatureSha256: BASE_FEATURE_SHA256, historicalSalesSha256: SALES_SHA256,
    universeSha256: sourceHashes["tonapi_username_universe.csv"],
    rows: built.rows.length, uniqueEventIds: new Set(built.rows.map((row) => row.eventId)).size,
    availability: built.availability, featureFile: path.basename(featurePath), featureFileSha256: hash(Buffer.from(featureBytes)),
    prohibitedTargetFieldsPresent: ["actualUsd", "priceUsd", "realizedVenue"].some((key) =>
      built.rows.some((row) => Object.hasOwn(row, key))), rejectedSales: rejected,
  };
  if (audit.rows !== audit.uniqueEventIds || audit.rows !== 81617 || audit.prohibitedTargetFieldsPresent)
    throw new Error("Own-history feature audit failed");
  fs.writeFileSync(path.resolve(process.argv[auditIndex + 1]), `${JSON.stringify(audit, null, 2)}\n`, { flag: "wx" });
  console.log(JSON.stringify(audit, null, 2));
}

if (require.main === module) main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
module.exports = { buildFeatures, validateProtocol };
