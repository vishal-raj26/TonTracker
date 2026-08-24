const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const worker = fs.readFileSync(path.join(root, "cloudflare", "tontrack-app-edge.mjs"), "utf8");
const config = fs.readFileSync(path.join(root, "wrangler-app.jsonc"), "utf8");

test("proxies only the CPU-heavy wallet aggregate while retaining edge APIs", () => {
  assert.match(worker, /pathname === "\/api\/wallet" && request\.method === "GET"/);
  assert.match(worker, /await proxyHeavyWalletImport\(request, env, ctx\)/);
  assert.match(worker, /return proxied \|\| nodeHandler\.fetch/);
  assert.doesNotMatch(worker, /pathname\.startsWith\("\/api\/"\).*proxyHeavyWalletImport/s);
});

test("revalues proxied identity assets with the current edge runtimes", () => {
  assert.match(worker, /await warmValuationRuntimes\(\)/);
  assert.match(worker, /dnsRuntime\.valueAssets/);
  assert.match(worker, /usernameRuntime\.valueAssets/);
  assert.match(worker, /payload\.summary\.identityValueUsd = identityValue/);
  assert.match(worker, /payload\.summary\.totalUsd = Math\.max/);
  assert.match(worker, /dnsRuntime\.enqueueAssets/);
  assert.match(worker, /usernameRuntime\.enqueueAssets/);
});

test("declares a stable heavy API origin", () => {
  assert.match(config, /"HEAVY_API_ORIGIN": "https:\/\/tontracker-production-01f4\.up\.railway\.app"/);
});
