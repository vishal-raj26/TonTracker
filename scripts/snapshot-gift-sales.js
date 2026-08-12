const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const envFile = path.join(root, ".env");
if (fs.existsSync(envFile)) {
  fs.readFileSync(envFile, "utf8").split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) return;
    const name = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    if (!(name in process.env)) process.env[name] = value;
  });
}

const satelliteBase = String(process.env.GIFT_SATELLITE_API_BASE || "https://gift-satellite.dev/api").replace(/\/+$/, "");
// GiftSatellite's web client authenticates requests with Telegram WebApp initData.
// A generic API-key header is not accepted by its sales-history endpoints.
const satelliteInitData = String(process.env.GIFT_SATELLITE_INIT_DATA || "").trim();
const telegramApiId = Number(process.env.TELEGRAM_API_ID || 0);
const telegramApiHash = String(process.env.TELEGRAM_API_HASH || "").trim();
const telegramSessionFile = path.join(root, ".telegram-session");
const telegramSession = String(process.env.TELEGRAM_SESSION || (fs.existsSync(telegramSessionFile) ? fs.readFileSync(telegramSessionFile, "utf8") : "")).trim();
const satelliteTelegramBot = String(process.env.GIFT_SATELLITE_TELEGRAM_BOT || "gift_satellite_bot").replace(/^@/, "").trim();
const satelliteTelegramApp = String(process.env.GIFT_SATELLITE_TELEGRAM_APP || "sniper").trim();
const satelliteAuthRefreshMs = Math.max(60 * 1000, Number(process.env.GIFT_SATELLITE_AUTH_REFRESH_MS || 10 * 60 * 1000));
const satelliteOutageCooldownMs = Math.max(30 * 1000, Number(process.env.GIFT_SATELLITE_OUTAGE_COOLDOWN_MS || 5 * 60 * 1000));
const useSatelliteCollectionCatalog = process.env.GIFT_SALES_USE_SATELLITE_COLLECTIONS === "1";
const registryUrl = String(process.env.D1_REGISTRY_URL || "").replace(/\/+$/, "");
const ingestSecret = String(process.env.D1_INGEST_SECRET || "");
const requestIntervalMs = Math.max(250, Number(process.env.GIFT_SALES_REQUEST_INTERVAL_MS || 1000));
// GiftSatellite permits one history request per second. Keep a small guard
// against timer jitter without silently cutting the archive worker to 0.6 RPS.
const requestSafetyMs = Math.max(0, Number(process.env.GIFT_SALES_REQUEST_SAFETY_MS || 25));
const requestTimeoutMs = Math.max(5000, Number(process.env.GIFT_SALES_REQUEST_TIMEOUT_MS || 20000));
const pageSize = 20;
const baselinePages = Math.max(1, Math.min(100, Number(process.env.GIFT_SALES_BASELINE_PAGES || 1)));
const maxIncrementalPages = Math.max(1, Math.min(100, Number(process.env.GIFT_SALES_MAX_INCREMENTAL_PAGES || 25)));
const retentionDays = Math.max(30, Math.min(365, Number(process.env.GIFT_SALES_RETENTION_DAYS || 365)));
const backfillPagesPerCollection = Math.max(1, Math.min(100, Number(process.env.GIFT_SALES_BACKFILL_PAGES_PER_COLLECTION || 25)));
// Give every incomplete collection one persisted checkpoint per cycle. A deep
// archive cannot monopolize the request budget while the rest make no progress.
const backfillRequestBudget = Math.max(25, Math.min(10000, Number(process.env.GIFT_SALES_BACKFILL_REQUEST_BUDGET || 1200)));
// Product reads are exact collection/model/backdrop lookups. Exact coverage is
// therefore the default: it fills the useful combinations in days at 1 RPS
// instead of walking millions of irrelevant collection-wide archive rows.
const backfillMode = String(process.env.GIFT_SALES_BACKFILL_MODE || "exact").trim().toLowerCase();
const exactBackfillEnabled = backfillMode !== "chronological";
const exactRequestBudget = Math.max(100, Number(process.env.GIFT_SALES_EXACT_REQUESTS_PER_CYCLE || 500));
const salesPerComboTarget = Math.max(3, Math.min(20, Number(process.env.GIFT_SALES_PER_COMBO || 10)));
// Keep exact checkpoints small so a deploy or provider interruption loses at
// most a short slice of work instead of an entire long-running collection.
const exactCollectionBatchSize = Math.max(25, Math.min(100, Number(process.env.GIFT_SALES_EXACT_COMBOS_PER_COLLECTION || 100)));
const exactFilterBatchArg = process.argv.indexOf("--exact-filter-batch");
const exactFilterBatchSize = Math.max(2, Math.min(50, Number(
  exactFilterBatchArg >= 0
    ? process.argv[exactFilterBatchArg + 1]
    : process.env.GIFT_SALES_EXACT_FILTER_BATCH_SIZE || 50
)));
const exactProgressInterval = Math.max(10, Math.min(50, Number(process.env.GIFT_SALES_EXACT_PROGRESS_INTERVAL || 25)));
const exactPriorityTargetLimit = Math.max(1, Math.min(1000, Number(process.env.GIFT_SALES_PRIORITY_TARGETS_PER_CYCLE || 500)));
const cycleDelayMs = Math.max(60 * 1000, Number(process.env.GIFT_SALES_CYCLE_DELAY_MS || 15 * 60 * 1000));
const incompleteCycleDelayMs = Math.max(10 * 1000, Number(process.env.GIFT_SALES_INCOMPLETE_CYCLE_DELAY_MS || 60 * 1000));
const continuousMode = !process.argv.includes("--once")
  && (process.argv.includes("--continuous") || process.env.GIFT_SALES_CONTINUOUS === "1");
// Legacy in-process floor scans are opt-in; production uses a dedicated worker.
const dryRun = process.argv.includes("--dry-run") || process.env.GIFT_SALES_DRY_RUN === "1";
const resetBaseline = process.argv.includes("--reset");
const collectionArgIndex = process.argv.indexOf("--collection");
const onlyCollection = collectionArgIndex >= 0 ? String(process.argv[collectionArgIndex + 1] || "").trim() : "";
const lockFile = path.join(root, "data", "gift-sales-worker.lock");
const coinGeckoBase = String(process.env.COINGECKO_API_BASE || "https://api.coingecko.com/api/v3").replace(/\/+$/, "");
const coinGeckoApiKey = String(process.env.COINGECKO_API_KEY || "").trim();
const historicalRateMaxGapMs = Math.max(
  60 * 1000,
  Number(process.env.GIFT_SALES_HISTORICAL_RATE_MAX_GAP_MS || 2 * 60 * 60 * 1000)
);
const historicalRateInterpolationMaxGapMs = Math.max(
  historicalRateMaxGapMs,
  Number(process.env.GIFT_SALES_HISTORICAL_RATE_INTERPOLATION_MAX_GAP_MS || 26 * 60 * 60 * 1000)
);
let historicalTonUsdPointsPromise = null;

