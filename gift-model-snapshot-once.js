"use strict";

const fs = require("fs");
const path = require("path");

const root = __dirname;
const dataDir = path.join(root, "data");
const snapshotsFile = path.join(dataDir, "gift-floor-snapshots.json");
const chunkSize = Number(process.env.GIFT_MODEL_CHUNK_SIZE || 25);
const tonUsdRate = Number(process.env.TON_USD_RATE || 0);

function stamp() {
  return new Date().toISOString();
}

function giftKey(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function nanoTon(value) {
  return Number(value || 0) / 1e9;
}

async function jsonFetch(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: options.method || "GET",
      headers: {
        "accept": "application/json",
        "content-type": "application/json",
        "user-agent": "TonTrack/1.0",
        ...(options.headers || {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
    const text = await response.text();
    const payload = text ? JSON.parse(text) : null;
    if (!response.ok) throw new Error(payload?.message || payload?.error || `${response.status}`);
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

async function liveTonUsdRate() {
  if (tonUsdRate > 0) return tonUsdRate;
  try {
    const payload = await jsonFetch("https://api.coingecko.com/api/v3/simple/price?ids=the-open-network&vs_currencies=usd", {}, 7000);
    return Number(payload?.["the-open-network"]?.usd || 0) || 0;
  } catch {
    return 0;
  }
}

function loadStore() {
  try {
    return JSON.parse(fs.readFileSync(snapshotsFile, "utf8"));
  } catch {
    return { version: 1, updatedAt: "", collections: {} };
  }
}

function saveStore(store) {
  fs.mkdirSync(dataDir, { recursive: true });
  store.updatedAt = new Date().toISOString();
  fs.writeFileSync(snapshotsFile, JSON.stringify(store, null, 2));
}

function appendCollection(store, collectionName, collection = {}, rate = 0) {
  const collectionKey = giftKey(collectionName);
  if (!collectionKey) return false;
  const floorTon = nanoTon(collection?.stats?.floor);
  if (!(floorTon > 0)) return false;
  const item = store.collections[collectionKey] || {
    key: collectionKey,
    name: collectionName,
    giftId: collection?.id || "",
    snapshots: [],
    recentSales: [],
  };
  const snapshot = {
    timestamp: new Date().toISOString(),
    floorTon,
    floorUsd: floorTon * rate,
    tonUsdRate: rate,
    source: "thermos-proxy",
    giftId: collection?.id || "",
    listedCount: Number(collection?.stats?.count || 0),
    totalSupply: Number(collection?.stats?.count || 0),
  };
  const last = item.snapshots[item.snapshots.length - 1];
  if (last && Date.now() - new Date(last.timestamp).getTime() < 20 * 60 * 1000) item.snapshots[item.snapshots.length - 1] = snapshot;
  else item.snapshots.push(snapshot);
  item.name = collectionName;
  item.giftId = collection?.id || item.giftId || "";
  item.snapshots = item.snapshots.slice(-1500);
  store.collections[collectionKey] = item;
  return true;
}

function appendModels(store, collectionName, models = [], rate = 0) {
  const collectionKey = giftKey(collectionName);
  if (!collectionKey || !Array.isArray(models)) return 0;
  const collection = store.collections[collectionKey] || {
    key: collectionKey,
    name: collectionName,
    giftId: "",
    snapshots: [],
    recentSales: [],
  };
  collection.models = collection.models || {};
  let count = 0;
  models.forEach((model) => {
    const modelName = String(model?.name || "").trim();
    const modelKey = giftKey(modelName);
    const floorTon = nanoTon(model?.stats?.floor);
    if (!modelName || !modelKey || !(floorTon > 0)) return;
    const item = collection.models[modelKey] || { key: modelKey, name: modelName, snapshots: [] };
    const snapshot = {
      timestamp: new Date().toISOString(),
      floorTon,
      floorUsd: floorTon * rate,
      tonUsdRate: rate,
      source: "thermos-model",
      listedCount: Number(model?.stats?.count || 0),
      modelCount: Number(model?.stats?.count || 0),
      rarity: Number(model?.rarity_per_mille || 0) / 10,
      marketUpdatedAt: new Date().toISOString(),
      iconUrl: model?.image_url || "",
    };
    const last = item.snapshots[item.snapshots.length - 1];
    if (last && Date.now() - new Date(last.timestamp).getTime() < 20 * 60 * 1000) item.snapshots[item.snapshots.length - 1] = snapshot;
    else item.snapshots.push(snapshot);
    item.name = modelName;
    item.iconUrl = snapshot.iconUrl || item.iconUrl || "";
    item.snapshots = item.snapshots.slice(-1500);
    collection.models[modelKey] = item;
    count += 1;
  });
  store.collections[collectionKey] = collection;
  return count;
}

(async () => {
  console.log(`[${stamp()}] Thermos gift model snapshot started`);
  const [rate, collections] = await Promise.all([
    liveTonUsdRate(),
    jsonFetch("https://proxy.thermos.gifts/api/v1/collections", {}, 15000),
  ]);
  const rows = Array.isArray(collections) ? collections : [];
  const store = loadStore();
  let collectionCount = 0;
  rows.forEach((collection) => {
    if (appendCollection(store, collection?.name || "", collection, rate)) collectionCount += 1;
  });
  let modelCount = 0;
  for (let index = 0; index < rows.length; index += chunkSize) {
    const names = rows.slice(index, index + chunkSize).map((row) => row?.name).filter(Boolean);
    if (!names.length) continue;
    const payload = await jsonFetch("https://proxy.thermos.gifts/api/v1/attributes", {
      method: "POST",
      body: { collections: names },
    }, 20000);
    names.forEach((name) => {
      const key = Object.keys(payload || {}).find((entry) => giftKey(entry) === giftKey(name));
      modelCount += appendModels(store, key || name, payload?.[key || name]?.models || [], rate);
    });
    saveStore(store);
    console.log(`[${stamp()}] ${Math.min(index + chunkSize, rows.length)}/${rows.length} collections, ${modelCount} models`);
  }
  saveStore(store);
  console.log(`[${stamp()}] Thermos gift model snapshot complete: ${collectionCount} collections, ${modelCount} models`);
})().catch((error) => {
  console.error(`[${stamp()}] Thermos gift model snapshot failed: ${error.message}`);
  process.exit(1);
});
