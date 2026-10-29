"use strict";
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const { loadWordnetSnapshot } = require("./username-wordnet-snapshot");
const { loadGloveSnapshot } = require("./username-glove-snapshot");
const { createHistoricalCompoundResolver } = require("../lib/username-compound-evidence");
const input = path.resolve(__dirname, "../research/telegram-usernames/data/username-evidence-fusion-development-2026-09-08.json");
const bytes = fs.readFileSync(input), source = JSON.parse(bytes);
const dictionary = loadWordnetSnapshot(), vectors = loadGloveSnapshot();
const resolve = createHistoricalCompoundResolver({ dictionaryKnowledge: dictionary.knowledge, vectorKnowledge: vectors.knowledge });
const rows = source.evidence.map(row => ({ username: row.username, eventId: row.eventId, eventTime: row.eventTime,
  band: row.actualUsd >= 500 ? "premium" : row.actualUsd >= 100 ? "intermediate" : "ordinary",
  ...resolve(row.username, Date.parse(row.eventTime)) }));
const counts = {};
for (const row of rows) { const key = `${row.band}/${row.status}`; counts[key] = (counts[key] || 0) + 1; }
const report = { qualification: false, pricesEstimated: false,
  method: "Conservative unique two-part historical dictionary/vector coverage; not economic-equivalence evidence",
  sourceSha256: crypto.createHash("sha256").update(bytes).digest("hex"), counts, rows };
const index = process.argv.indexOf("--output");
if (index >= 0) fs.writeFileSync(path.resolve(process.argv[index + 1]), JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ ...report, rows: rows.filter(row => row.status === "compound-candidate").slice(0, 12) }, null, 2));
