"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");
const { Address } = require("@ton/core");
const {
  fetchAllTonApiJettons,
  fetchAllTonCenterJettons,
  fetchJettonProvider,
  providerWithin,
  firstWalletAccountWithin,
  jettonInventoryStatus,
  walletJettonCacheKey,
  cachedWalletJettons,
  reconcileJettonInventory,
  WALLET_JETTON_INVENTORY_TTL_MS,
  WALLET_JETTON_REQUEST_TIMEOUT_MS,
  WALLET_JETTON_PROVIDER_TIMEOUT_MS,
  mergeJettonInventories,
  applyRecentJettonPrices,
  rememberRecentJettonPrices,
  normalizeJettons,
  normalizeTonCenterJettons,
  applyJettonImageRegistry,
  walletImportInitialPresentation,
  shouldFallbackWalletNfts,
  uniqueWalletNfts,
} = require("../server");

function inventoryToken(masterAddress, balance, extra = {}) {
  return { address: masterAddress, masterAddress, balance, name: "Token", symbol: "TOK", inventoryObservedAt: 1_000, ...extra };
}

test("NFT ownership merges raw/bounceable/nonbounceable contracts without duplicating holdings", () => {
  const address = Address.parse("0:" + "ab".repeat(32));
  const primary = { address: address.toRawString(), metadata: { name: "Verified gift" } };
  const secondContract = { address: "0:" + "cd".repeat(32), metadata: { name: "Verified gift" } };
  const merged = uniqueWalletNfts([
    primary,
    { address: address.toString({ bounceable: true }), metadata: { name: "Fallback gift" } },
    { address: address.toString({ bounceable: false }) },
    secondContract,
    { metadata: { name: "Verified gift" }, index: 1 },
  ]);
  assert.deepEqual(merged, [primary, secondContract]);
});

test("collectible discovery rejects error payloads and retains only the exact wallet's verified cache", async () => {
  const source = fs.readFileSync(require.resolve("../app.js"), "utf8");
  const start = source.indexOf("const collectiblePayloadCache = new Map();");
  const block = source.slice(start, source.indexOf("function renderImportedCollectiblesSnapshot", start));
  let payload = { gifts: [{ tokenAddress: "real-nft", type: "gift" }] };
  const sandbox = { Map, Promise, Date, Error, encodeURIComponent, fetchJsonFast: async () => payload };
  vm.runInNewContext(block, sandbox);
  const verified = await sandbox.fetchWalletCollectiblesPayload("wallet-a");
  payload = { gifts: [], stickers: [], error: "ownership provider timed out" };
  const retained = await sandbox.fetchWalletCollectiblesPayload("wallet-a", { force: true });
  assert.equal(retained.stale, true);
  assert.equal(retained.gifts, verified.gifts);
  await assert.rejects(sandbox.fetchWalletCollectiblesPayload("wallet-b"), /ownership provider timed out/);
  payload = { gifts: [], stickers: [] };
  const empty = await sandbox.fetchWalletCollectiblesPayload("wallet-a", { force: true });
  assert.equal(empty.gifts.length, 0);
  assert.equal(empty.stale, undefined);
});

test("public NFT discovery remains available without an API key", async () => {
  const source = fs.readFileSync(require.resolve("../server.js"), "utf8");
  const start = source.indexOf("async function walletNftsByType(");
  const block = source.slice(start, source.indexOf("async function getCollectibles(", start));
  const calls = [];
  const nft = { address: "0:" + "ab".repeat(32) };
  const sandbox = {
    Promise, Map, String, Number, Boolean,
    stickerCategoryCache: { address: new Map(), name: new Map() },
    liveCollectiblesRegistryCache: {}, tonApiKey: "", usdTonRate: 0,
    tonUsdRate: async () => 0, settleWithin: require("../server").settleWithin,
    providerWithin: (promise) => promise,
    tonApi: async (pathname, options) => { calls.push({ pathname, options }); return { nft_items: [nft] }; },
    tonCenterWalletNfts: async () => { throw new Error("TonCenter offline"); },
    uniqueWalletNfts,
    normalizeWalletNft: () => ({ type: "gift", collection: "Verified collection", name: "Gift" }),
    inferStickerBrandName: () => "", expandStickerAliases: () => [],
    stickerAddressKeys: () => [], normalizeStickerKey: (value) => value,
    isSuspiciousStickerCandidate: () => false,
  };
  vm.runInNewContext(block, sandbox);
  const result = await sandbox.walletNftsByType("wallet");
  assert.equal(calls.length, 1);
  assert.match(calls[0].pathname, /indirect_ownership=true/);
  assert.equal(calls[0].options.immediate, false);
  assert.equal(result.gifts.length, 1);
  assert.equal(result.error, undefined);
});

