"use strict";

// Isolated future research cohort. Never reuse or mutate the September 20 reservation.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { createTonCenterUsernameSettlementLedger } = require("../lib/toncenter-username-settlement-ledger");

const FROM = "2026-09-27T00:00:00Z";
const UNTIL = "2026-10-20T00:00:00Z";
const DIRECTORY = "current-username-settlements-forward-v2";
const MAX_SALE_ROWS = 10000;

function cutoff(argv, now = Date.now()) {
  const index = argv.indexOf("--until");
  const value = index < 0 ? NaN : Date.parse(argv[index + 1] || "");
  if (!Number.isFinite(value) || value <= Date.parse(FROM) || value > now) {
    throw new Error("--until must be after the reserved start and no later than now");
  }
  return Math.floor(Math.min(value, Date.parse(UNTIL)) / 1000);
}

function pageSize(argv) {
  const index = argv.indexOf("--page-size");
  const value = index < 0 ? 80 : Number(argv[index + 1]);
  if (!Number.isInteger(value) || value < 10 || value > 80) throw new Error("--page-size must be an integer from 10 through 80");
  return value;
}

async function main() {
  const historyEndUtime = cutoff(process.argv);
  const requestedPageLimit = pageSize(process.argv);
  const directory = path.resolve(__dirname, `../research/telegram-usernames/data/${DIRECTORY}`);
  fs.mkdirSync(directory, { recursive: true });
  const statePath = path.join(directory, "state.json");
  const saved = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, "utf8")) : null;
  if (saved && (saved.schemaVersion !== "username-forward-v2-local-v1" || saved.from !== FROM
    || saved.cursor?.paginationMode !== "time-offset" || !Number.isInteger(saved.saleRows))) {
    throw new Error("Incompatible forward-v2 checkpoint");
  }
  const remaining = MAX_SALE_ROWS - (saved?.saleRows || 0);
  if (remaining < 10) throw new Error("Forward-v2 raw-sale cap reached; do not collect another page");
  const pageLimit = Math.min(requestedPageLimit, remaining);
  const captured = { assets: [], sales: [] };
  const ledger = {
    readState: async () => saved ? { state: { cursor: saved.cursor } } : null,
    ingestAssets: async (rows) => { captured.assets.push(...rows); return rows.length; },
    ingestSales: async (rows) => { captured.sales.push(...rows); return rows.length; },
    writeState: async (pipeline, cursor, metadata) => {
      assertCompletePage(metadata, captured.sales.length, pageLimit);
      const report = { schemaVersion: "username-forward-v2-local-v1", from: FROM, pipeline,
        requestedEndUtime: historyEndUtime, collectedAt: new Date().toISOString(), cursor, metadata, ...captured };
      const bytes = `${JSON.stringify(report, null, 2)}\n`;
      const file = `page-${Date.now()}-${crypto.randomUUID()}.json`;
      fs.writeFileSync(path.join(directory, file), bytes, { flag: "wx" });
      const next = { schemaVersion: report.schemaVersion, from: FROM, cursor, metadata,
        requestedEndUtime: historyEndUtime,
        saleRows: (saved?.saleRows || 0) + captured.sales.length,
        latestPage: file, latestPageSha256: crypto.createHash("sha256").update(bytes).digest("hex") };
      const temporary = `${statePath}.${crypto.randomUUID()}.tmp`;
      fs.writeFileSync(temporary, `${JSON.stringify(next, null, 2)}\n`, { flag: "wx" });
      fs.renameSync(temporary, statePath);
    },
  };
  const collector = createTonCenterUsernameSettlementLedger({ ledger,
    historyStartUtime: Date.parse(FROM) / 1000, historyEndUtime, pageLimit, paginationMode: "time-offset" });
  console.log(JSON.stringify(await collector.runPage()));
}

function assertCompletePage(metadata, saleRows, pageLimit) {
  if (metadata.pendingHistoricalUsd) throw new Error("Historical USD incomplete; no partial page checkpoint written");
  if (saleRows > pageLimit) throw new Error("Sale rows exceeded message-page capacity");
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
module.exports = { FROM, UNTIL, DIRECTORY, MAX_SALE_ROWS, cutoff, pageSize, assertCompletePage };
