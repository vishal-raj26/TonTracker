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
function normalizeMarketScope(market = "") {
  const value = String(market || "").trim().toUpperCase();
  return value === "AGGREGATE" ? "" : value;
}
const configuredMarkets = marketArgIndex >= 0
  ? [normalizeMarketScope(process.argv[marketArgIndex + 1])].filter((market) => market || marketArgIndex >= 0)
  : String(process.env.GIFT_COMBO_MARKETS || "AGGREGATE")
    .split(",")
    .map(normalizeMarketScope)
    .filter(Boolean);
const thermosMarkets = marketArgIndex >= 0
  ? configuredMarkets
  : [...new Set(["", ...configuredMarkets])];
const marketSignature = thermosMarkets.map((market) => market || "AGGREGATE").join("+");
const pageConcurrency = Math.max(1, Math.min(12, Number(process.env.GIFT_COMBO_PAGE_CONCURRENCY || 1)));
const requestDelayMs = Math.max(0, Number(process.env.GIFT_COMBO_REQUEST_DELAY_MS || 1050));
const listingFetchAttempts = Math.max(2, Math.min(20, Number(process.env.GIFT_COMBO_LISTING_FETCH_ATTEMPTS || 5)));
const listingFetchTimeoutMs = Math.max(30000, Number(process.env.GIFT_COMBO_FETCH_TIMEOUT_MS || 45000));
const backdropFetchTimeoutMs = Math.max(listingFetchTimeoutMs, Number(process.env.GIFT_COMBO_BACKDROP_FETCH_TIMEOUT_MS || 90000));
const continuousMode = process.argv.includes("--continuous") || process.env.GIFT_COMBO_CONTINUOUS === "1";
const dryRun = process.argv.includes("--dry-run") || process.env.GIFT_COMBO_DRY_RUN === "1";
const cycleDelayMs = Math.max(0, Number(process.env.GIFT_COMBO_CYCLE_DELAY_MS || 5 * 60 * 1000));
const skipFreshMs = Math.max(0, Number(process.env.GIFT_COMBO_SKIP_FRESH_MS || 12 * 60 * 60 * 1000));
const scanBackdropSlices = process.env.GIFT_COMBO_SCAN_BACKDROPS !== "0";
const scanCollectionPages = process.env.GIFT_COMBO_SCAN_COLLECTION
  ? process.env.GIFT_COMBO_SCAN_COLLECTION !== "0"
  : !scanBackdropSlices;
const maxBackdropSlices = Math.max(0, Number(process.env.GIFT_COMBO_MAX_BACKDROP_SLICES || 0));
const backdropArgIndex = process.argv.indexOf("--backdrop");
const onlyBackdrop = backdropArgIndex >= 0
  ? String(process.argv[backdropArgIndex + 1] || "").trim()
  : String(process.env.GIFT_COMBO_BACKDROP || "").trim();
const limitedScan = Boolean(onlyBackdrop) || maxBackdropSlices > 0;
const bucketCount = 32;
const scannerVersion = Math.max(6, Number(process.env.GIFT_COMBO_SCANNER_VERSION || 6));

