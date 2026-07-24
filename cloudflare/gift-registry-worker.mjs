const BUCKET_COUNT = 32;
const UNCHANGED_SAMPLE_MS = 24 * 60 * 60 * 1000;

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "authorization, content-type",
      "access-control-allow-methods": "GET, POST, OPTIONS",
    },
  });
}

function key(value = "") {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function comboKey(model = "", backdrop = "") {
  return `${key(model)}:${key(backdrop)}`;
}

function sourceKey(value = "") {
  const source = String(value || "").trim().toLowerCase();
  if (source.startsWith("thermos")) return "thermos";
  if (source.includes("telegram")) return "telegram-retired";
  return key(source) || "unknown";
}

// Floors are intentionally model + backdrop level. Symbols are retained for
// presentation, but do not split liquidity into separate price buckets.
function isBackdropComboEntry(targetKey = "", entry = {}) {
  const model = String(entry?.m || "").trim();
  const backdrop = String(entry?.b || "").trim();
  const backdropKey = comboKey(model, backdrop);
  return Boolean(model && backdrop && (targetKey === backdropKey || targetKey.startsWith(`${backdropKey}:`)));
}

function backdropComboBucket(bucket = {}) {
  const merged = {};
  for (const [targetKey, entry] of Object.entries(bucket || {})) {
    if (!isBackdropComboEntry(targetKey, entry)) continue;
    const normalizedKey = comboKey(entry.m, entry.b);
    const floorTon = Number(entry?.f || 0);
    if (!(floorTon > 0)) continue;
    const current = merged[normalizedKey];
    if (!current) {
      merged[normalizedKey] = { ...entry, l: Math.max(0, Number(entry.l || 0)) };
      continue;
    }
    current.l = Math.max(0, Number(current.l || 0)) + Math.max(0, Number(entry.l || 0));
    if (floorTon < Number(current.f || Infinity)) merged[normalizedKey] = { ...entry, l: current.l };
  }
  return merged;
}

function mergeSourceBuckets(rows = []) {
  const merged = {};
  const listingCounts = new Map();
  for (const row of rows) {
    if (sourceKey(row?.source) !== "thermos") continue;
    const entries = backdropComboBucket(JSON.parse(row?.combinations_json || "{}"));
    for (const [targetKey, entry] of Object.entries(entries)) {
      const floorTon = Number(entry?.f || 0);
      if (!(floorTon > 0)) continue;
      listingCounts.set(targetKey, (listingCounts.get(targetKey) || 0) + Number(entry.l || 0));
      const current = merged[targetKey];
      if (!current || floorTon < Number(current.f || 0)) {
        merged[targetKey] = { ...entry };
      }
    }
  }
  for (const [targetKey, count] of listingCounts) merged[targetKey].l = count;
  return merged;
}

function isBetterComboCandidate(candidate, current) {
  if (!current) return true;
  const candidateFloor = Number(candidate?.floorTon || 0);
  const currentFloor = Number(current?.floorTon || 0);
  const candidateActive = candidateFloor > 0 && Number(candidate?.listedCount || 0) > 0;
  const currentActive = currentFloor > 0 && Number(current?.listedCount || 0) > 0;
  if (candidateActive !== currentActive) return candidateActive;
  if (candidateFloor > 0 && currentFloor > 0 && candidateFloor !== currentFloor) {
    return candidateFloor < currentFloor;
  }
  const candidateAt = new Date(candidate?.snapshotAt || 0).getTime() || 0;
  const currentAt = new Date(current?.snapshotAt || 0).getTime() || 0;
  return candidateAt > currentAt;
}

// Charts only need the price and listing count. Keeping market URLs and names in
// every historical sample wastes D1 storage and eventually blocks fresh floors.
function historyPoint(entry) {
  if (!entry || !(Number(entry.f || 0) > 0)) return null;
  const point = { f: Number(entry.f || 0), l: Math.max(0, Number(entry.l || 0)) };
  if (String(entry.p || "") === "ESTIMATE") point.p = "ESTIMATE";
  return point;
}

function sameHistoryPoint(left, right) {
  const previous = historyPoint(left);
  const next = historyPoint(right);
  return JSON.stringify(previous) === JSON.stringify(next);
}

function historyDay(timestamp = Date.now()) {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function historySegmentEntry(timestamp, entry = {}) {
  const point = historyPoint(entry);
  if (!point) return null;
  return [String(timestamp), point.f, point.l, point.p === "ESTIMATE" ? 1 : 0];
}

function historySegmentPoints(points = {}) {
  const result = [];
  for (const [targetKey, rows] of Object.entries(points || {})) {
    for (const row of Array.isArray(rows) ? rows : []) {
      if (!Array.isArray(row) || !(Number(row[1] || 0) > 0)) continue;
      result.push({
        targetKey,
        timestamp: String(row[0] || ""),
        floorTon: Number(row[1] || 0),
        listedCount: Math.max(0, Number(row[2] || 0)),
        estimate: Number(row[3] || 0) === 1,
      });
    }
  }
  return result;
}

function historySegmentBucketPoints(points = {}, bucketIndex = 0) {
  const bucketPoints = points?.[String(bucketIndex)];
  // Accept the first deployed segment format while it naturally expires.
  return historySegmentPoints(bucketPoints && typeof bucketPoints === "object" ? bucketPoints : points);
}

async function appendHistorySegment(env, collectionKey, bucketIndex, snapshotAt, changes = {}) {
  const entries = Object.entries(changes)
    .map(([targetKey, entry]) => [targetKey, historySegmentEntry(snapshotAt, entry)])
    .filter(([, entry]) => entry);
  if (!entries.length) return;
  const database = floorSourcesDatabase(env);
  const dayStart = historyDay(snapshotAt);
  const existing = await database.prepare(
    `SELECT points_json FROM gift_combo_history_segments
     WHERE collection_key = ?1 AND day_start = ?2 AND bucket = ?3`
  ).bind(collectionKey, dayStart, -1).first();
  const points = JSON.parse(existing?.points_json || "{}");
  const bucketKey = String(bucketIndex);
  const bucketPoints = points[bucketKey] && typeof points[bucketKey] === "object" ? points[bucketKey] : {};
  for (const [targetKey, entry] of entries) {
    const rows = Array.isArray(bucketPoints[targetKey]) ? bucketPoints[targetKey] : [];
    const last = rows.at(-1);
    if (!last || JSON.stringify(last) !== JSON.stringify(entry)) rows.push(entry);
    bucketPoints[targetKey] = rows;
  }
  points[bucketKey] = bucketPoints;
  await database.prepare(
    `INSERT INTO gift_combo_history_segments (collection_key, day_start, bucket, points_json)
     VALUES (?1,?2,?3,?4)
     ON CONFLICT(collection_key, day_start, bucket) DO UPDATE SET
       points_json=excluded.points_json`
  ).bind(collectionKey, dayStart, -1, JSON.stringify(points)).run();
}

async function compactLegacyHistory(env, requestedLimit = 200) {
  const database = floorSourcesDatabase(env);
  const limit = Math.max(1, Math.min(500, Number(requestedLimit || 200)));
  const result = await database.prepare(
    `SELECT collection_key, sampled_at, bucket, changes_json
     FROM gift_combo_history_buckets
     ORDER BY sampled_at ASC
     LIMIT ?1`
  ).bind(limit).all();
  const rows = result.results || [];
  if (!rows.length) return { compactedRows: 0, segments: 0 };
  const groups = new Map();
  for (const row of rows) {
    const dayStart = historyDay(row.sampled_at);
    const groupKey = `${row.collection_key}:${dayStart}`;
    const group = groups.get(groupKey) || {
      collectionKey: row.collection_key,
      dayStart,
      rows: [],
    };
    group.rows.push(row);
    groups.set(groupKey, group);
  }
  for (const group of groups.values()) {
    const existing = await database.prepare(
      `SELECT points_json FROM gift_combo_history_segments
       WHERE collection_key = ?1 AND day_start = ?2 AND bucket = ?3`
    ).bind(group.collectionKey, group.dayStart, -1).first();
    const points = JSON.parse(existing?.points_json || "{}");
    for (const row of group.rows) {
      const changes = JSON.parse(row.changes_json || "{}");
      const bucketKey = String(row.bucket);
      const bucketPoints = points[bucketKey] && typeof points[bucketKey] === "object" ? points[bucketKey] : {};
      for (const [targetKey, entry] of Object.entries(changes)) {
        const point = historySegmentEntry(row.sampled_at, entry);
        if (!point) continue;
        const targetRows = Array.isArray(bucketPoints[targetKey]) ? bucketPoints[targetKey] : [];
        const last = targetRows.at(-1);
        if (!last || JSON.stringify(last) !== JSON.stringify(point)) targetRows.push(point);
        bucketPoints[targetKey] = targetRows;
      }
      points[bucketKey] = bucketPoints;
    }
    await database.prepare(
      `INSERT INTO gift_combo_history_segments (collection_key, day_start, bucket, points_json)
       VALUES (?1,?2,?3,?4)
       ON CONFLICT(collection_key, day_start, bucket) DO UPDATE SET
         points_json=excluded.points_json`
    ).bind(group.collectionKey, group.dayStart, -1, JSON.stringify(points)).run();
  }
  await database.batch(rows.map((row) => database.prepare(
    `DELETE FROM gift_combo_history_buckets
     WHERE collection_key = ?1 AND sampled_at = ?2 AND bucket = ?3`
  ).bind(row.collection_key, row.sampled_at, row.bucket)));
  return { compactedRows: rows.length, segments: groups.size };
}

async function retireTelegramFloors(env, body = {}) {
  const sourceDb = floorSourcesDatabase(env);
  const registry = env.GIFT_REGISTRY;
  const limit = Math.max(1, Math.min(250, Number(body.limit || 200)));
  const cursor = Math.max(0, Number(body.cursor || 0));

  if (body.reset === true) {
    await sourceDb.batch([
      sourceDb.prepare("DELETE FROM gift_combo_source_buckets WHERE source = 'telegram-marketplace'"),
      sourceDb.prepare("DELETE FROM gift_combo_history_buckets"),
      sourceDb.prepare("DELETE FROM gift_combo_history_segments"),
    ]);
    const registryDeletes = [
      registry.prepare("DELETE FROM gift_combo_buckets"),
      registry.prepare("DELETE FROM gift_combo_history_buckets"),
      registry.prepare("DELETE FROM telegram_floor_scan_targets"),
    ];
    if (registry !== sourceDb) await registry.batch(registryDeletes);
    return json({ ok: true, phase: "rebuild", cursor: 0, removedSource: "telegram-marketplace" });
  }

  const sourceRows = await sourceDb.prepare(
    `SELECT collection_key, bucket, snapshot_at, combinations_json
     FROM gift_combo_source_buckets
     WHERE source = 'thermos'
     ORDER BY collection_key, bucket
     LIMIT ?1 OFFSET ?2`
  ).bind(limit, cursor).all();
  const rows = sourceRows.results || [];
  if (rows.length) {
    await registry.batch(rows.map((row) => registry.prepare(
      `INSERT INTO gift_combo_buckets (collection_key, bucket, snapshot_at, combinations_json)
       VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT(collection_key, bucket) DO UPDATE SET
         snapshot_at = excluded.snapshot_at,
         combinations_json = excluded.combinations_json`
    ).bind(
      row.collection_key,
      Number(row.bucket),
      row.snapshot_at,
      JSON.stringify(backdropComboBucket(JSON.parse(row.combinations_json || "{}")))
    )));
  }
  return json({
    ok: true,
    phase: rows.length === limit ? "rebuild" : "complete",
    cursor: cursor + rows.length,
    rebuiltBuckets: rows.length,
  });
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
    combinations = combinations.flatMap((prefix) => (
      wordVariants(word).map((variant) => `${prefix}${variant}`)
    ));
  });
  return [...new Set([key(value), ...combinations.map(key)])].filter(Boolean);
}

