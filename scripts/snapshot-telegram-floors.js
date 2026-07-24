const fs = require("fs");
const path = require("path");
const Long = require("long");

const root = path.resolve(__dirname, "..");
const BUCKET_COUNT = 32;
const continuousMode = process.argv.includes("--continuous") || process.env.TELEGRAM_FLOOR_CONTINUOUS === "1";
const cycleDelayMs = Math.max(5 * 60 * 1000, Number(process.env.TELEGRAM_FLOOR_CYCLE_DELAY_MS || 60 * 60 * 1000));
const retryDelayMs = Math.max(30 * 1000, Number(process.env.TELEGRAM_FLOOR_RETRY_DELAY_MS || 60 * 1000));

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function telegramRequest(label, operation, attempts = 4) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      const retryMs = Math.min(15000, 1000 * attempt ** 2);
      console.warn(`[telegram-floors] ${label} retry ${attempt}/${attempts} in ${Math.round(retryMs / 1000)}s: ${String(error.message || error).slice(0, 140)}`);
      await sleep(retryMs);
    }
  }
  throw lastError;
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

function bucketFor(value = "") {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % BUCKET_COUNT;
}

async function requestJson(url, options = {}, attempts = 4) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: options.method || "GET",
        headers: { "content-type": "application/json", ...(options.headers || {}) },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: AbortSignal.timeout(Number(options.timeoutMs || 30000)),
      });
      const text = await response.text();
      let payload = {};
      if (text) {
        try {
          payload = JSON.parse(text);
        } catch {
          const preview = text.replace(/\s+/g, " ").slice(0, 180);
          throw new Error(`HTTP ${response.status} returned non-JSON: ${preview}`);
        }
      }
      if (!response.ok) throw new Error(`${response.status} ${payload.error || payload.message || text}`);
      return payload;
    } catch (error) {
      lastError = error;
      if (attempt === attempts - 1) break;
      await sleep(Math.min(15000, 1000 * (attempt + 1) ** 2));
    }
  }
  throw lastError;
}

async function uploadStatus(registryUrl, ingestSecret, status) {
  try {
    await requestJson(`${registryUrl}/ingest/status`, {
      method: "POST",
      headers: { authorization: `Bearer ${ingestSecret}` },
      body: { worker: "telegram-floor-worker", ...status },
    });
  } catch (error) {
    console.warn(`[telegram-floors] status upload failed: ${String(error.message || error).slice(0, 140)}`);
  }
}

async function uploadCollection(registryUrl, ingestSecret, snapshot) {
  for (let bucketIndex = 0; bucketIndex < BUCKET_COUNT; bucketIndex += 1) {
    await requestJson(`${registryUrl}/ingest/collection-bucket`, {
      method: "POST",
      headers: { authorization: `Bearer ${ingestSecret}` },
      body: {
        collection: snapshot.collection,
        snapshotAt: snapshot.snapshotAt,
        source: "telegram-marketplace",
        listingCount: snapshot.listingCount,
        combinationCount: snapshot.combinationCount,
        bucketIndex,
        bucket: snapshot.buckets[bucketIndex],
      },
    });
  }
}

function resumeIndexFromStatus(status, gifts) {
  if (!status || !Array.isArray(gifts) || !gifts.length) return 0;
  const phase = String(status.phase || "");
  if (!["collection_scanning", "collection_failed", "cycle_resumed", "collection_complete"].includes(phase)) return 0;
  const collectionKey = collectionIdentity(status.collection_name || status.collectionName || "");
  const currentIndex = gifts.findIndex((gift) => collectionIdentity(gift.title) === collectionKey);
  if (currentIndex < 0) return 0;
  return phase === "collection_complete" ? Math.min(gifts.length, currentIndex + 1) : currentIndex;
}

function telegramPaginationComplete(expectedListingCount = 0, seenListingCount = 0) {
  const expected = Number(expectedListingCount || 0);
  const seen = Number(seenListingCount || 0);
  if (!(expected > 0) || seen >= expected) return true;
  // Active listings can disappear between pages. Permit only a small terminal
  // drift, never a genuinely partial traversal.
  const toleratedDrift = Math.max(3, Math.min(25, Math.ceil(expected * 0.0025)));
  return expected - seen <= toleratedDrift;
}

async function loadResumeIndex(registryUrl, gifts) {
  try {
    const statuses = await requestJson(`${registryUrl}/worker-status`);
    const status = (Array.isArray(statuses) ? statuses : []).find((row) => row.worker_key === "telegramfloorworker");
    return resumeIndexFromStatus(status, gifts);
  } catch (error) {
    console.warn(`[telegram-floors] resume status unavailable; starting from collection 1: ${String(error.message || error).slice(0, 140)}`);
    return 0;
  }
}

