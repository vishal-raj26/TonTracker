const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
test("gift cleanup pause stops both shard pruning and legacy/compact retention", () => {
  const source = fs.readFileSync(path.join(__dirname, "../cloudflare/gift-registry-worker.mjs"), "utf8");
  const scheduled = source.slice(source.indexOf("async scheduled(_event, env)"));
  const pause = scheduled.indexOf('if (env.GIFT_SALES_CLEANUP_PAUSED === "1") return;');
  assert.ok(pause > 0);
  assert.equal(scheduled.indexOf("maintainIdentityStorage"), -1);
  assert.ok(pause < scheduled.indexOf("pruneCompactSalesDatabase(config.database"));
  assert.ok(scheduled.indexOf("boundedLegacyRetention(database,salesCutoff)") > pause);
  assert.ok(scheduled.indexOf("boundedCompactRetention(database,compactSalesCutoff)") > pause);
  assert.equal(JSON.parse(fs.readFileSync(path.join(__dirname, "../wrangler.jsonc"), "utf8")).vars.GIFT_SALES_CLEANUP_PAUSED, "1");
});
