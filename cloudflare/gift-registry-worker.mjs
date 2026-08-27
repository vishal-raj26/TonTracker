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
  ).bind(collectionKey, dayStart, bucketIndex).first();
  const points = JSON.parse(existing?.points_json || "{}");
  for (const [targetKey, entry] of entries) {
    const rows = Array.isArray(points[targetKey]) ? points[targetKey] : [];
    const last = rows.at(-1);
    if (!last || JSON.stringify(last) !== JSON.stringify(entry)) rows.push(entry);
    points[targetKey] = rows;
  }
  await database.prepare(
    `INSERT INTO gift_combo_history_segments (collection_key, day_start, bucket, points_json)
     VALUES (?1,?2,?3,?4)
     ON CONFLICT(collection_key, day_start, bucket) DO UPDATE SET
       points_json=excluded.points_json`
  ).bind(collectionKey, dayStart, bucketIndex, JSON.stringify(points)).run();
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
  const segmentKeys = new Set();
  for (const row of rows) {
    const changes = JSON.parse(row.changes_json || "{}");
    if (!Object.keys(changes).length) continue;
    await appendHistorySegment(env, row.collection_key, Number(row.bucket), row.sampled_at, changes);
    segmentKeys.add(`${row.collection_key}:${historyDay(row.sampled_at)}:${row.bucket}`);
  }
  await database.batch(rows.map((row) => database.prepare(
    `DELETE FROM gift_combo_history_buckets
     WHERE collection_key = ?1 AND sampled_at = ?2 AND bucket = ?3`
  ).bind(row.collection_key, row.sampled_at, row.bucket)));
  return { compactedRows: rows.length, segments: segmentKeys.size };
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

function valuationReadDatabase(env) {
  return env.VALUATION_READ_MODEL || null;
}

function valuationRecord(row) {
  return {
    assetKind: row.asset_kind,
    assetKey: row.asset_key,
    displayName: row.display_name,
    estimateUsd: Number(row.estimate_usd || 0),
    rangeLowUsd: Number(row.range_low_usd || 0),
    rangeHighUsd: Number(row.range_high_usd || 0),
    confidenceScore: Number(row.confidence_score || 0),
    confidenceBand: row.confidence_band || "low",
    valuationStatus: row.valuation_status || "unavailable",
    portfolioEligible: Boolean(row.portfolio_eligible),
    evidenceCount: Number(row.evidence_count || 0),
    effectiveCompCount: Number(row.effective_comp_count || 0),
    ownSaleCount: Number(row.own_sale_count || 0),
    currentListingGram: Number(row.current_listing_gram || 0),
    currentBidGram: Number(row.current_bid_gram || 0),
    marketPlatform: row.market_platform || "",
    estimatorVersion: row.estimator_version || "",
    calibrationVersion: row.calibration_version || "",
    valuedAt: row.valued_at || null,
    staleAt: row.stale_at || null,
    explanation: JSON.parse(row.explanation_json || "{}"),
  };
}

async function readValuationRecords(env, body = {}) {
  const database = valuationReadDatabase(env);
  if (!database) return { records: [], configured: false };
  const kind = String(body.assetKind || "").trim().toLowerCase();
  const keys = [...new Set((Array.isArray(body.assetKeys) ? body.assetKeys : [])
    .map((value) => String(value || "").trim().toLowerCase()).filter(Boolean))].slice(0, 500);
  const names = [...new Set((Array.isArray(body.assetNames) ? body.assetNames : [])
    .map((value) => String(value || "").trim().toLowerCase().replace(/^@/, "")).filter(Boolean))].slice(0, 500);
  if (!['dns', 'username'].includes(kind) || (!keys.length && !names.length)) return { records: [], configured: true };
  const records = new Map();
  for (let index = 0; index < keys.length; index += 50) {
    const chunk = keys.slice(index, index + 50);
    const result = await database.prepare(`SELECT * FROM valuation_records
      WHERE asset_kind=? AND asset_key IN (${chunk.map(() => "?").join(",")})`).bind(kind, ...chunk).all();
    for (const row of result.results || []) records.set(row.asset_key, row);
  }
  for (let index = 0; index < names.length; index += 50) {
    const chunk = names.slice(index, index + 50);
    const result = await database.prepare(`SELECT * FROM valuation_records WHERE asset_kind=? AND asset_key IN (
      SELECT asset_key FROM identity_assets
      WHERE asset_kind=? AND normalized_name IN (${chunk.map(() => "?").join(",")})
    )`).bind(kind, kind, ...chunk).all();
    for (const row of result.results || []) records.set(row.asset_key, row);
  }
  return { records: [...records.values()].map(valuationRecord), configured: true };
}

function compactJson(value, fallback) {
  try { return JSON.stringify(value ?? fallback); } catch { return JSON.stringify(fallback); }
}

async function runD1StatementBatches(database, statements, batchSize = 75) {
  const rows = Array.isArray(statements) ? statements : [];
  const results = [];
  for (let index = 0; index < rows.length; index += batchSize) {
    results.push(...await database.batch(rows.slice(index, index + batchSize)));
  }
  return results;
}

function unixSeconds(value) {
  if (Number.isFinite(Number(value)) && Number(value) > 1_000_000_000) return Math.floor(Number(value));
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : 0;
}

async function storagePolicy(database) {
  return database.prepare("SELECT * FROM identity_storage_policy WHERE policy_key = 'primary'").first();
}

async function exactIdentityCount(database, table) {
  if (!['identity_assets', 'identity_sales', 'valuation_records'].includes(table)) throw new Error("Unsupported identity table");
  const row = await database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first();
  return Number(row?.count || 0);
}

function storagePressure(policy, field, maximumField) {
  const used = Math.max(0, Number(policy?.[field] || 0));
  const maximum = Math.max(1, Number(policy?.[maximumField] || 1));
  return { used, maximum, ratio: used / maximum };
}

async function ingestIdentityAssets(request, env) {
  if (!authorized(request, env)) return json({ error: "Unauthorized" }, 401);
  const database = valuationReadDatabase(env);
  if (!database) return json({ error: "Valuation read model is not configured" }, 503);
  const body = await request.json().catch(() => ({}));
  const records = (Array.isArray(body.records) ? body.records : []).slice(0, 500);
  const policy = await storagePolicy(database);
  policy.tracked_assets = await exactIdentityCount(database, "identity_assets");
  const pressure = storagePressure(policy, "tracked_assets", "max_assets");
  if (pressure.ratio >= Number(policy?.stop_ratio || 0.9)) return json({ error: "Identity asset storage guard is active", pressure }, 507);
  const statements = records.flatMap((record) => {
    const assetKind = String(record.assetKind || record.asset_kind || "").toLowerCase();
    const assetKey = String(record.assetKey || record.asset_key || "").toLowerCase();
    const normalizedName = String(record.normalizedName || record.normalized_name || "").toLowerCase().replace(/^@/, "");
    if (!['dns', 'username'].includes(assetKind) || !assetKey || !normalizedName) return [];
    return [database.prepare(`INSERT INTO identity_assets (
      asset_kind,asset_key,normalized_name,display_name,primary_route,length_bucket,script,scarcity_class,
      feature_json,semantic_json,source_updated_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT DO UPDATE SET
      normalized_name=excluded.normalized_name,display_name=excluded.display_name,
      primary_route=CASE WHEN identity_assets.semantic_json IS NOT NULL AND identity_assets.semantic_json!='{}' THEN identity_assets.primary_route ELSE excluded.primary_route END,
      length_bucket=CASE WHEN identity_assets.semantic_json IS NOT NULL AND identity_assets.semantic_json!='{}' THEN identity_assets.length_bucket ELSE excluded.length_bucket END,
      script=CASE WHEN identity_assets.semantic_json IS NOT NULL AND identity_assets.semantic_json!='{}' THEN identity_assets.script ELSE excluded.script END,
      scarcity_class=CASE WHEN identity_assets.semantic_json IS NOT NULL AND identity_assets.semantic_json!='{}' THEN identity_assets.scarcity_class ELSE excluded.scarcity_class END,
      feature_json=CASE WHEN excluded.feature_json='{}' OR (identity_assets.semantic_json IS NOT NULL AND identity_assets.semantic_json!='{}') THEN identity_assets.feature_json ELSE excluded.feature_json END,
      semantic_json=CASE WHEN excluded.semantic_json='{}' THEN identity_assets.semantic_json ELSE excluded.semantic_json END,
      source_updated_at=excluded.source_updated_at,updated_at=CURRENT_TIMESTAMP
    WHERE excluded.source_updated_at >= identity_assets.source_updated_at`).bind(
      assetKind, assetKey, normalizedName, String(record.displayName || record.display_name || normalizedName),
      String(record.primaryRoute || record.primary_route || "residual"),
      String(record.lengthBucket || record.length_bucket || "*"),
      String(record.script || "Common"), String(record.scarcityClass || record.scarcity_class || "standard"),
      compactJson(record.feature || record.feature_json, {}), compactJson(record.semantic || record.semantic_json, {}),
      String(record.sourceUpdatedAt || record.source_updated_at || new Date().toISOString())
    ), database.prepare(`UPDATE identity_asset_aliases SET asset_key=(
        SELECT asset_key FROM identity_assets WHERE asset_kind=?1 AND normalized_name=?2 LIMIT 1
      ),last_seen_at=CURRENT_TIMESTAMP
      WHERE asset_kind=?1 AND normalized_name=?2`).bind(assetKind, normalizedName)];
  });
  const results = statements.length ? await runD1StatementBatches(database, statements) : [];
  const changed = results.reduce((sum, result) => sum + Number(result?.meta?.changes || 0), 0);
  const trackedAssets = await exactIdentityCount(database, "identity_assets");
  await database.prepare(`UPDATE identity_storage_policy SET tracked_assets=?1,updated_at=CURRENT_TIMESTAMP
    WHERE policy_key='primary'`).bind(trackedAssets).run();
  return json({ ok: true, accepted: statements.length, changed, pressure, trackedAssets });
}

async function ingestIdentityAliases(request, env) {
  if (!authorized(request, env)) return json({ error: "Unauthorized" }, 401);
  const database = valuationReadDatabase(env);
  if (!database) return json({ error: "Valuation read model is not configured" }, 503);
  const body = await request.json().catch(() => ({}));
  const records = (Array.isArray(body.records) ? body.records : []).slice(0, 500);
  const statements = records.flatMap((record) => {
    const assetKind = String(record.assetKind || record.asset_kind || "").toLowerCase();
    const aliasKey = String(record.aliasKey || record.alias_key || "").trim().toLowerCase();
    const normalizedName = String(record.normalizedName || record.normalized_name || "").toLowerCase().replace(/^@/, "");
    if (!['dns', 'username'].includes(assetKind) || !aliasKey || !normalizedName) return [];
    const source = String(record.source || "wallet-import").slice(0, 80);
    return [database.prepare(`INSERT INTO identity_asset_aliases (
      asset_kind,alias_key,normalized_name,asset_key,source,last_seen_at
    ) VALUES (?, ?, ?, (
      SELECT asset_key FROM identity_assets WHERE asset_kind=? AND normalized_name=? LIMIT 1
    ), ?, CURRENT_TIMESTAMP)
    ON CONFLICT(asset_kind,alias_key) DO UPDATE SET
      normalized_name=excluded.normalized_name,
      asset_key=COALESCE(excluded.asset_key, identity_asset_aliases.asset_key),
      source=excluded.source,last_seen_at=CURRENT_TIMESTAMP`).bind(
      assetKind, aliasKey, normalizedName, assetKind, normalizedName, source
    )];
  });
  const results = statements.length ? await runD1StatementBatches(database, statements) : [];
  const changed = results.reduce((sum, result) => sum + Number(result?.meta?.changes || 0), 0);
  return json({ ok: true, accepted: statements.length, changed });
}

