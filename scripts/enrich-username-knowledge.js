"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { SCHEMA_VERSION, resolveUsernameKnowledge } = require("../lib/username-knowledge");
const { loadLocalEnv, readSales } = require("./username-backtest");

const cachePath = path.join(__dirname, "..", "data", "username-knowledge-cache.json");
function loadCache() { try { return JSON.parse(fs.readFileSync(cachePath, "utf8")); } catch { return {}; } }
function saveCache(cache) { fs.writeFileSync(cachePath, `${JSON.stringify(cache, null, 2)}\n`); }
function calibrationNames(rows, limit) {
  const sorted = [...rows].sort((a, b) => b.priceUsd - a.priceUsd);
  const recent = [...rows].sort((a, b) => Date.parse(b.eventTime) - Date.parse(a.eventTime));
  const bands = [
    { rows: sorted.filter((row) => row.priceUsd >= 500), share: 0.25 },
    { rows: sorted.filter((row) => row.priceUsd >= 100 && row.priceUsd < 500), share: 0.35 },
    { rows: sorted.filter((row) => row.priceUsd >= 25 && row.priceUsd < 100), share: 0.2 },
    { rows: sorted.filter((row) => row.priceUsd < 25), share: 0.1 },
  ];
  const selected = new Set();
  for (const band of bands) {
    const target = Math.ceil(limit * band.share);
    const stride = Math.max(1, Math.floor(band.rows.length / Math.max(1, target)));
    let added = 0;
    for (let index = 0; index < band.rows.length && added < target; index += stride) {
      const before = selected.size;
      selected.add(band.rows[index].username);
      if (selected.size > before) added += 1;
    }
  }
  const recentCount = Math.min(250, Math.ceil(limit * 0.1));
  for (const row of recent.slice(0, recentCount)) selected.add(row.username);
  const remainderStride = Math.max(1, Math.floor(sorted.length / Math.max(1, limit - selected.size)));
  for (let index = 0; index < sorted.length && selected.size < limit; index += remainderStride) selected.add(sorted[index].username);
  return [...selected].slice(0, limit);
}

loadLocalEnv();
(async () => {
  const limit = Math.max(50, Number(process.env.USERNAME_KNOWLEDGE_CALIBRATION_LIMIT || 700));
  const rows = await readSales();
  const explicitNames = String(process.env.USERNAME_KNOWLEDGE_NAMES || "").split(",")
    .map((name) => name.trim().toLowerCase().replace(/^@/, "")).filter(Boolean);
  const names = explicitNames.length ? [...new Set(explicitNames)] : calibrationNames(rows, limit);
  const selectedNames = new Set(names);
  const premiumNames = explicitNames.length ? new Set(names) : new Set(rows
    .filter((row) => selectedNames.has(row.username) && Number(row.priceUsd) >= 100)
    .map((row) => row.username));
  const cache = loadCache();
  const pending = names.filter((name) => cache[name]?.schemaVersion !== SCHEMA_VERSION
    || (premiumNames.has(name) && cache[name]?.entityLookupComplete !== true));
  let cursor = 0;
  let completed = 0;
  const concurrency = Math.max(1, Math.min(8, Number(process.env.USERNAME_KNOWLEDGE_CONCURRENCY || 4)));
  const fastOnly = process.env.USERNAME_KNOWLEDGE_FAST_ONLY === "1";
  const timeoutMs = Math.max(5_000, Math.min(30_000, Number(process.env.USERNAME_KNOWLEDGE_ITEM_TIMEOUT_MS || 15_000)));
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (cursor < pending.length) {
      const name = pending[cursor++];
      try {
        cache[name] = await Promise.race([
          resolveUsernameKnowledge(name, { fast: fastOnly || !premiumNames.has(name), maxAttempts: 1 }),
          new Promise((_, reject) => setTimeout(() => reject(new Error("item timeout")), timeoutMs)),
        ]);
      }
      catch (error) { console.warn(`[username-knowledge] ${name}: ${error.message}`); }
      if (!fastOnly && premiumNames.has(name)) await new Promise((resolve) => setTimeout(resolve, 180));
      completed += 1;
      if (completed % 10 === 0) { saveCache(cache); console.log(`[username-knowledge] ${completed}/${pending.length}`); }
    }
  }));
  saveCache(cache);
  console.log(`[username-knowledge] cached=${Object.keys(cache).length} selected=${names.length}`);
})().catch((error) => { console.error(error.stack || error.message); process.exit(1); });
