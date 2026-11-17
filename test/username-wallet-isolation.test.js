"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

test("username refresh success and failure cannot mutate a different wallet without a session ID", async () => {
  const source = fs.readFileSync(require.resolve("../app.js"), "utf8");
  const fn = source.slice(source.indexOf("function updateCollectiblesFromWallet("), source.indexOf("const updateGiftsFromWallet"));
  for (const fail of [false, true]) {
    let resolve, reject;
    const pending = new Promise((yes, no) => { resolve = yes; reject = no; });
    const writes = [];
    const sandbox = { hasTonWalletPortfolio: () => true, liveWalletAddress: "wallet-a",
      walletStateKey: value => value, isCurrentImportSession: () => true,
      renderImportedCollectiblesSnapshot: () => false, fetchWalletCollectiblesPayload: () => pending,
      updateGiftsFromWallet: async () => [], updateStickersFromWallet: async () => [],
      mergeCollectiblePayloadIntoWallet: () => writes.push("merge"),
      updateIdentityAssetsFromWallet: () => writes.push("usernames"),
      syncAssetsSummary: () => writes.push("summary"), updateAllocationUi: () => writes.push("allocation"),
      updateAnalyticsFromWallet: () => writes.push("analytics"), setIdentityImportTerminal: () => writes.push("terminal"),
      dnsAssets: [], anonymousNumberAssets: [], usernameAssets: [], homePortfolioValue: 0,
      console: { warn() {} } };
    vm.runInNewContext(fn, sandbox);
    const result = sandbox.updateCollectiblesFromWallet({ account: { address: "wallet-a" }, assets: {} });
    sandbox.liveWalletAddress = "wallet-b";
    if (fail) reject(new Error("old wallet provider failed"));
    else resolve({ usernames: [{ username: "oldwallet" }] });
    await result;
    assert.deepEqual(writes, [], fail ? "late failure cannot alter the new wallet state" : "late success cannot import the old wallet usernames");
  }
});

test("authoritative empty usernames clear UI holdings and obsolete details but failed refresh retains them", () => {
  const source = fs.readFileSync(require.resolve("../app.js"), "utf8");
  const fn = source.slice(source.indexOf("function updateIdentityAssetsFromWallet("), source.indexOf("function renderIdentityAssetDetail("));
  const sandbox = { usernameAssets: [{ id: "old", username: "oldwallet" }], dnsAssets: [], anonymousNumberAssets: [],
    assetDetails: { old: {} }, normalizeIdentityAsset: item => item, walletCollectiblesArePending: () => false,
    setIdentityImportTerminal() {}, renderIdentityAssetScreens() {} };
  vm.runInNewContext(fn, sandbox);
  sandbox.updateIdentityAssetsFromWallet({ assets: { usernames: [] } }, { preserveExistingOnEmpty: true, terminal: false });
  assert.equal(sandbox.usernameAssets.length, 1);
  sandbox.updateIdentityAssetsFromWallet({ assets: { usernames: [], stale: true } }, { preserveExistingOnEmpty: true, terminal: true });
  assert.equal(sandbox.usernameAssets.length, 1);
  sandbox.updateIdentityAssetsFromWallet({ assets: { usernames: [] } }, { preserveExistingOnEmpty: true, terminal: true });
  assert.equal(sandbox.usernameAssets.length, 0);
  assert.equal(sandbox.assetDetails.old, undefined);
});

for (const cacheSuffix of ["", ":mock-gift-preview-v2"]) test(`fresh empty username inventory clears sold holdings (${cacheSuffix || "live"})`, () => {
  const source = fs.readFileSync(require.resolve("../app.js"), "utf8");
  const start = source.indexOf("const WALLET_ASSET_SNAPSHOT_KEY");
  const block = source.slice(start, source.indexOf("function mergeLastGoodWalletAssets(", start));
  const storage = new Map();
  const sandbox = { giftPreviewCacheSuffix: cacheSuffix, walletStateKey: value => value, liveWalletAddress: "wallet-a", liveWalletData: null,
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) } };
  vm.runInNewContext(source.slice(source.indexOf("function assertPricingMode("), source.indexOf("async function parseJsonResponse(")), sandbox);
  vm.runInNewContext(block, sandbox);
  const owned = { account: { address: "wallet-a" }, assets: { usernames: [{ id: "old" }], usernameInventoryStatus: "ready" } };
  sandbox.saveWalletAssetSnapshot(owned);
  sandbox.saveWalletAssetSnapshot({ account: owned.account, assets: { usernames: [], usernameInventoryStatus: "stale" } });
  assert.equal(sandbox.loadWalletAssetSnapshot("wallet-a").assets.usernames.length, 1);
  sandbox.saveWalletAssetSnapshot({ account: owned.account, assets: { usernames: [], usernameInventoryStatus: "ready" } });
  assert.equal(sandbox.loadWalletAssetSnapshot("wallet-a").assets.usernames.length, 0);
  assert.equal(sandbox.loadWalletAssetSnapshot("wallet-b"), null);
});
