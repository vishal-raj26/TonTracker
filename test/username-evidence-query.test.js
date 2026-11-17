"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const fs = require("node:fs");
const path = require("node:path");

test("D1 evidence retrieves every target's own history before broad cohorts and semantic neighbors", async () => {
  const db = new DatabaseSync(":memory:");
  const dir = path.join(__dirname, "../cloudflare/valuation-read-model-migrations");
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) db.exec(fs.readFileSync(path.join(dir, file), "utf8"));
  const insert = db.prepare(`INSERT INTO identity_sales (sale_id,asset_kind,asset_key,normalized_name,sold_at,price_gram,historical_usd_rate,price_usd,marketplace,source) VALUES (?,'username',?,?,?,10,2,20,'Fragment','fragment-market-reported')`);
  const time = Math.floor(Date.now() / 1000) - 10000;
  for (let i = 0; i < 1100; i++) insert.run(`busy-${i}`, "busy-address", "busyname", time + i);
  insert.run("own-old", "quiet-address", "quietname", time - 1000000);
  insert.run("semantic-old", "peer-address", "peername", time - 2000000);
  db.prepare(`INSERT INTO identity_assets (asset_kind,asset_key,normalized_name,display_name,semantic_json,source_updated_at) VALUES ('username','quiet-address','quietname','@quietname',?,?)`)
    .run(JSON.stringify({ relatedTerms: ["peername"] }), new Date().toISOString());
  const adapter = { prepare(sql) {
    let args = [];
    return { bind(...values) { args = values; return this; }, async all() { return { results: db.prepare(sql).all(...args) }; } };
  }, async batch(statements) { return Promise.all(statements.map((statement) => statement.all())); } };
  const worker = (await import("../cloudflare/gift-registry-worker.mjs")).default;
  const response = await worker.fetch(new Request("https://registry.test/identity/username-evidence/read", {
    method: "POST", headers: { authorization: "Bearer test", "content-type": "application/json" },
    body: JSON.stringify({ targets: [{ normalizedName: "busyname" }, { normalizedName: "quietname" }] }),
  }), { INGEST_SECRET: "test", VALUATION_READ_MODEL: adapter });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.ok(body.records.some((row) => row.sale_id === "own-old"));
  assert.ok(body.records.some((row) => row.sale_id === "semantic-old"));
  assert.equal(body.records[0].own_rank, 1);
  db.close();
});
