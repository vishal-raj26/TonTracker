"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const worker = fs.readFileSync(path.join(root, "cloudflare", "identity-ingestion-edge.mjs"), "utf8");
const config = fs.readFileSync(path.join(root, "wrangler-identity-ingestion.jsonc"), "utf8");

test("runs the resumable username ledger from a bounded Cloudflare schedule", () => {
  assert.match(worker, /usernameLedger\.runPage\(\)/);
  assert.match(worker, /ctx\.waitUntil\(runIdentityCycle\(\)/);
  assert.match(worker, /const username = await runUsernameCycle\(\)/);
  assert.match(config, /"crons": \["\*\/15 \* \* \* \*"\]/);
  assert.match(config, /"USERNAME_FRAGMENT_MAX_SEARCH_REQUESTS_PER_PAGE": "1"/);
  assert.match(config, /"USERNAME_TONCENTER_VERIFY_BATCH_SIZE": "2"/);
});

test("protects the manual ingestion trigger", () => {
  assert.match(worker, /url\.pathname === "\/run\/username"/);
  assert.match(worker, /if \(!authorized\(request, env\)\)/);
  assert.match(worker, /env\.IDENTITY_TRIGGER_SECRET \|\| env\.D1_INGEST_SECRET/);
});

test("runs verified TON Center DNS history in the same scheduled cycle", () => {
  assert.match(worker, /createDnsTonCenterLedger\(\)/);
  assert.match(worker, /await runDnsCycle\(\)/);
  assert.match(worker, /url\.pathname === "\/run\/dns"/);
  assert.match(config, /"DNS_TONCENTER_PAGE_LIMIT": "100"/);
  assert.match(config, /"binding": "REGISTRY"/);
  assert.match(worker, /env\.REGISTRY\.fetch/);
});
