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
const checkpointFile = path.join(root, "data", "gift-combo-ingest-checkpoint.json");
const lockFile = path.join(root, "data", "gift-combo-worker.lock");
const workDir = path.join(root, "data", "gift-combo-work");
const thermosBase = "https://proxy.thermos.gifts/api/v1";
const registryUrl = String(process.env.D1_REGISTRY_URL || "").replace(/\/+$/, "");
const ingestSecret = String(process.env.D1_INGEST_SECRET || "");
const pageSize = 20;
const marketArgIndex = process.argv.indexOf("--market");
const configuredMarkets = marketArgIndex >= 0
  ? [String(process.argv[marketArgIndex + 1] || "").trim().toUpperCase()].filter(Boolean)
  : String(process.env.GIFT_COMBO_MARKETS || "")
    .split(",")
    .map((market) => market.trim().toUpperCase())
    .filter(Boolean);
const thermosMarkets = configuredMarkets;
const marketSignature = thermosMarkets.length ? thermosMarkets.join("+") : "AGGREGATE";
const pageConcurrency = Math.max(1, Math.min(12, Number(process.env.GIFT_COMBO_PAGE_CONCURRENCY || 1)));
const requestDelayMs = Math.max(0, Number(process.env.GIFT_COMBO_REQUEST_DELAY_MS || 1050));
const continuousMode = process.argv.includes("--continuous") || process.env.GIFT_COMBO_CONTINUOUS === "1";
const cycleDelayMs = Math.max(0, Number(process.env.GIFT_COMBO_CYCLE_DELAY_MS || 5 * 60 * 1000));
const bucketCount = 32;
const scannerVersion = Number(process.env.GIFT_COMBO_SCANNER_VERSION || 2);

if (!registryUrl || !ingestSecret) {
  console.error("D1_REGISTRY_URL and D1_INGEST_SECRET are required");
  process.exit(1);
}

