"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { execFileSync, spawnSync } = require("node:child_process");
const os = require("node:os");
const preview = require("../lib/gift-price-preview");

test("fixture opt-in cannot override normalized production or deployment/runtime markers", () => {
  for (const extra of [
    { NODE_ENV: "Production" }, { NODE_ENV: " production " },
    { RAILWAY_ENVIRONMENT_ID: "deployed" }, { RAILWAY_DEPLOYMENT_ID: "deployed" },
    { CF_PAGES: "1" },
  ]) assert.equal(preview.enabled({ TONTRACK_GIFT_PRICE_PREVIEW: "1", ...extra }), false, JSON.stringify(extra));
  assert.equal(preview.enabled({ TONTRACK_GIFT_PRICE_PREVIEW: "1" }, { WebSocketPair() {} }), false);
  assert.equal(preview.enabled({ TONTRACK_GIFT_PRICE_PREVIEW: "1" }, {}), true);
});

test("fixture access rejects a public host through a loopback proxy and public origins", () => {
  assert.equal(typeof preview.allowedRequest, "function", "preview needs a strict request boundary");
  const req = (host, remoteAddress = "127.0.0.1", extra = {}) => ({ headers: { host, ...extra }, socket: { remoteAddress } });
  assert.equal(preview.allowedRequest(req("localhost:5177")), true);
  assert.equal(preview.allowedRequest(req("[::1]:5177", "::1")), true);
  assert.equal(preview.allowedRequest(req("public-tunnel.example")), false);
  assert.equal(preview.allowedRequest(req("localhost:5177", "203.0.113.1")), false);
  assert.equal(preview.allowedRequest(req("localhost:5177", "127.0.0.1", { origin: "https://public.example" })), false);
  assert.equal(preview.allowedRequest(req("localhost:5177", "127.0.0.1", { "x-forwarded-host": "public.example" })), false);
  assert.equal(preview.allowedRequest(req("localhost:5177", "127.0.0.1", { forwarded: "host=public.example" })), false);
});

test("live API serialization refuses nested synthetic prices without sending the fixture", () => {
  const source = fs.readFileSync(require.resolve("../server"), "utf8");
  const writes = [];
  const res = { writeHead(status, headers) { writes.push({ status, headers }); }, end(body) { writes.push(JSON.parse(body)); } };
  const context = { giftPricePreview: preview };
  vm.runInNewContext(source.slice(source.indexOf("function json("), source.indexOf("function readJsonBody(")), context);
  context.json(res, 200, { gifts: [{ preview: true, floorUsd: 123, source: "preview-backdrop-floor" }] });
  assert.equal(writes[0].status, 503);
  assert.equal(JSON.stringify(writes).includes('"floorUsd":123'), false);
  writes.length = 0;
  context.json(res, 200, { gifts: [{ floorUsd: 123, source: "verified-market" }] });
  assert.equal(writes[0].status, 200);
  assert.equal(writes[1].gifts[0].floorUsd, 123);
});

test("live browser parser rejects fixture payloads and fixture response headers", async () => {
  const source = fs.readFileSync(require.resolve("../app"), "utf8");
  const start = source.includes("function assertPricingMode(") ? source.indexOf("function assertPricingMode(") : source.indexOf("async function parseJsonResponse(");
  const context = { giftPreviewCacheSuffix: "", window: {}, console };
  vm.runInNewContext(source.slice(start, source.indexOf("async function requestJson(", start)), context);
  const response = (body, extra = {}) => new Response(JSON.stringify(body), { headers: { "content-type": "application/json", ...extra } });
  await assert.rejects(context.parseJsonResponse(response({ gifts: [{ preview: true, floorUsd: 123 }] })), /fixture|preview/i);
  await assert.rejects(context.parseJsonResponse(response({ gifts: [] }, { "x-tontrack-preview": "mock-gift-prices" })), /fixture|preview/i);
  const live = await context.parseJsonResponse(response({ gifts: [{ floorUsd: 123, source: "verified-market" }] }));
  assert.equal(live.gifts[0].floorUsd, 123);
  context.giftPreviewCacheSuffix = ":mock-gift-preview-v3";
  assert.equal((await context.parseJsonResponse(response({ preview: true }))).preview, true);
});