async function readIdentityAliases(env, body = {}) {
  const database = valuationReadDatabase(env);
  if (!database) return { records: [], configured: false };
  const kind = String(body.assetKind || "").toLowerCase();
  const names = [...new Set((Array.isArray(body.names) ? body.names : [])
    .map((value) => String(value || "").toLowerCase().replace(/^@/, "").trim()).filter(Boolean))].slice(0, 500);
  if (!['dns', 'username'].includes(kind) || !names.length) return { records: [], configured: true };
  const records = [];
  for (let index = 0; index < names.length; index += 50) {
    const chunk = names.slice(index, index + 50);
    const result = await database.prepare(`SELECT * FROM identity_asset_aliases
      WHERE asset_kind=? AND normalized_name IN (${chunk.map(() => "?").join(",")})`).bind(kind, ...chunk).all();
    records.push(...(result.results || []));
  }
  return { records, configured: true };
}

async function ingestIdentitySales(request, env) {
  if (!authorized(request, env)) return json({ error: "Unauthorized" }, 401);
  const database = valuationReadDatabase(env);
  if (!database) return json({ error: "Valuation read model is not configured" }, 503);
  const body = await request.json().catch(() => ({}));
  const records = (Array.isArray(body.records) ? body.records : []).slice(0, 500);
  // D1 reports a changed row for both INSERT and ON CONFLICT UPDATE. Reconcile
  // here so repeated idempotent evidence writes cannot consume the sale quota.
  const salesBefore = await exactIdentityCount(database, "identity_sales");
  let policy = await storagePolicy(database);
  if (Number(policy?.tracked_sales || 0) !== salesBefore) {
    await database.prepare(`UPDATE identity_storage_policy
      SET tracked_sales=?1,updated_at=CURRENT_TIMESTAMP WHERE policy_key='primary'`).bind(salesBefore).run();
    policy = { ...policy, tracked_sales: salesBefore };
  }
  const pressure = storagePressure(policy, "tracked_sales", "max_sales");
  if (pressure.ratio >= Number(policy?.stop_ratio || 0.9)) return json({ error: "Identity sale storage guard is active", pressure }, 507);
  let rejected = 0;
  const statements = records.flatMap((record) => {
    const saleId = String(record.saleId || record.sale_id || record.eventId || "").trim();
    const assetKind = String(record.assetKind || record.asset_kind || "").toLowerCase();
    const assetKey = String(record.assetKey || record.asset_key || record.nftAddress || "").toLowerCase();
    const normalizedName = String(record.normalizedName || record.normalized_name || record.username || record.domain || "").toLowerCase().replace(/^@/, "");
    const soldAt = unixSeconds(record.soldAt || record.sold_at || record.eventTime);
    const priceGram = Number(record.priceGram || record.price_gram || 0);
    const historicalUsdRate = Number(record.historicalUsdRate || record.historical_usd_rate || 0);
    const priceUsd = Number(record.priceUsd || record.price_usd || 0);
    const usdError = priceUsd > 0 ? Math.abs((priceGram * historicalUsdRate) - priceUsd) / priceUsd : Infinity;
    if (!saleId || !['dns', 'username'].includes(assetKind) || !assetKey || !normalizedName
      || !soldAt || !(priceGram > 0) || !(historicalUsdRate > 0) || !(priceUsd > 0) || usdError > 0.03) {
      rejected += 1;
      return [];
    }
    return [database.prepare(`INSERT INTO identity_sales (
      sale_id,asset_kind,asset_key,normalized_name,sold_at,price_gram,historical_usd_rate,price_usd,
      marketplace,source,reliability_score,quality_flags_json,primary_route,length_bucket,script,scarcity_class
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(sale_id) DO UPDATE SET
      source=CASE
        WHEN identity_sales.source LIKE '%toncenter%' THEN identity_sales.source
        WHEN excluded.source LIKE '%toncenter%' THEN excluded.source
        WHEN excluded.source LIKE '%market-reported%' THEN excluded.source
        ELSE identity_sales.source
      END,
      reliability_score=MAX(identity_sales.reliability_score, excluded.reliability_score),
      quality_flags_json=CASE
        WHEN identity_sales.source LIKE '%toncenter%' THEN identity_sales.quality_flags_json
        WHEN excluded.source LIKE '%toncenter%' OR excluded.source LIKE '%market-reported%' THEN excluded.quality_flags_json
        ELSE identity_sales.quality_flags_json
      END`).bind(
      saleId, assetKind, assetKey, normalizedName, soldAt, priceGram, historicalUsdRate, priceUsd,
      String(record.marketplace || "unknown"), String(record.source || "unknown"),
      Math.max(0, Math.min(1, Number(record.reliabilityScore || record.reliability_score || 1))),
      compactJson(record.qualityFlags || record.quality_flags_json, []),
      String(record.primaryRoute || record.primary_route || "residual"),
      String(record.lengthBucket || record.length_bucket || "*"),
      String(record.script || "Common"), String(record.scarcityClass || record.scarcity_class || "standard")
    )];
  });
  if (statements.length) await runD1StatementBatches(database, statements);
  const trackedSales = await exactIdentityCount(database, "identity_sales");
  const inserted = Math.max(0, trackedSales - salesBefore);
  const existing = Math.max(0, statements.length - inserted);
  await database.prepare(`UPDATE identity_storage_policy
    SET tracked_sales=?1,updated_at=CURRENT_TIMESTAMP WHERE policy_key='primary'`).bind(trackedSales).run();
  return json({ ok: true, accepted: statements.length, inserted, existing, duplicates: 0, rejected, pressure, trackedSales });
}

async function ingestIdentityBaselines(request, env) {
  if (!authorized(request, env)) return json({ error: "Unauthorized" }, 401);
  const database = valuationReadDatabase(env);
  if (!database) return json({ error: "Valuation read model is not configured" }, 503);
  const body = await request.json().catch(() => ({}));
  const records = (Array.isArray(body.records) ? body.records : []).slice(0, 500);
  const statements = records.flatMap((record) => {
    const kind = String(record.assetKind || record.asset_kind || "").toLowerCase();
    const midpoint = Number(record.midpointUsd || record.midpoint_usd || 0);
    if (!['dns', 'username'].includes(kind) || !(midpoint > 0)) return [];
    return [database.prepare(`INSERT INTO identity_archetype_baselines (
      asset_kind,estimator_version,scope,primary_route,length_bucket,script,scarcity_class,
      midpoint_usd,range_low_usd,range_high_usd,evidence_count,effective_comp_count,
      generated_at,stale_at,provenance_json
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(asset_kind,estimator_version,scope,primary_route,length_bucket,script,scarcity_class)
    DO UPDATE SET midpoint_usd=excluded.midpoint_usd,range_low_usd=excluded.range_low_usd,
      range_high_usd=excluded.range_high_usd,evidence_count=excluded.evidence_count,
      effective_comp_count=excluded.effective_comp_count,generated_at=excluded.generated_at,
      stale_at=excluded.stale_at,provenance_json=excluded.provenance_json
    WHERE excluded.generated_at >= identity_archetype_baselines.generated_at`).bind(
      kind, String(record.estimatorVersion || record.estimator_version || ""), String(record.scope || "global"),
      String(record.primaryRoute || record.primary_route || "*"), String(record.lengthBucket || record.length_bucket || "*"),
      String(record.script || "*"), String(record.scarcityClass || record.scarcity_class || "*"), midpoint,
      Number(record.rangeLowUsd || record.range_low_usd || midpoint), Number(record.rangeHighUsd || record.range_high_usd || midpoint),
      Math.max(0, Number(record.evidenceCount || record.evidence_count || 0)),
      Math.max(0, Number(record.effectiveCompCount || record.effective_comp_count || 0)),
      String(record.generatedAt || record.generated_at || new Date().toISOString()),
      String(record.staleAt || record.stale_at || new Date(Date.now() + 86400000).toISOString()),
      compactJson(record.provenance || record.provenance_json, { verifiedSalesOnly: true })
    )];
  });
  if (statements.length) await runD1StatementBatches(database, statements);
  return json({ ok: true, written: statements.length });
}

async function readIdentitySales(env, body = {}) {
  const database = valuationReadDatabase(env);
  if (!database) return { records: [], configured: false };
  const kind = String(body.assetKind || "").toLowerCase();
  const limit = Math.max(1, Math.min(5000, Number(body.limit || 1000)));
  const cursorSoldAt = Math.max(0, Number(body.cursor?.soldAt || 0));
  const cursorSaleId = String(body.cursor?.saleId || "");
  if (!['dns', 'username'].includes(kind)) return { records: [], configured: true, nextCursor: null };
  const where = cursorSoldAt > 0
    ? "s.asset_kind=?1 AND (s.sold_at < ?2 OR (s.sold_at = ?2 AND s.sale_id < ?3))"
    : "s.asset_kind=?1";
  const statement = database.prepare(`SELECT s.*,a.semantic_json FROM identity_sales s
    LEFT JOIN identity_assets a ON a.asset_kind=s.asset_kind AND a.normalized_name=s.normalized_name
    WHERE ${where} ORDER BY s.sold_at DESC, s.sale_id DESC LIMIT ?${cursorSoldAt > 0 ? 4 : 2}`);
  const result = cursorSoldAt > 0
    ? await statement.bind(kind, cursorSoldAt, cursorSaleId, limit).all()
    : await statement.bind(kind, limit).all();
  const records = result.results || [];
  const last = records.at(-1);
  return {
    configured: true,
    records,
    nextCursor: records.length === limit && last ? { soldAt: Number(last.sold_at), saleId: last.sale_id } : null,
  };
}

