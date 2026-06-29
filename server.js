const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const { execFile } = require("child_process");
const { Address } = require("@ton/core");

const root = __dirname;
function loadEnvFile() {
  const envPath = path.join(root, ".env");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) return;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  });
}

loadEnvFile();

const port = Number(process.env.PORT || 5177);
const tonApiBase = "https://tonapi.io/v2";
const tonApiKey = process.env.TONAPI_KEY || "";
const usdTonRate = 3.12;
const nativeTonLogo = "https://raw.githubusercontent.com/tonkeeper/opentonapi/master/pkg/references/media/ton_symbol.png";
const JETTON_QUALITY_RULES = {
  minUnverifiedDexLiquidityUsd: 50,
  minStaleDexVolumeUsd: 5,
  minStaleDexTxCount24h: 3,
  largeValueUsd: 100,
  hugeValueUsd: 50000,
  minHugeDexLiquidityUsd: 25000,
  minHugeDexVolumeUsd: 1000,
  minHugeDexTxCount24h: 10,
};
const dataDir = path.join(root, "data");
const snapshotsFile = path.join(dataDir, "wallet-snapshots.json");
const historyCacheDir = path.join(dataDir, "history-cache");
const collectiblesRegistryFile = path.join(dataDir, "telegram-collectibles-registry.json");
const stickerCollectionsRegistryFile = path.join(dataDir, "sticker-collections-registry.json");
const giftFloorSnapshotsFile = path.join(dataDir, "gift-floor-snapshots.json");
const giftLayerRegistryFile = path.join(dataDir, "gift-layer-registry.json");
const d1GiftRegistryUrl = String(process.env.D1_REGISTRY_URL || "").replace(/\/+$/, "");
const d1GiftIngestSecret = String(process.env.D1_INGEST_SECRET || process.env.INGEST_SECRET || "");
const giftRegistryProxyUrl = String(process.env.GIFT_REGISTRY_PROXY_URL || "").replace(/\/+$/, "");
const publicGiftRegistryUrl = "https://tontrack-gift-registry.vishu-vishal264.workers.dev";
const giftRegistryReadUrl = d1GiftRegistryUrl || publicGiftRegistryUrl;
const giftComboCoverageMaxAgeMs = Math.max(60 * 60 * 1000, Number(process.env.GIFT_COMBO_COVERAGE_MAX_AGE_MS || 12 * 60 * 60 * 1000));
let giftSnapshotPgPool = null;
let giftSnapshotPgInitPromise = null;
let giftSnapshotPgUnavailableLogged = false;
const diffCache = new Map();
const chartCache = new Map();
const jettonHistoryCache = new Map();
const walletHistoryCache = new Map();
const walletJettonsCache = new Map();
const walletHistoryJobs = new Map();
const giftComboHealJobs = new Set();
const giftComboExactMissCache = new Map();
const txActionCache = new Map();
const dnsNameCache = new Map();
const historyCacheVersion = "short-ranges-v3";
const historyRanges = ["1D", "7D", "1M"];
const walletHistoryTtl = 15 * 60 * 1000;

function loadCollectiblesRegistry() {
  try {
    return JSON.parse(fs.readFileSync(collectiblesRegistryFile, "utf8"));
  } catch {
    return {};
  }
}

const collectiblesRegistry = loadCollectiblesRegistry();
function loadGiftLayerRegistry() {
  try {
    const parsed = JSON.parse(fs.readFileSync(giftLayerRegistryFile, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : { version: 1, collections: {} };
  } catch {
    return { version: 1, collections: {} };
  }
}

const giftLayerRegistry = loadGiftLayerRegistry();
let giftLayerRegistrySaveTimer = 0;
const jettonHistoryTtl = 15 * 60 * 1000;
const fastGraphHistoryOnly = false;
const geckoIdCache = new Map();
const tokenDetailCache = new Map();
const collectiblesCache = new Map();
const collectiblesRequests = new Map();
const collectibleFloorCache = new Map();
const collectibleSalesCache = new Map();
const nftHistoryCache = new Map();
let stickerdomStatsCache = null;
let stickerdomStatsExpiresAt = 0;
let stickerdomStatsPromise = null;
let thermosStickerStatsCache = null;
let thermosStickerStatsExpiresAt = 0;
let thermosStickerStatsPromise = null;
let stickersToolsStatsCache = null;
let stickersToolsStatsExpiresAt = 0;
let stickersToolsStatsPromise = null;
let thermosGiftCollectionsCache = null;
let thermosGiftCollectionsExpiresAt = 0;
let thermosGiftCollectionsPromise = null;
const thermosGiftAttributesCache = new Map();
const thermosGiftAttributesRequests = new Map();
const xgiftModelMediaCache = new Map();
const xgiftGiftAttributesCache = new Map();
const giftModelRecoveryRequests = new Map();
const giftModelRecoveryQueue = [];
let giftModelRecoveryActive = 0;
let stickerCategoryCache = null;
let stickerCategoryExpiresAt = 0;
let stickerCategoryPromise = null;
let stickerCollectionsRegistryPromise = null;
let stickerCollectionsSnapshotCache = null;
let stickerCollectionsSnapshotMtimeMs = 0;
let liveCollectiblesRegistryCache = null;
let giftSnapshotCollectorState = { status: "idle", startedAt: "", completedAt: "", total: 0, done: 0, ok: 0, errors: 0, modelSnapshots: 0, attributes: 0, error: "" };
let giftSnapshotCollectorPromise = null;
let tonStatCache = null;
let tonStatExpiresAt = 0;
let tonStatPromise = null;
let liveCollectiblesRegistryExpiresAt = 0;
let liveCollectiblesRegistryPromise = null;
const STICKER_COLLECTION_ADDRESSES = new Set();
let geckoCoinsList = null;
let geckoCoinsListPromise = null;
let stonAssetsCache = null;
let tonUsdRateCache = { value: usdTonRate, expiresAt: 0, promise: null };
let tonApiQueue = Promise.resolve();
let historyBuildQueue = Promise.resolve();
let lastTonApiAt = 0;
const tonApiMinDelay = tonApiKey ? 160 : 950;
const giftSnapshotIntervalMs = Number(process.env.GIFT_SNAPSHOT_INTERVAL_MS || 60 * 60 * 1000);
const giftSnapshotUnchangedIntervalMs = Number(process.env.GIFT_SNAPSHOT_UNCHANGED_INTERVAL_MS || 23 * 60 * 60 * 1000);
const giftSnapshotRetentionDays = Number(process.env.GIFT_SNAPSHOT_RETENTION_DAYS || 370);
const giftSnapshotDelayMs = Number(process.env.GIFT_SNAPSHOT_DELAY_MS || 15000);
const giftModelRetryDelayMs = Number(process.env.GIFT_MODEL_RETRY_DELAY_MS || 120000);
const giftModelRetryCount = Number(process.env.GIFT_MODEL_RETRY_COUNT || 2);
const isRailwayRuntime = Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_SERVICE_ID || process.env.RAILWAY_PROJECT_ID);
const giftSnapshotAutorunRequested = process.env.GIFT_SNAPSHOT_AUTORUN === undefined
  ? false
  : process.env.GIFT_SNAPSHOT_AUTORUN === "1";
const giftSnapshotAutorun = giftSnapshotAutorunRequested
  && (!isRailwayRuntime || process.env.TONTRACK_MODE === "gift-snapshot-worker");
const registryPreloadRequested = process.env.REGISTRY_PRELOAD === undefined
  ? isRailwayRuntime
  : process.env.REGISTRY_PRELOAD === "1";

function scheduleGiftLayerRegistrySave() {
  if (giftLayerRegistrySaveTimer) return;
  giftLayerRegistrySaveTimer = setTimeout(() => {
    giftLayerRegistrySaveTimer = 0;
    try {
      fs.mkdirSync(dataDir, { recursive: true });
      fs.writeFileSync(giftLayerRegistryFile, JSON.stringify(giftLayerRegistry, null, 2));
    } catch (error) {
      console.warn(`[gift-layer-registry] save failed: ${error.message}`);
    }
  }, 250);
}

function layerRegistryKey(value = "") {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function clampColorChannel(value) {
  return Math.max(0, Math.min(255, Math.round(Number(value) || 0)));
}

function hslToHex(h, s, l) {
  const hue = ((((Number(h) || 0) % 360) + 360) % 360) / 360;
  const sat = Math.max(0, Math.min(1, (Number(s) || 0) / 100));
  const light = Math.max(0, Math.min(1, (Number(l) || 0) / 100));
  if (sat === 0) {
    const value = clampColorChannel(light * 255).toString(16).padStart(2, "0");
    return `#${value}${value}${value}`;
  }
  const q = light < 0.5 ? light * (1 + sat) : light + sat - light * sat;
  const p = 2 * light - q;
  const hueToRgb = (t) => {
    let value = t;
    if (value < 0) value += 1;
    if (value > 1) value -= 1;
    if (value < 1 / 6) return p + (q - p) * 6 * value;
    if (value < 1 / 2) return q;
    if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6;
    return p;
  };
  const r = clampColorChannel(hueToRgb(hue + 1 / 3) * 255).toString(16).padStart(2, "0");
  const g = clampColorChannel(hueToRgb(hue) * 255).toString(16).padStart(2, "0");
  const b = clampColorChannel(hueToRgb(hue - 1 / 3) * 255).toString(16).padStart(2, "0");
  return `#${r}${g}${b}`;
}

function hashHue(value = "") {
  const text = String(value || "");
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0;
  }
  return Math.abs(hash) % 360;
}

function deriveGiftBackdropPalette(backdropName = "") {
  const name = String(backdropName || "").trim().toLowerCase();
  if (!name) {
    return {
      centerColor: "#6aa7ff",
      edgeColor: "#304e92",
      patternColor: "#cfe0ff",
      textColor: "#ffffff",
    };
  }
  const namedPalettes = [
    { match: /(gold|amber|sun|solar|lemon|yellow)/, palette: { centerColor: "#f5cf59", edgeColor: "#9a6a15", patternColor: "#fff2c1", textColor: "#ffffff" } },
    { match: /(purple|violet|indigo|dark|night|plum)/, palette: { centerColor: "#9b7cff", edgeColor: "#4f2a96", patternColor: "#ebddff", textColor: "#ffffff" } },
    { match: /(teal|mint|aqua|ocean|cyan|ice)/, palette: { centerColor: "#63dcc9", edgeColor: "#1d6d78", patternColor: "#d8fffa", textColor: "#ffffff" } },
    { match: /(red|rose|ruby|crimson|cherry|scarlet)/, palette: { centerColor: "#ff7d89", edgeColor: "#8d2440", patternColor: "#ffd7dc", textColor: "#ffffff" } },
    { match: /(green|forest|lime|leaf|olive)/, palette: { centerColor: "#75da82", edgeColor: "#255d34", patternColor: "#e0ffe4", textColor: "#ffffff" } },
    { match: /(blue|azure|sky|electric|navy)/, palette: { centerColor: "#6baeff", edgeColor: "#274893", patternColor: "#d7e8ff", textColor: "#ffffff" } },
    { match: /(pink|blush|magenta)/, palette: { centerColor: "#ff8bd8", edgeColor: "#8b2d73", patternColor: "#ffe1f5", textColor: "#ffffff" } },
  ];
  const hit = namedPalettes.find((entry) => entry.match.test(name));
  if (hit) return hit.palette;
  const hue = hashHue(name);
  return {
    centerColor: hslToHex(hue, 82, 66),
    edgeColor: hslToHex(hue, 58, 33),
    patternColor: hslToHex(hue, 88, 90),
    textColor: "#ffffff",
  };
}

function rememberGiftLayeredMedia(payload = {}) {
  const collectionName = String(payload.collectionName || payload.giftName || "").trim();
  const modelName = String(payload.modelName || "").trim();
  const backdropName = String(payload.backdropName || "").trim();
  const patternName = String(payload.patternName || "").trim();
  if (!collectionName && !modelName && !backdropName && !patternName) return payload;
  const collectionKey = layerRegistryKey(collectionName || "gift");
  const collectionEntry = giftLayerRegistry.collections[collectionKey] || {
    collectionName,
    giftName: collectionName,
    models: {},
    backdrops: {},
    patterns: {},
    updatedAt: "",
  };
  if (collectionName) {
    collectionEntry.collectionName = collectionEntry.collectionName || collectionName;
    collectionEntry.giftName = collectionEntry.giftName || collectionName;
  }
  if (modelName) {
    collectionEntry.models[layerRegistryKey(modelName)] = {
      name: modelName,
      giftName: payload.giftName || collectionEntry.giftName || collectionName,
      animationUrl: payload.modelAnimationUrl || "",
      imageUrl: payload.modelImageUrl || "",
      mediaType: payload.mediaType || "",
    };
  }
  if (backdropName) {
    collectionEntry.backdrops[layerRegistryKey(backdropName)] = {
      name: backdropName,
      hex: payload.backdropPalette || deriveGiftBackdropPalette(backdropName),
    };
  }
  if (patternName) {
    collectionEntry.patterns[layerRegistryKey(patternName)] = {
      name: patternName,
      giftName: payload.patternGiftName || payload.giftName || collectionEntry.giftName || collectionName,
      imageUrl: payload.patternImageUrl || "",
    };
  }
  collectionEntry.updatedAt = new Date().toISOString();
  giftLayerRegistry.collections[collectionKey] = collectionEntry;
  giftLayerRegistry.updatedAt = collectionEntry.updatedAt;
  scheduleGiftLayerRegistrySave();
  const storedModel = modelName ? collectionEntry.models[layerRegistryKey(modelName)] : null;
  const storedBackdrop = backdropName ? collectionEntry.backdrops[layerRegistryKey(backdropName)] : null;
  const storedPattern = patternName ? collectionEntry.patterns[layerRegistryKey(patternName)] : null;
  return {
    collectionName,
    giftName: payload.giftName || collectionEntry.giftName || collectionName,
    modelName,
    backdropName,
    patternName,
    modelAnimationUrl: storedModel?.animationUrl || payload.modelAnimationUrl || "",
    modelImageUrl: storedModel?.imageUrl || payload.modelImageUrl || "",
    patternImageUrl: storedPattern?.imageUrl || payload.patternImageUrl || "",
    patternGiftName: storedPattern?.giftName || payload.patternGiftName || payload.giftName || collectionEntry.giftName || collectionName,
    backdropPalette: storedBackdrop?.hex || payload.backdropPalette || deriveGiftBackdropPalette(backdropName),
    mediaType: storedModel?.mediaType || payload.mediaType || "",
  };
}

function giftLayeredMediaPayload({ collectionName = "", attributes = [], image = "", animationUrl = "", mediaType = "" } = {}) {
  const traits = giftTraitLookup(attributes || []);
  const requestedCollection = String(collectionName || "").trim();
  const modelName = String(traits.model || "").trim();
  const backdropName = String(traits.backdrop || "").trim();
  const patternName = String(traits.symbol || "").trim();
  if (!requestedCollection || !modelName) return null;
  const requestedKey = layerRegistryKey(requestedCollection);
  const collectionEntry = Object.values(giftLayerRegistry.collections || {}).find((entry) => {
    const names = [entry?.collectionName, entry?.giftName, ...(Array.isArray(entry?.aliases) ? entry.aliases : [])];
    return names.some((name) => layerRegistryKey(name) === requestedKey);
  });
  const storedModel = collectionEntry?.models?.[layerRegistryKey(modelName)];
  const storedBackdrop = collectionEntry?.backdrops?.[layerRegistryKey(backdropName)]
    || giftLayerRegistry.backdrops?.[layerRegistryKey(backdropName)];
  const storedPattern = collectionEntry?.patterns?.[layerRegistryKey(patternName)]
    || giftLayerRegistry.patterns?.[layerRegistryKey(patternName)];
  if (!storedBackdrop?.hex || !storedPattern?.imageUrl) return null;
  return {
    collectionName: collectionEntry?.collectionName || requestedCollection,
    giftName: collectionEntry?.giftName || collectionEntry?.collectionName || requestedCollection,
    modelName,
    backdropName,
    patternName,
    modelAnimationUrl: storedModel?.animationUrl || animationUrl || "",
    modelImageUrl: storedModel?.imageUrl || image || "",
    patternImageUrl: storedPattern?.imageUrl || "",
    backdropPalette: storedBackdrop?.hex || null,
    mediaType: storedModel?.mediaType || mediaType || "",
  };
}

const KNOWN_JETTON_IDS = {
  "0:3690254dc15b2297610cda60744a45f2b710aa4234b89adb630e99d79b01bd4f": "ston-fi",
  "0:2f956143c461769579baef2e32cc2d7bc18283f40d20bb03e432cd603ac33ffc": "notcoin",
  "0:65aac9b5e380eae928db3c8e238d9bc0d61a9320fdc2bc7a2f6c87d6fedf9208": "scale",
};

const KNOWN_SYMBOL_GECKO_IDS = {
  TON: "the-open-network",
  USD: "tether",
  USDT: "tether",
  "USD₮": "tether",
  JUSDT: "tether",
};

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function json(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,authorization",
  });
  res.end(JSON.stringify(body, null, 2));
}

function readJsonBody(req, maxBytes = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > maxBytes) reject(new Error("Request body too large"));
    });
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function safeStaticPath(urlPath) {
  const pathname = decodeURIComponent(urlPath === "/" ? "/index.html" : urlPath);
  const filePath = path.resolve(root, `.${pathname}`);
  return filePath.startsWith(root) ? filePath : null;
}

function requestOrigin(req) {
  const host = req.headers.host || `127.0.0.1:${port}`;
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host);
  const proto = forwardedProto || (req.socket.encrypted || !isLocal ? "https" : "http");
  return `${proto}://${host}`;
}

function tonConnectManifest(req, res) {
  const origin = requestOrigin(req);
  return json(res, 200, {
    url: origin,
    name: "TonTrack Portfolio",
    iconUrl: `${origin}/preview-home.png`,
  });
}

function parseTonAddress(input) {
  try {
    return Address.parse(String(input || "").trim()).toString({ urlSafe: true, bounceable: false });
  } catch {
    throw new Error("Invalid TON wallet address");
  }
}

function isTonDnsName(input = "") {
  return /^[a-z0-9][a-z0-9-_.]{1,126}\.ton$/i.test(String(input || "").trim());
}

async function resolveWalletAddress(input) {
  const value = String(input || "").trim();
  if (!isTonDnsName(value)) return parseTonAddress(value);
  const key = `dns:${value.toLowerCase()}`;
  if (dnsNameCache.has(key)) {
    const cached = dnsNameCache.get(key);
    if (cached) return cached;
  }
  try {
    const payload = await tonApi(`/dns/${encodeURIComponent(value)}/resolve`, { immediate: true });
    const address = payload?.wallet?.address || payload?.address || payload?.account?.address || payload?.item?.address || "";
    const resolved = parseTonAddress(address);
    dnsNameCache.set(key, resolved);
    return resolved;
  } catch {
    dnsNameCache.set(key, "");
    throw new Error(`Could not resolve TON DNS name ${value}`);
  }
}

function rawTonAddress(input) {
  return Address.parse(String(input || "").trim()).toRawString().toLowerCase();
}

function friendlyTonAddress(input) {
  if (!input) return "";
  try {
    return Address.parse(String(input).trim()).toString({ urlSafe: true, bounceable: false });
  } catch {
    return String(input || "");
  }
}

function serveStatic(req, res) {
  const filePath = safeStaticPath(new URL(req.url, `http://${req.headers.host}`).pathname);
  if (!filePath) return json(res, 403, { error: "Forbidden" });
  fs.readFile(filePath, (error, data) => {
    if (error) return json(res, 404, { error: "Not found" });
    res.writeHead(200, {
      "content-type": mime[path.extname(filePath)] || "application/octet-stream",
      "cache-control": "no-store",
    });
    res.end(data);
  });
}

async function runQueuedTonApi(task) {
  const run = tonApiQueue.then(async () => {
    const wait = Math.max(0, tonApiMinDelay - (Date.now() - lastTonApiAt));
    if (wait) await sleep(wait);
    try {
      return await task();
    } finally {
      lastTonApiAt = Date.now();
    }
  });
  tonApiQueue = run.catch(() => {});
  return run;
}

async function tonApi(pathname, options = {}) {
  const headers = { accept: "application/json" };
  if (tonApiKey) headers.authorization = `Bearer ${tonApiKey}`;
  const request = async () => {
    let lastMessage = "";
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await fetch(`${tonApiBase}${pathname}`, { headers });
      const text = await response.text();
      let body = null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = { error: text || `TonAPI request failed (${response.status})` };
      }
      if (response.ok) return body;
      const message = body?.error || body?.message || `TonAPI request failed (${response.status})`;
      lastMessage = message;
      const limited = response.status === 429 || /rate limit/i.test(message);
      if (!limited || attempt === 3) throw new Error(message);
      await sleep(2500 + attempt * 2500);
    }
    throw new Error(lastMessage || "TonAPI request failed");
  };
  return options.immediate ? request() : runQueuedTonApi(request);
}

async function geckoFetch(pathname, timeoutMs = 5000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`https://api.coingecko.com/api/v3${pathname}`, {
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    const text = await response.text();
    const body = text ? JSON.parse(text) : null;
    if (!response.ok) {
      const message = body?.status?.error_message || body?.error || `CoinGecko request failed (${response.status})`;
      throw new Error(message);
    }
    return body;
  } finally {
    clearTimeout(timeout);
  }
}

async function tonCenter(pathname) {
  const response = await fetch(`https://toncenter.com/api/v3${pathname}`, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `TonCenter request failed (${response.status})`);
  }
  return response.json();
}

async function stonAssetMap() {
  if (stonAssetsCache) return stonAssetsCache;
  const map = new Map();
  try {
    const response = await fetch("https://api.ston.fi/v1/assets", { headers: { accept: "application/json" } });
    const payload = response.ok ? await response.json() : {};
    (payload?.asset_list || payload?.assets || []).forEach((asset) => {
      const address = asset.contract_address || asset.address || asset.jetton_address;
      if (!address) return;
      map.set(jettonAddressKey(address), {
        symbol: asset.symbol || "JET",
        name: asset.display_name || asset.name || asset.symbol || "Jetton",
        image: asset.image_url || asset.logo_url || asset.meta?.image,
        decimals: Number(asset.decimals || 9),
      });
    });
  } catch {}
  stonAssetsCache = map;
  return map;
}

function jettonAddressKey(address) {
  const raw = String(address || "").trim();
  if (!raw) return "";
  try {
    return Address.parse(raw).toRawString().toLowerCase();
  } catch {
    return raw.toLowerCase();
  }
}

function tonAddressVariants(address) {
  const value = String(address || "").trim();
  if (!value) return [];
  const variants = [];
  const add = (item) => {
    if (item && !variants.includes(item)) variants.push(item);
  };
  try {
    const parsed = Address.parse(value);
    add(parsed.toString({ urlSafe: true, bounceable: true }));
    add(parsed.toString({ urlSafe: true, bounceable: false }));
    add(parsed.toRawString());
  } catch {
    add(value);
  }
  add(value);
  return variants.filter(Boolean);
}

async function geckoCoinList() {
  if (geckoCoinsList) return geckoCoinsList;
  if (!geckoCoinsListPromise) {
    geckoCoinsListPromise = geckoFetch("/coins/list?include_platform=true")
      .then((coins) => {
        geckoCoinsList = Array.isArray(coins) ? coins : [];
        return geckoCoinsList;
      })
      .catch((error) => {
        geckoCoinsListPromise = null;
        throw error;
      });
  }
  return geckoCoinsListPromise;
}

async function resolveGeckoId(jettonAddress) {
  const key = jettonAddressKey(jettonAddress);
  if (!key) return null;
  if (geckoIdCache.has(key)) return geckoIdCache.get(key);
  if (KNOWN_JETTON_IDS[key]) {
    geckoIdCache.set(key, KNOWN_JETTON_IDS[key]);
    return KNOWN_JETTON_IDS[key];
  }
  try {
    const coins = await geckoCoinList();
    const match = coins.find((coin) => jettonAddressKey(coin?.platforms?.["the-open-network"]) === key);
    const id = match?.id || null;
    geckoIdCache.set(key, id);
    return id;
  } catch (error) {
    console.warn(`CoinGecko id lookup failed for ${jettonAddress}: ${error.message}`);
    geckoIdCache.set(key, null);
    return null;
  }
}

function nanoToTon(value) {
  return Number(value || 0) / 1_000_000_000;
}

function decimalAmount(value, decimals = 9) {
  const raw = String(value ?? "0").replace(/[^\d-]/g, "");
  const negative = raw.startsWith("-");
  const digits = negative ? raw.slice(1) : raw;
  const scale = Math.max(0, Number(decimals) || 0);
  if (!scale) return Number(raw || 0);
  const padded = digits.padStart(scale + 1, "0");
  const whole = padded.slice(0, -scale) || "0";
  const fraction = padded.slice(-scale).replace(/0+$/, "");
  return Number(`${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`);
}

async function externalJson(url, timeoutMs = 7000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { headers: { accept: "application/json" }, signal: controller.signal });
    const text = await response.text();
    const body = text ? JSON.parse(text) : null;
    if (!response.ok) throw new Error(body?.error || body?.message || `${url} failed (${response.status})`);
    return body;
  } finally {
    clearTimeout(timeout);
  }
}

async function externalText(url, timeoutMs = 7000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { headers: { accept: "text/html,application/json,*/*" }, signal: controller.signal });
    const text = await response.text();
    if (!response.ok) throw new Error(text || `${url} failed (${response.status})`);
    return text;
  } finally {
    clearTimeout(timeout);
  }
}

function marketHeaders(extra = {}) {
  return {
    accept: "application/json, text/plain, */*",
    "content-type": "application/json",
    origin: "https://cdn.tgmrkt.io",
    referer: "https://cdn.tgmrkt.io/",
    "user-agent": "Mozilla/5.0 TonTrack/1.0",
    ...extra,
  };
}

async function externalPostJson(url, body, timeoutMs = 7000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: marketHeaders({ origin: "https://xgift.tg", referer: "https://xgift.tg/" }),
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    const payload = text ? JSON.parse(text) : null;
    if (!response.ok || payload?.errors?.length) throw new Error(payload?.errors?.[0]?.message || `${url} failed (${response.status})`);
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

const getgemsGraphql = (query, variables = {}) => externalPostJson("https://api.getgems.io/graphql", { query, variables }, 8000);

async function xgiftJson(pathname, params = {}, timeoutMs = 7000) {
  const query = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    query.set(key, String(value));
  });
  const suffix = query.toString() ? `?${query.toString()}` : "";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`https://app-api.xgift.tg${pathname}${suffix}`, {
      headers: marketHeaders({
        origin: "https://xgift.tg",
        referer: "https://xgift.tg/",
      }),
      signal: controller.signal,
    });
    const text = await response.text();
    const payload = text ? JSON.parse(text) : null;
    if (!response.ok) throw new Error(payload?.error || payload?.message || `xgift ${pathname} failed (${response.status})`);
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

function xgiftBridge(command, payload = {}, timeoutMs = 7000) {
  const script = path.join(root, "xgift_bridge.py");
  if (!fs.existsSync(script)) return Promise.reject(new Error("xGift bridge missing"));
  return new Promise((resolve, reject) => {
    const child = execFile(
      process.env.PYTHON || "python",
      [script],
      {
        cwd: root,
        timeout: timeoutMs,
        maxBuffer: 1024 * 1024,
        env: {
          ...process.env,
          HTTP_PROXY: "",
          HTTPS_PROXY: "",
          ALL_PROXY: "",
          GIT_HTTP_PROXY: "",
          GIT_HTTPS_PROXY: "",
          http_proxy: "",
          https_proxy: "",
          all_proxy: "",
        },
      },
      (error, stdout, stderr) => {
        if (error) return reject(new Error(stderr || error.message));
        try {
          const text = String(stdout || "").trim();
          if (!text) return reject(new Error("Empty xGift bridge response"));
          const result = JSON.parse(text);
          if (stderr) result.__stderr = String(stderr);
          return resolve(result);
        } catch (parseError) {
          return reject(new Error(`Invalid xGift bridge response: ${parseError.message}`));
        }
      }
    );
    child.stdin.write(JSON.stringify({ command, ...payload }));
    child.stdin.end();
  });
}

function giftSnapshotKey(name) {
  return String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

let giftFloorSnapshotsCache = null;
let giftFloorSnapshotsCacheMtimeMs = 0;

function loadGiftFloorSnapshots() {
  try {
    const mtimeMs = fs.statSync(giftFloorSnapshotsFile).mtimeMs;
    if (giftFloorSnapshotsCache && giftFloorSnapshotsCacheMtimeMs === mtimeMs) return giftFloorSnapshotsCache;
    giftFloorSnapshotsCache = JSON.parse(fs.readFileSync(giftFloorSnapshotsFile, "utf8"));
    giftFloorSnapshotsCacheMtimeMs = mtimeMs;
    return giftFloorSnapshotsCache;
  } catch {
    return { version: 1, updatedAt: "", collections: {} };
  }
}

function saveGiftFloorSnapshots(store) {
  fs.mkdirSync(dataDir, { recursive: true });
  store.updatedAt = new Date().toISOString();
  fs.writeFileSync(giftFloorSnapshotsFile, JSON.stringify(store, null, 2));
  giftFloorSnapshotsCache = store;
  giftFloorSnapshotsCacheMtimeMs = fs.statSync(giftFloorSnapshotsFile).mtimeMs;
}

function giftSnapshotRecord(name, floor = {}) {
  const floorTon = Number(floor.floorTon || 0);
  const floorUsd = Number(floor.floorUsd || 0);
  if (!(floorTon > 0 || floorUsd > 0)) return null;
  const key = giftSnapshotKey(floor.canonicalName || name);
  if (!key) return null;
  return {
    key,
    name: floor.canonicalName || name,
    timestamp: new Date().toISOString(),
    floorTon,
    floorUsd,
    tonUsdRate: Number(floor.tonUsdRate || (floorTon > 0 ? floorUsd / floorTon : 0) || 0),
    source: floor.source || floor.marketPlatform || "xgift",
    giftId: floor.giftId || "",
    listedCount: Number(floor.listedCount || 0),
    totalSupply: Number(floor.totalSupply || 0),
    opened: Number(floor.opened || 0),
    onchain: Number(floor.onchain || 0),
    holders: Number(floor.holders || 0),
    volume24hTon: Number(floor.volume24hTon || 0),
    volume24hUsd: Number(floor.volume24hUsd || 0),
    sales24h: Number(floor.sales24h || 0),
    sales30d: Number(floor.sales30d || 0),
    change24hPct: Number(floor.change24hPct || 0),
    periodChangePct: Number(floor.periodChangePct || 0),
    athFloorUsd: Number(floor.athFloorUsd || 0),
    marketUpdatedAt: floor.marketUpdatedAt || "",
    recentSales: Array.isArray(floor.recentSales) ? floor.recentSales.slice(0, 30) : [],
  };
}

function giftSnapshotPgSsl() {
  const url = String(process.env.DATABASE_URL || "");
  return url && !/localhost|127\.0\.0\.1/i.test(url) ? { rejectUnauthorized: false } : false;
}

async function giftSnapshotPool() {
  if (!process.env.DATABASE_URL) return null;
  if (giftSnapshotPgPool) return giftSnapshotPgPool;
  try {
    const { Pool } = require("pg");
    giftSnapshotPgPool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: giftSnapshotPgSsl() });
    return giftSnapshotPgPool;
  } catch (error) {
    if (!giftSnapshotPgUnavailableLogged) {
      console.warn(`Postgres snapshot storage unavailable; using local JSON: ${error.message}`);
      giftSnapshotPgUnavailableLogged = true;
    }
    return null;
  }
}

async function ensureGiftSnapshotTables() {
  const pool = await giftSnapshotPool();
  if (!pool) return null;
  if (!giftSnapshotPgInitPromise) {
    giftSnapshotPgInitPromise = pool.query(`
      CREATE TABLE IF NOT EXISTS gift_floor_collections (
        collection_key TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        gift_id TEXT,
        recent_sales JSONB DEFAULT '[]'::jsonb,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS gift_floor_snapshots (
        id BIGSERIAL PRIMARY KEY,
        collection_key TEXT NOT NULL REFERENCES gift_floor_collections(collection_key) ON DELETE CASCADE,
        sampled_at TIMESTAMPTZ NOT NULL,
        floor_ton NUMERIC(24,9),
        floor_usd NUMERIC(24,6),
        ton_usd_rate NUMERIC(18,8),
        source TEXT,
        listed_count INT,
        total_supply INT,
        opened INT,
        onchain INT,
        holders INT,
        volume_24h_ton NUMERIC(24,9),
        volume_24h_usd NUMERIC(24,6),
        sales_24h INT,
        sales_30d INT,
        change_24h_pct NUMERIC(12,4),
        period_change_pct NUMERIC(12,4),
        ath_floor_usd NUMERIC(24,6),
        market_updated_at TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS gift_floor_snapshots_collection_time_idx
        ON gift_floor_snapshots(collection_key, sampled_at DESC);
      CREATE TABLE IF NOT EXISTS gift_model_floor_snapshots (
        id BIGSERIAL PRIMARY KEY,
        collection_key TEXT NOT NULL REFERENCES gift_floor_collections(collection_key) ON DELETE CASCADE,
        model_key TEXT NOT NULL,
        model_name TEXT NOT NULL,
        sampled_at TIMESTAMPTZ NOT NULL,
        floor_ton NUMERIC(24,9),
        floor_usd NUMERIC(24,6),
        ton_usd_rate NUMERIC(18,8),
        source TEXT,
        listed_count INT,
        deals_30d INT,
        avg_30d_ton NUMERIC(24,9),
        avg_30d_usd NUMERIC(24,6),
        model_count INT,
        rarity NUMERIC(12,4),
        market_updated_at TEXT,
        icon_url TEXT,
        animation_url TEXT,
        media_type TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS gift_model_floor_snapshots_collection_model_time_idx
        ON gift_model_floor_snapshots(collection_key, model_key, sampled_at DESC);
      CREATE TABLE IF NOT EXISTS gift_combo_floor_snapshots (
        id BIGSERIAL PRIMARY KEY,
        collection_key TEXT NOT NULL REFERENCES gift_floor_collections(collection_key) ON DELETE CASCADE,
        model_key TEXT NOT NULL,
        model_name TEXT NOT NULL,
        backdrop_key TEXT NOT NULL,
        backdrop_name TEXT NOT NULL,
        sampled_at TIMESTAMPTZ NOT NULL,
        floor_ton NUMERIC(24,9),
        floor_usd NUMERIC(24,6),
        ton_usd_rate NUMERIC(18,8),
        source TEXT,
        listed_count INT,
        market_updated_at TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS gift_combo_floor_snapshots_lookup_idx
        ON gift_combo_floor_snapshots(collection_key, model_key, backdrop_key, sampled_at DESC);
      CREATE TABLE IF NOT EXISTS gift_attribute_registry (
        collection_key TEXT NOT NULL REFERENCES gift_floor_collections(collection_key) ON DELETE CASCADE,
        trait_type TEXT NOT NULL,
        value_key TEXT NOT NULL,
        value_name TEXT NOT NULL,
        rarity NUMERIC(12,4),
        item_count INT,
        floor_ton NUMERIC(24,9),
        metrics JSONB DEFAULT '{}'::jsonb,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (collection_key, trait_type, value_key)
      );
      CREATE INDEX IF NOT EXISTS gift_attribute_registry_collection_type_idx
        ON gift_attribute_registry(collection_key, trait_type);
      ALTER TABLE gift_model_floor_snapshots ADD COLUMN IF NOT EXISTS icon_url TEXT;
      ALTER TABLE gift_model_floor_snapshots ADD COLUMN IF NOT EXISTS animation_url TEXT;
      ALTER TABLE gift_model_floor_snapshots ADD COLUMN IF NOT EXISTS media_type TEXT;
    `).then(() => pool);
  }
  return giftSnapshotPgInitPromise;
}

function snapshotNumber(value) {
  const numberValue = Number(value || 0);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function snapshotNumbersMatch(a, b, tolerance = 0.000001) {
  return Math.abs(snapshotNumber(a) - snapshotNumber(b)) <= tolerance;
}

function collectionSnapshotUnchanged(row = {}, record = {}) {
  return snapshotNumbersMatch(row.floor_ton, record.floorTon)
    && snapshotNumbersMatch(row.listed_count, record.listedCount, 0)
    && snapshotNumbersMatch(row.total_supply, record.totalSupply, 0)
    && snapshotNumbersMatch(row.volume_24h_ton, record.volume24hTon)
    && snapshotNumbersMatch(row.sales_24h, record.sales24h, 0);
}

function modelSnapshotUnchanged(row = {}, record = {}) {
  return snapshotNumbersMatch(row.floor_ton, record.floorTon)
    && snapshotNumbersMatch(row.listed_count, record.listedCount, 0)
    && snapshotNumbersMatch(row.deals_30d, record.deals30d, 0)
    && snapshotNumbersMatch(row.avg_30d_ton, record.avg30dTon)
    && snapshotNumbersMatch(row.model_count, record.modelCount, 0);
}

function giftComboKey(modelName = "", backdropName = "") {
  return `${giftSnapshotKey(modelName)}:${giftSnapshotKey(backdropName)}`;
}

async function appendGiftComboFloorSnapshot(record = {}) {
  if (!record.collectionKey || !record.modelKey || !record.backdropKey || !(record.floorTon > 0)) return null;
  const pool = await ensureGiftSnapshotTables();
  if (pool) {
    await pool.query(
      `INSERT INTO gift_floor_collections (collection_key, name, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (collection_key) DO UPDATE SET name = EXCLUDED.name, updated_at = now()`,
      [record.collectionKey, record.collectionName]
    );
    const latest = await pool.query(
      `SELECT id, sampled_at, floor_ton, listed_count
       FROM gift_combo_floor_snapshots
       WHERE collection_key = $1 AND model_key = $2 AND backdrop_key = $3
       ORDER BY sampled_at DESC LIMIT 1`,
      [record.collectionKey, record.modelKey, record.backdropKey]
    );
    const latestTime = latest.rows[0]?.sampled_at ? new Date(latest.rows[0].sampled_at).getTime() : 0;
    if (
      latest.rows[0]?.id
      && Date.now() - latestTime < giftSnapshotUnchangedIntervalMs
      && snapshotNumbersMatch(latest.rows[0].floor_ton, record.floorTon)
      && snapshotNumbersMatch(latest.rows[0].listed_count, record.listedCount, 0)
    ) return record;
    const values = [
      record.collectionKey, record.modelKey, record.modelName, record.backdropKey, record.backdropName,
      record.timestamp, record.floorTon, record.floorUsd, record.tonUsdRate, record.source,
      record.listedCount, record.marketUpdatedAt,
    ];
    if (latest.rows[0]?.id && Date.now() - latestTime < 20 * 60 * 1000) {
      await pool.query(
        `UPDATE gift_combo_floor_snapshots SET
          collection_key=$1, model_key=$2, model_name=$3, backdrop_key=$4, backdrop_name=$5,
          sampled_at=$6, floor_ton=$7, floor_usd=$8, ton_usd_rate=$9, source=$10,
          listed_count=$11, market_updated_at=$12
         WHERE id=${Number(latest.rows[0].id)}`,
        values
      );
    } else {
      await pool.query(
        `INSERT INTO gift_combo_floor_snapshots (
          collection_key, model_key, model_name, backdrop_key, backdrop_name, sampled_at,
          floor_ton, floor_usd, ton_usd_rate, source, listed_count, market_updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        values
      );
    }
    return record;
  }
  const store = loadGiftFloorSnapshots();
  const collection = store.collections[record.collectionKey] || {
    key: record.collectionKey,
    name: record.collectionName,
    snapshots: [],
    recentSales: [],
  };
  collection.combinations = collection.combinations || {};
  const key = giftComboKey(record.modelName, record.backdropName);
  const combo = collection.combinations[key] || {
    model: record.modelName,
    backdrop: record.backdropName,
    snapshots: [],
  };
  const snapshot = {
    timestamp: record.timestamp,
    floorTon: record.floorTon,
    floorUsd: record.floorUsd,
    tonUsdRate: record.tonUsdRate,
    source: record.source,
    listedCount: record.listedCount,
    marketUpdatedAt: record.marketUpdatedAt,
  };
  const last = combo.snapshots[combo.snapshots.length - 1];
  if (last && Date.now() - new Date(last.timestamp).getTime() < 20 * 60 * 1000) combo.snapshots[combo.snapshots.length - 1] = snapshot;
  else combo.snapshots.push(snapshot);
  combo.snapshots = combo.snapshots.slice(-1500);
  collection.combinations[key] = combo;
  store.collections[record.collectionKey] = collection;
  saveGiftFloorSnapshots(store);
  return record;
}

async function latestGiftComboFloor(collectionName = "", modelName = "", backdropName = "") {
  const collectionKey = giftSnapshotKey(collectionName);
  const modelKey = giftSnapshotKey(modelName);
  const backdropKey = giftSnapshotKey(backdropName);
  if (!collectionKey || !modelKey || !backdropKey) return null;
  const pool = await ensureGiftSnapshotTables();
  if (pool) {
    const result = await pool.query(
      `SELECT sampled_at AS timestamp, floor_ton AS "floorTon", floor_usd AS "floorUsd",
        ton_usd_rate AS "tonUsdRate", source, listed_count AS "listedCount",
        market_updated_at AS "marketUpdatedAt"
       FROM gift_combo_floor_snapshots
       WHERE collection_key=$1 AND model_key=$2 AND backdrop_key=$3
       ORDER BY sampled_at DESC LIMIT 1`,
      [collectionKey, modelKey, backdropKey]
    );
    return result.rows[0] || null;
  }
  const combo = loadGiftFloorSnapshots().collections?.[collectionKey]?.combinations?.[giftComboKey(modelName, backdropName)];
  return combo?.snapshots?.[combo.snapshots.length - 1] || null;
}

async function appendGiftFloorSnapshotDb(record) {
  const pool = await ensureGiftSnapshotTables();
  if (!pool) return false;
  await pool.query(
    `INSERT INTO gift_floor_collections (collection_key, name, gift_id, recent_sales, updated_at)
     VALUES ($1, $2, $3, $4::jsonb, now())
     ON CONFLICT (collection_key) DO UPDATE SET
       name = EXCLUDED.name,
       gift_id = COALESCE(NULLIF(EXCLUDED.gift_id, ''), gift_floor_collections.gift_id),
       recent_sales = CASE WHEN EXCLUDED.recent_sales = '[]'::jsonb THEN gift_floor_collections.recent_sales ELSE EXCLUDED.recent_sales END,
       updated_at = now()`,
    [record.key, record.name, record.giftId || "", JSON.stringify(record.recentSales || [])]
  );
  const latest = await pool.query(
    `SELECT id, sampled_at, floor_ton, floor_usd, listed_count, total_supply, volume_24h_ton, sales_24h
     FROM gift_floor_snapshots WHERE collection_key = $1 ORDER BY sampled_at DESC LIMIT 1`,
    [record.key]
  );
  const values = [
    record.key,
    record.timestamp,
    record.floorTon,
    record.floorUsd,
    record.tonUsdRate,
    record.source,
    record.listedCount,
    record.totalSupply,
    record.opened,
    record.onchain,
    record.holders,
    record.volume24hTon,
    record.volume24hUsd,
    record.sales24h,
    record.sales30d,
    record.change24hPct,
    record.periodChangePct,
    record.athFloorUsd,
    record.marketUpdatedAt,
  ];
  const latestTime = latest.rows[0]?.sampled_at ? new Date(latest.rows[0].sampled_at).getTime() : 0;
  if (
    latest.rows[0]?.id
    && Date.now() - latestTime < giftSnapshotUnchangedIntervalMs
    && collectionSnapshotUnchanged(latest.rows[0], record)
  ) {
    return true;
  }
  if (latest.rows[0]?.id && Date.now() - latestTime < 20 * 60 * 1000) {
    await pool.query(
      `UPDATE gift_floor_snapshots SET
        collection_key = $1, sampled_at = $2, floor_ton = $3, floor_usd = $4, ton_usd_rate = $5, source = $6,
        listed_count = $7, total_supply = $8, opened = $9, onchain = $10, holders = $11,
        volume_24h_ton = $12, volume_24h_usd = $13, sales_24h = $14, sales_30d = $15,
        change_24h_pct = $16, period_change_pct = $17, ath_floor_usd = $18, market_updated_at = $19
       WHERE id = ${Number(latest.rows[0].id)}`,
      values
    );
  } else {
    await pool.query(
      `INSERT INTO gift_floor_snapshots (
        collection_key, sampled_at, floor_ton, floor_usd, ton_usd_rate, source,
        listed_count, total_supply, opened, onchain, holders, volume_24h_ton, volume_24h_usd,
        sales_24h, sales_30d, change_24h_pct, period_change_pct, ath_floor_usd, market_updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
      values
    );
  }
  return true;
}

function appendGiftFloorSnapshotJson(record) {
  const store = loadGiftFloorSnapshots();
  const collection = store.collections[record.key] || {
    key: record.key,
    name: record.name,
    giftId: "",
    snapshots: [],
    recentSales: [],
  };
  const snapshot = { ...record };
  delete snapshot.key;
  delete snapshot.name;
  delete snapshot.recentSales;
  const last = collection.snapshots[collection.snapshots.length - 1];
  if (last && Date.now() - new Date(last.timestamp).getTime() < 20 * 60 * 1000) {
    collection.snapshots[collection.snapshots.length - 1] = snapshot;
  } else {
    collection.snapshots.push(snapshot);
  }
  collection.name = record.name || collection.name;
  collection.giftId = record.giftId || collection.giftId || "";
  collection.recentSales = record.recentSales?.length ? record.recentSales : collection.recentSales;
  collection.snapshots = collection.snapshots.slice(-1500);
  store.collections[record.key] = collection;
  saveGiftFloorSnapshots(store);
  return snapshot;
}

async function appendGiftFloorSnapshot(name, floor = {}) {
  const record = giftSnapshotRecord(name, floor);
  if (!record) return null;
  if (await appendGiftFloorSnapshotDb(record)) return record;
  return appendGiftFloorSnapshotJson(record);
}

function giftModelSnapshotRecords(name, payload = {}) {
  const collectionKey = giftSnapshotKey(payload.canonicalName || name);
  if (!collectionKey || !Array.isArray(payload.models)) return [];
  return payload.models
    .map((model) => {
      const modelName = String(model.model || "").trim();
      const modelKey = giftSnapshotKey(modelName);
      const floorTon = Number(model.floorTon || 0);
      const floorUsd = Number(model.floorUsd || 0);
      if (!modelName || !modelKey || !(floorTon > 0 || floorUsd > 0)) return null;
      return {
        collectionKey,
        collectionName: payload.canonicalName || name,
        giftId: payload.giftId || "",
        modelKey,
        modelName,
        timestamp: new Date().toISOString(),
        floorTon,
        floorUsd,
        tonUsdRate: Number(model.tonUsdRate || payload.tonUsdRate || (floorTon > 0 ? floorUsd / floorTon : 0) || 0),
        source: payload.source || payload.marketPlatform || "xgift",
        listedCount: Number(model.listedCount || 0),
        deals30d: Number(model.deals30d || 0),
        avg30dTon: Number(model.avg30dTon || 0),
        avg30dUsd: Number(model.avg30dUsd || 0),
        modelCount: Number(model.modelCount || 0),
        rarity: Number(model.rarity || 0),
        marketUpdatedAt: model.marketUpdatedAt || "",
        iconUrl: model.iconUrl || "",
        animationUrl: model.animationUrl || "",
        mediaType: model.mediaType || mediaKind(model.animationUrl || model.iconUrl || ""),
      };
    })
    .filter(Boolean);
}

async function appendGiftModelFloorSnapshotsDb(records = []) {
  if (!records.length) return false;
  const pool = await ensureGiftSnapshotTables();
  if (!pool) return false;
  for (const record of records) {
    await pool.query(
      `INSERT INTO gift_floor_collections (collection_key, name, gift_id, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (collection_key) DO UPDATE SET
         name = EXCLUDED.name,
         gift_id = COALESCE(NULLIF(EXCLUDED.gift_id, ''), gift_floor_collections.gift_id),
         updated_at = now()`,
      [record.collectionKey, record.collectionName, record.giftId || ""]
    );
    const latest = await pool.query(
      `SELECT id, sampled_at, floor_ton, floor_usd, listed_count, deals_30d, avg_30d_ton, model_count
       FROM gift_model_floor_snapshots
       WHERE collection_key = $1 AND model_key = $2
       ORDER BY sampled_at DESC LIMIT 1`,
      [record.collectionKey, record.modelKey]
    );
    const values = [
      record.collectionKey,
      record.modelKey,
      record.modelName,
      record.timestamp,
      record.floorTon,
      record.floorUsd,
      record.tonUsdRate,
      record.source,
      record.listedCount,
      record.deals30d,
      record.avg30dTon,
      record.avg30dUsd,
      record.modelCount,
      record.rarity,
      record.marketUpdatedAt,
      record.iconUrl,
      record.animationUrl,
      record.mediaType,
    ];
    const latestTime = latest.rows[0]?.sampled_at ? new Date(latest.rows[0].sampled_at).getTime() : 0;
    if (
      latest.rows[0]?.id
      && Date.now() - latestTime < giftSnapshotUnchangedIntervalMs
      && modelSnapshotUnchanged(latest.rows[0], record)
    ) {
      continue;
    }
    if (latest.rows[0]?.id && Date.now() - latestTime < 20 * 60 * 1000) {
      await pool.query(
        `UPDATE gift_model_floor_snapshots SET
          collection_key = $1, model_key = $2, model_name = $3, sampled_at = $4, floor_ton = $5, floor_usd = $6, ton_usd_rate = $7,
          source = $8, listed_count = $9, deals_30d = $10, avg_30d_ton = $11, avg_30d_usd = $12,
          model_count = $13, rarity = $14, market_updated_at = $15, icon_url = $16, animation_url = $17, media_type = $18
         WHERE id = ${Number(latest.rows[0].id)}`,
        values
      );
    } else {
      await pool.query(
        `INSERT INTO gift_model_floor_snapshots (
          collection_key, model_key, model_name, sampled_at, floor_ton, floor_usd, ton_usd_rate, source,
          listed_count, deals_30d, avg_30d_ton, avg_30d_usd, model_count, rarity, market_updated_at, icon_url, animation_url, media_type
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
        values
      );
    }
  }
  return true;
}

function appendGiftModelFloorSnapshotsJson(records = []) {
  if (!records.length) return [];
  const store = loadGiftFloorSnapshots();
  records.forEach((record) => {
    const collection = store.collections[record.collectionKey] || {
      key: record.collectionKey,
      name: record.collectionName,
      giftId: record.giftId || "",
      snapshots: [],
      recentSales: [],
    };
    collection.name = record.collectionName || collection.name;
    collection.giftId = record.giftId || collection.giftId || "";
    collection.models = collection.models || {};
    const model = collection.models[record.modelKey] || {
      key: record.modelKey,
      name: record.modelName,
      snapshots: [],
    };
    const snapshot = { ...record };
    delete snapshot.collectionKey;
    delete snapshot.collectionName;
    delete snapshot.giftId;
    delete snapshot.modelKey;
    delete snapshot.modelName;
    const last = model.snapshots[model.snapshots.length - 1];
    if (last && Date.now() - new Date(last.timestamp).getTime() < 20 * 60 * 1000) {
      model.snapshots[model.snapshots.length - 1] = snapshot;
    } else {
      model.snapshots.push(snapshot);
    }
    model.name = record.modelName;
    model.iconUrl = record.iconUrl || model.iconUrl || "";
    model.animationUrl = record.animationUrl || model.animationUrl || "";
    model.mediaType = record.mediaType || model.mediaType || "";
    model.snapshots = model.snapshots.slice(-1500);
    collection.models[record.modelKey] = model;
    store.collections[record.collectionKey] = collection;
  });
  saveGiftFloorSnapshots(store);
  return records;
}

async function appendGiftModelFloorSnapshots(name, payload = {}) {
  const records = giftModelSnapshotRecords(name, payload);
  if (!records.length) return [];
  if (await appendGiftModelFloorSnapshotsDb(records)) return records;
  return appendGiftModelFloorSnapshotsJson(records);
}

function giftAttributeRarity(item = {}) {
  const perMille = Number(item.rarity_per_mille ?? item.rarityPerMille);
  if (Number.isFinite(perMille) && perMille > 0) return perMille / 10;
  const percent = Number(item.rarity_percent ?? item.rarityPercent ?? item.rarity);
  return Number.isFinite(percent) && percent > 0 ? percent : 0;
}

function giftAttributeRecords(collectionName = "", attributesPayload = {}) {
  const bucket = thermosGiftAttributeBucket(attributesPayload, collectionName);
  const groups = [
    ["Model", bucket.data?.models],
    ["Backdrop", bucket.data?.backdrops],
    ["Symbol", bucket.data?.symbols || bucket.data?.patterns],
  ];
  return groups.flatMap(([traitType, items]) => (Array.isArray(items) ? items : []).map((item) => {
    const valueName = String(item?.name || item?.value || item?.title || "").trim();
    if (!valueName) return null;
    return {
      collectionKey: giftSnapshotKey(bucket.name || collectionName),
      collectionName: bucket.name || collectionName,
      traitType,
      valueKey: giftSnapshotKey(valueName),
      valueName,
      rarity: giftAttributeRarity(item),
      itemCount: Number(item?.stats?.count ?? item?.count ?? item?.total ?? 0),
      floorTon: nanoTon(item?.stats?.floor ?? item?.floor ?? 0),
      metrics: item,
      updatedAt: new Date().toISOString(),
    };
  }).filter(Boolean));
}

async function appendGiftAttributesDb(records = []) {
  if (!records.length) return false;
  const pool = await ensureGiftSnapshotTables();
  if (!pool) return false;
  const collection = records[0];
  await pool.query(
    `INSERT INTO gift_floor_collections (collection_key, name, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (collection_key) DO UPDATE SET name = EXCLUDED.name, updated_at = now()`,
    [collection.collectionKey, collection.collectionName]
  );
  for (const record of records) {
    await pool.query(
      `INSERT INTO gift_attribute_registry (
        collection_key, trait_type, value_key, value_name, rarity, item_count, floor_ton, metrics, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)
      ON CONFLICT (collection_key, trait_type, value_key) DO UPDATE SET
        value_name = EXCLUDED.value_name,
        rarity = EXCLUDED.rarity,
        item_count = EXCLUDED.item_count,
        floor_ton = EXCLUDED.floor_ton,
        metrics = EXCLUDED.metrics,
        updated_at = EXCLUDED.updated_at`,
      [
        record.collectionKey,
        record.traitType,
        record.valueKey,
        record.valueName,
        record.rarity,
        record.itemCount,
        record.floorTon,
        JSON.stringify(record.metrics || {}),
        record.updatedAt,
      ]
    );
  }
  return true;
}

function appendGiftAttributesJson(records = []) {
  if (!records.length) return [];
  const store = loadGiftFloorSnapshots();
  records.forEach((record) => {
    const collection = store.collections[record.collectionKey] || {
      key: record.collectionKey,
      name: record.collectionName,
      giftId: "",
      snapshots: [],
      recentSales: [],
    };
    collection.name = record.collectionName || collection.name;
    collection.attributes = collection.attributes || {};
    const traitKey = record.traitType.toLowerCase();
    collection.attributes[traitKey] = collection.attributes[traitKey] || {};
    collection.attributes[traitKey][record.valueKey] = {
      name: record.valueName,
      rarity: record.rarity,
      itemCount: record.itemCount,
      floorTon: record.floorTon,
      metrics: record.metrics || {},
      updatedAt: record.updatedAt,
    };
    store.collections[record.collectionKey] = collection;
  });
  saveGiftFloorSnapshots(store);
  return records;
}

async function appendGiftAttributes(collectionName = "", attributesPayload = {}) {
  const records = giftAttributeRecords(collectionName, attributesPayload);
  if (!records.length) return [];
  if (await appendGiftAttributesDb(records)) return records;
  return appendGiftAttributesJson(records);
}

async function pruneGiftSnapshotStorage() {
  const retentionDays = Math.max(0, Math.floor(giftSnapshotRetentionDays));
  if (!retentionDays) return;
  const pool = await ensureGiftSnapshotTables();
  if (!pool) return;
  try {
    await pool.query(
      `DELETE FROM gift_model_floor_snapshots
       WHERE sampled_at < now() - ($1::int * interval '1 day')`,
      [retentionDays]
    );
    await pool.query(
      `DELETE FROM gift_floor_snapshots
       WHERE sampled_at < now() - ($1::int * interval '1 day')`,
      [retentionDays]
    );
  } catch (error) {
    console.warn("[gift-snapshot] retention prune failed", error.message);
  }
}

function latestGiftModelFloorsJson(collection = "") {
  const store = loadGiftFloorSnapshots();
  const key = giftSnapshotKey(collection);
  const item = store.collections[key];
  const models = item?.models || {};
  return Object.keys(models).map((modelKey) => {
    const model = models[modelKey] || {};
    const snapshot = (model.snapshots || [])[model.snapshots.length - 1] || {};
    const rawIcon = snapshot.iconUrl || model.iconUrl || "";
    const rawAnimation = snapshot.animationUrl || model.animationUrl || "";
    const legacyAnimation = !rawAnimation && /\.(?:lottie\.)?json(?:[?#].*)?$/i.test(String(rawIcon)) ? rawIcon : "";
    const iconUrl = legacyAnimation ? "" : rawIcon;
    const animationUrl = rawAnimation || legacyAnimation || "";
    return {
      model: model.name || snapshot.modelName || modelKey,
      modelKey,
      floorTon: Number(snapshot.floorTon || 0),
      floorUsd: Number(snapshot.floorUsd || 0),
      tonUsdRate: Number(snapshot.tonUsdRate || 0),
      listedCount: Number(snapshot.listedCount || 0),
      deals30d: Number(snapshot.deals30d || 0),
      avg30dTon: Number(snapshot.avg30dTon || 0),
      avg30dUsd: Number(snapshot.avg30dUsd || 0),
      modelCount: Number(snapshot.modelCount || 0),
      rarity: Number(snapshot.rarity || 0),
      marketUpdatedAt: snapshot.marketUpdatedAt || "",
      iconUrl,
      animationUrl,
      mediaType: snapshot.mediaType || model.mediaType || mediaKind(animationUrl || iconUrl || ""),
      source: snapshot.source || "xgift",
    };
  }).filter((model) => model.floorTon > 0 || model.floorUsd > 0);
}

async function latestGiftModelFloorsDb(collection = "") {
  const pool = await ensureGiftSnapshotTables();
  if (!pool) return null;
  const key = giftSnapshotKey(collection);
  if (!key) return [];
  const result = await pool.query(
    `SELECT DISTINCT ON (model_key)
      model_key AS "modelKey", model_name AS model, floor_ton AS "floorTon", floor_usd AS "floorUsd",
      ton_usd_rate AS "tonUsdRate", source, listed_count AS "listedCount", deals_30d AS "deals30d",
      avg_30d_ton AS "avg30dTon", avg_30d_usd AS "avg30dUsd", model_count AS "modelCount",
      rarity, market_updated_at AS "marketUpdatedAt", icon_url AS "iconUrl", animation_url AS "animationUrl", media_type AS "mediaType"
     FROM gift_model_floor_snapshots
     WHERE collection_key = $1
     ORDER BY model_key, sampled_at DESC`,
    [key]
  );
  return result.rows.map((row) => ({
    ...row,
    iconUrl: (!row.animationUrl && /\.(?:lottie\.)?json(?:[?#].*)?$/i.test(String(row.iconUrl || ""))) ? "" : (row.iconUrl || ""),
    animationUrl: row.animationUrl || (/\.(?:lottie\.)?json(?:[?#].*)?$/i.test(String(row.iconUrl || "")) ? row.iconUrl : ""),
    mediaType: row.mediaType || mediaKind((row.animationUrl || row.iconUrl || "")),
    floorTon: Number(row.floorTon || 0),
    floorUsd: Number(row.floorUsd || 0),
    tonUsdRate: Number(row.tonUsdRate || 0),
    listedCount: Number(row.listedCount || 0),
    deals30d: Number(row.deals30d || 0),
    avg30dTon: Number(row.avg30dTon || 0),
    avg30dUsd: Number(row.avg30dUsd || 0),
    modelCount: Number(row.modelCount || 0),
    rarity: Number(row.rarity || 0),
  }));
}

function requestedGiftModelPairs(pairs = []) {
  return (Array.isArray(pairs) ? pairs : [])
    .slice(0, 5000)
    .map((pair) => ({
      collection: String(pair?.collection || "").trim(),
      model: String(pair?.model || "").trim(),
      backdrop: String(pair?.backdrop || "").trim(),
      symbol: String(pair?.symbol || "").trim(),
    }))
    .filter((pair) => pair.collection && pair.model)
    .map((pair) => ({
      ...pair,
      collectionKey: giftSnapshotKey(pair.collection),
      collectionKeys: giftCollectionAliasKeys(pair.collection),
      modelKey: giftSnapshotKey(pair.model),
      backdropKey: giftSnapshotKey(pair.backdrop),
      symbolKey: giftSnapshotKey(pair.symbol),
    }))
    .filter((pair) => pair.collectionKey && pair.modelKey);
}

function singularGiftWord(word = "") {
  if (word.length < 4 || word.endsWith("ss")) return word;
  if (word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.endsWith("boxes")) return `${word.slice(0, -5)}box`;
  if (/(?:ches|shes)$/.test(word)) return word.slice(0, -2);
  if (word.endsWith("s")) return word.slice(0, -1);
  return word;
}

function giftCollectionAliasKeys(name = "") {
  const words = String(name || "").toLowerCase().match(/[a-z0-9]+/g) || [];
  const keys = new Set([giftSnapshotKey(name)]);
  words.forEach((word, index) => {
    if (word.length >= 4 && word.endsWith("s") && !word.endsWith("ss")) {
      const trailingSVariant = [...words];
      trailingSVariant[index] = word.slice(0, -1);
      keys.add(giftSnapshotKey(trailingSVariant.join(" ")));
    }
    const singular = singularGiftWord(word);
    if (singular === word) return;
    const variant = [...words];
    variant[index] = singular;
    keys.add(giftSnapshotKey(variant.join(" ")));
  });
  keys.add(giftSnapshotKey(words.map((word) => (
    word.length >= 4 && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word
  )).join(" ")));
  const allSingular = words.map(singularGiftWord);
  keys.add(giftSnapshotKey(allSingular.join(" ")));
  return [...keys].filter(Boolean);
}

function giftWordVariants(word = "") {
  const variants = new Set([word]);
  if (word.length < 4 || word.endsWith("ss")) return [...variants];
  if (word.endsWith("ies")) variants.add(`${word.slice(0, -3)}y`);
  if (word.endsWith("boxes")) variants.add(`${word.slice(0, -5)}box`);
  if (/(?:ches|shes)$/.test(word)) variants.add(word.slice(0, -2));
  if (word.endsWith("s")) variants.add(word.slice(0, -1));
  return [...variants].filter(Boolean);
}

function giftCollectionSignatureKeys(name = "") {
  const words = String(name || "").toLowerCase().match(/[a-z0-9]+/g) || [];
  if (!words.length) return [];
  let combinations = [""];
  words.forEach((word) => {
    combinations = combinations.flatMap((prefix) => giftWordVariants(word).map((variant) => `${prefix}${variant}`));
  });
  return [...new Set(combinations.map(giftSnapshotKey).filter(Boolean))];
}

async function resolveStoredGiftCollectionKeys(requested = [], pool = null) {
  const rows = pool
    ? (await pool.query("SELECT collection_key AS key, name FROM gift_floor_collections")).rows
    : Object.entries(loadGiftFloorSnapshots().collections || {}).map(([key, item]) => ({ key, name: item?.name || key }));
  const signatureIndex = new Map();
  rows.forEach((row) => {
    giftCollectionSignatureKeys(row.name || row.key).forEach((signature) => {
      const matches = signatureIndex.get(signature) || new Set();
      matches.add(row.key);
      signatureIndex.set(signature, matches);
    });
  });
  requested.forEach((pair) => {
    const matches = new Set();
    giftCollectionSignatureKeys(pair.collection).forEach((signature) => {
      (signatureIndex.get(signature) || []).forEach((key) => matches.add(key));
    });
    if (matches.size === 1) pair.collectionKeys = [...new Set([...pair.collectionKeys, ...matches])];
  });
  return requested;
}

function normalizeStoredGiftModel(row = {}) {
  const iconUrl = (!row.animationUrl && /\.(?:lottie\.)?json(?:[?#].*)?$/i.test(String(row.iconUrl || ""))) ? "" : (row.iconUrl || "");
  const animationUrl = row.animationUrl || (/\.(?:lottie\.)?json(?:[?#].*)?$/i.test(String(row.iconUrl || "")) ? row.iconUrl : "");
  return {
    model: row.model || row.modelName || "",
    modelKey: row.modelKey || giftSnapshotKey(row.model || row.modelName || ""),
    floorTon: Number(row.floorTon || 0),
    floorUsd: Number(row.floorUsd || 0),
    tonUsdRate: Number(row.tonUsdRate || 0),
    listedCount: Number(row.listedCount || 0),
    deals30d: Number(row.deals30d || 0),
    avg30dTon: Number(row.avg30dTon || 0),
    avg30dUsd: Number(row.avg30dUsd || 0),
    modelCount: Number(row.modelCount || 0),
    rarity: Number(row.rarity || 0),
    marketUpdatedAt: row.marketUpdatedAt || "",
    iconUrl,
    animationUrl,
    mediaType: row.mediaType || mediaKind(animationUrl || iconUrl || ""),
    source: row.source || "thermos-model",
  };
}

function normalizeStoredGiftAttribute(row = {}) {
  return {
    type: row.traitType || row.trait_type || "",
    value: row.valueName || row.value_name || "",
    rarity: Number(row.rarity || 0),
    itemCount: Number(row.itemCount || row.item_count || 0),
    floorTon: Number(row.floorTon || row.floor_ton || 0),
    metrics: row.metrics || {},
    updatedAt: row.updatedAt || row.updated_at || "",
  };
}

async function storedGiftAttributesForPairs(requested = [], pool = null) {
  const byKey = new Map();
  const collectionKeys = [...new Set(requested.flatMap((pair) => pair.collectionKeys))];
  const valueKeys = [...new Set(requested.flatMap((pair) => [pair.modelKey, pair.backdropKey, pair.symbolKey]).filter(Boolean))];
  if (pool && collectionKeys.length && valueKeys.length) {
    const result = await pool.query(
      `SELECT collection_key AS "collectionKey", trait_type AS "traitType", value_key AS "valueKey",
        value_name AS "valueName", rarity, item_count AS "itemCount", floor_ton AS "floorTon",
        metrics, updated_at AS "updatedAt"
       FROM gift_attribute_registry
       WHERE collection_key = ANY($1::text[]) AND value_key = ANY($2::text[])`,
      [collectionKeys, valueKeys]
    );
    result.rows.forEach((row) => {
      byKey.set(`${row.collectionKey}:${String(row.traitType).toLowerCase()}:${row.valueKey}`, normalizeStoredGiftAttribute(row));
    });
  } else {
    const store = loadGiftFloorSnapshots();
    requested.forEach((pair) => {
      pair.collectionKeys.forEach((collectionKey) => {
        const attributes = store.collections?.[collectionKey]?.attributes || {};
        [["model", pair.modelKey], ["backdrop", pair.backdropKey], ["symbol", pair.symbolKey]].forEach(([type, valueKey]) => {
          const attribute = valueKey ? attributes[type]?.[valueKey] : null;
          if (attribute) byKey.set(`${collectionKey}:${type}:${valueKey}`, normalizeStoredGiftAttribute({
            traitType: type,
            valueName: attribute.name,
            ...attribute,
          }));
        });
      });
    });
  }
  return byKey;
}

async function bulkStoredGiftModelFloors(pairs = []) {
  let requested = requestedGiftModelPairs(pairs);
  if (!requested.length) return [];
  const pool = await ensureGiftSnapshotTables();
  requested = await resolveStoredGiftCollectionKeys(requested, pool);
  const byKey = new Map();
  const attributesByKey = await storedGiftAttributesForPairs(requested, pool);
  if (pool) {
    const collectionKeys = [...new Set(requested.flatMap((pair) => pair.collectionKeys))];
    const result = await pool.query(
      `SELECT DISTINCT ON (collection_key, model_key)
        collection_key AS "collectionKey", model_key AS "modelKey", model_name AS model,
        floor_ton AS "floorTon", floor_usd AS "floorUsd", ton_usd_rate AS "tonUsdRate",
        source, listed_count AS "listedCount", deals_30d AS "deals30d",
        avg_30d_ton AS "avg30dTon", avg_30d_usd AS "avg30dUsd", model_count AS "modelCount",
        rarity, market_updated_at AS "marketUpdatedAt", icon_url AS "iconUrl",
        animation_url AS "animationUrl", media_type AS "mediaType"
       FROM gift_model_floor_snapshots
       WHERE collection_key = ANY($1::text[])
       ORDER BY collection_key, model_key, sampled_at DESC`,
      [collectionKeys]
    );
    result.rows.forEach((row) => byKey.set(`${row.collectionKey}:${row.modelKey}`, normalizeStoredGiftModel(row)));
  } else {
    const store = loadGiftFloorSnapshots();
    requested.forEach((pair) => {
      pair.collectionKeys.forEach((collectionKey) => {
        const model = store.collections?.[collectionKey]?.models?.[pair.modelKey];
        const snapshots = model?.snapshots || [];
        const snapshot = snapshots[snapshots.length - 1] || {};
        if (!model || !(Number(snapshot.floorTon || 0) > 0 || Number(snapshot.floorUsd || 0) > 0)) return;
        byKey.set(`${collectionKey}:${pair.modelKey}`, normalizeStoredGiftModel({
          ...snapshot,
          model: model.name,
          modelKey: pair.modelKey,
          iconUrl: snapshot.iconUrl || model.iconUrl || "",
          animationUrl: snapshot.animationUrl || model.animationUrl || "",
          mediaType: snapshot.mediaType || model.mediaType || "",
        }));
      });
    });
  }
  return requested.map((pair) => {
    const model = pair.collectionKeys
      .map((collectionKey) => byKey.get(`${collectionKey}:${pair.modelKey}`))
      .find(Boolean);
    if (!model) return null;
    const traitMetrics = {};
    [["Model", "model", pair.modelKey], ["Backdrop", "backdrop", pair.backdropKey], ["Symbol", "symbol", pair.symbolKey]]
      .forEach(([label, type, valueKey]) => {
        if (!valueKey) return;
        const attribute = pair.collectionKeys
          .map((collectionKey) => attributesByKey.get(`${collectionKey}:${type}:${valueKey}`))
          .find(Boolean);
        if (attribute) traitMetrics[label] = attribute;
      });
    if (!traitMetrics.Model && Number(model.rarity || 0) > 0) {
      traitMetrics.Model = { type: "Model", value: model.model, rarity: Number(model.rarity), itemCount: Number(model.modelCount || 0) };
    }
    return {
      collection: pair.collection,
      collectionKey: pair.collectionKey,
      backdrop: pair.backdrop,
      symbol: pair.symbol,
      ...model,
      traitMetrics,
      traitRarities: Object.fromEntries(Object.entries(traitMetrics).map(([label, value]) => [label, Number(value.rarity || 0)])),
    };
  }).filter(Boolean);
}

function drainGiftModelRecoveryQueue() {
  while (giftModelRecoveryActive < 3 && giftModelRecoveryQueue.length) {
    const job = giftModelRecoveryQueue.shift();
    giftModelRecoveryActive += 1;
    latestGiftModelFloors(job.collection)
      .catch((error) => console.warn(`[gift-model-recovery] ${job.collection}: ${error.message}`))
      .finally(() => {
        giftModelRecoveryActive -= 1;
        giftModelRecoveryRequests.delete(job.key);
        job.resolve();
        drainGiftModelRecoveryQueue();
      });
  }
}

function recoverGiftModelCollection(collection = "") {
  const key = giftSnapshotKey(collection);
  if (!key) return Promise.resolve();
  if (giftModelRecoveryRequests.has(key)) return giftModelRecoveryRequests.get(key);
  const request = new Promise((resolve) => {
    giftModelRecoveryQueue.push({ key, collection, resolve });
    drainGiftModelRecoveryQueue();
  });
  giftModelRecoveryRequests.set(key, request);
  return request;
}

async function latestGiftModelFloors(collection = "") {
  const payload = await thermosGiftModelPayload(collection);
  if (!payload.models.length) return [];
  let xgiftPayload = { ok: false, models: [] };
  try {
    xgiftPayload = await xgiftModelMediaPayload(payload.canonicalName || collection);
  } catch {}
  const xgiftModels = new Map(
    (Array.isArray(xgiftPayload.models) ? xgiftPayload.models : []).map((model) => [
      giftSnapshotKey(model.model || model.modelKey),
      model,
    ])
  );
  const mergedPayload = {
    ...payload,
    giftId: payload.giftId || xgiftPayload.giftId || "",
    source: xgiftModels.size ? "xgift-model" : payload.source,
    marketPlatform: xgiftModels.size ? "xGift" : payload.marketPlatform,
    models: payload.models.map((model) => {
      const xgiftModel = xgiftModels.get(giftSnapshotKey(model.model));
      if (!xgiftModel) return model;
      const xgiftIcon = String(xgiftModel.iconUrl || "").trim();
      const xgiftAnimation = String(xgiftModel.animationUrl || "").trim()
        || (/\.(?:lottie\.)?json(?:[?#].*)?$/i.test(xgiftIcon) ? xgiftIcon : "");
      const xgiftStaticIcon = /\.(?:lottie\.)?json(?:[?#].*)?$/i.test(xgiftIcon) ? "" : xgiftIcon;
      return {
        ...model,
        iconUrl: xgiftStaticIcon || model.iconUrl || "",
        animationUrl: xgiftAnimation || model.animationUrl || "",
        mediaType: xgiftModel.mediaType || mediaKind(xgiftAnimation || xgiftStaticIcon || model.animationUrl || model.iconUrl || ""),
        source: "xgift-model",
        marketPlatform: "xGift",
        marketUpdatedAt: xgiftModel.marketUpdatedAt || model.marketUpdatedAt || "",
      };
    }),
  };
  appendGiftModelFloorSnapshots(collection, mergedPayload).catch(() => null);
  return mergedPayload.models.map((model) => ({
    model: model.model,
    modelKey: giftSnapshotKey(model.model),
    floorTon: Number(model.floorTon || 0),
    floorUsd: Number(model.floorUsd || 0),
    tonUsdRate: Number(model.tonUsdRate || mergedPayload.tonUsdRate || 0),
    listedCount: Number(model.listedCount || 0),
    deals30d: Number(model.deals30d || 0),
    avg30dTon: Number(model.avg30dTon || 0),
    avg30dUsd: Number(model.avg30dUsd || 0),
    modelCount: Number(model.modelCount || 0),
    rarity: Number(model.rarity || 0),
    marketUpdatedAt: model.marketUpdatedAt || "",
    iconUrl: model.iconUrl || "",
    animationUrl: model.animationUrl || "",
    mediaType: model.mediaType || mediaKind(model.animationUrl || model.iconUrl || ""),
    source: model.source || mergedPayload.source || "thermos-model",
  }));
}

async function giftSnapshotHistoryDb(name, range = "7d") {
  const pool = await ensureGiftSnapshotTables();
  if (!pool) return null;
  const aliases = [name, String(name || "").replace(/s$/i, "")].map(giftSnapshotKey).filter(Boolean);
  const duration = String(range).toLowerCase() === "30d" ? 30 * 86400000 : 7 * 86400000;
  const since = new Date(Date.now() - duration).toISOString();
  const rows = await pool.query(
    `SELECT sampled_at, floor_ton, floor_usd
     FROM gift_floor_snapshots
     WHERE collection_key = ANY($1::text[])
       AND sampled_at >= $2
       AND floor_usd > 0
     ORDER BY sampled_at ASC`,
    [aliases, since]
  );
  const points = rows.rows.map((row) => ({
    timestamp: new Date(row.sampled_at).getTime(),
    priceTon: Number(row.floor_ton || 0),
    priceUsd: Number(row.floor_usd || 0),
  }));
  return points.length >= 2 ? points : [];
}

function giftSnapshotHistoryJson(name, range = "7d") {
  const store = loadGiftFloorSnapshots();
  const aliases = [name, String(name || "").replace(/s$/i, "")].map(giftSnapshotKey).filter(Boolean);
  const collection = aliases.map((key) => store.collections[key]).find(Boolean);
  if (!collection?.snapshots?.length) return [];
  const duration = String(range).toLowerCase() === "30d" ? 30 * 86400000 : 7 * 86400000;
  const since = Date.now() - duration;
  const points = collection.snapshots
    .map((snapshot) => ({
      timestamp: new Date(snapshot.timestamp).getTime(),
      priceTon: Number(snapshot.floorTon || 0),
      priceUsd: Number(snapshot.floorUsd || 0),
    }))
    .filter((point) => Number.isFinite(point.timestamp) && point.timestamp >= since && point.priceUsd > 0)
    .sort((a, b) => a.timestamp - b.timestamp);
  return points.length >= 2 ? points : [];
}

async function giftSnapshotHistory(name, range = "7d") {
  const dbPoints = await giftSnapshotHistoryDb(name, range);
  if (dbPoints) return dbPoints;
  return giftSnapshotHistoryJson(name, range);
}

async function giftModelSnapshotHistoryDb(collection = "", model = "", range = "7d") {
  const pool = await ensureGiftSnapshotTables();
  if (!pool) return null;
  const collectionKey = giftSnapshotKey(collection);
  const modelKey = giftSnapshotKey(model);
  if (!collectionKey || !modelKey) return [];
  const duration = String(range).toLowerCase() === "30d" ? 30 * 86400000 : 7 * 86400000;
  const since = new Date(Date.now() - duration).toISOString();
  const rows = await pool.query(
    `SELECT sampled_at, floor_ton, floor_usd
     FROM gift_model_floor_snapshots
     WHERE collection_key = $1
       AND model_key = $2
       AND sampled_at >= $3
       AND floor_usd > 0
     ORDER BY sampled_at ASC`,
    [collectionKey, modelKey, since]
  );
  const points = rows.rows.map((row) => ({
    timestamp: new Date(row.sampled_at).getTime(),
    priceTon: Number(row.floor_ton || 0),
    priceUsd: Number(row.floor_usd || 0),
  }));
  return points.length >= 2 ? points : [];
}

function giftModelSnapshotHistoryJson(collection = "", model = "", range = "7d") {
  const store = loadGiftFloorSnapshots();
  const collectionItem = store.collections[giftSnapshotKey(collection)];
  const modelItem = collectionItem?.models?.[giftSnapshotKey(model)];
  if (!modelItem?.snapshots?.length) return [];
  const duration = String(range).toLowerCase() === "30d" ? 30 * 86400000 : 7 * 86400000;
  const since = Date.now() - duration;
  const points = modelItem.snapshots
    .map((snapshot) => ({
      timestamp: new Date(snapshot.timestamp).getTime(),
      priceTon: Number(snapshot.floorTon || 0),
      priceUsd: Number(snapshot.floorUsd || 0),
    }))
    .filter((point) => Number.isFinite(point.timestamp) && point.timestamp >= since && point.priceUsd > 0)
    .sort((a, b) => a.timestamp - b.timestamp);
  return points.length >= 2 ? points : [];
}

async function giftModelSnapshotHistory(collection = "", model = "", range = "7d") {
  const dbPoints = await giftModelSnapshotHistoryDb(collection, model, range);
  if (dbPoints) return dbPoints;
  return giftModelSnapshotHistoryJson(collection, model, range);
}

async function giftSnapshotStoreStatus(collection = "") {
  const pool = await ensureGiftSnapshotTables();
  const key = giftSnapshotKey(collection);
  if (pool) {
    if (key) {
      const result = await pool.query(
        `SELECT c.collection_key AS key, c.name, c.gift_id AS "giftId", c.recent_sales AS "recentSales",
                COALESCE(json_agg(json_build_object(
                  'timestamp', s.sampled_at,
                  'floorTon', s.floor_ton,
                  'floorUsd', s.floor_usd,
                  'source', s.source
                ) ORDER BY s.sampled_at ASC) FILTER (WHERE s.id IS NOT NULL), '[]'::json) AS snapshots
         FROM gift_floor_collections c
         LEFT JOIN gift_floor_snapshots s ON s.collection_key = c.collection_key
         WHERE c.collection_key = $1
         GROUP BY c.collection_key, c.name, c.gift_id, c.recent_sales`,
        [key]
      );
      return { storage: "postgres", collection: result.rows[0] || null };
    }
    const result = await pool.query(
      `SELECT
        COUNT(DISTINCT c.collection_key)::int AS collections,
        COUNT(s.id)::int AS points,
        (SELECT COUNT(*)::int FROM gift_model_floor_snapshots) AS "modelPoints",
        (SELECT COUNT(DISTINCT collection_key || ':' || model_key)::int FROM gift_model_floor_snapshots) AS "models",
        (SELECT COUNT(*)::int FROM gift_attribute_registry) AS attributes,
        MAX(s.sampled_at) AS "updatedAt"
       FROM gift_floor_collections c
       LEFT JOIN gift_floor_snapshots s ON s.collection_key = c.collection_key`
    );
    const row = result.rows[0] || {};
    return {
      storage: "postgres",
      updatedAt: row.updatedAt || "",
      collections: Number(row.collections || 0),
      points: Number(row.points || 0),
      models: Number(row.models || 0),
      modelPoints: Number(row.modelPoints || 0),
      attributes: Number(row.attributes || 0),
    };
  }
  const store = loadGiftFloorSnapshots();
  if (key) return { storage: "json", collection: store.collections[key] || null };
  const collections = Object.keys(store.collections || {});
  const points = collections.reduce((sum, collectionKey) => sum + (store.collections[collectionKey]?.snapshots || []).length, 0);
  const models = collections.reduce((sum, collectionKey) => sum + Object.keys(store.collections[collectionKey]?.models || {}).length, 0);
  const modelPoints = collections.reduce((sum, collectionKey) => {
    const modelMap = store.collections[collectionKey]?.models || {};
    return sum + Object.keys(modelMap).reduce((count, modelKey) => count + (modelMap[modelKey]?.snapshots || []).length, 0);
  }, 0);
  const attributes = collections.reduce((sum, collectionKey) => {
    const registry = store.collections[collectionKey]?.attributes || {};
    return sum + Object.values(registry).reduce((count, values) => count + Object.keys(values || {}).length, 0);
  }, 0);
  return {
    storage: "json",
    updatedAt: store.updatedAt || "",
    collections: collections.length,
    points,
    models,
    modelPoints,
    attributes,
  };
}

async function giftSnapshotStorageHealth() {
  const pool = await ensureGiftSnapshotTables();
  const volumeLimitMb = Number(process.env.RAILWAY_POSTGRES_VOLUME_MB || 500);
  if (pool) {
    const result = await pool.query(
      `SELECT
        pg_database_size(current_database())::bigint AS "databaseBytes",
        (SELECT COUNT(*)::bigint FROM gift_floor_snapshots) AS "collectionPoints",
        (SELECT COUNT(*)::bigint FROM gift_model_floor_snapshots) AS "modelPoints",
        (SELECT COUNT(DISTINCT collection_key || ':' || model_key)::bigint FROM gift_model_floor_snapshots) AS "models",
        (SELECT MAX(sampled_at) FROM gift_model_floor_snapshots) AS "lastModelSnapshotAt",
        (SELECT MAX(sampled_at) FROM gift_floor_snapshots) AS "lastCollectionSnapshotAt"`
    );
    const row = result.rows[0] || {};
    const databaseMb = Number(row.databaseBytes || 0) / 1024 / 1024;
    const limitMb = volumeLimitMb > 0 ? volumeLimitMb : 500;
    const usedPct = limitMb ? (databaseMb / limitMb) * 100 : 0;
    const remainingMb = Math.max(0, limitMb - databaseMb);
    const risk = usedPct >= 95 ? "urgent" : usedPct >= 80 ? "high" : usedPct >= 60 ? "watch" : "ok";
    return {
      storage: "postgres",
      databaseMb: Number(databaseMb.toFixed(2)),
      volumeLimitMb: limitMb,
      usedPct: Number(usedPct.toFixed(1)),
      remainingMb: Number(remainingMb.toFixed(2)),
      risk,
      retentionDays: giftSnapshotRetentionDays,
      unchangedHeartbeatHours: Number((giftSnapshotUnchangedIntervalMs / 3600000).toFixed(1)),
      snapshotIntervalMinutes: Number((giftSnapshotIntervalMs / 60000).toFixed(1)),
      collections: Number(row.collectionPoints || 0),
      models: Number(row.models || 0),
      modelPoints: Number(row.modelPoints || 0),
      lastCollectionSnapshotAt: row.lastCollectionSnapshotAt || "",
      lastModelSnapshotAt: row.lastModelSnapshotAt || "",
      policy: "write on TON floor/stat change; unchanged models write roughly once per day",
    };
  }
  const status = await giftSnapshotStoreStatus();
  const fileBytes = fs.existsSync(giftFloorSnapshotsFile) ? fs.statSync(giftFloorSnapshotsFile).size : 0;
  return {
    storage: "json",
    databaseMb: Number((fileBytes / 1024 / 1024).toFixed(2)),
    volumeLimitMb: 0,
    usedPct: 0,
    remainingMb: 0,
    risk: "local",
    ...status,
    policy: "local JSON only; production uses Postgres",
  };
}

async function canonicalGiftNames() {
  const rows = await thermosGiftCollections(true);
  return rows.map(thermosCollectionName).filter(Boolean);
}

function storedGiftNames() {
  const store = loadGiftFloorSnapshots();
  return Object.values(store.collections || {})
    .map((item) => item?.name)
    .filter(Boolean);
}

async function snapshotGiftNames() {
  const names = new Set();
  storedGiftNames().forEach((name) => names.add(name));
  try {
    (await canonicalGiftNames()).forEach((name) => names.add(name));
  } catch (error) {
    console.warn(`[gift-snapshot] gift-list failed: ${error.message}`);
  }
  const store = loadGiftFloorSnapshots();
  return [...names].sort((a, b) => {
    const aMissing = Object.keys(store.collections[giftSnapshotKey(a)]?.models || {}).length ? 1 : 0;
    const bMissing = Object.keys(store.collections[giftSnapshotKey(b)]?.models || {}).length ? 1 : 0;
    return aMissing - bMissing || String(a).localeCompare(String(b));
  });
}

async function xgiftModelFloorsWithBackoff(name) {
  let lastPayload = null;
  for (let attempt = 0; attempt <= giftModelRetryCount; attempt += 1) {
    const payload = await xgiftBridge("gift-model-floors", { name, collection: name }, 60000);
    lastPayload = payload;
    const count = Array.isArray(payload?.models) ? payload.models.length : 0;
    if (payload?.ok && count) return payload;
    const text = String(payload?.error || payload?.__stderr || "");
    if (!/429|rate/i.test(text) || attempt >= giftModelRetryCount) return payload;
    console.warn(`[gift-model-snapshot] ${name}: rate limited, waiting ${Math.round(giftModelRetryDelayMs / 1000)}s`);
    await sleep(giftModelRetryDelayMs);
  }
  return lastPayload;
}

async function xgiftModelMediaPayload(collectionName = "", { force = false } = {}) {
  const key = giftSnapshotKey(collectionName);
  if (!key) return { ok: false, models: [] };
  const cached = xgiftModelMediaCache.get(key);
  if (!force && cached && cached.expiresAt > Date.now()) return cached.value;
  const value = await xgiftModelFloorsWithBackoff(collectionName);
  xgiftModelMediaCache.set(key, {
    value,
    expiresAt: Date.now() + 30 * 60 * 1000,
  });
  return value;
}

async function xgiftGiftAttributesPayload(collectionName = "", { force = false } = {}) {
  const key = giftSnapshotKey(collectionName);
  if (!key) return { ok: false, models: [], backdrops: [], symbols: [] };
  const cached = xgiftGiftAttributesCache.get(key);
  if (!force && cached && cached.expiresAt > Date.now()) return cached.value;
  let value = { ok: false, models: [], backdrops: [], symbols: [] };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    value = await xgiftBridge("gift-attributes", { name: collectionName, collection: collectionName }, 60000);
    const count = ["models", "backdrops", "symbols"]
      .reduce((sum, trait) => sum + (Array.isArray(value?.[trait]) ? value[trait].length : 0), 0);
    if (value?.ok && count > 0) {
      xgiftGiftAttributesCache.set(key, {
        value,
        expiresAt: Date.now() + 30 * 60 * 1000,
      });
      return value;
    }
    const text = String(value?.error || value?.__stderr || "");
    if (!/429|rate/i.test(text) || attempt === 2) break;
    await sleep(5000 * (attempt + 1));
  }
  return value;
}

function mergeGiftAttributePayload(collectionName = "", primaryPayload = {}, fallbackPayload = {}) {
  const primary = thermosGiftAttributeBucket(primaryPayload, collectionName);
  const canonicalName = primary.name || fallbackPayload.canonicalName || collectionName;
  const merged = { ...(primary.data || {}) };
  [
    ["models", fallbackPayload.models],
    ["backdrops", fallbackPayload.backdrops],
    ["symbols", fallbackPayload.symbols],
  ].forEach(([key, fallbackItems]) => {
    const primaryItems = Array.isArray(primary.data?.[key]) ? primary.data[key] : [];
    const seen = new Set(primaryItems.map((item) => giftSnapshotKey(item?.name || item?.value || item?.title)));
    merged[key] = primaryItems.concat(
      (Array.isArray(fallbackItems) ? fallbackItems : [])
        .filter((item) => {
          const valueKey = giftSnapshotKey(item?.name || item?.value || item?.title);
          if (!valueKey || seen.has(valueKey)) return false;
          seen.add(valueKey);
          return true;
        })
    );
  });
  return { [canonicalName]: merged };
}

async function xgiftGiftAttributesForCollections(names = [], { force = false, concurrency = 1 } = {}) {
  const result = new Map();
  let index = 0;
  const workers = Array.from({ length: Math.min(concurrency, names.length) }, async () => {
    while (index < names.length) {
      const name = names[index++];
      try {
        result.set(giftSnapshotKey(name), await xgiftGiftAttributesPayload(name, { force }));
      } catch (error) {
        console.warn(`[gift-attributes] xGift ${name}: ${error.message}`);
      }
      await sleep(250);
    }
  });
  await Promise.all(workers);
  return result;
}

async function collectGiftFloorSnapshotsNow({ force = false } = {}) {
  if (giftSnapshotCollectorPromise) return giftSnapshotCollectorPromise;
  giftSnapshotCollectorState = {
    status: "running",
    startedAt: new Date().toISOString(),
    completedAt: "",
    total: 0,
    done: 0,
    ok: 0,
    errors: 0,
    modelSnapshots: 0,
    attributes: 0,
    error: "",
  };
  giftSnapshotCollectorPromise = (async () => {
    try {
      const tonRate = await tonUsdRate();
      const collections = await thermosGiftCollections(true);
      const names = collections.map(thermosCollectionName).filter(Boolean);
      const collectionByName = new Map(collections.map((item) => [giftSnapshotKey(thermosCollectionName(item)), item]));
      giftSnapshotCollectorState.total = names.length;
      for (const name of names) {
        try {
          const collectionFloor = normalizeThermosCollection(collectionByName.get(giftSnapshotKey(name)) || {}, tonRate);
          if (Number(collectionFloor.floorTon || 0) > 0) {
            await appendGiftFloorSnapshot(name, {
              ...collectionFloor,
              canonicalName: name,
              marketPlatform: "Thermos",
              source: "thermos-proxy",
              tonUsdRate: tonRate,
            });
            giftSnapshotCollectorState.ok += 1;
          } else {
            giftSnapshotCollectorState.errors += 1;
          }
        } catch (error) {
          giftSnapshotCollectorState.errors += 1;
          console.warn(`[gift-snapshot] ${name}: ${error.message}`);
        }
        giftSnapshotCollectorState.done += 1;
      }
      const xgiftAttributesByCollection = await xgiftGiftAttributesForCollections(names, { force, concurrency: 1 });
      const chunkSize = 25;
      for (let index = 0; index < names.length; index += chunkSize) {
        const chunk = names.slice(index, index + chunkSize);
        try {
          const attributes = await thermosGiftAttributes(chunk, true);
          for (const name of chunk) {
            const mergedAttributes = mergeGiftAttributePayload(
              name,
              attributes,
              xgiftAttributesByCollection.get(giftSnapshotKey(name)) || {}
            );
            const attributeRecords = await appendGiftAttributes(name, mergedAttributes);
            giftSnapshotCollectorState.attributes += attributeRecords.length;
            const payload = thermosGiftModelPayloadFromAttributes(name, mergedAttributes, tonRate);
            const records = await appendGiftModelFloorSnapshots(name, payload);
            giftSnapshotCollectorState.modelSnapshots += records.length;
            if (!records.length) console.warn(`[gift-model-snapshot] ${name}: no Thermos model floors returned`);
          }
        } catch (error) {
          giftSnapshotCollectorState.errors += chunk.length;
          console.warn(`[gift-model-snapshot] Thermos attributes chunk failed: ${error.message}`);
        }
      }
      await pruneGiftSnapshotStorage();
      giftSnapshotCollectorState.status = "idle";
      giftSnapshotCollectorState.completedAt = new Date().toISOString();
      return giftSnapshotCollectorState;
    } catch (error) {
      giftSnapshotCollectorState.status = "error";
      giftSnapshotCollectorState.error = error.message;
      giftSnapshotCollectorState.completedAt = new Date().toISOString();
      return giftSnapshotCollectorState;
    } finally {
      giftSnapshotCollectorPromise = null;
    }
  })();
  return giftSnapshotCollectorPromise;
}

async function marketJson(url, options = {}, timeoutMs = 7000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: options.method || "GET",
      headers: marketHeaders(options.headers || {}),
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
    const text = await response.text();
    const body = text ? JSON.parse(text) : null;
    if (!response.ok) throw new Error(body?.error || body?.message || `${url} failed (${response.status})`);
    return body;
  } finally {
    clearTimeout(timeout);
  }
}

function registryItems(payload) {
  if (Array.isArray(payload)) return payload;
  return payload?.items || payload?.collections || payload?.data || payload?.result || payload?.rows || [];
}

const STICKERDOM_XTR_USD = 0.015;

async function stickerdomStatsFeed(force = false) {
  const now = Date.now();
  if (!force && stickerdomStatsCache && stickerdomStatsExpiresAt > now) return stickerdomStatsCache;
  if (!force && stickerdomStatsPromise) return stickerdomStatsPromise;
  stickerdomStatsPromise = marketJson("https://data.stickerdom.store/data/web-stats.json", {}, 7000)
    .then((payload) => {
      const rows = Array.isArray(payload) ? payload : [];
      stickerdomStatsCache = rows;
      stickerdomStatsExpiresAt = Date.now() + 30 * 60 * 1000;
      return rows;
    })
    .catch(() => [])
    .finally(() => {
      stickerdomStatsPromise = null;
    });
  return stickerdomStatsPromise;
}

function stickerdomPrice(character = {}, tonRate = 0) {
  const raw = Number(character.price || 0);
  if (!Number.isFinite(raw) || raw <= 0) return null;
  const currency = String(character.currency || "XTR").toUpperCase();
  if (currency === "TON") {
    const floorTon = raw > 1e6 ? raw / 1e9 : raw;
    return { floorTon, floorUsd: floorTon * tonRate };
  }
  const floorUsd = raw * STICKERDOM_XTR_USD;
  return { floorUsd, floorTon: tonRate > 0 ? floorUsd / tonRate : 0 };
}

async function thermosStickerStats(force = false) {
  const now = Date.now();
  if (!force && thermosStickerStatsCache && thermosStickerStatsExpiresAt > now) return thermosStickerStatsCache;
  if (!force && thermosStickerStatsPromise) return thermosStickerStatsPromise;
  thermosStickerStatsPromise = marketJson("https://proxy.thermos.gifts/api/v1/stickers/stats/collection", {}, 7000)
    .then((payload) => {
      const rows = Array.isArray(payload) ? payload : [];
      thermosStickerStatsCache = rows;
      thermosStickerStatsExpiresAt = Date.now() + 3 * 60 * 1000;
      return rows;
    })
    .catch(() => [])
    .finally(() => {
      thermosStickerStatsPromise = null;
    });
  return thermosStickerStatsPromise;
}

async function thermosStickerCharacterStats(collectionId) {
  if (!collectionId) return [];
  try {
    const payload = await marketJson(`https://proxy.thermos.gifts/api/v1/stickers/stats/${encodeURIComponent(collectionId)}/characters`, {}, 7000);
    return Array.isArray(payload) ? payload : [];
  } catch {
    return [];
  }
}

async function stickersToolsFloor(collectionId, characterId) {
  if (!collectionId || !characterId) return null;
  try {
    const payload = await externalJson(`https://stickers.tools/api/v1/stickers/${encodeURIComponent(collectionId)}/${encodeURIComponent(characterId)}/floor`, 7000);
    const data = payload?.data || payload;
    const platforms = Array.isArray(data?.platforms) ? data.platforms : [];
    const priced = platforms
      .map((platform) => ({
        ...platform,
        price_ton: Number(platform.price_ton),
        price_usd: Number(platform.price_usd),
      }))
      .filter((platform) => platform.price_ton > 0 || platform.price_usd > 0)
      .sort((a, b) => (a.price_usd || Number.MAX_VALUE) - (b.price_usd || Number.MAX_VALUE));
    if (!priced.length) return null;
    return { data, platform: priced[0], platforms: priced };
  } catch {
    return null;
  }
}

async function stickersToolsMarketStats(force = false) {
  const now = Date.now();
  if (!force && stickersToolsStatsCache && stickersToolsStatsExpiresAt > now) return stickersToolsStatsCache;
  if (!force && stickersToolsStatsPromise) return stickersToolsStatsPromise;
  stickersToolsStatsPromise = externalJson("https://stickers.tools/api/v1/market/stats", 7000)
    .then((payload) => {
      stickersToolsStatsCache = payload?.data?.collections || {};
      stickersToolsStatsExpiresAt = Date.now() + 3 * 60 * 1000;
      return stickersToolsStatsCache;
    })
    .catch(() => ({}))
    .finally(() => {
      stickersToolsStatsPromise = null;
    });
  return stickersToolsStatsPromise;
}

function stickerToolsPriceResult(collection = {}, sticker = null, tonRate = 0, source = "stickers-tools-stats") {
  const current = sticker?.current || collection;
  const price = current?.price || collection?.price || {};
  const floorUsd = Number(price?.floor?.usd || price?.median?.usd || 0);
  const floorTon = Number(price?.floor?.ton || price?.median?.ton || (tonRate > 0 ? floorUsd / tonRate : 0));
  if (!isPlausibleStickerFloor(floorUsd, floorTon, tonRate)) return null;
  const prevFloorUsd = Number(sticker?.["24h"]?.price?.floor?.usd || floorUsd);
  return {
    floorTon,
    floorUsd: floorUsd || floorTon * tonRate,
    volume24hTon: Number(sticker?.["24h"]?.volume?.ton || collection?.total_volume?.ton || 0),
    volume24hUsd: Number(sticker?.["24h"]?.volume?.usd || collection?.total_volume?.usd || 0),
    change24hPct: prevFloorUsd > 0 ? ((floorUsd - prevFloorUsd) / prevFloorUsd) * 100 : 0,
    sales24h: Number(sticker?.["24h"]?.trades || 0),
    totalSupply: Number(sticker?.supply?.current || sticker?.supply?.initial || collection?.supply?.current || 0),
    holders: 0,
    listedCount: 0,
    athFloorUsd: null,
    initUsd: Number(sticker?.init_price_usd || 0),
    initTon: Number(sticker?.init_price_ton || 0),
    marketPlatform: "Stickers Tools",
    marketUrl: "",
    collectionId: collection.id,
    characterId: sticker?.id || "",
    characterName: sticker?.name || "",
    recentSales: [],
    source,
  };
}

function isPlausibleStickerFloor(floorUsd = 0, floorTon = 0, tonRate = 0) {
  const usd = Number(floorUsd || (tonRate > 0 ? Number(floorTon || 0) * tonRate : 0));
  const ton = Number(floorTon || (tonRate > 0 ? Number(floorUsd || 0) / tonRate : 0));
  if (!Number.isFinite(usd) || !Number.isFinite(ton) || (usd <= 0 && ton <= 0)) return false;
  return usd <= 10000 && ton <= 5000;
}

async function stickersToolsStatsFloor(aliases = [], tonRate = 0, allowCollectionFallback = true) {
  const collections = await stickersToolsMarketStats();
  const aliasKeys = aliases.map((value) => normalizeStickerKey(String(value || "").replace(/\s+#\d+.*$/i, ""))).filter((key) => key.length > 3);
  const keyMatches = (value) => {
    const key = normalizeStickerKey(String(value || "").replace(/\s+#\d+.*$/i, ""));
    if (!key) return false;
    if (aliasKeys.includes(key)) return true;
    if (key.length < 8) return false;
    return aliasKeys.some((alias) => alias.length >= 8 && (alias.includes(key) || key.includes(alias)));
  };
  for (const collection of Object.values(collections || {})) {
    const stickers = Object.values(collection.stickers || {});
    const sticker = stickers.find((item) => keyMatches(item.name));
    if (sticker) return stickerToolsPriceResult(collection, sticker, tonRate);
  }
  const collection = Object.values(collections || {}).find((item) => keyMatches(item.name));
  if (collection && allowCollectionFallback) return stickerToolsPriceResult(collection, null, tonRate, "stickers-tools-collection");
  return null;
}

function normalizeStickerKey(value = "") {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function stickerAddressKeys(address = "") {
  const raw = String(address || "").trim();
  if (!raw) return [];
  const keys = new Set([raw.toLowerCase()]);
  try {
    const parsed = Address.parse(raw);
    keys.add(parsed.toRawString().toLowerCase());
    keys.add(parsed.toString({ urlSafe: true, bounceable: false }).toLowerCase());
    keys.add(parsed.toString({ urlSafe: true, bounceable: true }).toLowerCase());
  } catch {}
  return [...keys];
}

function stickerCollectionsSnapshot() {
  try {
    const stat = fs.statSync(stickerCollectionsRegistryFile);
    if (stickerCollectionsSnapshotCache && stickerCollectionsSnapshotMtimeMs === stat.mtimeMs) return stickerCollectionsSnapshotCache;
    const payload = JSON.parse(fs.readFileSync(stickerCollectionsRegistryFile, "utf8"));
    stickerCollectionsSnapshotCache = Array.isArray(payload.collections) ? payload.collections : [];
    stickerCollectionsSnapshotMtimeMs = stat.mtimeMs;
    return stickerCollectionsSnapshotCache;
  } catch {
    return [];
  }
}

function stickerCategoryRegistryFromSnapshot() {
  const registry = { address: new Map(), name: new Map() };
  try {
    const collections = stickerCollectionsSnapshot();
    const add = (keys = [], value = {}) => {
      const brand = value.brand || value.creator || value.category || value.name || value.collectionName;
      if (!brand) return;
      keys.filter(Boolean).forEach((key) => registry.name.set(normalizeStickerKey(key), { ...value, brand }));
      stickerAddressKeys(value.address).forEach((key) => registry.address.set(key, { ...value, brand }));
    };
    collections.forEach((collection) => {
      const primaryName = collection.names?.[0] || collection.name || collection.id;
      add([primaryName, ...(collection.names || [])], {
        brand: primaryName,
        categorySource: (collection.source || []).join(", ") || "snapshot",
        collectionId: Number(collection.id || 0),
        address: collection.address,
        image: collection.preview,
      });
      (collection.stickers || []).forEach((sticker) => add([sticker.name, primaryName], {
        brand: primaryName,
        categorySource: (collection.source || []).join(", ") || "snapshot",
        collectionId: Number(collection.id || 0),
        characterId: Number(sticker.id || 0),
        address: sticker.address,
        image: sticker.preview || collection.preview,
      }));
    });
  } catch {}
  return registry;
}

function stickerSnapshotFloor(aliases = [], tonRate = 0, meta = {}) {
  const collections = stickerCollectionsSnapshot();
  if (!collections.length) return null;
  const clean = (value) => normalizeStickerKey(String(value || "").replace(/\s+#\d+.*$/i, ""));
  const aliasKeys = expandStickerAliases(aliases).map(clean).filter((key) => key.length > 2);
  const itemKeys = expandStickerAliases([meta.item, meta.title, meta.characterName]).map(clean).filter((key) => key.length > 2);
  const collectionKeys = expandStickerAliases([meta.address, meta.collection, meta.collectionName, meta.name, ...aliases]).map(clean).filter((key) => key.length > 2);
  const hasSpecificItem = Boolean(meta.item || meta.title || meta.characterName);
  const exactMatchesKey = (value, keys = aliasKeys) => {
    const key = clean(value);
    if (!key) return false;
    return keys.includes(key);
  };
  const fuzzyMatchesKey = (value, keys = aliasKeys) => {
    const key = clean(value);
    if (!key) return false;
    if (keys.includes(key)) return true;
    if (key.length < 6) return false;
    return keys.some((alias) => alias.length >= 8 && key.length >= 6 && (alias.includes(key) || key.includes(alias)));
  };
  const resultFromSticker = (collection, sticker, source = "snapshot") => {
    const price = sticker?.current?.price || {};
    const fallbackPrice = !price?.floor && sticker?.price ? stickerdomPrice(sticker, tonRate) : null;
    const floorUsd = Number(price?.floor?.usd || price?.median?.usd || fallbackPrice?.floorUsd || 0);
    const floorTon = Number(price?.floor?.ton || price?.median?.ton || fallbackPrice?.floorTon || (tonRate > 0 ? floorUsd / tonRate : 0));
    if (!isPlausibleStickerFloor(floorUsd, floorTon, tonRate)) return null;
    const prevFloorUsd = Number(sticker?.volume24h?.price?.floor?.usd || sticker?.["24h"]?.price?.floor?.usd || floorUsd);
    return {
      floorTon,
      floorUsd: floorUsd || floorTon * tonRate,
      volume24hTon: Number(sticker?.volume24h?.volume?.ton || sticker?.["24h"]?.volume?.ton || 0),
      volume24hUsd: Number(sticker?.volume24h?.volume?.usd || sticker?.["24h"]?.volume?.usd || 0),
      change24hPct: prevFloorUsd > 0 && floorUsd > 0 ? ((floorUsd - prevFloorUsd) / prevFloorUsd) * 100 : 0,
      sales24h: Number(sticker?.volume24h?.trades || sticker?.["24h"]?.trades || 0),
      totalSupply: Number(sticker?.supply?.current || sticker?.supply?.initial || collection?.supply?.current || 0),
      holders: 0,
      listedCount: 0,
      athFloorUsd: null,
      initUsd: Number(sticker?.initPriceUsd || sticker?.init_price_usd || 0),
      initTon: Number(sticker?.initPriceTon || sticker?.init_price_ton || 0),
      marketPlatform: `${marketSourceLabel((collection.source || []).join(", ") || source) || "Sticker Registry"}`,
      marketUrl: "",
      collectionId: collection.id,
      characterId: sticker?.id || "",
      characterName: sticker?.name || "",
      recentSales: [],
      source: `snapshot-${source}`,
    };
  };
  const exactStickerMatches = [];
  const collectionMatches = [];
  collections.forEach((collection) => {
    const names = [collection.id, collection.name, ...(collection.names || [])];
    const collectionMatch = names.some((name) => fuzzyMatchesKey(name, collectionKeys));
    if (collectionMatch) collectionMatches.push(collection);
    (collection.stickers || []).forEach((sticker) => {
      const stickerNameMatch = itemKeys.length
        ? exactMatchesKey(sticker.name, itemKeys)
        : fuzzyMatchesKey(sticker.name, aliasKeys);
      if (stickerNameMatch || exactMatchesKey(sticker.address, aliasKeys)) {
        exactStickerMatches.push({ collection, sticker });
      }
    });
  });
  for (const match of exactStickerMatches) {
    const result = resultFromSticker(match.collection, match.sticker, "exact");
    if (result) return result;
  }
  if (hasSpecificItem) return null;
  const priced = collectionMatches
    .flatMap((collection) => (collection.stickers || []).map((sticker) => resultFromSticker(collection, sticker, "collection")).filter(Boolean))
    .sort((a, b) => Number(a.floorUsd || 0) - Number(b.floorUsd || 0));
  return priced[0] || null;
}

function stickerCategoryRows(payload) {
  if (Array.isArray(payload)) return payload;
  return payload?.collections || payload?.items || payload?.data?.collections || payload?.data || [];
}

async function stickerCategoryRegistry(force = false) {
  const now = Date.now();
  if (!force && stickerCategoryCache && stickerCategoryExpiresAt > now) return stickerCategoryCache;
  if (!force && stickerCategoryPromise) return stickerCategoryPromise;
  stickerCategoryPromise = (async () => {
    const registry = { address: new Map(), name: new Map() };
    const add = (keys = [], value = {}) => {
      const brand = value.brand || value.creator || value.category || value.name;
      if (!brand) return;
      keys.filter(Boolean).forEach((key) => registry.name.set(normalizeStickerKey(key), { ...value, brand }));
      stickerAddressKeys(value.address).forEach((key) => registry.address.set(key, { ...value, brand }));
    };

    const [toolsMeta, toolsStats, thermosStats, goodies] = await Promise.allSettled([
      externalJson("https://stickers.tools/api/v1/market/metadata", 7000),
      externalJson("https://stickers.tools/api/v1/market/stats", 7000),
      thermosStickerStats(),
      marketJson("https://goodies-9c55.onrender.com/api/collections", {}, 7000),
    ]);

    const toolsCollections = toolsStats.status === "fulfilled" ? toolsStats.value?.data?.collections || {} : {};
    Object.entries(toolsCollections).forEach(([collectionId, collection]) => {
      add([collection.name], {
        brand: collection.name,
        categorySource: "stickers.tools",
        collectionId: Number(collectionId),
        address: collection.address,
        image: collection.preview_url,
      });
    });

    const toolsMetadata = toolsMeta.status === "fulfilled" ? toolsMeta.value?.data || {} : {};
    Object.entries(toolsMetadata).forEach(([collectionId, characters]) => {
      const collection = toolsCollections[collectionId] || {};
      Object.entries(characters || {}).forEach(([characterId, character]) => {
        add([character.name, collection.name], {
          brand: collection.name || character.issuer,
          categorySource: "stickers.tools",
          collectionId: Number(collectionId),
          characterId: Number(characterId),
          address: character.address,
          image: character.preview_url || collection.preview_url,
        });
      });
    });

    const thermosRows = thermosStats.status === "fulfilled" ? thermosStats.value : [];
    await Promise.allSettled(thermosRows.slice(0, 80).map(async (row) => {
      try {
        const details = await marketJson(`https://proxy.thermos.gifts/api/v1/stickers/collections/${encodeURIComponent(row.collection_id)}`, {}, 5000);
        const c = details.collection || details;
        const existing = registry.name.get(normalizeStickerKey(c.title)) || registry.name.get(normalizeStickerKey(c.creator?.name));
        if (existing) {
          add([c.title, c.creator?.name], {
            ...existing,
            brand: existing.brand,
            categorySource: [existing.categorySource, "thermos"].filter(Boolean).join(", "),
            collectionId: existing.collectionId || Number(c.id || row.collection_id),
            image: existing.image || c.media?.[0]?.url,
          });
        }
      } catch {}
    }));

    const goodiesRows = goodies.status === "fulfilled" ? stickerCategoryRows(goodies.value) : [];
    goodiesRows.forEach((item) => {
      const existing = registry.name.get(normalizeStickerKey(item.name))
        || registry.name.get(normalizeStickerKey(item.title))
        || registry.name.get(normalizeStickerKey(item.collectionName))
        || registry.name.get(normalizeStickerKey(item.brand))
        || registry.name.get(normalizeStickerKey(item.project));
      if (existing) {
        add([item.name, item.title, item.collectionName], {
          ...existing,
          brand: existing.brand,
          categorySource: [existing.categorySource, "goodies"].filter(Boolean).join(", "),
          address: existing.address || item.address || item.collectionAddress,
          image: existing.image || item.image || item.preview_url,
        });
      }
    });

    stickerCategoryCache = registry;
    stickerCategoryExpiresAt = Date.now() + 30 * 60 * 1000;
    return registry;
  })().catch(() => ({ address: new Map(), name: new Map() })).finally(() => {
    stickerCategoryPromise = null;
  });
  return stickerCategoryPromise;
}

async function refreshStickerCollectionsRegistryFile(force = false) {
  if (!force && stickerCollectionsRegistryPromise) return stickerCollectionsRegistryPromise;
  stickerCollectionsRegistryPromise = (async () => {
    const [toolsStats, toolsMeta, stickerdom, thermos] = await Promise.allSettled([
      externalJson("https://stickers.tools/api/v1/market/stats", 7000),
      externalJson("https://stickers.tools/api/v1/market/metadata", 7000),
      stickerdomStatsFeed(true),
      thermosStickerStats(true),
    ]);
    const collections = new Map();
    const toolsCollectionIds = new Set();
    const addCollection = (id, row = {}) => {
      const key = String(id || row.id || row.collection_id || row.name || "").trim();
      if (!key) return null;
      const existing = collections.get(key) || { id: key, names: [], source: [], stickers: [] };
      [row.name, row.title, row.collection_name].filter(Boolean).forEach((name) => {
        if (!existing.names.includes(name)) existing.names.push(name);
      });
      [row.source, row.issuer].filter(Boolean).forEach((source) => {
        if (!existing.source.includes(source)) existing.source.push(source);
      });
      existing.preview = existing.preview || row.preview_url || row.cover || row.image;
      existing.supply = existing.supply || row.supply;
      existing.volume = existing.volume || row.total_volume;
      existing.mcap = existing.mcap || row.mcap;
      collections.set(key, existing);
      return existing;
    };
    stickerCollectionsSnapshot().forEach((collection) => {
      const key = String(collection.id || collection.names?.[0] || "").trim();
      if (key) collections.set(key, JSON.parse(JSON.stringify(collection)));
    });
    const addSticker = (collection, sticker) => {
      if (!collection || !sticker?.name) return;
      const existing = collection.stickers.find((item) =>
        (String(item.id || "") === String(sticker.id || "") && String(item.name || "") === String(sticker.name || ""))
        || (item.address && sticker.address && String(item.address).toLowerCase() === String(sticker.address).toLowerCase())
      );
      if (existing) {
        Object.assign(existing, {
          ...sticker,
          current: sticker.current || existing.current,
          volume24h: sticker.volume24h || existing.volume24h,
          initPriceUsd: sticker.initPriceUsd ?? existing.initPriceUsd,
          initPriceTon: sticker.initPriceTon ?? existing.initPriceTon,
          preview: sticker.preview || existing.preview,
          address: sticker.address || existing.address,
        });
      } else {
        collection.stickers.push(sticker);
      }
    };
    const statsCollections = toolsStats.status === "fulfilled" ? toolsStats.value?.data?.collections || {} : {};
    Object.entries(statsCollections).forEach(([id, collection]) => {
      toolsCollectionIds.add(String(id));
      const c = addCollection(id, { ...collection, source: collection.issuer || "stickers.tools" });
      Object.values(collection.stickers || {}).forEach((sticker) => addSticker(c, {
        id: sticker.id,
        name: sticker.name,
        address: sticker.address,
        preview: sticker.preview_url,
        current: sticker.current,
        volume24h: sticker["24h"],
        initPriceUsd: sticker.init_price_usd,
        initPriceTon: sticker.init_price_ton,
      }));
    });
    const meta = toolsMeta.status === "fulfilled" ? toolsMeta.value?.data || {} : {};
    Object.entries(meta).forEach(([id, stickers]) => {
      toolsCollectionIds.add(String(id));
      const c = addCollection(id, { name: statsCollections[id]?.name, source: statsCollections[id]?.issuer || "stickers.tools" });
      Object.values(stickers || {}).forEach((sticker) => {
        if (!c?.stickers.some((item) => item.id === sticker.id || item.address === sticker.address)) addSticker(c, {
          id: sticker.id,
          name: sticker.name,
          address: sticker.address,
          preview: sticker.preview_url,
          initPriceUsd: sticker.init_price_usd,
          initPriceTon: sticker.init_price_ton,
        });
      });
    });
    (stickerdom.status === "fulfilled" ? stickerdom.value : []).forEach((collection) => {
      if (!toolsCollectionIds.has(String(collection.id))) return;
      const c = addCollection(collection.id, { ...collection, source: "stickerdom" });
      (collection.characters || []).forEach((character) => addSticker(c, {
        id: character.id,
        name: character.name,
        preview: character.preview,
        price: character.price,
        currency: character.currency,
        supply: character.supply,
        originalSupply: character.originalSupply,
      }));
    });
    (thermos.status === "fulfilled" ? thermos.value : []).forEach((row) => {
      if (!toolsCollectionIds.has(String(row.collection_id))) return;
      const c = addCollection(row.collection_id, { name: row.collection_name, source: "thermos" });
      c.thermosStats = row.stats;
    });
    const payload = {
      updatedAt: new Date().toISOString(),
      count: collections.size,
      collections: [...collections.values()].sort((a, b) => (a.names[0] || "").localeCompare(b.names[0] || "")),
    };
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(stickerCollectionsRegistryFile, JSON.stringify(payload, null, 2));
    console.log(`[STICKERS] ${payload.count} collections stored`);
    return payload;
  })().catch((error) => {
    console.warn("Sticker registry snapshot failed", error.message);
    return null;
  }).finally(() => {
    stickerCollectionsRegistryPromise = null;
  });
  return stickerCollectionsRegistryPromise;
}

function inferStickerBrandName(collection = "", name = "") {
  const raw = String(collection || name || "Sticker Pack").replace(/\s+#\d+.*$/i, "").replace(/\s{2,}/g, " ").trim();
  const haystack = `${name || ""} ${collection || ""}`.replace(/\s+#\d+.*$/i, "").replace(/\s{2,}/g, " ").trim();
  const prefix = raw.split(":")[0].trim();
  if (prefix && prefix !== raw && /^[a-z0-9 .&'’–-]{2,32}$/i.test(prefix)) return prefix;
  const pairs = [
    ["Snoop Dogg x BAYC", "BAYC"],
    ["Bored Ape", "BAYC"],
    ["BAYC", "BAYC"],
    ["Cool Cat", "Cool Cat"],
    ["Doodles", "Doodles"],
    ["Shib", "Shib"],
    ["Ruyui", "Ruyui"],
    ["Lamborghini", "Lamborghini"],
    ["DOGS Origins", "DOGS Origins"],
    ["Lost Dogs", "Lost Dogs"],
    ["Notcoin OG", "Notcoin OG"],
    ["TON of Memes", "TON of Memes"],
    ["The Meme OGs", "TON of Memes"],
    ["Gold Vibes Club", "Gold Vibes Club"],
    ["Good Vibes Club", "Good Vibes Club"],
    ["TApps", "TApps"],
    ["OG Icons", "OG Icons"],
    ["Random memes", "Sticker Memes"],
    ["Mememania", "Mememania"],
    ["GAMEE", "GAMEE"],
    ["Moonbirds", "Moonbirds"],
    ["City Holder", "CITY Holder"],
  ];
  const hit = pairs.find(([needle]) => haystack.toLowerCase().includes(needle.toLowerCase()));
  if (hit) return hit[1];
  return raw.split(":")[0].replace(/\b(set|pack)\s*\d+$/i, "").trim() || raw;
}

function expandStickerAliases(values = []) {
  const raw = values.filter(Boolean).map((value) => String(value).trim()).filter(Boolean);
  const expanded = new Set(raw);
  const text = raw.join(" ").toLowerCase();
  if (/bored ape classics|bayc classic/.test(text)) {
    ["Bored Ape Originals", "Bored Ape Yacht Club", "BAYC"].forEach((value) => expanded.add(value));
  }
  if (/snoop\s*x\s*bayc mythics|snoop dogg x bayc avatars|snoop x bayc mythic/.test(text)) {
    ["Snoop Dogg x BAYC Avatars", "Snoop x BAYC Mythics", "BAYC", "Bored Ape Yacht Club", "Bored Ape Originals", "Ape Edition"].forEach((value) => expanded.add(value));
  }
  if (/cool cat react pack|cool cats/.test(text)) {
    ["Cool Cats", "Cool Cat React Pack I", "Cool Cat React Pack II"].forEach((value) => expanded.add(value));
  }
  if (/dogs origins|dogs ny|lost dogs/.test(text)) {
    ["DOGS Origins", "DOGS NY", "Lost Dogs"].forEach((value) => expanded.add(value));
  }
  if (/good vibes club|gold vibes club|ton of memes|the meme ogs/.test(text)) {
    ["Gold Vibes Club", "Good Vibes Club", "TON of Memes", "The Meme OGs"].forEach((value) => expanded.add(value));
  }
  return [...expanded];
}

function inferStickerBrandName(collection = "", name = "") {
  const raw = String(collection || name || "Sticker Pack").replace(/\s+#\d+.*$/i, "").replace(/\s{2,}/g, " ").trim();
  const haystack = `${name || ""} ${collection || ""}`.replace(/\s+#\d+.*$/i, "").replace(/\s{2,}/g, " ").trim();
  const pairs = [
    ["Snoop Dogg x BAYC", "BAYC"],
    ["Bored Ape", "BAYC"],
    ["BAYC", "BAYC"],
    ["Cool Cat", "Cool Cat"],
    ["Doodles", "Doodles"],
    ["Not Pixel", "Not Pixel"],
    ["NotPixel", "Not Pixel"],
    ["DOGS Pixel", "Not Pixel"],
    ["Vice Pixel", "Not Pixel"],
    ["Pixel Earth", "Not Pixel"],
    ["Diamond Pixel", "Not Pixel"],
    ["Retro Pixel", "Not Pixel"],
    ["Error Pixel", "Not Pixel"],
    ["Pixel Knight", "Not Pixel"],
    ["SuperPixel", "Not Pixel"],
    ["Pixel phrases", "Not Pixel"],
    ["Grass Pixel", "Not Pixel"],
    ["MacPixel", "Not Pixel"],
    ["NOT Wise", "NOT Wise"],
    ["Notcoin OG", "Notcoin"],
    ["Notcoin", "Notcoin"],
    ["Shib", "Shib"],
    ["Ruyui", "Ruyui"],
    ["Lamborghini", "Lamborghini"],
    ["DOGS Origins", "DOGS Origins"],
    ["DOGS NY", "DOGS"],
    ["DOGS OG", "DOGS"],
    ["DOGS Rewards", "DOGS"],
    ["DOGS Unleashed", "DOGS"],
    ["Lost Dogs", "DOGS"],
    ["TON of Memes", "TON of Memes"],
    ["The Meme OGs", "TON of Memes"],
    ["Gold Vibes Club", "Gold Vibes Club"],
    ["Good Vibes Club", "Good Vibes Club"],
    ["TApps", "TApps"],
    ["OG Icons", "OG Icons"],
    ["Random memes", "Sticker Memes"],
    ["Mememania", "Mememania"],
    ["GAMEE", "GAMEE"],
    ["Moonbirds", "Moonbirds"],
    ["City Holder", "CITY Holder"],
    ["Goodies", "Goodies"],
    ["Legends of the Alley", "Goodies"],
    ["Teddie", "Goodies"],
    ["Goodies Intern", "Goodies"],
    ["Blindbox", "Goodies"],
  ];
  const hit = pairs.find(([needle]) => haystack.toLowerCase().includes(needle.toLowerCase()));
  if (hit) return hit[1];
  if (/\bgoodies\b/i.test(haystack)) return "Goodies";
  if (/\b(fuse|ton of memes|good vibes club|gold vibes club|the meme ogs|tapps)\b/i.test(haystack)) return "Fuse";
  const prefix = raw.split(":")[0].trim();
  if (prefix && prefix !== raw && /^[a-z0-9 .&'’-]{2,32}$/i.test(prefix)) return prefix;
  return raw.split(":")[0].replace(/\b(set|pack)\s*\d+$/i, "").trim() || raw;
}

function isSuspiciousStickerCandidate(collection = "", name = "", description = "") {
  const text = `${collection} ${name} ${description}`.toLowerCase();
  return !text.trim()
    || /unknown collection/.test(text)
    || /telegram usernames?/.test(text)
    || /voucher|coupon|airdrop|claim|won\s+\d|win[-.]|spin|bonus|reward/i.test(text)
    || /nomis ton score|nomissian|ton score/.test(text)
    || /@[\w.-]+|https?:\/\/|\.me\b|\.biz\b|\.com\b/.test(text)
    || /giftbox|giftboxes|scratch cards?/.test(text)
    || /tmail|dns|domain/.test(text);
}

function registryName(item = {}) {
  return item.name || item.title || item.collectionName || item.collection_name || item.slug || item.id || "";
}

function registryTypeText(item = {}) {
  return [
    item.type,
    item.category,
    item.kind,
    item.collectionType,
    item.collection_type,
    item.nftType,
    item.nft_type,
    item.section,
  ].filter(Boolean).join(" ").toLowerCase();
}

function applyRegistryRows(rows = [], result) {
  rows.forEach((item) => {
    const name = String(registryName(item) || "").trim();
    if (!name) return;
    const typeText = registryTypeText(item);
    if (/sticker/.test(typeText)) result.validStickerCollectionNames.push(name);
    if (/gift|telegram_gift|collectible_gift/.test(typeText)) result.validGiftCollectionNames.push(name);
  });
}

function applyStickerRegistryRows(rows = []) {
  rows.forEach((item) => {
    const typeText = registryTypeText(item);
    const isSticker = item.type === "sticker"
      || item.type === "sticker_pack"
      || /sticker/.test(typeText);
    if (!isSticker) return;
    const address = String(item.collection_address || item.address || item.collectionAddress || item.collectionAddressRaw || "").trim();
    if (address) STICKER_COLLECTION_ADDRESSES.add(address.toLowerCase());
  });
}

async function fetchThermosRegistry() {
  try {
    return await marketJson("https://api.thermos.tg/api/collections?limit=100", {}, 5000);
  } catch {
    return marketJson("https://thermos.tg/api/v1/collections?limit=100", {}, 5000);
  }
}

async function refreshCollectiblesRegistry(force = false) {
  if (!force && liveCollectiblesRegistryCache && liveCollectiblesRegistryExpiresAt > Date.now()) return liveCollectiblesRegistryCache;
  if (!force && liveCollectiblesRegistryPromise) return liveCollectiblesRegistryPromise;
  liveCollectiblesRegistryPromise = Promise.allSettled([
    marketJson("https://api.tgmrkt.io/api/v1/collections?limit=200", {}, 5000),
    marketJson("https://api.tgmrkt.io/api/v1/collections?category=stickers&limit=200", {}, 5000),
    fetchThermosRegistry(),
  ]).then((results) => {
    const registry = { validGiftCollectionNames: [], validStickerCollectionNames: [], updatedAt: new Date().toISOString() };
    STICKER_COLLECTION_ADDRESSES.clear();
    results.forEach((result) => {
      if (result.status === "fulfilled") {
        const rows = registryItems(result.value);
        applyRegistryRows(rows, registry);
        applyStickerRegistryRows(rows);
      }
    });
    registry.validGiftCollectionNames = [...new Set(registry.validGiftCollectionNames)];
    registry.validStickerCollectionNames = [...new Set(registry.validStickerCollectionNames)];
    collectiblesRegistry.validGiftCollectionNames = registry.validGiftCollectionNames;
    collectiblesRegistry.validStickerCollectionNames = registry.validStickerCollectionNames;
    collectiblesRegistry.stickerCollectionAddresses = [...STICKER_COLLECTION_ADDRESSES];
    liveCollectiblesRegistryCache = registry;
    liveCollectiblesRegistryExpiresAt = Date.now() + 30 * 60 * 1000;
    console.log(`[REGISTRY] ${STICKER_COLLECTION_ADDRESSES.size} sticker collections loaded`);
    return registry;
  }).finally(() => {
    liveCollectiblesRegistryPromise = null;
  });
  return liveCollectiblesRegistryPromise;
}

function cachedMapValue(cache, key) {
  const item = cache.get(key);
  return item && item.expiresAt > Date.now() ? item.value : null;
}

function setCachedMapValue(cache, key, value, ttlMs) {
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

function formatAddress(address) {
  if (!address || address.length < 12) return address || "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function normalizeAccount(account, address) {
  const balanceNano = Number(account?.balance || 0);
  return {
    address,
    displayAddress: formatAddress(address),
    balanceNano,
    balanceTon: nanoToTon(balanceNano),
    status: account?.status || "unknown",
    isWallet: Boolean(account?.interfaces?.includes?.("wallet")),
  };
}

function canonicalAddressKey(address) {
  try {
    return Address.parse(String(address || "")).toString({ urlSafe: true, bounceable: false }).toLowerCase();
  } catch {
    return String(address || "").toLowerCase();
  }
}

function normalizeJettons(payload) {
  return (payload?.balances || []).map((item) => {
    const decimals = Number(item?.jetton?.decimals || 9);
    const rawBalance = Number(item?.balance || 0);
    const balance = rawBalance / 10 ** decimals;
    const priceUsd = Number(item?.price?.prices?.USD || item?.priceUsd || 0);
    return {
      type: "token",
      address: item?.jetton?.address,
      walletAddress: item?.wallet_address?.address || item?.wallet_address,
      name: item?.jetton?.name || "Unknown Jetton",
      symbol: item?.jetton?.symbol || "JETTON",
      image: item?.jetton?.image || null,
      decimals,
      balanceRaw: item?.balance || "0",
      balance,
      verification: item?.jetton?.verification || "none",
      priceUsd,
      valueUsd: balance * priceUsd,
      diff24h: item?.price?.diff_24h?.USD || "0.00%",
    };
  });
}

function normalizeTonCenterJettons(payload = {}) {
  return (payload?.jetton_wallets || []).map((item) => {
    const metadata = item?.metadata || (typeof item?.jetton === "object" ? item.jetton : {}) || {};
    const decimals = Number(metadata?.decimals || item?.decimals || 9);
    const rawBalance = Number(item?.balance || 0);
    const address = metadata?.address
      || item?.jetton_address
      || (typeof item?.jetton === "string" ? item.jetton : item?.jetton?.address)
      || "";
    return {
      type: "token",
      address,
      walletAddress: item?.address || item?.wallet_address || "",
      name: metadata?.name || item?.symbol || "Unknown Jetton",
      symbol: metadata?.symbol || item?.symbol || "JETTON",
      image: metadata?.image || metadata?.image_url || metadata?.logo || null,
      decimals,
      balanceRaw: String(item?.balance || "0"),
      balance: rawBalance / 10 ** decimals,
      verification: metadata?.verification || "none",
      priceUsd: 0,
      valueUsd: 0,
    };
  }).filter((item) => item.address && item.balance > 0);
}

function mergeJettonInventories(primary = [], secondary = []) {
  const merged = new Map();
  const usableName = (value) => value && !/^unknown jetton$/i.test(String(value));
  const usableSymbol = (value) => value && !/^jetton$/i.test(String(value));
  [...primary, ...secondary].forEach((item) => {
    const key = canonicalAddressKey(item?.address || item?.walletAddress || "");
    if (!key) return;
    if (!merged.has(key)) {
      merged.set(key, { ...item });
      return;
    }
    const current = merged.get(key);
    merged.set(key, {
      ...current,
      ...item,
      address: current.address || item.address,
      walletAddress: current.walletAddress || item.walletAddress,
      name: usableName(item.name) ? item.name : current.name,
      symbol: usableSymbol(item.symbol) ? item.symbol : current.symbol,
      image: item.image || current.image,
      decimals: Number.isFinite(Number(item.decimals)) ? Number(item.decimals) : current.decimals,
      balanceRaw: Number(item.balanceRaw || 0) > Number(current.balanceRaw || 0) ? item.balanceRaw : current.balanceRaw,
      balance: Math.max(Number(current.balance || 0), Number(item.balance || 0)),
      verification: current.verification !== "none" ? current.verification : item.verification,
    });
  });
  return [...merged.values()];
}

function dedupeJettons(jettons = []) {
  const merged = new Map();
  const usableName = (value) => value && !/^unknown jetton$/i.test(String(value));
  const usableSymbol = (value) => value && !/^jetton$/i.test(String(value));
  jettons.forEach((item) => {
    const key = canonicalAddressKey(item?.address || item?.walletAddress || "");
    if (!key) return;
    const current = merged.get(key);
    if (!current) {
      merged.set(key, { ...item });
      return;
    }
    const itemValue = Number(item.valueUsd || 0);
    const currentValue = Number(current.valueUsd || 0);
    const itemPrice = Number(item.priceUsd || 0);
    const currentPrice = Number(current.priceUsd || 0);
    merged.set(key, {
      ...current,
      ...item,
      address: current.address || item.address,
      walletAddress: current.walletAddress || item.walletAddress,
      name: usableName(current.name) ? current.name : item.name,
      symbol: usableSymbol(current.symbol) ? current.symbol : item.symbol,
      image: current.image || item.image,
      decimals: Number.isFinite(Number(current.decimals)) ? Number(current.decimals) : item.decimals,
      balanceRaw: Number(item.balanceRaw || 0) > Number(current.balanceRaw || 0) ? item.balanceRaw : current.balanceRaw,
      balance: Math.max(Number(current.balance || 0), Number(item.balance || 0)),
      verification: current.verification !== "none" ? current.verification : item.verification,
      priceUsd: currentPrice > 0 ? currentPrice : itemPrice,
      valueUsd: currentValue > 0 ? currentValue : itemValue,
      diff24h: currentPrice > 0 ? current.diff24h : item.diff24h,
    });
  });
  return [...merged.values()];
}

function isGenericJettonMetadata(jetton = {}) {
  return /^unknown jetton$/i.test(String(jetton.name || "").trim()) || /^jetton$/i.test(String(jetton.symbol || "").trim());
}

function isTrustedJettonVerification(jetton = {}) {
  return String(jetton.verification || "").toLowerCase() === "whitelist";
}

function isPlausibleJettonPrice(jetton = {}, candidatePrice = 0) {
  const providerPrice = Number(jetton.providerPriceUsd || 0);
  const candidate = Number(candidatePrice || 0);
  if (!(providerPrice > 0 && candidate > 0)) return true;
  const ratio = candidate / providerPrice;
  return ratio >= 0.2 && ratio <= 5;
}

function setJettonBlocked(jetton, reason, warning) {
  jetton.priceUsd = 0;
  jetton.valueUsd = 0;
  jetton.diff24h = "0.00%";
  jetton.qualityStatus = "blocked";
  jetton.qualityReason = reason;
  if (warning) jetton.rateWarning = warning;
}

function applyJettonQualityRegistry(jettons = [], dexPricedKeys = new Set()) {
  jettons.forEach((jetton) => {
    const trustedByApi = isTrustedJettonVerification(jetton);
    const verification = String(jetton?.verification || "").toLowerCase();
    const change = parseFloat(String(jetton.diff24h || "0").replace("%", ""));
    const hasDexPrice = dexPricedKeys.has(jettonAddressKey(jetton.address));
    const dexLiquidityUsd = Number(jetton.dexLiquidityUsd || 0);
    const dexVolume24hUsd = Number(jetton.dexVolume24hUsd || 0);
    const dexTxCount = Number(jetton.dexTxCount24h || 0);
    const valueUsd = Number(jetton.valueUsd || 0);

    jetton.qualityStatus = "allowed";
    jetton.qualityReason = "";

    if (verification === "blacklist") {
      setJettonBlocked(jetton, "blacklisted", "Ignored blacklisted jetton");
      return;
    }
    if (isGenericJettonMetadata(jetton)) {
      setJettonBlocked(jetton, "generic-metadata", "Ignored placeholder jetton metadata");
      return;
    }
    if (!trustedByApi && !hasDexPrice && valueUsd > JETTON_QUALITY_RULES.largeValueUsd && Math.abs(Number.isFinite(change) ? change : 0) < 0.01) {
      setJettonBlocked(jetton, "unconfirmed-tonapi-price", "Ignored unverified TonAPI-only price without DEX market confirmation");
      return;
    }
    if (!trustedByApi && hasDexPrice && valueUsd > JETTON_QUALITY_RULES.largeValueUsd && dexVolume24hUsd < JETTON_QUALITY_RULES.minStaleDexVolumeUsd && dexTxCount < JETTON_QUALITY_RULES.minStaleDexTxCount24h && !Number.isFinite(change)) {
      setJettonBlocked(jetton, "stale-dex-price", "Ignored stale unverified DEX price with negligible 24h activity");
      return;
    }
    if (!trustedByApi && hasDexPrice && valueUsd > JETTON_QUALITY_RULES.hugeValueUsd && (
      dexLiquidityUsd < JETTON_QUALITY_RULES.minHugeDexLiquidityUsd
      || dexVolume24hUsd < JETTON_QUALITY_RULES.minHugeDexVolumeUsd
      || dexTxCount < JETTON_QUALITY_RULES.minHugeDexTxCount24h
    )) {
      setJettonBlocked(jetton, "weak-dex-market", "Ignored oversized unverified DEX price with weak liquidity or trade count");
      return;
    }
    if (hasDexPrice) jetton.priceSource = "dexscreener";
    else if (Number(jetton.priceUsd || 0) > 0) jetton.priceSource = "tonapi";
    else jetton.priceSource = "none";
    if (!jetton.qualityReason) jetton.qualityReason = trustedByApi ? "verified" : hasDexPrice ? "unverified-but-market-backed" : "unpriced";
  });
  return jettons;
}

function nftCategory(item) {
  const name = String(item?.metadata?.name || "");
  const collection = String(item?.collection?.name || "");
  const description = String(item?.metadata?.description || item?.collection?.description || "");
  const image = String(item?.metadata?.image || item?.previews?.[0]?.url || "");
  const text = `${name} ${collection} ${description}`;
  const lower = text.toLowerCase();
  const listed = (list, value) => (list || []).some((entry) => String(entry).toLowerCase() === String(value).toLowerCase());
  const contains = (list) => (list || []).some((entry) => lower.includes(String(entry).toLowerCase()));
  if (listed(collectiblesRegistry.denyCollections, collection) || contains(collectiblesRegistry.denyNamePatterns)) return "nft";
  if (listed(collectiblesRegistry.stickerCollections, collection)) return "sticker";
  if ((collectiblesRegistry.stickerImageHosts || []).some((host) => image.includes(host))) return "sticker";
  const traitNames = (item?.metadata?.attributes || []).map((attr) => String(attr.trait_type || attr.type || attr.label || "").toLowerCase());
  const hasGiftTraitSet = (collectiblesRegistry.giftTraitSets || []).some((set) => set.every((trait) => traitNames.includes(trait)));
  if (listed(collectiblesRegistry.giftCollections, collection) || hasGiftTraitSet) return "gift";
  return "nft";
}

function normalizeImageUrl(url = "") {
  const value = String(url || "").trim();
  if (!value) return "";
  if (value.startsWith("ipfs://")) return `https://ipfs.io/ipfs/${value.slice(7)}`;
  return value
    .replace(/\/preview\/(\d+)x(\d+)\//i, "/")
    .replace(/([?&])size=\d+/i, "$1size=512")
    .replace(/([?&])w=\d+/i, "$1w=512")
    .replace(/([?&])h=\d+/i, "$1h=512");
}

function bestNftImage(item = {}) {
  const previews = Array.isArray(item?.previews) ? item.previews : [];
  const largePreview = previews.find((preview) => Number(preview.resolution || preview.width || 0) >= 500);
  return normalizeImageUrl(
    item?.metadata?.image ||
    item?.metadata?.image_url ||
    item?.content?.uri ||
    largePreview?.url ||
    previews.at(-1)?.url ||
    previews[0]?.url ||
    ""
  );
}

function normalizeMediaUrl(url = "") {
  return normalizeImageUrl(url);
}

function bestNftAnimatedMedia(item = {}) {
  const candidates = [
    item?.metadata?.animation_url,
    item?.metadata?.animation,
    item?.metadata?.video,
    item?.metadata?.video_url,
    item?.metadata?.lottie,
    item?.metadata?.animated_url,
    item?.content?.animation_url,
    item?.content?.video_url,
    item?.raw?.animation_url,
  ].map(normalizeMediaUrl).filter(Boolean);
  return candidates.find((url) => /\.(webm|mp4|mov|gif|webp)(?:[?#].*)?$/i.test(url)) || candidates[0] || "";
}

function mediaKind(url = "") {
  if (/\.(?:lottie\.)?json(?:[?#].*)?$/i.test(String(url))) return "lottie";
  if (/\.(webm|mp4|mov)(?:[?#].*)?$/i.test(String(url))) return "video";
  if (url) return "image";
  return "";
}

function normalizeNfts(payload) {
  return (payload?.nft_items || []).map((item) => {
    const collection = item?.collection?.name || "Unknown collection";
    const name = item?.metadata?.name || collection || "Telegram Collectible";
    const type = nftCategory(item);
    const floorTon = 0;
    const animatedMedia = bestNftAnimatedMedia(item);
    return {
      type,
      name,
      collection,
      collectionAddress: item?.collection?.address || "",
      tokenAddress: item?.address || "",
      address: item?.address,
      image: bestNftImage(item),
      animatedImage: animatedMedia,
      animationUrl: animatedMedia,
      mediaType: mediaKind(animatedMedia),
      owner: item?.owner?.address || null,
      verified: Boolean(item?.approved_by?.length || item?.verified),
      description: item?.metadata?.description || item?.collection?.description || "",
      floorTon,
      floorUsd: 0,
      lastSaleTon: 0,
      attributes: item?.metadata?.attributes || [],
      mintIndex: item?.index || 0,
      listed: false,
      raw: item,
    };
  });
}

async function fetchWalletNfts(address) {
  try {
    const classified = await walletNftsByType(address);
    return [...classified.gifts, ...classified.stickers];
  } catch (error) {
    console.warn("Wallet NFTs unavailable", error.message);
    return [];
  }
}

function normalizeEvents(payload) {
  return (payload?.events || [])
    .map((event) => ({
    id: event.event_id,
    timestamp: event.timestamp,
    date: event.timestamp ? new Date(event.timestamp * 1000).toISOString() : null,
    actions: (event.actions || []).map((action) => ({
      type: action.type,
      status: action.status,
      simplePreview: action.simple_preview || null,
    })),
  }))
    .filter((event) => event.actions.some((action) => {
      const preview = action.simplePreview || {};
      const text = `${action.type || ""} ${preview.name || ""} ${preview.value || ""} ${preview.description || ""}`.toLowerCase();
      if (!/(tontransfer|jettontransfer|jettonswap|ton|jetton|token|swap)/i.test(text)) return false;
      if (/nft|gift|sticker/i.test(text)) return false;
      if (String(preview.value || "").includes("<")) return false;
      const tonMatch = String(preview.value || "").match(/[-+]?\d+(?:\.\d+)?\s*TON/i);
      if (!tonMatch) return true;
      return Math.abs(Number.parseFloat(tonMatch[0])) > 0;
    }))
    .slice(0, 15);
}

async function tokenMetadataMap(addresses) {
  const unique = [...new Set(addresses.filter(Boolean))];
  if (!unique.length) return new Map();
  const map = new Map(await stonAssetMap());
  const batchSize = 20;
  for (let index = 0; index < unique.length; index += batchSize) {
    const batch = unique.slice(index, index + batchSize);
    try {
      const payload = await tonCenter(`/metadata?${batch.map((address) => `address=${encodeURIComponent(address)}`).join("&")}`);
      Object.entries(payload || {}).forEach(([address, item]) => {
        const info = item?.token_info?.[0] || {};
        map.set(jettonAddressKey(address), {
          symbol: map.get(jettonAddressKey(address))?.symbol || info.symbol || "JETTON",
          decimals: Number(info.extra?.decimals || info.decimals || 9),
          name: map.get(jettonAddressKey(address))?.name || info.name || info.symbol || "Jetton",
          image: map.get(jettonAddressKey(address))?.image || info.image || info.extra?._image_medium || info.extra?._image_small || "",
        });
      });
    } catch (error) {
      console.warn(`TonCenter metadata unavailable: ${error.message}`);
    }
  }
  return map;
}

function formatTokenAmount(raw, decimals = 9) {
  const amount = Number(raw || 0) / 10 ** (Number(decimals) || 0);
  if (!Number.isFinite(amount)) return "0";
  return amount.toLocaleString(undefined, { maximumFractionDigits: amount >= 10 ? 2 : 4 });
}

function actionTonUsd(valueText, tonUsdRate) {
  const match = String(valueText || "").match(/([-+]?\d+(?:\.\d+)?)\s*TON/i);
  if (!match) return "";
  const usd = Math.abs(Number.parseFloat(match[1])) * tonUsdRate;
  return Number.isFinite(usd) ? `≈ $${usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "";
}

function actionCounterparty(type, details, direction, walletRaw) {
  if (/swap/i.test(type)) return details.dex_outgoing_transfer?.source || details.dex_incoming_transfer?.destination || details.sender || "";
  if (direction === "Sent") return details.destination || details.receiver || "";
  if (direction === "Received") return details.source || details.sender || "";
  return details.source || details.sender || details.destination || details.receiver || "";
}

function actionDirection(type, details, walletRaw) {
  if (/swap/i.test(type)) return "Swap";
  const source = jettonAddressKey(details.source || details.sender);
  const destination = jettonAddressKey(details.destination || details.receiver);
  if (source === walletRaw) return "Sent";
  if (destination === walletRaw) return "Received";
  return "Received";
}

function collectActionAssets(actions) {
  const assets = [];
  actions.forEach((action) => {
    const details = action.details || {};
    if (details.asset) assets.push(details.asset);
    if (details.asset_in) assets.push(details.asset_in);
    if (details.asset_out) assets.push(details.asset_out);
    if (details.dex_incoming_transfer?.asset) assets.push(details.dex_incoming_transfer.asset);
    if (details.dex_outgoing_transfer?.asset) assets.push(details.dex_outgoing_transfer.asset);
  });
  return assets;
}

function signedAmountDisplay(value, direction) {
  if (direction === "Swap") return value || "0 TON";
  if (!value) return "0 TON";
  if (/^[+\-−]/.test(value)) return value;
  return `${direction === "Sent" ? "−" : "+"}${value}`;
}

function tokenLogo(symbol = "TON", image = "") {
  return { symbol: String(symbol || "TOK").slice(0, 8), image: image || "" };
}

async function resolveTonName(address) {
  const friendly = friendlyTonAddress(address);
  if (!friendly) return "";
  const key = friendly.toLowerCase();
  if (dnsNameCache.has(key)) return dnsNameCache.get(key);
  try {
    const payload = await tonApi(`/accounts/${encodeURIComponent(friendly)}`);
    const name = payload?.name || payload?.dns || "";
    dnsNameCache.set(key, name && name.endsWith(".ton") ? name : "");
  } catch {
    dnsNameCache.set(key, "");
  }
  return dnsNameCache.get(key);
}

async function normalizeTonCenterActions(actions, walletAddress, tonUsdRate = usdTonRate) {
  const walletRaw = rawTonAddress(walletAddress);
  const metadata = await tokenMetadataMap(collectActionAssets(actions));
  const tonLogo = nativeTonLogo;
  const normalized = actions
    .filter((action) => /^(ton_transfer|jetton_transfer|jetton_swap)$/i.test(action.type || ""))
    .map((action) => {
      const type = String(action.type || "");
      const details = action.details || {};
      const direction = actionDirection(type, details, walletRaw);
      const sender = details.source || details.sender || details.dex_incoming_transfer?.source || "";
      const recipient = details.destination || details.receiver || details.dex_outgoing_transfer?.destination || "";
      const counterparty = actionCounterparty(type, details, direction, walletRaw);
      let name = "Ton Transfer";
      let value = "";
      let logos = [tokenLogo("TON", tonLogo)];
      if (type === "ton_transfer") {
        const ton = Number(details.value || 0) / 1e9;
        if (ton <= 0) return null;
        value = `${ton.toLocaleString(undefined, { maximumFractionDigits: ton >= 10 ? 2 : 4 })} TON`;
      } else if (type === "jetton_transfer") {
        const meta = metadata.get(jettonAddressKey(details.asset)) || {};
        name = `${meta.symbol || "Jetton"} Transfer`;
        value = `${formatTokenAmount(details.amount, meta.decimals)} ${meta.symbol || "JETTON"}`;
        logos = [tokenLogo(meta.symbol || "JET", meta.image)];
      } else if (type === "jetton_swap") {
        name = "Swap Tokens";
        const incoming = details.dex_incoming_transfer || {};
        const outgoing = details.dex_outgoing_transfer || {};
        const inMeta = incoming.asset ? (metadata.get(jettonAddressKey(incoming.asset)) || {}) : { symbol: "TON", decimals: 9 };
        const outMeta = outgoing.asset ? (metadata.get(jettonAddressKey(outgoing.asset)) || {}) : { symbol: "TON", decimals: 9 };
        value = `${formatTokenAmount(incoming.amount, inMeta.decimals)} ${inMeta.symbol || "JETTON"} → ${formatTokenAmount(outgoing.amount, outMeta.decimals)} ${outMeta.symbol || "TON"}`;
      }
      if (type === "jetton_swap") {
        const incoming = details.dex_incoming_transfer || {};
        const outgoing = details.dex_outgoing_transfer || {};
        const inMeta = incoming.asset ? (metadata.get(jettonAddressKey(incoming.asset)) || {}) : { symbol: "TON", decimals: 9, image: tonLogo };
        const outMeta = outgoing.asset ? (metadata.get(jettonAddressKey(outgoing.asset)) || {}) : { symbol: "TON", decimals: 9, image: tonLogo };
        logos = [tokenLogo(inMeta.symbol || "JET", inMeta.image), tokenLogo(outMeta.symbol || "TON", outMeta.image || tonLogo)];
      }
      if (String(value).includes("<")) return null;
      txActionCache.set(String(action.trace_id || action.action_id), {
        hash: action.trace_id || action.action_id,
        type: direction,
        description: name,
        amount: signedAmountDisplay(value, direction),
        usdValue: actionTonUsd(value, tonUsdRate) || "n/a",
        sender: friendlyTonAddress(sender || walletAddress),
        recipient: friendlyTonAddress(recipient || counterparty || walletAddress),
        feeRecipient: friendlyTonAddress(counterparty || recipient || sender || walletAddress),
        assetLogos: logos,
        timestamp: (action.end_utime || action.trace_end_utime || action.start_utime) ? new Date((action.end_utime || action.trace_end_utime || action.start_utime) * 1000).toISOString() : new Date().toISOString(),
        status: action.success ? "Success" : "Failed",
      });
      return {
        id: action.action_id,
        timestamp: action.end_utime || action.trace_end_utime || action.start_utime,
        date: (action.end_utime || action.trace_end_utime || action.start_utime) ? new Date((action.end_utime || action.trace_end_utime || action.start_utime) * 1000).toISOString() : null,
        actions: [{
          type,
          status: action.success ? "ok" : "failed",
          simplePreview: {
            name,
            value,
            direction,
            usdValue: actionTonUsd(value, tonUsdRate),
            transactionHash: action.trace_id || action.action_id,
            sender: friendlyTonAddress(sender),
            recipient: friendlyTonAddress(recipient),
            counterparty: friendlyTonAddress(counterparty),
            assetLogos: logos,
            gasFee: "$0.00",
            searchText: [
              type,
              name,
              value,
              direction,
              action.trace_id,
              action.action_id,
              details.source,
              details.destination,
              details.sender,
              details.receiver,
              details.asset,
              details.asset_in,
              details.asset_out,
            ].filter(Boolean).join(" "),
          },
        }],
      };
    })
    .filter(Boolean);
  const addresses = [...new Set(normalized.flatMap((event) => {
    const preview = event.actions?.[0]?.simplePreview || {};
    return [preview.sender, preview.recipient].filter(Boolean);
  }))].slice(0, 40);
  const names = new Map(await Promise.all(addresses.map(async (address) => [address, await resolveTonName(address)])));
  normalized.forEach((event) => {
    const preview = event.actions?.[0]?.simplePreview;
    if (!preview) return;
    preview.senderName = names.get(preview.sender) || "";
    preview.recipientName = names.get(preview.recipient) || "";
  });
  return normalized;
}

async function walletActivity(address, limit = 1000) {
  address = parseTonAddress(address);
  const payload = await tonCenter(`/actions?account=${encodeURIComponent(address)}&limit=${Math.max(1, Math.min(1000, Number(limit) || 1000))}&sort=desc`);
  const currentTonUsd = await tonUsdRate();
  return {
    source: "toncenter",
    address,
    activity: await normalizeTonCenterActions(payload?.actions || [], address, currentTonUsd),
  };
}

async function transactionDetail(hash) {
  const payload = await tonCenter(`/transactions?hash=${encodeURIComponent(hash)}&limit=1`);
  const tx = payload?.transactions?.[0] || null;
  if (!tx) throw new Error("Transaction not found");
  const cached = txActionCache.get(String(hash)) || {};
  const feeTon = `${formatTokenAmount(tx.total_fees || 0, 9)} TON`;
  const feeUsd = actionTonUsd(feeTon, await tonUsdRate()) || "$0.00";
  const sender = cached.sender || friendlyTonAddress(tx.in_msg?.source || tx.account || "");
  const recipient = cached.recipient || friendlyTonAddress(tx.in_msg?.destination || tx.account || "");
  const recipientAddress = cached.feeRecipient || cached.recipient || friendlyTonAddress(tx.in_msg?.destination || tx.account || "");
  const [senderName, recipientName] = await Promise.all([resolveTonName(sender), resolveTonName(recipient)]);
  return {
    hash: tx.hash || hash,
    sender,
    senderName,
    recipient,
    recipientName,
    recipientAddress,
    amount: cached.amount || `${formatTokenAmount(tx.in_msg?.value || 0, 9)} TON`,
    usdValue: cached.usdValue || actionTonUsd(`${formatTokenAmount(tx.in_msg?.value || 0, 9)} TON`, await tonUsdRate()) || "n/a",
    gasFee: `${feeTon} · ${feeUsd}`,
    timestamp: tx.now ? new Date(tx.now * 1000).toISOString() : "",
    status: cached.status || (tx.description?.aborted ? "Failed" : "Success"),
    type: cached.type || "Transaction",
    description: cached.description || "TON Transaction",
    assetLogos: cached.assetLogos || [tokenLogo("TON", nativeTonLogo)],
    tonscanUrl: `https://tonscan.org/tx/${encodeURIComponent(tx.hash || hash)}`,
  };
}

function sameAddress(a, b) {
  return jettonAddressKey(a) === jettonAddressKey(b);
}

function portfolioSummary(account, jettons, nfts, events, tonUsdRate = usdTonRate) {
  const tonValueUsd = account.balanceTon * tonUsdRate;
  const jettonsValueUsd = jettons.reduce((sum, jetton) => sum + (jetton.valueUsd || 0), 0);
  const totalUsd = tonValueUsd + jettonsValueUsd;
  return {
    wallet: account.displayAddress,
    tonBalance: account.balanceTon,
    tonUsdRate,
    tonValueUsd,
    jettonsValueUsd,
    totalUsd,
    tokenCount: jettons.length + 1,
    giftCount: nfts.filter((asset) => asset.type === "gift").length,
    stickerCount: nfts.filter((asset) => asset.type === "sticker").length,
    nftCount: nfts.length,
    recentActivityCount: events.length,
  };
}

async function getRates(tokens, options = {}) {
  const unique = [...new Set(tokens.filter(Boolean))];
  if (!unique.length) return {};
  const chunkSize = 40;
  const chunks = Array.from({ length: Math.ceil(unique.length / chunkSize) }, (_, index) =>
    unique.slice(index * chunkSize, index * chunkSize + chunkSize)
  );
  const responses = await Promise.all(chunks.map(async (chunk) => {
    const payload = await tonApi(`/rates?tokens=${encodeURIComponent(chunk.join(","))}&currencies=USD`, options);
    return payload?.rates || {};
  }));
  return responses.reduce((merged, rates) => Object.assign(merged, rates), {});
}

async function dexScreenerPairsForJettons(addresses = []) {
  const unique = [...new Set((addresses || []).flatMap(tonAddressVariants).filter(Boolean))];
  if (!unique.length) return [];
  const chunks = Array.from({ length: Math.ceil(unique.length / 30) }, (_, index) => unique.slice(index * 30, index * 30 + 30));
  const responses = await Promise.all(chunks.map((chunk) =>
    externalJson(`https://api.dexscreener.com/tokens/v1/ton/${chunk.map(encodeURIComponent).join(",")}`, 5000).catch(() => [])
  ));
  return responses.flatMap((payload) => Array.isArray(payload) ? payload : payload?.pairs || []);
}

async function enrichJettonRates(jettons, includeZeroBalances = false, options = {}) {
  const priced = jettons.filter((jetton) => (includeZeroBalances || jetton.balance > 0) && jetton.address);
  if (!priced.length) return jettons;
  try {
    const rates = await getRates(priced.map((jetton) => jetton.address), options);
    const ratesByKey = new Map(Object.entries(rates || {}).map(([address, rate]) => [jettonAddressKey(address), rate]));
    jettons.forEach((jetton) => {
      const rate = rates?.[jetton.address] || ratesByKey.get(jettonAddressKey(jetton.address)) || null;
      const price = Number(rate?.prices?.USD || 0);
      if (price > 0 && isPlausibleJettonPrice(jetton, price)) {
        jetton.priceUsd = price;
        jetton.valueUsd = jetton.balance * price;
      } else if (Number(jetton.priceUsd || 0) > 0) {
        jetton.valueUsd = jetton.balance * Number(jetton.priceUsd || 0);
      }
      jetton.diff24h = rate?.diff_24h?.USD || jetton.diff24h || "0.00%";
    });
  } catch (error) {
    jettons.forEach((jetton) => {
      jetton.rateWarning = error.message;
    });
  }
  const dexPricedKeys = new Set();
  try {
    const pairs = await dexScreenerPairsForJettons(priced.map((jetton) => jetton.address));
    priced.forEach((jetton) => {
      const pair = bestDexPair(pairs, jetton.address);
      const price = Number(pair?.priceUsd || 0);
      if (!(price > 0) || !isPlausibleJettonPrice(jetton, price)) return;
      const liquidityUsd = Number(pair?.liquidity?.usd || 0);
      const volume24hUsd = Number(pair?.volume?.h24 || 0);
      const txCount24h = dexTxCount24h(pair);
      const change = Number(pair?.priceChange?.h24);
      const impliedValueUsd = Number(jetton.balance || 0) * price;
      jetton.dexLiquidityUsd = liquidityUsd;
      jetton.dexVolume24hUsd = volume24hUsd;
      jetton.dexTxCount24h = txCount24h;
      const trustedByApi = String(jetton.verification || "").toLowerCase() === "whitelist";
      if (!trustedByApi && liquidityUsd < JETTON_QUALITY_RULES.minUnverifiedDexLiquidityUsd) return;
      jetton.priceUsd = price;
      jetton.valueUsd = impliedValueUsd;
      dexPricedKeys.add(jettonAddressKey(jetton.address));
      if (Number.isFinite(change)) jetton.diff24h = `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`;
    });
  } catch (error) {
    priced.forEach((jetton) => {
      jetton.rateWarning = jetton.rateWarning || error.message;
    });
  }
  const unresolved = priced.filter((jetton) => !(Number(jetton.priceUsd || 0) > 0));
  if (unresolved.length) {
    try {
      const pairs = await dexScreenerPairsForJettons(unresolved.map((jetton) => jetton.address));
      unresolved.forEach((jetton) => {
        const pair = bestDexPair(pairs, jetton.address);
        const price = Number(pair?.priceUsd || 0);
        if (!(price > 0) || !isPlausibleJettonPrice(jetton, price)) return;
        const liquidityUsd = Number(pair?.liquidity?.usd || 0);
        const volume24hUsd = Number(pair?.volume?.h24 || 0);
        const txCount24h = dexTxCount24h(pair);
        const change = Number(pair?.priceChange?.h24);
        const impliedValueUsd = Number(jetton.balance || 0) * price;
        jetton.dexLiquidityUsd = liquidityUsd;
        jetton.dexVolume24hUsd = volume24hUsd;
        jetton.dexTxCount24h = txCount24h;
        const trustedByApi = String(jetton.verification || "").toLowerCase() === "whitelist";
        if (!trustedByApi && liquidityUsd < JETTON_QUALITY_RULES.minUnverifiedDexLiquidityUsd) return;
        jetton.priceUsd = price;
        jetton.valueUsd = impliedValueUsd;
        dexPricedKeys.add(jettonAddressKey(jetton.address));
        if (Number.isFinite(change)) jetton.diff24h = `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`;
      });
    } catch (error) {
      unresolved.forEach((jetton) => {
        jetton.rateWarning = jetton.rateWarning || error.message;
      });
    }
  }
  return applyJettonQualityRegistry(jettons, dexPricedKeys);
}

function historyJettonsFromOperations(currentJettons, operations) {
  const byAddress = new Map();
  currentJettons.forEach((jetton) => {
    if (!jetton.address) return;
    byAddress.set(jetton.address, { ...jetton });
  });
  operations.forEach((operation) => {
    const jetton = operation?.jetton;
    if (!jetton?.address || byAddress.has(jetton.address)) return;
    byAddress.set(jetton.address, {
      type: "token",
      address: jetton.address,
      walletAddress: null,
      name: jetton.name || "Unknown Jetton",
      symbol: jetton.symbol || "JETTON",
      image: jetton.image || null,
      decimals: Number(jetton.decimals || 9),
      balanceRaw: "0",
      balance: 0,
      verification: jetton.verification || "none",
      priceUsd: 0,
      valueUsd: 0,
    });
  });
  return [...byAddress.values()];
}

async function fetchJettonHistory(address, since = null) {
  const sinceUnix = since instanceof Date ? unix(since) : 0;
  const cacheKey = `${canonicalAddressKey(address)}:${sinceUnix}`;
  const cached = jettonHistoryCache.get(cacheKey);
  if (cached?.operations && cached.expiresAt > Date.now()) return cached.operations;
  if (cached?.promise) return cached.promise;
  const operations = [];
  const promise = (async () => {
    let beforeLt = "";
    try {
      for (let page = 0; page < 20; page += 1) {
        const suffix = beforeLt ? `&before_lt=${encodeURIComponent(beforeLt)}` : "";
        const payload = await tonApi(`/accounts/${encodeURIComponent(address)}/jettons/history?limit=1000${suffix}`);
        const batch = payload?.operations || [];
        operations.push(...batch);
        const oldest = Number(batch.at(-1)?.utime || 0);
        const nextLt = batch.at(-1)?.lt;
        if (sinceUnix && oldest && oldest < sinceUnix) break;
        if (batch.length < 1000 || !nextLt || String(nextLt) === beforeLt) break;
        beforeLt = String(nextLt);
        await sleep(120);
      }
    } catch (error) {
      console.warn(`Jetton history pagination stopped at ${operations.length} operations: ${error.message}`);
    }
    const filtered = sinceUnix ? operations.filter((operation) => Number(operation?.utime || 0) >= sinceUnix) : operations;
    jettonHistoryCache.set(cacheKey, { operations: filtered, expiresAt: Date.now() + jettonHistoryTtl });
    return filtered;
  })().catch((error) => {
    jettonHistoryCache.delete(cacheKey);
    throw error;
  });
  jettonHistoryCache.set(cacheKey, { promise, expiresAt: Date.now() + jettonHistoryTtl });
  return promise;
}

function jettonBalanceAtDate(jetton, date, walletAddress, operations) {
  const target = Math.floor(date.getTime() / 1000);
  const matchingOperations = operations
    .filter((operation) => sameAddress(operation?.jetton?.address, jetton.address))
    .sort((a, b) => Number(a.utime || 0) - Number(b.utime || 0));
  const hasIncomingHistory = matchingOperations.some((operation) => sameAddress(operation.destination?.address, walletAddress));

  if (Number(jetton.balance || 0) === 0 && hasIncomingHistory) {
    let rebuiltBalance = 0;
    matchingOperations.forEach((operation) => {
      if (operation.utime > target) return;
      const amount = Number(operation.amount || 0) / 10 ** Number(jetton.decimals || operation?.jetton?.decimals || 9);
      if (sameAddress(operation.destination?.address, walletAddress)) rebuiltBalance += amount;
      if (sameAddress(operation.source?.address, walletAddress)) rebuiltBalance -= amount;
    });
    return Math.max(0, rebuiltBalance);
  }

  let balance = Number(jetton.balance || 0);
  matchingOperations.forEach((operation) => {
    if (operation.utime <= target) return;
    const amount = Number(operation.amount || 0) / 10 ** Number(jetton.decimals || operation?.jetton?.decimals || 9);
    if (sameAddress(operation.destination?.address, walletAddress)) balance -= amount;
    if (sameAddress(operation.source?.address, walletAddress)) balance += amount;
  });
  return Math.max(0, balance);
}

async function tonUsdRate() {
  if (tonUsdRateCache.expiresAt > Date.now()) return tonUsdRateCache.value;
  if (tonUsdRateCache.promise) return tonUsdRateCache.promise;
  tonUsdRateCache.promise = (async () => {
    try {
      const gecko = await geckoFetch("/simple/price?ids=the-open-network&vs_currencies=usd", 3500);
      const value = Number(gecko?.["the-open-network"]?.usd);
      if (!(value > 0)) throw new Error("CoinGecko TON rate missing");
      tonUsdRateCache = { value, expiresAt: Date.now() + 45 * 1000, promise: null };
      return value;
    } catch (geckoError) {
      try {
        let timeoutId;
        const rates = await Promise.race([
          getRates(["TON"], { immediate: true }),
          new Promise((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error("TonAPI TON rate timed out")), 1500);
          }),
        ]);
        clearTimeout(timeoutId);
        const value = Number(rates?.TON?.prices?.USD || 0);
        if (!(value > 0)) throw new Error("TonAPI TON rate missing");
        tonUsdRateCache = { value, expiresAt: Date.now() + 45 * 1000, promise: null };
        return value;
      } catch {
        console.warn(`TON/USD live rate failed: ${geckoError.message}`);
        tonUsdRateCache = { value: tonUsdRateCache.value || usdTonRate, expiresAt: Date.now() + 10 * 1000, promise: null };
        return tonUsdRateCache.value || usdTonRate;
      }
    }
  })();
  return tonUsdRateCache.promise;
}

async function getRateChart(token, start, end) {
  const key = `${token}:${unixHour(start)}:${unixHour(end)}`;
  if (chartCache.has(key)) return chartCache.get(key);
  const geckoId = token === "TON" ? "the-open-network" : await resolveGeckoId(token);
  if (geckoId) {
    try {
      const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000));
      const payload = await geckoFetch(`/coins/${encodeURIComponent(geckoId)}/market_chart?vs_currency=usd&days=${days}`);
      const points = (payload?.prices || [])
        .map(([timestamp, price]) => ({ timestamp: Number(timestamp), price: Number(price) }))
        .filter((point) => point.timestamp >= start.getTime() && Number.isFinite(point.timestamp) && Number.isFinite(point.price))
        .sort((a, b) => a.timestamp - b.timestamp);
      chartCache.set(key, points);
      return points;
    } catch (error) {
      console.warn(`CoinGecko chart failed for ${token} (${geckoId}): ${error.message}`);
    }
  }
  try {
    const payload = await tonApi(`/rates/chart?token=${encodeURIComponent(token)}&currency=usd&start_date=${unix(start)}&end_date=${unix(end)}`);
    const points = (payload?.points || [])
      .map(([timestamp, price]) => ({ timestamp: Number(timestamp) * 1000, price: Number(price) }))
      .filter((point) => Number.isFinite(point.timestamp) && Number.isFinite(point.price))
      .sort((a, b) => a.timestamp - b.timestamp);
    chartCache.set(key, points);
  } catch {
    chartCache.set(key, []);
  }
  return chartCache.get(key);
}

function priceAt(chart, date, fallback, maxStalenessMs = Infinity) {
  if (!chart.length) return fallback;
  const target = date.getTime();
  const nearest = chart.reduce((nearestPoint, point) => (
    Math.abs(point.timestamp - target) < Math.abs(nearestPoint.timestamp - target) ? point : nearestPoint
  ), chart[0]);
  if (Math.abs(nearest.timestamp - target) > maxStalenessMs) return fallback;
  return nearest.price || fallback;
}

function nearestPricePoint(chart, date) {
  if (!chart.length) return null;
  const target = date.getTime();
  return chart.reduce((nearest, point) => (
    Math.abs(point.timestamp - target) < Math.abs(nearest.timestamp - target) ? point : nearest
  ), chart[0]);
}

function tokenDetailRangeWindow(range) {
  const end = new Date();
  const start = new Date(end);
  if (range === "week" || range === "7d") start.setDate(end.getDate() - 14);
  else if (range === "month" || range === "30d") start.setDate(end.getDate() - 30);
  else if (range === "year") start.setFullYear(end.getFullYear() - 1);
  else if (range === "all") start.setFullYear(end.getFullYear() - 3);
  else start.setDate(end.getDate() - 1);
  return { start, end };
}

function mapChartPayload(payload) {
  const candidates = Array.isArray(payload) ? payload : payload?.prices || payload?.points || payload?.data || payload?.items || payload?.chart || [];
  if (!Array.isArray(candidates)) return [];
  return candidates.map((item) => {
    if (Array.isArray(item)) return { timestamp: Number(item[0]) > 1e12 ? Number(item[0]) : Number(item[0]) * 1000, price: Number(item[1]) };
    const timestamp = Number(item.timestamp ?? item.time ?? item.t ?? item.date);
    const price = Number(item.price ?? item.value ?? item.close ?? item.c);
    return { timestamp: timestamp > 1e12 ? timestamp : timestamp * 1000, price };
  }).filter((point) => Number.isFinite(point.timestamp) && Number.isFinite(point.price) && point.price > 0)
    .sort((a, b) => a.timestamp - b.timestamp);
}

function assetKey(address) {
  if (!address) return "";
  try { return Address.parse(address).toRawString().toLowerCase(); } catch { return String(address).toLowerCase(); }
}

function poolHasAddress(pool, address) {
  const haystack = JSON.stringify(pool).toLowerCase();
  return tonAddressVariants(address).some((variant) => {
    const direct = String(variant || "").toLowerCase();
    const key = assetKey(variant);
    return (direct && haystack.includes(direct)) || (key && haystack.includes(key));
  });
}

function numberFromPaths(object, paths) {
  for (const pathName of paths) {
    const value = Number(pathName.split(".").reduce((item, key) => item?.[key], object));
    if (Number.isFinite(value) && value > 0) return value;
  }
  return 0;
}

function bestPool(pools, address) {
  return (Array.isArray(pools) ? pools : [])
    .filter((pool) => poolHasAddress(pool, address))
    .sort((a, b) => numberFromPaths(b, ["tvl_usd", "tvl", "liquidity_usd", "reserve_usd"]) - numberFromPaths(a, ["tvl_usd", "tvl", "liquidity_usd", "reserve_usd"]))[0] || null;
}

function numberFromPathsAny(object, paths) {
  for (const pathName of paths) {
    const value = Number(pathName.split(".").reduce((item, key) => item?.[key], object));
    if (Number.isFinite(value)) return value;
  }
  return 0;
}

function bestDexPair(pairs, address) {
  return (Array.isArray(pairs) ? pairs : [])
    .filter((pair) => poolHasAddress(pair, address))
    .sort((a, b) => numberFromPathsAny(b, ["liquidity.usd", "marketCap", "fdv", "volume.h24"]) - numberFromPathsAny(a, ["liquidity.usd", "marketCap", "fdv", "volume.h24"]))[0] || null;
}

function dexTxCount24h(pair = {}) {
  return Number(pair?.txns?.h24?.buys || 0) + Number(pair?.txns?.h24?.sells || 0);
}

function dedustTvlFromPool(pool, tonUsd) {
  if (!pool) return 0;
  const direct = numberFromPaths(pool, ["tvl_usd", "tvl", "liquidity_usd", "reserve_usd"]);
  if (direct) return direct;
  const assets = pool.assets || [];
  const reserves = pool.reserves || [];
  const nativeIndex = assets.findIndex((asset) => asset.type === "native");
  if (nativeIndex < 0) return 0;
  const tonReserve = decimalAmount(reserves[nativeIndex], 9);
  return tonReserve > 0 ? tonReserve * tonUsd * 2 : 0;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseTonStatMetric(html, label) {
  const safeLabel = escapeRegExp(label);
  const match = html.match(new RegExp(`${safeLabel}[\\s\\S]{0,7000}?CardWithChart_number__[A-Za-z0-9_\\-]+">([^<]+)`, "i"));
  return match?.[1]?.replace(/\s+/g, " ").trim() || "";
}

async function tonStatSnapshot() {
  if (tonStatCache && tonStatExpiresAt > Date.now()) return tonStatCache;
  if (tonStatPromise) return tonStatPromise;
  tonStatPromise = (async () => {
    const html = await externalText("https://tonstat.com/", 6500);
    const snapshot = {
      totalSupplyTon: parseTonStatMetric(html, "Total supply, TON"),
      annualInflationPct: parseTonStatMetric(html, "Annual Inflation Rate, %"),
      activeWalletsMonthly: parseTonStatMetric(html, "Active Wallets (monthly)"),
      activeWalletsDaily: parseTonStatMetric(html, "Active Wallets (daily)"),
      activatedWallets: parseTonStatMetric(html, "On-chain activated wallets"),
      txPerDay: parseTonStatMetric(html, "Transactions per day"),
      stakedTon: parseTonStatMetric(html, "Staked, TON"),
    };
    tonStatCache = snapshot;
    tonStatExpiresAt = Date.now() + 10 * 60 * 1000;
    tonStatPromise = null;
    return snapshot;
  })().catch((error) => {
    tonStatPromise = null;
    throw error;
  });
  return tonStatPromise;
}

async function chartFromBestSources({ address, symbol, range }) {
  const { start, end } = tokenDetailRangeWindow(range);
  const attempts = [];
  if (address) {
    const tonscanInterval = { day: 1, week: 14, month: 30, year: 365, all: 1000, "7d": 14, "30d": 30, "24h": 1 }[range] || 1;
    attempts.push(`https://jetton-index.tonscan.org/public-dyor/chart/${encodeURIComponent(address)}?interval=${tonscanInterval}`);
    attempts.push(`https://api.dedust.io/v2/assets/${encodeURIComponent(address)}/chart?period=${encodeURIComponent(range)}`);
    attempts.push(`https://api.dedust.io/v2/prices/${encodeURIComponent(address)}/history?period=${encodeURIComponent(range)}`);
    attempts.push(`https://api.ston.fi/v1/assets/${encodeURIComponent(address)}/chart?period=${encodeURIComponent(range)}`);
    attempts.push(`https://api.ston.fi/v1/assets/${encodeURIComponent(address)}/price-history?period=${encodeURIComponent(range)}`);
  }
  for (const url of attempts) {
    try {
      const chart = mapChartPayload(await externalJson(url, 4500));
      if (chart.length > 1) return { source: url.includes("tonscan") ? "tonscan" : url.includes("dedust") ? "dedust" : "stonfi", points: chart };
    } catch {}
  }
  const geckoId = symbol ? KNOWN_SYMBOL_GECKO_IDS[String(symbol).toUpperCase()] : null;
  if (geckoId) {
    try {
      const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000));
      const payload = await geckoFetch(`/coins/${encodeURIComponent(geckoId)}/market_chart?vs_currency=usd&days=${days}`);
      const points = mapChartPayload(payload).filter((point) => point.timestamp >= start.getTime());
      if (points.length > 1) return { source: "coingecko", points };
    } catch {}
  }
  if (address || symbol === "TON") {
    const points = await getRateChart(symbol === "TON" ? "TON" : address, start, end);
    if (points.length > 1) return { source: "tonapi", points };
  }
  return { source: "none", points: [] };
}

async function tokenDetailData(url) {
  const address = url.searchParams.get("address") || "";
  const symbol = url.searchParams.get("symbol") || "";
  const decimals = Number(url.searchParams.get("decimals") || 9);
  const priceUsd = Number(url.searchParams.get("priceUsd") || 0);
  const valueUsd = Number(url.searchParams.get("valueUsd") || 0);
  const range = url.searchParams.get("range") || "24h";
  const cacheKey = `${address}:${symbol}:${decimals}:${priceUsd}:${valueUsd}:${range}`;
  const cached = tokenDetailCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  if (!address && String(symbol).toUpperCase() === "TON") {
    const chart = await chartFromBestSources({ address, symbol, range });
    let geckoMarket = null;
    let tonStat = null;
    try {
      geckoMarket = await geckoFetch("/coins/the-open-network?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false", 4500);
    } catch {}
    try {
      tonStat = await tonStatSnapshot();
    } catch {}
    const marketData = geckoMarket?.market_data || {};
    const data = {
      source: { chart: chart.source, pool: "coingecko", market: "coingecko" },
      chart: chart.points,
      metrics: {
        marketCap: Number(marketData?.market_cap?.usd || 0) || null,
        volume24h: Number(marketData?.total_volume?.usd || 0) || null,
        tvl: null,
        holders: null,
        ath: Number(marketData?.ath?.usd || 0) || (chart.points.length ? Math.max(...chart.points.map((point) => point.price)) : null),
        portfolioShare: null,
        concentration: null,
      },
      tonNetwork: tonStat,
      pressure: null,
    };
    tokenDetailCache.set(cacheKey, { data, expiresAt: Date.now() + 10 * 60 * 1000 });
    return data;
  }
  const chartPromise = chartFromBestSources({ address, symbol, range });
  const masterPromise = address ? tonCenter(`/jetton/masters?address=${encodeURIComponent(address)}&limit=1`).catch(() => ({})) : Promise.resolve({});
  const holdersPromise = address ? tonCenter(`/jetton/wallets?jetton_address=${encodeURIComponent(address)}&sort=desc&limit=1000`).catch(() => ({})) : Promise.resolve({});
  const tonApiInfoPromise = address ? externalJson(`https://tonapi.io/v2/jettons/${encodeURIComponent(address)}`, 4500).catch(() => ({})) : Promise.resolve({});
  const dyorInfoPromise = address ? externalJson(`https://jetton-index.tonscan.org/public-dyor/jettons/${encodeURIComponent(address)}`, 4500).catch(() => ({})) : Promise.resolve({});
  const dexPairsPromise = address ? externalJson(`https://api.dexscreener.com/tokens/v1/ton/${encodeURIComponent(address)}`, 4500).catch(() => []) : Promise.resolve([]);
  const tonUsdPromise = tonUsdRate().catch(() => usdTonRate);
  const [chart, masterPayload, holdersPayload, tonApiInfo, dyorInfo, dexPairsPayload, tonUsd] = await Promise.all([
    chartPromise, masterPromise, holdersPromise, tonApiInfoPromise, dyorInfoPromise, dexPairsPromise, tonUsdPromise,
  ]);
  const dexPairs = Array.isArray(dexPairsPayload) ? dexPairsPayload : dexPairsPayload?.pairs || [];
  const dexPair = bestDexPair(dexPairs, address);
  const master = masterPayload?.jetton_masters?.[0] || {};
  const supply = address ? decimalAmount(master.total_supply || tonApiInfo?.total_supply || master.mintable_total_supply || 0, decimals) : 0;
  const wallets = holdersPayload?.jetton_wallets || [];
  const top10 = wallets.slice(0, 10).reduce((sum, wallet) => sum + decimalAmount(wallet.balance || 0, decimals), 0);
  const concentration = supply > 0 && top10 > 0 ? (top10 / supply) * 100 : null;
  const tvl = numberFromPathsAny(dexPair, ["liquidity.usd"]);
  const volume24h = numberFromPathsAny(dexPair, ["volume.h24"]);
  const buyVolume = 0;
  const sellVolume = 0;
  const ath = chart.points.length ? Math.max(...chart.points.map((point) => point.price)) : 0;
  const dyorDetails = dyorInfo?.details || {};
  const dyorMoney = (field) => {
    const value = dyorDetails?.[field]?.value;
    const fieldDecimals = Number(dyorDetails?.[field]?.decimals || 0);
    return value ? decimalAmount(value, fieldDecimals) : 0;
  };
  const data = {
    source: { chart: chart.source, pool: dexPair ? "dexscreener" : "none", market: dexPair ? "dexscreener" : "none" },
    chart: chart.points,
    metrics: {
      marketCap: dyorMoney("mcap") || dyorMoney("fdmc") || numberFromPathsAny(dexPair, ["marketCap", "fdv"]) || (supply > 0 && priceUsd > 0 ? supply * priceUsd : null),
      volume24h: volume24h || dyorMoney("volumeUsd24h") || dyorMoney("volume24hUsd") || null,
      tvl: tvl || dyorMoney("liquidityUsd") || null,
      holders: Number(dyorDetails.holdersCount || tonApiInfo?.holders_count || tonApiInfo?.holdersCount || master?.holders_count || master?.holdersCount || 0) || (wallets.length ? wallets.length : null),
      ath: ath || null,
      portfolioShare: null,
      concentration,
    },
    pressure: buyVolume || sellVolume ? { buy: buyVolume, sell: sellVolume } : null,
  };
  tokenDetailCache.set(cacheKey, { data, expiresAt: Date.now() + 10 * 60 * 1000 });
  return data;
}

function readSnapshots() {
  try {
    return JSON.parse(fs.readFileSync(snapshotsFile, "utf8"));
  } catch {
    return [];
  }
}

function writeSnapshots(snapshots) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(snapshotsFile, JSON.stringify(snapshots, null, 2));
}

function historyCacheKey(address, range) {
  return `${canonicalAddressKey(address)}:${historyCacheVersion}:${range}`;
}

function historyCachePath(address, range) {
  const safeAddress = canonicalAddressKey(address).replace(/[^a-z0-9_-]/gi, "_");
  return path.join(historyCacheDir, safeAddress, `${historyCacheVersion}-${range}.json`);
}

function readHistoryDiskCache(address, range) {
  try {
    const payload = JSON.parse(fs.readFileSync(historyCachePath(address, range), "utf8"));
    return Array.isArray(payload.points) ? payload.points : [];
  } catch {
    return [];
  }
}

function writeHistoryDiskCache(address, range, points) {
  const filePath = historyCachePath(address, range);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify({
    version: historyCacheVersion,
    address: String(address).toLowerCase(),
    range,
    cachedAt: new Date().toISOString(),
    points,
  }, null, 2));
}

function saveWalletSnapshot(address, summary) {
  const snapshots = readSnapshots();
  const normalizedAddress = canonicalAddressKey(address);
  const snapshot = {
    address: normalizedAddress,
    walletAddress: String(address || ""),
    timestamp: new Date().toISOString(),
    valueUsd: summary.totalUsd,
    tonBalance: summary.tonBalance,
    tonValueUsd: summary.tonValueUsd,
    jettonsValueUsd: summary.jettonsValueUsd,
    tokenCount: summary.tokenCount,
    nftCount: summary.nftCount,
    source: "tonapi-import",
  };
  snapshots.push(snapshot);
  writeSnapshots(snapshots.slice(-5000));
  return snapshot;
}

function rangeStart(range, now = new Date()) {
  const ms = {
    "1D": 24 * 60 * 60 * 1000,
    "7D": 7 * 24 * 60 * 60 * 1000,
    "1M": 30 * 24 * 60 * 60 * 1000,
    "3M": 92 * 24 * 60 * 60 * 1000,
    "1Y": 366 * 24 * 60 * 60 * 1000,
  }[range] || 24 * 60 * 60 * 1000;
  return new Date(now.getTime() - ms);
}

function walletHistory(address, range = "1D") {
  const start = rangeStart(range);
  const normalizedAddress = canonicalAddressKey(address);
  return readSnapshots()
    .filter((item) => item.address === normalizedAddress && new Date(item.timestamp) >= start)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
}

function historySampleDates(range, now = new Date()) {
  return historySampleBuckets(range, now).map((bucket) => bucket[0]).filter(Boolean);
}

function utcHour(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours(), 0, 0, 0));
}

function utcDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
}

function utcMonth(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0));
}

function addUtcHours(date, hours) {
  return new Date(date.getTime() + hours * 3600000);
}

function addUtcDays(date, days) {
  return new Date(date.getTime() + days * 24 * 3600000);
}

function addUtcMonths(date, months) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, date.getUTCDate(), date.getUTCHours(), 0, 0, 0));
}

function dailyCandidateBucket(dayStart, now, stepHours = 6) {
  const dates = [];
  for (let hour = 0; hour < 24; hour += stepHours) {
    const date = addUtcHours(dayStart, hour);
    if (date <= now) dates.push(date);
  }
  if (dayStart <= now && now < addUtcDays(dayStart, 1) && dates.at(-1)?.getTime() !== now.getTime()) dates.push(now);
  return dates;
}

function monthlyCandidateBucket(monthStart, now) {
  const nextMonth = addUtcMonths(monthStart, 1);
  const end = nextMonth < now ? nextMonth : now;
  const dates = [];
  for (let day = new Date(monthStart); day < end; day = addUtcDays(day, 1)) {
    dailyCandidateBucket(day, now, 6).forEach((date) => {
      if (date < end) dates.push(date);
    });
  }
  if (monthStart <= now && now < nextMonth && dates.at(-1)?.getTime() !== now.getTime()) dates.push(now);
  return dates;
}

function intervalCandidateBuckets(start, end, bucketCount, stepHours = 6) {
  const span = Math.max(1, end.getTime() - start.getTime());
  return Array.from({ length: bucketCount }, (_, index) => {
    if (index === bucketCount - 1) return [end];
    const bucketStart = new Date(start.getTime() + (span * index) / (bucketCount - 1));
    const bucketEnd = new Date(start.getTime() + (span * (index + 1)) / (bucketCount - 1));
    const dates = [];
    for (let date = new Date(bucketStart); date < bucketEnd && date <= end; date = addUtcHours(date, stepHours)) {
      dates.push(new Date(date));
    }
    if (!dates.length) dates.push(bucketStart);
    return dates;
  });
}

function mergeCandidatesIntoMonthlyBuckets(buckets, candidates, now) {
  const merged = buckets.map((bucket) => [...bucket]);
  candidates.forEach((date) => {
    if (!(date instanceof Date) || date > now) return;
    const monthStart = utcMonth(date).getTime();
    const bucketIndex = merged.findIndex((bucket) => bucket[0] && utcMonth(bucket[0]).getTime() === monthStart);
    if (bucketIndex >= 0) merged[bucketIndex].push(date);
  });
  return merged.map((bucket) => bucket
    .sort((a, b) => a - b)
    .filter((date, index, allDates) => index === 0 || date.getTime() !== allDates[index - 1].getTime()));
}

function historySampleBuckets(range, now = new Date()) {
  if (range === "1D") {
    return intervalCandidateBuckets(addUtcHours(now, -24), now, 25, 1);
  }
  if (range === "7D") {
    return intervalCandidateBuckets(addUtcHours(now, -168), now, 15, 1);
  }
  if (range === "1M") {
    const today = utcDay(now);
    return Array.from({ length: 31 }, (_, index) => dailyCandidateBucket(addUtcDays(today, -(30 - index)), now, 6));
  }
  if (range === "3M") {
    return intervalCandidateBuckets(utcDay(rangeStart(range, now)), now, 17, 24);
  }
  if (range === "1Y") {
    const thisMonth = utcMonth(now);
    const monthlyBuckets = Array.from({ length: 13 }, (_, index) => monthlyCandidateBucket(addUtcMonths(thisMonth, -(12 - index)), now));
    const shorterRangeCandidates = [
      ...historySampleBuckets("3M", now).flat(),
      ...historySampleBuckets("1M", now).flat(),
      ...historySampleBuckets("7D", now).flat(),
    ];
    return mergeCandidatesIntoMonthlyBuckets(monthlyBuckets, shorterRangeCandidates, now);
  }
  return Array.from({ length: 7 }, (_, index) => [new Date(now.getTime() - (6 - index) * 14 * 24 * 3600000)]);
}

function unix(date) {
  return Math.floor(date.getTime() / 1000);
}

function unixHour(date) {
  return Math.floor(date.getTime() / 3600000) * 3600;
}

async function accountBalanceChange(address, start, end) {
  const key = `${address}:${unix(start)}:${unix(end)}`;
  if (diffCache.has(key)) return diffCache.get(key);
  const payload = await tonApi(`/accounts/${encodeURIComponent(address)}/diff?start_date=${unix(start)}&end_date=${unix(end)}`);
  diffCache.set(key, Number(payload?.balance_change ?? payload?.balanceChange ?? 0));
  return diffCache.get(key);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function accountBalanceChangeWithRetry(address, start, end) {
  try {
    return await accountBalanceChange(address, start, end);
  } catch (error) {
    if (!String(error.message).toLowerCase().includes("rate limit")) throw error;
    await sleep(1800);
    return accountBalanceChange(address, start, end);
  }
}

function currentPortfolioPoint(address, now, currentTonBalance, currentTonUsd, currentJettonValueUsd, jettons = []) {
  const pricedAssetCount = jettons.filter((jetton) => Number(jetton.balance || 0) > 0 && Number(jetton.valueUsd || 0) > 0).length + (currentTonBalance > 0 ? 1 : 0);
  return {
    address: address.toLowerCase(),
    timestamp: now.toISOString(),
    valueUsd: currentTonBalance * currentTonUsd + currentJettonValueUsd,
    tonBalance: currentTonBalance,
    jettonValueUsd: currentJettonValueUsd,
    tonUsdRate: currentTonUsd,
    assetCount: jettons.filter((jetton) => Number(jetton.balance || 0) > 0).length + (currentTonBalance > 0 ? 1 : 0),
    pricedAssetCount,
    source: "current-prices",
  };
}

function firstActivityDateFromOperations(operations) {
  const firstTimestamp = operations.reduce((earliest, operation) => {
    const timestamp = Number(operation?.utime || 0);
    if (!timestamp) return earliest;
    return earliest ? Math.min(earliest, timestamp) : timestamp;
  }, 0);
  return firstTimestamp ? new Date(firstTimestamp * 1000) : null;
}

function trimDatesToWalletActivity(dates, operations, now) {
  const firstActivity = firstActivityDateFromOperations(operations);
  if (!firstActivity) return dates;
  const filtered = dates.filter((date) => date >= firstActivity);
  if (!filtered.length || filtered[filtered.length - 1].getTime() < now.getTime()) filtered.push(now);
  return filtered;
}

function trimBucketsToWalletActivity(buckets, operations, now) {
  const firstActivity = firstActivityDateFromOperations(operations);
  const operationDates = operations
    .map((operation) => Number(operation?.utime || 0))
    .filter(Boolean)
    .map((timestamp) => new Date(timestamp * 1000))
    .filter((date) => date <= now)
    .sort((a, b) => a - b);
  const enriched = buckets.map((bucket, index) => {
    const base = bucket.filter((date) => date <= now).sort((a, b) => a - b);
    if (!base.length) return [];
    const bucketStart = base[0];
    const nextBucketStart = buckets[index + 1]?.[0] || now;
    const bucketEnd = nextBucketStart > bucketStart ? nextBucketStart : now;
    const extras = operationDates.filter((date) => date >= bucketStart && date < bucketEnd);
    return [...base, ...extras]
      .sort((a, b) => a - b)
      .filter((date, dateIndex, allDates) => dateIndex === 0 || date.getTime() !== allDates[dateIndex - 1].getTime());
  });
  if (!firstActivity) return enriched.filter((bucket) => bucket.length);
  const filtered = enriched
    .map((bucket) => bucket.filter((date) => date >= firstActivity && date <= now))
    .filter((bucket) => bucket.length);
  if (!filtered.length) return [[now]];
  const lastBucket = filtered[filtered.length - 1];
  if (lastBucket.at(-1)?.getTime() < now.getTime()) lastBucket.push(now);
  return filtered;
}

function fallbackTonBalanceFromHistoryTimestamps(currentTonBalance, date, operations) {
  const firstActivity = firstActivityDateFromOperations(operations);
  if (firstActivity && date < firstActivity) return 0;
  return currentTonBalance;
}

function canUseAccountDiff(range, date, now, currentTonBalance) {
  if (currentTonBalance <= 0) return false;
  if (["3M", "1Y"].includes(range)) return false;
  return true;
}

function chartStaleness(range) {
  return range === "1D" ? 6 * 3600000 : 48 * 3600000;
}

async function tonBalanceAtDate({ address, date, now, range, currentNano, currentTonBalance, jettonOperations }) {
  let tonBalance = fallbackTonBalanceFromHistoryTimestamps(currentTonBalance, date, jettonOperations);
  if (canUseAccountDiff(range, date, now, currentTonBalance)) {
    try {
      const balanceChangeNano = await accountBalanceChangeWithRetry(address, date, now);
      tonBalance = Math.max(0, nanoToTon(currentNano - balanceChangeNano));
    } catch (error) {
      console.warn(`TON diff unavailable for ${date.toISOString()}: ${error.message}`);
    }
  }
  return tonBalance;
}

async function portfolioAtDate(context, date) {
  const {
    address,
    now,
    range,
    currentNano,
    currentTonBalance,
    currentTonUsd,
    currentPoint,
    jettonOperations,
    historyJettons,
    tonChart,
    jettonCharts,
    maxStalenessMs,
  } = context;

  if (date.getTime() >= now.getTime()) return currentPoint;

  const tonBalance = await tonBalanceAtDate({
    address,
    date,
    now,
    range,
    currentNano,
    currentTonBalance,
    jettonOperations,
  });
  const tonPrice = priceAt(tonChart, date, currentTonUsd, maxStalenessMs);
  let jettonValueUsd = 0;
  let assetCount = tonBalance > 0 ? 1 : 0;
  let pricedAssetCount = tonBalance > 0 && tonPrice > 0 ? 1 : 0;

  historyJettons.forEach((jetton) => {
    const balance = jettonBalanceAtDate(jetton, date, address, jettonOperations);
    if (balance <= 0) return;
    assetCount += 1;
    const price = priceAt(jettonCharts.get(jetton.address) || [], date, Number(jetton.priceUsd || 0), maxStalenessMs);
    const value = balance * price;
    if (value > 0) pricedAssetCount += 1;
    jettonValueUsd += value;
  });

  return {
    address: address.toLowerCase(),
    timestamp: date.toISOString(),
    valueUsd: tonBalance * tonPrice + jettonValueUsd,
    tonBalance,
    jettonValueUsd,
    tonUsdRate: tonPrice,
    assetCount,
    pricedAssetCount,
    source: "portfolio-at-time",
  };
}

async function highestPortfolioPointForBucket(context, bucket) {
  let best = null;
  for (const date of bucket) {
    const point = await portfolioAtDate(context, date);
    if (!best || point.valueUsd > best.valueUsd) best = point;
  }
  return best;
}

async function approximateWalletHistory(address, currentTonBalance, range = "1D", jettons = []) {
  const now = new Date();
  const currentTonUsd = await tonUsdRate();
  const currentJettonValueUsd = jettons.reduce((sum, jetton) => sum + Number(jetton.valueUsd || 0), 0);
  const currentPoint = currentPortfolioPoint(address, now, currentTonBalance, currentTonUsd, currentJettonValueUsd, jettons);
  const dates = historySampleDates(range, now);
  const start = dates[0] || rangeStart(range, now);
  const tonChart = await getRateChart("TON", start, now);
  const points = dates.map((date) => {
    const tonPrice = priceAt(tonChart, date, currentTonUsd, chartStaleness(range));
    return {
      address: address.toLowerCase(),
      timestamp: date.toISOString(),
      valueUsd: currentTonBalance * tonPrice + currentJettonValueUsd,
      tonBalance: currentTonBalance,
      jettonValueUsd: currentJettonValueUsd,
      tonUsdRate: tonPrice,
      assetCount: jettons.filter((jetton) => Number(jetton.balance || 0) > 0).length + (currentTonBalance > 0 ? 1 : 0),
      pricedAssetCount: jettons.filter((jetton) => Number(jetton.balance || 0) > 0 && Number(jetton.valueUsd || 0) > 0).length + (currentTonBalance > 0 ? 1 : 0),
      source: "approx-current-holdings",
    };
  });
  if (!points.length) points.push(currentPoint);
  else points[points.length - 1] = currentPoint;
  return points;
}

async function reconstructWalletHistory(address, currentTonBalance, range = "1D", jettons = [], options = {}) {
  const now = new Date();
  const currentNano = Math.round(currentTonBalance * 1_000_000_000);
  const currentTonUsd = await tonUsdRate();
  const startHint = rangeStart(range, now);
  const jettonOperations = await fetchJettonHistory(address, startHint);
  const historyJettons = await enrichJettonRates(historyJettonsFromOperations(jettons, jettonOperations), true);
  let currentJettonValueUsd = jettons.reduce((sum, jetton) => sum + (jetton.valueUsd || 0), 0);
  const buckets = trimBucketsToWalletActivity(historySampleBuckets(range, now), jettonOperations, now);
  const chartDates = buckets.flat();
  const start = chartDates[0] || rangeStart(range, now);
  const tonChart = await getRateChart("TON", start, now);
  if (!tonChart.length) console.warn(`TON chart empty for ${range}; using current TON/USD rate for all points.`);
  const jettonCharts = new Map();
  const maxStalenessMs = chartStaleness(range);
  if (currentJettonValueUsd === 0 && jettons.some((jetton) => Number(jetton.balance || 0) > 0)) {
    currentJettonValueUsd = jettons.reduce((sum, jetton) => {
      const price = priceAt(jettonCharts.get(jetton.address) || [], now, Number(jetton.priceUsd || 0), maxStalenessMs);
      return sum + Number(jetton.balance || 0) * price;
    }, 0);
  }
  const currentPoint = currentPortfolioPoint(address, now, currentTonBalance, currentTonUsd, currentJettonValueUsd, jettons);
  const context = {
    address,
    now,
    range,
    currentNano,
    currentTonBalance,
    currentTonUsd,
    currentPoint,
    jettonOperations,
    historyJettons,
    tonChart,
    jettonCharts,
    maxStalenessMs,
  };
  const points = [];
  for (const bucket of buckets) {
    try {
      points.push(await highestPortfolioPointForBucket(context, bucket));
      options.onPoint?.(points.slice());
    } catch (error) {
      console.warn(`Skipping history bucket ${bucket[0]?.toISOString() || "unknown"}: ${error.message}`);
    }
  }
  if (!points.length) {
    points.push(currentPoint);
  } else {
    points[points.length - 1] = currentPoint;
  }
  options.onPoint?.(points.slice());
  return points;
}

async function cachedWalletHistory(address, currentTonBalance, range, jettons, onPoint = null) {
  const key = historyCacheKey(address, range);
  const cached = walletHistoryCache.get(key);
  if (cached?.points && cached.expiresAt > Date.now()) return cached.points;
  if (cached?.promise) return cached.promise;
  const diskPoints = readHistoryDiskCache(address, range);
  if (diskPoints.length) {
    walletHistoryCache.set(key, { points: diskPoints, expiresAt: Date.now() + walletHistoryTtl });
    return diskPoints;
  }
  const promise = reconstructWalletHistory(address, currentTonBalance, range, jettons, { onPoint })
    .then((points) => {
      writeHistoryDiskCache(address, range, points);
      walletHistoryCache.set(key, { points, expiresAt: Date.now() + walletHistoryTtl });
      return points;
    })
    .catch((error) => {
      walletHistoryCache.delete(key);
      throw error;
    });
  walletHistoryCache.set(key, { promise, expiresAt: Date.now() + walletHistoryTtl });
  return promise;
}

function clearWalletHistoryCache(address) {
  const prefix = `${canonicalAddressKey(address)}:`;
  for (const key of walletHistoryCache.keys()) {
    if (key.startsWith(prefix)) walletHistoryCache.delete(key);
  }
}

function historyJobStatus(address, range) {
  const key = historyCacheKey(address, range);
  const cached = walletHistoryCache.get(key);
  if (cached?.points) return { status: "ready", points: cached.points, source: cached.source || "memory" };
  const diskPoints = readHistoryDiskCache(address, range);
  if (diskPoints.length) {
    walletHistoryCache.set(key, { points: diskPoints, expiresAt: Date.now() + walletHistoryTtl });
    return { status: "ready", points: diskPoints, source: "disk" };
  }
  const job = walletHistoryJobs.get(key);
  if (job) return { status: job.status, points: [], error: job.error || null, source: "job" };
  return { status: "missing", points: [], source: "none" };
}

function startHistoryJob(address, currentTonBalance, range, jettons) {
  const existing = historyJobStatus(address, range);
  if (existing.status === "ready") return existing;
  const key = historyCacheKey(address, range);
  const activeJob = walletHistoryJobs.get(key);
  if (activeJob && ["queued", "building"].includes(activeJob.status)) return activeJob;
  const job = {
    status: "queued",
    points: [],
    error: null,
    address,
    range,
    currentTonBalance,
    jettons,
    approxPoints: [],
    queuedAt: new Date().toISOString(),
    startedAt: null,
    finishedAt: null,
  };
  walletHistoryJobs.set(key, job);
  approximateWalletHistory(address, currentTonBalance, range, jettons)
    .then((points) => { job.approxPoints = points; })
    .catch((error) => console.warn(`Approx history failed for ${range}: ${error.message}`));
  job.promise = historyBuildQueue.then(async () => {
    job.status = "building";
    job.startedAt = new Date().toISOString();
    try {
      job.points = await cachedWalletHistory(address, currentTonBalance, range, jettons, (points) => {
        job.points = points;
      });
      job.status = "ready";
      job.finishedAt = new Date().toISOString();
      return job.points;
    } catch (error) {
      job.status = "error";
      job.error = error.message;
      job.finishedAt = new Date().toISOString();
      throw error;
    }
  });
  historyBuildQueue = job.promise.catch(() => {});
  job.promise.catch((error) => console.warn(`History job failed for ${range}: ${error.message}`));
  return job;
}

function startWalletHistoryJobs(address, currentTonBalance, jettons) {
  if (fastGraphHistoryOnly) {
    prewarmFastGraphHistory(address, currentTonBalance, jettons).catch((error) => {
      console.warn(`Fast graph prewarm failed: ${error.message}`);
    });
    return;
  }
  historyRanges.forEach((range) => startHistoryJob(address, currentTonBalance, range, jettons));
}

async function prewarmFastGraphHistory(address, currentTonBalance, jettons) {
  for (const range of historyRanges) {
    const key = historyCacheKey(address, range);
    if (walletHistoryCache.get(key)?.points) continue;
    const points = await approximateWalletHistory(address, currentTonBalance, range, jettons);
    walletHistoryCache.set(key, { points, expiresAt: Date.now() + walletHistoryTtl, source: "fast-current-holdings" });
  }
}

async function walletImport(address) {
  address = parseTonAddress(address);
  const account = await tonApi(`/accounts/${encodeURIComponent(address)}`, { immediate: true });
  const [jettonsResult, tonCenterJettonsResult] = await Promise.allSettled([
    tonApi(`/accounts/${encodeURIComponent(address)}/jettons`, { immediate: true }),
    tonCenter(`/jetton/wallets?owner_address=${encodeURIComponent(address)}&limit=500`),
  ]);
  const normalizedAccount = normalizeAccount(account, address);
  const tonName = await resolveTonName(address);
  normalizedAccount.tonName = tonName || "";
  normalizedAccount.tonscanUrl = `https://tonscan.org/address/${encodeURIComponent(address)}`;
  normalizedAccount.tonviewerUrl = `https://tonviewer.com/${encodeURIComponent(address)}`;
  const tonApiJettons = jettonsResult.status === "fulfilled" ? normalizeJettons(jettonsResult.value) : [];
  const tonCenterJettons = tonCenterJettonsResult.status === "fulfilled" ? normalizeTonCenterJettons(tonCenterJettonsResult.value) : [];
  let jettons = mergeJettonInventories(tonApiJettons, tonCenterJettons);
  if (!jettons.length && tonCenterJettonsResult.status === "rejected") {
    console.warn(`TonCenter jetton import failed for ${address}: ${tonCenterJettonsResult.reason.message}`);
  }
  jettons = dedupeJettons(await enrichJettonRates(jettons, false, { immediate: true }));
  if (jettons.length) {
    walletJettonsCache.set(String(normalizedAccount.address || address).toLowerCase(), jettons);
    clearWalletHistoryCache(normalizedAccount.address || address);
  }
  const cachedCollectibles = cachedMapValue(collectiblesCache, `${canonicalAddressKey(normalizedAccount.address || address)}:wallet-v3`);
  const nfts = cachedCollectibles ? [...(cachedCollectibles.gifts || []), ...(cachedCollectibles.stickers || [])] : [];
  getCollectiblesShared(normalizedAccount.address || address).catch((error) => console.warn("Collectibles background import failed", error.message));
  const events = [];
  walletActivity(address, 40).catch((error) => console.warn("Activity background import failed", error.message));
  const currentTonUsd = await tonUsdRate();
  const summary = portfolioSummary(normalizedAccount, jettons, nfts, events, currentTonUsd);
  const snapshot = saveWalletSnapshot(normalizedAccount.address || address, summary);
  startWalletHistoryJobs(normalizedAccount.address || address, normalizedAccount.balanceTon, jettons);
  return {
    source: "tonapi",
    importedAt: new Date().toISOString(),
    account: normalizedAccount,
    summary,
    snapshot,
    history: [],
    historyStatus: historyRanges.map((range) => {
      const status = historyJobStatus(normalizedAccount.address || address, range);
      return { range, status: status.status, source: status.source };
    }),
    assets: {
      ton: {
        type: "token",
        name: "Toncoin",
        symbol: "TON",
        balance: normalizedAccount.balanceTon,
      },
      jettons,
      collectibles: nfts,
    },
    activity: events,
    warnings: [
      jettonsResult.status === "rejected" ? `Jettons unavailable: ${jettonsResult.reason.message}` : null,
      nfts.length ? null : "Collectibles are loading in the background",
      "Activity is loading in the background",
    ].filter(Boolean),
  };
}

function classifyCollectible(collectionName = "", nftName = "") {
  const collection = String(collectionName || "");
  const text = `${collectionName} ${nftName}`.toLowerCase();
  const listed = (list) => (list || []).some((entry) => String(entry).toLowerCase() === collection.toLowerCase());
  const denied = listed(collectiblesRegistry.denyCollections) || (collectiblesRegistry.denyNamePatterns || []).some((entry) => text.includes(String(entry).toLowerCase()));
  if (denied) return "";
  if (listed(collectiblesRegistry.stickerCollections)) return "sticker";
  if (listed(collectiblesRegistry.giftCollections)) return "gift";
  return "";
}

function isDeniedCollectible(collectionName = "", nftName = "") {
  const collection = String(collectionName || "");
  const text = `${collectionName} ${nftName}`.toLowerCase();
  const listed = (list) => (list || []).some((entry) => String(entry).toLowerCase() === collection.toLowerCase());
  return listed(collectiblesRegistry.denyCollections)
    || (collectiblesRegistry.denyNamePatterns || []).some((entry) => text.includes(String(entry).toLowerCase()));
}

function normalizeGetgemsNft(node = {}, tonRate = 0) {
  const collection = node.collection || node.collectionInfo || {};
  const attrs = node.attributes || node.traits || node.metadata?.attributes || [];
  const floorTon = Number(node.sale?.price || node.listing?.price || node.floorPrice || node.collection?.floorPrice || 0) / (Number(node.sale?.price || 0) > 1e6 ? 1e9 : 1);
  const kind = classifyCollectible(collection.name, node.name || node.metadata?.name);
  return {
    type: kind,
    name: node.name || node.metadata?.name || "Collectible",
    collection: collection.name || "Telegram Collectible",
    collectionAddress: collection.address || collection.id || "",
    tokenAddress: node.address || node.id || "",
    image: node.image || node.metadata?.image || node.preview || "",
    animatedImage: node.animation_url || node.animationUrl || node.metadata?.animation_url || node.metadata?.video_url || "",
    animationUrl: node.animation_url || node.animationUrl || node.metadata?.animation_url || node.metadata?.video_url || "",
    mediaType: mediaKind(node.animation_url || node.animationUrl || node.metadata?.animation_url || node.metadata?.video_url || ""),
    description: node.description || node.metadata?.description || "",
    floorTon: Number.isFinite(floorTon) ? floorTon : 0,
    floorUsd: Number.isFinite(floorTon) ? floorTon * tonRate : 0,
    lastSaleTon: Number(node.lastSale?.price || 0) / 1e9 || 0,
    attributes: Array.isArray(attrs) ? attrs : [],
    mintIndex: node.index || node.tokenId || node.metadata?.number || 0,
    listed: Boolean(node.sale || node.listing || node.isOnSale),
    raw: node,
  };
}

const nanoTon = (value) => Number(value || 0) / 1e9;

function giftSlug(name = "", number = "") {
  return `${String(name).toLowerCase().replace(/[^a-z0-9]+/g, "")}-${number}`;
}

function normalizeThermosGift(item = {}, tonRate = 0) {
  const floorTon = nanoTon(item.price);
  const attrs = [
    item.model && { trait_type: "Model", value: item.model.name, rarity: `${Number(item.model.rarity_per_mille || 0) / 10}%` },
    item.backdrop && { trait_type: "Backdrop", value: item.backdrop.name, rarity: `${Number(item.backdrop.rarity_per_mille || 0) / 10}%` },
    item.symbol && { trait_type: "Symbol", value: item.symbol.name, rarity: `${Number(item.symbol.rarity_per_mille || 0) / 10}%` },
  ].filter(Boolean);
  const layeredMedia = giftLayeredMediaPayload({
    collectionName: item.collection || "Telegram Gift",
    attributes: attrs,
    image: item.image_url || "",
    animationUrl: item.animation_url || item.video_url || item.animated_url || "",
    mediaType: mediaKind(item.animation_url || item.video_url || item.animated_url || ""),
  });
  return {
    type: "gift",
    name: item.collection || "Telegram Gift",
    collection: item.collection || "Telegram Gift",
    collectionAddress: item.collection || "",
    tokenAddress: item.external_id || "",
    image: item.image_url || "",
    animatedImage: item.animation_url || item.video_url || item.animated_url || "",
    animationUrl: item.animation_url || item.video_url || item.animated_url || "",
    mediaType: mediaKind(item.animation_url || item.video_url || item.animated_url || ""),
    description: "",
    floorTon,
    floorUsd: floorTon * tonRate,
    lastSaleTon: floorTon,
    attributes: attrs,
    mintIndex: item.number || 0,
    listed: true,
    marketplace: item.marketplace || "Thermos",
    slug: giftSlug(item.collection, item.number),
    layeredMedia,
    raw: item,
  };
}

function normalizeMrktGift(item = {}, tonRate = 0) {
  const floorTon = nanoTon(item.salePrice || item.price || item.floorPriceNanoTONsByCollection);
  const name = item.collectionTitle || item.collectionName || item.name || item.title || "Telegram Gift";
  const attrs = [
    item.modelName && { trait_type: "Model", value: item.modelName, rarity: `${Number(item.modelRarityPerMille || 0) / 10}%` },
    item.backdropName && { trait_type: "Backdrop", value: item.backdropName, rarity: `${Number(item.backdropRarityPerMille || 0) / 10}%` },
    item.symbolName && { trait_type: "Symbol", value: item.symbolName, rarity: `${Number(item.symbolRarityPerMille || 0) / 10}%` },
  ].filter(Boolean);
  const image = item.modelStickerThumbnailKey ? `https://cdn.tgmrkt.io/${item.modelStickerThumbnailKey}` : "";
  const layeredMedia = giftLayeredMediaPayload({
    collectionName: name,
    attributes: attrs,
    image,
    animationUrl: "",
    mediaType: "",
  });
  return {
    type: "gift",
    name,
    collection: name,
    collectionAddress: name,
    tokenAddress: item.id || item.giftIdString || "",
    image,
    description: "",
    floorTon,
    floorUsd: floorTon * tonRate,
    lastSaleTon: floorTon,
    attributes: attrs,
    mintIndex: item.number || 0,
    listed: Boolean(item.isOnSale || floorTon),
    marketplace: "MRKT",
    slug: giftSlug(name, item.number),
    layeredMedia,
    raw: item,
  };
}

function normalizeThermosCollection(item = {}, tonRate = 0) {
  const floorTon = nanoTon(item.stats?.floor);
  return {
    floorTon,
    floorUsd: floorTon * tonRate,
    volume24hTon: 0,
    volume24hUsd: 0,
    change24hPct: 0,
    sales24h: 0,
    totalSupply: Number(item.stats?.count || 0),
    holders: 0,
    listedCount: Number(item.stats?.count || 0),
    athFloorUsd: null,
    recentSales: [],
    source: "thermos-proxy",
  };
}

async function thermosGiftCollections(force = false) {
  const now = Date.now();
  if (!force && thermosGiftCollectionsCache && thermosGiftCollectionsExpiresAt > now) return thermosGiftCollectionsCache;
  if (!force && thermosGiftCollectionsPromise) return thermosGiftCollectionsPromise;
  thermosGiftCollectionsPromise = marketJson("https://proxy.thermos.gifts/api/v1/collections", {}, 5000)
    .then((rows) => {
      const list = Array.isArray(rows) ? rows : [];
      thermosGiftCollectionsCache = list;
      thermosGiftCollectionsExpiresAt = Date.now() + 3 * 60 * 1000;
      return list;
    })
    .catch(() => [])
    .finally(() => {
      thermosGiftCollectionsPromise = null;
    });
  return thermosGiftCollectionsPromise;
}

function thermosCollectionName(item = {}) {
  return String(item?.name || item?.collection || item?.title || "").trim();
}

function thermosGiftAttributeBucket(payload = {}, collectionName = "") {
  const key = giftSnapshotKey(collectionName);
  const matchKey = Object.keys(payload || {}).find((name) => giftSnapshotKey(name) === key);
  return matchKey ? { name: matchKey, data: payload[matchKey] || {} } : { name: collectionName, data: {} };
}

async function thermosGiftAttributes(collectionNames = [], force = false) {
  const names = [...new Set(collectionNames.map((name) => String(name || "").trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
  if (!names.length) return {};
  const key = names.map(giftSnapshotKey).join("|");
  const now = Date.now();
  const cached = thermosGiftAttributesCache.get(key);
  if (!force && cached && cached.expiresAt > now) return cached.value;
  if (!force && thermosGiftAttributesRequests.has(key)) return thermosGiftAttributesRequests.get(key);
  const request = marketJson("https://proxy.thermos.gifts/api/v1/attributes", {
    method: "POST",
    body: { collections: names },
  }, 10000)
    .then((payload) => {
      const value = payload && typeof payload === "object" ? payload : {};
      thermosGiftAttributesCache.set(key, { value, expiresAt: Date.now() + 3 * 60 * 1000 });
      return value;
    })
    .finally(() => thermosGiftAttributesRequests.delete(key));
  thermosGiftAttributesRequests.set(key, request);
  return request;
}

function thermosGiftModelPayloadFromAttributes(collectionName = "", attributesPayload = {}, tonRate = 0) {
  const bucket = thermosGiftAttributeBucket(attributesPayload, collectionName);
  const models = (Array.isArray(bucket.data?.models) ? bucket.data.models : [])
    .map((model) => {
      const floorTon = nanoTon(model?.stats?.floor);
      if (!(floorTon > 0)) return null;
      return {
        model: String(model?.name || "").trim(),
        floorTon,
        floorUsd: floorTon * tonRate,
        tonUsdRate: tonRate,
        source: "thermos-model",
        marketPlatform: "Thermos",
        listedCount: Number(model?.stats?.count || 0),
        modelCount: Number(model?.stats?.count || 0),
        rarity: Number(model?.rarity_per_mille || 0) / 10,
        marketUpdatedAt: new Date().toISOString(),
        iconUrl: model?.image_url || "",
        animationUrl: model?.animation_url || model?.video_url || model?.animated_url || "",
        mediaType: mediaKind(model?.animation_url || model?.video_url || model?.animated_url || model?.image_url || ""),
      };
    })
    .filter((model) => model?.model && (model.floorTon > 0 || model.floorUsd > 0));
  return {
    ok: models.length > 0,
    canonicalName: bucket.name || collectionName,
    source: "thermos-model",
    marketPlatform: "Thermos",
    tonUsdRate: tonRate,
    models,
  };
}

async function thermosGiftModelPayload(collectionName = "", { force = false, tonRate = 0 } = {}) {
  const rate = tonRate || await tonUsdRate();
  const collections = await thermosGiftCollections();
  const collectionRow = bestThermosGiftCollection(collections, [collectionName]);
  const canonicalName = thermosCollectionName(collectionRow) || collectionName;
  const thermosPayload = await thermosGiftAttributes([canonicalName], force);
  let xgiftPayload = {};
  try {
    xgiftPayload = await xgiftGiftAttributesPayload(canonicalName, { force });
  } catch {}
  const mergedPayload = mergeGiftAttributePayload(canonicalName, thermosPayload, xgiftPayload);
  await appendGiftAttributes(canonicalName, mergedPayload);
  return thermosGiftModelPayloadFromAttributes(canonicalName, mergedPayload, rate);
}

async function d1GiftComboFloor(collectionName = "", modelName = "", backdropName = "") {
  if (!giftRegistryReadUrl || !collectionName || !modelName || !backdropName) return null;
  const collectionAliases = [...new Set([collectionName, ...giftCollectionAliasKeys(collectionName)].filter(Boolean))];
  for (const collection of collectionAliases) {
    try {
      const params = new URLSearchParams({
        collection,
        model: modelName,
        backdrop: backdropName,
      });
      const payload = await marketJson(`${giftRegistryReadUrl}/combo?${params}`, {}, 5000);
      if (Number(payload?.floorTon || 0) > 0) return payload;
    } catch {
      // Try the next collection alias before giving up.
    }
  }
  return null;
}

async function d1GiftComboHistory(collectionName = "", modelName = "", backdropName = "") {
  if (!collectionName || !modelName || !backdropName) return [];
  try {
    const params = new URLSearchParams({ collection: collectionName, model: modelName, backdrop: backdropName });
    const endpoint = giftRegistryProxyUrl
      ? `${giftRegistryProxyUrl}/api/gift-registry/history?${params}`
      : `${giftRegistryReadUrl}/history?${params}`;
    const payload = await marketJson(endpoint, {}, giftRegistryProxyUrl ? 5000 : 2500);
    return Array.isArray(payload) ? payload : [];
  } catch {
    return [];
  }
}

async function d1GiftComboFloors(pairs = []) {
  if ((!giftRegistryReadUrl && !giftRegistryProxyUrl) || !pairs.length) return { combinations: [], coverage: [] };
  const seen = new Set();
  const requested = [];
  pairs.forEach((pair) => {
    const collectionAliases = [...new Set([
      pair.collection,
      pair.collectionKey,
      ...(pair.collectionKeys || []),
      ...giftCollectionAliasKeys(pair.collection),
    ].filter(Boolean))];
    collectionAliases.forEach((collection) => {
      const key = [collection, pair.model, pair.backdrop].map(giftSnapshotKey).join(":");
      if (seen.has(key)) return;
      seen.add(key);
      requested.push({
        collection,
        model: pair.model,
        backdrop: pair.backdrop,
      });
    });
  });
  const requestChunkSize = 40;
  const chunks = Array.from({ length: Math.ceil(requested.length / requestChunkSize) }, (_, index) => requested.slice(index * requestChunkSize, index * requestChunkSize + requestChunkSize));
  const combinations = [];
  const coverage = new Map();
  for (let index = 0; index < chunks.length; index += 4) {
    const responses = await Promise.all(chunks.slice(index, index + 4).map(async (chunk) => {
      try {
        const endpoint = giftRegistryProxyUrl
          ? `${giftRegistryProxyUrl}/api/gift-registry/combos`
          : `${giftRegistryReadUrl}/combos`;
        return await marketJson(endpoint, {
          method: "POST",
          body: { pairs: chunk },
        }, 15000);
      } catch {
        return null;
      }
    }));
    responses.forEach((response) => {
      if (Array.isArray(response?.combinations)) combinations.push(...response.combinations);
      (Array.isArray(response?.coverage) ? response.coverage : []).forEach((entry) => {
        if (entry?.collectionKey && entry?.snapshotAt) {
          coverage.set(giftSnapshotKey(entry.collectionKey), entry.snapshotAt);
        }
      });
    });
  }
  return {
    combinations,
    coverage: [...coverage].map(([collectionKey, snapshotAt]) => ({ collectionKey, snapshotAt })),
  };
}

async function ingestD1GiftCombo(record = {}) {
  const registryUrl = d1GiftRegistryUrl || publicGiftRegistryUrl;
  if (!registryUrl || !d1GiftIngestSecret || !(Number(record.floorTon || 0) > 0)) return false;
  try {
    await marketJson(`${registryUrl}/ingest/combo`, {
      method: "POST",
      headers: { authorization: `Bearer ${d1GiftIngestSecret}` },
      body: {
        collection: record.collectionName || record.collection,
        model: record.modelName || record.model,
        backdrop: record.backdropName || record.backdrop,
        floorTon: record.floorTon,
        listedCount: record.listedCount,
        marketplace: record.marketplace || record.marketPlatform || "",
        listingUrl: record.listingUrl || record.marketUrl || "",
        listingId: record.listingId || "",
        snapshotAt: record.timestamp || record.snapshotAt || new Date().toISOString(),
        source: record.source || "thermos-exact",
      },
    }, 5000);
    return true;
  } catch (error) {
    console.warn(`[gift-combo-d1] ingest failed for ${record.collectionName || record.collection} / ${record.modelName || record.model} / ${record.backdropName || record.backdrop}: ${String(error.message || error).slice(0, 160)}`);
    return false;
  }
}

async function thermosExactGiftComboFloor(collectionName = "", modelName = "", backdropName = "", tonRate = 0) {
  if (!collectionName || !modelName || !backdropName) return null;
  try {
    const collections = await thermosGiftCollections();
    const collectionRow = bestThermosGiftCollection(collections, [collectionName]);
    const canonicalName = thermosCollectionName(collectionRow) || collectionName;
    const payload = await marketJson("https://proxy.thermos.gifts/api/v1/gifts", {
      method: "POST",
      body: {
        ordering: "PRICE_ASC",
        page: 1,
        per_page: 1,
        query: "",
        price_range: null,
        number: null,
        collections: [canonicalName],
        models: [modelName],
        backdrops: [backdropName],
        symbols: [],
        markets: [],
      },
    }, 8000);
    const item = Array.isArray(payload?.items) ? payload.items[0] : null;
    const floorTon = nanoTon(item?.price);
    if (!(floorTon > 0)) return null;
    const marketplace = String(item?.marketplace || item?.market || "");
    const listingId = String(item?.id || item?.listing_id || item?.listingId || "");
    const listingUrl = String(item?.url || item?.link || item?.listingUrl || "");
    const record = {
      collection: canonicalName,
      collectionName: canonicalName,
      collectionKey: giftSnapshotKey(canonicalName),
      model: item?.model?.name || modelName,
      modelName: item?.model?.name || modelName,
      modelKey: giftSnapshotKey(item?.model?.name || modelName),
      backdrop: item?.backdrop?.name || backdropName,
      backdropName: item?.backdrop?.name || backdropName,
      backdropKey: giftSnapshotKey(item?.backdrop?.name || backdropName),
      timestamp: new Date().toISOString(),
      floorTon,
      floorUsd: floorTon * tonRate,
      tonUsdRate: tonRate,
      source: "thermos-exact",
      listedCount: Number(payload?.count || 0),
      marketplace,
      marketPlatform: marketplace,
      listingId,
      listingUrl,
      marketUrl: listingUrl,
      marketUpdatedAt: new Date().toISOString(),
    };
    await Promise.all([
      appendGiftComboFloorSnapshot(record),
      ingestD1GiftCombo(record),
    ]);
    return record;
  } catch (error) {
    console.warn(`[gift-combo-exact] ${collectionName} / ${modelName} / ${backdropName}: ${String(error.message || error).slice(0, 160)}`);
    return null;
  }
}

async function mapLimit(items = [], limit = 4, mapper) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

function missingGiftComboFloorPairs(pairs = [], combosByKey = new Map()) {
  const seen = new Set();
  const missing = [];
  pairs.forEach((pair) => {
    if (!pair.backdropKey) return;
    const aliases = [...new Set([pair.collection, pair.collectionKey, ...(pair.collectionKeys || [])].filter(Boolean))];
    const hasCombo = aliases.some((collection) => combosByKey.has([collection, pair.model, pair.backdrop].map(giftSnapshotKey).join(":")));
    if (hasCombo) return;
    const requestKey = [pair.collectionKey, pair.modelKey, pair.backdropKey].join(":");
    if (seen.has(requestKey)) return;
    seen.add(requestKey);
    missing.push(pair);
  });
  return missing;
}

function giftComboPairKey(pair = {}) {
  return [pair.collectionKey || giftSnapshotKey(pair.collection), pair.modelKey || giftSnapshotKey(pair.model), pair.backdropKey || giftSnapshotKey(pair.backdrop)].join(":");
}

function rememberGiftComboExactMiss(pair = {}) {
  const key = giftComboPairKey(pair);
  if (key && !key.endsWith("::")) giftComboExactMissCache.set(key, Date.now() + 15 * 60 * 1000);
}

function hasRecentGiftComboExactMiss(pair = {}) {
  const key = giftComboPairKey(pair);
  const expiresAt = key ? Number(giftComboExactMissCache.get(key) || 0) : 0;
  if (expiresAt > Date.now()) return true;
  if (key) giftComboExactMissCache.delete(key);
  return false;
}

function scheduleGiftComboFloorHeal(pairs = [], combosByKey = new Map(), tonRate = 0) {
  const scheduleLimit = Math.max(0, Number(process.env.GIFT_COMBO_EXACT_HEAL_SCHEDULE_LIMIT || 250));
  const missing = missingGiftComboFloorPairs(pairs, combosByKey)
    .slice(0, scheduleLimit)
    .filter((pair) => {
      if (hasRecentGiftComboExactMiss(pair)) return false;
      const requestKey = giftComboPairKey(pair);
      if (giftComboHealJobs.has(requestKey)) return false;
      giftComboHealJobs.add(requestKey);
      return true;
    });
  if (!missing.length) return 0;
  Promise.resolve()
    .then(async () => {
      await mapLimit(missing, 1, async (pair) => {
        try {
          const combo = await thermosExactGiftComboFloor(pair.collection, pair.model, pair.backdrop, tonRate);
          if (!combo) rememberGiftComboExactMiss(pair);
        } finally {
          giftComboHealJobs.delete(giftComboPairKey(pair));
        }
      });
    })
    .catch(() => {
      missing.forEach((pair) => giftComboHealJobs.delete([pair.collectionKey, pair.modelKey, pair.backdropKey].join(":")));
    });
  return missing.length;
}

async function healMissingGiftComboFloors(pairs = [], combosByKey = new Map(), tonRate = 0) {
  const missing = missingGiftComboFloorPairs(pairs, combosByKey).filter((pair) => !hasRecentGiftComboExactMiss(pair));
  const limit = Math.max(0, Number(process.env.GIFT_COMBO_EXACT_HEAL_LIMIT || 250));
  if (!limit || !missing.length) return [];
  const selected = missing.slice(0, limit);
  const healed = await mapLimit(selected, 1, async (pair) => {
    const combo = await thermosExactGiftComboFloor(pair.collection, pair.model, pair.backdrop, tonRate);
    if (!combo) rememberGiftComboExactMiss(pair);
    return combo;
  });
  return healed.filter((combo) => combo && Number(combo.floorTon || 0) > 0);
}

async function thermosGiftComboFloor(collectionName = "", modelName = "", backdropName = "", tonRate = 0) {
  if (!collectionName || !modelName || !backdropName) return null;
  const d1Floor = await d1GiftComboFloor(collectionName, modelName, backdropName);
  if (d1Floor) {
    return {
      ...d1Floor,
      floorUsd: Number(d1Floor.floorTon || 0) * tonRate,
      tonUsdRate: tonRate,
    };
  }
  const stored = await latestGiftComboFloor(collectionName, modelName, backdropName);
  const storedAt = new Date(stored?.timestamp || 0).getTime();
  if (stored && Number(stored.floorTon || 0) > 0 && Date.now() - storedAt < 3 * 60 * 60 * 1000) {
    return { ...stored, source: stored.source || "thermos-combo" };
  }
  try {
    const payload = await marketJson("https://proxy.thermos.gifts/api/v1/gifts", {
      method: "POST",
      body: {
        ordering: "PRICE_ASC",
        page: 1,
        per_page: 1,
        query: "",
        collections: [collectionName],
        models: [modelName],
        backdrops: [backdropName],
        symbols: [],
        markets: [],
      },
    }, 10000);
    const item = Array.isArray(payload?.items) ? payload.items[0] : null;
    const floorTon = nanoTon(item?.price);
    if (!(floorTon > 0)) return stored && Number(stored.floorTon || 0) > 0 ? stored : null;
    const record = {
      collectionKey: giftSnapshotKey(collectionName),
      collectionName,
      modelKey: giftSnapshotKey(modelName),
      modelName,
      backdropKey: giftSnapshotKey(backdropName),
      backdropName,
      timestamp: new Date().toISOString(),
      floorTon,
      floorUsd: floorTon * tonRate,
      tonUsdRate: tonRate,
      source: "thermos-combo",
      listedCount: Number(payload?.count || 0),
      marketUpdatedAt: new Date().toISOString(),
    };
    await appendGiftComboFloorSnapshot(record);
    return record;
  } catch {
    return stored && Number(stored.floorTon || 0) > 0 ? stored : null;
  }
}

function bestThermosGiftCollection(collections = [], aliases = []) {
  const aliasKeys = aliases.map(giftSnapshotKey).filter(Boolean);
  const singularKeys = aliasKeys.map((key) => key.endsWith("s") ? key.slice(0, -1) : key);
  const pluralKeys = aliasKeys.map((key) => `${key}s`);
  const allKeys = [...new Set([...aliasKeys, ...singularKeys, ...pluralKeys])].filter(Boolean);
  return collections.find((item) => allKeys.includes(giftSnapshotKey(thermosCollectionName(item))))
    || collections.find((item) => collectibleAliasMatches(aliases, thermosCollectionName(item)))
    || collections.find((item) => collectibleAliasIncludes(aliases, thermosCollectionName(item)))
    || collections.find((item) => {
      const nameKey = giftSnapshotKey(thermosCollectionName(item));
      return allKeys.some((key) => key && (nameKey.includes(key) || key.includes(nameKey)));
    })
    || null;
}

async function thermosGiftFloorLookup(aliasObject = {}, aliases = [], tonRate = 0) {
  const traits = giftTraitLookup(aliasObject.attributes || []);
  const requestedCollectionName = [aliasObject.name, aliasObject.item, aliasObject.title, ...aliases]
    .find((value) => value && !/^(?:0:|EQ|UQ)[A-Za-z0-9_:-]+$/.test(String(value))) || "";
  const requestedModelName = traits.model || "";
  const requestedBackdropName = traits.backdrop || "";
  if (requestedCollectionName && requestedModelName && requestedBackdropName) {
    const [d1Floor, comboHistory] = await Promise.all([
      d1GiftComboFloor(requestedCollectionName, requestedModelName, requestedBackdropName),
      d1GiftComboHistory(requestedCollectionName, requestedModelName, requestedBackdropName),
    ]);
    if (d1Floor) {
      return {
        floorTon: Number(d1Floor.floorTon || 0),
        floorUsd: Number(d1Floor.floorTon || 0) * tonRate,
        volume24hTon: 0,
        volume24hUsd: 0,
        change24hPct: 0,
        sales24h: 0,
        totalSupply: 0,
        holders: 0,
        listedCount: Number(d1Floor.listedCount || 0),
        athFloorUsd: 0,
        recentSales: [],
        canonicalName: d1Floor.collection || requestedCollectionName,
        modelName: d1Floor.model || requestedModelName,
        backdropName: d1Floor.backdrop || requestedBackdropName,
        marketPlatform: d1Floor.marketplace || "D1 Backdrop Floor",
        marketUrl: d1Floor.listingUrl || "",
        source: d1Floor.source || "thermos-combo",
        tonUsdRate: tonRate,
        floorHistory: comboHistory,
        floorHistorySource: comboHistory.length >= 2 ? "tontrack-combo-registry" : "",
      };
    }
    const coverage = await d1GiftComboFloors([{
      collection: requestedCollectionName,
      model: requestedModelName,
      backdrop: requestedBackdropName,
    }]);
    if (coverage.coverage?.length) {
      return {
        floorTon: 0,
        floorUsd: 0,
        volume24hTon: 0,
        volume24hUsd: 0,
        change24hPct: 0,
        recentSales: [],
        canonicalName: requestedCollectionName,
        modelName: requestedModelName,
        backdropName: requestedBackdropName,
        marketPlatform: "",
        source: "d1-combo-missing",
        tonUsdRate: tonRate,
        floorHistory: comboHistory,
        floorHistorySource: comboHistory.length >= 2 ? "tontrack-combo-registry" : "",
      };
    }
  }
  const collections = await thermosGiftCollections();
  const collectionRow = bestThermosGiftCollection(collections, aliases);
  const collectionName = thermosCollectionName(collectionRow)
    || aliases.find((value) => value && !/^(?:0:|EQ|UQ)[A-Za-z0-9_:-]+$/.test(String(value))) || "";
  const base = collectionRow ? normalizeThermosCollection(collectionRow, tonRate) : {};
  const modelName = traits.model || "";
  const backdropName = traits.backdrop || "";
  let modelFloor = null;
  let comboFloor = null;
  let comboHistory = [];
  if (collectionName && modelName) {
    const modelPayload = await thermosGiftModelPayload(collectionName, { tonRate });
    modelFloor = modelPayload.models.find((model) => giftSnapshotKey(model.model) === giftSnapshotKey(modelName)) || null;
    if (modelPayload.models.length) appendGiftModelFloorSnapshots(collectionName, modelPayload).catch(() => null);
    if (backdropName) {
      [comboFloor, comboHistory] = await Promise.all([
        thermosGiftComboFloor(collectionName, modelName, backdropName, tonRate),
        d1GiftComboHistory(collectionName, modelName, backdropName),
      ]);
    }
  }
  if (modelName && backdropName && !comboFloor) {
    return {
      floorTon: 0,
      floorUsd: 0,
      volume24hTon: 0,
      volume24hUsd: 0,
      change24hPct: 0,
      recentSales: [],
      canonicalName: collectionName,
      modelName,
      backdropName,
      marketPlatform: "",
      source: "thermos-combo-missing",
      tonUsdRate: tonRate,
      floorHistory: comboHistory,
      floorHistorySource: comboHistory.length >= 2 ? "tontrack-combo-registry" : "",
    };
  }
  const floorTon = Number(comboFloor?.floorTon || modelFloor?.floorTon || base.floorTon || 0);
  const floorUsd = floorTon > 0 ? floorTon * tonRate : Number(comboFloor?.floorUsd || modelFloor?.floorUsd || base.floorUsd || 0);
  const floorHistory = comboHistory.length
    ? comboHistory
    : (modelFloor
      ? await giftModelSnapshotHistory(collectionName, modelFloor.model, aliasObject.period || "7d")
      : await giftSnapshotHistory(collectionName, aliasObject.period || "7d"));
  return {
    floorTon,
    floorUsd,
    volume24hTon: Number(base.volume24hTon || 0),
    volume24hUsd: Number(base.volume24hTon || 0) > 0 ? Number(base.volume24hTon || 0) * tonRate : Number(base.volume24hUsd || 0),
    change24hPct: Number(base.change24hPct || 0),
    sales24h: Number(base.sales24h || 0),
    totalSupply: Number(base.totalSupply || 0),
    holders: Number(base.holders || 0),
    listedCount: Number(comboFloor?.listedCount || modelFloor?.listedCount || base.listedCount || 0),
    athFloorUsd: Number(base.athFloorUsd || 0),
    recentSales: Array.isArray(base.recentSales) ? base.recentSales : [],
    canonicalName: collectionName,
    modelName: modelFloor?.model || modelName,
    backdropName,
    marketPlatform: "Thermos",
    source: comboFloor ? "thermos-combo" : (modelFloor ? "thermos-model" : "thermos-proxy"),
    tonUsdRate: tonRate,
    floorHistory,
    floorHistorySource: comboHistory.length >= 2 ? "tontrack-combo-registry" : (floorHistory.length >= 2 ? "tontrack-model-snapshots" : ""),
  };
}

function classifyNft(item = {}) {
  if (isDeniedCollectible(item.collection?.name || "", item.metadata?.name || "")) return "other";
  if (isSuspiciousStickerCandidate(item.collection?.name || "", item.metadata?.name || "", item.metadata?.description || item.collection?.description || "")) return "other";
  const attributes = Array.isArray(item.metadata?.attributes) ? item.metadata.attributes : [];
  const traitNames = attributes.map((attr) => String(attr?.trait_type || ""));
  const traitValues = attributes.map((attr) => String(attr?.value || ""));
  const hasTrait = (name) => traitNames.includes(name);
  if (hasTrait("Model") && hasTrait("Backdrop") && hasTrait("Symbol")) return "gift";
  const collectionAddress = String(item.collection?.address || "").toLowerCase();
  const buttons = Array.isArray(item.metadata?.buttons) ? item.metadata.buttons : [];
  const hasAddStickersButton = buttons.some((button) => String(button?.uri || "").includes("t.me/addstickers/"));
  const hasStickerPackButton = buttons.some((button) => /sticker pack|emoji/i.test(String(button?.label || "")));
  const image = String(bestNftImage(item));
  const isStickerdomAsset = image.includes("cdn.stickerdom.store");
  const nameText = `${item.metadata?.name || ""} ${item.collection?.name || ""} ${item.metadata?.description || ""}`.toLowerCase();
  const imageText = image.toLowerCase();
  const packTrait = traitNames.some((trait) => /pack number|rarity|edition/i.test(trait));
  const packName = /\b(pack|stickers?|sticker collection|react pack|avatar|avatars|origins|mythics?)\b/i.test(nameText);
  const stickerHost = /stickerdom|goodies-api-prod|cdn\.city-holder|sticker/i.test(imageText);
  const mintPack = buttons.some((button) => /@mint|mint/i.test(`${button?.label || ""} ${button?.uri || ""}`)) && (packTrait || packName);
  const cityHolder = /city holder\s*\|\s*sticker collection/i.test(nameText);
  const hasPackNumber = traitNames.some((trait) => /pack number/i.test(trait));
  const hasKnownRarity = traitValues.some((value) => /common|uncommon|rare|epic|legendary|mythic|ultimate/i.test(value));
  const isVerifiedCollection = Boolean(item.collection?.address && (item.verified || item.approved_by?.length));
  const knownStickerCollection = /\b(dogs origins|lost dogs|notcoin og|ton of memes|the meme ogs|good vibes club|gold vibes club|tapps|og icons|random memes|mememania|cool cat react pack|cool cats|doodles|snoop dogg x bayc avatars|bored ape originals|chimpers x jarritos|shib: army infantry|ruyui|gamee|city holder|moonbirds originals)\b/i.test(nameText);
  if (
    (collectionAddress && STICKER_COLLECTION_ADDRESSES.has(collectionAddress)) ||
    hasAddStickersButton ||
    hasStickerPackButton ||
    isStickerdomAsset ||
    cityHolder ||
    knownStickerCollection ||
    (isVerifiedCollection && (packName || packTrait || hasPackNumber)) ||
    stickerHost ||
    mintPack ||
    (hasPackNumber && hasKnownRarity) ||
    (packName && (packTrait || stickerHost))
  ) return "sticker";
  console.log(`[NFT-OTHER] ${item.collection?.name || ""} | address: ${item.collection?.address || ""} | traits: ${attributes.map((attr) => attr?.trait_type).join(", ")}`);
  return "other";
}

function normalizeWalletNft(item = {}) {
  const collection = item?.collection?.name || "Unknown collection";
  const name = item?.metadata?.name || collection || "Telegram Collectible";
  const image = bestNftImage(item);
  const attributes = Array.isArray(item?.metadata?.attributes) ? item.metadata.attributes : [];
  const type = classifyNft(item);
  const animatedMedia = bestNftAnimatedMedia(item);
  const layeredMedia = type === "gift"
    ? giftLayeredMediaPayload({
      collectionName: collection,
      attributes,
      image,
      animationUrl: animatedMedia,
      mediaType: mediaKind(animatedMedia),
    })
    : null;
  const text = `${collection} ${name} ${item?.metadata?.description || ""}`;
  const source = /goodies-api-prod/i.test(image)
    ? "Goodies"
    : /stickerdom/i.test(image)
      ? "Stickerdom"
      : /ton-of-memes|good vibes club|gold vibes club|the meme ogs|tapps/i.test(`${image} ${text}`)
        ? "Fuse"
        : "";
  return {
    type,
    name,
    collection,
    collectionAddress: item?.collection?.address || "",
    tokenAddress: item?.address || "",
    address: item?.address,
    image,
    animatedImage: animatedMedia,
    animationUrl: animatedMedia,
    mediaType: mediaKind(animatedMedia),
    source,
    owner: item?.owner?.address || null,
    verified: Boolean(item?.approved_by?.length || item?.verified),
    description: item?.metadata?.description || item?.collection?.description || "",
    floorTon: 0,
    floorUsd: 0,
    lastSaleTon: 0,
    attributes,
    layeredMedia,
    mintIndex: item?.index || 0,
    listed: false,
    raw: item,
  };
}

async function walletNftsByType(address) {
  const categoryRegistry = stickerCategoryCache || stickerCategoryRegistryFromSnapshot();
  if (!stickerCategoryCache) stickerCategoryRegistry().catch(() => null);
  if (!liveCollectiblesRegistryCache) refreshCollectiblesRegistry().catch(() => null);
  const tonRate = await tonUsdRate();
  const stickerRegistryMatch = (item) => {
    const inferredBrand = inferStickerBrandName(item.collection, item.name);
    const aliasValues = expandStickerAliases([item.collection, item.name, inferredBrand]);
    const aliasKeys = aliasValues.map((value) => normalizeStickerKey(value)).filter(Boolean);
    const addressMatch = [...stickerAddressKeys(item.collectionAddress)]
      .map((key) => categoryRegistry.address.get(key))
      .find(Boolean);
    const directNameMatch = aliasKeys.map((key) => categoryRegistry.name.get(key)).find(Boolean);
    const nameMatch = directNameMatch;
    return addressMatch || nameMatch || null;
  };
  const [directPayload, indirectPayload] = await Promise.allSettled([
    tonApi(`/accounts/${encodeURIComponent(address)}/nfts?limit=1000&indirect_ownership=false`),
    tonApi(`/accounts/${encodeURIComponent(address)}/nfts?limit=1000&indirect_ownership=true`),
  ]);
  const mergedRows = [
    ...(directPayload.status === "fulfilled" ? (directPayload.value?.nft_items || []) : []),
    ...(indirectPayload.status === "fulfilled" ? (indirectPayload.value?.nft_items || []) : []),
  ];
  const uniqueRows = [...new Map(mergedRows.map((item) => [String(item?.address || `${item?.collection?.address || ""}:${item?.index || ""}`), item])).values()];
  const items = uniqueRows.map((item) => {
    const normalized = normalizeWalletNft(item);
    const suspicious = isSuspiciousStickerCandidate(normalized.collection, normalized.name, normalized.description);
    const match = stickerRegistryMatch(normalized);
    if (normalized.type === "other" && match && !suspicious && !isDeniedCollectible(normalized.collection, normalized.name)) normalized.type = "sticker";
    if (normalized.type === "sticker") {
      normalized.brand = match?.brand || inferStickerBrandName(normalized.collection, normalized.name);
      normalized.categorySource = match?.categorySource || "inferred";
      normalized.collectionId = match?.collectionId || "";
      normalized.characterId = match?.characterId || "";
      const fastFloor = stickerSnapshotFloor(
        [normalized.collectionAddress, normalized.collection, normalized.name, normalized.brand],
        tonRate,
        {
          address: normalized.collectionAddress,
          collection: normalized.collection,
          name: normalized.collection,
          item: normalized.name,
          title: normalized.name,
          characterName: normalized.characterName,
        },
      );
      if (fastFloor) {
        normalized.floorTon = Number(fastFloor.floorTon || 0);
        normalized.floorUsd = Number(fastFloor.floorUsd || 0);
        normalized.marketPlatform = fastFloor.marketPlatform || "";
        normalized.marketUrl = fastFloor.marketUrl || "";
        normalized.change24hPct = Number(fastFloor.change24hPct || 0);
        normalized.volume24hTon = Number(fastFloor.volume24hTon || 0);
        normalized.volume24hUsd = Number(fastFloor.volume24hUsd || 0);
        normalized.totalSupply = Number(fastFloor.totalSupply || 0);
        normalized.holders = Number(fastFloor.holders || 0);
        normalized.listedCount = Number(fastFloor.listedCount || 0);
        normalized.initUsd = Number(fastFloor.initUsd || 0);
        normalized.initTon = Number(fastFloor.initTon || 0);
        normalized.characterId = normalized.characterId || fastFloor.characterId || "";
        normalized.collectionId = normalized.collectionId || fastFloor.collectionId || "";
        normalized.characterName = normalized.characterName || fastFloor.characterName || "";
      }
    }
    return normalized;
  });
  return {
    gifts: items.filter((item) => item.type === "gift"),
    stickers: items.filter((item) => item.type === "sticker"),
    otherCount: items.filter((item) => item.type === "other").length,
    source: "tonapi-wallet",
  };
}

async function getCollectibles(address) {
  const key = `${canonicalAddressKey(address)}:wallet-v4`;
  const cached = cachedMapValue(collectiblesCache, key);
  if (cached) return cached;
  const tonRate = await tonUsdRate();
  const classified = await walletNftsByType(address);
  const owned = [...classified.gifts, ...classified.stickers];
  if (owned.length) {
    const withFloors = owned.map((item) => {
      const floor = {};
      const floorTon = Number(item.floorTon || floor.floorTon || 0);
      return {
        ...item,
        floorTon,
        floorUsd: Number(item.floorUsd || floor.floorUsd || floorTon * tonRate || 0),
        change24hPct: Number(floor.change24hPct || 0),
        volume24hTon: Number(floor.volume24hTon || 0),
        volume24hUsd: Number(floor.volume24hUsd || 0),
        marketPlatform: floor.marketPlatform || item.marketPlatform || "",
        marketUrl: floor.marketUrl || item.marketUrl || "",
        source: floor.source || item.source || "",
        recentSales: Array.isArray(floor.recentSales) ? floor.recentSales : [],
        listedCount: Number(floor.listedCount || 0),
        holders: Number(floor.holders || 0),
        totalSupply: Number(floor.totalSupply || 0),
      };
    });
    return setCachedMapValue(collectiblesCache, key, {
      gifts: withFloors.filter((item) => item.type === "gift"),
      stickers: withFloors.filter((item) => item.type === "sticker"),
      source: "tonapi-wallet",
    }, 5 * 60 * 1000);
  }

  const query = `query WalletNfts($owner: String!) {
    nfts(ownerAddress: $owner, first: 100) {
      edges { node {
        id address name description image preview index tokenId
        attributes { trait_type value rarity }
        collection { id address name floorPrice }
        sale { price marketplace }
        lastSale { price timestamp }
      } }
      items { id address name description image preview index tokenId attributes { trait_type value rarity } collection { id address name floorPrice } sale { price marketplace } lastSale { price timestamp } }
    }
  }`;
  try {
    const payload = await getgemsGraphql(query, { owner: address });
    const root = payload?.data?.nfts;
    const nodes = root?.edges?.map((edge) => edge.node) || root?.items || [];
    const items = nodes.map((node) => normalizeGetgemsNft(node, tonRate)).filter((item) => item.type);
    return setCachedMapValue(collectiblesCache, key, {
      gifts: items.filter((item) => item.type === "gift"),
      stickers: items.filter((item) => item.type === "sticker"),
      source: "getgems",
    }, 5 * 60 * 1000);
  } catch (error) {
    return setCachedMapValue(collectiblesCache, key, { gifts: [], stickers: [], source: "tonapi-wallet", error: error.message }, 60 * 1000);
  }
}

function getCollectiblesShared(address) {
  const key = `${canonicalAddressKey(address)}:wallet-v4`;
  const cached = cachedMapValue(collectiblesCache, key);
  if (cached) return Promise.resolve(cached);
  if (collectiblesRequests.has(key)) return collectiblesRequests.get(key);
  const request = getCollectibles(address).finally(() => collectiblesRequests.delete(key));
  collectiblesRequests.set(key, request);
  return request;
}

async function collectibleFloor(collection) {
  const aliasObject = typeof collection === "object" ? collection : {};
  const isGiftLookup = aliasObject.kind === "gift";
  const isStickerLookup = aliasObject.kind === "sticker";
  const aliases = typeof collection === "object"
    ? [collection.address, collection.name, collection.item, collection.title].filter(Boolean)
    : [collection].filter(Boolean);
  const periodKey = isGiftLookup ? `|period:${String(aliasObject.period || "7d").toLowerCase()}` : "";
  const requestedTraits = giftTraitLookup(aliasObject.attributes || []);
  const traitKey = [requestedTraits.model, requestedTraits.backdrop, requestedTraits.symbol]
    .map(giftSnapshotKey)
    .join(":");
  const key = `${aliases.map((value) => String(value).toLowerCase()).join("|")}${periodKey}|${traitKey}`;
  let tonRate = await tonUsdRate();
  const cached = cachedMapValue(collectibleFloorCache, key);
  if (cached) {
    const floorTon = Number(cached.floorTon || 0);
    const volume24hTon = Number(cached.volume24hTon || 0);
    return {
      ...cached,
      floorUsd: floorTon > 0 ? floorTon * tonRate : Number(cached.floorUsd || 0),
      volume24hUsd: volume24hTon > 0 ? volume24hTon * tonRate : Number(cached.volume24hUsd || 0),
      tonUsdRate: tonRate,
    };
  }
  const zeroFloor = () => ({
    floorTon: 0,
    floorUsd: 0,
    volume24hTon: 0,
    volume24hUsd: 0,
    change24hPct: 0,
    recentSales: [],
  });
  const withSource = (payload = {}, source = "") => ({
    ...zeroFloor(),
    ...payload,
    marketPlatform: payload.floorTon > 0 || payload.floorUsd > 0 ? (payload.marketPlatform || marketSourceLabel(source)) : "",
    source: source || payload.source || "",
  });
  const matches = (...values) => collectibleAliasMatches(aliases, ...values);
  const includes = (...values) => collectibleAliasIncludes(aliases, ...values);
  const chainAddress = aliases.find((value) => /^(?:0:|EQ|UQ)[A-Za-z0-9_:-]+$/.test(String(value || ""))) || "";
  const collectionAddress = chainAddress || aliases[0] || "";
  const seeTraits = requestedTraits;
  const giftCandidates = [];
  const addGiftCandidate = (payload = {}, source = "") => {
    const candidate = withSource(payload, source);
    if (candidate.floorTon > 0 || candidate.floorUsd > 0 || candidate.volume24hTon > 0 || candidate.volume24hUsd > 0 || candidate.sales24h > 0 || candidate.totalSupply > 0 || candidate.holders > 0 || candidate.listedCount > 0) {
      giftCandidates.push(candidate);
    }
  };
  const mergeGiftCandidates = () => {
    if (!giftCandidates.length) return { ...zeroFloor(), marketPlatform: "", source: "" };
    const floorSource = [...giftCandidates]
      .filter((candidate) => Number(candidate.floorTon || 0) > 0)
      .sort((a, b) => Number(a.floorTon || 0) - Number(b.floorTon || 0))[0] || giftCandidates[0];
    return withSource({
      ...floorSource,
      floorTon: pickPositive(floorSource.floorTon, ...giftCandidates.map((candidate) => candidate.floorTon)),
      floorUsd: pickPositive(floorSource.floorUsd, ...giftCandidates.map((candidate) => candidate.floorUsd)),
      volume24hTon: pickPositive(floorSource.volume24hTon, ...giftCandidates.map((candidate) => candidate.volume24hTon)),
      volume24hUsd: pickPositive(floorSource.volume24hUsd, ...giftCandidates.map((candidate) => candidate.volume24hUsd)),
      change24hPct: Number.isFinite(Number(floorSource.change24hPct)) && Number(floorSource.change24hPct) !== 0
        ? Number(floorSource.change24hPct)
        : Number(giftCandidates.find((candidate) => Number.isFinite(Number(candidate.change24hPct)) && Number(candidate.change24hPct) !== 0)?.change24hPct || 0),
      sales24h: pickPositive(floorSource.sales24h, ...giftCandidates.map((candidate) => candidate.sales24h)),
      totalSupply: Math.max(0, ...giftCandidates.map((candidate) => Number(candidate.totalSupply || 0))),
      holders: Math.max(0, ...giftCandidates.map((candidate) => Number(candidate.holders || 0))),
      listedCount: Math.max(0, ...giftCandidates.map((candidate) => Number(candidate.listedCount || 0))),
      athFloorUsd: pickPositive(floorSource.athFloorUsd, ...giftCandidates.map((candidate) => candidate.athFloorUsd)),
      marketUrl: pickText(floorSource.marketUrl),
      recentSales: floorSource.recentSales?.length
        ? floorSource.recentSales
        : (giftCandidates.find((candidate) => Array.isArray(candidate.recentSales) && candidate.recentSales.length)?.recentSales || []),
    }, floorSource.source || floorSource.marketPlatform || "");
  };
  let snapshotStickerFloor = null;
  if (isGiftLookup) {
    try {
      const thermosFloor = await thermosGiftFloorLookup(aliasObject, aliases, tonRate);
      return setCachedMapValue(collectibleFloorCache, key, withSource(thermosFloor, thermosFloor.source || "thermos"), 3 * 60 * 1000);
    } catch (error) {
      console.warn(`[Thermos] gift floor unavailable for ${aliases.join(" | ")}: ${error.message}`);
      return setCachedMapValue(collectibleFloorCache, key, withSource({ ...zeroFloor(), source: "thermos-missing" }, "thermos-missing"), 60 * 1000);
    }
    try {
      const xgiftName = [aliasObject.item, aliasObject.title, aliasObject.name, ...aliases]
        .find((value) => value && !/^(?:0:|EQ|UQ|0:)[A-Za-z0-9_:-]+$/.test(String(value))) || "";
      const xgift = await xgiftBridge("gift-floor", {
        name: xgiftName,
        collection: xgiftName,
        period: aliasObject.period || "7d",
      }, 7000);
      if (xgift?.ok && Number(xgift.floorTon || 0) > 0) {
        const xgiftPayload = {
          ...zeroFloor(),
          floorTon: Number(xgift.floorTon || 0),
          floorUsd: Number(xgift.floorUsd || 0),
          volume24hTon: Number(xgift.volume24hTon || 0),
          volume24hUsd: Number(xgift.volume24hUsd || 0),
          change24hPct: Number(xgift.change24hPct || 0),
          periodChangePct: Number(xgift.periodChangePct || 0),
          sales24h: Number(xgift.sales24h || 0),
          sales30d: Number(xgift.sales30d || 0),
          totalSupply: Number(xgift.totalSupply || 0),
          opened: Number(xgift.opened || 0),
          onchain: Number(xgift.onchain || 0),
          holders: Number(xgift.holders || 0),
          listedCount: Number(xgift.listedCount || 0),
          athFloorUsd: Number(xgift.athFloorUsd || 0),
          marketUpdatedAt: xgift.marketUpdatedAt || "",
          canonicalName: xgift.canonicalName || xgiftName,
          giftId: xgift.giftId || "",
          marketUrl: xgift.marketUrl || "",
          graphImageUrl: xgift.graphImageUrl || "",
          marketPlatform: "xGift",
          source: "xgift",
          tonUsdRate: Number(xgift.tonUsdRate || tonRate),
          recentSales: Array.isArray(xgift.recentSales) ? xgift.recentSales : [],
        };
        await appendGiftFloorSnapshot(xgiftPayload.canonicalName || xgiftName, xgiftPayload);
        let floorHistory = Array.isArray(xgift.floorHistory) ? xgift.floorHistory : [];
        let floorHistorySource = floorHistoryMatchesCurrentFloor(floorHistory, Number(xgift.floorTon || 0), Number(xgift.floorUsd || 0)) ? "xgift-json" : "";
        if (floorHistory.length >= 2 && !floorHistorySource) floorHistory = [];
        if (floorHistory.length < 2) {
          floorHistory = await seePublicFloorHistory(xgift.canonicalName || xgiftName, seeTraits.model || "", tonRate, aliasObject.period || "7d");
          if (floorHistoryMatchesCurrentFloor(floorHistory, Number(xgift.floorTon || 0), Number(xgift.floorUsd || 0))) {
            floorHistorySource = "see.tg-graphics";
          } else {
            if (floorHistory.length >= 2) console.warn(`[see.tg] rejected mismatched gift graph for ${xgiftName}: latest=${floorHistory[floorHistory.length - 1]?.priceTon || 0} TON current=${xgift.floorTon || 0} TON`);
            floorHistory = [];
            floorHistorySource = "";
          }
        }
        if (floorHistory.length < 2) {
          floorHistory = await giftSnapshotHistory(xgiftPayload.canonicalName || xgiftName, aliasObject.period || "7d");
          floorHistorySource = floorHistory.length >= 2 ? "tontrack-snapshots" : "";
        }
        return setCachedMapValue(collectibleFloorCache, key, {
          ...xgiftPayload,
          floorHistory,
          floorHistorySource,
        }, 3 * 60 * 1000);
      }
    } catch (error) {
      console.warn(`[xGift] floor unavailable for ${aliases.join(" | ")}: ${error.message}`);
    }
    try {
      const seeGift = await seeGiftContext({
        aliases,
        itemName: aliasObject.item || "",
        collectionName: aliasObject.name || "",
        attributes: aliasObject.attributes || [],
        tgauth: aliasObject.tgauth || "",
      });
      if (seeGift?.gift_id || seeGift?.slug) {
        const [seeMarketResult, seeChartResult] = await Promise.allSettled([
          seeTgJson("/api/market/floors", {
            gift_id: seeGift.gift_id || "",
            slug: seeGift.slug || "",
            model_name: seeGift.model_name || seeTraits.model || "",
            backdrop_name: seeGift.backdrop_name || seeTraits.backdrop || "",
          }, aliasObject.tgauth || ""),
          seeTgJson("/api/graphics/floors", {
            gift_id: seeGift.gift_id || "",
            slug: seeGift.slug || "",
            model_name: seeGift.model_name || seeTraits.model || "",
          }, aliasObject.tgauth || ""),
        ]);
        const seeFloor = seeMarketResult.status === "fulfilled" ? seeMarketFloorPayload(seeMarketResult.value, tonRate) : null;
        const seeHistory = seeChartResult.status === "fulfilled" ? seeFloorHistoryPoints(seeChartResult.value, tonRate) : [];
        if (seeFloor) {
          addGiftCandidate({
            ...seeFloor,
            floorHistory: seeHistory,
            listedCount: Math.max(Number(seeFloor.listedCount || 0), Number(seeGift.listed_count || 0)),
          }, "see.tg");
        }
      }
    } catch {}
  }
  if (!isGiftLookup) {
    try {
      snapshotStickerFloor = stickerSnapshotFloor(aliases, tonRate, aliasObject);
    } catch {}
  }
  if (!isGiftLookup) {
    try {
      const stats = await stickerdomStatsFeed();
      const normalizeStickerKey = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
      const aliasKeys = aliases.map(normalizeStickerKey).filter(Boolean);
      const exactKeyMatch = (...values) => values.some((value) => {
        const keyValue = normalizeStickerKey(value);
        return keyValue && aliasKeys.includes(keyValue);
      });
      const foundCollection = stats.find((item) => exactKeyMatch(item.name));
      const characterMatch = stats.flatMap((item) =>
        (Array.isArray(item.characters) ? item.characters : []).map((character) => ({ item, character }))
      ).find(({ character }) => exactKeyMatch(character.name));
      const targetCollection = characterMatch?.item || foundCollection;
      const targetCharacter = characterMatch?.character || null;
      if (targetCollection) {
        if (targetCharacter?.id) {
          const characterStats = await thermosStickerCharacterStats(targetCollection.id);
          const row = characterStats.find((entry) => Number(entry.character_id) === Number(targetCharacter.id));
          const thermosFloorTon = nanoTon(row?.stats?.floor);
          if (thermosFloorTon > 0) {
            if (!isPlausibleStickerFloor(thermosFloorTon * tonRate, thermosFloorTon, tonRate)) throw new Error("Rejected implausible Thermos sticker floor");
            const init = stickerdomPrice(targetCharacter, tonRate);
            return setCachedMapValue(collectibleFloorCache, key, {
              floorTon: thermosFloorTon,
              floorUsd: thermosFloorTon * tonRate,
              volume24hTon: 0,
              volume24hUsd: 0,
              change24hPct: 0,
              sales24h: Number(row?.stats?.count || 0),
              totalSupply: Number(targetCharacter.originalSupply || targetCharacter.supply || 0),
              holders: 0,
              listedCount: Number(row?.stats?.count || 0),
              athFloorUsd: null,
              initUsd: init?.floorUsd || 0,
              initTon: init?.floorTon || 0,
              collectionId: Number(targetCollection.id),
              characterId: Number(targetCharacter.id),
              characterName: targetCharacter.name || "",
              recentSales: [],
              source: "thermos-sticker-character",
            }, 3 * 60 * 1000);
          }
        }
        if (targetCharacter?.id) {
          const toolsFloor = await stickersToolsFloor(targetCollection.id, targetCharacter.id);
          if (toolsFloor?.platform) {
            const floorUsd = Number(toolsFloor.platform.price_usd || 0);
            const floorTon = Number(toolsFloor.platform.price_ton || (tonRate > 0 ? floorUsd / tonRate : 0));
            if (!isPlausibleStickerFloor(floorUsd, floorTon, tonRate)) throw new Error("Rejected implausible sticker floor");
            const init = stickerdomPrice(targetCharacter, tonRate);
            return setCachedMapValue(collectibleFloorCache, key, {
              floorTon,
              floorUsd,
              volume24hTon: 0,
              volume24hUsd: 0,
              change24hPct: 0,
              sales24h: 0,
              totalSupply: Number(targetCharacter.originalSupply || targetCharacter.supply || 0),
              holders: 0,
              listedCount: toolsFloor.platforms.length,
              athFloorUsd: null,
              initUsd: init?.floorUsd || 0,
              initTon: init?.floorTon || 0,
              marketPlatform: toolsFloor.platform.name || "",
              marketUrl: toolsFloor.platform.url || "",
              collectionId: Number(targetCollection.id),
              characterId: Number(targetCharacter.id),
              characterName: targetCharacter.name || "",
              recentSales: [],
              source: "stickers-tools-floor",
            }, 3 * 60 * 1000);
          }
        }
        if (!targetCharacter && targetCollection?.id) {
          const collectionStats = await thermosStickerStats();
          const row = collectionStats.find((entry) => Number(entry.collection_id) === Number(targetCollection.id));
          const thermosFloorTon = nanoTon(row?.stats?.floor);
          if (thermosFloorTon > 0) {
            if (!isPlausibleStickerFloor(thermosFloorTon * tonRate, thermosFloorTon, tonRate)) throw new Error("Rejected implausible Thermos sticker floor");
            const characters = Array.isArray(targetCollection.characters) ? targetCollection.characters : [];
            return setCachedMapValue(collectibleFloorCache, key, {
              floorTon: thermosFloorTon,
              floorUsd: thermosFloorTon * tonRate,
              volume24hTon: 0,
              volume24hUsd: 0,
              change24hPct: 0,
              sales24h: Number(row?.stats?.count || 0),
              totalSupply: characters.reduce((sum, character) => sum + Number(character.originalSupply || character.supply || 0), 0),
              holders: 0,
              listedCount: Number(row?.stats?.count || 0),
              athFloorUsd: null,
              recentSales: [],
              source: "thermos-sticker-collection",
            }, 3 * 60 * 1000);
          }
        }
        const characters = targetCharacter ? [targetCharacter] : (Array.isArray(targetCollection.characters) ? targetCollection.characters : []);
        const priced = characters.map((character) => ({ character, price: stickerdomPrice(character, tonRate) })).filter((entry) => entry.price);
        const floor = priced.sort((a, b) => a.price.floorUsd - b.price.floorUsd)[0];
        const ath = priced.sort((a, b) => b.price.floorUsd - a.price.floorUsd)[0];
        if (floor && isPlausibleStickerFloor(floor.price.floorUsd, floor.price.floorTon, tonRate)) {
          return setCachedMapValue(collectibleFloorCache, key, {
            floorTon: floor.price.floorTon,
            floorUsd: floor.price.floorUsd,
            volume24hTon: 0,
            volume24hUsd: 0,
            change24hPct: 0,
            sales24h: 0,
            totalSupply: characters.reduce((sum, character) => sum + Number(character.originalSupply || character.supply || 0), 0),
            holders: 0,
            listedCount: priced.length,
            athFloorUsd: ath?.price?.floorUsd || null,
            initUsd: floor.price.floorUsd,
            initTon: floor.price.floorTon,
            collectionId: Number(targetCollection.id || 0),
            characterId: Number(floor.character?.id || targetCharacter?.id || 0),
            characterName: floor.character?.name || targetCharacter?.name || "",
            recentSales: [],
            source: targetCharacter ? "stickerdom-character" : "stickerdom-collection",
          }, 3 * 60 * 1000);
        }
      }
    } catch {}
    try {
      const toolsStatsFloor = await stickersToolsStatsFloor(aliases, tonRate, !(aliasObject.item || aliasObject.title || aliasObject.characterName));
      if (toolsStatsFloor) return setCachedMapValue(collectibleFloorCache, key, toolsStatsFloor, 3 * 60 * 1000);
    } catch {}
    if (snapshotStickerFloor) {
      return setCachedMapValue(collectibleFloorCache, key, snapshotStickerFloor, 10 * 60 * 1000);
    }
  }
  try {
    const collections = await marketJson("https://proxy.thermos.gifts/api/v1/collections", {}, 7000);
    const found = (collections || []).find((item) => matches(item.name, item.id));
    if (found) {
      const floorTon = nanoTon(found.stats?.floor);
      addGiftCandidate({
        floorTon,
        floorUsd: floorTon * tonRate,
        totalSupply: Number(found.stats?.count || 0),
        marketUrl: found.id ? `https://thermos.gifts/collection/${encodeURIComponent(found.id)}` : "",
      }, "thermos");
    }
  } catch {}
  if (chainAddress && !isGiftLookup) {
    try {
      const [collectionResult, statsResult] = await Promise.allSettled([
        marketJson(`https://api.tgmrkt.io/api/v1/collections/${encodeURIComponent(chainAddress)}`, {}, 5000),
        marketJson(`https://api.tgmrkt.io/api/v1/collections/${encodeURIComponent(chainAddress)}/stats`, {}, 5000),
      ]);
      const data = collectionResult.status === "fulfilled" ? collectionResult.value || {} : {};
      const stats = statsResult.status === "fulfilled" ? statsResult.value || {} : {};
      const rawFloor = data.floorPrice ?? data.floor_price ?? stats.floorPrice ?? stats.floor_price;
      const floorTon = nanoTon(rawFloor);
      if (floorTon > 0) {
        const volume24hTon = nanoTon(stats.volume24h ?? stats.volume_24h ?? data.volume24h ?? data.volume_24h);
        addGiftCandidate({
          floorTon,
          floorUsd: floorTon * tonRate,
          volume24hTon,
          volume24hUsd: volume24hTon * tonRate,
          change24hPct: Number(stats.change24h ?? stats.change_24h ?? data.change24h ?? data.change_24h ?? 0),
          sales24h: Number(stats.sales24h ?? stats.sales_24h ?? 0),
          totalSupply: Number(data.itemsCount ?? data.items_count ?? stats.itemsCount ?? 0),
          holders: Number(data.holders ?? data.ownersCount ?? stats.holders ?? stats.ownersCount ?? 0),
          listedCount: Number(data.listedCount ?? data.listed_count ?? stats.listedCount ?? 0),
          athFloorUsd: null,
          recentSales: [],
        }, "tgmrkt");
      }
    } catch {}
    try {
      const data = await tonApi(`/nfts/collections/${encodeURIComponent(chainAddress)}`);
      const collectionData = data?.collection || data || {};
      const rawFloor = collectionData.floor_price ?? collectionData.floorPrice;
      const floorTon = nanoTon(rawFloor);
      if (floorTon > 0) {
        const volume24hTon = nanoTon(collectionData.volume24h ?? collectionData.volume_24h);
        addGiftCandidate({
          floorTon,
          floorUsd: floorTon * tonRate,
          volume24hTon,
          volume24hUsd: volume24hTon * tonRate,
          change24hPct: Number(collectionData.change24h ?? collectionData.change_24h ?? 0),
          sales24h: Number(collectionData.sales24h ?? collectionData.sales_24h ?? 0),
          totalSupply: Number(collectionData.items_count ?? collectionData.itemsCount ?? 0),
          holders: Number(collectionData.owners_count ?? collectionData.ownersCount ?? 0),
          listedCount: Number(collectionData.listed_count ?? collectionData.listedCount ?? 0),
          athFloorUsd: null,
          recentSales: [],
        }, "tonapi");
      }
    } catch {}
    if (aliases.some((alias) => /fuse|ton of memes|good vibes|gold vibes|the meme ogs|tapps/i.test(String(alias || "")))) try {
      const data = await tonApi(`/nfts/collections/${encodeURIComponent(chainAddress)}/items?limit=100`);
      const saleRows = (data?.nft_items || [])
        .map((item) => {
          const price = item?.sale?.price || {};
          const value = Number(price.value || 0);
          const decimals = Number(price.decimals || 9);
          const token = String(price.token_name || "TON").toUpperCase();
          if (!value || token !== "TON") return null;
          return {
            ton: value / (10 ** decimals),
            market: item.sale?.market?.name || "Marketplace",
          };
        })
        .filter((row) => row?.ton > 0)
        .sort((a, b) => a.ton - b.ton);
      if (saleRows.length) {
        const floorTon = saleRows[0].ton;
        addGiftCandidate({
          floorTon,
          floorUsd: floorTon * tonRate,
          volume24hTon: 0,
          volume24hUsd: 0,
          change24hPct: 0,
          sales24h: 0,
          totalSupply: Number(data?.nft_items?.[0]?.collection?.next_item_index || 0),
          holders: 0,
          listedCount: saleRows.length,
          athFloorUsd: null,
          initUsd: 0,
          initTon: 0,
          marketPlatform: saleRows[0].market,
          marketUrl: "",
          recentSales: [],
        }, "tonapi-sale-floor");
      }
    } catch {}
  }
  try {
    const mrktCollections = await marketJson("https://api.tgmrkt.io/api/v1/gifts/collections", {}, 7000);
    const found = (mrktCollections || []).find((item) =>
      matches(item.title, item.name)
    );
    if (found) {
      const floorTon = nanoTon(found.floorPriceNanoTons);
      const previousFloorTon = nanoTon(found.previousDayFloorPriceNanoTons);
      if (floorTon > 0) addGiftCandidate({
        floorTon,
        floorUsd: floorTon * tonRate,
        volume24hTon: nanoTon(found.volume),
        volume24hUsd: nanoTon(found.volume) * tonRate,
        change24hPct: previousFloorTon > 0 ? ((floorTon - previousFloorTon) / previousFloorTon) * 100 : 0,
        sales24h: 0,
        totalSupply: 0,
        holders: 0,
        listedCount: 0,
        athFloorUsd: null,
        recentSales: [],
      }, "mrkt");
    }
  } catch {}
  const query = `query CollectionFloor($address: String!) {
    collection(address: $address) {
      address name floorPrice volume24h sales24h itemsCount ownersCount
      stats { floorPrice volume24h sales24h change24h allTimeHigh listedCount }
    }
  }`;
  try {
    const queryAddress = !isGiftLookup && collectionAddress && /^(?:0:|EQ|UQ)[A-Za-z0-9_:-]+$/.test(String(collectionAddress || "")) ? collectionAddress : "";
    if (!queryAddress) throw new Error("No collection address for Getgems floor query");
    const payload = await getgemsGraphql(query, { address: queryAddress });
    const c = payload?.data?.collection || {};
    const stats = c.stats || {};
    const floorTon = Number(c.floorPrice || stats.floorPrice || 0) / (Number(c.floorPrice || stats.floorPrice || 0) > 1e6 ? 1e9 : 1);
    const volume24hTon = Number(c.volume24h || stats.volume24h || 0) / (Number(c.volume24h || stats.volume24h || 0) > 1e6 ? 1e9 : 1);
    if (floorTon > 0) addGiftCandidate({
      floorTon,
      floorUsd: floorTon * tonRate,
      volume24hTon,
      volume24hUsd: volume24hTon * tonRate,
      change24hPct: Number(stats.change24h || 0),
      sales24h: Number(c.sales24h || stats.sales24h || 0),
      totalSupply: Number(c.itemsCount || 0),
      holders: Number(c.ownersCount || 0),
      listedCount: Number(stats.listedCount || 0),
      athFloorUsd: Number(stats.allTimeHigh || 0) ? (Number(stats.allTimeHigh) / 1e9) * tonRate : null,
      recentSales: [],
    }, "getgems");
  } catch {}
  const mergedGift = mergeGiftCandidates();
  return setCachedMapValue(collectibleFloorCache, key, mergedGift.floorTon > 0 || mergedGift.floorUsd > 0 || mergedGift.totalSupply > 0 || mergedGift.listedCount > 0 ? mergedGift : { ...zeroFloor(), marketPlatform: "", source: "" }, mergedGift.floorTon > 0 || mergedGift.floorUsd > 0 ? 3 * 60 * 1000 : 60 * 1000);
}

function marketSourceLabel(source = "") {
  const value = String(source || "").toLowerCase();
  if (value.includes("thermos")) return "Thermos";
  if (value.includes("tgmrkt") || value.includes("mrkt")) return "MRKT";
  if (value.includes("getgems")) return "Getgems";
  if (value.includes("tonapi")) return "TonAPI";
  if (value.includes("stickers-tools")) return "Stickers Tools";
  if (value.includes("stickerdom")) return "Stickerdom";
  if (value.includes("goodies")) return "Goodies";
  if (value.includes("fuse")) return "Fuse";
  return String(source || "");
}

function normalizeCollectibleAlias(value = "") {
  const text = String(value || "").toLowerCase().trim();
  if (!text) return "";
  return text
    .replace(/&/g, "and")
    .replace(/bunnies/g, "bunny")
    .replace(/ies\b/g, "y")
    .replace(/s\b/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function collectibleAliasKeys(aliases = []) {
  return [...new Set((aliases || []).map(normalizeCollectibleAlias).filter(Boolean))];
}

function collectibleAliasMatches(aliases = [], ...values) {
  const keys = collectibleAliasKeys(aliases);
  return values.some((value) => {
    const current = normalizeCollectibleAlias(value);
    return current && keys.includes(current);
  });
}

function collectibleAliasIncludes(aliases = [], ...values) {
  const keys = collectibleAliasKeys(aliases);
  return values.some((value) => {
    const current = normalizeCollectibleAlias(value);
    return current && keys.some((key) => key.includes(current) || current.includes(key));
  });
}

function giftTraitLookup(attributes = []) {
  const find = (label) => {
    const match = (attributes || []).find((trait) => String(trait?.label || trait?.trait_type || "").toLowerCase() === label);
    return String(match?.value || "").trim();
  };
  return {
    model: find("model"),
    backdrop: find("backdrop"),
    symbol: find("symbol"),
  };
}

async function seeTgJson(pathname, params = {}, tgauth = "", timeoutMs = 3500) {
  const query = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    query.set(key, String(value));
  });
  if (tgauth) query.set("tgauth", tgauth);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  try {
    return await externalJson(`https://poso.see.tg${pathname}${suffix}`, timeoutMs);
  } catch (error) {
    if (/tgauth required/i.test(String(error.message || ""))) return null;
    throw error;
  }
}

function seeTgItems(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  return payload.items || payload.data || payload.rows || payload.result || [];
}

function numberAtPath(object, path) {
  const value = String(path || "").split(".").reduce((current, key) => current?.[key], object);
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function textAtPath(object, path) {
  const value = String(path || "").split(".").reduce((current, key) => current?.[key], object);
  return String(value || "").trim();
}

function walkObjects(root, max = 1200) {
  const queue = [root];
  const seen = new Set();
  const objects = [];
  while (queue.length && objects.length < max) {
    const item = queue.shift();
    if (!item || typeof item !== "object" || seen.has(item)) continue;
    seen.add(item);
    objects.push(item);
    if (Array.isArray(item)) item.forEach((child) => queue.push(child));
    else Object.values(item).forEach((child) => queue.push(child));
  }
  return objects;
}

function scoreSeeGiftRow(row, aliases = [], traits = {}) {
  const nameScore = collectibleAliasMatches(aliases, row?.title, row?.name, row?.slug) ? 5
    : collectibleAliasIncludes(aliases, row?.title, row?.name, row?.slug) ? 3 : 0;
  const modelScore = traits.model && normalizeCollectibleAlias(row?.model_name) === normalizeCollectibleAlias(traits.model) ? 3 : 0;
  const backdropScore = traits.backdrop && normalizeCollectibleAlias(row?.backdrop_name) === normalizeCollectibleAlias(traits.backdrop) ? 2 : 0;
  const symbolScore = traits.symbol && normalizeCollectibleAlias(row?.pattern_name || row?.symbol_name) === normalizeCollectibleAlias(traits.symbol) ? 1 : 0;
  return nameScore + modelScore + backdropScore + symbolScore;
}

async function seeGiftContext({ aliases = [], itemName = "", collectionName = "", attributes = [], tgauth = "" } = {}) {
  if (!tgauth) return null;
  const traits = giftTraitLookup(attributes);
  const queries = [
    itemName ? { title: itemName, limit: 10 } : null,
    collectionName && collectionName !== itemName ? { title: collectionName, limit: 10 } : null,
  ].filter(Boolean);
  const rows = [];
  for (const params of queries) {
    try {
      rows.push(...seeTgItems(await seeTgJson("/api/gifts", params, tgauth)));
    } catch {}
  }
  if (!rows.length) return null;
  return rows
    .map((row) => ({ row, score: scoreSeeGiftRow(row, aliases, traits) }))
    .sort((a, b) => b.score - a.score)[0]?.row || null;
}

function seeMarketFloorPayload(payload, tonRate = 0) {
  const objects = walkObjects(payload);
  const candidates = objects.map((object) => {
    const floorTon = pickPositive(
      numberAtPath(object, "floor.ton"),
      numberAtPath(object, "ton"),
      nanoToTon(numberAtPath(object, "nanoton")),
      nanoToTon(numberAtPath(object, "floor.nanoton"))
    );
    const floorUsd = pickPositive(
      numberAtPath(object, "floor.usd"),
      numberAtPath(object, "usd"),
      floorTon > 0 && tonRate > 0 ? floorTon * tonRate : 0
    );
    if (floorTon <= 0 && floorUsd <= 0) return null;
    return {
      floorTon: floorTon || (tonRate > 0 ? floorUsd / tonRate : 0),
      floorUsd: floorUsd || (floorTon * tonRate),
      marketPlatform: marketSourceLabel(textAtPath(object, "market") || textAtPath(object, "marketplace") || textAtPath(object, "source") || "see.tg"),
      marketUrl: textAtPath(object, "url") || textAtPath(object, "market_url"),
      listedCount: Math.max(0, numberAtPath(object, "listed_count"), numberAtPath(object, "count")),
    };
  }).filter(Boolean);
  return candidates.sort((a, b) => a.floorTon - b.floorTon)[0] || null;
}


function seeFloorHistoryPoints(payload, tonRate = 0, preferredRange = "") {
  const floorRoot = payload?.floors && typeof payload.floors === "object" ? payload.floors : null;
  if (floorRoot) {
    const rangeOrder = [preferredRange, "7d", "30d", "24h", "12h"].filter((value, index, list) => value && list.indexOf(value) === index);
    for (const range of rangeOrder) {
      const rows = Array.isArray(floorRoot[range]) ? floorRoot[range] : [];
      const points = rows.map((item) => {
        const timestamp = new Date(item?.date || item?.timestamp || item?.time || 0).getTime();
        if (!Number.isFinite(timestamp)) return null;
        const marketRows = Object.entries(item || {})
          .filter(([key, value]) => !["date", "timestamp", "time", "average"].includes(key) && value && typeof value === "object")
          .map(([, value]) => ({
            ton: Number(value.ton || 0),
            usd: Number(value.usd || 0),
          }))
          .filter((value) => value.ton > 0 || value.usd > 0);
        const chosen = marketRows.sort((a, b) => {
          const aTon = a.ton || (tonRate > 0 ? a.usd / tonRate : Number.MAX_SAFE_INTEGER);
          const bTon = b.ton || (tonRate > 0 ? b.usd / tonRate : Number.MAX_SAFE_INTEGER);
          return aTon - bTon;
        })[0] || item.average || null;
        const ton = Number(chosen?.ton || 0);
        const usd = Number(chosen?.usd || 0);
        const priceUsd = usd || (ton > 0 && tonRate > 0 ? ton * tonRate : 0);
        if (!(priceUsd > 0)) return null;
        return {
          timestamp,
          priceTon: ton || (tonRate > 0 ? priceUsd / tonRate : 0),
          priceUsd,
        };
      }).filter(Boolean);
      if (points.length >= 2) return points.sort((a, b) => a.timestamp - b.timestamp);
    }
  }
  const arrays = walkObjects(payload).filter(Array.isArray);
  for (const array of arrays) {
    const points = array.map((item) => {
      if (!item || typeof item !== "object") return null;
      const rawTimestamp = item.timestamp || item.time || item.date || item.seen_at;
      const timestamp = Number(rawTimestamp);
      const parsedTimestamp = Number.isFinite(timestamp) ? timestamp : new Date(rawTimestamp || 0).getTime();
      const ton = pickPositive(numberAtPath(item, "ton"), numberAtPath(item, "floor_ton"), nanoToTon(numberAtPath(item, "nanoton")));
      const usd = pickPositive(numberAtPath(item, "usd"), numberAtPath(item, "floor_usd"), ton > 0 ? ton * tonRate : 0);
      const priceUsd = usd || (ton * tonRate);
      if (!Number.isFinite(parsedTimestamp) || !(priceUsd > 0)) return null;
      return {
        timestamp: parsedTimestamp > 1e12 ? parsedTimestamp : parsedTimestamp * 1000,
        priceTon: ton || (tonRate > 0 ? priceUsd / tonRate : 0),
        priceUsd,
      };
    }).filter(Boolean);
    if (points.length >= 2) return points.sort((a, b) => a.timestamp - b.timestamp);
  }
  return [];
}

async function seePublicFloorHistory(title = "", modelName = "", tonRate = 0, range = "7d") {
  const cleanTitle = String(title || "").trim();
  if (!cleanTitle) return [];
  try {
    const payload = await seeTgJson("/api/graphics/floors", {
      title: cleanTitle,
      model_name: modelName || "",
    }, "", 3500);
    return seeFloorHistoryPoints(payload, tonRate, range);
  } catch {
    return [];
  }
}

function floorHistoryMatchesCurrentFloor(points = [], currentFloorTon = 0, currentFloorUsd = 0, tolerance = 0.35) {
  if (!Array.isArray(points) || points.length < 2) return false;
  const latest = points[points.length - 1] || {};
  const latestTon = Number(latest.priceTon || 0);
  const latestUsd = Number(latest.priceUsd || 0);
  if (currentFloorTon > 0 && latestTon > 0) {
    return Math.abs(latestTon - currentFloorTon) / currentFloorTon <= tolerance;
  }
  if (currentFloorUsd > 0 && latestUsd > 0) {
    return Math.abs(latestUsd - currentFloorUsd) / currentFloorUsd <= tolerance;
  }
  return false;
}

function xgiftTonValue(...values) {
  for (const value of values) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) continue;
    return number > 1e6 ? number / 1e9 : number;
  }
  return 0;
}

function xgiftGiftRows(payload) {
  return walkObjects(payload)
    .filter((item) => item && typeof item === "object")
    .filter((item) =>
      item.slug
      || item.giftSlug
      || item.modelName
      || item.model_name
      || item.backdropName
      || item.backdrop_name
      || item.symbolName
      || item.symbol_name
    );
}

function scoreXgiftGiftRow(row, aliases = [], traits = {}) {
  const nameScore = collectibleAliasMatches(aliases, row?.title, row?.name, row?.collectionName, row?.collection_name, row?.slug) ? 5
    : collectibleAliasIncludes(aliases, row?.title, row?.name, row?.collectionName, row?.collection_name, row?.slug) ? 3 : 0;
  const modelScore = traits.model && normalizeCollectibleAlias(row?.modelName || row?.model_name) === normalizeCollectibleAlias(traits.model) ? 3 : 0;
  const backdropScore = traits.backdrop && normalizeCollectibleAlias(row?.backdropName || row?.backdrop_name) === normalizeCollectibleAlias(traits.backdrop) ? 2 : 0;
  const symbolScore = traits.symbol && normalizeCollectibleAlias(row?.symbolName || row?.symbol_name || row?.pattern_name) === normalizeCollectibleAlias(traits.symbol) ? 1 : 0;
  return nameScore + modelScore + backdropScore + symbolScore;
}

function xgiftBestGift(payload, aliases = [], traits = {}) {
  return xgiftGiftRows(payload)
    .map((row) => ({ row, score: scoreXgiftGiftRow(row, aliases, traits) }))
    .sort((a, b) => b.score - a.score)[0]?.row || null;
}

function xgiftFloorPayload(payload, tonRate = 0) {
  const objects = walkObjects(payload);
  const candidates = objects.map((object) => {
    const floorTon = xgiftTonValue(
      object?.floorPriceTon,
      object?.floor_price_ton,
      object?.estimatedPriceTon,
      object?.simpleEstimation?.price,
      object?.floorPrice,
      object?.floor_price,
      object?.priceTon,
      object?.price_ton,
      object?.floor?.ton,
      object?.floor?.priceTon,
      object?.floor?.price,
      object?.stats?.floorPrice,
      object?.stats?.floor_price,
    );
    const floorUsd = pickPositive(
      Number(object?.estimatedPriceUsd || 0),
      Number(object?.priceUsd || 0),
      Number(object?.price_usd || 0),
      Number(object?.floorUsd || 0),
      Number(object?.floor_usd || 0),
      Number(object?.floor?.usd || 0),
      floorTon > 0 && tonRate > 0 ? floorTon * tonRate : 0
    );
    if (!(floorTon > 0 || floorUsd > 0)) return null;
    return {
      floorTon: floorTon || (tonRate > 0 ? floorUsd / tonRate : 0),
      floorUsd: floorUsd || (floorTon * tonRate),
      volume24hTon: xgiftTonValue(object?.volume24hTon, object?.volume_24h_ton, object?.stats?.volume24h, object?.stats?.volume_24h, object?.volume24h, object?.volume_24h),
      volume24hUsd: pickPositive(
        Number(object?.volume24hUsd || 0),
        Number(object?.volume_24h_usd || 0),
        Number(object?.stats?.volume24hUsd || 0),
        0
      ),
      change24hPct: Number(object?.change24hPct ?? object?.change_24h_pct ?? object?.change24h ?? object?.change_24h ?? object?.stats?.change24h ?? 0),
      sales24h: Math.max(0, Number(object?.sales24h || object?.sales_24h || object?.stats?.sales24h || object?.stats?.sales_24h || 0)),
      totalSupply: Math.max(0, Number(object?.totalSupply || object?.supply || object?.itemsCount || object?.stats?.count || 0)),
      holders: Math.max(0, Number(object?.holders || object?.ownersCount || 0)),
      listedCount: Math.max(0, Number(object?.listedCount || object?.listed_count || object?.count || 0)),
      athFloorUsd: pickPositive(
        Number(object?.athFloorUsd || 0),
        Number(object?.allTimeHighUsd || 0),
        Number(object?.estimatedPriceUsd || 0)
      ),
      marketPlatform: marketSourceLabel(object?.market || object?.marketplace || object?.source || "xgift"),
      marketUrl: String(object?.url || object?.marketUrl || "").trim(),
    };
  }).filter(Boolean);
  return candidates.sort((a, b) => Number(a.floorTon || 0) - Number(b.floorTon || 0))[0] || null;
}

function xgiftFloorHistoryPoints(payload, tonRate = 0) {
  const arrays = walkObjects(payload).filter(Array.isArray);
  for (const array of arrays) {
    const points = array.map((item) => {
      if (!item || typeof item !== "object") return null;
      const timestamp = Number(item.timestamp || item.time || item.date || item.createdAt || item.created_at || item.at);
      const ton = xgiftTonValue(
        item?.floorPriceTon,
        item?.floor_price_ton,
        item?.floorPrice,
        item?.floor_price,
        item?.priceTon,
        item?.price_ton,
        item?.price,
        item?.ton
      );
      const usd = pickPositive(
        Number(item?.floorPriceUsd || 0),
        Number(item?.floor_price_usd || 0),
        Number(item?.priceUsd || 0),
        Number(item?.price_usd || 0),
        ton > 0 && tonRate > 0 ? ton * tonRate : 0
      );
      if (!Number.isFinite(timestamp) || !(usd > 0 || ton > 0)) return null;
      return {
        timestamp: timestamp > 1e12 ? timestamp : timestamp * 1000,
        priceTon: ton || (tonRate > 0 ? usd / tonRate : 0),
        priceUsd: usd || (ton * tonRate),
      };
    }).filter(Boolean);
    if (points.length >= 2) return points.sort((a, b) => a.timestamp - b.timestamp);
  }
  return [];
}

function xgiftSalesRows(payload, tonRate = 0, traitFilter = null) {
  const matchesTraits = (row = {}) => {
    if (!traitFilter) return true;
    const modelOk = !traitFilter.model || normalizeCollectibleAlias(row?.modelName || row?.model_name) === normalizeCollectibleAlias(traitFilter.model);
    const backdropOk = !traitFilter.backdrop || normalizeCollectibleAlias(row?.backdropName || row?.backdrop_name) === normalizeCollectibleAlias(traitFilter.backdrop);
    const symbolOk = !traitFilter.symbol || normalizeCollectibleAlias(row?.symbolName || row?.symbol_name || row?.pattern_name) === normalizeCollectibleAlias(traitFilter.symbol);
    return modelOk && backdropOk && symbolOk;
  };
  return walkObjects(payload)
    .filter((item) => item && typeof item === "object")
    .filter((item) => matchesTraits(item))
    .map((item) => {
      const priceTon = xgiftTonValue(
        item?.salePriceTon,
        item?.sale_price_ton,
        item?.priceTon,
        item?.price_ton,
        item?.price,
        item?.salePrice,
        item?.sale_price
      );
      const priceUsd = pickPositive(
        Number(item?.salePriceUsd || 0),
        Number(item?.sale_price_usd || 0),
        Number(item?.priceUsd || 0),
        Number(item?.price_usd || 0),
        priceTon > 0 && tonRate > 0 ? priceTon * tonRate : 0
      );
      const timestamp = item?.soldAt || item?.saleDate || item?.date || item?.createdAt || item?.created_at || item?.timestamp;
      if (!(priceTon > 0 || priceUsd > 0) || !timestamp) return null;
      return {
        priceTon: priceTon || (tonRate > 0 ? priceUsd / tonRate : 0),
        priceUsd: priceUsd || (priceTon * tonRate),
        date: timestamp,
        marketplace: marketSourceLabel(item?.market || item?.marketplace || item?.source || "xgift"),
        buyer: item?.buyer || item?.buyerAddress || "",
        seller: item?.seller || item?.sellerAddress || "",
        mint: Number(item?.number || item?.mint || item?.giftNumber || 0),
        model: item?.modelName || item?.model_name || "",
        backdrop: item?.backdropName || item?.backdrop_name || "",
        symbol: item?.symbolName || item?.symbol_name || item?.pattern_name || "",
      };
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime())
    .slice(0, 5);
}

function seeHistorySales(payload, tonRate = 0, traits = {}) {
  const rows = seeTgItems(payload);
  return rows.map((row) => {
    const priceTon = pickPositive(
      numberAtPath(row, "price.ton"),
      numberAtPath(row, "ton"),
      nanoToTon(numberAtPath(row, "nanoton")),
      nanoToTon(numberAtPath(row, "price.nanoton"))
    );
    if (priceTon <= 0) return null;
    return {
      priceTon,
      priceUsd: priceTon * tonRate,
      date: row.seen_at || row.updated_at || row.date || row.timestamp || "",
      marketplace: marketSourceLabel(row.market || row.marketplace || row.source || "see.tg"),
      buyer: row.owner?.username || row.owner?.name || row.owner_id || "",
      seller: row.prev_owner?.username || row.prev_owner?.name || row.prev_owner_id || "",
      mint: Number(row.num || row.number || 0),
      model: row.model_name || traits.model || "",
      backdrop: row.backdrop_name || traits.backdrop || "",
      symbol: row.pattern_name || row.symbol_name || traits.symbol || "",
    };
  }).filter(Boolean).slice(0, 5);
}

function pickPositive(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) return number;
  }
  return 0;
}

function pickText(...values) {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }
  return "";
}

async function collectibleSales(collection, traits = "") {
  const collectionObject = typeof collection === "object" ? collection : {};
  const collectionKey = typeof collection === "object"
    ? [collection.address, collection.name, collection.item, collection.title].filter(Boolean).join("|")
    : String(collection || "");
  const key = `${collectionKey}:${traits}`;
  const cached = cachedMapValue(collectibleSalesCache, key);
  if (cached) return cached;
  const tonRate = await tonUsdRate();
  const aliases = typeof collection === "object"
    ? [collection.address, collection.name, collection.item, collection.title].filter(Boolean)
    : [collection].filter(Boolean);
  let traitFilter = null;
  try {
    const parsed = JSON.parse(traits || "null");
    if (Array.isArray(parsed)) {
      const byName = new Map(parsed.map((trait) => [String(trait.label || trait.trait_type || "").toLowerCase(), String(trait.value || "").trim().toLowerCase()]));
      traitFilter = {
        model: byName.get("model") || "",
        backdrop: byName.get("backdrop") || "",
        symbol: byName.get("symbol") || "",
      };
    }
  } catch {}
  const matchesTraits = (gift = {}) => {
    if (!traitFilter) return true;
    const modelOk = !traitFilter.model || String(gift.modelName || gift.modelTitle || "").trim().toLowerCase() === traitFilter.model;
    const backdropOk = !traitFilter.backdrop || String(gift.backdropName || "").trim().toLowerCase() === traitFilter.backdrop;
    const symbolOk = !traitFilter.symbol || String(gift.symbolName || "").trim().toLowerCase() === traitFilter.symbol;
    return modelOk && backdropOk && symbolOk;
  };
  if (collectionObject.kind === "gift" && collectionObject.tgauth) {
    try {
      const seeGift = await seeGiftContext({
        aliases,
        itemName: collectionObject.item || "",
        collectionName: collectionObject.name || "",
        attributes: traitFilter ? [
          { label: "Model", value: traitFilter.model },
          { label: "Backdrop", value: traitFilter.backdrop },
          { label: "Symbol", value: traitFilter.symbol },
        ].filter((trait) => trait.value) : [],
        tgauth: collectionObject.tgauth,
      });
      if (seeGift?.gift_id) {
        const historyPayload = await seeTgJson("/api/history", {
          gift_id: seeGift.gift_id,
          limit: 10,
          order: "desc",
        }, collectionObject.tgauth);
        const seeRows = seeHistorySales(historyPayload, tonRate, traitFilter || {});
        if (seeRows.length) return setCachedMapValue(collectibleSalesCache, key, seeRows, 3 * 60 * 1000);
      }
    } catch {}
  }
  try {
    const feed = await marketJson("https://api.tgmrkt.io/api/v1/feed", { method: "POST", body: { count: 40, cursor: "" } }, 7000);
    const rows = (feed.items || [])
      .filter((item) => String(item.type || "").toLowerCase() === "sale")
      .filter((item) => collectibleAliasMatches(aliases, item.gift?.collectionTitle, item.gift?.collectionName, item.gift?.title, item.gift?.name) || collectibleAliasIncludes(aliases, item.gift?.collectionTitle, item.gift?.collectionName, item.gift?.title, item.gift?.name))
      .filter((item) => matchesTraits(item.gift || {}))
      .slice(0, 5)
      .map((item) => {
        const ton = nanoTon(item.price || item.offer?.price || item.gift?.salePrice);
        return {
          priceTon: ton,
          priceUsd: ton * tonRate,
          date: item.createdAt || item.date || item.gift?.receivedDate,
          marketplace: "MRKT",
          buyer: item.buyer,
          seller: item.seller,
          mint: Number(item.gift?.number || 0),
          model: item.gift?.modelName || "",
          backdrop: item.gift?.backdropName || "",
          symbol: item.gift?.symbolName || "",
        };
      });
    if (rows.length) return setCachedMapValue(collectibleSalesCache, key, rows, 3 * 60 * 1000);
  } catch {}
  const query = `query CollectionSales($address: String!) {
    sales(collectionAddress: $address, first: 5) {
      edges { node { price timestamp marketplace buyer seller } }
      items { price timestamp marketplace buyer seller }
    }
  }`;
  try {
    const payload = await getgemsGraphql(query, { address: collectionObject.address || collectionKey });
    const root = payload?.data?.sales;
    const rows = root?.edges?.map((edge) => edge.node) || root?.items || [];
    return setCachedMapValue(collectibleSalesCache, key, rows.slice(0, 5).map((sale) => {
      const ton = Number(sale.price || 0) / (Number(sale.price || 0) > 1e6 ? 1e9 : 1);
      return { priceTon: ton, priceUsd: ton * tonRate, date: sale.timestamp, marketplace: sale.marketplace || "Getgems", buyer: sale.buyer, seller: sale.seller, mint: 0, model: "", backdrop: "", symbol: "" };
    }), 3 * 60 * 1000);
  } catch (error) {
    return setCachedMapValue(collectibleSalesCache, key, [], 60 * 1000);
  }
}

async function accountNftHistory(address) {
  const key = `${canonicalAddressKey(address)}:nft-history-v1`;
  const cached = cachedMapValue(nftHistoryCache, key);
  if (cached) return cached;
  try {
    const payload = await tonApi(`/accounts/${encodeURIComponent(address)}/nfts/history?limit=200`);
    const operations = Array.isArray(payload?.operations) ? payload.operations : [];
    return setCachedMapValue(nftHistoryCache, key, operations, 5 * 60 * 1000);
  } catch (error) {
    return setCachedMapValue(nftHistoryCache, key, [], 60 * 1000);
  }
}

function attrPercent(attr = {}) {
  const raw = String(attr?.rarity || attr?.percent || "");
  const match = raw.match(/([\d.]+)\s*%/);
  return match ? Number(match[1]) : null;
}

function estimatedGiftCombo(attributes = [], totalSupply = 0) {
  const percents = attributes.map(attrPercent).filter((value) => Number.isFinite(value) && value > 0);
  if (!percents.length || !Number(totalSupply)) return { expectedCount: null, percentile: null };
  const probability = percents.reduce((product, value) => product * (value / 100), 1);
  const expectedCount = Math.max(1, Math.round(Number(totalSupply) * probability));
  const percentile = Math.min(100, probability * 100);
  return { expectedCount, percentile };
}

function firstMarketUrl(floor = {}) {
  if (floor.marketUrl) return floor.marketUrl;
  return "";
}

function salesDerivedFloorHistory(sales = [], floor = {}, range = "7d") {
  const currentUsd = Number(floor.floorUsd || 0);
  const currentTon = Number(floor.floorTon || 0);
  const days = range === "30d" ? 30 : 7;
  const start = Date.now() - days * 24 * 60 * 60 * 1000;
  const buckets = new Map();
  (sales || []).forEach((sale) => {
    const timestamp = new Date(sale.date || 0).getTime();
    const priceUsd = Number(sale.priceUsd || 0);
    const priceTon = Number(sale.priceTon || 0);
    if (!Number.isFinite(timestamp) || timestamp < start || !(priceUsd > 0 || priceTon > 0)) return;
    const day = new Date(timestamp).toISOString().slice(0, 10);
    const existing = buckets.get(day);
    if (!existing || Number(priceUsd || Number.MAX_SAFE_INTEGER) < Number(existing.priceUsd || Number.MAX_SAFE_INTEGER)) {
      buckets.set(day, { timestamp, priceUsd, priceTon });
    }
  });
  const points = [...buckets.values()].sort((a, b) => a.timestamp - b.timestamp);
  if (currentUsd > 0 || currentTon > 0) {
    points.push({
      timestamp: Date.now(),
      priceUsd: currentUsd,
      priceTon: currentTon,
    });
  }
  const unique = points
    .filter((point) => Number(point.priceUsd || 0) > 0)
    .sort((a, b) => a.timestamp - b.timestamp)
    .reduce((list, point) => {
      const last = list[list.length - 1];
      if (last && Math.abs(last.timestamp - point.timestamp) < 1000) last.priceUsd = point.priceUsd;
      else list.push(point);
      return list;
    }, []);
  return unique.length >= 2 ? unique : [];
}

async function giftDetailData({ walletAddress, nftAddress, collectionAddress = "", collectionName = "", itemName = "", attributes = [], tgauth = "", range = "7d" }) {
  const traitPayload = JSON.stringify(Array.isArray(attributes) ? attributes : []);
  const giftLookup = collectionAddress || collectionName || itemName
    ? { address: collectionAddress || collectionName || itemName, name: collectionName, item: itemName, kind: "gift", attributes, tgauth, period: range }
    : collectionName || itemName;
  const [floorResult, salesResult, historyResult] = await Promise.allSettled([
    collectibleFloor(giftLookup),
    collectibleSales(giftLookup, traitPayload),
    accountNftHistory(walletAddress),
  ]);
  const floor = floorResult.status === "fulfilled" ? floorResult.value || {} : {};
  const sales = salesResult.status === "fulfilled" ? salesResult.value || [] : [];
  const operations = historyResult.status === "fulfilled" ? historyResult.value || [] : [];
  const nftOps = operations.filter((operation) => sameAddress(operation?.item?.address, nftAddress)).sort((a, b) => Number(b.utime || 0) - Number(a.utime || 0));
  const inbound = nftOps.find((operation) => sameAddress(operation?.destination?.address, walletAddress));
  const senderAddress = inbound?.source?.address || "";
  const senderName = inbound?.source?.name || (senderAddress ? await resolveTonName(senderAddress) : "");
  const receivedOn = inbound?.utime ? new Date(Number(inbound.utime) * 1000).toISOString() : "";
  const combo = estimatedGiftCombo(attributes, Number(floor.totalSupply || 0));
  const fragmentUrl = firstMarketUrl(floor) && /fragment/i.test(String(floor.marketPlatform || "")) ? firstMarketUrl(floor) : "";
  const getgemsUrl = collectionAddress ? `https://getgems.io/collection/${encodeURIComponent(collectionAddress)}` : "";
  const xgiftUrl = collectionName ? `https://xgift.tg/?collection=${encodeURIComponent(collectionName)}` : "";
  const sales24hRows = sales.filter((sale) => {
    const timestamp = new Date(sale.date || 0).getTime();
    return Number.isFinite(timestamp) && timestamp >= Date.now() - 24 * 60 * 60 * 1000;
  });
  let floorHistory = Array.isArray(floor.floorHistory) ? floor.floorHistory : [];
  let floorHistorySource = floor.floorHistorySource || "";
  if (floorHistory.length < 2) {
    floorHistory = salesDerivedFloorHistory(sales, floor, range);
    floorHistorySource = floorHistory.length >= 2 ? "sales-derived" : "";
  }
  if (floorHistory.length < 2) {
    floorHistory = await giftSnapshotHistory(floor.canonicalName || collectionName || itemName, range);
    floorHistorySource = floorHistory.length >= 2 ? "tontrack-snapshots" : "";
  }
  return {
    floor,
    sales,
    salesStats: {
      sales24h: sales24hRows.length,
      volume24hTon: sales24hRows.reduce((sum, sale) => sum + Number(sale.priceTon || 0), 0),
      volume24hUsd: sales24hRows.reduce((sum, sale) => sum + Number(sale.priceUsd || 0), 0),
    },
    salesScope: sales.some((sale) => sale.model || sale.backdrop || sale.symbol) ? "same-traits" : "collection",
    floorHistory,
    floorHistorySource,
    origin: {
      senderAddress,
      senderName,
      receivedOn,
      txHash: inbound?.transaction_hash || "",
      sourceLabel: inbound ? "onchain-history" : "",
    },
    rarity: {
      expectedComboCount: combo.expectedCount,
      comboPercentile: combo.percentile,
      totalSupply: Number(floor.totalSupply || 0),
    },
    links: {
      xgift: xgiftUrl,
      fragment: fragmentUrl,
      getgems: getgemsUrl,
    },
  };
}

async function handleApi(req, res, url) {
  if (req.method === "OPTIONS") return json(res, 204, {});
  if (url.pathname === "/api/gift-registry/history" && req.method === "GET") {
    const registryUrl = d1GiftRegistryUrl || publicGiftRegistryUrl;
    try {
      const params = new URLSearchParams({
        collection: url.searchParams.get("collection") || "",
        model: url.searchParams.get("model") || "",
        backdrop: url.searchParams.get("backdrop") || "",
      });
      const payload = await marketJson(`${registryUrl}/history?${params}`, {}, 5000);
      return json(res, 200, Array.isArray(payload) ? payload : []);
    } catch {
      return json(res, 502, []);
    }
  }
  if (url.pathname === "/api/gift-registry/combos" && req.method === "POST") {
    const registryUrl = d1GiftRegistryUrl || publicGiftRegistryUrl;
    try {
      const body = await readJsonBody(req);
      const pairs = requestedGiftModelPairs(body.pairs).slice(0, 5000).map((pair) => ({
        collection: pair.collection,
        model: pair.model,
        backdrop: pair.backdrop,
      }));
      const combinations = [];
      const coverage = new Map();
      for (let index = 0; index < pairs.length; index += 500) {
        const payload = await marketJson(`${registryUrl}/combos`, {
          method: "POST",
          body: { pairs: pairs.slice(index, index + 500) },
        }, 5000);
        if (Array.isArray(payload?.combinations)) combinations.push(...payload.combinations);
        (Array.isArray(payload?.coverage) ? payload.coverage : []).forEach((entry) => {
          if (entry?.collectionKey && entry?.snapshotAt) coverage.set(giftSnapshotKey(entry.collectionKey), entry.snapshotAt);
        });
      }
      return json(res, 200, {
        combinations,
        coverage: [...coverage].map(([collectionKey, snapshotAt]) => ({ collectionKey, snapshotAt })),
      });
    } catch {
      return json(res, 502, { error: "Gift registry lookup failed", combinations: [] });
    }
  }
  if (url.pathname === "/api/gift-model-floors/bulk" && req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      const pairs = requestedGiftModelPairs(body.pairs);
      const models = await bulkStoredGiftModelFloors(pairs);
      const [comboLookup, rate] = await Promise.all([
        d1GiftComboFloors(pairs),
        tonUsdRate(),
      ]);
      const comboFloors = comboLookup.combinations;
      const combosByKey = new Map(comboFloors.map((combo) => [
        [combo.collection, combo.model, combo.backdrop].map(giftSnapshotKey).join(":"),
        combo,
      ]));
      const coveredCollectionKeys = new Set((comboLookup.coverage || []).map((entry) => giftSnapshotKey(entry.collectionKey)));
      const isPairCovered = (pair) => [pair.collection, pair.collectionKey, ...(pair.collectionKeys || [])]
        .map(giftSnapshotKey)
        .some((collectionKey) => coveredCollectionKeys.has(collectionKey));
      const healingScheduled = scheduleGiftComboFloorHeal(pairs, combosByKey, rate);
      const responseModels = pairs.map((pair) => {
        const stored = models.find((model) => (
          model.modelKey === pair.modelKey
          && [pair.collectionKey, ...(pair.collectionKeys || [])].includes(model.collectionKey)
        )) || {};
        const collectionAliases = [...new Set([
          pair.collection,
          pair.collectionKey,
          ...(pair.collectionKeys || []),
          ...giftCollectionAliasKeys(pair.collection),
        ].filter(Boolean))];
        const combo = collectionAliases
          .map((collection) => combosByKey.get([collection, pair.model, pair.backdrop].map(giftSnapshotKey).join(":")))
          .find(Boolean);
        const model = {
          ...stored,
          requestKey: [pair.collectionKey, pair.modelKey, pair.backdropKey].join(":"),
          collection: pair.collection,
          collectionKey: pair.collectionKey,
          model: pair.model,
          modelKey: pair.modelKey,
          backdrop: pair.backdrop,
          symbol: pair.symbol,
          traitMetrics: stored.traitMetrics || {},
          traitRarities: stored.traitRarities || {},
        };
        if (!combo) {
          model.floorTon = 0;
          model.floorUsd = 0;
          model.listedCount = 0;
          model.source = hasRecentGiftComboExactMiss(pair)
            ? "d1-combo-missing"
            : "combo-floor-pending";
          model.marketPlatform = "";
          model.marketUrl = "";
          model.listingId = "";
          model.marketUpdatedAt = "";
          return model;
        }
        model.floorTon = Number(combo.floorTon || 0);
        model.floorUsd = model.floorTon * rate;
        model.tonUsdRate = rate;
        model.listedCount = Number(combo.listedCount || 0);
        model.source = "d1-backdrop-floor";
        model.marketPlatform = combo.marketplace || model.marketPlatform || "";
        model.marketUrl = combo.listingUrl || model.marketUrl || "";
        model.listingId = combo.listingId || "";
        model.marketUpdatedAt = combo.snapshotAt || model.marketUpdatedAt || "";
        return model;
      });
      const found = new Map(responseModels.map((model) => [
        [model.collectionKey, model.modelKey, giftSnapshotKey(model.backdrop)].join(":"),
        model,
      ]));
      const pending = pairs.filter((pair) => {
        const model = found.get([pair.collectionKey, pair.modelKey, pair.backdropKey].join(":"));
        if (!model) return true;
        return pair.backdropKey && model.source === "combo-floor-pending";
      });
      [...new Set(pending.filter((pair) => !pair.backdropKey).map((pair) => pair.collection))].forEach((collection) => {
        recoverGiftModelCollection(collection);
      });
      return json(res, 200, {
        source: "tontrack-snapshots",
        healingScheduled,
        models: responseModels,
        pending: pending.map(({ collection, model, backdrop, symbol, collectionKey, modelKey }) => ({
          collection,
          model,
          backdrop,
          symbol,
          collectionKey,
          modelKey,
        })),
      });
    } catch (error) {
      return json(res, 400, { error: error.message, models: [], pending: [] });
    }
  }
  if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });
  if (url.pathname === "/api/health") {
    return json(res, 200, { ok: true, service: "tontrack-api", time: new Date().toISOString() });
  }
  if (url.pathname === "/api/wallet") {
    const rawAddress = url.searchParams.get("address");
    if (!rawAddress) return json(res, 400, { error: "Missing address query parameter" });
    try {
      const address = await resolveWalletAddress(rawAddress);
      return json(res, 200, await walletImport(address));
    } catch (error) {
      return json(res, error.message.includes("Invalid TON") ? 400 : 502, { error: error.message });
    }
  }
  if (url.pathname === "/api/wallet/activity") {
    const rawAddress = url.searchParams.get("address");
    const limit = Number(url.searchParams.get("limit") || 1000);
    if (!rawAddress) return json(res, 400, { error: "Missing address query parameter" });
    try {
      const address = parseTonAddress(rawAddress);
      return json(res, 200, await walletActivity(address, limit));
    } catch (error) {
      return json(res, error.message.includes("Invalid TON") ? 400 : 502, { error: error.message });
    }
  }
  if (url.pathname === "/api/transaction-detail") {
    const hash = url.searchParams.get("hash");
    if (!hash) return json(res, 400, { error: "Missing hash query parameter" });
    try {
      return json(res, 200, await transactionDetail(hash));
    } catch (error) {
      return json(res, 502, { error: error.message });
    }
  }
  if (url.pathname === "/api/token-detail-data") {
    try {
      return json(res, 200, await tokenDetailData(url));
    } catch (error) {
      return json(res, 502, { error: error.message });
    }
  }
  if (url.pathname === "/api/collectibles") {
    const rawAddress = url.searchParams.get("address");
    if (!rawAddress) return json(res, 400, { error: "Missing address query parameter" });
    try {
      return json(res, 200, await getCollectiblesShared(parseTonAddress(rawAddress)));
    } catch (error) {
      return json(res, 502, { gifts: [], stickers: [], error: error.message });
    }
  }
  if (url.pathname === "/api/nfts") {
    const rawAddress = url.searchParams.get("address");
    if (!rawAddress) return json(res, 400, { error: "Missing address query parameter" });
    try {
      return json(res, 200, await walletNftsByType(parseTonAddress(rawAddress)));
    } catch (error) {
      return json(res, 502, { gifts: [], stickers: [], otherCount: 0, error: error.message });
    }
  }
  if (url.pathname === "/api/collectibles-registry") {
    return json(res, 200, await refreshCollectiblesRegistry(url.searchParams.get("refresh") === "1"));
  }
  if (url.pathname === "/api/sticker-collections-registry") {
    try {
      if (url.searchParams.get("refresh") === "1" || !fs.existsSync(stickerCollectionsRegistryFile)) {
        return json(res, 200, await refreshStickerCollectionsRegistryFile(true));
      }
      return json(res, 200, JSON.parse(fs.readFileSync(stickerCollectionsRegistryFile, "utf8")));
    } catch (error) {
      return json(res, 502, { error: error.message });
    }
  }
  if (url.pathname === "/api/gift-floor-snapshots") {
    try {
      if (url.searchParams.get("collect") === "1") {
        collectGiftFloorSnapshotsNow({ force: url.searchParams.get("force") === "1" }).catch((error) => {
          giftSnapshotCollectorState.status = "error";
          giftSnapshotCollectorState.error = error.message;
          giftSnapshotCollectorState.completedAt = new Date().toISOString();
        });
      }
      const collection = url.searchParams.get("collection") || "";
      if (collection) {
        const status = await giftSnapshotStoreStatus(collection);
        return json(res, 200, { state: giftSnapshotCollectorState, ...status });
      }
      const status = await giftSnapshotStoreStatus();
      return json(res, 200, {
        state: giftSnapshotCollectorState,
        ...status,
      });
    } catch (error) {
      return json(res, 502, { error: error.message });
    }
  }
  if (url.pathname === "/api/snapshot-storage-status") {
    try {
      return json(res, 200, await giftSnapshotStorageHealth());
    } catch (error) {
      return json(res, 502, { error: error.message });
    }
  }
  if (url.pathname === "/api/gift-model-floors") {
    const collection = url.searchParams.get("collection") || url.searchParams.get("name") || "";
    if (!collection) return json(res, 400, { error: "Missing collection query parameter" });
    try {
      const models = await latestGiftModelFloors(collection);
      return json(res, 200, {
        collection,
        collectionKey: giftSnapshotKey(collection),
        source: models.length ? "thermos-model" : "thermos-model-missing",
        cacheOnly: false,
        missing: !models.length,
        models,
      });
    } catch (error) {
      return json(res, 502, { error: error.message, collection, models: [] });
    }
  }
  if (url.pathname === "/api/collection-floor") {
    const collection = url.searchParams.get("collection");
    if (!collection) return json(res, 400, { error: "Missing collection query parameter" });
    const name = url.searchParams.get("name");
    const item = url.searchParams.get("item");
    const kind = url.searchParams.get("kind");
    const period = url.searchParams.get("period") || url.searchParams.get("range") || "7d";
    let attributes = [];
    try {
      attributes = JSON.parse(url.searchParams.get("attributes") || "[]");
      if (!Array.isArray(attributes)) attributes = [];
    } catch {
      attributes = [];
    }
    return json(res, 200, await collectibleFloor(name || item || kind ? { address: collection, name, item, kind, period, attributes } : collection));
  }
  if (url.pathname === "/api/collectible-floor") {
    const collection = url.searchParams.get("collection");
    if (!collection) return json(res, 400, { error: "Missing collection query parameter" });
    const name = url.searchParams.get("name");
    const item = url.searchParams.get("item");
    const kind = url.searchParams.get("kind");
    const period = url.searchParams.get("period") || url.searchParams.get("range") || "7d";
    let attributes = [];
    try {
      attributes = JSON.parse(url.searchParams.get("attributes") || "[]");
      if (!Array.isArray(attributes)) attributes = [];
    } catch {
      attributes = [];
    }
    return json(res, 200, await collectibleFloor(name || item || kind ? { address: collection, name, item, kind, period, attributes } : collection));
  }
  if (url.pathname === "/api/collection-sales") {
    const collection = url.searchParams.get("collection");
    if (!collection) return json(res, 400, { error: "Missing collection query parameter" });
    return json(res, 200, await collectibleSales(collection, url.searchParams.get("traits") || ""));
  }
  if (url.pathname === "/api/collectible-sales") {
    const collection = url.searchParams.get("collection");
    if (!collection) return json(res, 400, { error: "Missing collection query parameter" });
    return json(res, 200, await collectibleSales(collection, url.searchParams.get("traits") || ""));
  }
  if (url.pathname === "/api/gift-detail-data") {
    const wallet = url.searchParams.get("wallet");
    const nft = url.searchParams.get("nft");
    if (!wallet || !nft) return json(res, 400, { error: "Missing wallet or nft query parameter" });
    const collection = url.searchParams.get("collection") || "";
    const item = url.searchParams.get("item") || "";
    let attributes = [];
    try {
      attributes = JSON.parse(url.searchParams.get("attributes") || "[]");
      if (!Array.isArray(attributes)) attributes = [];
    } catch {
      attributes = [];
    }
    try {
      return json(res, 200, await giftDetailData({
        walletAddress: parseTonAddress(wallet),
        nftAddress: nft,
        collectionAddress: collection,
        collectionName: collection,
        itemName: item,
        attributes,
        tgauth: url.searchParams.get("tgauth") || "",
        range: url.searchParams.get("range") || "7d",
      }));
    } catch (error) {
      return json(res, 502, { error: error.message });
    }
  }
  if (url.pathname === "/api/asset-media") {
    const target = String(url.searchParams.get("url") || "").trim();
    if (!/^https?:\/\//i.test(target)) return json(res, 400, { error: "Missing or invalid media url" });
    try {
      const response = await fetch(target, {
        headers: {
          "user-agent": "TonTrack/1.0",
          "accept": "*/*",
        },
      });
      if (!response.ok) return json(res, 502, { error: `Media fetch failed (${response.status})` });
      const contentType = response.headers.get("content-type") || (target.endsWith(".json") ? "application/json; charset=utf-8" : "application/octet-stream");
      const buffer = Buffer.from(await response.arrayBuffer());
      res.writeHead(200, {
        "content-type": contentType,
        "cache-control": "public, max-age=3600",
      });
      return res.end(buffer);
    } catch (error) {
      return json(res, 502, { error: error.message });
    }
  }
  if (url.pathname === "/api/wallet/history-status") {
    const rawAddress = url.searchParams.get("address");
    if (!rawAddress) return json(res, 400, { error: "Missing address query parameter" });
    try {
      const address = parseTonAddress(rawAddress);
      const ranges = historyRanges.map((range) => {
        const status = historyJobStatus(address, range);
        return {
          range,
          status: status.status,
          source: status.source,
          pointsCount: status.points?.length || 0,
          error: status.error || null,
        };
      });
      const readyCount = ranges.filter((item) => item.status === "ready").length;
      return json(res, 200, {
        address,
        ranges,
        readyCount,
        total: ranges.length,
        progress: Math.round((readyCount / ranges.length) * 100),
        isComplete: readyCount === ranges.length,
      });
    } catch (error) {
      return json(res, error.message.includes("Invalid TON") ? 400 : 502, { error: error.message });
    }
  }
  if (url.pathname === "/api/wallet/history") {
    const rawAddress = url.searchParams.get("address");
    const range = url.searchParams.get("range") || "1D";
    if (!rawAddress) return json(res, 400, { error: "Missing address query parameter" });
    try {
      const address = parseTonAddress(rawAddress);
      const cachedStatus = historyJobStatus(address, range);
      if (cachedStatus.status === "ready") return json(res, 200, { address, range, status: "ready", source: cachedStatus.source, points: cachedStatus.points });
      if (["queued", "building"].includes(cachedStatus.status)) {
        const activeJob = walletHistoryJobs.get(historyCacheKey(address, range));
        if (activeJob?.points?.length) {
          return json(res, 200, { address, range, status: "partial", source: "exact-progress", points: activeJob.points });
        }
        if (activeJob?.approxPoints?.length) {
          return json(res, 200, { address, range, status: "partial", source: "approx-current-holdings", points: activeJob.approxPoints });
        }
        if (activeJob?.jettons) {
          activeJob.approxPoints = await approximateWalletHistory(activeJob.address || address, activeJob.currentTonBalance || 0, range, activeJob.jettons || []);
          return json(res, 200, { address, range, status: "partial", source: "approx-current-holdings", points: activeJob.approxPoints });
        }
        return json(res, 202, { address, range, status: cachedStatus.status, points: [] });
      }
      const account = await tonApi(`/accounts/${encodeURIComponent(address)}`);
      const normalizedAccount = normalizeAccount(account, address);
      const cacheAddress = String(normalizedAccount.address || address).toLowerCase();
      let jettons = walletJettonsCache.get(cacheAddress) || [];
      try {
        const jettonsPayload = await tonApi(`/accounts/${encodeURIComponent(address)}/jettons`);
        jettons = await enrichJettonRates(normalizeJettons(jettonsPayload));
        if (jettons.length) {
          walletJettonsCache.set(cacheAddress, jettons);
          clearWalletHistoryCache(normalizedAccount.address || address);
        }
      } catch (error) {
        console.warn(`Current Jettons unavailable for history; using cached Jettons if present: ${error.message}`);
      }
      if (fastGraphHistoryOnly) {
        const points = await approximateWalletHistory(normalizedAccount.address || address, normalizedAccount.balanceTon, range, jettons);
        walletHistoryCache.set(historyCacheKey(normalizedAccount.address || address, range), { points, expiresAt: Date.now() + walletHistoryTtl, source: "fast-current-holdings" });
        return json(res, 200, { address, range, status: "ready", source: "fast-current-holdings", points });
      }
      const job = startHistoryJob(normalizedAccount.address || address, normalizedAccount.balanceTon, range, jettons);
      if (!job.approxPoints?.length) job.approxPoints = await approximateWalletHistory(normalizedAccount.address || address, normalizedAccount.balanceTon, range, jettons);
      if (job.approxPoints?.length) return json(res, 200, { address, range, status: "partial", source: "approx-current-holdings", points: job.approxPoints });
      return json(res, 202, { address, range, status: job.status || "queued", points: [] });
    } catch (error) {
      return json(res, error.message.includes("Invalid TON") ? 400 : 502, { error: error.message });
    }
  }
  return json(res, 404, { error: "API route not found" });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith("/api/")) {
    handleApi(req, res, url).catch((error) => json(res, 500, { error: error.message }));
    return;
  }
  if (url.pathname === "/tonconnect-manifest.json") {
    tonConnectManifest(req, res);
    return;
  }
  serveStatic(req, res);
});

function startServer() {
  server.listen(port, "0.0.0.0", () => {
    if (isRailwayRuntime || process.stdout.isTTY) {
      console.log(`TonTrack backend running at http://127.0.0.1:${port}`);
    }
    if (registryPreloadRequested || giftSnapshotAutorun) {
      setTimeout(() => {
        if (registryPreloadRequested) {
          refreshCollectiblesRegistry(true).catch((error) => console.warn("Collectibles registry preload failed", error.message));
          refreshStickerCollectionsRegistryFile(true).catch((error) => console.warn("Sticker registry preload failed", error.message));
        }
        if (giftSnapshotAutorun) collectGiftFloorSnapshotsNow().catch((error) => console.warn("Gift floor snapshot preload failed", error.message));
      }, 15000);
    }
  });

  if (registryPreloadRequested) {
    setInterval(() => {
      refreshCollectiblesRegistry(true).catch((error) => console.warn("Collectibles registry refresh failed", error.message));
      refreshStickerCollectionsRegistryFile(true).catch((error) => console.warn("Sticker registry refresh failed", error.message));
    }, 30 * 60 * 1000);
  }

  if (giftSnapshotAutorun) {
    setInterval(() => {
      collectGiftFloorSnapshotsNow().catch((error) => console.warn("Gift floor snapshot refresh failed", error.message));
    }, giftSnapshotIntervalMs);
  }
}

let giftSnapshotWorkerRunning = false;

async function runGiftSnapshotWorker(reason = "scheduled") {
  if (giftSnapshotWorkerRunning) {
    console.log(`[gift-snapshot-worker] skipped ${reason}; previous run still active`);
    return;
  }
  giftSnapshotWorkerRunning = true;
  console.log(`[gift-snapshot-worker] ${reason} run started`);
  try {
    const state = await collectGiftFloorSnapshotsNow({ force: true });
    console.log(
      `[gift-snapshot-worker] ${reason} run complete: ${state.ok}/${state.total} collections, ${state.modelSnapshots} model points, ${state.errors} errors`
    );
  } catch (error) {
    console.warn(`[gift-snapshot-worker] ${reason} run failed`, error.message);
  } finally {
    giftSnapshotWorkerRunning = false;
  }
}

function startGiftSnapshotWorker() {
  console.log(`[gift-snapshot-worker] running every ${Math.round(giftSnapshotIntervalMs / 60000)} minutes`);
  runGiftSnapshotWorker("startup").catch((error) => console.warn("[gift-snapshot-worker] startup failed", error.message));
  setInterval(() => {
    runGiftSnapshotWorker("hourly").catch((error) => console.warn("[gift-snapshot-worker] hourly failed", error.message));
  }, giftSnapshotIntervalMs);
}

if (require.main === module) {
  if (process.env.TONTRACK_MODE === "gift-snapshot-worker") {
    startGiftSnapshotWorker();
  } else {
    startServer();
  }
}

module.exports = {
  collectGiftFloorSnapshotsNow,
  giftSnapshotHistory,
  getGiftSnapshotCollectorState: () => ({ ...giftSnapshotCollectorState }),
  startGiftSnapshotWorker,
  startServer
};
