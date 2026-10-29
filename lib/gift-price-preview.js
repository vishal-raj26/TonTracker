"use strict";

// UI fixtures, never market evidence. Identity deliberately excludes Symbol.
let MOCK_RATE = 3.25;
function setTonRate(rate) {
  if (Number.isFinite(Number(rate)) && Number(rate) > 0) MOCK_RATE = Number(rate);
}
const key = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
function enabled(env = process.env, runtime = globalThis) {
  return env.TONTRACK_GIFT_PRICE_PREVIEW === "1"
    && String(env.NODE_ENV || "").trim().toLowerCase() !== "production"
    && !env.RAILWAY_ENVIRONMENT && !env.RAILWAY_SERVICE_ID && !env.RAILWAY_PROJECT_ID
    && !env.RAILWAY_ENVIRONMENT_ID && !env.RAILWAY_DEPLOYMENT_ID
    && !env.CLOUDFLARE_ACCOUNT_ID && !env.CF_WORKER && !env.CF_PAGES
    && !("WebSocketPair" in runtime);
}
function allowedRequest(req) {
  const host = String(req.headers?.host || "");
  const remote = String(req.socket?.remoteAddress || "");
  if (!/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host)
    || !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(remote)) return false;
  if (["forwarded", "x-forwarded-host", "x-forwarded-for"].some(name => req.headers?.[name])) return false;
  if (req.headers?.origin) {
    try {
      const origin = new URL(req.headers.origin);
      if (!["http:", "https:"].includes(origin.protocol)
        || !["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname.toLowerCase())) return false;
    } catch { return false; }
  }
  return true;
}
function containsFixturePricing(value) {
  const pending = [value];
  const seen = new Set();
  while (pending.length) {
    const item = pending.pop();
    if (typeof item === "string" && /^(?:mock-ui-preview|mock-gift-prices|estimated-preview-combo|preview-backdrop-floor)$/.test(item)) return true;
    if (!item || typeof item !== "object" || seen.has(item)) continue;
    seen.add(item);
    if (item.preview === true) return true;
    pending.push(...Object.values(item));
  }
  return false;
}
function pairFrom(item = {}) {
  const traits = item.traits || item.attributes || [];
  const trait = (name) => traits.find((t) => key(t.label || t.trait_type) === key(name))?.value || "";
  return { collection: item.collectionName || item.collection?.name || item.collection || item.creator || "",
    model: item.model || trait("Model"), backdrop: item.backdrop || trait("Backdrop"), symbol: item.symbol || trait("Symbol") };
}
function fixture(input = {}, range = "7d", now = Date.now()) {
  const pair = pairFrom(input);
  const identity = [pair.collection, pair.model, pair.backdrop].map(key).join(":");
  let hash = 2166136261;
  for (const char of identity) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  const floorTon = Number((12 + (hash % 18800) / 100).toFixed(2));
  const estimated = hash % 3 === 0;
  const listedCount = estimated ? hash % 2 : 2 + hash % 23;
  const snapshotAt = new Date(now).toISOString();
  const floor = { ...pair, collectionKey: key(pair.collection), modelKey: key(pair.model),
    floorTon, floorUsd: floorTon * MOCK_RATE, tonUsdRate: MOCK_RATE, listedCount,
    floorStatus: estimated ? "estimated" : "priced", floorSource: estimated ? "estimate" : "backdrop",
    source: estimated ? "estimated-preview-combo" : "preview-backdrop-floor",
    marketPlatform: "Reference", marketplace: "Reference", marketUrl: "", listingUrl: "",
    snapshotAt, marketUpdatedAt: snapshotAt, priceLoading: false, preview: true,
    modelFloorTon: Number((floorTon * .83).toFixed(2)), modelFloorUsd: floorTon * .83 * MOCK_RATE,
    modelFloorSource: "model-floor", estimateConfidence: "medium",
    estimateSignals: { estimateBasis: "mock-ui-preview" }, totalSupply: 2400, change24hPct: 4.2 };
  const days = ({ "1d": 1, "7d": 7, "1m": 30, "30d": 30, "3m": 90, "6m": 180, "1y": 365, all: 365 })[String(range).toLowerCase()] || 7;
  const floorHistory = Array.from({ length: 48 }, (_, i) => {
    const date = new Date(now - (47 - i) * days * 86400000 / 47).toISOString();
    const priceTon = Number((floorTon * (i === 47 ? 1 : .93 + .035 * Math.sin(i * .6 + hash % 10) + i * .001)).toFixed(2));
    return { date, timestamp: date, floorTon: priceTon, floorUsd: priceTon * MOCK_RATE,
      priceTon, priceUsd: priceTon * MOCK_RATE, estimate: estimated, preview: true };
  });
  const sales = Array.from({ length: 10 }, (_, i) => {
    const date = new Date(now - (i + 1) * 2 * 3600000).toISOString();
    const priceTon = Number((floorTon * (1 + i * .013)).toFixed(2));
    return { ...pair, saleId: `preview-${hash}-${i}`, name: `${pair.collection} #${1000 + i}`,
      date, soldAt: date, priceTon, priceUsd: priceTon * MOCK_RATE, tonUsdRate: MOCK_RATE,
      marketplace: "Reference", source: "mock-ui-preview", preview: true };
  });
  const modelStats = { collection: pair.collection, model: pair.model, modelCount: 2400,
    supplyPct: 4.8, holderCount: 1632, transferCount7d: 57, transferCount30d: 218,
    upgradedCount: 2400, source: "mock-ui-preview", updatedAt: snapshotAt, preview: true };
  const collectionStats = { collection: pair.collection, totalSupply: 50000, totalMinted: 50000,
    upgradedSupply: 42000, unupgradedSupply: 8000, burnedCount: 120,
    holdOnchainPct: 68, holdTelegramPct: 32, onchainHolders: 19000, tgHolders: 8900,
    mintPriceTon: 5, mintPriceUsd: 5 * MOCK_RATE, source: "mock-ui-preview", updatedAt: snapshotAt, preview: true };
  floor.traitRarities = { Model: 4.8, Backdrop: 2.4 };
  floor.traitMetrics = { Model: { rarity: 4.8, itemCount: 2400, floorTon: floor.modelFloorTon, floorUsd: floor.modelFloorUsd },
    Backdrop: { rarity: 2.4, itemCount: 1200, floorTon, floorUsd: floor.floorUsd } };
  return { preview: true, floor, sales, modelStats, collectionStats, floorHistory,
    floorHistorySource: "mock-ui-preview", salesScope: "same-traits", partial: false, partialSources: [],
    salesStats: { sales24h: 10, volume24hTon: sales.reduce((sum, s) => sum + s.priceTon, 0),
      volume24hUsd: sales.reduce((sum, s) => sum + s.priceUsd, 0) }, origin: {}, rarity: {}, links: {} };
}
function priceGift(gift) {
  const pair = pairFrom(gift);
  if (!pair.collection || !pair.model || !pair.backdrop) return gift;
  const value = fixture(pair);
  return { ...gift, ...value.floor, name: gift.name, collection: gift.collection,
    recentSales: value.sales, modelStats: value.modelStats, collectionStats: value.collectionStats };
}
// Clone response only; never mutate backend wallet/snapshot caches.
function walletResponse(body) {
  if (Array.isArray(body)) return body.map(walletResponse);
  if (!body || typeof body !== "object") return body;
  return Object.fromEntries(Object.entries(body).map(([name, value]) => [name,
    name === "gifts" && Array.isArray(value) ? value.map(priceGift) : walletResponse(value)]));
}
function apiResponse(pathname, params, body = {}) {
  const pair = Object.fromEntries(params);
  const value = fixture(pair, pair.range || pair.period);
  if (pathname === "/api/gift-detail-data") return value;
  if (pathname === "/api/gift-registry/history") return value.floorHistory;
  if (pathname === "/api/gift-registry/sales") return { preview: true, sales: value.sales };
  if (pathname === "/api/gift-model-floors/bulk" || pathname === "/api/gift-registry/combos") {
    const models = (body.pairs || []).map((p) => fixture(p).floor);
    return { preview: true, source: "mock-ui-preview", models, combinations: models, pending: [], healingScheduled: 0 };
  }
  if (pathname === "/api/gift-model-stats") {
    const values = (body.pairs || []).map((p) => fixture(p));
    return { preview: true, models: values.map((v) => v.modelStats), collections: values.map((v) => v.collectionStats) };
  }
  return null;
}
module.exports = { enabled, allowedRequest, containsFixturePricing, fixture, priceGift, walletResponse, apiResponse, setTonRate };