function attributeIdByName(attributes, name = "") {
  const target = key(name);
  if (!target || !attributes) return null;
  for (const [id, attribute] of attributes) {
    if (key(attribute?.name) === target) return id;
  }
  return null;
}

async function loadTelegramFloorTargets(registryUrl, ingestSecret, limit = 5) {
  const payload = await requestJson(`${registryUrl}/telegram-floor-targets?limit=${Math.max(1, Math.min(25, limit))}`, {
    headers: { authorization: `Bearer ${ingestSecret}` },
  });
  return Array.isArray(payload?.targets) ? payload.targets : [];
}

async function processTelegramFloorTargets(client, registryUrl, ingestSecret, gifts, requestDelayMs, limit = 5) {
  const targets = await loadTelegramFloorTargets(registryUrl, ingestSecret, limit);
  if (!targets.length) return 0;
  const giftsByCollection = new Map(gifts.map((gift) => [collectionIdentity(gift.title), gift]));
  const metadataByGift = new Map();
  let processed = 0;
  for (const target of targets) {
    const gift = giftsByCollection.get(collectionIdentity(target.collection));
    if (!gift) {
      console.warn(`[telegram-floors] target skipped: catalog collection not found for ${target.collection}`);
      continue;
    }
    try {
      let metadata = metadataByGift.get(String(gift.id));
      if (!metadata) {
        metadata = await telegramRequest(`target metadata ${target.collection}`, () => client.getStarGiftResaleOptions({
          giftId: Long.fromString(String(gift.id)),
          sort: "price",
          attributesHash: Long.ZERO,
          limit: 1,
        }));
        metadataByGift.set(String(gift.id), metadata);
        await sleep(requestDelayMs);
      }
      const modelId = attributeIdByName(metadata.attributes?.model, target.model);
      const backdropId = attributeIdByName(metadata.attributes?.backdrop, target.backdrop);
      const symbolId = attributeIdByName(metadata.attributes?.symbol, target.symbol);
      if (!modelId || backdropId === null || backdropId === undefined || symbolId === null || symbolId === undefined) {
        console.warn(`[telegram-floors] target unresolved attributes: ${target.collection} / ${target.model} / ${target.backdrop} / ${target.symbol}`);
        continue;
      }
      const page = await telegramRequest(`target floor ${target.collection}`, () => client.getStarGiftResaleOptions({
        giftId: Long.fromString(String(gift.id)),
        sort: "price",
        attributesHash: metadata.attributesHash,
        attributes: { model: modelId, backdrop: backdropId, symbol: symbolId },
        limit: 100,
      }));
      const listing = Array.from(page).find((item) => Number(item?.resellPriceTon?.toString?.() || 0) > 0);
      const floorTon = listing ? Number(listing.resellPriceTon.toString()) / 1e9 : 0;
      const floorStars = listing ? Number(listing.resellPriceStars?.toString?.() || 0) : 0;
      await requestJson(`${registryUrl}/ingest/telegram-floor-target-result`, {
        method: "POST",
        headers: { authorization: `Bearer ${ingestSecret}` },
        body: {
          collection: target.collection,
          model: target.model,
          backdrop: target.backdrop,
          symbol: target.symbol,
          floorTon,
          floorStars,
          listedCount: Number(page.total || 0),
          listingUrl: listing?.slug ? `https://t.me/nft/${encodeURIComponent(listing.slug)}` : "",
          listingId: listing?.slug || String(listing?.num || ""),
          snapshotAt: new Date().toISOString(),
        },
      });
      processed += 1;
      console.log(`[telegram-floors] target refreshed: ${target.collection} / ${target.model} / ${target.backdrop} / ${target.symbol} listings=${Number(page.total || 0)} floor=${floorTon || "none"} TON${floorStars ? ` (${floorStars} Stars)` : ""}`);
    } catch (error) {
      console.warn(`[telegram-floors] target refresh failed for ${target.collection} / ${target.model} / ${target.backdrop} / ${target.symbol}: ${String(error.message || error).slice(0, 160)}`);
    }
    await sleep(requestDelayMs);
  }
  return processed;
}

