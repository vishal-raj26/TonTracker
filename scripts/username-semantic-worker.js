"use strict";

// Semantic enrichment is intentionally isolated from pricing. Configure an
// internal Qwen/BGE service that returns structured tags only; this worker
// validates and stores the output for comparable retrieval and explanations.
const os = require("node:os");
const { Pool } = require("pg");
const { createUsernameStore } = require("../lib/username-store");
const { USERNAME_FEATURE_VERSION } = require("../lib/username-engine");
const databaseUrl = String(process.env.USERNAME_DATABASE_URL || process.env.DNS_DATABASE_URL || process.env.DATABASE_URL || "").trim();
const serviceUrl = String(process.env.USERNAME_SEMANTIC_SERVICE_URL || "").replace(/\/+$/, "");
if (!databaseUrl || !serviceUrl) throw new Error("USERNAME_DATABASE_URL and USERNAME_SEMANTIC_SERVICE_URL are required");
const pool = new Pool({ connectionString: databaseUrl, ssl: /localhost|127\.0\.0\.1/i.test(databaseUrl) ? false : { rejectUnauthorized: false } });
const store = createUsernameStore(pool);
const workerId = process.env.USERNAME_SEMANTIC_WORKER_ID || `${os.hostname()}:${process.pid}`;
const continuous = process.argv.includes("--continuous");
const pollMs = Math.max(5_000, Number(process.env.USERNAME_SEMANTIC_POLL_MS || 30_000));
async function run() {
  const jobs = await store.claimJobs(workerId, Math.max(1, Number(process.env.USERNAME_SEMANTIC_BATCH_SIZE || 10)), ["username-semantic"]);
  for (const job of jobs) try {
    const response = await fetch(serviceUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: job.payload_json.username, feature: job.payload_json.feature }), signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new Error(`semantic service returned ${response.status}`);
    const semantic = await response.json();
    if (Object.hasOwn(semantic, "price") || Object.hasOwn(semantic, "estimateUsd")) throw new Error("semantic service attempted to provide a price");
    await store.upsertSemantic(job.payload_json.nftAddress, USERNAME_FEATURE_VERSION, { ...semantic, schemaVersion: "username-semantic-v1", enrichedAt: new Date().toISOString() });
    await store.completeJob(job.id, workerId);
  } catch (error) { await store.failJob(job.id, workerId, error); console.warn(`[username-semantic] ${job.id}: ${error.message}`); }
  console.log(`[username-semantic] processed=${jobs.length}`);
}
(async () => {
  try {
    await store.init();
    do {
      await run();
      if (continuous) await new Promise((resolve) => setTimeout(resolve, pollMs));
    } while (continuous);
  } finally { await pool.end(); }
})().catch((error) => { console.error(error.stack || error.message); process.exit(1); });