if (!registryUrl || !ingestSecret) {
  console.error("D1_REGISTRY_URL and D1_INGEST_SECRET are required");
  process.exit(1);
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

function wordVariants(word = "") {
  const variants = new Set([word]);
  const singular = singularWord(word);
  if (singular) variants.add(singular);
  if (word.length >= 3 && !word.endsWith("s")) variants.add(`${word}s`);
  return [...variants].filter(Boolean);
}

function collectionAliasKeys(value = "") {
  const words = String(value || "").toLowerCase().match(/[a-z0-9]+/g) || [];
  if (!words.length) return [];
  let combinations = [""];
  words.forEach((word) => {
    combinations = combinations.flatMap((prefix) => wordVariants(word).map((variant) => `${prefix}${variant}`));
  });
  return [...new Set([key(value), ...combinations.map(key)])].filter(Boolean);
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
  const { onRetry, timeoutMs, ...fetchOptions } = options;
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      if (isThermosUrl(url)) await waitForThermosSlot();
      const response = await fetch(url, {
        ...fetchOptions,
        headers: { "content-type": "application/json", ...(fetchOptions.headers || {}) },
        signal: AbortSignal.timeout(Number(timeoutMs || 30000)),
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
      if (typeof onRetry === "function") {
        try {
          await onRetry({ attempt: attempt + 1, attempts, waitMs, error: lastError });
        } catch {}
      }
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
  throw lastError;
}

function giftSearchBody(collection, page, market, filters = {}) {
  return {
    ordering: "PRICE_ASC",
    page,
    per_page: pageSize,
    query: "",
    price_range: null,
    number: null,
    collections: [collection],
    models: Array.isArray(filters.models) ? filters.models : [],
    backdrops: Array.isArray(filters.backdrops) ? filters.backdrops : [],
    symbols: [],
    markets: market ? [market] : [],
  };
}

async function fetchPage(collection, market, page, onRetry = null, filters = {}, timeoutMs = listingFetchTimeoutMs) {
  const result = await fetchJson(`${thermosBase}/gifts`, {
    method: "POST",
    body: JSON.stringify(giftSearchBody(collection, page, market, filters)),
    onRetry,
    timeoutMs,
  }, listingFetchAttempts);
  return result;
}

function attributeBucket(payload = {}, collection = "") {
  if (payload?.[collection]) return payload[collection];
  const collectionKey = key(collection);
  const values = Object.entries(payload || {});
  const match = values.find(([name]) => key(name) === collectionKey)
    || values.find(([name]) => key(name).includes(collectionKey) || collectionKey.includes(key(name)));
  return match ? match[1] : payload;
}

async function collectionBackdrops(collection) {
  const payload = await fetchJson(`${thermosBase}/attributes`, {
    method: "POST",
    body: JSON.stringify({ collections: [collection] }),
  }, listingFetchAttempts);
  const bucket = attributeBucket(payload, collection);
  const rows = Array.isArray(bucket?.backdrops) ? bucket.backdrops : [];
  return [...new Set(rows.map((item) => String(item?.name || item?.value || "").trim()).filter(Boolean))];
}

function mergeItems(combinations, items = [], market = "") {
  items.forEach((item) => {
    const model = String(item?.model?.name || "").trim();
    const backdrop = String(item?.backdrop?.name || "").trim();
    const symbol = String(item?.symbol?.name || item?.pattern?.name || "").trim();
    const floorTon = Number(item?.price || 0) / 1e9;
    const marketplace = String(item?.marketplace || market || "thermos-aggregate").trim();
    const listingUrl = String(item?.listingUrl || item?.marketUrl || item?.url || item?.link || item?.permalink || "").trim();
    const listingId = String(item?.external_id || item?.externalId || item?.listingId || item?.id || "").trim();
    const targetKey = comboKey(model, backdrop);
    if (!model || !backdrop || !(floorTon > 0) || targetKey === ":") return;
    const listingKey = listingId || listingUrl || `${marketplace}:${targetKey}:${floorTon}`;
    const existing = combinations.get(targetKey);
    if (!existing) {
      combinations.set(targetKey, { m: model, b: backdrop, y: symbol, f: floorTon, l: 1, p: marketplace, u: listingUrl, i: listingId, s: [listingKey] });
      return;
    }
    if (!Array.isArray(existing.s)) existing.s = [];
    if (existing.s.includes(listingKey)) return;
    existing.s.push(listingKey);
    if (floorTon < existing.f) {
      existing.f = floorTon;
      existing.p = marketplace;
      existing.u = listingUrl;
      existing.i = listingId;
    }
    existing.l += 1;
  });
}

async function uploadStatus(status = {}) {
  try {
    await fetchJson(`${registryUrl}/ingest/status`, {
      method: "POST",
      headers: { authorization: `Bearer ${ingestSecret}` },
      body: JSON.stringify({
        worker: "combo-worker",
        marketMode: marketSignature,
        scannerVersion,
        ...status,
      }),
    }, 3);
  } catch (error) {
    console.warn(`[worker-status] ${String(error.message || error).slice(0, 120)}`);
  }
}

async function scanMarket(collection, market, combinations, work, saveWork, reportProgress = null) {
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
  const retryProgress = async (page, retry) => {
    if (!reportProgress) return;
    const waitSeconds = Math.round(Number(retry.waitMs || 0) / 1000);
    await reportProgress({
      phase: "request_retry",
      market: marketKey,
      currentPage: donePages.size,
      totalPages: pages || 0,
      message: `${marketKey} page ${page} retry ${retry.attempt}/${retry.attempts} in ${waitSeconds}s: ${String(retry.error?.message || retry.error).slice(0, 80)}`,
    });
  };
  if (!pages) {
    const first = await fetchPage(collection, market, 1, (retry) => retryProgress(1, retry));
    mergeItems(combinations, first.items, market);
    pages = Number(first.pages || 1);
    listingCount = Number(first.count || 0);
    donePages.add(1);
    updateMarketWork();
    saveWork();
    if (reportProgress) await reportProgress({ market: marketKey, currentPage: donePages.size, totalPages: pages });
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
      const payload = await fetchPage(collection, market, page, (retry) => retryProgress(page, retry));
      mergeItems(combinations, payload.items, market);
      donePages.add(page);
      updateMarketWork();
      if (donePages.size % 10 === 0 || donePages.size === pages) saveWork();
      if (donePages.size % 10 === 0 || donePages.size === pages) {
        process.stdout.write(`\r${collection} ${marketKey}: ${donePages.size}/${pages} pages, ${combinations.size} combinations`);
        if (reportProgress) await reportProgress({ market: marketKey, currentPage: donePages.size, totalPages: pages });
      }
    }
  });
  await Promise.all(workers);
  updateMarketWork();
  saveWork();
  if (reportProgress) await reportProgress({ market: marketKey, currentPage: pages, totalPages: pages, complete: true });
  if (pages > 1) process.stdout.write("\n");
  return { market: marketKey, listingCount, pages };
}

async function scanBackdropSlice(collection, backdrop, combinations, work, saveWork, reportProgress = null) {
  const sliceKey = `BACKDROP:${key(backdrop)}`;
  work.slices = work.slices || {};
  const sliceWork = work.slices[sliceKey] || { backdrop, pages: 0, listingCount: 0, completedPages: 0 };
  let pages = Number(sliceWork.pages || 0);
  let listingCount = Number(sliceWork.listingCount || 0);
  const donePages = new Set(Array.isArray(sliceWork.donePages)
    ? sliceWork.donePages.map(Number).filter((page) => page > 0)
    : Array.from({ length: Number(sliceWork.completedPages || 0) }, (_, index) => index + 1));
  const updateSliceWork = () => {
    work.slices[sliceKey] = {
      backdrop,
      pages,
      listingCount,
      completedPages: donePages.size,
      donePages: [...donePages].sort((left, right) => left - right),
    };
  };
  const filters = { backdrops: [backdrop] };
  const retryProgress = async (page, retry) => {
    if (!reportProgress) return;
    const waitSeconds = Math.round(Number(retry.waitMs || 0) / 1000);
    await reportProgress({
      phase: "slice_request_retry",
      slice: sliceKey,
      currentPage: donePages.size,
      totalPages: pages || 0,
      message: `${backdrop} page ${page} retry ${retry.attempt}/${retry.attempts} in ${waitSeconds}s: ${String(retry.error?.message || retry.error).slice(0, 80)}`,
    });
  };
  if (!pages) {
    const first = await fetchPage(collection, "", 1, (retry) => retryProgress(1, retry), filters, backdropFetchTimeoutMs);
    mergeItems(combinations, first.items, "");
    pages = Number(first.pages || 0);
    listingCount = Number(first.count || 0);
    if (pages > 0) donePages.add(1);
    updateSliceWork();
    saveWork();
    if (reportProgress) await reportProgress({ slice: sliceKey, currentPage: donePages.size, totalPages: pages });
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
      const payload = await fetchPage(collection, "", page, (retry) => retryProgress(page, retry), filters, backdropFetchTimeoutMs);
      mergeItems(combinations, payload.items, "");
      donePages.add(page);
      updateSliceWork();
      if (donePages.size % 10 === 0 || donePages.size === pages) saveWork();
      if (donePages.size % 10 === 0 || donePages.size === pages) {
        process.stdout.write(`\r${collection} backdrop ${backdrop}: ${donePages.size}/${pages} pages, ${combinations.size} combinations`);
        if (reportProgress) await reportProgress({ slice: sliceKey, currentPage: donePages.size, totalPages: pages });
      }
    }
  });
  await Promise.all(workers);
  updateSliceWork();
  saveWork();
  if (reportProgress) await reportProgress({ slice: sliceKey, currentPage: pages, totalPages: pages, complete: true });
  if (pages > 1) process.stdout.write("\n");
  return { slice: sliceKey, backdrop, listingCount, pages };
}