function key(value = "") {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function comboKey(model = "", backdrop = "") {
  return `${key(model)}:${key(backdrop)}`;
}

function checkpointKey(collection = "") {
  return `${key(collection)}:${marketSignature.toLowerCase()}:v${scannerVersion}`;
}

function bucketFor(value = "") {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % bucketCount;
}

function lockIsActive(lock = {}) {
  const pid = Number(lock.pid || 0);
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function acquireLock() {
  fs.mkdirSync(path.dirname(lockFile), { recursive: true });
  const lock = {
    pid: process.pid,
    startedAt: new Date().toISOString(),
    mode: continuousMode ? "continuous" : "once",
  };
  try {
    fs.writeFileSync(lockFile, JSON.stringify(lock, null, 2), { flag: "wx" });
  } catch (error) {
    let existing = null;
    try {
      existing = JSON.parse(fs.readFileSync(lockFile, "utf8"));
    } catch {}
    if (lockIsActive(existing)) {
      throw new Error(`Gift combo worker already running with pid ${existing.pid}`);
    }
    fs.rmSync(lockFile, { force: true });
    fs.writeFileSync(lockFile, JSON.stringify(lock, null, 2), { flag: "wx" });
  }
  const heartbeat = setInterval(() => {
    try {
      fs.writeFileSync(lockFile, JSON.stringify({ ...lock, heartbeatAt: new Date().toISOString() }, null, 2));
    } catch {}
  }, 60 * 1000);
  heartbeat.unref?.();
  const release = () => {
    clearInterval(heartbeat);
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
function loadCheckpoint() {
  if (process.argv.includes("--reset")) return { version: 1, completed: {}, startedAt: new Date().toISOString() };
  try {
    return JSON.parse(fs.readFileSync(checkpointFile, "utf8"));
  } catch {
    return { version: 1, completed: {}, startedAt: new Date().toISOString() };
  }
}

function saveCheckpoint(checkpoint) {
  fs.mkdirSync(path.dirname(checkpointFile), { recursive: true });
  checkpoint.updatedAt = new Date().toISOString();
  fs.writeFileSync(checkpointFile, JSON.stringify(checkpoint, null, 2));
}

function updateCycleStatus(checkpoint, status = {}) {
  checkpoint.status = {
    ...(checkpoint.status || {}),
    ...status,
    updatedAt: new Date().toISOString(),
  };
  saveCheckpoint(checkpoint);
}

let thermosQueue = Promise.resolve();
let lastThermosRequestAt = 0;

function isThermosUrl(url = "") {
  return String(url).startsWith(thermosBase);
}

async function waitForThermosSlot() {
  const wait = thermosQueue.then(async () => {
    const elapsed = Date.now() - lastThermosRequestAt;
    if (elapsed < requestDelayMs) {
      await new Promise((resolve) => setTimeout(resolve, requestDelayMs - elapsed));
    }
    lastThermosRequestAt = Date.now();
  });
  thermosQueue = wait.catch(() => {});
  await wait;
}

async function fetchJson(url, options = {}, attempts = 20) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      if (isThermosUrl(url)) await waitForThermosSlot();
      const response = await fetch(url, {
        ...options,
        headers: { "content-type": "application/json", ...(options.headers || {}) },
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) {
        const text = await response.text();
        const error = new Error(`${response.status} ${text.slice(0, 200)}`);
        error.retryable = response.status === 429 || response.status >= 500;
        error.retryAfterMs = response.status === 429
          ? Math.max(30000, Number(response.headers.get("retry-after") || 0) * 1000)
          : 0;
        throw error;
      }
      return response.json();
    } catch (error) {
      lastError = error;
      if (error.retryable === false || attempt === attempts - 1) break;
      const waitMs = lastError.retryAfterMs || Math.min(60000, 1500 * (attempt + 1) ** 2);
      console.warn(`Request retry ${attempt + 1}/${attempts} in ${Math.round(waitMs / 1000)}s: ${lastError.message.slice(0, 80)}`);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
  throw lastError;
}

function giftSearchBody(collection, page, market) {
  return {
    ordering: "PRICE_ASC",
    page,
    per_page: pageSize,
    query: "",
    price_range: null,
    number: null,
    collections: [collection],
    models: [],
    backdrops: [],
    symbols: [],
    markets: market ? [market] : [],
  };
}

async function fetchPage(collection, market, page) {
  const result = await fetchJson(`${thermosBase}/gifts`, {
    method: "POST",
    body: JSON.stringify(giftSearchBody(collection, page, market)),
  });
  return result;
}

function mergeItems(combinations, items = [], market = "") {
  items.forEach((item) => {
    const model = String(item?.model?.name || "").trim();
    const backdrop = String(item?.backdrop?.name || "").trim();
    const floorTon = Number(item?.price || 0) / 1e9;
    const marketplace = String(item?.marketplace || market || "thermos-aggregate").trim();
    const listingUrl = String(item?.listingUrl || item?.marketUrl || item?.url || item?.link || item?.permalink || "").trim();
    const listingId = String(item?.external_id || item?.externalId || item?.listingId || item?.id || "").trim();
    const targetKey = comboKey(model, backdrop);
    if (!model || !backdrop || !(floorTon > 0) || targetKey === ":") return;
    const existing = combinations.get(targetKey);
    if (!existing) {
      combinations.set(targetKey, { m: model, b: backdrop, f: floorTon, l: 1, p: marketplace, u: listingUrl, i: listingId });
      return;
    }
    if (floorTon < existing.f) {
      existing.f = floorTon;
      existing.p = marketplace;
      existing.u = listingUrl;
      existing.i = listingId;
    }
    existing.l += 1;
  });
}

async function scanMarket(collection, market, combinations, work, saveWork) {
  const marketKey = market || "AGGREGATE";
  const marketWork = work.markets[marketKey] || { pages: 0, listingCount: 0, completedPages: 0 };
  let pages = Number(marketWork.pages || 0);
  let listingCount = Number(marketWork.listingCount || 0);
  const donePages = new Set(Array.isArray(marketWork.donePages)
    ? marketWork.donePages.map(Number).filter((page) => page > 0)
    : Array.from({ length: Number(marketWork.completedPages || 0) }, (_, index) => index + 1));
  const updateMarketWork = () => {
    work.markets[marketKey] = {
      pages,
      listingCount,
      completedPages: donePages.size,
      donePages: [...donePages].sort((left, right) => left - right),
    };
  };
  if (!pages) {
    const first = await fetchPage(collection, market, 1);
    mergeItems(combinations, first.items, market);
    pages = Number(first.pages || 1);
    listingCount = Number(first.count || 0);
    donePages.add(1);
    updateMarketWork();
    saveWork();
  }
  let nextPage = 1;
  const reservePage = () => {
    while (nextPage <= pages) {
      const page = nextPage;
      nextPage += 1;
      if (!donePages.has(page)) return page;
    }
    return 0;
  };
  const workers = Array.from({ length: Math.min(pageConcurrency, Math.max(0, pages - donePages.size)) }, async () => {
    while (true) {
      const page = reservePage();
      if (!page) return;
      const payload = await fetchPage(collection, market, page);
      mergeItems(combinations, payload.items, market);
      donePages.add(page);
      updateMarketWork();
      if (donePages.size % 10 === 0 || donePages.size === pages) saveWork();
      if (donePages.size % 100 === 0 || donePages.size === pages) {
        process.stdout.write(`\r${collection} ${marketKey}: ${donePages.size}/${pages} pages, ${combinations.size} combinations`);
      }
    }
  });
  await Promise.all(workers);
  updateMarketWork();
  saveWork();
  if (pages > 1) process.stdout.write("\n");
  return { market: marketKey, listingCount, pages };
}

async function scanCollection(collection) {
  fs.mkdirSync(workDir, { recursive: true });
  const workFile = path.join(workDir, `${key(collection)}-${key(marketSignature)}.json`);
  let work = null;
  try {
    work = JSON.parse(fs.readFileSync(workFile, "utf8"));
  } catch {}
  if (!work?.markets) work = null;
  work = work || { collection, markets: {}, combinations: [] };
  const combinations = new Map(Array.isArray(work?.combinations) ? work.combinations : []);
  const saveWork = () => fs.writeFileSync(workFile, JSON.stringify({
    collection,
    markets: work.markets,
    marketMode: marketSignature,
    thermosMarkets,
    combinations: [...combinations.entries()],
  }));
  const marketStats = [];
  const marketScopes = thermosMarkets.length ? thermosMarkets : [""];
  for (const market of marketScopes) {
    marketStats.push(await scanMarket(collection, market, combinations, work, saveWork));
  }
  saveWork();
  const listingCount = marketStats.reduce((sum, item) => sum + Number(item.listingCount || 0), 0);
  const buckets = Array.from({ length: bucketCount }, () => ({}));
  combinations.forEach((value, targetKey) => {
    buckets[bucketFor(targetKey)][targetKey] = value;
  });
  return {
    collection,
    snapshotAt: new Date().toISOString(),
    source: `thermos-v${scannerVersion}`,
    listingCount,
    combinationCount: combinations.size,
    marketMode: marketSignature,
    markets: thermosMarkets,
    marketStats,
    buckets,
    workFile,
  };
}

async function uploadCollection(snapshot) {
  return fetchJson(`${registryUrl}/ingest/collection`, {
    method: "POST",
    headers: { authorization: `Bearer ${ingestSecret}` },
    body: JSON.stringify(snapshot),
  });
}

async function runCycle({ resetCompleted = false } = {}) {
  const checkpoint = loadCheckpoint();
  if (resetCompleted) {
    checkpoint.completed = {};
    checkpoint.startedAt = new Date().toISOString();
    checkpoint.status = {};
    saveCheckpoint(checkpoint);
  }
  const filterIndex = process.argv.indexOf("--collection");
  const onlyCollection = filterIndex >= 0 ? String(process.argv[filterIndex + 1] || "").trim() : "";
  const collectionsPayload = await fetchJson(`${thermosBase}/collections`);
  const rows = Array.isArray(collectionsPayload) ? collectionsPayload : (collectionsPayload.items || collectionsPayload.collections || []);
  const names = [...new Set(rows.map((item) => String(item?.name || item?.collection || item?.title || "").trim()).filter(Boolean))]
    .filter((name) => !onlyCollection || key(name) === key(onlyCollection));
  if (!names.length) throw new Error("No Thermos collections found");
  updateCycleStatus(checkpoint, {
    phase: "running",
    cycleStartedAt: checkpoint.startedAt || new Date().toISOString(),
    totalCollections: names.length,
    marketMode: marketSignature,
    scannerVersion,
    pageConcurrency,
    requestDelayMs,
  });
  console.log(`Scanning ${names.length} collections via Thermos ${marketSignature.toLowerCase()} with ${pageConcurrency} page workers`);
  for (let index = 0; index < names.length; index += 1) {
    const collection = names[index];
    const doneKey = checkpointKey(collection);
    if (checkpoint.completed[doneKey] && !process.argv.includes("--reset")) {
      console.log(`[${index + 1}/${names.length}] ${collection}: already complete`);
      continue;
    }
    updateCycleStatus(checkpoint, {
      phase: "scanning_collection",
      currentCollectionIndex: index + 1,
      totalCollections: names.length,
      currentCollection: collection,
    });
    console.log(`[${index + 1}/${names.length}] ${collection}`);
    const snapshot = await scanCollection(collection);
    await uploadCollection(snapshot);
    checkpoint.completed[doneKey] = {
      name: collection,
      snapshotAt: snapshot.snapshotAt,
      listingCount: snapshot.listingCount,
      combinationCount: snapshot.combinationCount,
      marketMode: snapshot.marketMode,
      markets: thermosMarkets,
    };
    updateCycleStatus(checkpoint, {
      phase: "collection_complete",
      lastCompletedCollection: collection,
      lastCompletedCollectionAt: snapshot.snapshotAt,
      lastListingCount: snapshot.listingCount,
      lastCombinationCount: snapshot.combinationCount,
      completedCollections: Object.keys(checkpoint.completed).length,
    });
    fs.rmSync(snapshot.workFile, { force: true });
    console.log(`Saved ${snapshot.combinationCount} combinations from ${snapshot.listingCount} listings`);
  }
  updateCycleStatus(checkpoint, {
    phase: "cycle_complete",
    cycleCompletedAt: new Date().toISOString(),
    completedCollections: Object.keys(checkpoint.completed).length,
  });
  const stats = await fetchJson(`${registryUrl}/stats`);
  console.log(JSON.stringify({ complete: true, ...stats }, null, 2));
  return { names, stats };
}

async function main() {
  acquireLock();
  if (!continuousMode) {
    await runCycle();
    return;
  }
  let cycle = 0;
  while (true) {
    cycle += 1;
    const startedAt = new Date().toISOString();
    console.log(`[combo-worker] cycle ${cycle} started at ${startedAt}`);
    try {
      await runCycle({ resetCompleted: cycle > 1 || process.argv.includes("--reset") });
      const completedAt = new Date().toISOString();
      console.log(`[combo-worker] cycle ${cycle} completed at ${completedAt}`);
    } catch (error) {
      console.error(`[combo-worker] cycle ${cycle} failed; will resume from checkpoint: ${error.stack || error.message}`);
    }
    await new Promise((resolve) => setTimeout(resolve, cycleDelayMs));
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