for (const accountFails of [false, true]) {
  test(`wallet import handles image timeout when account ${accountFails ? "fails first" : "finishes later"}`, async () => {
    const source = fs.readFileSync(require.resolve("../server.js"), "utf8");
    const walletFunction = source.slice(source.indexOf("async function walletImport("), source.indexOf("function classifyCollectible("));
    const accountError = new Error("account unavailable");
    const inspectedFallback = new Error("inspected image fallback");
    let requestedPublicJettons = false;
    let requestedPublicAccount = false;
    const context = vm.createContext({
      Map, Promise, Boolean, Date,
      tonApiKey: "",
      parseTonAddress: (address) => address,
      walletJettonCacheKey: (address) => address,
      walletJettonsCache: new Map(),
      cachedWalletJettons: () => [],
      tonCenterImmediateJson: async () => ({}),
      firstWalletAccountWithin: async () => {
        await new Promise((resolve) => setTimeout(resolve, accountFails ? 1 : 30));
        if (accountFails) throw accountError;
        return { account: {}, source: "toncenter" };
      },
      tonUsdRate: async () => 0,
      tonkeeperJettonImageRegistry: async () => {
        await new Promise((resolve) => setTimeout(resolve, accountFails ? 20 : 5));
        throw new DOMException("This operation was aborted", "AbortError");
      },
      fetchJettonProvider: async (_provider, request) => ({ payload: await request() }),
      fetchAllTonApiJettons: async (_address, request) => request("/jettons"),
      tonApi: async (pathname, options) => {
        if (pathname === "/accounts/wallet") {
          requestedPublicAccount = true;
          assert.equal(options.immediate, true);
          return { balance: "0" };
        }
        requestedPublicJettons = true;
        assert.equal(options.immediate, false);
        return { balances: [] };
      },
      fetchAllTonCenterJettons: async () => ({}),
      providerWithin: (promise) => promise,
      WALLET_JETTON_PROVIDER_TIMEOUT_MS: 100,
      WALLET_JETTON_REQUEST_TIMEOUT_MS: 100,
      resolveTonName: async () => "",
      normalizeAccount: () => ({}),
      jettonInventoryStatus: () => ({ status: "ready" }),
      normalizeJettons: () => [],
      normalizeTonCenterJettons: () => [],
      settleWithin: require("../server").settleWithin,
      mergeJettonInventories: () => [],
      applyJettonImageRegistry: (_inventory, registry) => {
        assert.equal(registry.size, 0);
        throw inspectedFallback;
      },
    });
    vm.runInContext(walletFunction, context);
    await assert.rejects(context.walletImport("wallet"), (error) => error === (accountFails ? accountError : inspectedFallback));
    // Let late optional failures fire even when the core request already exited.
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.equal(requestedPublicAccount, true);
    assert.equal(requestedPublicJettons, true);
  });
}