test("Git ignores all secret/runtime variants while retaining distributable examples", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tontrack-ignore-test-"));
  try {
    execFileSync("git", ["init", "--quiet", root], { windowsHide: true });
    fs.copyFileSync(path.join(__dirname, "../.gitignore"), path.join(root, ".gitignore"));
    for (const name of [".env", ".env.production", ".env.staging.local", ".dev.vars", ".dev.vars.production", ".telegram-session", ".telegram-session.backup", ".telegram-login.json", ".wrangler/state/test.sqlite", ".tmp/private.json"]) {
      const result = spawnSync("git", ["check-ignore", "--no-index", name], { cwd: root, windowsHide: true });
      assert.equal(result.status, 0, `${name} must be ignored`);
    }
    assert.equal(spawnSync("git", ["check-ignore", "--no-index", ".env.example"], { cwd: root, windowsHide: true }).status, 1);
    assert.equal(spawnSync("git", ["check-ignore", "--no-index", "server.js"], { cwd: root, windowsHide: true }).status, 1);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("live caches reject synthetic wallet/detail/watchlist values while preview namespace remains usable", () => {
  const source = fs.readFileSync(require.resolve("../app"), "utf8");
  const guards = source.slice(source.indexOf("function assertPricingMode("), source.indexOf("async function parseJsonResponse("));
  for (const suffix of ["", ":mock-gift-preview-v3"]) {
    const storage = new Map();
    const context = { giftPreviewCacheSuffix: suffix, walletStateKey: x => x, liveWalletAddress: "wallet-a", liveWalletData: null,
      localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
      giftDetailPersistentCacheLoaded: false, giftDetailPersistentCache: new Map(), GIFT_DETAIL_CACHE_STORAGE_KEY: "detail" };
    vm.runInNewContext(guards, context);
    vm.runInNewContext(source.slice(source.indexOf("const WALLET_ASSET_SNAPSHOT_KEY"), source.indexOf("function mergeLastGoodWalletAssets(")), context);
    storage.set(`tontrack:wallet-assets:v1${suffix}`, JSON.stringify({ walletKey: "wallet-a", savedAt: Date.now(), data: { assets: { collectibles: [{ preview: true, floorUsd: 123 }] } } }));
    assert.equal(Boolean(context.loadWalletAssetSnapshot("wallet-a")), Boolean(suffix));
    storage.set("detail", JSON.stringify({ item: { staleUntil: Date.now() + 10000, value: { preview: true, floorUsd: 123 } } }));
    vm.runInNewContext(source.slice(source.indexOf("function loadPersistentGiftDetailCache("), source.indexOf("function flushPersistentGiftDetailCache(")), context);
    context.loadPersistentGiftDetailCache();
    assert.equal(context.giftDetailPersistentCache.size, suffix ? 1 : 0);
    vm.runInNewContext(source.slice(source.indexOf("const WATCHLIST_STORAGE_KEY"), source.indexOf("function watchlistIds(")), context);
    vm.runInNewContext(source.slice(source.indexOf("function watchlistStore("), source.indexOf("function setWatchlistIds(")), context);
    storage.set(`tontrack:watchlist:v1${suffix}`, JSON.stringify({ ids: ["gift"], details: { gift: { preview: true, floorUsd: 123 } } }));
    const watched = context.watchlistStore();
    assert.equal(Boolean(watched.details.gift), Boolean(suffix));
    assert.equal(watched.ids[0], "gift", "retain watch identity even when untrusted cached pricing is discarded");
  }
});
