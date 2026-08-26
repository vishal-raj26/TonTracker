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
  assert.match(worker, /ctx\.waitUntil\(run\(\)\.catch/);
  assert.match(worker, /username: \(\) => runUsernameCycle\(\)/);
  assert.match(worker, /await Promise\.all\(Object\.entries\(jobs\)/);
  assert.match(config, /"crons": \["\*\/5 \* \* \* \*", "\* \* \* \* \*"\]/);
  assert.match(config, /"USERNAME_FRAGMENT_MAX_SEARCH_REQUESTS_PER_PAGE": "1"/);
  assert.match(config, /"USERNAME_TONCENTER_VERIFY_BATCH_SIZE": "2"/);
});

test("protects the manual ingestion trigger", () => {
  assert.match(worker, /url\.pathname === "\/run\/username"/);
  assert.match(worker, /if \(!authorized\(request, env\)\)/);
  assert.match(worker, /env\.IDENTITY_TRIGGER_SECRET \|\| env\.D1_INGEST_SECRET/);
});

test("exposes authenticated knowledge and full-cycle diagnostics", () => {
  assert.match(worker, /url\.pathname === "\/run\/knowledge"/);
  assert.match(worker, /url\.pathname === "\/run\/all"/);
  assert.match(worker, /await runKnowledgeCycle\(env\)/);
  assert.match(worker, /await runIdentityCycle\(env\)/);
  assert.match(worker, /String\(controller\.cron \|\| ""\) === "\* \* \* \* \*"/);
  assert.match(worker, /scheduledSeparately: true/);
  assert.match(worker, /await runKnowledgeKind\(env, "username", 4, \{ fast: true \}\)/);
  assert.match(worker, /await runKnowledgeKind\(env, "dns", 1, \{ fast: true \}\)/);
  assert.match(worker, /await runKnowledgeKind\(env, "username", 1\)/);
  assert.match(worker, /await runKnowledgeKind\(env, "dns", 1\)/);
  assert.match(worker, /const mode = options\.fast \? "fast" : "full"/);
  assert.match(worker, /maxAttempts: 1/);
  assert.match(worker, /knowledge\.schemaVersion = "dns-knowledge-v1"/);
  assert.match(worker, /classifyTonDns\(row\.normalized_name/);
  assert.match(worker, /normalizedName: row\.normalized_name/);
  assert.match(worker, /written = Math\.floor\(Number\(result\.written \|\| 0\) \/ 2\)/);
});

test("runs verified TON Center DNS history in the same scheduled cycle", () => {
  assert.match(worker, /createDnsTonCenterLedger\(\)/);
  assert.match(worker, /await runDnsCycle\(\)/);
  assert.match(worker, /url\.pathname === "\/run\/dns"/);
  assert.match(config, /"DNS_TONCENTER_PAGE_LIMIT": "100"/);
  assert.match(config, /"binding": "REGISTRY"/);
  assert.match(worker, /env\.REGISTRY\.fetch/);
});

test("checkpoints bounded baseline refreshes instead of rebuilding every cron", () => {
  assert.match(worker, /REFRESH_PIPELINE_KEY = "identity-baseline-refresh-v1"/);
  assert.match(worker, /REFRESH_RUNNING_STALE_MS = 20 \* 60 \* 1000/);
  assert.match(worker, /runRefreshCycle\(false\)/);
  assert.match(worker, /url\.pathname === "\/run\/refresh"/);
  assert.match(worker, /const state = read\?\.state \|\| read \|\| \{\}/);
  assert.match(worker, /const nextKind = metadata\.nextKind === "dns" \? "dns" : "username"/);
  assert.match(worker, /baselineModule\.refreshKind\(nextKind, \{ aggregateSource: true, writeExactValuations: false \}\)/);
  assert.match(worker, /reason: "refresh-in-progress"/);
  assert.match(worker, /recoveredStaleRun:/);
  assert.match(config, /"IDENTITY_BASELINE_REFRESH_INTERVAL_MS": "21600000"/);
});
