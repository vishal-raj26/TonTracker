"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");

const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
function section(source, start, end) {
  return source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
}
function client(fetchJsonFast) {
  const context = vm.createContext({ Date, Promise, tokenDetailRange: "day",
    tokenDetailMetricsCache: new Map(), tokenDetailPrefetchRequests: new Map(),
    tokenChartQuery: (detail, range) => `${detail.address}:${range}`, fetchJsonFast });
  vm.runInContext(section(app, "function tokenDetailCacheKey(", "function tokenChartQuery(") +
    section(app, "function requestTokenDetailPayload(", "async function loadTokenDetailMetrics("), context);
  return context;
}

test("token detail shares foreground/prefetch requests and survives price changes", async () => {
  let resolve, calls = 0;
  const context = client(() => { calls++; return new Promise((done) => { resolve = done; }); });
  const detail = { address: "contract-a", priceUsd: 1 };
  const first = context.requestTokenDetailPayload(detail);
  detail.priceUsd = 2;
  assert.equal(context.requestTokenDetailPayload(detail), first);
  resolve({ chart: [{ price: 2 }], metrics: { marketCap: 50 } });
  const payload = await first;
  assert.equal(await context.requestTokenDetailPayload(detail), payload);
  assert.equal(calls, 1);
  assert.equal(context.tokenDetailPrefetchRequests.size, 0);
  assert.notEqual(context.tokenDetailCacheKey(detail, "day"), context.tokenDetailCacheKey(detail, "week"));
  assert.notEqual(context.tokenDetailCacheKey(detail), context.tokenDetailCacheKey({ address: "contract-b" }));
});

test("failed token requests are evicted and can be retried", async () => {
  let calls = 0;
  const context = client(() => ++calls === 1 ? Promise.reject(new Error("offline")) : Promise.resolve({ chart: [] }));
  await assert.rejects(context.requestTokenDetailPayload({ address: "a" }), /offline/);
  assert.equal(context.tokenDetailPrefetchRequests.size, 0);
  assert.equal(context.tokenDetailMetricsCache.size, 0);
  await context.requestTokenDetailPayload({ address: "a" });
  assert.equal(calls, 2);
});

test("native chart, market and network sources start independently", async () => {
  const started = [], resolvers = {};
  const pending = (name) => { started.push(name); return new Promise((done) => { resolvers[name] = done; }); };
  const context = vm.createContext({ Date, Promise, Number, Math,
    tokenDetailCache: new Map(), isNativeTonSymbol: () => true,
    chartFromBestSources: () => pending("chart"), geckoFetch: () => pending("market"),
    tonStatSnapshot: () => pending("network") });
  vm.runInContext(section(server, "async function tokenDetailData(", "function readSnapshots("), context);
  const request = context.tokenDetailData(new URL("http://local/?symbol=GRAM&range=week"));
  assert.deepEqual(started, ["chart", "market", "network"]);
  resolvers.chart({ source: "verified", points: [{ price: 1.5 }] });
  resolvers.market({ market_data: { market_cap: { usd: 123 }, total_volume: { usd: 456 } } });
  resolvers.network({ wallets: 42 });
  const result = await request;
  assert.equal(result.metrics.marketCap, 123);
  assert.equal(result.tonNetwork.wallets, 42);
});

test("optional native market/network failures do not discard a verified chart", async () => {
  const context = vm.createContext({ Date, Promise, Number, Math,
    tokenDetailCache: new Map(), isNativeTonSymbol: () => true,
    chartFromBestSources: async () => ({ source: "verified", points: [{ price: 1.5 }] }),
    geckoFetch: async () => { throw new Error("market unavailable"); },
    tonStatSnapshot: async () => { throw new Error("network unavailable"); } });
  vm.runInContext(section(server, "async function tokenDetailData(", "function readSnapshots("), context);
  const result = await context.tokenDetailData(new URL("http://local/?symbol=GRAM"));
  assert.equal(result.chart[0].price, 1.5);
  assert.equal(result.metrics.marketCap, null);
  assert.equal(result.tonNetwork, null);
});

test("token list warms only two leaders while focus/hover warms the intended asset", () => {
  const warmed = [], listeners = {};
  const context = vm.createContext({ tokenDetailRange: "week", tokenDetails: {}, assetDetails: {},
    document: { addEventListener: (name, callback) => { listeners[name] = callback; } },
    prefetchTokenDetailMetrics: (detail, range) => warmed.push([detail.id, range]) });
  vm.runInContext(section(app, "function prefetchVisibleTokenDetails(", "function pumpDetailWarmupQueue("), context);
  context.prefetchVisibleTokenDetails(Array.from({ length: 36 }, (_, id) => ({ id })));
  assert.deepEqual(warmed, [[0, "week"], [1, "week"]]);
  context.tokenDetails.a = { id: "a", type: "token" };
  const event = { target: { closest: () => ({ dataset: { asset: "a" }, contains: () => false }) } };
  listeners.focusin(event);
  assert.deepEqual(warmed.at(-1), ["a", "week"]);
  assert.equal(listeners.pointerover, listeners.focusin);
});