async function readIdentityBaselineSource(request, env) {
  if (!authorized(request, env)) return json({ error: "Unauthorized" }, 401);
  const database = valuationReadDatabase(env);
  if (!database) return json({ error: "Valuation read model is not configured" }, 503);
  const body = await request.json().catch(() => ({}));
  const kind = String(body.assetKind || "").toLowerCase();
  const trainingLimit = Math.max(256, Math.min(2500, Number(body.trainingLimit || 2048)));
  if (!['dns', 'username'].includes(kind)) return json({ error: "Unsupported asset kind" }, 400);

  const groups = await database.prepare(`WITH expanded AS (
    SELECT 'global' AS scope,'*' AS primary_route,'*' AS length_bucket,'*' AS script,'*' AS scarcity_class,price_usd
      FROM identity_sales WHERE asset_kind=?1
    UNION ALL
    SELECT 'route',primary_route,'*','*','*',price_usd FROM identity_sales WHERE asset_kind=?1
    UNION ALL
    SELECT 'route-length',primary_route,length_bucket,'*','*',price_usd FROM identity_sales WHERE asset_kind=?1
    UNION ALL
    SELECT 'archetype',primary_route,length_bucket,script,scarcity_class,price_usd FROM identity_sales WHERE asset_kind=?1
  ), ranked AS (
    SELECT *,ROW_NUMBER() OVER (
      PARTITION BY scope,primary_route,length_bucket,script,scarcity_class ORDER BY price_usd
    ) AS rank_index,COUNT(*) OVER (
      PARTITION BY scope,primary_route,length_bucket,script,scarcity_class
    ) AS evidence_count FROM expanded
  ) SELECT scope,primary_route,length_bucket,script,scarcity_class,MAX(evidence_count) AS evidence_count,
    MIN(CASE WHEN rank_index>=CAST((evidence_count-1)*0.2 AS INTEGER)+1 THEN price_usd END) AS range_low_usd,
    MIN(CASE WHEN rank_index>=CAST((evidence_count-1)*0.5 AS INTEGER)+1 THEN price_usd END) AS midpoint_usd,
    MIN(CASE WHEN rank_index>=CAST((evidence_count-1)*0.8 AS INTEGER)+1 THEN price_usd END) AS range_high_usd
    FROM ranked GROUP BY scope,primary_route,length_bucket,script,scarcity_class
    HAVING evidence_count>=3`).bind(kind).all();

  let training = [];
  let premiumCohorts = [];
  let marketPremiumRate = null;
  if (kind === 'username') {
    const highValueLimit = Math.min(160, Math.max(32, Math.floor(trainingLimit * 0.08)));
    const evenLimit = trainingLimit - highValueLimit;
    const results = await database.batch([
      database.prepare(`SELECT s.sale_id,s.normalized_name,s.price_usd,s.sold_at,s.reliability_score,k.semantic_json
        FROM identity_sales s LEFT JOIN identity_assets k
          ON k.asset_kind=s.asset_kind AND k.normalized_name=s.normalized_name
        WHERE s.asset_kind='username' ORDER BY s.price_usd DESC LIMIT ?1`).bind(highValueLimit),
      database.prepare(`WITH ordered AS (
        SELECT s.sale_id,s.normalized_name,s.price_usd,s.sold_at,s.reliability_score,k.semantic_json,
          ROW_NUMBER() OVER (ORDER BY s.sold_at,s.sale_id) AS row_index,
          COUNT(*) OVER () AS total_count
        FROM identity_sales s LEFT JOIN identity_assets k
          ON k.asset_kind=s.asset_kind AND k.normalized_name=s.normalized_name
        WHERE s.asset_kind='username'
      ) SELECT sale_id,normalized_name,price_usd,sold_at,reliability_score,semantic_json FROM ordered
        WHERE row_index % MAX(1,CAST(total_count/?1 AS INTEGER))=0 LIMIT ?1`).bind(evenLimit),
    ]);
    const unique = new Map();
    for (const result of results) for (const row of result.results || []) unique.set(row.sale_id, row);
    training = [...unique.values()].slice(0, trainingLimit);
    const premium = await database.prepare(`SELECT primary_route,length_bucket,script,
      COUNT(*) AS total_count,SUM(CASE WHEN price_usd>=100 THEN 1 ELSE 0 END) AS premium_count
      FROM identity_sales WHERE asset_kind='username' AND sold_at>=unixepoch()-180*86400
      GROUP BY primary_route,length_bucket,script`).all();
    premiumCohorts = premium.results || [];
    const recentMarket = await database.prepare(`SELECT COUNT(*) AS total_count,
      SUM(CASE WHEN price_usd>=100 THEN 1 ELSE 0 END) AS premium_count
      FROM identity_sales WHERE asset_kind='username' AND sold_at>=unixepoch()-90*86400`).first();
    marketPremiumRate = Number(recentMarket?.total_count || 0)
      ? Number(recentMarket.premium_count || 0) / Number(recentMarket.total_count)
      : null;
  }
  return json({ configured: true, assetKind: kind, groups: groups.results || [], training, premiumCohorts, marketPremiumRate });
}

async function readUsernameEvidence(request, env) {
  if (!authorized(request, env)) return json({ error: "Unauthorized" }, 401);
  const database = valuationReadDatabase(env);
  if (!database) return json({ error: "Valuation read model is not configured" }, 503);
  const body = await request.json().catch(() => ({}));
  const targets = (Array.isArray(body.targets) ? body.targets : []).slice(0, 100).map((target) => ({
    normalizedName: String(target.normalizedName || target.username || "").toLowerCase().replace(/^@/, ""),
    primaryRoute: String(target.primaryRoute || "residual"),
    lengthBucket: String(target.lengthBucket || "*"),
  })).filter((target) => target.normalizedName);
  if (!targets.length) return json({ configured: true, records: [] });

  const columns = `s.sale_id,s.asset_key,s.normalized_name,s.sold_at,s.price_usd,s.reliability_score,
    s.quality_flags_json,s.primary_route,s.length_bucket,s.script,s.scarcity_class,a.semantic_json`;
  const cutoff = Math.floor(Date.now() / 1000) - (10 * 365 * 86400);
  const names = [...new Set(targets.map((target) => target.normalizedName))].slice(0, 50);
  const groups = [...new Map(targets.map((target) => [
    `${target.primaryRoute}|${target.lengthBucket}`, target,
  ])).values()].slice(0, 40);
  const cohortLimit = Math.max(120, Math.min(500, Math.floor(5_000 / Math.max(1, groups.length))));
  const statements = [
    database.prepare(`SELECT ${columns} FROM identity_sales s
      LEFT JOIN identity_assets a ON a.asset_kind=s.asset_kind AND a.asset_key=s.asset_key
      WHERE s.asset_kind='username' AND s.sold_at>=?1
      ORDER BY s.sold_at DESC LIMIT 500`).bind(cutoff),
    database.prepare(`SELECT ${columns} FROM identity_sales s
      LEFT JOIN identity_assets a ON a.asset_kind=s.asset_kind AND a.asset_key=s.asset_key
      WHERE s.asset_kind='username' AND s.normalized_name IN (${names.map(() => "?").join(",")})
      ORDER BY s.sold_at DESC LIMIT 1000`).bind(...names),
    ...groups.map((group) => database.prepare(`SELECT ${columns} FROM identity_sales s
      LEFT JOIN identity_assets a ON a.asset_kind=s.asset_kind AND a.asset_key=s.asset_key
      WHERE s.asset_kind='username' AND s.primary_route=?1 AND s.length_bucket=?2 AND s.sold_at>=?3
      ORDER BY s.sold_at DESC LIMIT ?4`).bind(group.primaryRoute, group.lengthBucket, cutoff, cohortLimit)),
  ];
  const results = await database.batch(statements);
  const records = new Map();
  for (const result of results) {
    for (const row of result.results || []) {
      if (!records.has(row.sale_id)) records.set(row.sale_id, row);
      if (records.size >= 6500) break;
    }
    if (records.size >= 6500) break;
  }
  const knowledge = await database.prepare(`SELECT normalized_name,semantic_json FROM identity_assets
    WHERE asset_kind='username' AND normalized_name IN (${names.map(() => "?").join(",")})`).bind(...names).all();
  return json({ configured: true, records: [...records.values()], knowledge: knowledge.results || [] });
}

async function readDnsEvidence(request, env) {
  if (!authorized(request, env)) return json({ error: "Unauthorized" }, 401);
  const database = valuationReadDatabase(env);
  if (!database) return json({ error: "Valuation read model is not configured" }, 503);
  const body = await request.json().catch(() => ({}));
  const targets = (Array.isArray(body.targets) ? body.targets : []).slice(0, 100).map((target) => ({
    normalizedName: String(target.normalizedName || target.domain || "").toLowerCase().replace(/\.+$/u, ""),
    primaryRoute: String(target.primaryRoute || "residual"),
    lengthBucket: String(target.lengthBucket || "*"),
  })).filter((target) => target.normalizedName.endsWith(".ton"));
  if (!targets.length) return json({ configured: true, records: [] });

  const columns = `s.sale_id,s.asset_key,s.normalized_name,s.sold_at,s.price_gram,s.historical_usd_rate,s.price_usd,
    s.reliability_score,s.quality_flags_json,s.primary_route,s.length_bucket,s.script,s.scarcity_class,a.semantic_json`;
  const cutoff = Math.floor(Date.now() / 1000) - (10 * 365 * 86400);
  const names = [...new Set(targets.map((target) => target.normalizedName))].slice(0, 50);
  const groups = [...new Map(targets.map((target) => [
    `${target.primaryRoute}|${target.lengthBucket}`, target,
  ])).values()].slice(0, 40);
  const statements = [
    database.prepare(`SELECT ${columns} FROM identity_sales s
      LEFT JOIN identity_assets a ON a.asset_kind=s.asset_kind AND a.asset_key=s.asset_key
      WHERE s.asset_kind='dns' AND s.normalized_name IN (${names.map(() => "?").join(",")})
      ORDER BY s.sold_at DESC LIMIT 1000`).bind(...names),
    ...groups.map((group) => database.prepare(`SELECT ${columns} FROM identity_sales s
      LEFT JOIN identity_assets a ON a.asset_kind=s.asset_kind AND a.asset_key=s.asset_key
      WHERE s.asset_kind='dns' AND s.primary_route=?1 AND s.length_bucket=?2 AND s.sold_at>=?3
      ORDER BY s.sold_at DESC LIMIT 1000`).bind(group.primaryRoute, group.lengthBucket, cutoff)),
  ];
  const results = await database.batch(statements);
  const records = new Map();
  for (const result of results) {
    for (const row of result.results || []) {
      if (!records.has(row.sale_id)) records.set(row.sale_id, row);
      if (records.size >= 8000) break;
    }
    if (records.size >= 8000) break;
  }
  const knowledge = await database.prepare(`SELECT normalized_name,semantic_json FROM identity_assets
    WHERE asset_kind='dns' AND normalized_name IN (${names.map(() => "?").join(",")})`).bind(...names).all();
  return json({ configured: true, records: [...records.values()], knowledge: knowledge.results || [] });
}

async function readIdentityAssets(env, body = {}) {
  const database = valuationReadDatabase(env);
  if (!database) return { records: [], configured: false, nextCursor: null };
  const kind = String(body.assetKind || "").toLowerCase();
  const limit = Math.max(1, Math.min(5000, Number(body.limit || 1000)));
  const cursor = String(body.cursor || "").toLowerCase();
  if (!['dns', 'username'].includes(kind)) return { records: [], configured: true, nextCursor: null };
  const result = cursor
      ? await database.prepare(`SELECT asset_key,normalized_name,display_name,semantic_json,source_updated_at
        FROM identity_assets WHERE asset_kind=?1 AND asset_key>?2 ORDER BY asset_key LIMIT ?3`)
      .bind(kind, cursor, limit).all()
    : await database.prepare(`SELECT asset_key,normalized_name,display_name,semantic_json,source_updated_at
        FROM identity_assets WHERE asset_kind=?1 ORDER BY asset_key LIMIT ?2`)
      .bind(kind, limit).all();
  const records = result.results || [];
  const last = records.at(-1);
  return { configured: true, records, nextCursor: records.length === limit && last ? last.asset_key : null };
}