test("wallet NFT discovery runs independent providers concurrently and bounded", () => {
  assert.equal(shouldFallbackWalletNfts([]), true);
  assert.equal(shouldFallbackWalletNfts(undefined), true);
  assert.equal(shouldFallbackWalletNfts([{ address: "0:nft" }]), false);
  const serverSource = fs.readFileSync(require.resolve("../server.js"), "utf8");
  assert.match(serverSource, /const \[directPayload, indirectPayload, tonCenterPayload\] = await Promise\.allSettled/);
  assert.match(serverSource, /providerWithin\(tonCenterWalletNfts\(address\), "toncenter-wallet-nfts", 12_000\)/);
  assert.match(serverSource, /\.\.\.\(tonCenterPayload\.status === "fulfilled" \? \(tonCenterPayload\.value\?\.nft_items \|\| \[\]\) : \[\]\)/);
  assert.match(serverSource, /const unresolvedGifts = \(classified\.gifts \|\| \[\]\)\.map/);
  assert.match(serverSource, /floorStatus: "unavailable", priceLoading: false/);
  assert.match(serverSource, /settleWithin\(priceWalletGiftsFromD1[\s\S]*?8_000, unresolvedGifts\)/);
  assert.match(serverSource, /if \(lookup\.available\) queueD1GiftSalesTargets\(pairs\)/);
  assert.match(serverSource, /context === "telegram-miniapp-import" \|\| !lookup\.available/);
  assert.match(serverSource, /!isFreshGiftComboFloor\(combo\)/);
  assert.match(serverSource, /Date\.now\(\) - stickerCollectionsSnapshotUpdatedAt > 60 \* 60 \* 1000/);
  assert.match(serverSource, /providerWithin\(getgemsGraphql\(query, \{ owner: address \}\), "getgems-wallet-nfts", 8_000\)/);
  assert.match(serverSource, /source: classified\.source \|\| "tonapi-wallet"/);
});

test("missing provider movement remains unavailable instead of becoming zero", () => {
  const [token] = normalizeJettons({ balances: [{
    balance: "1000000000",
    jetton: { address: "EQtoken", decimals: 9, name: "Token", symbol: "TOK" },
    price: { prices: { USD: 2 } },
  }] });
  assert.equal(token.diff24h, null);
});

test("TonCenter inventory cannot erase TonAPI price and movement", () => {
  const [token] = mergeJettonInventories(
    [{ address: "EQtoken", balance: 2, priceUsd: 3, valueUsd: 6, diff24h: "+4.2%", verification: "whitelist" }],
    [{ address: "EQtoken", balance: 2, priceUsd: 0, valueUsd: 0, verification: "none" }],
  );
  assert.equal(token.priceUsd, 3);
  assert.equal(token.valueUsd, 6);
  assert.equal(token.diff24h, "+4.2%");
  assert.equal(token.verification, "whitelist");
});

test("normalizes TON Center jetton rows through master-address metadata", () => {
  const wallet = "0:" + "11".repeat(32);
  const owner = "0:" + "22".repeat(32);
  const master = "0:" + "aa".repeat(32);
  const [token] = normalizeTonCenterJettons({
    jetton_wallets: [{ address: wallet, owner, jetton: master, balance: "2500000" }],
    metadata: {
      [wallet]: { token_info: [{ type: "jetton_wallets" }] },
      [master]: {
        token_info: [{
          type: "jetton_masters",
          valid: true,
          name: "USD Tether",
          symbol: "USDt",
          extra: { decimals: "6", _image_medium: "https://cdn.example/usdt.png" },
        }],
      },
    },
  });
  assert.equal(token.address, master);
  assert.equal(token.masterAddress, master);
  assert.equal(token.walletAddress, wallet);
  assert.equal(token.ownerAddress, owner);
  assert.equal(token.balance, 2.5);
  assert.equal(token.name, "USD Tether");
  assert.equal(token.symbol, "USDt");
  assert.equal(token.image, "https://cdn.example/usdt.png");
  assert.equal(token.verification, "whitelist");
  assert.equal(mergeJettonInventories([{ address: master, balance: 2.5 }], [token]).length, 1);
});

test("adds registry logo fallbacks only by exact jetton master contract", () => {
  const master = "0:" + "a7".repeat(32);
  const other = "0:" + "a8".repeat(32);
  const registry = new Map([[walletJettonCacheKey(master), "https://registry.example/token.png"]]);
  const [matched, unmatched] = applyJettonImageRegistry([
    { masterAddress: master, name: "Shared", symbol: "TOK", image: "ipfs://provider" },
    { masterAddress: other, name: "Shared", symbol: "TOK", image: "https://provider.example/other.png" },
  ], registry);
  assert.equal(matched.image, "ipfs://provider");
  assert.deepEqual(matched.imageFallbacks, ["https://registry.example/token.png"]);
  assert.deepEqual(unmatched.imageFallbacks, []);
});

