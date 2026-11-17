"use strict";

// Price-blind integrity audit. Never summarize sale prices or premium labels.
const fs = require("node:fs");
const path = require("node:path");
const { auditDirectory } = require("./audit-reserved-username-collection");
const { BLOCKS, DIRECTORY, MAX_SALE_ROWS_PER_BLOCK } = require("./collect-username-forward-v3-local");

function audit(root) {
  const blocks = [];
  const combined = new Map();
  const v2Directory = path.join(root, "current-username-settlements-forward-v2");
  const v2Events = fs.existsSync(path.join(v2Directory, "state.json"))
    ? new Set(auditDirectory(v2Directory).events.map(event => event.saleId)) : new Set();
  for (let index = 0; index < BLOCKS.length; index += 1) {
    const block = BLOCKS[index];
    const directory = path.join(root, DIRECTORY, `block-${index}`);
    const statePath = path.join(directory, "state.json");
    if (!fs.existsSync(statePath)) continue;
    const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
    if (state.schemaVersion !== "username-forward-v3-local-v1" || state.block !== index
      || state.from !== block.from || state.until !== block.until
      || state.cursor?.paginationMode !== "time-offset"
      || !Number.isInteger(state.saleRows) || state.saleRows < 0
      || state.saleRows > MAX_SALE_ROWS_PER_BLOCK)
      throw new Error("Invalid forward-v3 block checkpoint");
    const result = auditDirectory(directory);
    const pageSaleRows = result.pages.reduce((sum, page) => sum + page.eventCount, 0);
    if (pageSaleRows !== state.saleRows) throw new Error("Forward-v3 sale-row counter mismatch");
    if (result.duplicateRows !== 0) throw new Error("Duplicate forward-v3 sale rows");
    const ordered = result.pages.map(page => ({ page,
      data: JSON.parse(fs.readFileSync(path.join(directory, page.name), "utf8")) }))
      .sort((a, b) => a.data.cursor.absoluteOffset - b.data.cursor.absoluteOffset);
    let priorOffset = 0;
    let priorCutoff = Date.parse(block.from) / 1000;
    for (const { data } of ordered) {
      if (data.block !== index || data.until !== block.until
        || data.requestedEndUtime <= Date.parse(block.from) / 1000
        || data.requestedEndUtime > Date.parse(block.until) / 1000
        || data.requestedEndUtime < priorCutoff
        || data.cursor?.paginationMode !== "time-offset"
        || !Number.isInteger(data.metadata?.messages) || data.metadata.messages < 0
        || data.metadata.messages > 80
        || data.cursor.absoluteOffset !== priorOffset + data.metadata.messages
        || data.metadata?.pendingHistoricalUsd !== 0
        || data.metadata?.sales !== data.sales.length
        || data.metadata?.assets !== data.assets.length)
        throw new Error("Invalid forward-v3 page provenance");
      priorOffset = data.cursor.absoluteOffset;
      priorCutoff = data.requestedEndUtime;
    }
    if (priorOffset !== state.cursor.absoluteOffset || priorCutoff !== state.requestedEndUtime)
      throw new Error("Forward-v3 checkpoint does not match the final page");
    for (const event of result.events) {
      if (Date.parse(event.soldAt) >= Date.parse(block.until))
        throw new Error("Event outside reserved block end");
      if (v2Events.has(event.saleId)) throw new Error("Forward-v3 event overlaps the earlier v2 cohort");
      if (combined.has(event.saleId)) throw new Error("Cross-block duplicate event");
      combined.set(event.saleId, event);
    }
    blocks.push({ index, from: block.from, until: block.until, cursor: result.cursor,
      pageCount: result.pageCount, saleRows: state.saleRows, uniqueEvents: result.uniqueEvents,
      uniqueAssets: result.uniqueAssets, duplicateRows: result.duplicateRows,
      latestEventAt: result.events.reduce((latest, event) => latest > event.soldAt ? latest : event.soldAt, null),
      pages: result.pages });
  }
  return { qualification: false, pricesOpened: false, createdAt: new Date().toISOString(),
    directory: DIRECTORY, blocks, uniqueEvents: combined.size,
    uniqueAssets: new Set([...combined.values()].map(event => event.assetKey)).size,
    crossBlockDuplicateEvents: 0,
    limitation: "Price-blind integrity only; no outcome values or premium counts computed" };
}

function main() {
  const index = process.argv.indexOf("--output");
  if (index < 0 || !process.argv[index + 1]) throw new Error("--output required");
  const root = path.resolve(__dirname, "../research/telegram-usernames/data");
  const report = audit(root);
  fs.writeFileSync(path.resolve(process.argv[index + 1]), `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
  console.log(JSON.stringify({ ...report, blocks: report.blocks.map(({ pages, ...summary }) => summary) }, null, 2));
}

if (require.main === module) { try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; } }
module.exports = { audit };
