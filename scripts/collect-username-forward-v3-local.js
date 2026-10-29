"use strict";

// Independent, future-dated qualification cohort. Never changes the v2 collector.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { createTonCenterUsernameSettlementLedger } = require("../lib/toncenter-username-settlement-ledger");

const DIRECTORY = "current-username-settlements-forward-v3";
const MAX_SALE_ROWS_PER_BLOCK = 10000;
const BLOCKS = Object.freeze([
  Object.freeze({ from: "2026-10-04T00:00:00Z", until: "2026-10-06T00:00:00Z" }),
  Object.freeze({ from: "2026-10-11T00:00:00Z", until: "2026-10-13T00:00:00Z" }),
  Object.freeze({ from: "2026-10-18T00:00:00Z", until: "2026-10-20T00:00:00Z" }),
]);

function blockIndex(argv) {
  const index = argv.indexOf("--block");
  const value = index < 0 ? NaN : Number(argv[index + 1]);
  if (!Number.isInteger(value) || value < 0 || value >= BLOCKS.length)
    throw new Error(`--block must be an integer from 0 through ${BLOCKS.length - 1}`);
  return value;
}

function cutoff(argv, block, now = Date.now()) {
  const index = argv.indexOf("--until");
  const value = index < 0 ? NaN : Date.parse(argv[index + 1] || "");
  if (!Number.isFinite(value) || value <= Date.parse(block.from) || value > now)
    throw new Error("--until must be after this block starts and no later than now");
  return Math.floor(Math.min(value, Date.parse(block.until)) / 1000);
}

function pageSize(argv) {
  const index = argv.indexOf("--page-size");
  const value = index < 0 ? 80 : Number(argv[index + 1]);
  if (!Number.isInteger(value) || value < 10 || value > 80)
    throw new Error("--page-size must be an integer from 10 through 80");
  return value;
}

function assertCompletePage(metadata, capturedSales, pageLimit) {
  if (metadata.pendingHistoricalUsd) throw new Error("Historical USD incomplete; no partial page checkpoint written");
  if (metadata.sales !== capturedSales) throw new Error("Verified sales and captured sales differ");
  if (capturedSales > pageLimit) throw new Error("Sale rows exceeded message-page capacity");
}

async function main() {
  const index = blockIndex(process.argv);
  const block = BLOCKS[index];
  const historyEndUtime = cutoff(process.argv, block);
  const requestedPageLimit = pageSize(process.argv);
  const directory = path.resolve(__dirname, `../research/telegram-usernames/data/${DIRECTORY}/block-${index}`);
  fs.mkdirSync(directory, { recursive: true });
  const statePath = path.join(directory, "state.json");
  const saved = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, "utf8")) : null;
  if (saved && (saved.schemaVersion !== "username-forward-v3-local-v1" || saved.block !== index
    || saved.from !== block.from || saved.until !== block.until
    || saved.cursor?.paginationMode !== "time-offset" || !Number.isInteger(saved.saleRows)
    || saved.saleRows < 0 || saved.saleRows > MAX_SALE_ROWS_PER_BLOCK))
    throw new Error("Incompatible forward-v3 checkpoint");
  const remaining = MAX_SALE_ROWS_PER_BLOCK - (saved?.saleRows || 0);
  if (remaining < 10) throw new Error("Forward-v3 block cap reached; do not collect another page");
  const pageLimit = Math.min(requestedPageLimit, remaining);
  const captured = { assets: [], sales: [] };
  const ledger = {
    readState: async () => saved ? { state: { cursor: saved.cursor } } : null,
    ingestAssets: async rows => { captured.assets.push(...rows); return rows.length; },
    ingestSales: async rows => { captured.sales.push(...rows); return rows.length; },
    writeState: async (pipeline, cursor, metadata) => {
      assertCompletePage(metadata, captured.sales.length, pageLimit);
      const report = { schemaVersion: "username-forward-v3-local-v1", block: index,
        from: block.from, until: block.until, pipeline, requestedEndUtime: historyEndUtime,
        collectedAt: new Date().toISOString(), cursor, metadata, ...captured };
      const bytes = `${JSON.stringify(report, null, 2)}\n`;
      const file = `page-${Date.now()}-${crypto.randomUUID()}.json`;
      fs.writeFileSync(path.join(directory, file), bytes, { flag: "wx" });
      const next = { schemaVersion: report.schemaVersion, block: index, from: block.from, until: block.until,
        cursor, metadata, requestedEndUtime: historyEndUtime,
        saleRows: (saved?.saleRows || 0) + captured.sales.length,
        latestPage: file, latestPageSha256: crypto.createHash("sha256").update(bytes).digest("hex") };
      const temporary = `${statePath}.${crypto.randomUUID()}.tmp`;
      fs.writeFileSync(temporary, `${JSON.stringify(next, null, 2)}\n`, { flag: "wx" });
      fs.renameSync(temporary, statePath);
    },
  };
  const collector = createTonCenterUsernameSettlementLedger({ ledger,
    historyStartUtime: Date.parse(block.from) / 1000, historyEndUtime,
    pageLimit, paginationMode: "time-offset" });
  console.log(JSON.stringify(await collector.runPage()));
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { BLOCKS, DIRECTORY, MAX_SALE_ROWS_PER_BLOCK, blockIndex, cutoff, pageSize, assertCompletePage };
