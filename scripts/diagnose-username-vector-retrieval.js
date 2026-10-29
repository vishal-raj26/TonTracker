"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { loadHistoricalSales } = require("./evaluate-username-rebuild");
const { loadGloveSnapshot } = require("./username-glove-snapshot");
const { createHistoricalVectorRetrieval } = require("../lib/username-vector-retrieval");

async function main() {
  const { sales, sourceHashes } = await loadHistoricalSales(undefined, { fingerprint: true });
  const snapshot = loadGloveSnapshot();
  const retrieve = createHistoricalVectorRetrieval(sales, { knowledge: snapshot.knowledge });
  // Reconstruct the established broad development sampling schedule, not a new
  // qualification set. Target labels never enter retrieval or sample selection.
  const rows = [];
  for (let index = Math.max(0, sales.length - 200000); index < sales.length; index += 1000) {
    const target = sales[index];
    const candidates = retrieve(target, Date.parse(target.eventTime), 10);
    rows.push({ target: { username: target.username, nftAddress: target.nftAddress, eventId: target.eventId,
      eventTime: target.eventTime, historicalPriceUsd: target.priceUsd },
      hasVector: Array.isArray(snapshot.knowledge(target.username).semanticVector),
      candidates: candidates.map(({ sale, cosineSimilarity }) => ({ username: sale.username,
        nftAddress: sale.nftAddress, eventId: sale.eventId, eventTime: sale.eventTime,
        historicalPriceUsd: sale.priceUsd, cosineSimilarity })) });
  }
  const report = { method: "Development-only historical-vector candidate diagnostic; not a valuation or economic-equivalence claim",
    sourceHashes, snapshot: { release: snapshot.release, availableBy: snapshot.availableBy },
    targets: rows.length, coveredTargets: rows.filter(row => row.candidates.length).length, rows };
  const index = process.argv.indexOf("--output");
  if (index >= 0) {
    if (!process.argv[index + 1]) throw new Error("--output requires a file path");
    fs.writeFileSync(path.resolve(process.argv[index + 1]), JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  }
  console.log(JSON.stringify({ ...report, rows: report.rows.filter(row => row.candidates.length).map(row => ({
    username: row.target.username, historicalPriceUsd: row.target.historicalPriceUsd,
    candidates: row.candidates.slice(0, 3) })) }, null, 2));
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