async function readIdentityKnowledgeQueue(env, body = {}) {
  const database = valuationReadDatabase(env);
  if (!database) return { records: [], configured: false };
  const limit = Math.max(1, Math.min(50, Number(body.limit || 8)));
  const kind = String(body.assetKind || "username").toLowerCase();
  const mode = String(body.mode || "full").toLowerCase();
  if (!["dns", "username"].includes(kind)) return { records: [], configured: true };
  if (!["fast", "full"].includes(mode)) return { records: [], configured: true };
  const schemaVersion = kind === "dns" ? "dns-knowledge-v1" : "username-knowledge-v4";
  const retryCutoff = new Date(Date.now() - (7 * 86400000)).toISOString();
  const attemptedField = mode === "fast" ? "lexicalLookupAttemptedAt" : "entityLookupAttemptedAt";
  const stagePending = mode === "fast"
    ? `OR (json_extract(a.semantic_json,'$.lexicalLookupComplete') IS NOT 1
      AND (json_extract(a.semantic_json,'$.${attemptedField}') IS NULL OR json_extract(a.semantic_json,'$.${attemptedField}')<=?3))`
    : `OR (json_extract(a.semantic_json,'$.entityLookupComplete') IS NOT 1
      AND (json_extract(a.semantic_json,'$.${attemptedField}') IS NULL OR json_extract(a.semantic_json,'$.${attemptedField}')<=?3))`;
  const marketStagePending = mode === "fast"
    ? `OR (json_extract(k.semantic_json,'$.lexicalLookupComplete') IS NOT 1
      AND (json_extract(k.semantic_json,'$.${attemptedField}') IS NULL OR json_extract(k.semantic_json,'$.${attemptedField}')<=?3))`
    : `OR (json_extract(k.semantic_json,'$.entityLookupComplete') IS NOT 1
      AND (json_extract(k.semantic_json,'$.${attemptedField}') IS NULL OR json_extract(k.semantic_json,'$.${attemptedField}')<=?3))`;
  const pending = `(a.semantic_json IS NULL OR a.semantic_json='{}'
    OR json_extract(a.semantic_json,'$.schemaVersion')!='${schemaVersion}'
    ${kind === "dns" ? "OR json_extract(a.semantic_json,'$.dnsClassificationVersion')!='dns-semantic-route-v2'" : ""}
    ${stagePending})`;
  const [marketPriority, walletPriority] = await database.batch([
    database.prepare(`SELECT s.asset_kind,s.asset_kind||':'||s.normalized_name AS asset_key,s.normalized_name,
      COALESCE(k.semantic_json,'{}') AS semantic_json,
      COALESCE(k.source_updated_at,MAX(s.sold_at)) AS source_updated_at
    FROM identity_sales s LEFT JOIN identity_assets k
      ON k.asset_kind=s.asset_kind AND k.normalized_name=s.normalized_name
    WHERE s.asset_kind=?2 AND (k.semantic_json IS NULL OR k.semantic_json='{}'
      OR json_extract(k.semantic_json,'$.schemaVersion')!='${schemaVersion}'
      ${kind === "dns" ? "OR json_extract(k.semantic_json,'$.dnsClassificationVersion')!='dns-semantic-route-v2'" : ""}
      ${marketStagePending})
    GROUP BY s.asset_kind,s.normalized_name,k.semantic_json,k.source_updated_at
      ORDER BY CASE
        WHEN MAX(s.price_usd)>=100 AND MAX(s.price_usd)<500 THEN 0
        WHEN MAX(s.price_usd)>=500 THEN 1
        WHEN MAX(s.price_usd)>=25 THEN 2
        ELSE 3 END,
        MAX(s.sold_at) DESC LIMIT ?1`).bind(limit, kind, retryCutoff),
    database.prepare(`SELECT a.asset_kind,a.asset_key,a.normalized_name,a.semantic_json,a.source_updated_at
      FROM identity_assets a WHERE a.asset_kind=?2 AND ${pending}
      ORDER BY a.source_updated_at DESC LIMIT ?1`).bind(limit, kind, retryCutoff),
  ]);
  const unique = new Map();
  const marketRows = marketPriority.results || [];
  const walletRows = walletPriority.results || [];
  for (let index = 0; unique.size < limit && index < Math.max(marketRows.length, walletRows.length); index += 1) {
    for (const row of [marketRows[index], walletRows[index]]) {
      if (row && !unique.has(row.asset_key)) unique.set(row.asset_key, row);
      if (unique.size >= limit) break;
    }
  }
  return { configured: true, records: [...unique.values()].slice(0, limit) };
}

async function ingestIdentityKnowledge(request, env) {
  if (!authorized(request, env)) return json({ error: "Unauthorized" }, 401);
  const database = valuationReadDatabase(env);
  if (!database) return json({ error: "Valuation read model is not configured" }, 503);
  const body = await request.json().catch(() => ({}));
  const records = (Array.isArray(body.records) ? body.records : []).slice(0, 50);
  const statements = records.flatMap((record) => {
    const assetKind = String(record.assetKind || record.asset_kind || "username").toLowerCase();
    const assetKey = String(record.assetKey || record.asset_key || "").toLowerCase();
    const normalizedName = String(record.normalizedName || record.normalized_name || "").toLowerCase().replace(/^@/, "");
    if (!["dns", "username"].includes(assetKind) || !assetKey || !normalizedName) return [];
    const classification = record.classification || {};
    const primaryRoute = String(classification.primaryRoute || "");
    const lengthBucket = String(record.lengthBucket || classification.lengthBucket || "");
    const script = String(classification.primaryScript || classification.script || "");
    const scarcityClass = String(classification.scarcityClass || "");
    return [
      database.prepare(`INSERT INTO identity_assets (
        asset_kind,asset_key,normalized_name,display_name,primary_route,length_bucket,script,scarcity_class,
        feature_json,semantic_json,source_updated_at,updated_at
      ) VALUES (?2,?8,?9,?9,?3,?4,?5,?6,?7,?1,unixepoch(),CURRENT_TIMESTAMP)
      ON CONFLICT(asset_kind,normalized_name) DO UPDATE SET
        display_name=excluded.display_name,
        semantic_json=excluded.semantic_json,
        primary_route=CASE WHEN excluded.primary_route!='' THEN excluded.primary_route ELSE identity_assets.primary_route END,
        length_bucket=CASE WHEN excluded.length_bucket!='' THEN excluded.length_bucket ELSE identity_assets.length_bucket END,
        script=CASE WHEN excluded.script!='' THEN excluded.script ELSE identity_assets.script END,
        scarcity_class=CASE WHEN excluded.scarcity_class!='' THEN excluded.scarcity_class ELSE identity_assets.scarcity_class END,
        feature_json=CASE WHEN excluded.feature_json!='{}' THEN excluded.feature_json ELSE identity_assets.feature_json END,
        source_updated_at=MAX(identity_assets.source_updated_at,excluded.source_updated_at),updated_at=CURRENT_TIMESTAMP`).bind(
        compactJson(record.knowledge || record.semantic || {}, {}), assetKind,
        primaryRoute, lengthBucket, script, scarcityClass, compactJson(classification, {}), assetKey,
        normalizedName,
      ),
      database.prepare(`UPDATE identity_sales SET
        primary_route=CASE WHEN ?3!='' THEN ?3 ELSE primary_route END,
        length_bucket=CASE WHEN ?4!='' THEN ?4 ELSE length_bucket END,
        script=CASE WHEN ?5!='' THEN ?5 ELSE script END,
        scarcity_class=CASE WHEN ?6!='' THEN ?6 ELSE scarcity_class END
        WHERE asset_kind=?1 AND normalized_name=?7`).bind(
        assetKind, assetKey, primaryRoute, lengthBucket, script, scarcityClass,
        normalizedName,
      ),
    ];
  });
  if (statements.length) await runD1StatementBatches(database, statements);
  return json({ ok: true, written: statements.length });
}

async function ingestIdentityMarket(request, env) {
  if (!authorized(request, env)) return json({ error: "Unauthorized" }, 401);
  const database = valuationReadDatabase(env);
  if (!database) return json({ error: "Valuation read model is not configured" }, 503);
  const body = await request.json().catch(() => ({}));
  const records = (Array.isArray(body.records) ? body.records : []).slice(0, 500);
  const statements = records.flatMap((record) => {
    const kind = String(record.assetKind || record.asset_kind || "").toLowerCase();
    const assetKey = String(record.assetKey || record.asset_key || "").toLowerCase();
    const observedAt = String(record.observedAt || record.observed_at || "");
    if (!['dns', 'username'].includes(kind) || !assetKey || !Number.isFinite(Date.parse(observedAt))) return [];
    return [database.prepare(`INSERT INTO identity_current_market (
      asset_kind,asset_key,lowest_ask_gram,highest_bid_gram,marketplace,verified,observed_at,stale_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(asset_kind,asset_key) DO UPDATE SET lowest_ask_gram=excluded.lowest_ask_gram,
      highest_bid_gram=excluded.highest_bid_gram,marketplace=excluded.marketplace,verified=excluded.verified,
      observed_at=excluded.observed_at,stale_at=excluded.stale_at,updated_at=CURRENT_TIMESTAMP
    WHERE excluded.observed_at >= identity_current_market.observed_at`).bind(
      kind, assetKey, Number(record.lowestAskGram || record.lowest_ask_gram || 0) || null,
      Number(record.highestBidGram || record.highest_bid_gram || 0) || null,
      String(record.marketplace || ""), record.verified ? 1 : 0, observedAt,
      String(record.staleAt || record.stale_at || "") || null
    )];
  });
  if (statements.length) await runD1StatementBatches(database, statements);
  return json({ ok: true, written: statements.length });
}

async function readIdentityState(env, keyValue) {
  const database = valuationReadDatabase(env);
  if (!database) return { configured: false, state: null };
  const pipelineKey = String(keyValue || "").trim();
  if (!pipelineKey) return { configured: true, state: null };
  const row = await database.prepare("SELECT * FROM identity_pipeline_state WHERE pipeline_key=?1").bind(pipelineKey).first();
  return { configured: true, state: row ? {
    pipelineKey: row.pipeline_key,
    cursor: JSON.parse(row.cursor_json || "{}"),
    metadata: JSON.parse(row.metadata_json || "{}"),
    updatedAt: row.updated_at,
  } : null };
}

async function ingestIdentityState(request, env) {
  if (!authorized(request, env)) return json({ error: "Unauthorized" }, 401);
  const database = valuationReadDatabase(env);
  if (!database) return json({ error: "Valuation read model is not configured" }, 503);
  const body = await request.json().catch(() => ({}));
  const pipelineKey = String(body.pipelineKey || "").trim();
  if (!pipelineKey) return json({ error: "pipelineKey is required" }, 400);
  await database.prepare(`INSERT INTO identity_pipeline_state (pipeline_key,cursor_json,metadata_json,updated_at)
    VALUES (?1,?2,?3,CURRENT_TIMESTAMP) ON CONFLICT(pipeline_key) DO UPDATE SET
    cursor_json=excluded.cursor_json,metadata_json=excluded.metadata_json,updated_at=CURRENT_TIMESTAMP`)
    .bind(pipelineKey, compactJson(body.cursor, {}), compactJson(body.metadata, {})).run();
  return json({ ok: true, pipelineKey });
}

async function readIdentityBaselines(env, body = {}) {
  const database = valuationReadDatabase(env);
  if (!database) return { records: [], configured: false };
  const kind = String(body.assetKind || "").toLowerCase();
  const version = String(body.estimatorVersion || "");
  if (!['dns', 'username'].includes(kind) || !version) return { records: [], configured: true };
  const result = await database.prepare(`SELECT * FROM identity_archetype_baselines
    WHERE asset_kind=?1 AND estimator_version=?2 AND stale_at > ?3`).bind(kind, version, new Date().toISOString()).all();
  return { configured: true, records: result.results || [] };
}

async function maintainIdentityStorage(env) {
  const database = valuationReadDatabase(env);
  if (!database) return { configured: false };
  const cutoff = new Date(Date.now() - 30 * 86400000).toISOString();
  const aliasCutoff = new Date(Date.now() - 90 * 86400000).toISOString();
  await database.prepare("DELETE FROM identity_current_market WHERE stale_at IS NOT NULL AND stale_at < ?1").bind(cutoff).run();
  await database.prepare("DELETE FROM identity_asset_aliases WHERE last_seen_at < ?1").bind(aliasCutoff).run();
  const counts = await database.prepare(`SELECT
    (SELECT COUNT(*) FROM identity_assets) AS assets,
    (SELECT COUNT(*) FROM identity_sales) AS sales,
    (SELECT COUNT(*) FROM valuation_records) AS valuations`).first();
  await database.prepare(`UPDATE identity_storage_policy SET tracked_assets=?1,tracked_sales=?2,
    tracked_valuations=?3,updated_at=CURRENT_TIMESTAMP WHERE policy_key='primary'`)
    .bind(Number(counts?.assets || 0), Number(counts?.sales || 0), Number(counts?.valuations || 0)).run();
  const policy = await storagePolicy(database);
  return { configured: true, policy, pressure: {
    assets: storagePressure(policy, "tracked_assets", "max_assets"),
    sales: storagePressure(policy, "tracked_sales", "max_sales"),
    valuations: storagePressure(policy, "tracked_valuations", "max_valuations"),
  } };
}

