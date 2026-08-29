"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  fetchAllTonApiJettons,
  fetchAllTonCenterJettons,
  fetchJettonProvider,
  jettonInventoryStatus,
  mergeJettonInventories,
  normalizeJettons,
  normalizeTonCenterJettons,
  walletImportInitialPresentation,
} = require("../server");

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
