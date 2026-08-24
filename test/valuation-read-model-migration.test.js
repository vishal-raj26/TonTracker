"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { DatabaseSync } = require("node:sqlite");

const migrations = path.join(__dirname, "..", "cloudflare", "valuation-read-model-migrations");

test("a clean valuation D1 migration creates the complete request-time ledger", () => {
  const database = new DatabaseSync(":memory:");
  for (const filename of fs.readdirSync(migrations).filter((name) => name.endsWith(".sql")).sort()) {
    database.exec(fs.readFileSync(path.join(migrations, filename), "utf8"));
  }
  const tables = new Set(database.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => row.name));
  for (const table of [
    "valuation_records",
    "identity_assets",
    "identity_asset_aliases",
    "identity_sales",
    "identity_current_market",
    "identity_archetype_baselines",
    "identity_pipeline_state",
    "identity_storage_policy",
  ]) assert.ok(tables.has(table), `missing ${table}`);
});