function bucketFor(value = "") {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % BUCKET_COUNT;
}

function authorized(request, env) {
  const expected = String(env.INGEST_SECRET || "");
  return expected && request.headers.get("authorization") === `Bearer ${expected}`;
}

function floorSourcesDatabase(env) {
  return env.GIFT_FLOOR_SOURCES || env.GIFT_REGISTRY;
}

function historyDatabases(env) {
  return env.GIFT_FLOOR_SOURCES && env.GIFT_FLOOR_SOURCES !== env.GIFT_REGISTRY
    ? [env.GIFT_REGISTRY, env.GIFT_FLOOR_SOURCES]
    : [env.GIFT_REGISTRY];
}

async function readCombo(env, collection, model, backdrop, symbol) {
  const collectionKeys = collectionAliasKeys(collection);
  const targetKey = comboKey(model, backdrop, symbol);
  if (!collectionKeys.length || !key(model) || !key(backdrop)) return null;
  const bucket = bucketFor(targetKey);
  const rows = await env.GIFT_REGISTRY.batch(collectionKeys.map((collectionKey) => (
    env.GIFT_REGISTRY.prepare(
      `SELECT c.collection_name, c.snapshot_at AS collection_snapshot_at, c.source, b.snapshot_at AS bucket_snapshot_at, b.combinations_json
       FROM gift_combo_collections c
       JOIN gift_combo_buckets b ON b.collection_key = c.collection_key
       WHERE c.collection_key = ?1 AND b.bucket = ?2`
    ).bind(collectionKey, bucket)
  )));
  const candidates = rows.map((result) => result.results?.[0]).flatMap((row) => {
    if (!row) return [];
    const entry = backdropComboBucket(JSON.parse(row.combinations_json || "{}"))[targetKey];
    if (!entry) return [];
    return [{
      collection: row.collection_name,
      model: entry.m,
      backdrop: entry.b,
      symbol: entry.y || "",
      floorTon: Number(entry.f || 0),
      floorStars: Number(entry.s || 0),
      listedCount: Number(entry.l || 0),
      marketplace: entry.p || "",
      listingUrl: entry.u || "",
      listingId: entry.i || "",
      snapshotAt: row.bucket_snapshot_at || row.collection_snapshot_at,
      source: row.source || "gift-combo-d1",
    }];
  });
  return candidates.reduce((best, candidate) => (
    isBetterComboCandidate(candidate, best) ? candidate : best
  ), null);
}

async function readCombos(env, pairs = []) {
  const groups = new Map();
  const collectionKeys = new Set();
  pairs.forEach((pair) => {
    const aliasKeys = collectionAliasKeys(pair.collection);
    const targetKey = comboKey(pair.model, pair.backdrop);
    if (!aliasKeys.length || !key(pair.model) || !key(pair.backdrop)) return;
    const bucket = bucketFor(targetKey);
    aliasKeys.forEach((collectionKey) => {
      collectionKeys.add(collectionKey);
      const groupKey = `${collectionKey}:${bucket}`;
      const group = groups.get(groupKey) || { collectionKey, bucket, pairs: [] };
      group.pairs.push({ ...pair, targetKey });
      groups.set(groupKey, group);
    });
  });
  const grouped = [...groups.values()];
  const rowGroups = [];
  for (let index = 0; index < grouped.length; index += 50) {
    const chunk = grouped.slice(index, index + 50);
    const chunkRows = await env.GIFT_REGISTRY.batch(chunk.map((group) => (
      env.GIFT_REGISTRY.prepare(
        `SELECT c.collection_name, c.snapshot_at AS collection_snapshot_at, c.source, b.snapshot_at AS bucket_snapshot_at, b.combinations_json
         FROM gift_combo_collections c
         JOIN gift_combo_buckets b ON b.collection_key = c.collection_key
         WHERE c.collection_key = ?1 AND b.bucket = ?2`
      ).bind(group.collectionKey, group.bucket)
    )));
    chunkRows.forEach((result, resultIndex) => rowGroups.push({ result, group: chunk[resultIndex] }));
  }
  const coverageRows = [];
  const collectionKeyList = [...collectionKeys];
  for (let index = 0; index < collectionKeyList.length; index += 50) {
    const chunk = collectionKeyList.slice(index, index + 50);
    coverageRows.push(...await env.GIFT_REGISTRY.batch(chunk.map((collectionKey) => (
      env.GIFT_REGISTRY.prepare(
        `SELECT collection_key, snapshot_at
         FROM gift_combo_collections
         WHERE collection_key = ?1 AND bucket_count = ?2`
      ).bind(collectionKey, BUCKET_COUNT)
    ))));
  }
  const coverage = coverageRows
    .map((result) => result.results?.[0])
    .filter(Boolean)
    .map((row) => ({ collectionKey: row.collection_key, snapshotAt: row.snapshot_at }));
  const rowMap = new Map();
  rowGroups.forEach(({ result, group }) => {
    const row = result.results?.[0];
    if (!row) return;
    rowMap.set(`${group.collectionKey}:${group.bucket}`, row);
  });
  const results = new Map();
  grouped.forEach((group) => {
    const row = rowMap.get(`${group.collectionKey}:${group.bucket}`);
    if (!row) return;
    const entries = JSON.parse(row.combinations_json || "{}");
    group.pairs.forEach((pair) => {
      const entry = backdropComboBucket(entries)[pair.targetKey];
      if (!entry) return;
      const resultKey = [key(pair.collection), key(pair.model), key(pair.backdrop)].join(":");
      const candidate = {
        collection: row.collection_name,
        model: entry.m,
        backdrop: entry.b,
        symbol: entry.y || "",
        floorTon: Number(entry.f || 0),
        floorStars: Number(entry.s || 0),
        listedCount: Number(entry.l || 0),
        marketplace: entry.p || "",
        listingUrl: entry.u || "",
        listingId: entry.i || "",
        snapshotAt: row.bucket_snapshot_at || row.collection_snapshot_at,
        source: row.source || "gift-combo-d1",
      };
      const current = results.get(resultKey);
      if (isBetterComboCandidate(candidate, current)) {
        results.set(resultKey, candidate);
      }
    });
  });
  return { combinations: [...results.values()], coverage };
}

async function readCollectionCombos(env, collections = []) {
  const requested = [...new Set((Array.isArray(collections) ? collections : [])
    .flatMap((collection) => collectionAliasKeys(collection))
    .filter(Boolean))]
    .slice(0, 100);
  if (!requested.length) return { collections: [] };
  const rows = [];
  for (let index = 0; index < requested.length; index += 10) {
    const chunk = requested.slice(index, index + 10);
    const results = await env.GIFT_REGISTRY.batch(chunk.map((collectionKey) => (
      env.GIFT_REGISTRY.prepare(
        `SELECT c.collection_key, c.collection_name, c.snapshot_at AS collection_snapshot_at,
          c.source, b.bucket, b.snapshot_at AS bucket_snapshot_at, b.combinations_json
         FROM gift_combo_collections c
         JOIN gift_combo_buckets b ON b.collection_key = c.collection_key
         WHERE c.collection_key = ?1 AND c.bucket_count = ?2
         ORDER BY b.bucket ASC`
      ).bind(collectionKey, BUCKET_COUNT)
    )));
    results.forEach((result) => rows.push(...(result.results || [])));
  }
  const byCollection = new Map();
  rows.forEach((row) => {
    const collection = byCollection.get(row.collection_key) || {
      collectionKey: row.collection_key,
      collection: row.collection_name,
      snapshotAt: row.collection_snapshot_at,
      source: row.source || "gift-combo-d1",
      combinations: {},
    };
    const entries = JSON.parse(row.combinations_json || "{}");
    Object.entries(backdropComboBucket(entries)).forEach(([targetKey, entry]) => {
      collection.combinations[targetKey] = {
        model: entry.m,
        backdrop: entry.b,
        symbol: entry.y || "",
        floorTon: Number(entry.f || 0),
        floorStars: Number(entry.s || 0),
        listedCount: Number(entry.l || 0),
        marketplace: entry.p || "",
        listingUrl: entry.u || "",
        listingId: entry.i || "",
        snapshotAt: row.bucket_snapshot_at || row.collection_snapshot_at,
      };
    });
    byCollection.set(row.collection_key, collection);
  });
  return { collections: [...byCollection.values()] };
}

