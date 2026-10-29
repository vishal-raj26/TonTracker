"use strict";
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const { loadHistoricalSales } = require("./evaluate-username-rebuild");
const { completedSale } = require("../lib/username-estimator");
const { exportFeatures } = require("./export-username-tabular-semantics");
const { loadWordnetSnapshot } = require("./username-wordnet-snapshot");
const { loadGloveSnapshot } = require("./username-glove-snapshot");
const { FEATURE_NAMES } = require("../lib/username-learned-model");
function selectTraining(sales, until, limit) {
  const unique = new Map();
  for (const sale of sales) {
    if (!completedSale(sale) || !sale.nftAddress || !Number.isFinite(Date.parse(sale.eventTime)) || sale.eventTime >= until) continue;
    const key = `${sale.nftAddress}:${sale.eventTime}:${sale.priceUsd}`;
    if (!unique.has(key) || sale.reliabilityScore > unique.get(key).reliabilityScore) unique.set(key, sale);
  }
  return [...unique.values()].sort((a, b) => a.eventTime.localeCompare(b.eventTime) || a.eventId.localeCompare(b.eventId)).slice(-limit);
}
async function main() {
  const root = path.resolve(__dirname, "../research/telegram-usernames");
  const protocolBytes = fs.readFileSync(path.join(root, "tabular-broad-protocol.json"));
  const protocol = JSON.parse(protocolBytes);
  const { sales, rejected, sourceHashes } = await loadHistoricalSales(undefined, { fingerprint: true });
  const dictionary = loadWordnetSnapshot(), vectors = loadGloveSnapshot();
  const folds = protocol.folds.map(fold => ({ ...fold, rows: selectTraining(sales, fold.trainingUntil, protocol.maxDenseTrainingRows) }));
  const unique = new Map(folds.flatMap(fold => fold.rows.map(row => [row.eventId, row])));
  const rows = [...unique.values()];
  const prepared = exportFeatures(rows, dictionary, vectors);
  const report = { protocolSha256: crypto.createHash("sha256").update(protocolBytes).digest("hex"), sourceHashes, rejected,
    featureNames: [...FEATURE_NAMES, "semantic_vector_present", ...Array.from({length:50}, (_, i) => `semantic_vector_${i}`)],
    folds: folds.map(({rows: selected, ...fold}) => ({ ...fold, eventIds: selected.map(row => row.eventId) })),
    rows: prepared.map((row, i) => ({ ...row, username: rows[i].username, actualUsd: rows[i].priceUsd })) };
  const index = process.argv.indexOf("--output");
  if (index < 0) throw new Error("--output required");
  fs.writeFileSync(path.resolve(process.argv[index + 1]), JSON.stringify(report) + "\n", {flag:"wx"});
  console.log(JSON.stringify({ rows: rows.length, folds: folds.map(fold => ({id:fold.id, rows:fold.rows.length})), sourceHashes }));
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { selectTraining };