const hasTelegramWebViewAuth = Boolean(telegramApiId && telegramApiHash && telegramSession);

if (process.env.GIFT_SALES_EXACT_BACKFILL !== undefined) {
  console.warn("[gift-sales] GIFT_SALES_EXACT_BACKFILL is deprecated and ignored; use GIFT_SALES_BACKFILL_MODE=exact only for a targeted run");
}

if ((!satelliteInitData && !hasTelegramWebViewAuth) || !registryUrl || !ingestSecret) {
  console.error("GIFT_SATELLITE_INIT_DATA or TELEGRAM_API_ID, TELEGRAM_API_HASH, TELEGRAM_SESSION, plus D1_REGISTRY_URL and D1_INGEST_SECRET are required");
  process.exit(1);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function key(value = "") {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function singularWord(word = "") {
  if (word.length < 4 || word.endsWith("ss")) return word;
  if (word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.endsWith("boxes")) return `${word.slice(0, -5)}box`;
  if (/(?:ches|shes)$/.test(word)) return word.slice(0, -2);
  if (word.endsWith("s")) return word.slice(0, -1);
  return word;
}

function collectionIdentity(value = "") {
  const words = String(value || "").toLowerCase().match(/[a-z0-9]+/g) || [];
  return key(words.map(singularWord).join(" "));
}

async function historicalTonUsdPoints() {
  if (historicalTonUsdPointsPromise) return historicalTonUsdPointsPromise;
  historicalTonUsdPointsPromise = (async () => {
    const endMs = Date.now() + 60 * 60 * 1000;
    const startMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    const chunkMs = 89 * 24 * 60 * 60 * 1000;
    const points = [];
    for (let fromMs = startMs; fromMs < endMs; fromMs += chunkMs) {
      const toMs = Math.min(endMs, fromMs + chunkMs);
      const params = new URLSearchParams({
        vs_currency: "usd",
        from: String(Math.floor(fromMs / 1000)),
        to: String(Math.ceil(toMs / 1000)),
        interval: "hourly",
        precision: "full",
      });
      const payload = await fetchJson(
        `${coinGeckoBase}/coins/the-open-network/market_chart/range?${params}`,
        {
          headers: coinGeckoApiKey ? { "x-cg-demo-api-key": coinGeckoApiKey } : {},
          timeoutMs: 30000,
        },
        4
      );
      (Array.isArray(payload?.prices) ? payload.prices : []).forEach(([timestamp, rate]) => {
        if (Number.isFinite(Number(timestamp)) && Number(rate) > 0) {
          points.push({ timestamp: Number(timestamp), rate: Number(rate) });
        }
      });
      if (toMs < endMs) await sleep(1500);
    }
    const deduped = [...new Map(points.map((point) => [point.timestamp, point])).values()]
      .sort((left, right) => left.timestamp - right.timestamp);
    if (!deduped.length) throw new Error("Historical TON/USD series is empty");
    console.log(`[gift-sales] historical TON/USD series ready: ${deduped.length} observed market points`);
    return deduped;
  })().catch((error) => {
    historicalTonUsdPointsPromise = null;
    throw error;
  });
  return historicalTonUsdPointsPromise;
}

function closestHistoricalRate(points, soldAt = "") {
  const target = new Date(soldAt).getTime();
  if (!Number.isFinite(target) || !points.length) return null;
  let low = 0;
  let high = points.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (points[middle].timestamp < target) low = middle + 1;
    else high = middle;
  }
  const after = points[low];
  const before = points[Math.max(0, low - 1)];
  if (
    before
    && after
    && before.timestamp <= target
    && after.timestamp >= target
    && after.timestamp > before.timestamp
    && after.timestamp - before.timestamp <= historicalRateInterpolationMaxGapMs
  ) {
    const progress = (target - before.timestamp) / (after.timestamp - before.timestamp);
    return {
      timestamp: target,
      rate: before.rate + (after.rate - before.rate) * progress,
    };
  }
  const closest = !before || Math.abs(after.timestamp - target) < Math.abs(before.timestamp - target)
    ? after
    : before;
  if (!closest || Math.abs(closest.timestamp - target) > historicalRateMaxGapMs) return null;
  return closest;
}

async function attachHistoricalUsd(sales = []) {
  if (!sales.length) return { sales: [], pendingRates: 0 };
  const points = await historicalTonUsdPoints();
  let pendingRates = 0;
  const enriched = sales.map((sale) => {
    const observed = closestHistoricalRate(points, sale.soldAt);
    if (!observed) {
      pendingRates += 1;
      return { ...sale, tonUsdRate: 0, priceUsd: 0, rateAt: "" };
    }
    return {
      ...sale,
      tonUsdRate: observed.rate,
      priceUsd: Number(sale.priceTon || 0) * observed.rate,
      rateAt: new Date(observed.timestamp).toISOString(),
    };
  });
  return { sales: enriched, pendingRates };
}

let refreshedSatelliteInitData = satelliteInitData;
let refreshedSatelliteInitDataAt = satelliteInitData ? Date.now() : 0;
let satelliteAuthRefreshPromise = null;

function initDataFromWebViewUrl(value = "") {
  const url = new URL(String(value));
  const direct = url.searchParams.get("tgWebAppData");
  if (direct) return direct;
  const hash = String(url.hash || "").replace(/^#/, "");
  return new URLSearchParams(hash).get("tgWebAppData") || "";
}

async function refreshSatelliteInitData() {
  if (satelliteInitData) return satelliteInitData;
  if (refreshedSatelliteInitData && Date.now() - refreshedSatelliteInitDataAt < satelliteAuthRefreshMs) {
    return refreshedSatelliteInitData;
  }
  if (satelliteAuthRefreshPromise) return satelliteAuthRefreshPromise;

  satelliteAuthRefreshPromise = (async () => {
    const [{ TelegramClient, MemoryStorage }, { convertFromGramjsSession }] = await Promise.all([
      import("@mtcute/node"),
      import("@mtcute/convert"),
    ]);
    const client = new TelegramClient({
      apiId: telegramApiId,
      apiHash: telegramApiHash,
      storage: new MemoryStorage(),
      disableUpdates: true,
    });
    try {
      await client.importSession(convertFromGramjsSession(telegramSession), true);
      await client.connect();
      const bot = await client.resolveUser(satelliteTelegramBot);
      const result = await client.call({
        _: "messages.requestAppWebView",
        peer: { _: "inputPeerSelf" },
        app: {
          _: "inputBotAppShortName",
          botId: bot,
          shortName: satelliteTelegramApp,
        },
        platform: "android",
        writeAllowed: false,
        themeParams: { _: "dataJSON", data: "{}" },
      });
      const initData = initDataFromWebViewUrl(result?.url || "");
      if (!initData) throw new Error("Telegram did not return GiftSatellite WebApp initData");
      refreshedSatelliteInitData = initData;
      refreshedSatelliteInitDataAt = Date.now();
      console.log("[gift-sales] refreshed GiftSatellite Telegram WebApp session");
      return initData;
    } finally {
      await Promise.race([
        client.disconnect(),
        sleep(3000),
      ]).catch(() => {});
    }
  })();

  try {
    return await satelliteAuthRefreshPromise;
  } finally {
    satelliteAuthRefreshPromise = null;
  }
}

let satelliteQueue = Promise.resolve();
let lastSatelliteRequestAt = 0;
let satelliteOutageUntil = 0;
// Keep one adaptive limiter for every GiftSatellite request in this process.
// A rolling rate limit can reject a nominal 1 RPS stream, so retain a small
// penalty after a 429 and decay it only after later successful requests.
let satelliteRatePenaltyMs = 0;

function satelliteRequestIntervalMs() {
  return requestIntervalMs + requestSafetyMs + satelliteRatePenaltyMs;
}

function increaseSatelliteRatePenalty() {
  const previous = satelliteRatePenaltyMs;
  satelliteRatePenaltyMs = Math.min(500, Math.max(100, satelliteRatePenaltyMs + 75));
  if (satelliteRatePenaltyMs !== previous) {
    console.warn(`[gift-sales] GiftSatellite rate limit: pacing requests at ${satelliteRequestIntervalMs()}ms`);
  }
}

function relaxSatelliteRatePenalty() {
  if (satelliteRatePenaltyMs > 0) {
    satelliteRatePenaltyMs = Math.max(0, satelliteRatePenaltyMs - 2);
  }
}

async function waitForSatelliteSlot() {
  const slot = satelliteQueue.then(async () => {
    const elapsed = Date.now() - lastSatelliteRequestAt;
    const interval = satelliteRequestIntervalMs();
    if (elapsed < interval) await sleep(interval - elapsed);
    lastSatelliteRequestAt = Date.now();
  });
  satelliteQueue = slot.catch(() => {});
  await slot;
}

async function fetchJson(url, options = {}, attempts = 4) {
  let lastError = null;
  const requestTarget = (() => {
    try {
      const parsed = new URL(String(url));
      return `${parsed.host}${parsed.pathname}`;
    } catch {
      return String(url).slice(0, 120);
    }
  })();
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const isSatellite = String(url).startsWith(satelliteBase);
      if (isSatellite && Date.now() < satelliteOutageUntil) {
        const error = new Error("GiftSatellite is temporarily unavailable; preserving scan checkpoint until the next retry window");
        error.status = 503;
        error.retryable = false;
        error.providerUnavailable = true;
        throw error;
      }
      if (isSatellite) await waitForSatelliteSlot();
      const initData = isSatellite ? await refreshSatelliteInitData() : "";
      const response = await fetch(url, {
        method: options.method || "GET",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/plain, */*",
          ...(isSatellite ? {
            authorization: initData,
          } : {}),
          ...(options.headers || {}),
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: AbortSignal.timeout(Number(options.timeoutMs || requestTimeoutMs)),
      });
      const text = await response.text();
      let payload = null;
      try {
        payload = text ? JSON.parse(text) : null;
      } catch {
        payload = text;
      }
      if (!response.ok) {
        const error = new Error(`${response.status} ${String(payload?.message || payload?.error || text || "Request failed").slice(0, 180)}`);
        error.status = response.status;
        error.requestTarget = requestTarget;
        error.retryable = response.status === 429 || response.status >= 500;
        // A 5xx from the provider cannot be attributed to one collection. It
        // is an upstream outage, so preserve every checkpoint and retry later.
        error.providerUnavailable = Boolean(isSatellite && response.status >= 500);
        if (isSatellite && response.status === 429) increaseSatelliteRatePenalty();
        error.retryAfterMs = response.status === 429
          ? Math.max(satelliteRequestIntervalMs(), Number(response.headers.get("retry-after") || 0) * 1000 + requestSafetyMs)
          : 0;
        throw error;
      }
      if (isSatellite) relaxSatelliteRatePenalty();
      return payload;
    } catch (error) {
      lastError = error;
      const lastProviderAttempt = error.providerUnavailable && attempt >= 1;
      if (error.retryable === false || lastProviderAttempt || attempt === attempts - 1) {
        if (error.providerUnavailable) satelliteOutageUntil = Date.now() + satelliteOutageCooldownMs;
        break;
      }
      const waitMs = error.retryAfterMs || Math.min(30000, 1000 * (attempt + 1) ** 2);
      console.warn(`[gift-sales] ${requestTarget} retry ${attempt + 1}/${attempts} in ${Math.ceil(waitMs / 1000)}s: ${String(error.message || error).slice(0, 120)}`);
      await sleep(waitMs);
    }
  }
  throw lastError;
}

function namesFromPayload(payload) {
  const containers = [
    payload,
    payload?.content,
    payload?.items,
    payload?.collections,
    payload?.data,
    payload?.data?.content,
    payload?.data?.items,
    payload?.data?.collections,
  ];
  const rows = containers.find(Array.isArray) || [];
  return rows.map((row) => {
    if (typeof row === "string") return row.trim();
    return String(row?.collectionName || row?.collection || row?.name || row?.title || "").trim();
  }).filter(Boolean);
}

async function collectionNames() {
  let satelliteNames = [];
  let registryNames = [];
  if (useSatelliteCollectionCatalog) {
    try {
      satelliteNames = namesFromPayload(await fetchJson(`${satelliteBase}/gift/collections?premarket=0`));
    } catch (error) {
      if (error.status === 401 || error.status === 403) throw error;
      console.warn(`[gift-sales] GiftSatellite collection catalog unavailable: ${String(error.message || error).slice(0, 140)}`);
    }
  }
  try {
    const payload = await fetchJson(`${registryUrl}/collections`, {}, 3);
    registryNames = (Array.isArray(payload?.collections) ? payload.collections : [])
      .map((row) => String(row.collection_name || row.collectionName || "").trim())
      .filter(Boolean);
  } catch (error) {
    console.warn(`[gift-sales] D1 collection catalog unavailable: ${String(error.message || error).slice(0, 140)}`);
  }
  const names = new Map();
  [...satelliteNames, ...registryNames].forEach((name) => {
    const identity = collectionIdentity(name);
    if (identity && !names.has(identity)) names.set(identity, name);
  });
  if (onlyCollection && !names.has(collectionIdentity(onlyCollection))) {
    names.set(collectionIdentity(onlyCollection), onlyCollection);
  }
  const selected = [...names.values()]
    .filter((name) => !onlyCollection || collectionIdentity(name) === collectionIdentity(onlyCollection))
    .sort((left, right) => left.localeCompare(right));
  if (!selected.length) throw new Error("No gift collections found for the sales scan");
  return selected;
}

async function salesStates() {
  if (resetBaseline) return new Map();
  const payload = await fetchJson(`${registryUrl}/sales-state`, {}, 3);
  const states = new Map();
  (Array.isArray(payload?.states) ? payload.states : []).forEach((state) => {
    const identity = collectionIdentity(state.collection || state.collectionKey);
    if (identity) states.set(identity, state);
  });
  return states;
}

async function salesBackfillStates() {
  if (resetBaseline) return new Map();
  const payload = await fetchJson(`${registryUrl}/sales-backfill-state`, {}, 3);
  const states = new Map();
  (Array.isArray(payload?.states) ? payload.states : []).forEach((state) => {
    const identity = collectionIdentity(state.collection || state.collectionKey);
    if (identity) states.set(identity, state);
  });
  return states;
}

function satelliteSale(row = {}, fallbackCollection = "") {
  const collection = String(row.collectionName || row.collection || fallbackCollection || "").trim();
  const model = String(row.modelName || row.model || "").trim();
  const backdrop = String(row.backdropName || row.backdrop || "").trim();
  const symbol = String(row.symbolName || row.symbol || "").trim();
  const priceTon = Number(row.normalizedPrice || 0);
  const soldAt = String(row.soldAt || row.date || "").trim();
  if (!collection || !model || !backdrop || !(priceTon > 0) || !Number.isFinite(new Date(soldAt).getTime())) return null;
  const slug = String(row.slug || "").trim();
  return {
    saleId: String(row._id || row.id || [collection, model, backdrop, row.market, slug, soldAt, priceTon].join("|")),
    collection,
    model,
    backdrop,
    symbol,
    marketplace: String(row.market || row.marketplace || "").trim(),
    slug,
    giftId: String(row.giftId || row.gift_id || "").trim(),
    number: Number(row.number || 0),
    priceTon,
    originalPrice: row.originalPrice ?? "",
    soldAt,
    giftUrl: slug ? `https://t.me/nft/${encodeURIComponent(slug)}` : "",
  };
}

function pageRows(payload = {}) {
  const rows = Array.isArray(payload?.content) ? payload.content
    : Array.isArray(payload?.data?.content) ? payload.data.content
      : Array.isArray(payload?.items) ? payload.items : [];
  const page = payload?.page || payload?.data?.page || {};
  return {
    rows,
    pageNumber: Number(page.number || 0),
    totalPages: Math.max(0, Number(page.totalPages || page.total_pages || 0)),
  };
}

async function fetchSalesPage(collection, page, filters = {}) {
  return fetchJson(`${satelliteBase}/history/${encodeURIComponent(collection)}`, {
    method: "POST",
    body: {
      models: Array.isArray(filters.models) ? filters.models : [],
      backdrops: Array.isArray(filters.backdrops) ? filters.backdrops : [],
      symbols: [],
      number: "",
      sortBy: "date",
      markets: null,
      page,
      pageSize,
    },
  }, 6);
}

function exactPairKey(pair = {}) {
  return [pair.collection, pair.model, pair.backdrop].map(key).join(":");
}

async function collectionCombos(collection) {
  const payload = await fetchJson(`${registryUrl}/collection-combos`, {
    method: "POST",
    body: { collections: [collection] },
  }, 3);
  const match = (Array.isArray(payload?.collections) ? payload.collections : []).find((entry) => (
    collectionIdentity(entry.collection || entry.collectionKey) === collectionIdentity(collection)
  ));
  if (!match) return [];
  const unique = new Map();
  Object.values(match.combinations || {}).forEach((entry) => {
    const pair = {
      collection: match.collection || collection,
      model: String(entry?.model || "").trim(),
      backdrop: String(entry?.backdrop || "").trim(),
    };
    if (pair.model && pair.backdrop) unique.set(exactPairKey(pair), pair);
  });
  return [...unique.values()].sort((left, right) => exactPairKey(left).localeCompare(exactPairKey(right)));
}

async function existingSalesForPairs(pairs = []) {
  if (!pairs.length) return new Set();
  const payload = await fetchJson(`${registryUrl}/sales`, {
    method: "POST",
    body: { pairs, limit: salesPerComboTarget },
  }, 3);
  return new Set((Array.isArray(payload?.results) ? payload.results : [])
    .filter((entry) => (
      Array.isArray(entry.sales)
      && entry.sales.length >= salesPerComboTarget
      && entry.sales.every((sale) => (
        Number(sale.priceUsd || 0) > 0
        && Number(sale.tonUsdRate || 0) > 0
        && sale.rateAt
      ))
    ))
    .map(exactPairKey));
}

async function prioritySalesTargets() {
  try {
    const payload = await fetchJson(`${registryUrl}/sales-targets?limit=${exactPriorityTargetLimit}`, {
      headers: { authorization: `Bearer ${ingestSecret}` },
    }, 3);
    return Array.isArray(payload?.targets) ? payload.targets : [];
  } catch (error) {
    console.warn(`[gift-sales] priority targets unavailable; continuing persisted coverage: ${String(error.message || error).slice(0, 120)}`);
    return [];
  }
}

async function newestExactSale(pair = {}) {
  const cutoffMs = Date.now() - retentionDays * 86400000;
  const payload = await fetchSalesPage(pair.collection, 0, {
    models: [pair.model],
    backdrops: [pair.backdrop],
  });
  const normalized = pageRows(payload).rows
    .map((row) => satelliteSale(row, pair.collection))
    .filter((sale) => (
      key(sale.model) === key(pair.model)
      && key(sale.backdrop) === key(pair.backdrop)
      && new Date(sale.soldAt).getTime() >= cutoffMs
    ))
    .sort((left, right) => new Date(right.soldAt) - new Date(left.soldAt));
  return normalized[0] || null;
}

async function newestExactSalesForPairs(pairs = [], requestBudget = exactRequestBudget) {
  const ordered = [...new Map((Array.isArray(pairs) ? pairs : [])
    .filter((pair) => pair?.collection && pair?.model && pair?.backdrop)
    .map((pair) => [exactPairKey(pair), pair])).values()];
  const resolved = new Set();
  const sales = [];
  const salesByPair = new Map();
  let requestsMade = 0;
  const cutoffMs = Date.now() - retentionDays * 86400000;
  for (const pair of ordered) {
    if (requestsMade >= requestBudget) break;
    const payload = await fetchSalesPage(pair.collection, 0, {
      models: [pair.model],
      backdrops: [pair.backdrop],
    });
    requestsMade += 1;
    const pairKey = exactPairKey(pair);
    const rows = pageRows(payload).rows
      .map((row) => satelliteSale(row, pair.collection))
      .filter((sale) => (
        sale
        && exactPairKey(sale) === pairKey
        && new Date(sale.soldAt).getTime() >= cutoffMs
      ))
      .sort((left, right) => new Date(right.soldAt) - new Date(left.soldAt))
      .slice(0, salesPerComboTarget);
    resolved.add(pairKey);
    salesByPair.set(pairKey, rows);
    sales.push(...rows);
  }
  return { sales, salesByPair, resolved, requestsMade };
}

async function uploadStatus(status = {}) {
  if (dryRun) return;
  try {
    await fetchJson(`${registryUrl}/ingest/status`, {
      method: "POST",
      headers: { authorization: `Bearer ${ingestSecret}` },
      body: { worker: "gift-sales-worker", ...status },
    }, 3);
  } catch (error) {
    console.warn(`[gift-sales] status upload failed: ${String(error.message || error).slice(0, 140)}`);
  }
}

async function scanCollection(collection, previousState = null) {
  const previousId = String(previousState?.newestSaleId || "");
  const previousAt = new Date(previousState?.newestSoldAt || 0).getTime();
  const pageLimit = previousId || Number.isFinite(previousAt) && previousAt > 0 ? maxIncrementalPages : baselinePages;
  const sales = [];
  let pagesScanned = 0;
  let newestSaleId = "";
  let newestSoldAt = "";
  for (let page = 0; page < pageLimit; page += 1) {
    const payload = await fetchSalesPage(collection, page);
    const result = pageRows(payload);
    const normalized = result.rows.map((row) => satelliteSale(row, collection)).filter(Boolean);
    pagesScanned += 1;
    if (page === 0 && normalized[0]) {
      newestSaleId = normalized[0].saleId;
      newestSoldAt = normalized[0].soldAt;
    }
    let reachedWatermark = false;
    normalized.forEach((sale) => {
      const soldAt = new Date(sale.soldAt).getTime();
      if (previousId && sale.saleId === previousId) reachedWatermark = true;
      if (!previousId && Number.isFinite(previousAt) && previousAt > 0 && soldAt < previousAt) reachedWatermark = true;
      if (!reachedWatermark) sales.push(sale);
    });
    const lastSoldAt = normalized.length ? new Date(normalized[normalized.length - 1].soldAt).getTime() : 0;
    const passedPreviousTime = Number.isFinite(previousAt) && previousAt > 0 && lastSoldAt > 0 && lastSoldAt < previousAt;
    const finalPage = !result.rows.length
      || result.rows.length < pageSize
      || (result.totalPages > 0 && page + 1 >= result.totalPages);
    if (reachedWatermark || passedPreviousTime || finalPage) break;
  }
  return { collection, sales, pagesScanned, newestSaleId, newestSoldAt };
}

async function scanChronologicalBackfillCollection(collection, previousState = null, pageBudget = backfillPagesPerCollection) {
  // Re-read the boundary page because new sales can shift offset pagination
  // between checkpoints. D1 de-duplicates the intentional overlap by sale ID.
  const startPage = Math.max(0, Number(previousState?.nextPage || 0) - (previousState ? 1 : 0));
  const desiredCutoffAt = new Date(Date.now() - retentionDays * 86400000).toISOString();
  const previousCutoffAt = String(previousState?.cutoffAt || "");
  const cutoffAt = previousCutoffAt && new Date(previousCutoffAt).getTime() <= new Date(desiredCutoffAt).getTime()
    ? previousCutoffAt
    : desiredCutoffAt;
  const cutoffMs = new Date(cutoffAt).getTime();
  const sales = [];
  let pagesScanned = 0;
  let rowsSeen = 0;
  let nextPage = startPage;
  let complete = false;
  let oldestSaleId = String(previousState?.oldestSaleId || "");
  let oldestSoldAt = String(previousState?.oldestSoldAt || "");

  const pagesToScan = Math.max(1, Math.min(backfillPagesPerCollection, Number(pageBudget || backfillPagesPerCollection)));
  for (let page = startPage; page < startPage + pagesToScan; page += 1) {
    const payload = await fetchSalesPage(collection, page);
    const result = pageRows(payload);
    const normalized = result.rows.map((row) => satelliteSale(row, collection)).filter(Boolean);
    pagesScanned += 1;
    rowsSeen += result.rows.length;
    nextPage = page + 1;

    const withinWindow = normalized.filter((sale) => new Date(sale.soldAt).getTime() >= cutoffMs);
    sales.push(...withinWindow);
    const pageOldest = normalized.slice().sort((left, right) => new Date(left.soldAt) - new Date(right.soldAt))[0] || null;
    const acceptedOldest = withinWindow.slice().sort((left, right) => new Date(left.soldAt) - new Date(right.soldAt))[0] || null;
    if (acceptedOldest && (!oldestSoldAt || acceptedOldest.soldAt < oldestSoldAt)) {
      oldestSaleId = acceptedOldest.saleId;
      oldestSoldAt = acceptedOldest.soldAt;
    }

    const finalPage = !result.rows.length
      || result.rows.length < pageSize
      || (result.totalPages > 0 && page + 1 >= result.totalPages);
    const reachedCutoff = Boolean(pageOldest && new Date(pageOldest.soldAt).getTime() <= cutoffMs);
    if (finalPage || reachedCutoff) {
      complete = true;
      break;
    }
  }

  return {
    mode: "backfill",
    coverageMode: "chronological",
    collection,
    sales,
    pagesScanned,
    rowsSeen,
    nextPage,
    oldestSaleId,
    oldestSoldAt,
    cutoffAt,
    complete,
  };
}

async function scanExactBackfillCollection(collection, previousState = null, requestBudget = exactRequestBudget) {
  const combinations = await collectionCombos(collection);
  if (!combinations.length) throw new Error("No registry combinations available for exact sales coverage");
  const startIndex = Math.max(0, Math.min(combinations.length, Number(previousState?.nextPage || 0)));
  const candidates = combinations.slice(startIndex, startIndex + exactCollectionBatchSize);
  const alreadyStored = await existingSalesForPairs(candidates);
  const sales = [];
  const resolved = new Set(alreadyStored);
  let requestsMade = 0;
  let lastProgressAt = 0;

  for (let index = 0; index < candidates.length && requestsMade < requestBudget;) {
    const first = candidates[index];
    const sameModel = [];
    while (
      index < candidates.length
      && key(candidates[index].model) === key(first.model)
      && sameModel.length < exactFilterBatchSize
    ) {
      const pair = candidates[index];
      if (!resolved.has(exactPairKey(pair))) sameModel.push(pair);
      index += 1;
    }

    if (sameModel.length) {
      const result = await newestExactSalesForPairs(sameModel, requestBudget - requestsMade);
      requestsMade += result.requestsMade;
      result.sales.forEach((sale) => sales.push(sale));
      result.resolved.forEach((pairKey) => resolved.add(pairKey));
    }

    let inspected = 0;
    while (inspected < candidates.length && resolved.has(exactPairKey(candidates[inspected]))) inspected += 1;
    if (
      inspected === candidates.length
      || requestsMade - lastProgressAt >= exactProgressInterval
    ) {
      lastProgressAt = requestsMade;
      const current = startIndex + inspected;
      console.log(`[gift-sales-exact] ${collection}: progress=${current}/${combinations.length} requests=${requestsMade} found=${sales.length}`);
      await uploadStatus({
        phase: "backfill_collection_scanning",
        collection,
        currentPage: current,
        totalPages: combinations.length,
        message: `${requestsMade} exact requests; ${sales.length} sales found in current checkpoint`,
      });
    }
  }
  let inspected = 0;
  while (inspected < candidates.length && resolved.has(exactPairKey(candidates[inspected]))) inspected += 1;
  const nextPage = startIndex + inspected;
  return {
    mode: "backfill",
    coverageMode: "exact",
    collection,
    sales,
    pagesScanned: requestsMade,
    requestsMade,
    rowsSeen: inspected,
    nextPage,
    cutoffAt: new Date(Date.now() - retentionDays * 86400000).toISOString(),
    complete: nextPage >= combinations.length,
    totalCombinations: combinations.length,
  };
}

async function scanPriorityTargets(targets = [], requestBudget = exactRequestBudget) {
  const unique = new Map();
  (Array.isArray(targets) ? targets : []).forEach((target) => {
    const pair = {
      collection: String(target.collection || "").trim(),
      model: String(target.model || "").trim(),
      backdrop: String(target.backdrop || "").trim(),
    };
    if (pair.collection && pair.model && pair.backdrop) unique.set(exactPairKey(pair), pair);
  });
  const ordered = [...unique.values()].sort((left, right) => exactPairKey(left).localeCompare(exactPairKey(right)));
  const resolved = new Set();
  const sales = new Map();
  let requestsMade = 0;

  for (let index = 0; index < ordered.length && requestsMade < requestBudget;) {
    const first = ordered[index];
    const group = [];
    while (
      index < ordered.length
      && collectionIdentity(ordered[index].collection) === collectionIdentity(first.collection)
      && key(ordered[index].model) === key(first.model)
      && group.length < exactFilterBatchSize
    ) {
      group.push(ordered[index]);
      index += 1;
    }
    const result = await newestExactSalesForPairs(group, requestBudget - requestsMade);
    requestsMade += result.requestsMade;
    result.resolved.forEach((pairKey) => resolved.add(pairKey));
    result.salesByPair.forEach((rows, pairKey) => sales.set(pairKey, rows));
  }

  return { ordered, resolved, sales, requestsMade };
}

async function uploadSales(snapshot) {
  if (dryRun) return { ok: true, inserted: 0, accepted: snapshot.sales.length, dryRun: true };
  const rawSales = Array.isArray(snapshot.sales) ? snapshot.sales : [];
  const enriched = await attachHistoricalUsd(rawSales);
  const sales = enriched.sales;
  const pendingRates = Number(enriched.pendingRates || 0);
  if (pendingRates > 0) {
    throw new Error(`Historical TON/USD pending for ${pendingRates}/${sales.length} sales; no rows or checkpoints committed`);
  }
  const chunkSize = 40;
  const chunks = sales.length ? Array.from({ length: Math.ceil(sales.length / chunkSize) }, (_, index) => sales.slice(index * chunkSize, (index + 1) * chunkSize)) : [[]];
  let inserted = 0;
  let accepted = 0;
  let lastResult = null;
  for (let index = 0; index < chunks.length; index += 1) {
    const commitState = pendingRates === 0 && index === chunks.length - 1;
    const result = await fetchJson(`${registryUrl}/ingest/sales`, {
      method: "POST",
      headers: { authorization: `Bearer ${ingestSecret}` },
      body: {
      collection: snapshot.collection,
      source: "gift-satellite",
      mode: snapshot.mode || "incremental",
      commitState,
      scannedAt: new Date().toISOString(),
      pagesScanned: commitState ? snapshot.pagesScanned : 0,
      rowsSeen: commitState ? Number(snapshot.rowsSeen ?? sales.length) : 0,
      newestSaleId: snapshot.newestSaleId,
      newestSoldAt: snapshot.newestSoldAt,
      nextPage: snapshot.nextPage,
      oldestSaleId: snapshot.oldestSaleId,
      oldestSoldAt: snapshot.oldestSoldAt,
      cutoffAt: snapshot.cutoffAt,
      coverageMode: snapshot.coverageMode,
      complete: Boolean(snapshot.complete),
      target: snapshot.target,
      sales: chunks[index],
      },
      timeoutMs: 30000,
    }, 4);
    inserted += Number(result.inserted || 0);
    accepted += Number(result.accepted || chunks[index].length);
    lastResult = result;
  }
  return {
    ...(lastResult || {}),
    inserted,
    accepted,
    chunks: chunks.length,
  };
}

async function runCycle() {
  const startedAt = Date.now();
  const [collections, states, backfillStates] = await Promise.all([collectionNames(), salesStates(), salesBackfillStates()]);
  // Conversion availability is a cycle prerequisite. If the rate provider is
  // down, do not spend GiftSatellite's limited request budget on data whose
  // checkpoints cannot be committed accurately.
  await historicalTonUsdPoints();
  let completed = 0;
  let failed = 0;
  let inserted = 0;
  let backfillCompleted = 0;
  let backfillFailed = 0;
  let remainingExactRequests = exactBackfillEnabled ? exactRequestBudget : 0;
  await uploadStatus({
    phase: "cycle_started",
    totalCollections: collections.length,
    message: `GiftSatellite recent-sales cycle started for ${collections.length} collections`,
  });

  if (exactBackfillEnabled && remainingExactRequests > 0) {
    const targets = await prioritySalesTargets();
    let targetInserted = 0;
    let targetFailed = 0;
    let targetProcessed = 0;
    console.log(`[gift-sales-exact] wallet-priority targets=${targets.length}`);
    try {
      const priority = await scanPriorityTargets(targets, remainingExactRequests);
      remainingExactRequests -= priority.requestsMade;
      for (const target of priority.ordered) {
        const pairKey = exactPairKey(target);
        if (!priority.resolved.has(pairKey)) continue;
        try {
          const pairSales = priority.sales.get(pairKey) || [];
          const result = await uploadSales({
            mode: "exact",
            collection: target.collection,
            target,
            sales: pairSales,
            pagesScanned: 0,
            rowsSeen: pairSales.length,
          });
          targetProcessed += 1;
          targetInserted += Number(result.inserted || 0);
          inserted += Number(result.inserted || 0);
        } catch (error) {
          targetFailed += 1;
          console.warn(`[gift-sales-exact] ${target.collection} / ${target.model} / ${target.backdrop} upload failed: ${String(error.message || error).slice(0, 140)}`);
        }
      }
      console.log(`[gift-sales-exact] wallet-priority processed=${targetProcessed} requests=${priority.requestsMade} inserted=${targetInserted} failed=${targetFailed} remainingBudget=${remainingExactRequests}`);
    } catch (error) {
      if (error.status === 401 || error.status === 403) throw error;
      targetFailed += 1;
      console.warn(`[gift-sales-exact] wallet-priority batch failed: ${String(error.message || error).slice(0, 180)}`);
    }
  }

  console.log(`[gift-sales] scanning ${collections.length} collections at ${requestIntervalMs}ms/request pageSize=${pageSize} coverage=${exactBackfillEnabled ? `exact budget=${exactRequestBudget}` : `chronological burst=${backfillPagesPerCollection}`}`);
  for (let index = 0; index < collections.length; index += 1) {
    const collection = collections[index];
    try {
      const state = states.get(collectionIdentity(collection)) || null;
      const snapshot = await scanCollection(collection, state);
      const result = await uploadSales(snapshot);
      completed += 1;
      inserted += Number(result.inserted || 0);
      console.log(`[gift-sales] [${index + 1}/${collections.length}] ${collection}: pages=${snapshot.pagesScanned} new=${snapshot.sales.length} inserted=${Number(result.inserted || 0)}`);
      await uploadStatus({
        phase: "collection_complete",
        collection,
        currentPage: snapshot.pagesScanned,
        totalPages: state ? maxIncrementalPages : baselinePages,
        completedCollections: completed,
        totalCollections: collections.length,
        message: `${snapshot.sales.length} new sales, ${Number(result.inserted || 0)} inserted`,
      });
    } catch (error) {
      if (error.status === 401 || error.status === 403) throw error;
      if (error.providerUnavailable) {
        const message = String(error.message || error).slice(0, 180);
        console.error(`[gift-sales] GiftSatellite returned an HTML 5xx response; stopping this cycle without advancing collection checkpoints: ${message}`);
        await uploadStatus({
          phase: "source_unavailable",
          collection,
          completedCollections: completed,
          totalCollections: collections.length,
          message,
        });
        throw error;
      }
      failed += 1;
      const message = `${error.requestTarget || "request"}: ${String(error.message || error)}`.slice(0, 180);
      console.warn(`[gift-sales] [${index + 1}/${collections.length}] ${collection} failed: ${message}`);
      await uploadStatus({
        phase: "collection_failed",
        collection,
        completedCollections: completed,
        totalCollections: collections.length,
        message,
      });
    }
  }
  const desiredCutoffMs = Date.now() - retentionDays * 86400000;
  const selectedCoverageMode = exactBackfillEnabled ? "exact" : "chronological";
  const hasCurrentCoverage = (state) => Boolean(
    state?.completedAt
    && state?.coverageMode === selectedCoverageMode
    && Number.isFinite(new Date(state.cutoffAt || 0).getTime())
    && new Date(state.cutoffAt).getTime() <= desiredCutoffMs
  );
  const pendingBackfills = collections.filter((collection) => {
    const state = backfillStates.get(collectionIdentity(collection));
    return !hasCurrentCoverage(state);
  }).sort((left, right) => {
    const leftState = backfillStates.get(collectionIdentity(left));
    const rightState = backfillStates.get(collectionIdentity(right));
    // Prefer the deepest resumable checkpoint, but process just one burst per
    // collection in this cycle so all collections advance together.
    const leftProgress = Number(leftState?.nextPage || 0);
    const rightProgress = Number(rightState?.nextPage || 0);
    if (leftProgress !== rightProgress) return rightProgress - leftProgress;
    if (Boolean(leftState) !== Boolean(rightState)) return leftState ? -1 : 1;
    return left.localeCompare(right);
  });
  await uploadStatus({
    phase: "backfill_started",
    totalCollections: collections.length,
    message: `${retentionDays}D backfill pending for ${pendingBackfills.length} collections`,
  });
  let remainingBackfillRequests = backfillRequestBudget;
  for (let index = 0; index < pendingBackfills.length && remainingBackfillRequests > 0; index += 1) {
    if (exactBackfillEnabled && remainingExactRequests <= 0) break;
    const collection = pendingBackfills[index];
    const savedBackfillState = backfillStates.get(collectionIdentity(collection)) || null;
    // Combination-based checkpoints have a combo index, not a chronological
    // source page. Never resume one as though it were page-based coverage.
    const backfillState = savedBackfillState?.coverageMode === selectedCoverageMode
      ? savedBackfillState
      : null;
    try {
      const budget = exactBackfillEnabled
        ? Math.min(exactCollectionBatchSize, remainingExactRequests)
        : Math.min(backfillPagesPerCollection, remainingBackfillRequests);
      const backfill = exactBackfillEnabled
        ? await scanExactBackfillCollection(collection, backfillState, budget)
        : await scanChronologicalBackfillCollection(collection, backfillState, budget);
      const usedRequests = Number(backfill.requestsMade || backfill.pagesScanned || 0);
      // Charge source requests before conversion/upload. A downstream failure
      // must not let the cycle exceed GiftSatellite's configured request cap.
      remainingBackfillRequests -= usedRequests;
      if (exactBackfillEnabled) remainingExactRequests -= usedRequests;
      const result = await uploadSales(backfill);
      inserted += Number(result.inserted || 0);
      const complete = Boolean(backfill.complete);
      if (complete) backfillCompleted += 1;
      console.log(`[gift-sales-${exactBackfillEnabled ? "exact" : "backfill"}] [${index + 1}/${pendingBackfills.length}] ${collection}: requests=${backfill.pagesScanned} next=${backfill.nextPage}${backfill.totalCombinations ? `/${backfill.totalCombinations}` : ""} accepted=${backfill.sales.length} inserted=${Number(result.inserted || 0)} complete=${complete} budgetLeft=${remainingBackfillRequests}`);
      await uploadStatus({
        phase: complete ? "backfill_collection_complete" : "backfill_collection_checkpoint",
        collection,
        currentPage: backfill.nextPage,
        completedCollections: index + 1,
        totalCollections: pendingBackfills.length,
        message: `${backfill.sales.length} accepted within ${retentionDays}D; complete=${complete}; budgetLeft=${remainingBackfillRequests}`,
      });
    } catch (error) {
      if (error.status === 401 || error.status === 403) throw error;
      backfillFailed += 1;
      console.warn(`[gift-sales-backfill] ${collection} failed: ${String(error.message || error).slice(0, 180)}`);
    }
  }
  const durationMs = Date.now() - startedAt;
  const selectedCollectionIds = new Set(collections.map(collectionIdentity));
  const previouslyBackfilled = [...backfillStates.entries()]
    .filter(([collectionId, state]) => selectedCollectionIds.has(collectionId) && hasCurrentCoverage(state))
    .length;
  const backfillTotalCompleted = Math.min(collections.length, previouslyBackfilled + backfillCompleted);
  const backfillPending = Math.max(0, collections.length - backfillTotalCompleted);
  const cyclePhase = backfillPending === 0 && backfillFailed === 0 ? "cycle_complete" : "backfill_incomplete";

  await uploadStatus({
    phase: cyclePhase,
    completedCollections: backfillTotalCompleted,
    totalCollections: collections.length,
    message: `latest=${completed}/${collections.length} inserted=${inserted} failed=${failed} backfill=${backfillTotalCompleted}/${collections.length} pending=${backfillPending} backfillFailed=${backfillFailed} duration=${Math.round(durationMs / 1000)}s`,
  });
  console.log(`[gift-sales] ${cyclePhase}: latest=${completed}/${collections.length} failed=${failed} inserted=${inserted} backfill=${backfillTotalCompleted}/${collections.length} pending=${backfillPending} backfillFailed=${backfillFailed} duration=${Math.round(durationMs / 1000)}s`);
  return { completed, failed, inserted, backfillCompleted, backfillFailed, backfillPending, durationMs };
}

function acquireLock() {
  fs.mkdirSync(path.dirname(lockFile), { recursive: true });
  try {
    fs.writeFileSync(lockFile, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }), { flag: "wx" });
  } catch {
    let existingPid = 0;
    try {
      existingPid = Number(JSON.parse(fs.readFileSync(lockFile, "utf8")).pid || 0);
      if (existingPid) process.kill(existingPid, 0);
    } catch {
      existingPid = 0;
    }
    if (existingPid) throw new Error(`Gift sales worker already running with pid ${existingPid}`);
    fs.rmSync(lockFile, { force: true });
    fs.writeFileSync(lockFile, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }), { flag: "wx" });
  }
  const release = () => {
    try {
      const current = JSON.parse(fs.readFileSync(lockFile, "utf8"));
      if (Number(current.pid || 0) === process.pid) fs.rmSync(lockFile, { force: true });
    } catch {}
  };
  process.once("exit", release);
  process.once("SIGINT", () => { release(); process.exit(130); });
  process.once("SIGTERM", () => { release(); process.exit(143); });
  return release;
}

async function main() {
  const release = acquireLock();
  try {
    do {
      let nextCycleDelayMs = cycleDelayMs;
      try {
        const result = await runCycle();
        if (result.backfillPending > 0) nextCycleDelayMs = incompleteCycleDelayMs;
      } catch (error) {
        if (!continuousMode) throw error;
        const message = String(error.message || error).slice(0, 180);
        console.error(`[gift-sales] cycle failed; retrying after cooldown: ${message}`);
        await uploadStatus({ phase: "cycle_failed", message });
      }
      if (continuousMode) {
        console.log(`[gift-sales] next cycle in ${Math.round(nextCycleDelayMs / 1000)}s`);
        await sleep(nextCycleDelayMs);
      }
    } while (continuousMode);
  } finally {
    release();
  }
}

async function closeTelegramClient() {
  await satelliteAuthRefreshPromise?.catch(() => {});
}

main()
  .catch((error) => {
    console.error(`[gift-sales] fatal: ${error.stack || error.message || error}`);
    process.exitCode = 1;
  })
  .finally(closeTelegramClient);
