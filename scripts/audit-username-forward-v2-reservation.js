"use strict";

// Price-blind integrity audit. Sale labels stay in raw page files and are never summarized.
const fs = require("node:fs");
const path = require("node:path");
const { auditDirectory } = require("./audit-reserved-username-collection");
const { FROM, UNTIL, DIRECTORY, MAX_SALE_ROWS } = require("./collect-username-forward-v2-local");

function audit(directory) {
  const result = auditDirectory(directory);
  const state = JSON.parse(fs.readFileSync(path.join(directory, "state.json"), "utf8"));
  if (result.directory !== DIRECTORY || result.from !== FROM) throw new Error("Wrong forward-v2 reservation");
  if (result.duplicateRows !== 0) throw new Error("Duplicate forward-v2 event");
  const saleRows = result.pages.reduce((sum, page) => sum + page.eventCount, 0);
  if (saleRows !== state.saleRows) throw new Error("Forward-v2 sale-row counter mismatch");
  if (saleRows > MAX_SALE_ROWS) throw new Error("Forward-v2 raw-sale cap exceeded");
  for (const event of result.events) {
    if (Date.parse(event.soldAt) >= Date.parse(UNTIL)) throw new Error("Event after reserved end");
  }
  return { qualification: false, pricesOpened: false, createdAt: new Date().toISOString(),
    limitation: "Price-blind integrity only; no outcome values or premium counts computed",
    ...result };
}

function main() {
  const index = process.argv.indexOf("--output");
  if (index < 0) throw new Error("--output required");
  const directory = path.resolve(__dirname, `../research/telegram-usernames/data/${DIRECTORY}`);
  const report = audit(directory);
  fs.writeFileSync(path.resolve(process.argv[index + 1]), `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
  console.log(JSON.stringify({ ...report, pages: report.pages.length, events: undefined }, null, 2));
}

if (require.main === module) try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
module.exports = { audit };
