"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

async function sha256(file) {
  const hash = crypto.createHash("sha256");
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

function auditReports(reports) {
  const identities = new Set();
  const settlements = new Set();
  const inventory = reports.map(({ file, hash, report }) => {
    const completeTargets = Array.isArray(report.evaluationCases)
      && Number.isInteger(report.attempted) && report.evaluationCases.length === report.attempted;
    const cases = completeTargets ? report.evaluationCases : report.largestMisses || [];
    for (const row of cases) {
      if (row.nftAddress) identities.add(row.nftAddress);
      if (row.eventId) settlements.add(row.eventId);
    }
    return { file, sha256: hash, estimatorVersion: report.estimatorVersion || null,
      attempted: report.attempted ?? null, evaluated: report.evaluated ?? null,
      completeTargets, sourceHashesRecorded: Boolean(report.sourceHashes),
      observedSourceSpan: { firstSale: report.firstSale || null, lastSale: report.lastSale || null },
      evaluationWindow: report.evaluationWindow || null, knownTargetCount: cases.length };
  });
  return { schemaVersion: "username-evaluation-exposure-v1", qualificationEligible: false,
    reason: "Previously inspected reports are development evidence. Partial target logs or missing historical source hashes cannot establish an untouched holdout. This inventory never certifies freshness by absence.",
    reportCount: inventory.length, reportsWithIncompleteTargets: inventory.filter(row => !row.completeTargets).length,
    knownTargetIdentities: identities.size, knownSettlementIds: settlements.size, reports: inventory };
}

async function main() {
  const directory = path.resolve(__dirname, "../research/telegram-usernames/data");
  const reports = [];
  for (const file of fs.readdirSync(directory).filter(name => name.endsWith(".json")).sort()) {
    // Inventory metadata only; do not load large raw collection inventories.
    const absolute = path.join(directory, file);
    if (fs.statSync(absolute).size > 2_000_000) continue;
    const content = fs.readFileSync(absolute, "utf8");
    let report;
    try { report = JSON.parse(content); } catch { continue; }
    if (!report.estimatorVersion || !Number.isInteger(report.evaluated)) continue;
    reports.push({ file, hash: crypto.createHash("sha256").update(content).digest("hex"), report });
  }
  const sourceHashes = {};
  for (const file of ["dune_username_sales.part", "tonapi_username_universe.csv"]) {
    const absolute = path.join(directory, file);
    sourceHashes[file] = { sha256: await sha256(absolute), bytes: fs.statSync(absolute).size };
  }
  const result = { createdAt: new Date().toISOString(), sourceHashes, ...auditReports(reports) };
  const index = process.argv.indexOf("--output");
  if (index >= 0) {
    if (!process.argv[index + 1]) throw new Error("--output requires a path");
    fs.writeFileSync(path.resolve(process.argv[index + 1]), JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
  }
  console.log(JSON.stringify({ ...result, reports: undefined }, null, 2));
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { auditReports, sha256 };