test("rejects a repeated TonAPI page instead of silently truncating token import", async () => {
  const tonApiPaths = [];
  await assert.rejects(fetchAllTonApiJettons("wallet", async (pathname) => {
    tonApiPaths.push(pathname);
    return { balances: [{ jetton: { address: "master-a" } }, { jetton: { address: "master-b" } }] };
  }, { pageSize: 2, maxPages: 10 }), /repeated page/i);
  assert.equal(tonApiPaths.length, 2);
  assert.equal(new URL(tonApiPaths[0], "https://example.test").searchParams.get("offset"), "0");
  assert.equal(new URL(tonApiPaths[1], "https://example.test").searchParams.get("limit"), "2");
});

test("paginates TON Center beyond zero balance rows and requests zero-balance exclusion", async () => {
  const tonCenterPaths = [];
  const tonCenter = await fetchAllTonCenterJettons("wallet", async (pathname) => {
    tonCenterPaths.push(pathname);
    if (tonCenterPaths.length === 1) return { jetton_wallets: [{ balance: "0" }, { balance: "0" }] };
    return { jetton_wallets: [{ balance: "1000000000", jetton: "master-c" }] };
  }, { pageSize: 2 });
  assert.equal(tonCenter.jetton_wallets.length, 3);
  assert.equal(tonCenterPaths.length, 2);
  assert.equal(new URL(tonCenterPaths[0], "https://example.test").searchParams.get("exclude_zero_balance"), "true");
  assert.equal(new URL(tonCenterPaths[1], "https://example.test").searchParams.get("offset"), "2");
  assert.deepEqual(normalizeTonCenterJettons(tonCenter).map((token) => token.address), ["master-c"]);

  const cappedPaths = [];
  await fetchAllTonCenterJettons("wallet", async (pathname) => {
    cappedPaths.push(pathname);
    return { jetton_wallets: [] };
  }, { pageSize: 1001 });
  assert.equal(new URL(cappedPaths[0], "https://example.test").searchParams.get("limit"), "1000");
});

test("rejects a repeated TON Center page instead of silently truncating token import", async () => {
  await assert.rejects(fetchAllTonCenterJettons("wallet", async () => ({
    jetton_wallets: [{ address: "jetton-wallet-a" }, { address: "jetton-wallet-b" }],
  }), { pageSize: 2, maxPages: 10 }), /repeated page/i);
});

test("retries a rate-limited jetton provider within a bounded attempt budget", async () => {
  let calls = 0;
  const result = await fetchJettonProvider("tonapi", async () => {
    calls += 1;
    if (calls === 1) throw new Error("429 rate limit");
    return { balances: [] };
  }, { maxAttempts: 2, retryDelayMs: 0 });
  assert.equal(calls, 2);
  assert.equal(result.attempts, 2);
  assert.deepEqual(result.payload, { balances: [] });
});

test("wallet provider discovery settles when an upstream request never resolves", async () => {
  const startedAt = Date.now();
  await assert.rejects(providerWithin(new Promise(() => {}), "tonapi", 20), /tonapi timed out/i);
  assert.ok(Date.now() - startedAt < 150);
});

test("wallet inventory timeout covers the complete bounded provider retry budget", () => {
  assert.ok(WALLET_JETTON_REQUEST_TIMEOUT_MS > 4_000);
  assert.ok(WALLET_JETTON_PROVIDER_TIMEOUT_MS >= WALLET_JETTON_REQUEST_TIMEOUT_MS * 3);
});

test("wallet account discovery accepts the first successful provider", async () => {
  const account = await firstWalletAccountWithin([
    new Promise(() => {}),
    Promise.resolve({ account: { balance: "123" }, source: "toncenter" }),
  ], 25);
  assert.equal(account.source, "toncenter");
  assert.equal(account.account.balance, "123");
});

test("jetton inventory marks all-provider failure unavailable instead of authoritative empty", () => {
  const rejected = { status: "rejected", reason: Object.assign(new Error("429 rate limit"), { attempts: 2 }) };
  const status = jettonInventoryStatus(rejected, rejected, { forceRefresh: true });
  assert.equal(status.status, "unavailable");
  assert.equal(status.forceRefresh, true);
  assert.equal(status.providers.tonapi.status, "unavailable");
  assert.equal(status.providers.toncenter.attempts, 2);
});

