"use strict";

// Validates the frozen exposed-history development protocol before any fit.
const fs = require("node:fs");
const path = require("node:path");
const { readCsv } = require("./evaluate-username-rebuild");
const { sha256 } = require("./audit-username-evaluation-exposure");

function band(usd) {
  if (!Number.isFinite(usd) || usd <= 0) throw new Error("Invalid historical USD label");
  return usd >= 500 ? "premium" : usd >= 100 ? "intermediate" : "ordinary";
}

function period(fold, time) {
  const train = Date.parse(fold.trainUntilExclusive);
  const calibration = Date.parse(fold.calibrationUntilExclusive);
  const evaluation = Date.parse(fold.evaluationUntilExclusive);
  if (![train, calibration, evaluation].every(Number.isFinite) ||
      fold.calibrationFromInclusive !== fold.trainUntilExclusive ||
      fold.evaluationFromInclusive !== fold.calibrationUntilExclusive ||
      !(train < calibration && calibration < evaluation)) throw new Error("Invalid contiguous temporal fold");
  return time < train ? "training" : time < calibration ? "calibration" : time < evaluation ? "evaluation" : null;
}

function summarize(rows) {
  const counts = { attempts: rows.length, uniqueIdentities: new Set(rows.map(row => row.nftAddress)).size };
  for (const label of ["ordinary", "intermediate", "premium"]) {
    const matches = rows.filter(row => band(row.actualUsd) === label);
    counts[label] = { attempts: matches.length, uniqueIdentities: new Set(matches.map(row => row.nftAddress)).size };
  }
  return counts;
}

async function main() {
  const root = path.resolve(__dirname, "..");
  const protocolPath = path.join(root, "research/telegram-usernames/secondary-resale-development-protocol-2026-09-26.json");
  const protocol = JSON.parse(fs.readFileSync(protocolPath, "utf8"));
  if (protocol.version !== "secondary-resale-development-v1" || protocol.folds.length !== 2)
    throw new Error("Unexpected resale development protocol");
  const inputs = Object.values(protocol.sourceFiles).map(item => ({
    path: path.join(root, item.path), expected: item.sha256,
  }));
  for (const input of inputs) if (await sha256(input.path) !== input.expected)
    throw new Error(`Protocol input changed: ${input.path}`);
  const salesPath = inputs[0].path, featuresPath = inputs[1].path;
  const prepared = JSON.parse(fs.readFileSync(featuresPath, "utf8"));
  if (prepared.featureNames.length !== 118) throw new Error("Unexpected time-safe feature schema");
  const featureRows = new Map();
  for (const row of prepared.rows) {
    if (!row.eventId || !row.nftAddress || !Number.isFinite(Date.parse(row.eventTime)) ||
        !Number.isFinite(row.actualUsd) || row.actualUsd <= 0 ||
        !Array.isArray(row.features) || row.features.length !== 118 || !row.features.every(Number.isFinite) ||
        featureRows.has(row.eventId)) throw new Error("Invalid or duplicate prepared feature row");
    featureRows.set(row.eventId, row);
  }
  const joined = new Map();
  await readCsv(salesPath, sale => {
    const id = `${sale.nft_item_address}:${sale.sale_timestamp}:${sale.price_native}`;
    const row = featureRows.get(id);
    if (!row) return;
    const time = Number(sale.sale_timestamp) * 1000;
    if (joined.has(id) || row.nftAddress !== sale.nft_item_address ||
        Date.parse(row.eventTime) !== time || row.actualUsd !== Number(sale.price_usd))
      throw new Error("Feature/sale join conflict");
    const venue = `${sale.market_stage}/${sale.sale_type}`;
    if (!["primary/auction", "secondary/auction", "secondary/sale"].includes(venue))
      throw new Error("Unknown market venue");
    joined.set(id, { eventId: id, nftAddress: row.nftAddress, actualUsd: row.actualUsd,
      time, venue, secondary: venue.startsWith("secondary/") });
  });
  if (joined.size !== featureRows.size || await sha256(salesPath) !== inputs[0].expected)
    throw new Error("Incomplete join or changing historical source");
  const rows = [...joined.values()];
  const folds = protocol.folds.map(fold => {
    const groups = {};
    for (const name of ["training", "calibration", "evaluation"]) {
      const eligible = rows.filter(row => period(fold, row.time) === name);
      groups[name] = { all: summarize(eligible), secondary: summarize(eligible.filter(row => row.secondary)),
        primary: summarize(eligible.filter(row => !row.secondary)) };
    }
    return { id: fold.id, groups };
  });
  const evaluationIds = protocol.folds.map(fold => new Set(rows.filter(row => period(fold, row.time) === "evaluation").map(row => row.eventId)));
  if ([...evaluationIds[0]].some(id => evaluationIds[1].has(id))) throw new Error("Overlapping evaluation events");
  const report = { qualification: false, modelFitted: false, reservedLabelsOpened: false,
    protocolSha256: await sha256(protocolPath), sourceSha256: inputs[0].expected,
    featureExportSha256: inputs[1].expected, featureRows: featureRows.size, joinedRows: joined.size,
    featureWidth: prepared.featureNames.length, folds,
    limitation: "Feature export is a latest-row historical sample; counts prove available prepared rows, not unbiased full-market coverage or model accuracy." };
  const index = process.argv.indexOf("--output");
  if (index < 0 || !process.argv[index + 1]) throw new Error("--output required");
  fs.writeFileSync(path.resolve(process.argv[index + 1]), JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify(report, null, 2));
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { band, period, summarize };
