"use strict";

// Offline diagnostics only. Select candidates without their prices or future
// observations. Reported failed-sale prices identify test cases, not comps.
const fs = require("node:fs");
const path = require("node:path");
const { loadHistoricalSales } = require("./evaluate-username-rebuild");
const { classifyTelegramUsername } = require("../lib/username-structural");
const { lexicalSimilarity, similarity, completedSale } = require("../lib/username-estimator");

function historicalNeighbors(targetSale, sales, limit = 12) {
  const target = classifyTelegramUsername(targetSale.username);
  const cutoff = Date.parse(targetSale.eventTime);
  const names = new Map();
  for (const row of sales) {
    const time = Date.parse(row.eventTime);
    if (!Number.isFinite(cutoff) || !Number.isFinite(time) || time >= cutoff || !completedSale(row)) continue;
    if (!names.has(row.username)) {
      const lexical = lexicalSimilarity(targetSale.username, row.username);
      if (lexical < 0.65 && !(target.primaryRoute === "pattern" && row.username.length === target.characterLength)) {
        names.set(row.username, { lexical, structural: 0, pattern: false, rows: [] });
        continue;
      }
      const classification = classifyTelegramUsername(row.username);
      const pattern = target.primaryRoute === "pattern" && target.patternSignature === classification.patternSignature
        && target.characterLength === classification.characterLength;
      names.set(row.username, { lexical, structural: similarity(target, classification), pattern, rows: [] });
    }
    const candidate = names.get(row.username);
    if (candidate.lexical >= 0.65 || candidate.pattern || row.username === targetSale.username) candidate.rows.push(row);
  }
  return [...names].filter(([, value]) => value.rows.length)
    .sort((a, b) => b[1].lexical - a[1].lexical || b[1].structural - a[1].structural || a[0].localeCompare(b[0]))
    .slice(0, limit).map(([username, value]) => ({ username, lexical: value.lexical,
      similarity: value.structural, pattern: value.pattern, count: value.rows.length,
      latest: value.rows.at(-1), earliest: value.rows[0] }));
}
async function main() {
  const dir = path.join(__dirname, "../research/telegram-usernames/data");
  const { sales } = await loadHistoricalSales(dir);
  const misses = ["tail", "spread"].flatMap(kind => JSON.parse(fs.readFileSync(path.join(dir,
    `username-rebuild-v23-${kind}-2026-09-06.json`), "utf8")).largestMisses.slice(0, 3));
  const results = [];
  for (const miss of misses) {
    const matches = sales.filter(row => row.username === miss.username && Math.abs(row.priceUsd - miss.actualUsd) < 0.000001);
    if (matches.length !== 1) { results.push({ username: miss.username, skipped: "ambiguous historical target" }); continue; }
    const target = matches[0];
    const cutoff = Date.parse(target.eventTime);
    const recent = sales.filter(row => Date.parse(row.eventTime) < cutoff).slice(-1500);
    const neighbors = historicalNeighbors(target, sales).map(row => ({ ...row,
      latestInRecentWindow: recent.some(sale => sale.eventId === row.latest.eventId) }));
    results.push({ target, originalEstimateUsd: miss.predictedUsd, neighbors });
  }
  const report = { method: "historical-only name/pattern retrieval diagnostic; not a valuation model or economic-relevance ground truth", results };
  const output = process.argv.indexOf("--output");
  if (output >= 0 && process.argv[output + 1]) fs.writeFileSync(path.resolve(process.argv[output + 1]), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { historicalNeighbors };