async function ingestValuationRecords(request, env) {
  if (!authorized(request, env)) return json({ error: "Unauthorized" }, 401);
  const database = valuationReadDatabase(env);
  if (!database) return json({ error: "Valuation read model is not configured" }, 503);
  const body = await request.json().catch(() => ({}));
  const records = (Array.isArray(body.records) ? body.records : []).slice(0, 500);
  const policy = await storagePolicy(database);
  policy.tracked_valuations = await exactIdentityCount(database, "valuation_records");
  const pressure = storagePressure(policy, "tracked_valuations", "max_valuations");
  if (pressure.ratio >= Number(policy?.stop_ratio || 0.9)) {
    return json({ error: "Identity valuation storage guard is active", pressure }, 507);
  }
  const statements = [];
  for (const record of records) {
    const assetKind = String(record.asset_kind || record.assetKind || "").trim().toLowerCase();
    const assetKey = String(record.asset_key || record.assetKey || "").trim().toLowerCase();
    const estimatorVersion = String(record.estimator_version || record.estimatorVersion || "").trim();
    if (!['dns', 'username'].includes(assetKind) || !assetKey || !estimatorVersion) continue;
    statements.push(database.prepare(
      `INSERT INTO valuation_records (
        asset_kind, asset_key, display_name, estimate_usd, range_low_usd, range_high_usd,
        confidence_score, confidence_band, valuation_status, portfolio_eligible,
        evidence_count, effective_comp_count, own_sale_count, current_listing_gram,
        current_bid_gram, market_platform, estimator_version, calibration_version,
        valued_at, stale_at, explanation_json, updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(asset_kind, asset_key) DO UPDATE SET
        display_name=excluded.display_name, estimate_usd=excluded.estimate_usd,
        range_low_usd=excluded.range_low_usd, range_high_usd=excluded.range_high_usd,
        confidence_score=excluded.confidence_score, confidence_band=excluded.confidence_band,
        valuation_status=excluded.valuation_status, portfolio_eligible=excluded.portfolio_eligible,
        evidence_count=excluded.evidence_count, effective_comp_count=excluded.effective_comp_count,
        own_sale_count=excluded.own_sale_count, current_listing_gram=excluded.current_listing_gram,
        current_bid_gram=excluded.current_bid_gram, market_platform=excluded.market_platform,
        estimator_version=excluded.estimator_version, calibration_version=excluded.calibration_version,
        valued_at=excluded.valued_at, stale_at=excluded.stale_at,
        explanation_json=excluded.explanation_json, updated_at=CURRENT_TIMESTAMP
      WHERE excluded.valued_at >= valuation_records.valued_at
        AND (
          excluded.estimator_version = valuation_records.estimator_version
          OR (
            instr(excluded.estimator_version, '-v') > 0
            AND instr(valuation_records.estimator_version, '-v') > 0
            AND substr(excluded.estimator_version, 1, instr(excluded.estimator_version, '-v')) =
                substr(valuation_records.estimator_version, 1, instr(valuation_records.estimator_version, '-v'))
            AND CAST(substr(excluded.estimator_version, instr(excluded.estimator_version, '-v') + 2) AS INTEGER) >
                CAST(substr(valuation_records.estimator_version, instr(valuation_records.estimator_version, '-v') + 2) AS INTEGER)
          )
        )`
    ).bind(
      assetKind, assetKey, String(record.display_name || record.displayName || assetKey),
      Number(record.estimate_usd || record.estimateUsd || 0) || null,
      Number(record.range_low_usd || record.rangeLowUsd || 0) || null,
      Number(record.range_high_usd || record.rangeHighUsd || 0) || null,
      Number(record.confidence_score || record.confidenceScore || 0),
      String(record.confidence_band || record.confidenceBand || "low"),
      String(record.valuation_status || record.valuationStatus || "unavailable"),
      record.portfolio_eligible || record.portfolioEligible ? 1 : 0,
      Number(record.evidence_count || record.evidenceCount || 0),
      Number(record.effective_comp_count || record.effectiveCompCount || 0),
      Number(record.own_sale_count || record.ownSaleCount || 0),
      Number(record.current_listing_gram || record.currentListingGram || 0) || null,
      Number(record.current_bid_gram || record.currentBidGram || 0) || null,
      String(record.market_platform || record.marketPlatform || ""),
      estimatorVersion,
      String(record.calibration_version || record.calibrationVersion || ""),
      String(record.valued_at || record.valuedAt || new Date().toISOString()),
      String(record.stale_at || record.staleAt || new Date().toISOString()),
      JSON.stringify(record.explanation_json || record.explanation || {})
    ));
  }
  if (statements.length) await runD1StatementBatches(database, statements);
  const trackedValuations = await exactIdentityCount(database, "valuation_records");
  await database.prepare(`UPDATE identity_storage_policy SET tracked_valuations=?1,updated_at=CURRENT_TIMESTAMP
    WHERE policy_key='primary'`).bind(trackedValuations).run();
  return json({ ok: true, written: statements.length, pressure, trackedValuations });
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
  const estimateRowGroups = [];
  const historyDatabase = floorSourcesDatabase(env);
  for (let index = 0; index < grouped.length; index += 50) {
    const chunk = grouped.slice(index, index + 50);
    const chunkRows = await historyDatabase.batch(chunk.map((group) => (
      historyDatabase.prepare(
        `SELECT points_json
         FROM gift_combo_history_segments
         WHERE collection_key = ?1 AND bucket IN (-1, ?2)
         ORDER BY day_start DESC`
      ).bind(group.collectionKey, group.bucket)
    )));
    chunkRows.forEach((result, resultIndex) => estimateRowGroups.push({ result, group: chunk[resultIndex] }));
  }
  const results = new Map();
  const estimates = new Map();
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
  estimateRowGroups.forEach(({ result, group }) => {
    const latestByTarget = new Map();
    for (const row of result.results || []) {
      for (const point of historySegmentBucketPoints(JSON.parse(row.points_json || "{}"), group.bucket)) {
        if (!point.estimate) continue;
        const current = latestByTarget.get(point.targetKey);
        if (!current || new Date(point.timestamp) > new Date(current.timestamp)) {
          latestByTarget.set(point.targetKey, point);
        }
      }
    }
    group.pairs.forEach((pair) => {
      const point = latestByTarget.get(pair.targetKey);
      if (!point) return;
      const resultKey = [key(pair.collection), key(pair.model), key(pair.backdrop)].join(":");
      const candidate = {
        collection: rowMap.get(`${group.collectionKey}:${group.bucket}`)?.collection_name || pair.collection,
        model: pair.model,
        backdrop: pair.backdrop,
        floorTon: Number(point.floorTon || 0),
        listedCount: 0,
        snapshotAt: point.timestamp,
        source: "estimated-combo-value",
      };
      const current = estimates.get(resultKey);
      if (!current || new Date(candidate.snapshotAt) > new Date(current.snapshotAt)) {
        estimates.set(resultKey, candidate);
      }
    });
  });
  return { combinations: [...results.values()], estimates: [...estimates.values()], coverage };
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
    return {
      timestamp: row.sampled_at,
      floorTon: Number(entry.f || 0),
      listedCount: Number(entry.l || 0),
      estimate: String(entry.p || "") === "ESTIMATE",
    };
  }).filter(Boolean));
  const compacted = segmentResults.flatMap((result) => (result.results || []).flatMap((row) => (
    historySegmentBucketPoints(JSON.parse(row.points_json || "{}"), bucket)
      .filter((point) => point.targetKey === targetKey)
      .map((point) => ({
        timestamp: point.timestamp,
        floorTon: point.floorTon,
        listedCount: point.listedCount,
        estimate: point.estimate,
      }))
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
    priceUsd: Number(row.price_usd || 0),
    tonUsdRate: Number(row.ton_usd_rate || 0),
    rateAt: Number(row.rate_at_unix || 0) > 0
      ? new Date(Number(row.rate_at_unix) * 1000).toISOString()
      : "",
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

function compactSalesDatabaseConfigs(env) {
  return [
    { name: "reserve-2", database: env.GIFT_SALES_RESERVE_2, historicalUsd: true, writable: true },
    { name: "reserve-1", database: env.GIFT_SALES_RESERVE_1, historicalUsd: true, writable: true },
    { name: "2026-b", database: env.GIFT_SALES_2026_B, historicalUsd: true, writable: true },
    { name: "2025", database: env.GIFT_SALES_2025, historicalUsd: true, writable: true },
    { name: "2026-legacy", database: env.GIFT_SALES_2026, historicalUsd: false, writable: false },
  ].filter((entry) => entry.database);
}

function compactSalesDatabases(env) {
  return compactSalesDatabaseConfigs(env)
    .filter((entry) => entry.historicalUsd)
    .map((entry) => entry.database);
}

const salesShardSizeCache = new Map();
const SALES_SHARD_CACHE_MS = 5 * 60 * 1000;
const DEFAULT_SALES_SHARD_LIMIT_BYTES = 400_000_000;
const DEFAULT_SALES_PER_COMBO_LIMIT = 10;
const DEFAULT_SALES_EVENTS_PER_SHARD_LIMIT = 400_000;
const DEFAULT_SALES_PRUNE_BATCH = 25_000;
const HISTORICAL_USD_MAX_RATE_DRIFT_MS = 26 * 60 * 60 * 1000;
const HISTORICAL_USD_MAX_RELATIVE_ERROR = 0.03;

function writableCompactSalesDatabaseConfigs(env, year) {
  const primary = year === 2025
    ? ["2025", "2026-b", "reserve-1", "reserve-2"]
    : ["2026-b", "reserve-1", "reserve-2", "2025"];
  const rank = new Map(primary.map((name, index) => [name, index]));
  return compactSalesDatabaseConfigs(env)
    .filter((entry) => entry.writable)
    .sort((left, right) => (rank.get(left.name) ?? 99) - (rank.get(right.name) ?? 99));
}

async function salesShardSize(config, force = false) {
  const cached = salesShardSizeCache.get(config.name);
  if (!force && cached && Date.now() - cached.checkedAt < SALES_SHARD_CACHE_MS) return cached.bytes;
  const result = await config.database.prepare("SELECT 1 AS healthy").run();
  const bytes = Math.max(0, Number(result.meta?.size_after || 0));
  salesShardSizeCache.set(config.name, { bytes, checkedAt: Date.now() });
  return bytes;
}

async function salesWriteDatabaseFor(env, sale) {
  const year = new Date(sale.soldAt).getUTCFullYear();
  const limit = Math.max(50_000_000, Number(env.SALES_SHARD_ROTATE_BYTES || DEFAULT_SALES_SHARD_LIMIT_BYTES));
  for (const config of writableCompactSalesDatabaseConfigs(env, year)) {
    try {
      if (await salesShardSize(config) < limit) return config;
    } catch {
      // A full or temporarily unhealthy shard must not block the reserve.
    }
  }
  throw new Error(`All compact gift-sales shards reached the ${limit}-byte rotation threshold`);
}

function saleTimestamp(row = {}) {
  if (Number.isFinite(Number(row.sold_at_unix))) return Number(row.sold_at_unix) * 1000;
  return new Date(row.sold_at || 0).getTime();
}

function mergeSalesRows(results = [], requestedLimit = 5) {
  const rows = new Map();
  results.flatMap((result) => result?.results || []).forEach((row) => {
    if (!row.sale_id) return;
    const current = rows.get(row.sale_id);
    const currentHasHistoricalUsd = Number(current?.price_usd || 0) > 0 && Number(current?.ton_usd_rate || 0) > 0;
    const incomingHasHistoricalUsd = Number(row.price_usd || 0) > 0 && Number(row.ton_usd_rate || 0) > 0;
    if (!current || (!currentHasHistoricalUsd && incomingHasHistoricalUsd)) rows.set(row.sale_id, row);
  });
  return [...rows.values()]
    .sort((left, right) => saleTimestamp(right) - saleTimestamp(left))
    .slice(0, Math.max(1, Math.min(20, Number(requestedLimit || 5))));
}

function compactSalesReadStatement(database, pair = {}, requestedLimit = 5, historicalUsd = false) {
  const collectionKeys = collectionAliasKeys(pair.collection).slice(0, 16);
  const modelKey = key(pair.model);
  const backdropKey = key(pair.backdrop);
  if (!collectionKeys.length || !modelKey || !backdropKey) return null;
  const values = [...collectionKeys, modelKey, backdropKey];
  const collectionParams = collectionKeys.map((_, index) => `?${index + 1}`).join(",");
  let sql = `SELECT e.sale_id, c.collection_name, c.model_name, c.backdrop_name, c.symbol_name,
      e.marketplace, e.slug, e.gift_id, e.gift_number,
      (e.price_nano / 1000000000.0) AS price_ton,
      ${historicalUsd ? "(e.price_usd_micros / 1000000.0)" : "0"} AS price_usd,
      ${historicalUsd ? "(e.ton_usd_micros / 1000000.0)" : "0"} AS ton_usd_rate,
      ${historicalUsd ? "e.rate_at" : "0"} AS rate_at_unix,
      e.sold_at AS sold_at_unix
     FROM gift_sale_events e
     JOIN gift_sale_combos c ON c.combo_id = e.combo_id
     WHERE c.collection_key IN (${collectionParams})
       AND c.model_key = ?${values.length - 1}
       AND c.backdrop_key = ?${values.length}`;
  // A raw TON sale may be stored while its event-time USD conversion is being
  // retried. It is valid evidence, but must not surface as a fabricated $0.
  if (historicalUsd) sql += " AND e.price_usd_micros > 0 AND e.ton_usd_micros > 0";
  values.push(Math.max(1, Math.min(20, Number(requestedLimit || 5))));
  sql += ` ORDER BY e.sold_at DESC LIMIT ?${values.length}`;
  return database.prepare(sql).bind(...values);
}

function salesReadStatement(database, pair = {}, requestedLimit = 5) {
  const collectionKeys = collectionAliasKeys(pair.collection).slice(0, 16);
  const modelKey = key(pair.model);
  const backdropKey = key(pair.backdrop);
  if (!collectionKeys.length || !modelKey || !backdropKey) return null;
  const values = [...collectionKeys, modelKey, backdropKey];
  const collectionParams = collectionKeys.map((_, index) => `?${index + 1}`).join(",");
  let sql = `SELECT sale_id, collection_name, model_name, backdrop_name, symbol_name,
      marketplace, slug, gift_id, gift_number, price_ton, original_price, sold_at, gift_url
     FROM gift_sales
     WHERE collection_key IN (${collectionParams})
       AND model_key = ?${values.length - 1}
       AND backdrop_key = ?${values.length}`;
  values.push(Math.max(1, Math.min(20, Number(requestedLimit || 5))));
  sql += ` ORDER BY sold_at DESC LIMIT ?${values.length}`;
  return database.prepare(sql).bind(...values);
}

async function readSales(env, pair = {}, requestedLimit = 5) {
  const compactResults = await Promise.all(compactSalesDatabaseConfigs(env).map(async ({ database, historicalUsd }) => {
    try {
      return await compactSalesReadStatement(database, pair, requestedLimit, historicalUsd)?.all();
    } catch {
      return null;
    }
  }));
  let results = compactResults.filter(Boolean);
  if (!mergeSalesRows(results, requestedLimit).length) {
    const legacyResults = await Promise.all(salesReadDatabases(env).map(async (database) => {
      try {
        return await salesReadStatement(database, pair, requestedLimit)?.all();
      } catch {
        return null;
      }
    }));
    results = results.concat(legacyResults.filter(Boolean));
  }
  return mergeSalesRows(results, requestedLimit).map(saleRow);
}

async function readSalesBulk(env, pairs = [], requestedLimit = 5) {
  const unique = [];
  const seen = new Set();
  (Array.isArray(pairs) ? pairs : []).slice(0, 500).forEach((pair) => {
    const id = [key(pair.collection), key(pair.model), key(pair.backdrop)].join(":");
    if (!key(pair.collection) || !key(pair.model) || !key(pair.backdrop) || seen.has(id)) return;
    seen.add(id);
    unique.push({
      collection: String(pair.collection || "").trim(),
      model: String(pair.model || "").trim(),
      backdrop: String(pair.backdrop || "").trim(),
      symbol: "",
    });
  });
  const results = [];
  const databases = salesReadDatabases(env);
  const compactDatabases = compactSalesDatabases(env);
  for (let index = 0; index < unique.length; index += 50) {
    const chunk = unique.slice(index, index + 50);
    const compactBatches = (await Promise.all(compactDatabases.map(async (database) => {
      try {
        return await database.batch(chunk.map((pair) => compactSalesReadStatement(database, pair, requestedLimit)));
      } catch {
        return null;
      }
    }))).filter(Boolean);
    const missingIndexes = chunk.map((_, resultIndex) => resultIndex)
      .filter((resultIndex) => !mergeSalesRows(compactBatches.map((batch) => batch[resultIndex]), requestedLimit).length);
    const legacyBatches = missingIndexes.length
      ? (await Promise.all(databases.map(async (database) => {
          try {
            return await database.batch(missingIndexes.map((resultIndex) => salesReadStatement(database, chunk[resultIndex], requestedLimit)));
          } catch {
            return null;
          }
        }))).filter(Boolean)
      : [];
    chunk.forEach((pair, resultIndex) => {
      const compactRows = compactBatches.map((batch) => batch[resultIndex]);
      const missingPosition = missingIndexes.indexOf(resultIndex);
      const legacyRows = missingPosition >= 0 ? legacyBatches.map((batch) => batch[missingPosition]) : [];
      const rows = mergeSalesRows(compactRows.concat(legacyRows), requestedLimit);
      results.push({ ...pair, sales: rows.map(saleRow) });
    });
  }
  return { results };
}

async function readPendingHistoricalSaleRates(request, env) {
  if (!authorized(request, env)) return json({ error: "Unauthorized" }, 401);
  const url = new URL(request.url);
  const limit = Math.max(1, Math.min(1000, Number(url.searchParams.get("limit") || 500)));
  const retentionDays = Math.max(30, Math.min(365, Number(env.SALES_RETENTION_DAYS || 365)));
  const cutoff = Math.floor((Date.now() - retentionDays * 86400000) / 1000);
  const results = await Promise.all(compactSalesDatabaseConfigs(env)
    .filter((config) => config.historicalUsd)
    .map(async (config) => {
      try {
        return await config.database.prepare(
          `SELECT e.sale_id, c.collection_name, c.model_name, c.backdrop_name, c.symbol_name,
              e.marketplace, e.slug, e.gift_id, e.gift_number,
              (e.price_nano / 1000000000.0) AS price_ton,
              0 AS price_usd, 0 AS ton_usd_rate, 0 AS rate_at_unix,
              e.sold_at AS sold_at_unix
           FROM gift_sale_events e
           JOIN gift_sale_combos c ON c.combo_id = e.combo_id
           WHERE e.sold_at >= ?1
             AND (e.price_usd_micros <= 0 OR e.ton_usd_micros <= 0 OR e.rate_at <= 0)
           ORDER BY e.ingested_at ASC, e.sold_at DESC
           LIMIT ?2`
        ).bind(cutoff, limit).all();
      } catch {
        return { results: [] };
      }
    }));
  const sales = [];
  const seen = new Set();
  for (const row of results.flatMap((result) => result?.results || [])) {
    const sale = saleRow(row);
    if (!sale.saleId || seen.has(sale.saleId)) continue;
    seen.add(sale.saleId);
    sales.push(sale);
    if (sales.length >= limit) break;
  }
  return json({ sales, limit, retentionDays });
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
    `SELECT target_key, collection_key, collection_name, model_key, model_name,
       backdrop_key, backdrop_name, requested_at, last_evaluated_at
     FROM gift_estimate_history_targets
     WHERE last_evaluated_at = '' OR last_evaluated_at <= ?1
     ORDER BY last_evaluated_at ASC, requested_at ASC
     LIMIT ?2`
  ).bind(dueBefore, limit).all();
  const unique = new Map();
  (result.results || []).forEach((row) => {
    const targetKey = `${row.collection_key}:${row.model_key}:${row.backdrop_key}`;
    if (unique.has(targetKey)) return;
    unique.set(targetKey, {
      targetKey: row.target_key,
      collection: row.collection_name,
      model: row.model_name,
      backdrop: row.backdrop_name,
      requestedAt: row.requested_at,
      lastEvaluatedAt: row.last_evaluated_at,
    });
  });
  return json({ targets: [...unique.values()] });
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

export function normalizedSaleForIngest(input = {}, fallbackCollection = "", ingestedAt = "") {
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
  const priceUsd = Number(input.priceUsd ?? input.price_usd ?? 0);
  const tonUsdRate = Number(input.tonUsdRate ?? input.ton_usd_rate ?? 0);
  const rateAtMs = new Date(input.rateAt || input.rate_at || "").getTime();
  if (
    !key(collectionName)
    || !key(modelName)
    || !key(backdropName)
    || !Number.isFinite(soldAtMs)
    || !(priceTon > 0)
  ) return null;
  const soldAt = new Date(soldAtMs).toISOString();
  const expectedUsd = priceTon * tonUsdRate;
  const historicalUsdIsVerified = Number.isFinite(rateAtMs)
    && priceUsd > 0
    && tonUsdRate > 0
    && Math.abs(rateAtMs - soldAtMs) <= HISTORICAL_USD_MAX_RATE_DRIFT_MS
    && expectedUsd > 0
    && Math.abs(expectedUsd - priceUsd) / expectedUsd <= HISTORICAL_USD_MAX_RELATIVE_ERROR;
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
    // A sale without a coherent event-time rate remains valid TON evidence.
    // It must never become a dollar amount using an ingestion-time quote.
    priceUsd: historicalUsdIsVerified ? priceUsd : 0,
    tonUsdRate: historicalUsdIsVerified ? tonUsdRate : 0,
    rateAt: historicalUsdIsVerified
      ? new Date(rateAtMs).toISOString()
      : "",
    originalPrice,
    soldAt,
    giftUrl: String(input.giftUrl || (slug ? `https://t.me/nft/${encodeURIComponent(slug)}` : "")),
    ingestedAt,
  };
}

function compactSaleComboKey(sale) {
  return [sale.collectionKey, sale.modelKey, sale.backdropKey].join("\u0001");
}

async function pruneTouchedSaleCombos(database, sales = [], perComboLimit = DEFAULT_SALES_PER_COMBO_LIMIT) {
  const combos = [...new Map(sales.map((sale) => [compactSaleComboKey(sale), sale])).values()];
  let deleted = 0;
  for (let index = 0; index < combos.length; index += 25) {
    const chunk = combos.slice(index, index + 25);
    const results = await database.batch(chunk.map((sale) => database.prepare(
      `DELETE FROM gift_sale_events
       WHERE sale_id IN (
         SELECT sale_id FROM (
           SELECT e.sale_id,
             ROW_NUMBER() OVER (ORDER BY e.sold_at DESC, e.sale_id DESC) AS position
           FROM gift_sale_events e
           JOIN gift_sale_combos c ON c.combo_id = e.combo_id
           WHERE c.collection_key = ?1 AND c.model_key = ?2 AND c.backdrop_key = ?3
         )
         WHERE position > ?4
       )`
    ).bind(sale.collectionKey, sale.modelKey, sale.backdropKey, perComboLimit)));
    deleted += results.reduce((sum, entry) => sum + Number(entry.meta?.changes || 0), 0);
  }
  return deleted;
}

async function pruneCompactSalesDatabase(database, options = {}) {
  const maxEvents = Math.max(10_000, Number(options.maxEvents || DEFAULT_SALES_EVENTS_PER_SHARD_LIMIT));
  const batchLimit = Math.max(100, Math.min(100_000, Number(options.batchLimit || DEFAULT_SALES_PRUNE_BATCH)));
  const countRow = await database.prepare("SELECT COUNT(*) AS total FROM gift_sale_events").first();
  const total = Number(countRow?.total || 0);
  const removeCount = Math.max(0, Math.min(batchLimit, total - maxEvents));
  let deletedEvents = 0;
  if (removeCount > 0) {
    // Remove older duplicates first. This preserves at least the newest known
    // sale for low-volume combinations while high-volume combinations stay
    // bounded by the per-combo limit.
    const duplicateResult = await database.prepare(
      `DELETE FROM gift_sale_events
       WHERE sale_id IN (
         SELECT sale_id FROM (
           SELECT e.sale_id, e.sold_at,
             ROW_NUMBER() OVER (
               PARTITION BY c.collection_key, c.model_key, c.backdrop_key
               ORDER BY e.sold_at DESC, e.sale_id DESC
             ) AS position
           FROM gift_sale_events e
           JOIN gift_sale_combos c ON c.combo_id = e.combo_id
         )
         WHERE position > 1
         ORDER BY sold_at ASC, sale_id ASC
         LIMIT ?1
       )`
    ).bind(removeCount).run();
    deletedEvents = Number(duplicateResult.meta?.changes || 0);
    const remaining = removeCount - deletedEvents;
    if (remaining > 0) {
      const oldestResult = await database.prepare(
        `DELETE FROM gift_sale_events
         WHERE sale_id IN (
           SELECT sale_id FROM gift_sale_events
           ORDER BY sold_at ASC, sale_id ASC
           LIMIT ?1
         )`
      ).bind(remaining).run();
      deletedEvents += Number(oldestResult.meta?.changes || 0);
    }
  }
  const orphanResult = await database.prepare(
    `DELETE FROM gift_sale_combos
     WHERE combo_id IN (
       SELECT c.combo_id
       FROM gift_sale_combos c
       LEFT JOIN gift_sale_events e ON e.combo_id = c.combo_id
       WHERE e.sale_id IS NULL
       LIMIT ?1
     )`
  ).bind(batchLimit).run();
  return {
    before: total,
    after: Math.max(0, total - deletedEvents),
    deletedEvents,
    deletedCombos: Number(orphanResult.meta?.changes || 0),
  };
}

async function writeCompactSales(database, sales = [], perComboLimit = DEFAULT_SALES_PER_COMBO_LIMIT) {
  let inserted = 0;
  for (let index = 0; index < sales.length; index += 50) {
    const chunk = sales.slice(index, index + 50);
    const combos = [...new Map(chunk.map((sale) => [compactSaleComboKey(sale), sale])).values()];
    await database.batch(combos.map((sale) => database.prepare(
      `INSERT OR IGNORE INTO gift_sale_combos (
        collection_key, collection_name, model_key, model_name,
        backdrop_key, backdrop_name, symbol_key, symbol_name
      ) VALUES (?1,?2,?3,?4,?5,?6,'','')`
    ).bind(
      sale.collectionKey, sale.collectionName, sale.modelKey, sale.modelName,
      sale.backdropKey, sale.backdropName
    )));
    const comboResults = await database.batch(combos.map((sale) => database.prepare(
      `SELECT combo_id FROM gift_sale_combos
       WHERE collection_key=?1 AND model_key=?2 AND backdrop_key=?3 AND symbol_key=''`
    ).bind(sale.collectionKey, sale.modelKey, sale.backdropKey)));
    const comboIds = new Map();
    combos.forEach((sale, comboIndex) => {
      const comboId = comboResults[comboIndex]?.results?.[0]?.combo_id;
      if (comboId) comboIds.set(compactSaleComboKey(sale), Number(comboId));
    });
    const result = await database.batch(chunk
      .map((sale) => ({ sale, comboId: comboIds.get(compactSaleComboKey(sale)) }))
      .filter(({ comboId }) => Number.isFinite(comboId))
      .map(({ sale, comboId }) => database.prepare(
        `INSERT INTO gift_sale_events (
          sale_id, combo_id, marketplace, slug, gift_id, gift_number,
          price_nano, price_usd_micros, ton_usd_micros, rate_at, sold_at, ingested_at
        ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)
        ON CONFLICT(sale_id) DO UPDATE SET
          combo_id=excluded.combo_id,
          marketplace=excluded.marketplace,
          slug=excluded.slug,
          gift_id=excluded.gift_id,
          gift_number=excluded.gift_number,
          price_nano=excluded.price_nano,
          price_usd_micros=CASE WHEN excluded.price_usd_micros > 0 THEN excluded.price_usd_micros ELSE gift_sale_events.price_usd_micros END,
          ton_usd_micros=CASE WHEN excluded.ton_usd_micros > 0 THEN excluded.ton_usd_micros ELSE gift_sale_events.ton_usd_micros END,
          rate_at=CASE WHEN excluded.rate_at > 0 THEN excluded.rate_at ELSE gift_sale_events.rate_at END,
          sold_at=excluded.sold_at,
          ingested_at=excluded.ingested_at`
      ).bind(
        sale.saleId, comboId, sale.marketplace, sale.slug, sale.giftId, sale.giftNumber,
        Math.round(sale.priceTon * 1_000_000_000),
        Math.round(Math.max(0, sale.priceUsd) * 1_000_000),
        Math.round(Math.max(0, sale.tonUsdRate) * 1_000_000),
        sale.rateAt ? Math.floor(new Date(sale.rateAt).getTime() / 1000) : 0,
        Math.floor(new Date(sale.soldAt).getTime() / 1000),
        Math.floor(new Date(sale.ingestedAt).getTime() / 1000)
      )));
    inserted += result.reduce((sum, entry) => sum + Number(entry.meta?.changes || 0), 0);
  }
  await pruneTouchedSaleCombos(database, sales, perComboLimit);
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
  const perComboLimit = Math.max(3, Math.min(20, Number(env.SALES_PER_COMBO_LIMIT || DEFAULT_SALES_PER_COMBO_LIMIT)));
  const byDatabase = new Map();
  const byYear = new Map();
  sales.forEach((sale) => {
    const year = new Date(sale.soldAt).getUTCFullYear();
    const rows = byYear.get(year) || [];
    rows.push(sale);
    byYear.set(year, rows);
  });
  for (const [year, rows] of byYear) {
    const config = await salesWriteDatabaseFor(env, rows[0]);
    const existing = byDatabase.get(config.name) || { config, rows: [] };
    existing.rows.push(...rows);
    byDatabase.set(config.name, existing);
  }
  let inserted = 0;
  for (const { config, rows } of byDatabase.values()) {
    inserted += await writeCompactSales(config.database, rows, perComboLimit);
    await salesShardSize(config, true);
  }
  return inserted;
}

async function compactSalesShardStats(env) {
  const limit = Math.max(50_000_000, Number(env.SALES_SHARD_ROTATE_BYTES || DEFAULT_SALES_SHARD_LIMIT_BYTES));
  return Promise.all(compactSalesDatabaseConfigs(env).map(async (config) => {
    try {
      const [eventsResult, combosResult] = await Promise.all([
        config.database.prepare(
          `SELECT COUNT(*) AS events, MIN(sold_at) AS earliest_sold_at,
             MAX(sold_at) AS latest_sold_at, MAX(ingested_at) AS latest_ingested_at
           FROM gift_sale_events`
        ).run(),
        config.database.prepare("SELECT COUNT(*) AS combinations FROM gift_sale_combos").run(),
      ]);
      const bytes = Math.max(
        Number(eventsResult.meta?.size_after || 0),
        Number(combosResult.meta?.size_after || 0),
        Number(salesShardSizeCache.get(config.name)?.bytes || 0)
      );
      salesShardSizeCache.set(config.name, { bytes, checkedAt: Date.now() });
      const events = eventsResult.results?.[0] || {};
      const combos = combosResult.results?.[0] || {};
      const utilization = limit > 0 ? bytes / limit : 0;
      return {
        name: config.name,
        writable: Boolean(config.writable),
        historicalUsd: Boolean(config.historicalUsd),
        bytes,
        limitBytes: limit,
        utilization: Number(utilization.toFixed(4)),
        status: !config.writable ? "legacy" : utilization >= 1 ? "full" : utilization >= 0.85 ? "critical" : utilization >= 0.7 ? "warning" : "healthy",
        events: Number(events.events || 0),
        combinations: Number(combos.combinations || 0),
        earliestSaleAt: Number(events.earliest_sold_at || 0) > 0
          ? new Date(Number(events.earliest_sold_at) * 1000).toISOString() : "",
        latestSaleAt: Number(events.latest_sold_at || 0) > 0
          ? new Date(Number(events.latest_sold_at) * 1000).toISOString() : "",
        latestIngestedAt: Number(events.latest_ingested_at || 0) > 0
          ? new Date(Number(events.latest_ingested_at) * 1000).toISOString() : "",
      };
    } catch (error) {
      return {
        name: config.name,
        writable: Boolean(config.writable),
        historicalUsd: Boolean(config.historicalUsd),
        status: "unavailable",
        error: String(error?.message || error).slice(0, 160),
      };
    }
  }));
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

async function collectionHistorySampleTimes(env, collectionKey) {
  const rows = await floorSourcesDatabase(env).prepare(
    `SELECT bucket, points_json
     FROM gift_combo_history_segments
     WHERE collection_key = ?1
     ORDER BY day_start DESC`
  ).bind(collectionKey).all();
  const latest = new Map();
  for (const row of rows.results || []) {
    const bucket = Number(row.bucket);
    if (!Number.isInteger(bucket) || bucket < 0 || bucket >= BUCKET_COUNT) continue;
    const bucketLatest = latest.get(bucket) || new Map();
    for (const point of historySegmentPoints(JSON.parse(row.points_json || "{}"))) {
      const sampledAt = new Date(point.timestamp || 0).getTime();
      if (!Number.isFinite(sampledAt)) continue;
      bucketLatest.set(point.targetKey, Math.max(bucketLatest.get(point.targetKey) || 0, sampledAt));
    }
    latest.set(bucket, bucketLatest);
  }
  return latest;
}

async function ingestCollection(request, env) {
  if (!authorized(request, env)) return json({ error: "Unauthorized" }, 401);
  const body = await request.json();
  const collectionName = String(body.collection || "").trim();
  const collectionKey = key(collectionName);
  const snapshotAt = String(body.snapshotAt || new Date().toISOString());
  const suppliedSource = String(body.source || "thermos").trim() || "thermos";
  const source = sourceKey(suppliedSource);
  const rawBuckets = Array.isArray(body.buckets) ? body.buckets : [];
  const buckets = rawBuckets.map((bucket) => backdropComboBucket(bucket || {}));
  if (source !== "thermos") {
    return json({ error: "Only Thermos floor snapshots are accepted" }, 410);
  }
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
      suppliedSource
    ),
  ];
  const historyChanges = [];
  let changedBuckets = 0;
  buckets.forEach((bucket, index) => {
    const combinationsJson = JSON.stringify(bucket || {});
    const previousJson = previousRows[index]?.results?.[0]?.combinations_json || "";
    if (previousJson !== combinationsJson) changedBuckets += 1;
    statements.push(
      env.GIFT_REGISTRY.prepare(
        `INSERT INTO gift_combo_buckets (collection_key, bucket, snapshot_at, combinations_json)
         VALUES (?1,?2,?3,?4)
         ON CONFLICT(collection_key,bucket) DO UPDATE SET
           snapshot_at=excluded.snapshot_at,
           combinations_json=excluded.combinations_json`
      ).bind(collectionKey, index, snapshotAt, combinationsJson)
    );
    historyChanges.push({
      bucket: index,
      previous: backdropComboBucket(JSON.parse(previousJson || "{}")),
      current: bucket,
    });
  });
  await env.GIFT_REGISTRY.batch(statements);
  const sampleAt = new Date(snapshotAt || Date.now()).getTime();
  const lastSamples = await collectionHistorySampleTimes(env, collectionKey);
  await Promise.all(historyChanges.map(async ({ bucket, previous, current }) => {
    const changes = {};
    const samples = lastSamples.get(bucket) || new Map();
    for (const [targetKey, entry] of Object.entries(current)) {
      const valueChanged = !sameHistoryPoint(previous[targetKey], entry);
      const lastSampleAt = samples.get(targetKey) || 0;
      const sampleDue = !lastSampleAt || (Number.isFinite(sampleAt) && sampleAt - lastSampleAt >= UNCHANGED_SAMPLE_MS);
      if (valueChanged || sampleDue) changes[targetKey] = historyPoint(entry);
    }
    if (Object.keys(changes).length) {
      await appendHistorySegment(env, collectionKey, bucket, snapshotAt, changes);
    }
  }));
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
    y: "",
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
    `${collectionKey}:${key(modelName)}:${key(backdropName)}`,
    collectionKey, collectionName, key(modelName), modelName, key(backdropName), backdropName,
    "", "", snapshotAt
  ).run();
  const previous = await latestHistoryEntry(env, collectionKey, bucket, targetKey);
  const lastSampleAt = new Date(previous?.timestamp || 0).getTime() || 0;
  const lastEntry = previous?.entry || null;
  const valueChanged = !lastEntry || Number(lastEntry.f || 0) !== floorTon || String(lastEntry.p || "") !== "ESTIMATE";
  const sampleDue = !lastSampleAt || (Number.isFinite(sampleAt) && sampleAt - lastSampleAt >= UNCHANGED_SAMPLE_MS);
  if (!valueChanged && !sampleDue) return json({ ok: true, skipped: true, reason: "unchanged-recent", snapshotAt });
  await appendHistorySegment(env, collectionKey, bucket, snapshotAt, { [targetKey]: entry });
  return json({ ok: true, collection: collectionName, model: modelName, backdrop: backdropName, floorTon, snapshotAt });
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
      // The floor worker calls this after every cycle. Keep the default health
      // response on the active state and compact shards; legacy archives are
      // only needed for an explicit forensic audit and can be much slower.
      const includeLegacySales = url.searchParams.get("includeLegacy") === "1";
      const statsSalesDatabases = includeLegacySales
        ? salesReadDatabases(env)
        : [salesDatabase(env)].filter(Boolean);
      const stats = await env.GIFT_REGISTRY.prepare(
        `SELECT COUNT(*) AS collections,
          COALESCE(SUM(listing_count),0) AS listings,
          COALESCE(SUM(combination_count),0) AS combinations,
          MAX(snapshot_at) AS latest_snapshot_at
         FROM gift_combo_collections`
      ).first();
      let sales = {};
      let salesBackfill = {};
      let salesShards = [];
      try {
        const salesParts = await Promise.all(statsSalesDatabases.map((database) => database.prepare(
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
        const backfillParts = await Promise.all(statsSalesDatabases.map((database) => database.prepare(
          `SELECT collection_key, completed_at, oldest_sold_at, last_scanned_at
           FROM gift_sales_backfill_state`
        ).all().catch(() => ({ results: [] }))));
        const states = new Map();
        backfillParts.flatMap((part) => part.results || []).forEach((row) => {
          const current = states.get(row.collection_key) || {};
          states.set(row.collection_key, {
            completed_at: current.completed_at || row.completed_at || "",
            oldest_sold_at: !current.oldest_sold_at || (row.oldest_sold_at && row.oldest_sold_at < current.oldest_sold_at)
              ? row.oldest_sold_at || current.oldest_sold_at : current.oldest_sold_at,
            last_scanned_at: !current.last_scanned_at || (row.last_scanned_at && row.last_scanned_at > current.last_scanned_at)
              ? row.last_scanned_at || current.last_scanned_at : current.last_scanned_at,
          });
        });
        const uniqueStates = [...states.values()];
        salesBackfill = {
          sales_backfill_collections: uniqueStates.length,
          sales_backfill_completed_collections: uniqueStates.filter((state) => state.completed_at).length,
          sales_backfill_oldest_at: uniqueStates.map((state) => state.oldest_sold_at).filter(Boolean).sort()[0] || "",
          sales_backfill_updated_at: uniqueStates.map((state) => state.last_scanned_at).filter(Boolean).sort().at(-1) || "",
        };
      } catch {
        salesBackfill = {};
      }
      salesShards = await compactSalesShardStats(env);
      const compactSales = salesShards.filter((shard) => shard.historicalUsd).reduce((total, shard) => ({
        events: total.events + Number(shard.events || 0),
        combinations: total.combinations + Number(shard.combinations || 0),
        bytes: total.bytes + Number(shard.bytes || 0),
      }), { events: 0, combinations: 0, bytes: 0 });
      const backfillTotal = Number(salesBackfill.sales_backfill_collections || stats?.collections || 0);
      const backfillCompleted = Math.min(
        backfillTotal,
        Number(salesBackfill.sales_backfill_completed_collections || 0)
      );
      return json({
        ...(stats || {}),
        sales_stats_scope: includeLegacySales ? "all-readable-shards" : "active-shard-plus-compact",
        ...sales,
        ...salesBackfill,
        sales_backfill_total_collections: backfillTotal,
        sales_backfill_pending_collections: Math.max(0, backfillTotal - backfillCompleted),
        sales_backfill_coverage_percent: backfillTotal > 0
          ? Number(((backfillCompleted / backfillTotal) * 100).toFixed(2)) : 0,
        compact_sales: compactSales.events,
        compact_sales_combinations: compactSales.combinations,
        compact_sales_bytes: compactSales.bytes,
        sales_shards: salesShards,
      });
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
    if (url.pathname === "/valuations/read" && request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      return json(await readValuationRecords(env, body));
    }
    if (url.pathname === "/ingest/valuations" && request.method === "POST") {
      return ingestValuationRecords(request, env);
    }
    if (url.pathname === "/identity/baselines/read" && request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      return json(await readIdentityBaselines(env, body));
    }
    if (url.pathname === "/identity/sales/read" && request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      return json(await readIdentitySales(env, body));
    }
    if (url.pathname === "/identity/baseline-source/read" && request.method === "POST") {
      return readIdentityBaselineSource(request, env);
    }
    if (url.pathname === "/identity/username-evidence/read" && request.method === "POST") {
      return readUsernameEvidence(request, env);
    }
    if (url.pathname === "/identity/dns-evidence/read" && request.method === "POST") {
      return readDnsEvidence(request, env);
    }
    if (url.pathname === "/identity/assets/read" && request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      return json(await readIdentityAssets(env, body));
    }
    if (url.pathname === "/identity/knowledge/queue" && request.method === "POST") {
      if (!authorized(request, env)) return json({ error: "Unauthorized" }, 401);
      const body = await request.json().catch(() => ({}));
      return json(await readIdentityKnowledgeQueue(env, body));
    }
    if (url.pathname === "/identity/aliases/read" && request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      return json(await readIdentityAliases(env, body));
    }
    if (url.pathname === "/identity/state" && request.method === "GET") {
      return json(await readIdentityState(env, url.searchParams.get("key")));
    }
    if (url.pathname === "/ingest/identity-assets" && request.method === "POST") {
      return ingestIdentityAssets(request, env);
    }
    if (url.pathname === "/ingest/identity-knowledge" && request.method === "POST") {
      return ingestIdentityKnowledge(request, env);
    }
    if (url.pathname === "/ingest/identity-aliases" && request.method === "POST") {
      return ingestIdentityAliases(request, env);
    }
    if (url.pathname === "/ingest/identity-sales" && request.method === "POST") {
      return ingestIdentitySales(request, env);
    }
    if (url.pathname === "/ingest/identity-baselines" && request.method === "POST") {
      return ingestIdentityBaselines(request, env);
    }
    if (url.pathname === "/ingest/identity-market" && request.method === "POST") {
      return ingestIdentityMarket(request, env);
    }
    if (url.pathname === "/ingest/identity-state" && request.method === "POST") {
      return ingestIdentityState(request, env);
    }
    if (url.pathname === "/maintenance/identity-storage" && request.method === "POST") {
      if (!authorized(request, env)) return json({ error: "Unauthorized" }, 401);
      return json({ ok: true, ...(await maintainIdentityStorage(env)) });
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
    if (url.pathname === "/ingest/sales-pending-rates" && request.method === "GET") {
      return readPendingHistoricalSaleRates(request, env);
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
    if (url.pathname === "/maintenance/compact-sales" && request.method === "POST") {
      if (!authorized(request, env)) return json({ error: "Unauthorized" }, 401);
      const body = await request.json().catch(() => ({}));
      const maxEvents = Math.max(10_000, Number(body.maxEvents || env.SALES_EVENTS_PER_SHARD_LIMIT || DEFAULT_SALES_EVENTS_PER_SHARD_LIMIT));
      const batchLimit = Math.max(100, Math.min(100_000, Number(body.batchLimit || env.SALES_PRUNE_BATCH || DEFAULT_SALES_PRUNE_BATCH)));
      const results = await Promise.all(compactSalesDatabaseConfigs(env)
        .filter((config) => config.historicalUsd)
        .map(async (config) => {
          try {
            return { name: config.name, ok: true, ...(await pruneCompactSalesDatabase(config.database, { maxEvents, batchLimit })) };
          } catch (error) {
            return { name: config.name, ok: false, error: String(error?.message || error).slice(0, 160) };
          }
        }));
      return json({ ok: results.every((result) => result.ok), maxEvents, batchLimit, results });
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
    await Promise.all(compactSalesDatabaseConfigs(env)
      .filter((config) => config.historicalUsd)
      .map((config) => pruneCompactSalesDatabase(config.database, {
        maxEvents: Math.max(10_000, Number(env.SALES_EVENTS_PER_SHARD_LIMIT || DEFAULT_SALES_EVENTS_PER_SHARD_LIMIT)),
        batchLimit: Math.max(100, Math.min(100_000, Number(env.SALES_PRUNE_BATCH || DEFAULT_SALES_PRUNE_BATCH))),
      }).catch(() => null)));
    await Promise.all(historyDatabases(env).map((database) => database.prepare(
      `DELETE FROM gift_combo_history_buckets WHERE sampled_at < ?1`
    ).bind(cutoff).run()));
    await floorSourcesDatabase(env).prepare(
      `DELETE FROM gift_combo_history_segments WHERE day_start < ?1`
    ).bind(cutoff.slice(0, 10)).run();
    await maintainIdentityStorage(env).catch(() => null);
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
