const BUCKET_COUNT = 32;

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

async function readCombo(env, collection, model, backdrop) {
  const collectionKeys = collectionAliasKeys(collection);
  const targetKey = comboKey(model, backdrop);
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
  const row = rows.map((result) => result.results?.[0]).find((candidate) => {
    if (!candidate) return false;
    return Boolean(JSON.parse(candidate.combinations_json || "{}")[targetKey]);
  });
  if (!row) return null;
  const entry = JSON.parse(row.combinations_json || "{}")[targetKey];
  if (!entry) return null;
  return {
    collection: row.collection_name,
    model: entry.m,
    backdrop: entry.b,
    floorTon: Number(entry.f || 0),
    listedCount: Number(entry.l || 0),
    marketplace: entry.p || "",
    listingUrl: entry.u || "",
    listingId: entry.i || "",
    snapshotAt: row.bucket_snapshot_at || row.collection_snapshot_at,
    source: row.source || "gift-combo-d1",
  };
}

async function readCombos(env, pairs = []) {
  const groups = new Map();
  const collectionKeys = new Set();
  pairs.forEach((pair) => {
    const aliasKeys = collectionAliasKeys(pair.collection);
    const targetKey = comboKey(pair.model, pair.backdrop);
    if (!aliasKeys.length || targetKey === ":") return;
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
  const results = [];
  const seen = new Set();
  grouped.forEach((group) => {
    const row = rowMap.get(`${group.collectionKey}:${group.bucket}`);
    if (!row) return;
    const entries = JSON.parse(row.combinations_json || "{}");
    group.pairs.forEach((pair) => {
      const entry = entries[pair.targetKey];
      if (!entry) return;
      const resultKey = [key(pair.collection), key(pair.model), key(pair.backdrop)].join(":");
      if (seen.has(resultKey)) return;
      seen.add(resultKey);
      results.push({
        collection: row.collection_name,
        model: entry.m,
        backdrop: entry.b,
        floorTon: Number(entry.f || 0),
        listedCount: Number(entry.l || 0),
        marketplace: entry.p || "",
        listingUrl: entry.u || "",
        listingId: entry.i || "",
        snapshotAt: row.bucket_snapshot_at || row.collection_snapshot_at,
        source: row.source || "gift-combo-d1",
      });
    });
  });
  return { combinations: results, coverage };
}

async function readComboHistory(env, collection, model, backdrop) {
  const collectionKey = key(collection);
  const targetKey = comboKey(model, backdrop);
  if (!collectionKey || targetKey === ":") return [];
  const bucket = bucketFor(targetKey);
  const result = await env.GIFT_REGISTRY.prepare(
    `SELECT sampled_at, changes_json
     FROM gift_combo_history_buckets
     WHERE collection_key = ?1 AND bucket = ?2
     ORDER BY sampled_at ASC`
  ).bind(collectionKey, bucket).all();
  return (result.results || []).map((row) => {
    const entry = JSON.parse(row.changes_json || "{}")[targetKey];
    if (!entry || !(Number(entry.f || 0) > 0)) return null;
    return { timestamp: row.sampled_at, floorTon: Number(entry.f || 0), listedCount: Number(entry.l || 0) };
  }).filter(Boolean);
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
  let changedBuckets = 0;
  buckets.forEach((bucket, index) => {
    const combinationsJson = JSON.stringify(bucket || {});
    const previousJson = previousRows[index]?.results?.[0]?.combinations_json || "";
    if (previousJson === combinationsJson) return;
    changedBuckets += 1;
    statements.push(
      env.GIFT_REGISTRY.prepare(
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
  const source = String(body.source || "thermos").trim() || "thermos";
  const bucketIndex = Number(body.bucketIndex);
  const bucket = body.bucket && typeof body.bucket === "object" && !Array.isArray(body.bucket) ? body.bucket : null;
  if (!collectionKey || !Number.isInteger(bucketIndex) || bucketIndex < 0 || bucketIndex >= BUCKET_COUNT || !bucket) {
    return json({ error: `Expected collection, bucketIndex 0-${BUCKET_COUNT - 1}, and bucket object` }, 400);
  }

  const combinationsJson = JSON.stringify(bucket);
  const previous = await env.GIFT_REGISTRY.prepare(
    `SELECT combinations_json FROM gift_combo_buckets
     WHERE collection_key = ?1 AND bucket = ?2`
  ).bind(collectionKey, bucketIndex).first();
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
    source
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
    const changes = {};
    for (const [targetKey, entry] of Object.entries(bucket)) {
      if (JSON.stringify(previousEntries[targetKey] || null) !== JSON.stringify(entry)) {
        changes[targetKey] = entry;
      }
    }
    if (Object.keys(changes).length) {
      await env.GIFT_REGISTRY.prepare(
        `INSERT INTO gift_combo_history_buckets (
          collection_key, sampled_at, bucket, changes_json
        ) VALUES (?1,?2,?3,?4)
        ON CONFLICT(collection_key, sampled_at, bucket) DO UPDATE SET
          changes_json=excluded.changes_json`
      ).bind(collectionKey, snapshotAt, bucketIndex, JSON.stringify(changes)).run();
    }
  }
  return json({
    ok: true,
    collection: collectionName,
    bucketIndex,
    changed,
    entries: Object.keys(bucket).length,
    snapshotAt,
  });
}

async function ingestCombo(request, env) {
  if (!authorized(request, env)) return json({ error: "Unauthorized" }, 401);
  const body = await request.json();
  const collectionName = String(body.collection || "").trim();
  const modelName = String(body.model || "").trim();
  const backdropName = String(body.backdrop || "").trim();
  const collectionKey = key(collectionName);
  const targetKey = comboKey(modelName, backdropName);
  const floorTon = Number(body.floorTon || 0);
  if (!collectionKey || targetKey === ":" || !(floorTon > 0)) {
    return json({ error: "Expected collection, model, backdrop, and floorTon" }, 400);
  }
  const bucket = bucketFor(targetKey);
  const snapshotAt = String(body.snapshotAt || new Date().toISOString());
  const current = await env.GIFT_REGISTRY.prepare(
    `SELECT c.collection_name, c.listing_count, c.combination_count, c.source,
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
      snapshotAt,
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
    env.GIFT_REGISTRY.prepare(
      `INSERT INTO gift_combo_history_buckets (
        collection_key, sampled_at, bucket, changes_json
      ) VALUES (?1,?2,?3,?4)`
    ).bind(collectionKey, snapshotAt, bucket, JSON.stringify({ [targetKey]: entries[targetKey] })),
  ]);
  return json({
    ok: true,
    collection: current?.collection_name || collectionName,
    model: modelName,
    backdrop: backdropName,
    floorTon,
    listedCount: Number(body.listedCount || 0),
    changed: !existed,
    snapshotAt,
  });
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
      return json(stats || {});
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
        url.searchParams.get("backdrop")
      );
      return result ? json(result) : json({ error: "Combination not found" }, 404);
    }
    if (url.pathname === "/history" && request.method === "GET") {
      return json(await readComboHistory(
        env,
        url.searchParams.get("collection"),
        url.searchParams.get("model"),
        url.searchParams.get("backdrop")
      ));
    }
    if (url.pathname === "/combos" && request.method === "POST") {
      const body = await request.json();
      const pairs = Array.isArray(body.pairs) ? body.pairs.slice(0, 5000) : [];
      return json(await readCombos(env, pairs));
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
    if (url.pathname === "/ingest/status" && request.method === "POST") {
      return ingestStatus(request, env);
    }
    return json({ error: "Not found" }, 404);
  },
  async scheduled(_event, env) {
    await env.GIFT_REGISTRY.prepare(
      `DELETE FROM gift_combo_history_buckets
       WHERE sampled_at < datetime('now', '-30 days')`
    ).run();
  },
};