test("jetton inventory remains partial when one provider returns usable coverage", () => {
  const fulfilled = { status: "fulfilled", value: { attempts: 1, payload: { balances: [] } } };
  const rejected = { status: "rejected", reason: new Error("provider unavailable") };
  const status = jettonInventoryStatus(fulfilled, rejected);
  assert.equal(status.status, "partial");
  assert.equal(status.providers.tonapi.status, "ready");
  assert.equal(status.providers.toncenter.status, "unavailable");
});

test("unavailable refresh restores the prior exact-wallet inventory as stale", () => {
  const master = "0:" + "a1".repeat(32);
  const result = reconcileJettonInventory([], [inventoryToken(master, 4)], { status: "unavailable" }, 1_000);
  assert.equal(result.jettons.length, 1);
  assert.equal(result.jettons[0].masterAddress, master);
  assert.equal(result.jettons[0].inventoryCacheStatus, "stale");
  assert.deepEqual(result.fallback, {
    used: true,
    mode: "stale-cache",
    cachedCount: 1,
    restoredCount: 1,
    stale: true,
  });
});

test("partial refresh adds only missing cached contracts without overriding fresh rows", () => {
  const freshMaster = "0:" + "a2".repeat(32);
  const missingMaster = "0:" + "a3".repeat(32);
  const result = reconcileJettonInventory(
    [inventoryToken(freshMaster, 2, { name: "Fresh metadata" })],
    [inventoryToken(freshMaster, 99, { name: "Stale metadata" }), inventoryToken(missingMaster, 3)],
    { status: "partial" },
    1_000,
  );
  assert.equal(result.jettons.length, 2);
  assert.equal(result.jettons.find((row) => row.masterAddress === freshMaster).balance, 2);
  assert.equal(result.jettons.find((row) => row.masterAddress === freshMaster).name, "Fresh metadata");
  assert.equal(result.jettons.find((row) => row.masterAddress === missingMaster).inventoryCacheStatus, "stale");
  assert.equal(result.fallback.mode, "partial-merge");
  assert.equal(result.fallback.restoredCount, 1);
});

test("authoritative empty inventory clears rather than restoring cached holdings", () => {
  const master = "0:" + "a4".repeat(32);
  const result = reconcileJettonInventory([], [inventoryToken(master, 7)], { status: "ready" }, 1_000);
  assert.deepEqual(result.jettons, []);
  assert.equal(result.fallback.used, false);
  assert.equal(result.fallback.cachedCount, 1);
});

test("wallet jetton cache is isolated by canonical wallet address", () => {
  const rawA = "0:" + "b1".repeat(32);
  const rawB = "0:" + "b2".repeat(32);
  const friendlyA = Address.parse(rawA).toString({ urlSafe: true, bounceable: true });
  const cache = new Map([[walletJettonCacheKey(rawA), [inventoryToken("0:" + "c1".repeat(32), 1)]]]);
  assert.equal(walletJettonCacheKey(rawA), walletJettonCacheKey(friendlyA));
  assert.equal(cachedWalletJettons(cache, friendlyA, 1_000).length, 1);
  assert.deepEqual(cachedWalletJettons(cache, rawB, 1_000), []);
});

test("inventory fallback expires and preserves its original observation time", () => {
  const wallet = "0:" + "d1".repeat(32);
  const master = "0:" + "d2".repeat(32);
  const observedAt = 10_000;
  const cached = [inventoryToken(master, 5, { inventoryObservedAt: observedAt })];
  const cache = new Map([[walletJettonCacheKey(wallet), cached]]);
  const fallback = reconcileJettonInventory([], cachedWalletJettons(cache, wallet, observedAt + 1_000), { status: "unavailable" }, observedAt + 1_000);
  assert.equal(fallback.jettons[0].inventoryObservedAt, observedAt);
  cache.set(walletJettonCacheKey(wallet), fallback.jettons);
  assert.deepEqual(cachedWalletJettons(cache, wallet, observedAt + WALLET_JETTON_INVENTORY_TTL_MS + 1), []);
});

test("token UI labels cached inventory as last-known balances", () => {
  const appSource = fs.readFileSync(require.resolve("../app.js"), "utf8");
  assert.match(appSource, /inventoryFallback\.used/);
  assert.match(appSource, /Showing last-known jetton balances/);
  assert.match(appSource, /gateway\.pinata\.cloud\/ipfs/);
  assert.match(appSource, /data-image-candidates/);
  assert.match(appSource, /retryTokenImage\(this\)/);
  assert.match(appSource, /inventoryUnavailable \|\| inventoryPartial \|\| reportedTokenCount > tokens\.length/);
});