async function readComboHistory(env, collection, model, backdrop, symbol) {
  const collectionKeys = collectionAliasKeys(collection);
  const targetKey = comboKey(model, backdrop, symbol);
  if (!collectionKeys.length || targetKey === "::") return [];
  const bucket = bucketFor(targetKey);
  const results = (await Promise.all(historyDatabases(env).map((database) => (
    database.batch(collectionKeys.map((collectionKey) => (
      database.prepare(
        `SELECT sampled_at, changes_json
         FROM gift_combo_history_buckets
         WHERE collection_key = ?1 AND bucket = ?2
         ORDER BY sampled_at ASC`
      ).bind(collectionKey, bucket)
    )))
  )))).flat();
  const segmentResults = await floorSourcesDatabase(env).batch(collectionKeys.map((collectionKey) => (
    floorSourcesDatabase(env).prepare(
      `SELECT points_json
       FROM gift_combo_history_segments
       WHERE collection_key = ?1 AND bucket IN (-1, ?2)
       ORDER BY day_start ASC`
    ).bind(collectionKey, bucket)
  )));
  const seen = new Set();
  const legacy = results.flatMap((result) => (result.results || []).map((row) => {
    const entry = JSON.parse(row.changes_json || "{}")[targetKey];
    if (!entry || !(Number(entry.f || 0) > 0)) return null;
    const id = `${row.sampled_at}:${Number(entry.f || 0)}`;
    if (seen.has(id)) return null;
    seen.add(id);
    return { timestamp: row.sampled_at, floorTon: Number(entry.f || 0), listedCount: Number(entry.l || 0) };
  }).filter(Boolean));
  const compacted = segmentResults.flatMap((result) => (result.results || []).flatMap((row) => (
    historySegmentBucketPoints(JSON.parse(row.points_json || "{}"), bucket)
      .filter((point) => point.targetKey === targetKey)
      .map((point) => ({ timestamp: point.timestamp, floorTon: point.floorTon, listedCount: point.listedCount }))
  )));
  return legacy.concat(compacted).filter((point) => {
    const id = `${point.timestamp}:${point.floorTon}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  }).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
}

function saleRow(row = {}) {
  const soldAt = Number.isFinite(Number(row.sold_at_unix))
    ? new Date(Number(row.sold_at_unix) * 1000).toISOString()
    : (row.sold_at || "");
  return {
    saleId: row.sale_id || "",
    collection: row.collection_name || "",
    model: row.model_name || "",
    backdrop: row.backdrop_name || "",
    symbol: row.symbol_name || "",
    marketplace: row.marketplace || "",
    slug: row.slug || "",
    giftId: row.gift_id || "",
    mint: Number(row.gift_number || 0),
    priceTon: Number(row.price_ton || 0),
    originalPrice: row.original_price || "",
    date: soldAt,
    soldAt,
    giftUrl: row.gift_url || (row.slug ? `https://t.me/nft/${encodeURIComponent(row.slug)}` : ""),
    exact: true,
  };
}

function salesDatabase(env) {
  // Writes go to the current shard. The prior archive remains readable so a
  // full D1 database never stops new sales from being ingested.
  return env.GIFT_SALES_CURRENT || env.GIFT_SALES || env.GIFT_REGISTRY;
}

function salesReadDatabases(env) {
  const databases = [
    env.GIFT_SALES_CURRENT,
    env.GIFT_SALES_ARCHIVE,
    env.GIFT_SALES_ARCHIVE_2,
    env.GIFT_SALES,
    env.GIFT_REGISTRY,
  ].filter(Boolean);
  return databases.filter((database, index) => databases.indexOf(database) === index);
}

function compactSalesDatabases(env) {
  return [env.GIFT_SALES_2025, env.GIFT_SALES_2026].filter(Boolean);
}

function salesWriteDatabaseFor(env, sale) {
  const year = new Date(sale.soldAt).getUTCFullYear();
  if (year === 2025 && env.GIFT_SALES_2025) return env.GIFT_SALES_2025;
  if (year === 2026 && env.GIFT_SALES_2026) return env.GIFT_SALES_2026;
  return salesDatabase(env);
}

function saleTimestamp(row = {}) {
  if (Number.isFinite(Number(row.sold_at_unix))) return Number(row.sold_at_unix) * 1000;
  return new Date(row.sold_at || 0).getTime();
}

function mergeSalesRows(results = [], requestedLimit = 5) {
  const rows = new Map();
  results.flatMap((result) => result?.results || []).forEach((row) => {
    if (!row.sale_id || rows.has(row.sale_id)) return;
    rows.set(row.sale_id, row);
  });
  return [...rows.values()]
    .sort((left, right) => saleTimestamp(right) - saleTimestamp(left))
    .slice(0, Math.max(1, Math.min(20, Number(requestedLimit || 5))));
}

function compactSalesReadStatement(database, pair = {}, requestedLimit = 5) {
  const collectionKeys = collectionAliasKeys(pair.collection).slice(0, 16);
  const modelKey = key(pair.model);
  const backdropKey = key(pair.backdrop);
  const symbolKey = key(pair.symbol);
  if (!collectionKeys.length || !modelKey || !backdropKey) return null;
  const values = [...collectionKeys, modelKey, backdropKey];
  const collectionParams = collectionKeys.map((_, index) => `?${index + 1}`).join(",");
  let sql = `SELECT e.sale_id, c.collection_name, c.model_name, c.backdrop_name, c.symbol_name,
      e.marketplace, e.slug, e.gift_id, e.gift_number,
      (e.price_nano / 1000000000.0) AS price_ton, e.sold_at AS sold_at_unix
     FROM gift_sale_events e
     JOIN gift_sale_combos c ON c.combo_id = e.combo_id
     WHERE c.collection_key IN (${collectionParams})
       AND c.model_key = ?${values.length - 1}
       AND c.backdrop_key = ?${values.length}`;
  if (symbolKey) {
    values.push(symbolKey);
    sql += ` AND c.symbol_key = ?${values.length}`;
  }
  values.push(Math.max(1, Math.min(20, Number(requestedLimit || 5))));
  sql += ` ORDER BY e.sold_at DESC LIMIT ?${values.length}`;
  return database.prepare(sql).bind(...values);
}

function salesReadStatement(database, pair = {}, requestedLimit = 5) {
  const collectionKeys = collectionAliasKeys(pair.collection).slice(0, 16);
  const modelKey = key(pair.model);
  const backdropKey = key(pair.backdrop);
  const symbolKey = key(pair.symbol);
  if (!collectionKeys.length || !modelKey || !backdropKey) return null;
  const values = [...collectionKeys, modelKey, backdropKey];
  const collectionParams = collectionKeys.map((_, index) => `?${index + 1}`).join(",");
  let sql = `SELECT sale_id, collection_name, model_name, backdrop_name, symbol_name,
      marketplace, slug, gift_id, gift_number, price_ton, original_price, sold_at, gift_url
     FROM gift_sales
     WHERE collection_key IN (${collectionParams})
       AND model_key = ?${values.length - 1}
       AND backdrop_key = ?${values.length}`;
  if (symbolKey) {
    values.push(symbolKey);
    sql += ` AND symbol_key = ?${values.length}`;
  }
  values.push(Math.max(1, Math.min(20, Number(requestedLimit || 5))));
  sql += ` ORDER BY sold_at DESC LIMIT ?${values.length}`;
  return database.prepare(sql).bind(...values);
}

async function readSales(env, pair = {}, requestedLimit = 5) {
  const statements = [
    ...compactSalesDatabases(env).map((database) => compactSalesReadStatement(database, pair, requestedLimit)),
    ...salesReadDatabases(env).map((database) => salesReadStatement(database, pair, requestedLimit)),
  ].filter(Boolean);
  if (!statements.length) return [];
  const results = [];
  // Sales history is sharded. Older shards may not yet have the compact schema,
  // so one unavailable shard must not hide results held by the others.
  for (const statement of statements) {
    try {
      results.push(await statement.all());
    } catch {
      // Continue with the remaining read replicas/shards.
    }
  }
  return mergeSalesRows(results, requestedLimit).map(saleRow);
}

async function readSalesBulk(env, pairs = [], requestedLimit = 5) {
  const unique = [];
  const seen = new Set();
  (Array.isArray(pairs) ? pairs : []).slice(0, 500).forEach((pair) => {
    const id = [key(pair.collection), key(pair.model), key(pair.backdrop), key(pair.symbol)].join(":");
    if (!key(pair.collection) || !key(pair.model) || !key(pair.backdrop) || seen.has(id)) return;
    seen.add(id);
    unique.push({
      collection: String(pair.collection || "").trim(),
      model: String(pair.model || "").trim(),
      backdrop: String(pair.backdrop || "").trim(),
      symbol: String(pair.symbol || "").trim(),
    });
  });
  const results = [];
  const databases = salesReadDatabases(env);
  const compactDatabases = compactSalesDatabases(env);
  for (let index = 0; index < unique.length; index += 50) {
    const chunk = unique.slice(index, index + 50);
    const batches = [];
    for (const database of compactDatabases) {
      try {
        batches.push(await database.batch(chunk.map((pair) => compactSalesReadStatement(database, pair, requestedLimit))));
      } catch {
        // This shard can be on the legacy schema; the normal sales table is
        // queried below and remains a valid source for every requested pair.
      }
    }
    for (const database of databases) {
      try {
        batches.push(await database.batch(chunk.map((pair) => salesReadStatement(database, pair, requestedLimit))));
      } catch {
        // Keep healthy sales shards available even if one archive is offline.
      }
    }
    chunk.forEach((pair, resultIndex) => {
      const rows = mergeSalesRows(batches.map((batch) => batch[resultIndex]), requestedLimit);
      results.push({ ...pair, sales: rows.map(saleRow) });
    });
  }
  return { results };
}

function normalizedSalesTarget(input = {}) {
  const collectionName = String(input.collection || input.collectionName || "").trim();
  const modelName = String(input.model || input.modelName || "").trim();
  const backdropName = String(input.backdrop || input.backdropName || "").trim();
  const collectionKey = key(collectionName);
  const modelKey = key(modelName);
  const backdropKey = key(backdropName);
  if (!collectionKey || !modelKey || !backdropKey) return null;
  return {
    targetKey: `${collectionKey}:${modelKey}:${backdropKey}`,
    collectionKey,
    collectionName,
    modelKey,
    modelName,
    backdropKey,
    backdropName,
  };
}

function normalizedTelegramFloorTarget(input = {}) {
  const collectionName = String(input.collection || input.collectionName || "").trim();
  const modelName = String(input.model || input.modelName || "").trim();
  const backdropName = String(input.backdrop || input.backdropName || "").trim();
  const symbolName = String(input.symbol || input.symbolName || "").trim();
  const collectionKey = key(collectionName);
  const modelKey = key(modelName);
  const backdropKey = key(backdropName);
  const symbolKey = key(symbolName);
  if (!collectionKey || !modelKey || !backdropKey) return null;
  return {
    targetKey: `${collectionKey}:${modelKey}:${backdropKey}`,
    collectionKey,
    collectionName,
    modelKey,
    modelName,
    backdropKey,
    backdropName,
    symbolKey,
    symbolName,
  };
}

function normalizedEstimateHistoryTarget(input = {}) {
  return normalizedTelegramFloorTarget(input);
}

async function readEstimateHistoryTargets(request, env) {
  if (!authorized(request, env)) return json({ error: "Unauthorized" }, 401);
  const url = new URL(request.url);
  const limit = Math.max(1, Math.min(250, Number(url.searchParams.get("limit") || 100)));
  const dueBefore = String(url.searchParams.get("dueBefore") || new Date().toISOString());
  const result = await env.GIFT_REGISTRY.prepare(
    `SELECT target_key, collection_name, model_name, backdrop_name, symbol_name, requested_at, last_evaluated_at
     FROM gift_estimate_history_targets
     WHERE last_evaluated_at = '' OR last_evaluated_at <= ?1
     ORDER BY last_evaluated_at ASC, requested_at ASC
     LIMIT ?2`
  ).bind(dueBefore, limit).all();
  return json({
    targets: (result.results || []).map((row) => ({
      targetKey: row.target_key,
      collection: row.collection_name,
      model: row.model_name,
      backdrop: row.backdrop_name,
      symbol: row.symbol_name || "",
      requestedAt: row.requested_at,
      lastEvaluatedAt: row.last_evaluated_at,
    })),
  });
}

async function ingestEstimateHistoryTargetResult(request, env) {
  if (!authorized(request, env)) return json({ error: "Unauthorized" }, 401);
  const body = await request.json();
  const target = normalizedEstimateHistoryTarget(body);
  if (!target) return json({ error: "Expected collection, model, and backdrop" }, 400);
  const evaluatedAt = String(body.evaluatedAt || new Date().toISOString());
  const status = String(body.status || "evaluated").slice(0, 64);
  await env.GIFT_REGISTRY.prepare(
    `INSERT INTO gift_estimate_history_targets (
      target_key, collection_key, collection_name, model_key, model_name,
      backdrop_key, backdrop_name, symbol_key, symbol_name, requested_at, last_evaluated_at, status
    ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?10,?11)
    ON CONFLICT(target_key) DO UPDATE SET
      collection_name=excluded.collection_name,
      model_name=excluded.model_name,
      backdrop_name=excluded.backdrop_name,
      symbol_name=excluded.symbol_name,
      last_evaluated_at=excluded.last_evaluated_at,
      status=excluded.status`
  ).bind(
    target.targetKey, target.collectionKey, target.collectionName,
    target.modelKey, target.modelName, target.backdropKey, target.backdropName,
    target.symbolKey, target.symbolName, evaluatedAt, status
  ).run();
  return json({ ok: true, evaluatedAt, status });
}

async function ingestTelegramFloorTargets(request, env) {
  if (!authorized(request, env)) return json({ error: "Unauthorized" }, 401);
  const body = await request.json();
  const requestedAt = String(body.requestedAt || new Date().toISOString());
  const priority = Math.max(1, Math.min(1000, Number(body.priority || 100)));
  const unique = new Map();
  (Array.isArray(body.pairs) ? body.pairs : []).slice(0, 1000).forEach((pair) => {
    const target = normalizedTelegramFloorTarget(pair);
    if (target) unique.set(target.targetKey, target);
  });
  const targets = [...unique.values()];
  for (let index = 0; index < targets.length; index += 50) {
    const chunk = targets.slice(index, index + 50);
    await env.GIFT_REGISTRY.batch(chunk.map((target) => env.GIFT_REGISTRY.prepare(
      `INSERT INTO telegram_floor_scan_targets (
        target_key, collection_key, collection_name, model_key, model_name,
        backdrop_key, backdrop_name, symbol_key, symbol_name, priority, requested_at
      ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)
      ON CONFLICT(target_key) DO UPDATE SET
        collection_name=excluded.collection_name,
        model_name=excluded.model_name,
        backdrop_name=excluded.backdrop_name,
        symbol_name=excluded.symbol_name,
        priority=MAX(telegram_floor_scan_targets.priority, excluded.priority),
        requested_at=MAX(telegram_floor_scan_targets.requested_at, excluded.requested_at),
        status=CASE WHEN excluded.requested_at > telegram_floor_scan_targets.last_scanned_at THEN 'pending' ELSE telegram_floor_scan_targets.status END`
    ).bind(
      target.targetKey, target.collectionKey, target.collectionName,
      target.modelKey, target.modelName, target.backdropKey, target.backdropName,
      target.symbolKey, target.symbolName, priority, requestedAt
    )));
  }
  return json({ ok: true, accepted: targets.length, requestedAt });
}

async function readTelegramFloorTargets(request, env) {
  if (!authorized(request, env)) return json({ error: "Unauthorized" }, 401);
  const url = new URL(request.url);
  const limit = Math.max(1, Math.min(100, Number(url.searchParams.get("limit") || 25)));
  const result = await env.GIFT_REGISTRY.prepare(
    `SELECT target_key, collection_name, model_name, backdrop_name, symbol_name, priority, requested_at
     FROM telegram_floor_scan_targets
     WHERE last_scanned_at = '' OR requested_at > last_scanned_at
     ORDER BY priority DESC, requested_at DESC
     LIMIT ?1`
  ).bind(limit).all();
  return json({
    targets: (result.results || []).map((row) => ({
      targetKey: row.target_key,
      collection: row.collection_name,
      model: row.model_name,
      backdrop: row.backdrop_name,
      symbol: row.symbol_name || "",
      priority: Number(row.priority || 0),
      requestedAt: row.requested_at,
    })),
  });
}

async function ingestSalesTargets(request, env) {
  if (!authorized(request, env)) return json({ error: "Unauthorized" }, 401);
  const body = await request.json();
  const requestedAt = String(body.requestedAt || new Date().toISOString());
  const priority = Math.max(1, Math.min(1000, Number(body.priority || 100)));
  const unique = new Map();
  (Array.isArray(body.pairs) ? body.pairs : []).slice(0, 1000).forEach((pair) => {
    const target = normalizedSalesTarget(pair);
    if (target) unique.set(target.targetKey, target);
  });
  const database = salesDatabase(env);
  const targets = [...unique.values()];
  for (let index = 0; index < targets.length; index += 50) {
    const chunk = targets.slice(index, index + 50);
    await database.batch(chunk.map((target) => database.prepare(
      `INSERT INTO gift_sales_scan_targets (
        target_key, collection_key, collection_name, model_key, model_name,
        backdrop_key, backdrop_name, priority, requested_at
      ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)
      ON CONFLICT(target_key) DO UPDATE SET
        collection_name=excluded.collection_name,
        model_name=excluded.model_name,
        backdrop_name=excluded.backdrop_name,
        priority=MAX(gift_sales_scan_targets.priority, excluded.priority),
        requested_at=MAX(gift_sales_scan_targets.requested_at, excluded.requested_at),
        status=CASE WHEN excluded.requested_at > gift_sales_scan_targets.last_scanned_at THEN 'pending' ELSE gift_sales_scan_targets.status END`
    ).bind(
      target.targetKey, target.collectionKey, target.collectionName,
      target.modelKey, target.modelName, target.backdropKey, target.backdropName,
      priority, requestedAt
    )));
  }
  return json({ ok: true, accepted: targets.length, requestedAt });
}

async function readSalesTargets(request, env) {
  if (!authorized(request, env)) return json({ error: "Unauthorized" }, 401);
  const url = new URL(request.url);
  const limit = Math.max(1, Math.min(1000, Number(url.searchParams.get("limit") || 500)));
  const result = await salesDatabase(env).prepare(
    `SELECT target_key, collection_name, model_name, backdrop_name, priority, requested_at
     FROM gift_sales_scan_targets t
     WHERE (t.last_scanned_at = '' OR t.requested_at > t.last_scanned_at)
       AND NOT EXISTS (
         SELECT 1 FROM gift_sales s
         WHERE s.collection_key = t.collection_key
           AND s.model_key = t.model_key
           AND s.backdrop_key = t.backdrop_key
       )
     ORDER BY t.priority DESC, t.requested_at DESC
     LIMIT ?1`
  ).bind(limit).all();
  return json({
    targets: (result.results || []).map((row) => ({
      targetKey: row.target_key,
      collection: row.collection_name,
      model: row.model_name,
      backdrop: row.backdrop_name,
      priority: Number(row.priority || 0),
      requestedAt: row.requested_at,
    })),
  });
}

async function readSalesStateFromDatabase(database, collection = "") {
  const collectionKeys = collectionAliasKeys(collection).slice(0, 16);
  const result = collectionKeys.length
    ? await database.prepare(
      `SELECT collection_key, collection_name, newest_sale_id, newest_sold_at,
        last_scanned_at, pages_scanned, rows_seen, rows_inserted, source
       FROM gift_sales_collection_state
       WHERE collection_key IN (${collectionKeys.map((_, index) => `?${index + 1}`).join(",")})
       ORDER BY last_scanned_at DESC`
    ).bind(...collectionKeys).all()
    : await database.prepare(
      `SELECT collection_key, collection_name, newest_sale_id, newest_sold_at,
        last_scanned_at, pages_scanned, rows_seen, rows_inserted, source
       FROM gift_sales_collection_state
       ORDER BY collection_name ASC`
    ).all();
  return (result.results || []).map((row) => ({
    collectionKey: row.collection_key,
    collection: row.collection_name,
    newestSaleId: row.newest_sale_id,
    newestSoldAt: row.newest_sold_at,
    lastScannedAt: row.last_scanned_at,
    pagesScanned: Number(row.pages_scanned || 0),
    rowsSeen: Number(row.rows_seen || 0),
    rowsInserted: Number(row.rows_inserted || 0),
    source: row.source || "gift-satellite",
  }));
}

async function readSalesState(env, collection = "") {
  const stateLists = await Promise.all(salesReadDatabases(env).map((database) => (
    readSalesStateFromDatabase(database, collection).catch(() => [])
  )));
  const merged = new Map();
  stateLists.flat().forEach((state) => {
    const current = merged.get(state.collectionKey);
    const stateCompleted = state.coverageMode === "chronological" && Boolean(state.completedAt);
    const currentCompleted = current?.coverageMode === "chronological" && Boolean(current.completedAt);
    if (!current || (stateCompleted && !currentCompleted)
      || (stateCompleted === currentCompleted
        && new Date(state.lastScannedAt || 0) >= new Date(current.lastScannedAt || 0))) {
      merged.set(state.collectionKey, state);
    }
  });
  return [...merged.values()];
}

async function readSalesBackfillStateFromDatabase(database, collection = "") {
  const collectionKeys = collectionAliasKeys(collection).slice(0, 16);
  const result = collectionKeys.length
    ? await database.prepare(
      `SELECT collection_key, collection_name, next_page, oldest_sale_id, oldest_sold_at,
        cutoff_at, completed_at, pages_scanned, rows_seen, rows_inserted, last_scanned_at, source, coverage_mode
       FROM gift_sales_backfill_state
       WHERE collection_key IN (${collectionKeys.map((_, index) => `?${index + 1}`).join(",")})
       ORDER BY last_scanned_at DESC`
    ).bind(...collectionKeys).all()
    : await database.prepare(
      `SELECT collection_key, collection_name, next_page, oldest_sale_id, oldest_sold_at,
        cutoff_at, completed_at, pages_scanned, rows_seen, rows_inserted, last_scanned_at, source, coverage_mode
       FROM gift_sales_backfill_state
       ORDER BY collection_name ASC`
    ).all();
  return (result.results || []).map((row) => ({
    collectionKey: row.collection_key,
    collection: row.collection_name,
    nextPage: Number(row.next_page || 0),
    oldestSaleId: row.oldest_sale_id || "",
    oldestSoldAt: row.oldest_sold_at || "",
    cutoffAt: row.cutoff_at || "",
    completedAt: row.completed_at || "",
    pagesScanned: Number(row.pages_scanned || 0),
    rowsSeen: Number(row.rows_seen || 0),
    rowsInserted: Number(row.rows_inserted || 0),
    lastScannedAt: row.last_scanned_at || "",
    source: row.source || "gift-satellite",
    coverageMode: row.coverage_mode || "legacy-exact",
  }));
}

async function readSalesBackfillState(env, collection = "") {
  const stateLists = await Promise.all(salesReadDatabases(env).map((database) => (
    readSalesBackfillStateFromDatabase(database, collection).catch(() => [])
  )));
  const merged = new Map();
  stateLists.flat().forEach((state) => {
    const current = merged.get(state.collectionKey);
    if (!current || new Date(state.lastScannedAt || 0) >= new Date(current.lastScannedAt || 0)) {
      merged.set(state.collectionKey, state);
    }
  });
  return [...merged.values()];
}

function normalizedSaleForIngest(input = {}, fallbackCollection = "", ingestedAt = "") {
  const collectionName = String(input.collection || input.collectionName || fallbackCollection || "").trim();
  const modelName = String(input.model || input.modelName || "").trim();
  const backdropName = String(input.backdrop || input.backdropName || "").trim();
  const symbolName = String(input.symbol || input.symbolName || "").trim();
  const marketplace = String(input.marketplace || input.market || "").trim();
  const slug = String(input.slug || "").trim();
  const giftId = String(input.giftId || input.gift_id || "").trim();
  const soldAtValue = input.soldAt || input.sold_at || input.date || "";
  const soldAtMs = new Date(soldAtValue).getTime();
  const priceTon = Number(input.priceTon ?? input.normalizedPrice ?? 0);
  if (!key(collectionName) || !key(modelName) || !key(backdropName) || !Number.isFinite(soldAtMs) || !(priceTon > 0)) return null;
  const soldAt = new Date(soldAtMs).toISOString();
  const originalValue = input.originalPrice ?? input.original_price ?? "";
  const originalPrice = typeof originalValue === "object" && originalValue !== null
    ? JSON.stringify(originalValue)
    : String(originalValue || "");
  const saleId = String(input.saleId || input.sale_id || input.id || input._id || [
    collectionName, modelName, backdropName, marketplace, slug, giftId, soldAt, priceTon,
  ].join("|")).trim();
  return {
    saleId,
    collectionKey: key(collectionName),
    collectionName,
    modelKey: key(modelName),
    modelName,
    backdropKey: key(backdropName),
    backdropName,
    symbolKey: key(symbolName),
    symbolName,
    marketplace,
    slug,
    giftId,
    giftNumber: Number(input.mint || input.number || input.giftNumber || 0),
    priceTon,
    originalPrice,
    soldAt,
    giftUrl: String(input.giftUrl || (slug ? `https://t.me/nft/${encodeURIComponent(slug)}` : "")),
    ingestedAt,
  };
}

function compactSaleComboKey(sale) {
  return [sale.collectionKey, sale.modelKey, sale.backdropKey, sale.symbolKey].join("\u0001");
}

async function writeCompactSales(database, sales = []) {
  let inserted = 0;
  for (let index = 0; index < sales.length; index += 50) {
    const chunk = sales.slice(index, index + 50);
    const combos = [...new Map(chunk.map((sale) => [compactSaleComboKey(sale), sale])).values()];
    await database.batch(combos.map((sale) => database.prepare(
      `INSERT OR IGNORE INTO gift_sale_combos (
        collection_key, collection_name, model_key, model_name,
        backdrop_key, backdrop_name, symbol_key, symbol_name
      ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)`
    ).bind(
      sale.collectionKey, sale.collectionName, sale.modelKey, sale.modelName,
      sale.backdropKey, sale.backdropName, sale.symbolKey, sale.symbolName
    )));
    const comboResults = await database.batch(combos.map((sale) => database.prepare(
      `SELECT combo_id FROM gift_sale_combos
       WHERE collection_key=?1 AND model_key=?2 AND backdrop_key=?3 AND symbol_key=?4`
    ).bind(sale.collectionKey, sale.modelKey, sale.backdropKey, sale.symbolKey)));
    const comboIds = new Map();
    combos.forEach((sale, comboIndex) => {
      const comboId = comboResults[comboIndex]?.results?.[0]?.combo_id;
      if (comboId) comboIds.set(compactSaleComboKey(sale), Number(comboId));
    });
    const result = await database.batch(chunk
      .map((sale) => ({ sale, comboId: comboIds.get(compactSaleComboKey(sale)) }))
      .filter(({ comboId }) => Number.isFinite(comboId))
      .map(({ sale, comboId }) => database.prepare(
        `INSERT OR IGNORE INTO gift_sale_events (
          sale_id, combo_id, marketplace, slug, gift_id, gift_number,
          price_nano, sold_at, ingested_at
        ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)`
      ).bind(
        sale.saleId, comboId, sale.marketplace, sale.slug, sale.giftId, sale.giftNumber,
        Math.round(sale.priceTon * 1_000_000_000),
        Math.floor(new Date(sale.soldAt).getTime() / 1000),
        Math.floor(new Date(sale.ingestedAt).getTime() / 1000)
      )));
    inserted += result.reduce((sum, entry) => sum + Number(entry.meta?.changes || 0), 0);
  }
  return inserted;
}

async function writeLegacySales(database, sales = []) {
  let inserted = 0;
  for (let index = 0; index < sales.length; index += 50) {
    const chunk = sales.slice(index, index + 50);
    const result = await database.batch(chunk.map((sale) => database.prepare(
      `INSERT OR IGNORE INTO gift_sales (
        sale_id, collection_key, collection_name, model_key, model_name,
        backdrop_key, backdrop_name, symbol_key, symbol_name, marketplace,
        slug, gift_id, gift_number, price_ton, original_price, sold_at, gift_url, ingested_at
      ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18)`
    ).bind(
      sale.saleId, sale.collectionKey, sale.collectionName, sale.modelKey, sale.modelName,
      sale.backdropKey, sale.backdropName, sale.symbolKey, sale.symbolName, sale.marketplace,
      sale.slug, sale.giftId, sale.giftNumber, sale.priceTon, sale.originalPrice,
      sale.soldAt, sale.giftUrl, sale.ingestedAt
    )));
    inserted += result.reduce((sum, entry) => sum + Number(entry.meta?.changes || 0), 0);
  }
  return inserted;
}

async function writeSales(env, sales = []) {
  const byDatabase = new Map();
  sales.forEach((sale) => {
    const database = salesWriteDatabaseFor(env, sale);
    const rows = byDatabase.get(database) || [];
    rows.push(sale);
    byDatabase.set(database, rows);
  });
  let inserted = 0;
  for (const [database, rows] of byDatabase) {
    inserted += database === salesDatabase(env)
      ? await writeLegacySales(database, rows)
      : await writeCompactSales(database, rows);
  }
  return inserted;
}

async function ingestSales(request, env) {
  if (!authorized(request, env)) return json({ error: "Unauthorized" }, 401);
  const body = await request.json();
  const collectionName = String(body.collection || "").trim();
  const scannedAt = String(body.scannedAt || new Date().toISOString());
  const rows = (Array.isArray(body.sales) ? body.sales : [])
    .slice(0, 1000)
    .map((sale) => normalizedSaleForIngest(sale, collectionName, scannedAt))
    .filter(Boolean);
  let inserted = 0;
  const database = salesDatabase(env);
  inserted = await writeSales(env, rows);
  const newest = rows.slice().sort((left, right) => new Date(right.soldAt) - new Date(left.soldAt))[0] || null;
  const oldest = rows.slice().sort((left, right) => new Date(left.soldAt) - new Date(right.soldAt))[0] || null;
  const stateCollection = collectionName || newest?.collectionName || "";
  const stateKey = key(stateCollection);
  const commitState = body.commitState !== false;
  if (body.mode === "exact" && commitState) {
    const target = normalizedSalesTarget(body.target || {
      collection: stateCollection,
      model: rows[0]?.modelName,
      backdrop: rows[0]?.backdropName,
    });
    if (target) {
      await database.prepare(
        `INSERT INTO gift_sales_scan_targets (
          target_key, collection_key, collection_name, model_key, model_name,
          backdrop_key, backdrop_name, priority, requested_at, last_scanned_at, last_sale_at, status
        ) VALUES (?1,?2,?3,?4,?5,?6,?7,100,?8,?8,?9,?10)
        ON CONFLICT(target_key) DO UPDATE SET
          last_scanned_at=excluded.last_scanned_at,
          last_sale_at=excluded.last_sale_at,
          status=excluded.status`
      ).bind(
        target.targetKey, target.collectionKey, target.collectionName,
        target.modelKey, target.modelName, target.backdropKey, target.backdropName,
        scannedAt, String(newest?.soldAt || ""), newest ? "found" : "no-sale-365d"
      ).run();
    }
    return json({ ok: true, mode: "exact", collection: stateCollection, accepted: rows.length, inserted, scannedAt });
  }
  if (stateKey && body.mode === "backfill" && commitState) {
    const coverageMode = body.coverageMode === "chronological" ? "chronological" : "exact";
    const completedAt = body.complete ? scannedAt : "";
    await database.prepare(
      `INSERT INTO gift_sales_backfill_state (
        collection_key, collection_name, next_page, oldest_sale_id, oldest_sold_at,
        cutoff_at, completed_at, pages_scanned, rows_seen, rows_inserted, last_scanned_at, source, coverage_mode
      ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)
      ON CONFLICT(collection_key) DO UPDATE SET
        collection_name=excluded.collection_name,
        next_page=CASE WHEN gift_sales_backfill_state.coverage_mode <> excluded.coverage_mode
          THEN excluded.next_page ELSE MAX(gift_sales_backfill_state.next_page, excluded.next_page) END,
        oldest_sale_id=CASE
          WHEN gift_sales_backfill_state.coverage_mode <> excluded.coverage_mode THEN excluded.oldest_sale_id
          WHEN excluded.oldest_sold_at <> '' AND (gift_sales_backfill_state.oldest_sold_at = '' OR excluded.oldest_sold_at < gift_sales_backfill_state.oldest_sold_at)
            THEN excluded.oldest_sale_id
          ELSE gift_sales_backfill_state.oldest_sale_id
        END,
        oldest_sold_at=CASE
          WHEN gift_sales_backfill_state.coverage_mode <> excluded.coverage_mode THEN excluded.oldest_sold_at
          WHEN excluded.oldest_sold_at <> '' AND (gift_sales_backfill_state.oldest_sold_at = '' OR excluded.oldest_sold_at < gift_sales_backfill_state.oldest_sold_at)
            THEN excluded.oldest_sold_at
          ELSE gift_sales_backfill_state.oldest_sold_at
        END,
        cutoff_at=CASE
          WHEN gift_sales_backfill_state.coverage_mode <> excluded.coverage_mode THEN excluded.cutoff_at
          WHEN excluded.cutoff_at <> '' AND (gift_sales_backfill_state.cutoff_at = '' OR excluded.cutoff_at < gift_sales_backfill_state.cutoff_at)
            THEN excluded.cutoff_at
          ELSE gift_sales_backfill_state.cutoff_at
        END,
        completed_at=CASE
          WHEN gift_sales_backfill_state.coverage_mode <> excluded.coverage_mode THEN excluded.completed_at
          WHEN excluded.completed_at <> '' THEN excluded.completed_at
          WHEN excluded.cutoff_at <> '' AND gift_sales_backfill_state.cutoff_at <> '' AND excluded.cutoff_at < gift_sales_backfill_state.cutoff_at THEN ''
          ELSE gift_sales_backfill_state.completed_at
        END,
        pages_scanned=gift_sales_backfill_state.pages_scanned + excluded.pages_scanned,
        rows_seen=CASE WHEN gift_sales_backfill_state.coverage_mode <> excluded.coverage_mode THEN excluded.rows_seen ELSE gift_sales_backfill_state.rows_seen + excluded.rows_seen END,
        rows_inserted=CASE WHEN gift_sales_backfill_state.coverage_mode <> excluded.coverage_mode THEN excluded.rows_inserted ELSE gift_sales_backfill_state.rows_inserted + excluded.rows_inserted END,
        last_scanned_at=excluded.last_scanned_at,
        source=excluded.source,
        coverage_mode=excluded.coverage_mode`
    ).bind(
      stateKey,
      stateCollection,
      Math.max(0, Number(body.nextPage || 0)),
      String(body.oldestSaleId || oldest?.saleId || ""),
      String(body.oldestSoldAt || oldest?.soldAt || ""),
      String(body.cutoffAt || ""),
      completedAt,
      Number(body.pagesScanned || 0),
      Number(body.rowsSeen ?? rows.length),
      inserted,
      scannedAt,
      String(body.source || "gift-satellite"),
      coverageMode
    ).run();
    return json({ ok: true, mode: "backfill", collection: stateCollection, accepted: rows.length, inserted, scannedAt, completedAt });
  }
  if (body.mode === "backfill") {
    return json({ ok: true, mode: "backfill", collection: stateCollection, accepted: rows.length, inserted, scannedAt, checkpointed: false });
  }
  if (stateKey && commitState) {
    await database.prepare(
      `INSERT INTO gift_sales_collection_state (
        collection_key, collection_name, newest_sale_id, newest_sold_at, last_scanned_at,
        pages_scanned, rows_seen, rows_inserted, source
      ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)
      ON CONFLICT(collection_key) DO UPDATE SET
        collection_name=excluded.collection_name,
        newest_sale_id=CASE WHEN excluded.newest_sold_at >= gift_sales_collection_state.newest_sold_at THEN excluded.newest_sale_id ELSE gift_sales_collection_state.newest_sale_id END,
        newest_sold_at=MAX(gift_sales_collection_state.newest_sold_at, excluded.newest_sold_at),
        last_scanned_at=excluded.last_scanned_at,
        pages_scanned=excluded.pages_scanned,
        rows_seen=excluded.rows_seen,
        rows_inserted=gift_sales_collection_state.rows_inserted + excluded.rows_inserted,
        source=excluded.source`
    ).bind(
      stateKey,
      stateCollection,
      String(body.newestSaleId || newest?.saleId || ""),
      String(body.newestSoldAt || newest?.soldAt || ""),
      scannedAt,
      Number(body.pagesScanned || 0),
      Number(body.rowsSeen ?? rows.length),
      inserted,
      String(body.source || "gift-satellite")
    ).run();
  }
  return json({ ok: true, collection: stateCollection, accepted: rows.length, inserted, scannedAt });
}

async function lastHistorySampleTimes(env, collectionKey, bucketIndex) {
  const results = await Promise.all(historyDatabases(env).map((database) => database.prepare(
    `SELECT sampled_at, changes_json
     FROM gift_combo_history_buckets
     WHERE collection_key = ?1 AND bucket = ?2
     ORDER BY sampled_at DESC`
  ).bind(collectionKey, bucketIndex).all()));
  const latest = new Map();
  const rows = results.flatMap((result) => result.results || [])
    .sort((left, right) => new Date(right.sampled_at) - new Date(left.sampled_at));
  for (const row of rows) {
    const sampledAt = new Date(row.sampled_at || 0).getTime();
    if (!Number.isFinite(sampledAt)) continue;
    const entries = JSON.parse(row.changes_json || "{}");
    for (const targetKey of Object.keys(entries)) {
      if (!latest.has(targetKey)) latest.set(targetKey, sampledAt);
    }
  }
  const segments = await floorSourcesDatabase(env).prepare(
    `SELECT points_json FROM gift_combo_history_segments
     WHERE collection_key = ?1 AND bucket IN (-1, ?2)
     ORDER BY day_start DESC`
  ).bind(collectionKey, bucketIndex).all();
  for (const row of segments.results || []) {
    for (const point of historySegmentBucketPoints(JSON.parse(row.points_json || "{}"), bucketIndex)) {
      const sampledAt = new Date(point.timestamp || 0).getTime();
      if (!Number.isFinite(sampledAt)) continue;
      latest.set(point.targetKey, Math.max(latest.get(point.targetKey) || 0, sampledAt));
    }
  }
  return latest;
}

async function latestHistoryEntry(env, collectionKey, bucketIndex, targetKey) {
  const [legacyResults, segments] = await Promise.all([
    Promise.all(historyDatabases(env).map((database) => database.prepare(
      `SELECT sampled_at, changes_json
       FROM gift_combo_history_buckets
       WHERE collection_key = ?1 AND bucket = ?2
       ORDER BY sampled_at DESC`
    ).bind(collectionKey, bucketIndex).all())),
    floorSourcesDatabase(env).prepare(
      `SELECT points_json FROM gift_combo_history_segments
       WHERE collection_key = ?1 AND bucket IN (-1, ?2)
       ORDER BY day_start DESC`
    ).bind(collectionKey, bucketIndex).all(),
  ]);
  const candidates = legacyResults.flatMap((result) => (result.results || []).map((row) => {
    const entry = JSON.parse(row.changes_json || "{}")[targetKey];
    return entry ? { timestamp: row.sampled_at, entry } : null;
  }).filter(Boolean));
  for (const row of segments.results || []) {
    for (const point of historySegmentBucketPoints(JSON.parse(row.points_json || "{}"), bucketIndex)) {
      if (point.targetKey !== targetKey) continue;
      candidates.push({
        timestamp: point.timestamp,
        entry: { f: point.floorTon, l: point.listedCount, p: point.estimate ? "ESTIMATE" : "" },
      });
    }
  }
  return candidates.sort((left, right) => new Date(right.timestamp) - new Date(left.timestamp))[0] || null;
}

async function ingestCollection(request, env) {
  if (!authorized(request, env)) return json({ error: "Unauthorized" }, 401);
  const body = await request.json();
  const collectionName = String(body.collection || "").trim();
  const collectionKey = key(collectionName);
  const snapshotAt = String(body.snapshotAt || new Date().toISOString());
  const source = String(body.source || "thermos").trim() || "thermos";
  const buckets = Array.isArray(body.buckets) ? body.buckets : [];
  if (!collectionKey || buckets.length !== BUCKET_COUNT) {
    return json({ error: `Expected collection and ${BUCKET_COUNT} buckets` }, 400);
  }
  const previousRows = await env.GIFT_REGISTRY.batch(
    buckets.map((_, index) => env.GIFT_REGISTRY.prepare(
      `SELECT combinations_json FROM gift_combo_buckets
       WHERE collection_key = ?1 AND bucket = ?2`
    ).bind(collectionKey, index))
  );
  const statements = [
    env.GIFT_REGISTRY.prepare(
      `INSERT INTO gift_combo_collections (
        collection_key, collection_name, snapshot_at, listing_count, combination_count, bucket_count, source
      ) VALUES (?1,?2,?3,?4,?5,?6,?7)
      ON CONFLICT(collection_key) DO UPDATE SET
        collection_name=excluded.collection_name,
        snapshot_at=excluded.snapshot_at,
        listing_count=excluded.listing_count,
        combination_count=excluded.combination_count,
        bucket_count=excluded.bucket_count,
        source=excluded.source`
    ).bind(
      collectionKey,
      collectionName,
      snapshotAt,
      Number(body.listingCount || 0),
      Number(body.combinationCount || 0),
      BUCKET_COUNT,
      source
    ),
  ];
  const historyStatements = [];
  let changedBuckets = 0;
  buckets.forEach((bucket, index) => {
    const combinationsJson = JSON.stringify(bucket || {});
    const previousJson = previousRows[index]?.results?.[0]?.combinations_json || "";
    if (previousJson === combinationsJson) return;
    changedBuckets += 1;
    historyStatements.push(
      floorSourcesDatabase(env).prepare(
        `INSERT INTO gift_combo_buckets (collection_key, bucket, snapshot_at, combinations_json)
         VALUES (?1,?2,?3,?4)
         ON CONFLICT(collection_key,bucket) DO UPDATE SET
           snapshot_at=excluded.snapshot_at,
           combinations_json=excluded.combinations_json`
      ).bind(collectionKey, index, snapshotAt, combinationsJson)
    );
    statements.push(
      env.GIFT_REGISTRY.prepare(
        `INSERT INTO gift_combo_history_buckets (
          collection_key, sampled_at, bucket, changes_json
        ) VALUES (?1,?2,?3,?4)`
      ).bind(collectionKey, snapshotAt, index, combinationsJson)
    );
  });
  await env.GIFT_REGISTRY.batch(statements);
  if (historyStatements.length) await floorSourcesDatabase(env).batch(historyStatements);
  return json({
    ok: true,
    collection: collectionName,
    listingCount: Number(body.listingCount || 0),
    combinationCount: Number(body.combinationCount || 0),
    changedBuckets,
    snapshotAt,
  });
}

async function ingestCollectionBucket(request, env) {
  if (!authorized(request, env)) return json({ error: "Unauthorized" }, 401);
  const body = await request.json();
  const collectionName = String(body.collection || "").trim();
  const collectionKey = key(collectionName);
  const snapshotAt = String(body.snapshotAt || new Date().toISOString());
  const source = sourceKey(body.source || "thermos");
  const bucketIndex = Number(body.bucketIndex);
  const rawBucket = body.bucket && typeof body.bucket === "object" && !Array.isArray(body.bucket) ? body.bucket : null;
  const bucket = rawBucket ? backdropComboBucket(rawBucket) : null;
  if (source !== "thermos") {
    return json({ error: "Only Thermos floor snapshots are accepted" }, 410);
  }
  if (!collectionKey || !Number.isInteger(bucketIndex) || bucketIndex < 0 || bucketIndex >= BUCKET_COUNT || !bucket) {
    return json({ error: `Expected collection, bucketIndex 0-${BUCKET_COUNT - 1}, and bucket object` }, 400);
  }

  const previous = await env.GIFT_REGISTRY.prepare(
    `SELECT combinations_json FROM gift_combo_buckets
     WHERE collection_key = ?1 AND bucket = ?2`
  ).bind(collectionKey, bucketIndex).first();
  const sourceDb = floorSourcesDatabase(env);
  await sourceDb.prepare(
    `INSERT INTO gift_combo_source_buckets (
      collection_key, source, bucket, snapshot_at, combinations_json
    ) VALUES (?1,?2,?3,?4,?5)
    ON CONFLICT(collection_key,source,bucket) DO UPDATE SET
      snapshot_at=excluded.snapshot_at,
      combinations_json=excluded.combinations_json`
  ).bind(collectionKey, source, bucketIndex, snapshotAt, JSON.stringify(bucket)).run();
  const sourceBuckets = await sourceDb.prepare(
    `SELECT source, combinations_json FROM gift_combo_source_buckets
     WHERE collection_key = ?1 AND bucket = ?2`
  ).bind(collectionKey, bucketIndex).all();
  const effectiveBucket = mergeSourceBuckets(sourceBuckets.results || []);
  const combinationsJson = JSON.stringify(effectiveBucket);
  const changed = (previous?.combinations_json || "") !== combinationsJson;
  await env.GIFT_REGISTRY.prepare(
    `INSERT INTO gift_combo_collections (
      collection_key, collection_name, snapshot_at, listing_count, combination_count, bucket_count, source
    ) VALUES (?1,?2,?3,?4,?5,?6,?7)
    ON CONFLICT(collection_key) DO UPDATE SET
      collection_name=excluded.collection_name,
      snapshot_at=excluded.snapshot_at,
      listing_count=MAX(gift_combo_collections.listing_count, excluded.listing_count),
      combination_count=MAX(gift_combo_collections.combination_count, excluded.combination_count),
      bucket_count=excluded.bucket_count,
      source=excluded.source`
  ).bind(
    collectionKey,
    collectionName,
    snapshotAt,
    Number(body.listingCount || 0),
    Number(body.combinationCount || 0),
    BUCKET_COUNT,
    "merged-markets"
  ).run();

  if (changed) {
    await env.GIFT_REGISTRY.prepare(
      `INSERT INTO gift_combo_buckets (collection_key, bucket, snapshot_at, combinations_json)
       VALUES (?1,?2,?3,?4)
       ON CONFLICT(collection_key,bucket) DO UPDATE SET
         snapshot_at=excluded.snapshot_at,
         combinations_json=excluded.combinations_json`
    ).bind(collectionKey, bucketIndex, snapshotAt, combinationsJson).run();

    const previousEntries = JSON.parse(previous?.combinations_json || "{}");
    const lastSamples = await lastHistorySampleTimes(env, collectionKey, bucketIndex);
    const sampleAt = new Date(snapshotAt || Date.now()).getTime();
    const changes = {};
    for (const [targetKey, entry] of Object.entries(effectiveBucket)) {
      const previousEntry = previousEntries[targetKey] || null;
      const valueChanged = !sameHistoryPoint(previousEntry, entry);
      const lastSampleAt = lastSamples.get(targetKey) || 0;
      const sampleDue = !lastSampleAt || (Number.isFinite(sampleAt) && sampleAt - lastSampleAt >= UNCHANGED_SAMPLE_MS);
      if (valueChanged || sampleDue) {
        changes[targetKey] = historyPoint(entry);
      }
    }
    if (Object.keys(changes).length) {
      await appendHistorySegment(env, collectionKey, bucketIndex, snapshotAt, changes);
    }
  } else {
    const lastSamples = await lastHistorySampleTimes(env, collectionKey, bucketIndex);
    const sampleAt = new Date(snapshotAt || Date.now()).getTime();
    const samples = {};
    for (const [targetKey, entry] of Object.entries(effectiveBucket)) {
      const lastSampleAt = lastSamples.get(targetKey) || 0;
      if (!lastSampleAt || (Number.isFinite(sampleAt) && sampleAt - lastSampleAt >= UNCHANGED_SAMPLE_MS)) {
        samples[targetKey] = historyPoint(entry);
      }
    }
    if (Object.keys(samples).length) {
      await appendHistorySegment(env, collectionKey, bucketIndex, snapshotAt, samples);
    }
  }
  return json({
    ok: true,
    collection: collectionName,
    bucketIndex,
    changed,
    entries: Object.keys(effectiveBucket).length,
    source,
    snapshotAt,
  });
}

async function ingestTelegramFloorTargetResult(request, env) {
  if (!authorized(request, env)) return json({ error: "Unauthorized" }, 401);
  const body = await request.json();
  const target = normalizedTelegramFloorTarget(body);
  if (!target) return json({ error: "Expected collection, model, backdrop, and symbol" }, 400);
  const floorTon = Number(body.floorTon || 0);
  const listedCount = Math.max(0, Number(body.listedCount || 0));
  const hasListing = floorTon > 0 && listedCount > 0;
  const snapshotAt = String(body.snapshotAt || new Date().toISOString());
  const bucket = bucketFor(comboKey(target.modelName, target.backdropName));
  const previous = await env.GIFT_REGISTRY.prepare(
    `SELECT c.collection_name, c.listing_count, c.combination_count, c.source, b.combinations_json
     FROM gift_combo_collections c
     LEFT JOIN gift_combo_buckets b ON b.collection_key = c.collection_key AND b.bucket = ?2
     WHERE c.collection_key = ?1`
  ).bind(target.collectionKey, bucket).first();
  const sourceDb = floorSourcesDatabase(env);
  const sourceRows = await sourceDb.prepare(
    `SELECT source, combinations_json FROM gift_combo_source_buckets
     WHERE collection_key = ?1 AND bucket = ?2`
  ).bind(target.collectionKey, bucket).all();
  if (!(sourceRows.results || []).length && previous?.combinations_json) {
    await sourceDb.prepare(
      `INSERT OR IGNORE INTO gift_combo_source_buckets (
        collection_key, source, bucket, snapshot_at, combinations_json
      ) VALUES (?1,'thermos',?2,?3,?4)`
    ).bind(target.collectionKey, bucket, snapshotAt, previous.combinations_json).run();
  }
  const telegramRow = await sourceDb.prepare(
    `SELECT combinations_json FROM gift_combo_source_buckets
     WHERE collection_key = ?1 AND source = 'telegram-marketplace' AND bucket = ?2`
  ).bind(target.collectionKey, bucket).first();
  const telegramEntries = JSON.parse(telegramRow?.combinations_json || "{}");
  const combo = comboKey(target.modelName, target.backdropName);
  if (hasListing) {
    telegramEntries[combo] = {
      m: target.modelName,
      b: target.backdropName,
      y: target.symbolName,
      f: floorTon,
      s: Math.max(0, Number(body.floorStars || 0)),
      l: listedCount,
      p: "Telegram Marketplace",
      u: String(body.listingUrl || ""),
      i: String(body.listingId || ""),
    };
  } else {
    delete telegramEntries[combo];
  }
  await sourceDb.prepare(
    `INSERT INTO gift_combo_source_buckets (
      collection_key, source, bucket, snapshot_at, combinations_json
    ) VALUES (?1,'telegram-marketplace',?2,?3,?4)
    ON CONFLICT(collection_key,source,bucket) DO UPDATE SET
      snapshot_at=excluded.snapshot_at,
      combinations_json=excluded.combinations_json`
  ).bind(target.collectionKey, bucket, snapshotAt, JSON.stringify(telegramEntries)).run();
  const sourceBuckets = await sourceDb.prepare(
    `SELECT source, combinations_json FROM gift_combo_source_buckets
     WHERE collection_key = ?1 AND bucket = ?2`
  ).bind(target.collectionKey, bucket).all();
  const effectiveBucket = mergeSourceBuckets(sourceBuckets.results || []);
  const combinationsJson = JSON.stringify(effectiveBucket);
  const changed = (previous?.combinations_json || "") !== combinationsJson;
  const previousEntries = JSON.parse(previous?.combinations_json || "{}");
  const nextCombinationCount = Math.max(
    Number(previous?.combination_count || 0) + (!previousEntries[combo] && effectiveBucket[combo] ? 1 : 0),
    Object.keys(effectiveBucket).length
  );
  await env.GIFT_REGISTRY.batch([
    env.GIFT_REGISTRY.prepare(
      `INSERT INTO gift_combo_collections (
        collection_key, collection_name, snapshot_at, listing_count, combination_count, bucket_count, source
      ) VALUES (?1,?2,?3,?4,?5,?6,'merged-markets')
      ON CONFLICT(collection_key) DO UPDATE SET
        collection_name=excluded.collection_name,
        snapshot_at=excluded.snapshot_at,
        listing_count=MAX(gift_combo_collections.listing_count, excluded.listing_count),
        combination_count=MAX(gift_combo_collections.combination_count, excluded.combination_count),
        bucket_count=excluded.bucket_count,
        source=excluded.source`
    ).bind(
      target.collectionKey, previous?.collection_name || target.collectionName, snapshotAt,
      Number(previous?.listing_count || 0), nextCombinationCount, BUCKET_COUNT
    ),
    env.GIFT_REGISTRY.prepare(
      `INSERT INTO gift_combo_buckets (collection_key, bucket, snapshot_at, combinations_json)
       VALUES (?1,?2,?3,?4)
       ON CONFLICT(collection_key,bucket) DO UPDATE SET
         snapshot_at=excluded.snapshot_at,
         combinations_json=excluded.combinations_json`
    ).bind(target.collectionKey, bucket, snapshotAt, combinationsJson),
    env.GIFT_REGISTRY.prepare(
      `UPDATE telegram_floor_scan_targets
       SET last_scanned_at=?2, status=?3
       WHERE target_key=?1`
    ).bind(target.targetKey, snapshotAt, hasListing ? "found" : "no-active-listing"),
  ]);
  if (changed) {
    await appendHistorySegment(env, target.collectionKey, bucket, snapshotAt, { [combo]: effectiveBucket[combo] });
  }
  return json({ ok: true, ...target, floorTon, listedCount, changed, status: hasListing ? "found" : "no-active-listing", snapshotAt });
}

async function ingestCombo(request, env) {
  if (!authorized(request, env)) return json({ error: "Unauthorized" }, 401);
  const body = await request.json();
  const collectionName = String(body.collection || "").trim();
  const modelName = String(body.model || "").trim();
  const backdropName = String(body.backdrop || "").trim();
  const symbolName = String(body.symbol || body.symbolName || "").trim();
  const collectionKey = key(collectionName);
  const targetKey = comboKey(modelName, backdropName);
  const floorTon = Number(body.floorTon || 0);
  if (!collectionKey || !key(modelName) || !key(backdropName) || !(floorTon > 0)) {
    return json({ error: "Expected collection, model, backdrop, and floorTon" }, 400);
  }
  const bucket = bucketFor(targetKey);
  const snapshotAt = String(body.snapshotAt || new Date().toISOString());
  const current = await env.GIFT_REGISTRY.prepare(
    `SELECT c.collection_name, c.snapshot_at, c.listing_count, c.combination_count, c.source,
      b.combinations_json
     FROM gift_combo_collections c
     LEFT JOIN gift_combo_buckets b ON b.collection_key = c.collection_key AND b.bucket = ?2
     WHERE c.collection_key = ?1`
  ).bind(collectionKey, bucket).first();
  const entries = JSON.parse(current?.combinations_json || "{}");
  const existed = Boolean(entries[targetKey]);
  entries[targetKey] = {
    m: modelName,
    b: backdropName,
    y: symbolName,
    f: floorTon,
    l: Number(body.listedCount || 0),
    p: String(body.marketplace || ""),
    u: String(body.listingUrl || ""),
    i: String(body.listingId || ""),
  };
  const nextCombinationCount = Math.max(
    Number(current?.combination_count || 0) + (existed ? 0 : 1),
    Object.keys(entries).length
  );
  const source = String(current?.source || body.source || "thermos-v2");
  const collectionSnapshotAt = String(current?.snapshot_at || snapshotAt);
  await env.GIFT_REGISTRY.batch([
    env.GIFT_REGISTRY.prepare(
      `INSERT INTO gift_combo_collections (
        collection_key, collection_name, snapshot_at, listing_count, combination_count, bucket_count, source
      ) VALUES (?1,?2,?3,?4,?5,?6,?7)
      ON CONFLICT(collection_key) DO UPDATE SET
        collection_name=excluded.collection_name,
        snapshot_at=excluded.snapshot_at,
        listing_count=excluded.listing_count,
        combination_count=excluded.combination_count,
        bucket_count=excluded.bucket_count,
        source=excluded.source`
    ).bind(
      collectionKey,
      current?.collection_name || collectionName,
      collectionSnapshotAt,
      Number(current?.listing_count || body.listingCount || body.listedCount || 0),
      nextCombinationCount,
      BUCKET_COUNT,
      source
    ),
    env.GIFT_REGISTRY.prepare(
      `INSERT INTO gift_combo_buckets (collection_key, bucket, snapshot_at, combinations_json)
       VALUES (?1,?2,?3,?4)
       ON CONFLICT(collection_key,bucket) DO UPDATE SET
         snapshot_at=excluded.snapshot_at,
         combinations_json=excluded.combinations_json`
    ).bind(collectionKey, bucket, snapshotAt, JSON.stringify(entries)),
  ]);
  await appendHistorySegment(env, collectionKey, bucket, snapshotAt, { [targetKey]: entries[targetKey] });
  return json({
    ok: true,
    collection: current?.collection_name || collectionName,
    model: modelName,
    backdrop: backdropName,
    symbol: symbolName,
    floorTon,
    listedCount: Number(body.listedCount || 0),
    changed: !existed,
    snapshotAt,
  });
}

async function ingestEstimateHistory(request, env) {
  if (!authorized(request, env)) return json({ error: "Unauthorized" }, 401);
  const body = await request.json();
  const collectionName = String(body.collection || "").trim();
  const modelName = String(body.model || "").trim();
  const backdropName = String(body.backdrop || "").trim();
  const symbolName = String(body.symbol || body.symbolName || "").trim();
  const collectionKey = key(collectionName);
  const targetKey = comboKey(modelName, backdropName);
  const floorTon = Number(body.floorTon || 0);
  if (!collectionKey || !key(modelName) || !key(backdropName) || !(floorTon > 0)) {
    return json({ error: "Expected collection, model, backdrop, and floorTon" }, 400);
  }
  const bucket = bucketFor(targetKey);
  const snapshotAt = String(body.snapshotAt || new Date().toISOString());
  const sampleAt = new Date(snapshotAt || Date.now()).getTime();
  const entry = {
    m: modelName,
    b: backdropName,
    y: symbolName,
    f: floorTon,
    l: 0,
    p: "ESTIMATE",
    u: "",
    i: "",
  };
  await env.GIFT_REGISTRY.prepare(
    `INSERT INTO gift_estimate_history_targets (
      target_key, collection_key, collection_name, model_key, model_name,
      backdrop_key, backdrop_name, symbol_key, symbol_name, requested_at
    ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)
    ON CONFLICT(target_key) DO UPDATE SET
      collection_name=excluded.collection_name,
      model_name=excluded.model_name,
      backdrop_name=excluded.backdrop_name,
      symbol_name=excluded.symbol_name`
  ).bind(
    `${collectionKey}:${key(modelName)}:${key(backdropName)}:${key(symbolName)}`,
    collectionKey, collectionName, key(modelName), modelName, key(backdropName), backdropName,
    key(symbolName), symbolName, snapshotAt
  ).run();
  const previous = await latestHistoryEntry(env, collectionKey, bucket, targetKey);
  const lastSampleAt = new Date(previous?.timestamp || 0).getTime() || 0;
  const lastEntry = previous?.entry || null;
  const valueChanged = !lastEntry || Number(lastEntry.f || 0) !== floorTon || String(lastEntry.p || "") !== "ESTIMATE";
  const sampleDue = !lastSampleAt || (Number.isFinite(sampleAt) && sampleAt - lastSampleAt >= UNCHANGED_SAMPLE_MS);
  if (!valueChanged && !sampleDue) return json({ ok: true, skipped: true, reason: "unchanged-recent", snapshotAt });
  await appendHistorySegment(env, collectionKey, bucket, snapshotAt, { [targetKey]: entry });
  return json({ ok: true, collection: collectionName, model: modelName, backdrop: backdropName, symbol: symbolName, floorTon, snapshotAt });
}

async function ingestStatus(request, env) {
  if (!authorized(request, env)) return json({ error: "Unauthorized" }, 401);
  const body = await request.json();
  const workerKey = key(body.worker || "combo-worker") || "comboworker";
  const now = new Date().toISOString();
  await env.GIFT_REGISTRY.prepare(
    `INSERT INTO gift_combo_worker_status (
      worker_key, phase, collection_name, current_page, total_pages, completed_collections,
      total_collections, message, updated_at
    ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)
    ON CONFLICT(worker_key) DO UPDATE SET
      phase=excluded.phase,
      collection_name=excluded.collection_name,
      current_page=excluded.current_page,
      total_pages=excluded.total_pages,
      completed_collections=excluded.completed_collections,
      total_collections=excluded.total_collections,
      message=excluded.message,
      updated_at=excluded.updated_at`
  ).bind(
    workerKey,
    String(body.phase || ""),
    String(body.collection || ""),
    Number(body.currentPage || 0),
    Number(body.totalPages || 0),
    Number(body.completedCollections || 0),
    Number(body.totalCollections || 0),
    String(body.message || ""),
    now
  ).run();
  return json({ ok: true, updatedAt: now });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: json({}).headers });
    const url = new URL(request.url);
    if (url.pathname === "/health") return json({ ok: true, service: "tontrack-gift-registry" });
    if (url.pathname === "/stats") {
      const stats = await env.GIFT_REGISTRY.prepare(
        `SELECT COUNT(*) AS collections,
          COALESCE(SUM(listing_count),0) AS listings,
          COALESCE(SUM(combination_count),0) AS combinations,
          MAX(snapshot_at) AS latest_snapshot_at
         FROM gift_combo_collections`
      ).first();
      let sales = {};
      let salesBackfill = {};
      try {
        const salesParts = await Promise.all(salesReadDatabases(env).map((database) => database.prepare(
          `SELECT COUNT(*) AS sales,
            COUNT(DISTINCT collection_key) AS sales_collections,
            COUNT(DISTINCT collection_key || ':' || model_key || ':' || backdrop_key) AS sales_combinations,
            MIN(sold_at) AS earliest_sale_at,
            MAX(sold_at) AS latest_sale_at,
            MAX(ingested_at) AS latest_sale_ingested_at
           FROM gift_sales`
        ).first().catch(() => ({}))));
        sales = salesParts.reduce((total, part) => ({
          sales: Number(total.sales || 0) + Number(part?.sales || 0),
          sales_collections: Math.max(Number(total.sales_collections || 0), Number(part?.sales_collections || 0)),
          sales_combinations: Math.max(Number(total.sales_combinations || 0), Number(part?.sales_combinations || 0)),
          earliest_sale_at: !total.earliest_sale_at || (part?.earliest_sale_at && part.earliest_sale_at < total.earliest_sale_at)
            ? part?.earliest_sale_at || total.earliest_sale_at : total.earliest_sale_at,
          latest_sale_at: !total.latest_sale_at || (part?.latest_sale_at && part.latest_sale_at > total.latest_sale_at)
            ? part?.latest_sale_at || total.latest_sale_at : total.latest_sale_at,
          latest_sale_ingested_at: !total.latest_sale_ingested_at || (part?.latest_sale_ingested_at && part.latest_sale_ingested_at > total.latest_sale_ingested_at)
            ? part?.latest_sale_ingested_at || total.latest_sale_ingested_at : total.latest_sale_ingested_at,
        }), {});
      } catch {
        sales = {};
      }
      try {
        const backfillParts = await Promise.all(salesReadDatabases(env).map((database) => database.prepare(
          `SELECT COUNT(*) AS sales_backfill_collections,
            SUM(CASE WHEN completed_at <> '' THEN 1 ELSE 0 END) AS sales_backfill_completed_collections,
            MIN(NULLIF(oldest_sold_at, '')) AS sales_backfill_oldest_at,
            MAX(last_scanned_at) AS sales_backfill_updated_at
           FROM gift_sales_backfill_state`
        ).first().catch(() => ({}))));
        salesBackfill = backfillParts.reduce((total, part) => ({
          sales_backfill_collections: Number(total.sales_backfill_collections || 0) + Number(part?.sales_backfill_collections || 0),
          sales_backfill_completed_collections: Number(total.sales_backfill_completed_collections || 0) + Number(part?.sales_backfill_completed_collections || 0),
          sales_backfill_oldest_at: !total.sales_backfill_oldest_at || (part?.sales_backfill_oldest_at && part.sales_backfill_oldest_at < total.sales_backfill_oldest_at)
            ? part?.sales_backfill_oldest_at || total.sales_backfill_oldest_at : total.sales_backfill_oldest_at,
          sales_backfill_updated_at: !total.sales_backfill_updated_at || (part?.sales_backfill_updated_at && part.sales_backfill_updated_at > total.sales_backfill_updated_at)
            ? part?.sales_backfill_updated_at || total.sales_backfill_updated_at : total.sales_backfill_updated_at,
        }), {});
      } catch {
        salesBackfill = {};
      }
      return json({ ...(stats || {}), ...sales, ...salesBackfill });
    }
    if (url.pathname === "/collections") {
      const rows = await env.GIFT_REGISTRY.prepare(
        `SELECT collection_key, collection_name, snapshot_at, listing_count, combination_count, source
         FROM gift_combo_collections
         ORDER BY collection_name ASC`
      ).all();
      return json({ collections: rows.results || [] });
    }
    if (url.pathname === "/worker-status") {
      const rows = await env.GIFT_REGISTRY.prepare(
        `SELECT worker_key, phase, collection_name, current_page, total_pages,
          completed_collections, total_collections, message, updated_at
         FROM gift_combo_worker_status
         ORDER BY updated_at DESC`
      ).all();
      return json(rows.results || []);
    }
    if (url.pathname === "/combo" && request.method === "GET") {
      const result = await readCombo(
        env,
        url.searchParams.get("collection"),
        url.searchParams.get("model"),
        url.searchParams.get("backdrop"),
        url.searchParams.get("symbol")
      );
      return result ? json(result) : json({ error: "Combination not found" }, 404);
    }
    if (url.pathname === "/history" && request.method === "GET") {
      return json(await readComboHistory(
        env,
        url.searchParams.get("collection"),
        url.searchParams.get("model"),
        url.searchParams.get("backdrop"),
        url.searchParams.get("symbol")
      ));
    }
    if (url.pathname === "/combos" && request.method === "POST") {
      const body = await request.json();
      const pairs = Array.isArray(body.pairs) ? body.pairs.slice(0, 5000) : [];
      return json(await readCombos(env, pairs));
    }
    if (url.pathname === "/collection-combos" && request.method === "POST") {
      const body = await request.json();
      const collections = Array.isArray(body.collections) ? body.collections.slice(0, 100) : [];
      return json(await readCollectionCombos(env, collections));
    }
    if (url.pathname === "/sales" && request.method === "GET") {
      const sales = await readSales(env, {
        collection: url.searchParams.get("collection") || "",
        model: url.searchParams.get("model") || "",
        backdrop: url.searchParams.get("backdrop") || "",
        symbol: url.searchParams.get("symbol") || "",
      }, url.searchParams.get("limit") || 5);
      return json({ sales });
    }
    if (url.pathname === "/sales" && request.method === "POST") {
      const body = await request.json();
      return json(await readSalesBulk(env, body.pairs, body.limit || 5));
    }
    if (url.pathname === "/sales-state" && request.method === "GET") {
      return json({ states: await readSalesState(env, url.searchParams.get("collection") || "") });
    }
    if (url.pathname === "/sales-backfill-state" && request.method === "GET") {
      return json({ states: await readSalesBackfillState(env, url.searchParams.get("collection") || "") });
    }
    if (url.pathname === "/sales-targets" && request.method === "GET") {
      return readSalesTargets(request, env);
    }
    if (url.pathname === "/ingest/sales-targets" && request.method === "POST") {
      return ingestSalesTargets(request, env);
    }
    if (url.pathname === "/telegram-floor-targets" && request.method === "GET") {
      return json({ error: "Telegram Marketplace floors have been retired" }, 410);
    }
    if (url.pathname === "/estimate-history-targets" && request.method === "GET") {
      return readEstimateHistoryTargets(request, env);
    }
    if (url.pathname === "/ingest/telegram-floor-targets" && request.method === "POST") {
      return json({ error: "Telegram Marketplace floors have been retired" }, 410);
    }
    if (url.pathname === "/ingest/telegram-floor-target-result" && request.method === "POST") {
      return json({ error: "Telegram Marketplace floors have been retired" }, 410);
    }
    if (url.pathname === "/ingest/collection" && request.method === "POST") {
      return ingestCollection(request, env);
    }
    if (url.pathname === "/ingest/collection-bucket" && request.method === "POST") {
      return ingestCollectionBucket(request, env);
    }
    if (url.pathname === "/ingest/combo" && request.method === "POST") {
      return ingestCombo(request, env);
    }
    if (url.pathname === "/ingest/estimate-history" && request.method === "POST") {
      return ingestEstimateHistory(request, env);
    }
    if (url.pathname === "/ingest/estimate-history-target-result" && request.method === "POST") {
      return ingestEstimateHistoryTargetResult(request, env);
    }
    if (url.pathname === "/maintenance/compact-history" && request.method === "POST") {
      if (!authorized(request, env)) return json({ error: "Unauthorized" }, 401);
      const body = await request.json().catch(() => ({}));
      return json({ ok: true, ...(await compactLegacyHistory(env, body.limit)) });
    }
    if (url.pathname === "/maintenance/retire-telegram-floors" && request.method === "POST") {
      if (!authorized(request, env)) return json({ error: "Unauthorized" }, 401);
      const body = await request.json().catch(() => ({}));
      return retireTelegramFloors(env, body);
    }
    if (url.pathname === "/ingest/status" && request.method === "POST") {
      return ingestStatus(request, env);
    }
    if (url.pathname === "/ingest/sales" && request.method === "POST") {
      return ingestSales(request, env);
    }
    return json({ error: "Not found" }, 404);
  },
  async scheduled(_event, env) {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    await compactLegacyHistory(env, 500);
    await Promise.all(historyDatabases(env).map((database) => database.prepare(
      `DELETE FROM gift_combo_history_buckets WHERE sampled_at < ?1`
    ).bind(cutoff).run()));
    await floorSourcesDatabase(env).prepare(
      `DELETE FROM gift_combo_history_segments WHERE day_start < ?1`
    ).bind(cutoff.slice(0, 10)).run();
    if (new Date().getUTCHours() === 2) {
      const salesRetentionDays = Math.max(30, Number(env.SALES_RETENTION_DAYS || 365));
      const salesCutoff = new Date(Date.now() - salesRetentionDays * 24 * 60 * 60 * 1000).toISOString();
      const compactSalesCutoff = Math.floor(new Date(salesCutoff).getTime() / 1000);
      try {
        await Promise.all(salesReadDatabases(env).map((database) => database.prepare(
          `DELETE FROM gift_sales
           WHERE sold_at < ?1
             AND sale_id NOT IN (
               SELECT sale_id FROM (
                 SELECT sale_id,
                   ROW_NUMBER() OVER (
                     PARTITION BY collection_key, model_key, backdrop_key
                     ORDER BY sold_at DESC
                   ) AS position
                 FROM gift_sales
             )
               WHERE position <= 10
             )`
        ).bind(salesCutoff).run()));
      } catch {
        // The sales schema may not be installed during a rolling deployment.
      }
      try {
        await Promise.all(compactSalesDatabases(env).map(async (database) => {
          await database.prepare(
            `DELETE FROM gift_sale_events WHERE sold_at < ?1`
          ).bind(compactSalesCutoff).run();
          await database.prepare(
            `DELETE FROM gift_sale_combos
             WHERE NOT EXISTS (
               SELECT 1 FROM gift_sale_events WHERE gift_sale_events.combo_id = gift_sale_combos.combo_id
             )`
          ).run();
        }));
      } catch {
        // Compact shards are optional during the migration.
      }
    }
  },
};
