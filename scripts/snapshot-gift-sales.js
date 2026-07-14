const fs = require("fs");
const path = require("path");
const { TelegramClient, Api } = require("telegram");
const { StringSession } = require("telegram/sessions");

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
const registryUrl = String(process.env.D1_REGISTRY_URL || "").replace(/\/+$/, "");
const ingestSecret = String(process.env.D1_INGEST_SECRET || "");
const requestIntervalMs = Math.max(250, Number(process.env.GIFT_SALES_REQUEST_INTERVAL_MS || 1000));
const requestTimeoutMs = Math.max(5000, Number(process.env.GIFT_SALES_REQUEST_TIMEOUT_MS || 20000));
const pageSize = 20;
const baselinePages = Math.max(1, Math.min(100, Number(process.env.GIFT_SALES_BASELINE_PAGES || 10)));
const maxIncrementalPages = Math.max(1, Math.min(100, Number(process.env.GIFT_SALES_MAX_INCREMENTAL_PAGES || 25)));
const cycleDelayMs = Math.max(60 * 1000, Number(process.env.GIFT_SALES_CYCLE_DELAY_MS || 15 * 60 * 1000));
const continuousMode = process.argv.includes("--continuous") || process.env.GIFT_SALES_CONTINUOUS === "1";
const dryRun = process.argv.includes("--dry-run") || process.env.GIFT_SALES_DRY_RUN === "1";
const resetBaseline = process.argv.includes("--reset");
const collectionArgIndex = process.argv.indexOf("--collection");
const onlyCollection = collectionArgIndex >= 0 ? String(process.argv[collectionArgIndex + 1] || "").trim() : "";
const lockFile = path.join(root, "data", "gift-sales-worker.lock");

const hasTelegramWebViewAuth = Boolean(telegramApiId && telegramApiHash && telegramSession);

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

let telegramClient = null;
let refreshedSatelliteInitData = satelliteInitData;
let refreshedSatelliteInitDataAt = satelliteInitData ? Date.now() : 0;

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
  if (!telegramClient) {
    telegramClient = new TelegramClient(new StringSession(telegramSession), telegramApiId, telegramApiHash, {
      connectionRetries: 5,
    });
    await telegramClient.connect();
  }
  const bot = await telegramClient.getInputEntity(satelliteTelegramBot);
  const result = await telegramClient.invoke(new Api.messages.RequestAppWebView({
    peer: "me",
    app: new Api.InputBotAppShortName({
      botId: bot,
      shortName: satelliteTelegramApp,
    }),
    platform: "android",
    writeAllowed: false,
    themeParams: new Api.DataJSON({ data: "{}" }),
  }));
  const initData = initDataFromWebViewUrl(result?.url || "");
  if (!initData) throw new Error("Telegram did not return GiftSatellite WebApp initData");
  refreshedSatelliteInitData = initData;
  refreshedSatelliteInitDataAt = Date.now();
  console.log("[gift-sales] refreshed GiftSatellite Telegram WebApp session");
  return initData;
}

async function satelliteHeaders() {
  return { authorization: await refreshSatelliteInitData() };
}

let satelliteQueue = Promise.resolve();
let lastSatelliteRequestAt = 0;

async function waitForSatelliteSlot() {
  const slot = satelliteQueue.then(async () => {
    const elapsed = Date.now() - lastSatelliteRequestAt;
    if (elapsed < requestIntervalMs) await sleep(requestIntervalMs - elapsed);
    lastSatelliteRequestAt = Date.now();
  });
  satelliteQueue = slot.catch(() => {});
  await slot;
}

