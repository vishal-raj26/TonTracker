"use strict";

// Exposed-history diagnostic only. A prior completed sale is evidence, not a
// permanent floor or an executable present bid.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { loadHistoricalSales } = require("./evaluate-username-rebuild");
const { ownEvidence } = require("./diagnose-username-own-evidence");

const MODEL_SHA256 = "bcf957d8ac3a1d6adf7800587a0b726b57128fe15012be92e02782022fffa82d";
const SALES_SHA256 = "6d724b74f727a797d553190cb72e408d3c70d6069202636a60f7ea2b2850682f";
const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");

function errors(rows, field) {
  if (!rows.length) return { samples: 0, meanAbsoluteLogError: null, medianFactorError: null };
  const values = rows.map((row) => Math.abs(Math.log(row[field] / row.actualUsd))).sort((a, b) => a - b);
  return { samples: values.length, meanAbsoluteLogError: values.reduce((sum, value) => sum + value, 0) / values.length,
    medianFactorError: Math.exp(values[Math.floor(values.length / 2)]) };
}

function group(rows) {
  const covered = rows.filter((row) => row.ownStatus === "available");
  const ownAge = Object.fromEntries(Object.entries({ under30: (row) => row.ownAgeDays < 30,
    days30to180: (row) => row.ownAgeDays >= 30 && row.ownAgeDays < 180,
    over180: (row) => row.ownAgeDays >= 180 }).map(([name, accept]) => {
    const selected = covered.filter(accept);
    return [name, { samples: selected.length, lastOwn: errors(selected, "priorOwnUsd"),
      allStage: errors(selected, "baseUsd") }];
  }));
  return { attempts: rows.length, uniqueIdentities: new Set(rows.map((row) => row.nftAddress)).size,
    ownAvailable: covered.length, ownAvailableIdentities: new Set(covered.map((row) => row.nftAddress)).size,
    ownAbsent: rows.filter((row) => row.ownStatus === "absent").length,
    ownAmbiguous: rows.filter((row) => row.ownStatus === "ambiguous").length,
    allStageAll: errors(rows, "baseUsd"), allStageOwnCovered: errors(covered, "baseUsd"),
    lastOwnCovered: errors(covered, "priorOwnUsd"), byOwnAge: ownAge };
}

function summarize(rows) {
  const venues = {
    all: () => true,
    secondary: (row) => row.realizedVenue.startsWith("secondary/"),
    secondaryAuction: (row) => row.realizedVenue === "secondary/auction",
    secondaryFixed: (row) => row.realizedVenue === "secondary/sale",
    primary: (row) => row.realizedVenue === "primary/auction",
  };
  const bands = {
    all: () => true,
    ordinary: (row) => row.actualUsd < 100,
    intermediate: (row) => row.actualUsd >= 100 && row.actualUsd < 500,
    premium: (row) => row.actualUsd >= 500,
  };
  return Object.fromEntries(Object.entries(venues).flatMap(([venue, acceptVenue]) =>
    Object.entries(bands).map(([band, acceptBand]) =>
      [`${venue}/${band}`, group(rows.filter((row) => acceptVenue(row) && acceptBand(row)))])));
}

async function main() {
  const outputIndex = process.argv.indexOf("--output");
  if (outputIndex < 0 || !process.argv[outputIndex + 1]) throw new Error("--output required");
  const data = path.resolve(__dirname, "../research/telegram-usernames/data");
  const modelPath = path.join(data, "username-secondary-resale-fixed-development-2026-09-26.json");
  const modelBytes = fs.readFileSync(modelPath);
  if (hash(modelBytes) !== MODEL_SHA256) throw new Error("Frozen exposed model report changed");
  const model = JSON.parse(modelBytes);
  if (model.qualification !== false || model.reservedLabelsOpened !== false || model.attempts !== 30995
    || !Array.isArray(model.results) || model.results.length !== model.attempts
    || new Set(model.results.map((row) => row.eventId)).size !== model.attempts) {
    throw new Error("Invalid exposed model attempt set");
  }
  const { sales, sourceHashes, rejected } = await loadHistoricalSales(data, { fingerprint: true });
  if (sourceHashes["dune_username_sales.part"] !== SALES_SHA256) throw new Error("Historical sale export changed");
  const rows = ownEvidence(sales, model.results.map((row) => ({ ...row,
    baseUsd: row.allStageControl.estimateUsd })));
  for (const row of rows) {
    if (!(row.actualUsd > 0 && row.baseUsd > 0)
      || row.hasPriorOwnSale !== (row.ownStatus === "available")) throw new Error("Own-history identity or price mismatch");
    if (row.ownStatus === "available" && (!(row.priorOwnUsd > 0)
      || Date.parse(row.priorOwnTime) >= Date.parse(row.eventTime)
      || row.priorOwnEventId === row.eventId)) throw new Error("Own sale is not strictly prior");
  }
  const report = {
    qualification: false, developmentOnly: true, productionChanged: false, reserved2026OutcomesOpened: false,
    method: "Latest strictly-prior completed sale of the same NFT contract and unambiguous username; no sale-time, target-price, venue or outcome-based routing",
    inputs: { modelReportSha256: MODEL_SHA256, historicalSalesSha256: SALES_SHA256,
      universeSha256: sourceHashes["tonapi_username_universe.csv"], historicalSalesLoaded: sales.length, rejected },
    attempts: rows.length, cohorts: summarize(rows),
    limitations: ["Exposed historical feature-export targets, not an unbiased current-market sample.",
      "The last own sale is a diagnostic baseline, not an active offer, guaranteed floor or production valuation.",
      "Actual price and realized venue are used only for retrospective reporting; no target-time routing is tested.",
      "Any future learned fusion needs a separately frozen chronological protocol, matched v25 and untouched 2026 validation."],
  };
  const output = path.resolve(process.argv[outputIndex + 1]);
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
  console.log(JSON.stringify({ output, sha256: hash(fs.readFileSync(output)), attempts: rows.length,
    secondaryPremium: report.cohorts["secondary/premium"], secondaryOrdinary: report.cohorts["secondary/ordinary"] }, null, 2));
}

if (require.main === module) main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
module.exports = { errors, group, summarize };