test("token and collectible refreshes cannot erase each other's wallet state", () => {
  const appSource = fs.readFileSync(require.resolve("../app.js"), "utf8");
  assert.match(appSource, /function mergeTokenRefreshIntoWallet\(current = \{\}, fresh = \{\}\)/);
  assert.match(appSource, /assets:\s*\{[\s\S]*?\.\.\.freshAssets,[\s\S]*?\.\.\.currentAssets,[\s\S]*?jettons: freshJettons\.length \|\| !currentJettons\.length \? freshJettons : currentJettons/);
  assert.match(appSource, /ton: freshTonBalance > 0 \|\| currentTonBalance <= 0 \? freshAssets\.ton : currentAssets\.ton/);
  assert.match(appSource, /sourceData = mergeTokenRefreshIntoWallet\(liveWalletData \|\| data, freshData\);\s*liveWalletData = sourceData/);
  assert.doesNotMatch(appSource, /sourceData = freshData;\s*liveWalletData = freshData/);
  assert.match(appSource, /if \(collectiblePayloadRequests\.has\(key\)\) return collectiblePayloadRequests\.get\(key\)/);
  assert.match(appSource, /if \(previousWalletKey !== nextWalletKey\) \{\s*collectiblePayloadCache\.clear\(\);\s*collectiblePayloadRequests\.clear\(\)/);
  assert.match(appSource, /const cached = collectiblePayloadCache\.get\(key\);\s*if \(cached\) return \{ \.\.\.cached, stale: true/);
  assert.match(appSource, /const updateStickersFromWallet = \(walletAddress, options\) => updateCollectiblesFromGetgems\(walletAddress, "stickers", options\)/);
  assert.match(appSource, /preserveExistingOnEmpty: hasSnapshot/);
  assert.match(appSource, /function mergeLastGoodWalletAssets\(data = \{\}, address = ""\)/);
  assert.match(appSource, /snapshot\.walletKey !== key[\s\S]*?WALLET_ASSET_SNAPSHOT_TTL_MS/);
  assert.match(appSource, /payload = mergeLastGoodWalletAssets\(payload, cleanAddress\)/);
  assert.match(appSource, /function mergeCollectiblePayloadIntoWallet\(payload = \{\}\)/);
  assert.match(appSource, /collectibles: \[\.\.\.gifts, \.\.\.stickers\], dns, usernames, anonymousNumbers/);
  assert.match(appSource, /mergeCollectiblePayloadIntoWallet\(payload\);[\s\S]*?updateIdentityAssetsFromWallet/);
  assert.match(appSource, /saveWalletAssetSnapshot\(liveWalletData\)/);
  assert.match(appSource, /Using the last verified wallet result while live data retries/);
});

for (const cacheSuffix of ["", ":mock-gift-preview-v2"]) test(`wallet state converges in either response order (${cacheSuffix || "live"})`, () => {
  const appSource = fs.readFileSync(require.resolve("../app.js"), "utf8");
  const snapshotBlock = appSource.slice(
    appSource.indexOf("const WALLET_ASSET_SNAPSHOT_KEY"),
    appSource.indexOf("function clearImportLoaderFailsafe"),
  );
  const tokenMergeBlock = appSource.slice(
    appSource.indexOf("function mergeTokenRefreshIntoWallet"),
    appSource.indexOf("function syncPortfolioFromDisplayedTokens"),
  );
  const storage = new Map();
  const context = vm.createContext({
    Date,
    giftPreviewCacheSuffix: cacheSuffix,
    liveWalletAddress: "wallet-a",
    liveWalletData: null,
    walletStateKey: (address) => String(address || "").toLowerCase(),
    homePortfolioValue: 0,
    updateWalletScreen: () => {},
    localStorage: {
      getItem: (key) => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value),
    },
  });
  const pricingGuards = appSource.slice(appSource.indexOf("function assertPricingMode("), appSource.indexOf("async function parseJsonResponse("));
  vm.runInContext(`${pricingGuards}\n${snapshotBlock}\n${tokenMergeBlock}`, context);

  const result = vm.runInContext(`(() => {
    const tokens = [{ address: "jetton-a", symbol: "A" }];
    const gift = { address: "gift-a", type: "gift" };
    const dns = { address: "dns-a", type: "dns" };
    liveWalletData = { account: { address: "wallet-a" }, summary: {}, assets: { jettons: tokens, collectibles: [], dns: [] } };
    mergeCollectiblePayloadIntoWallet({ gifts: [gift], stickers: [], dns: [dns], usernames: [], anonymousNumbers: [] });
    const tokenFirst = liveWalletData;

    const collectibleFirst = {
      account: { address: "wallet-a" }, summary: { giftCount: 1 },
      assets: { jettons: [], collectibles: [gift], dns: [dns] },
    };
    const mergedAfterTokens = mergeTokenRefreshIntoWallet(collectibleFirst, {
      account: { address: "wallet-a" }, summary: { tokenCount: 1 },
      assets: { jettons: tokens, jettonInventory: { status: "ready" } },
    });

    saveWalletAssetSnapshot(tokenFirst);
    const restoredPartial = mergeLastGoodWalletAssets({
      account: { address: "wallet-a" }, warnings: ["Collectibles are loading"],
      assets: { jettons: [], jettonInventory: { status: "unavailable" }, collectibles: [], dns: [] },
    }, "wallet-a");
    const authoritativeEmpty = mergeLastGoodWalletAssets({
      account: { address: "wallet-a" }, warnings: [],
      assets: { jettons: [], jettonInventory: { status: "ready" }, collectibles: [], dns: [] },
    }, "wallet-a");
    return { tokenFirst, mergedAfterTokens, restoredPartial, authoritativeEmpty };
  })()`, context);

  assert.deepEqual(Array.from(result.tokenFirst.assets.jettons, (row) => row.address), ["jetton-a"]);
  assert.deepEqual(Array.from(result.tokenFirst.assets.collectibles, (row) => row.address), ["gift-a"]);
  assert.deepEqual(Array.from(result.mergedAfterTokens.assets.jettons, (row) => row.address), ["jetton-a"]);
  assert.deepEqual(Array.from(result.mergedAfterTokens.assets.collectibles, (row) => row.address), ["gift-a"]);
  assert.deepEqual(Array.from(result.restoredPartial.assets.jettons, (row) => row.address), ["jetton-a"]);
  assert.deepEqual(Array.from(result.restoredPartial.assets.collectibles, (row) => row.address), ["gift-a"]);
  assert.equal(result.authoritativeEmpty.assets.jettons.length, 0);
  assert.equal(result.authoritativeEmpty.assets.collectibles.length, 0);
});

test("saved wallet restoration is invoked during application startup", () => {
  const appSource = fs.readFileSync(require.resolve("../app.js"), "utf8");
  assert.match(appSource, /async function restoreSavedWallet\(\)/);
  assert.match(appSource, /restoreSavedWallet\(\)\.catch\(\(error\) => console\.warn\("Saved wallet restore failed", error\)\);\s*$/);
});

test("wallet import loader exposes branded progress and a usable-data dismissal failsafe", () => {
  const appSource = fs.readFileSync(require.resolve("../app.js"), "utf8");
  const indexSource = fs.readFileSync(require.resolve("../index.html"), "utf8");
  assert.match(indexSource, /id="importLoaderText"/);
  assert.match(indexSource, /id="importLoaderPercent"/);
  assert.match(indexSource, /id="importLoaderBar"/);
  assert.match(indexSource, /role="progressbar"[^>]+aria-valuenow="8"/);
  assert.match(indexSource, /class="import-loader-brand"[\s\S]*?<span>TonTrack<\/span>/);
  assert.match(appSource, /loaderBar\?\.parentElement\?\.setAttribute\("aria-valuenow"/);
  assert.match(appSource, /function scheduleImportLoaderFailsafe\(importSessionId, delayMs = 2_500\)/);
  assert.match(appSource, /!isCurrentImportSession\(importSessionId\) \|\| !walletConnected \|\| !liveWalletData/);
  assert.match(appSource, /await homeReadyPromise;\s*if \(!isCurrentImportSession\(importSessionId\)\) return;\s*if \(!background\) scheduleImportLoaderFailsafe\(importSessionId\)/);
  assert.match(appSource, /fetchJsonFast\(`\/api\/collectibles\?address=\$\{encodeURIComponent\(walletAddress\)\}&t=\$\{Date\.now\(\)\}`, 30_000\)/);
  assert.match(appSource, /loaderVideo && \(!active \|\| reduceMotion\)/);
  assert.match(appSource, /catch \(error\)[\s\S]*?stopImportLoaderPulse\(\);\s*setImportLoader\(false\);/);
});

test("identity categories stay loading until collectible discovery has a terminal result", () => {
  const appSource = fs.readFileSync(require.resolve("../app.js"), "utf8");
  assert.match(appSource, /function walletCollectiblesArePending\(data = \{\}\)/);
  assert.match(appSource, /options\.terminal !== false && !walletCollectiblesArePending\(data\)/);
  assert.match(appSource, /updateIdentityAssetsFromWallet\(\{ assets: payload \}, \{ preserveExistingOnEmpty: true, terminal: true \}\)/);
  assert.match(appSource, /Identity asset import failed/);
  assert.match(appSource, /setIdentityImportTerminal\(dnsAssets\.length \|\| anonymousNumberAssets\.length \|\| usernameAssets\.length/);
});

test("collectible completion waits for the shared identity request and records an unavailable terminal state", () => {
  const appSource = fs.readFileSync(require.resolve("../app.js"), "utf8");
  const collectibleBlock = appSource.slice(
    appSource.indexOf("function updateCollectiblesFromWallet"),
    appSource.indexOf("const updateGiftsFromWallet"),
  );
  assert.match(collectibleBlock, /const identityReady = fetchWalletCollectiblesPayload\(walletAddress, \{ force: true \}\)/);
  assert.match(collectibleBlock, /return Promise\.allSettled\(\[\s*identityReady,/);
  assert.match(collectibleBlock, /return \{ status: "ready", payload \}/);
  assert.match(collectibleBlock, /return \{ status: "unavailable", error \}/);
});

test("wallet import presentation is bounded while optional enrichment continues", async () => {
  const startedAt = Date.now();
  const presentation = await walletImportInitialPresentation({
    namePromise: new Promise(() => {}),
    jettonsPromise: new Promise(() => {}),
    tonUsdPromise: new Promise(() => {}),
    timeoutMs: 25,
    fallbackTonUsd: 3.12,
  });
  assert.ok(Date.now() - startedAt < 150);
  assert.deepEqual(presentation, { tonName: "", jettons: [], tonUsdRate: 3.12 });
});

test("recent prices are reused only by exact master contract address", () => {
  const cache = new Map();
  const master = "0:" + "ab".repeat(32);
  rememberRecentJettonPrices([{
    address: master,
    masterAddress: master,
    name: "TetherUSD",
    symbol: "USDt",
    priceUsd: 1.001,
    diff24h: "+0.01%",
    priceSource: "tonapi",
    qualityStatus: "allowed",
  }], 1_000, cache);

  const exact = [{ address: master.toUpperCase(), balance: 50, name: "Renamed token", symbol: "OTHER" }];
  applyRecentJettonPrices(exact, 1_001, cache);
  assert.equal(exact[0].priceUsd, 1.001);
  assert.equal(exact[0].valueUsd, 50.05);

  const impostor = [{ address: "0:" + "cd".repeat(32), balance: 50, name: "TetherUSD", symbol: "USDt" }];
  applyRecentJettonPrices(impostor, 1_001, cache);
  assert.equal(impostor[0].priceUsd, undefined);
});

test("stale or blocked jetton prices are not reused", () => {
  const cache = new Map();
  const master = "0:" + "ef".repeat(32);
  rememberRecentJettonPrices([{ address: master, priceUsd: 2, qualityStatus: "blocked" }], 1_000, cache);
  assert.equal(cache.size, 0);

  rememberRecentJettonPrices([{ address: master, priceUsd: 2, qualityStatus: "allowed" }], 1_000, cache);
  const token = { address: master, balance: 3 };
  applyRecentJettonPrices([token], 1_000 + 16 * 60 * 1000, cache);
  assert.equal(token.priceUsd, undefined);
});