async function fetchJson(url, options = {}, attempts = 4) {
  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const isSatellite = String(url).startsWith(satelliteBase);
      if (isSatellite) await waitForSatelliteSlot();
      const response = await fetch(url, {
        method: options.method || "GET",
        headers: {
          "content-type": "application/json",
          ...(isSatellite ? await satelliteHeaders() : {}),
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
        error.retryable = response.status === 429 || response.status >= 500;
        error.retryAfterMs = response.status === 429
          ? Math.max(requestIntervalMs, Number(response.headers.get("retry-after") || 0) * 1000)
          : 0;
        throw error;
      }
      return payload;
    } catch (error) {
      lastError = error;
      if (error.retryable === false || attempt === attempts - 1) break;
      const waitMs = error.retryAfterMs || Math.min(30000, 1000 * (attempt + 1) ** 2);
      console.warn(`[gift-sales] request retry ${attempt + 1}/${attempts} in ${Math.ceil(waitMs / 1000)}s: ${String(error.message || error).slice(0, 120)}`);
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
  try {
    satelliteNames = namesFromPayload(await fetchJson(`${satelliteBase}/gift/collections?premarket=0`));
  } catch (error) {
    if (error.status === 401 || error.status === 403) throw error;
    console.warn(`[gift-sales] GiftSatellite collection catalog unavailable: ${String(error.message || error).slice(0, 140)}`);
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

async function fetchSalesPage(collection, page) {
  return fetchJson(`${satelliteBase}/history/${encodeURIComponent(collection)}`, {
    method: "POST",
    body: {
      models: [],
      backdrops: [],
      symbols: [],
      number: "",
      sortBy: "date",
      markets: null,
      page,
      pageSize,
    },
  });
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

async function uploadSales(snapshot) {
  if (dryRun) return { ok: true, inserted: 0, accepted: snapshot.sales.length, dryRun: true };
  return fetchJson(`${registryUrl}/ingest/sales`, {
    method: "POST",
    headers: { authorization: `Bearer ${ingestSecret}` },
    body: {
      collection: snapshot.collection,
      source: "gift-satellite",
      scannedAt: new Date().toISOString(),
      pagesScanned: snapshot.pagesScanned,
      rowsSeen: snapshot.sales.length,
      newestSaleId: snapshot.newestSaleId,
      newestSoldAt: snapshot.newestSoldAt,
      sales: snapshot.sales,
    },
    timeoutMs: 30000,
  }, 4);
}

async function runCycle() {
  const startedAt = Date.now();
  const [collections, states] = await Promise.all([collectionNames(), salesStates()]);
  let completed = 0;
  let failed = 0;
  let inserted = 0;
  await uploadStatus({
    phase: "cycle_started",
    totalCollections: collections.length,
    message: `GiftSatellite recent-sales cycle started for ${collections.length} collections`,
  });
  console.log(`[gift-sales] scanning ${collections.length} collections at ${requestIntervalMs}ms/request`);
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
      failed += 1;
      const message = String(error.message || error).slice(0, 180);
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
  const durationMs = Date.now() - startedAt;
  await uploadStatus({
    phase: "cycle_complete",
    completedCollections: completed,
    totalCollections: collections.length,
    message: `inserted=${inserted} failed=${failed} duration=${Math.round(durationMs / 1000)}s`,
  });
  console.log(`[gift-sales] cycle complete: completed=${completed} failed=${failed} inserted=${inserted} duration=${Math.round(durationMs / 1000)}s`);
  return { completed, failed, inserted, durationMs };
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
      try {
        await runCycle();
      } catch (error) {
        if (!continuousMode) throw error;
        const message = String(error.message || error).slice(0, 180);
        console.error(`[gift-sales] cycle failed; retrying after cooldown: ${message}`);
        await uploadStatus({ phase: "cycle_failed", message });
      }
      if (continuousMode) await sleep(cycleDelayMs);
    } while (continuousMode);
  } finally {
    release();
  }
}

async function closeTelegramClient() {
  if (!telegramClient) return;
  try {
    await Promise.race([
      telegramClient.disconnect(),
      sleep(2000),
    ]);
  } catch {}
  telegramClient = null;
}

main()
  .catch((error) => {
    console.error(`[gift-sales] fatal: ${error.stack || error.message || error}`);
    process.exitCode = 1;
  })
  .finally(closeTelegramClient);