async function runTelegramFloorCycle(options = {}) {
  const apiId = Number(options.apiId || process.env.TELEGRAM_API_ID || 0);
  const apiHash = String(options.apiHash || process.env.TELEGRAM_API_HASH || "").trim();
  const sessionFile = path.join(root, ".telegram-session");
  const gramjsSession = String(options.session || process.env.TELEGRAM_SESSION || (
    fs.existsSync(sessionFile) ? fs.readFileSync(sessionFile, "utf8") : ""
  )).trim();
  const registryUrl = String(options.registryUrl || process.env.D1_REGISTRY_URL || "").replace(/\/+$/, "");
  const ingestSecret = String(options.ingestSecret || process.env.D1_INGEST_SECRET || "");
  // Telegram resale requests share one worker lane; never exceed the 1 req/s limit.
  const requestDelayMs = Math.max(1000, Number(process.env.TELEGRAM_FLOOR_REQUEST_DELAY_MS || 1000));
  const maxPagesPerCollection = Math.max(100, Number(process.env.TELEGRAM_FLOOR_MAX_PAGES || 5000));
  if (!apiId || !apiHash || !gramjsSession || !registryUrl || !ingestSecret) {
    throw new Error("Telegram floor scan requires Telegram session and D1 registry configuration");
  }

  const [{ TelegramClient, MemoryStorage }, { convertFromGramjsSession }] = await Promise.all([
    import("@mtcute/node"),
    import("@mtcute/convert"),
  ]);
  const client = new TelegramClient({ apiId, apiHash, storage: new MemoryStorage(), disableUpdates: true });
  await client.importSession(convertFromGramjsSession(gramjsSession), true);
  await client.connect();
  try {
    const registry = await requestJson(`${registryUrl}/collections`);
    const registryNames = new Map((registry.collections || []).map((row) => [
      collectionIdentity(row.collection_name || row.collectionName),
      String(row.collection_name || row.collectionName || "").trim(),
    ]));
    const catalog = await client.call({ _: "payments.getStarGifts", hash: 0 });
    if (catalog._ !== "payments.starGifts") throw new Error("Telegram gift catalog was not returned");
    const gifts = catalog.gifts.filter((gift) => gift._ === "starGift" && gift.title && gift.id);
    const resumeIndex = await loadResumeIndex(registryUrl, gifts);
    const resumeCollection = gifts[resumeIndex]?.title || "";
    console.log(`[telegram-floors] scanning ${gifts.length} Telegram gift collections${resumeIndex ? `; resuming at [${resumeIndex + 1}/${gifts.length}] ${resumeCollection}` : ""}`);
    await uploadStatus(registryUrl, ingestSecret, {
      phase: resumeIndex ? "cycle_resumed" : "cycle_started",
      collection: resumeCollection,
      completedCollections: resumeIndex,
      totalCollections: gifts.length,
      message: resumeIndex
        ? `Telegram Marketplace active-floor cycle resumed at ${resumeCollection}`
        : `Telegram Marketplace active-floor cycle started for ${gifts.length} collections`,
    });

    let completed = resumeIndex;
    let failed = 0;
    for (let index = resumeIndex; index < gifts.length; index += 1) {
      const refreshedTargets = await processTelegramFloorTargets(client, registryUrl, ingestSecret, gifts, requestDelayMs, 5);
      if (refreshedTargets) console.log(`[telegram-floors] priority refreshes=${refreshedTargets}; continuing collection scan`);
      const gift = gifts[index];
      const catalogName = String(gift.title).trim();
      const collection = registryNames.get(collectionIdentity(catalogName)) || catalogName;
      const combinations = new Map();
      const seenListings = new Set();
      const seenOffsets = new Set([""]);
      let offset = "";
      let listingCount = 0;
      let pages = 0;
      let expectedListingCount = 0;
      try {
        do {
          const page = await telegramRequest(`${collection} page ${pages + 1}`, () => client.getStarGiftResaleOptions({
            giftId: Long.fromString(String(gift.id)),
            sort: "price",
            offset,
            limit: 100,
          }));
          pages += 1;
          const pageItems = Array.from(page);
          if (pages === 1) expectedListingCount = Number(page.total || 0);
          if (!pageItems.length) {
            if (!telegramPaginationComplete(expectedListingCount, seenListings.size)) {
              throw new Error(`Pagination ended early: received ${seenListings.size}/${expectedListingCount} listings`);
            }
            console.log(`[telegram-floors] [${index + 1}/${gifts.length}] ${collection}: reached terminal page=${pages} listings=${seenListings.size}/${expectedListingCount || seenListings.size}`);
            break;
          }
          let newListings = 0;
          for (const item of pageItems) {
            const amount = item.resellPriceTon;
            const floorTon = amount ? Number(amount.toString()) / 1e9 : 0;
            const model = String(item.model?.name || "").trim();
            const backdrop = String(item.backdrop?.name || "").trim();
            const symbol = String(item.symbol?.name || item.pattern?.name || "").trim();
            if (!(floorTon > 0) || !model || !backdrop) continue;
            const listingKey = String(item.slug || item.num || `${key(model)}:${key(backdrop)}:${key(symbol)}:${floorTon}`);
            if (seenListings.has(listingKey)) continue;
            seenListings.add(listingKey);
            newListings += 1;
            listingCount += 1;
            const targetKey = `${key(model)}:${key(backdrop)}`;
            const current = combinations.get(targetKey);
            if (!current || floorTon < current.f) {
              combinations.set(targetKey, {
                m: model,
                b: backdrop,
                y: symbol,
                f: floorTon,
                l: 1,
                p: "Telegram Marketplace",
                u: item.slug ? `https://t.me/nft/${encodeURIComponent(item.slug)}` : "",
                i: item.slug || String(item.num || ""),
              });
            } else {
              current.l += 1;
            }
          }
          if (!newListings) {
            throw new Error(`Pagination stalled at page ${pages}: no new listings after ${seenListings.size}/${expectedListingCount || "?"}`);
          }
          if (pages === 1 || pages % 25 === 0) {
            console.log(`[telegram-floors] [${index + 1}/${gifts.length}] ${collection}: page=${pages} listings=${listingCount}/${expectedListingCount || "?"} combinations=${combinations.size}`);
            await uploadStatus(registryUrl, ingestSecret, {
              phase: "collection_scanning",
              collection,
              currentPage: pages,
              completedCollections: completed,
              totalCollections: gifts.length,
              message: `${listingCount} active TON listings scanned; ${combinations.size} exact floors found`,
            });
          }
          const nextOffset = String(page.next || "");
          if (!nextOffset) {
            if (!telegramPaginationComplete(expectedListingCount, seenListings.size)) {
              throw new Error(`Pagination ended early: received ${seenListings.size}/${expectedListingCount} listings`);
            }
            break;
          }
          if (nextOffset === offset || seenOffsets.has(nextOffset)) {
            throw new Error(`Pagination cursor repeated at page ${pages}: received ${seenListings.size}/${expectedListingCount || "?"} listings`);
          }
          if (pages >= maxPagesPerCollection) {
            throw new Error(`Emergency page cap ${maxPagesPerCollection} reached after ${seenListings.size}/${expectedListingCount || "?"} listings`);
          }
          seenOffsets.add(nextOffset);
          offset = nextOffset;
          await sleep(requestDelayMs);
        } while (offset);

        const buckets = Array.from({ length: BUCKET_COUNT }, () => ({}));
        combinations.forEach((entry, targetKey) => {
          buckets[bucketFor(targetKey)][targetKey] = entry;
        });
        await uploadCollection(registryUrl, ingestSecret, {
          collection,
          snapshotAt: new Date().toISOString(),
          listingCount,
          combinationCount: combinations.size,
          buckets,
        });
        completed += 1;
        console.log(`[telegram-floors] [${index + 1}/${gifts.length}] ${collection}: complete pages=${pages} listings=${listingCount}/${expectedListingCount || listingCount} combinations=${combinations.size}`);
        await uploadStatus(registryUrl, ingestSecret, {
          phase: "collection_complete",
          collection,
          currentPage: pages,
          completedCollections: completed,
          totalCollections: gifts.length,
          message: `${listingCount} active TON listings; ${combinations.size} exact floors`,
        });
      } catch (error) {
        failed += 1;
        console.warn(`[telegram-floors] [${index + 1}/${gifts.length}] ${collection} failed: ${String(error.message || error).slice(0, 180)}`);
        await uploadStatus(registryUrl, ingestSecret, {
          phase: "collection_failed",
          collection,
          currentPage: pages,
          completedCollections: completed,
          totalCollections: gifts.length,
          message: `Retry required: ${String(error.message || error).slice(0, 140)}`,
        });
        // One collection must never restart the global 118-collection cycle.
        // Its saved cursor is retried on the next pass while every other collection progresses.
        continue;
      }
      await sleep(requestDelayMs);
    }
    await uploadStatus(registryUrl, ingestSecret, {
      phase: failed ? "cycle_partial" : "cycle_complete",
      completedCollections: completed,
      totalCollections: gifts.length,
      message: `Telegram Marketplace floors complete=${completed}/${gifts.length} failed=${failed}`,
    });
    return { completed, failed, total: gifts.length };
  } finally {
    await client.disconnect().catch(() => {});
    await client.destroy().catch(() => {});
  }
}

module.exports = { runTelegramFloorCycle, resumeIndexFromStatus, telegramPaginationComplete, attributeIdByName };

if (require.main === module) {
  (async () => {
    do {
      let delayMs = cycleDelayMs;
      try {
        const result = await runTelegramFloorCycle();
        console.log(`[telegram-floors] cycle finished: ${result.completed}/${result.total}, failed=${result.failed}; next cycle in ${Math.round(cycleDelayMs / 60000)}m`);
      } catch (error) {
        delayMs = retryDelayMs;
        console.error(`[telegram-floors] cycle failed: ${error.stack || error.message || error}; retrying in ${Math.round(retryDelayMs / 1000)}s`);
      }
      if (continuousMode) await sleep(delayMs);
    } while (continuousMode);
  })().catch((error) => {
    console.error(`[telegram-floors] fatal: ${error.stack || error.message || error}`);
    process.exitCode = 1;
  });
}
