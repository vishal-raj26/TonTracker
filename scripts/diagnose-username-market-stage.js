"use strict";
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const { readCsv } = require("./evaluate-username-rebuild");
const { sha256 } = require("./audit-username-evaluation-exposure");
async function main() {
  const dir = path.resolve(__dirname, "../research/telegram-usernames/data");
  const sourceFile = path.join(dir, "dune_username_sales.part");
  const sourceSha256 = await sha256(sourceFile);
  if (sourceSha256 !== "6d724b74f727a797d553190cb72e408d3c70d6069202636a60f7ea2b2850682f") throw new Error("Sales source changed");
  const bytes = fs.readFileSync(path.join(dir, "username-own-evidence-development-2026-09-09.json"));
  const evidenceSha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  const targets = JSON.parse(bytes).rows;
  const ids = new Set(targets.map(row => row.eventId)), metadata = new Map();
  await readCsv(sourceFile, row => {
    const eventId = `${row.nft_item_address}:${row.sale_timestamp}:${row.price_native}`;
    if (!ids.has(eventId)) return;
    const value = { marketStage: row.market_stage, saleType: row.sale_type, priceNative: Number(row.price_native),
      eventUsdRate: Number(row.event_usd_rate), hasTransactionHash: row.tx_hash && row.tx_hash !== "<nil>",
      actualUsd: Number(row.price_usd) };
    const previous = metadata.get(eventId);
    if (previous && JSON.stringify(previous) !== JSON.stringify(value)) throw new Error("Ambiguous metadata join");
    metadata.set(eventId, value);
  });
  if (await sha256(sourceFile) !== sourceSha256) throw new Error("Source changed during reading");
  const rows = targets.map(target => {
    const meta = metadata.get(target.eventId);
    if (!meta || meta.actualUsd !== target.actualUsd) throw new Error("Missing/mismatched target metadata");
    return { ...target, ...meta };
  });
  const groups = {};
  for (const row of rows) {
    const band = row.actualUsd >= 500 ? "premium" : row.actualUsd >= 100 ? "intermediate" : "ordinary";
    const key = `${band}/${row.marketStage}/${row.saleType}`;
    const group = groups[key] ||= { samples: 0, ownAvailable: 0, noOwnOrVector: 0, nativePrices: {}, errors: [], withTransactionHash: 0 };
    group.samples += 1;
    group.ownAvailable += Number(row.ownStatus === "available");
    group.noOwnOrVector += Number(row.ownStatus !== "available" && !(row.vectorUsd > 0));
    group.nativePrices[row.priceNative] = (group.nativePrices[row.priceNative] || 0) + 1;
    group.errors.push(Math.abs(Math.log(row.baseUsd / row.actualUsd)));
    group.withTransactionHash += Number(Boolean(row.hasTransactionHash));
  }
  for (const group of Object.values(groups)) {
    group.errors.sort((a, b) => a - b);
    group.meanAbsoluteLogError = group.errors.reduce((a, b) => a + b, 0) / group.errors.length;
    group.medianFactorError = Math.exp(group.errors[Math.floor(group.errors.length / 2)]);
    group.frequentNativePrices = Object.entries(group.nativePrices).sort((a,b) => b[1]-a[1]).slice(0, 8);
    delete group.errors; delete group.nativePrices;
  }
  const report = { diagnosticOnly: true, qualification: false, sourceSha256, evidenceSha256,
    note: "Realized sale stage/type are outcome metadata for diagnosis, NOT permitted target features without independent pre-cutoff provenance", groups, rows };
  const index = process.argv.indexOf("--output");
  if (index < 0) throw new Error("--output required");
  fs.writeFileSync(path.resolve(process.argv[index + 1]), JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify(groups, null, 2));
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