async function scanCollection(collection, cycleStatus = {}) {
  fs.mkdirSync(workDir, { recursive: true });
  const workFile = path.join(workDir, `${key(collection)}-${key(marketSignature)}.json`);
  let work = null;
  try {
    work = JSON.parse(fs.readFileSync(workFile, "utf8"));
  } catch {}
  if (!work?.markets || work.marketMode !== marketSignature || Number(work.scannerVersion || 0) !== scannerVersion) work = null;
  work = work || { collection, markets: {}, slices: {}, combinations: [] };
  work.slices = work.slices || {};
  const combinations = new Map(Array.isArray(work?.combinations) ? work.combinations : []);
  const saveWork = () => fs.writeFileSync(workFile, JSON.stringify({
    collection,
    markets: work.markets,
    slices: work.slices,
    marketMode: marketSignature,
    scannerVersion,
    thermosMarkets,
    scanBackdropSlices,
    combinations: [...combinations.entries()],
  }));
  const marketStats = [];
  const failedMarkets = [];
  const marketScopes = thermosMarkets.length ? thermosMarkets : [""];
  if (scanCollectionPages) {
    for (const market of marketScopes) {
      try {
        marketStats.push(await scanMarket(collection, market, combinations, work, saveWork, async (progress) => {
          await uploadStatus({
            phase: progress.phase || (progress.complete ? "market_complete" : "scanning_pages"),
            collection,
            currentPage: progress.currentPage,
            totalPages: progress.totalPages,
            completedCollections: cycleStatus.completedCollections || 0,
            totalCollections: cycleStatus.totalCollections || 0,
            message: progress.message || `${progress.market}: ${progress.currentPage}/${progress.totalPages} pages, ${combinations.size} combinations`,
          });
        }));
      } catch (error) {
        const marketKey = market || "AGGREGATE";
        const message = String(error.message || error).slice(0, 200);
        failedMarkets.push({ market: marketKey, error: message });
        marketStats.push({ market: marketKey, listingCount: 0, pages: 0, failed: true, error: message });
        saveWork();
        console.warn(`[combo-worker] ${collection} ${marketKey} failed; keeping ${combinations.size} combinations: ${message}`);
        await uploadStatus({
          phase: "market_failed",
          collection,
          currentPage: 0,
          totalPages: 0,
          completedCollections: cycleStatus.completedCollections || 0,
          totalCollections: cycleStatus.totalCollections || 0,
          message: `${marketKey} failed; continuing with ${combinations.size} combinations`,
        });
      }
    }
  }
  const sliceStats = [];
  if (scanBackdropSlices) {
    try {
      let backdrops = await collectionBackdrops(collection);
      if (onlyBackdrop) backdrops = backdrops.filter((backdrop) => key(backdrop) === key(onlyBackdrop));
      if (maxBackdropSlices > 0) backdrops = backdrops.slice(0, maxBackdropSlices);
      for (const backdrop of backdrops) {
        try {
          sliceStats.push(await scanBackdropSlice(collection, backdrop, combinations, work, saveWork, async (progress) => {
            await uploadStatus({
              phase: progress.phase || (progress.complete ? "backdrop_slice_complete" : "scanning_backdrop_slice"),
              collection,
              currentPage: progress.currentPage,
              totalPages: progress.totalPages,
              completedCollections: cycleStatus.completedCollections || 0,
              totalCollections: cycleStatus.totalCollections || 0,
              message: progress.message || `backdrop ${backdrop}: ${progress.currentPage}/${progress.totalPages} pages, ${combinations.size} combinations`,
            });
          }));
        } catch (error) {
          const message = String(error.message || error).slice(0, 200);
          failedMarkets.push({ market: `BACKDROP:${backdrop}`, error: message });
          sliceStats.push({ slice: `BACKDROP:${key(backdrop)}`, backdrop, listingCount: 0, pages: 0, failed: true, error: message });
          saveWork();
          console.warn(`[combo-worker] ${collection} backdrop ${backdrop} failed; keeping ${combinations.size} combinations: ${message}`);
        }
      }
    } catch (error) {
      const message = String(error.message || error).slice(0, 200);
      failedMarkets.push({ market: "BACKDROP_SLICES", error: message });
      console.warn(`[combo-worker] ${collection} backdrop slices failed; keeping ${combinations.size} combinations: ${message}`);
    }
  }
  saveWork();
  const listingCount = [...marketStats, ...sliceStats].reduce((sum, item) => sum + Number(item.listingCount || 0), 0);
  const buckets = Array.from({ length: bucketCount }, () => ({}));
  combinations.forEach((value, targetKey) => {
    const { s, ...storedValue } = value;
    buckets[bucketFor(targetKey)][targetKey] = storedValue;
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
    sliceStats,
    partial: failedMarkets.length > 0,
    failedMarkets,
    buckets,
    workFile,
  };
}

async function uploadCollection(snapshot) {
  if (dryRun) {
    const uploadedEntries = snapshot.buckets.reduce((sum, bucket) => sum + Object.keys(bucket || {}).length, 0);
    return {
      ok: true,
      dryRun: true,
      collection: snapshot.collection,
      listingCount: snapshot.listingCount,
      combinationCount: snapshot.combinationCount,
      uploadedEntries,
      changedBuckets: 0,
      snapshotAt: snapshot.snapshotAt,
    };
  }
  if (limitedScan) {
    throw new Error("Refusing to upload a limited backdrop scan; use --dry-run or run the full collection scan");
  }
  let changedBuckets = 0;
  let uploadedEntries = 0;
  for (let bucketIndex = 0; bucketIndex < snapshot.buckets.length; bucketIndex += 1) {
    const bucket = snapshot.buckets[bucketIndex] || {};
    uploadedEntries += Object.keys(bucket).length;
    const result = await fetchJson(`${registryUrl}/ingest/collection-bucket`, {
      method: "POST",
      headers: { authorization: `Bearer ${ingestSecret}` },
      body: JSON.stringify({
        collection: snapshot.collection,
        snapshotAt: snapshot.snapshotAt,
        source: snapshot.source,
        listingCount: snapshot.listingCount,
        combinationCount: snapshot.combinationCount,
        bucketIndex,
        bucket,
      }),
    }, 5);
    if (result.changed) changedBuckets += 1;
  }
  return {
    ok: true,
    collection: snapshot.collection,
    listingCount: snapshot.listingCount,
    combinationCount: snapshot.combinationCount,
    uploadedEntries,
    changedBuckets,
    snapshotAt: snapshot.snapshotAt,
  };
}

async function registryFreshCollections() {
  if (!skipFreshMs) return new Map();
  try {
    const payload = await fetchJson(`${registryUrl}/collections`, {}, 3);
    const fresh = new Map();
    const now = Date.now();
    (Array.isArray(payload?.collections) ? payload.collections : []).forEach((row) => {
      const collectionKey = key(row.collection_key || row.collectionKey || row.collection_name || row.collectionName);
      const snapshotAt = new Date(row.snapshot_at || row.snapshotAt || 0).getTime();
      if (!collectionKey || !snapshotAt || now - snapshotAt > skipFreshMs) return;
      fresh.set(collectionKey, {
        snapshotAt: row.snapshot_at || row.snapshotAt,
        combinationCount: Number(row.combination_count || row.combinationCount || 0),
        listingCount: Number(row.listing_count || row.listingCount || 0),
        source: String(row.source || ""),
      });
    });
    return fresh;
  } catch (error) {
    console.warn(`Could not load registry freshness; scanning all collections: ${String(error.message || error).slice(0, 120)}`);
    return new Map();
  }
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
  const onlyCollectionKeys = new Set(collectionAliasKeys(onlyCollection));
  const collectionsPayload = await fetchJson(`${thermosBase}/collections`);
  const rows = Array.isArray(collectionsPayload) ? collectionsPayload : (collectionsPayload.items || collectionsPayload.collections || []);
  const names = [...new Set(rows.map((item) => String(item?.name || item?.collection || item?.title || "").trim()).filter(Boolean))]
    .filter((name) => !onlyCollection || collectionAliasKeys(name).some((aliasKey) => onlyCollectionKeys.has(aliasKey)));
  if (!names.length) throw new Error("No Thermos collections found");
  const freshCollections = (!process.argv.includes("--reset") && !onlyCollection)
    ? await registryFreshCollections()
    : new Map();
  updateCycleStatus(checkpoint, {
    phase: "running",
    cycleStartedAt: checkpoint.startedAt || new Date().toISOString(),
    totalCollections: names.length,
    marketMode: marketSignature,
    scannerVersion,
    pageConcurrency,
    requestDelayMs,
  });
  await uploadStatus({
    phase: "cycle_started",
    currentPage: 0,
    totalPages: 0,
    completedCollections: Object.keys(checkpoint.completed || {}).length,
    totalCollections: names.length,
    message: `Thermos ${marketSignature} scanner v${scannerVersion} started`,
  });
  console.log(`Scanning ${names.length} collections via Thermos ${marketSignature.toLowerCase()} with ${pageConcurrency} page workers`);
  for (let index = 0; index < names.length; index += 1) {
    const collection = names[index];
    const doneKey = checkpointKey(collection);
    if (checkpoint.completed[doneKey] && !process.argv.includes("--reset")) {
      console.log(`[${index + 1}/${names.length}] ${collection}: already complete`);
      continue;
    }
    const fresh = freshCollections.get(key(collection));
    if (fresh && fresh.source === `thermos-v${scannerVersion}`) {
      checkpoint.completed[doneKey] = {
        name: collection,
        snapshotAt: fresh.snapshotAt,
        listingCount: fresh.listingCount,
        combinationCount: fresh.combinationCount,
        marketMode: marketSignature,
        markets: thermosMarkets,
        skippedFresh: true,
      };
      saveCheckpoint(checkpoint);
      updateCycleStatus(checkpoint, {
        phase: "collection_skipped_fresh",
        currentCollectionIndex: index + 1,
        totalCollections: names.length,
        currentCollection: collection,
        completedCollections: Object.keys(checkpoint.completed).length,
      });
      await uploadStatus({
        phase: "collection_skipped_fresh",
        collection,
        currentPage: 0,
        totalPages: 0,
        completedCollections: Object.keys(checkpoint.completed || {}).length,
        totalCollections: names.length,
        message: `[${index + 1}/${names.length}] ${collection} already fresh in D1`,
      });
      console.log(`[${index + 1}/${names.length}] ${collection}: already fresh in D1 (${fresh.combinationCount} combinations)`);
      continue;
    }
    updateCycleStatus(checkpoint, {
      phase: "scanning_collection",
      currentCollectionIndex: index + 1,
      totalCollections: names.length,
      currentCollection: collection,
    });
    await uploadStatus({
      phase: "collection_started",
      collection,
      currentPage: 0,
      totalPages: 0,
      completedCollections: Object.keys(checkpoint.completed || {}).length,
      totalCollections: names.length,
      message: `[${index + 1}/${names.length}] ${collection}`,
    });
    console.log(`[${index + 1}/${names.length}] ${collection}`);
    let snapshot = null;
    try {
      snapshot = await scanCollection(collection, {
        completedCollections: Object.keys(checkpoint.completed || {}).length,
        totalCollections: names.length,
      });
    } catch (error) {
      const message = String(error.stack || error.message || error).slice(0, 500);
      updateCycleStatus(checkpoint, {
        phase: "collection_failed",
        currentCollection: collection,
        lastFailedCollection: collection,
        lastFailedCollectionAt: new Date().toISOString(),
        lastError: message,
        completedCollections: Object.keys(checkpoint.completed).length,
      });
      await uploadStatus({
        phase: "collection_failed",
        collection,
        currentPage: 0,
        totalPages: 0,
        completedCollections: Object.keys(checkpoint.completed || {}).length,
        totalCollections: names.length,
        message: `Collection failed; will retry next cycle: ${message.slice(0, 180)}`,
      });
      console.warn(`[combo-worker] ${collection} failed; will retry next cycle: ${message}`);
      continue;
    }
    if (snapshot.partial) {
      updateCycleStatus(checkpoint, {
        phase: "collection_partial",
        currentCollection: collection,
        lastPartialCollection: collection,
        lastPartialCollectionAt: snapshot.snapshotAt,
        lastListingCount: snapshot.listingCount,
        lastCombinationCount: snapshot.combinationCount,
        failedMarkets: snapshot.failedMarkets,
        completedCollections: Object.keys(checkpoint.completed).length,
      });
      await uploadStatus({
        phase: "collection_partial",
        collection,
        currentPage: 0,
        totalPages: 0,
        completedCollections: Object.keys(checkpoint.completed || {}).length,
        totalCollections: names.length,
        message: `Skipped partial ${snapshot.combinationCount} combinations; failed markets: ${snapshot.failedMarkets.map((item) => item.market).join(", ")}`,
      });
      console.warn(`Skipped partial ${snapshot.combinationCount} combinations; failed markets: ${snapshot.failedMarkets.map((item) => item.market).join(", ")}`);
      continue;
    }
    let uploadResult = null;
    try {
      uploadResult = await uploadCollection(snapshot);
    } catch (error) {
      const message = String(error.stack || error.message || error).slice(0, 500);
      updateCycleStatus(checkpoint, {
        phase: "collection_upload_failed",
        currentCollection: collection,
        lastFailedCollection: collection,
        lastFailedCollectionAt: new Date().toISOString(),
        lastError: message,
        completedCollections: Object.keys(checkpoint.completed).length,
      });
      await uploadStatus({
        phase: "collection_upload_failed",
        collection,
        currentPage: 0,
        totalPages: 0,
        completedCollections: Object.keys(checkpoint.completed || {}).length,
        totalCollections: names.length,
        message: `Upload failed; will retry next cycle: ${message.slice(0, 180)}`,
      });
      console.warn(`[combo-worker] ${collection} upload failed; will retry next cycle: ${message}`);
      continue;
    }
    console.log(`${collection} uploaded ${uploadResult.uploadedEntries} combinations across ${snapshot.buckets.length} buckets (${uploadResult.changedBuckets} changed)`);
    if (!dryRun) {
      checkpoint.completed[doneKey] = {
        name: collection,
        snapshotAt: snapshot.snapshotAt,
        listingCount: snapshot.listingCount,
        combinationCount: snapshot.combinationCount,
        marketMode: snapshot.marketMode,
        markets: thermosMarkets,
      };
    }
    updateCycleStatus(checkpoint, {
      phase: "collection_complete",
      lastCompletedCollection: collection,
      lastCompletedCollectionAt: snapshot.snapshotAt,
      lastListingCount: snapshot.listingCount,
      lastCombinationCount: snapshot.combinationCount,
      completedCollections: Object.keys(checkpoint.completed).length,
    });
    await uploadStatus({
      phase: "collection_complete",
      collection,
      currentPage: 0,
      totalPages: 0,
      completedCollections: Object.keys(checkpoint.completed || {}).length,
      totalCollections: names.length,
      message: `Saved ${snapshot.combinationCount} combinations from ${snapshot.listingCount} listings`,
    });
    if (!dryRun) fs.rmSync(snapshot.workFile, { force: true });
    console.log(`Saved ${snapshot.combinationCount} combinations from ${snapshot.listingCount} listings`);
  }
  updateCycleStatus(checkpoint, {
    phase: "cycle_complete",
    cycleCompletedAt: new Date().toISOString(),
    completedCollections: Object.keys(checkpoint.completed).length,
  });
  await uploadStatus({
    phase: "cycle_complete",
    currentPage: 0,
    totalPages: 0,
    completedCollections: Object.keys(checkpoint.completed || {}).length,
    totalCollections: names.length,
    message: "Cycle complete",
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
