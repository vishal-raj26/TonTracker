const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const http = require("node:http");
const path = require("node:path");
const test = require("node:test");

function listen(handler) {
  const server = http.createServer(handler);
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

function sendJson(res, value, status = 200) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(value));
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => resolve(body ? JSON.parse(body) : {}));
  });
}

async function historicalRateServer(t) {
  const server = await listen((req, res) => {
    const url = new URL(req.url, "http://rates.test");
    if (url.pathname !== "/coins/the-open-network/market_chart/range") {
      return sendJson(res, { error: "not found" }, 404);
    }
    return sendJson(res, {
      prices: [
        [new Date("2025-01-01T10:00:00.000Z").getTime(), 4],
        [new Date("2026-07-14T10:00:00.000Z").getTime(), 3],
        [new Date("2026-07-15T10:00:00.000Z").getTime(), 3],
      ],
    });
  });
  t.after(() => server.close());
  return `http://127.0.0.1:${server.address().port}`;
}

test("sales worker checks latest first and checkpoints a 365-day backfill", async (t) => {
  const uploads = [];
  const calls = [];
  const statuses = [];
  const registry = await listen(async (req, res) => {
    const url = new URL(req.url, "http://registry.test");
    if (url.pathname === "/collections") return sendJson(res, { collections: [{ collection_name: "Test Gifts" }] });
    if (url.pathname === "/sales-state" || url.pathname === "/sales-backfill-state") return sendJson(res, { states: [] });
    if (url.pathname === "/ingest/status") {
      statuses.push(await readBody(req));
      return sendJson(res, { ok: true });
    }
    if (url.pathname === "/ingest/sales") {
      const body = await readBody(req);
      uploads.push(body);
      return sendJson(res, { ok: true, inserted: body.sales.length });
    }
    return sendJson(res, { error: "not found" }, 404);
  });
  t.after(() => registry.close());

  const satellite = await listen(async (req, res) => {
    const url = new URL(req.url, "http://satellite.test");
    if (url.pathname === "/api/gift/collections") return sendJson(res, ["Test Gifts"]);
    if (url.pathname === "/api/history/Test%20Gifts") {
      const body = await readBody(req);
      calls.push({ page: body.page, pageSize: body.pageSize });
      const rows = body.page === 0
        ? Array.from({ length: 20 }, (_, index) => ({ _id: `new-${index}`, collectionName: "Test Gifts", modelName: "Model A", backdropName: "Blue", normalizedPrice: 5, soldAt: "2026-07-14T10:00:00.000Z", market: "MRKT", number: index + 1 }))
        : [{ _id: "old", collectionName: "Test Gifts", modelName: "Model A", backdropName: "Blue", normalizedPrice: 4, soldAt: "2025-01-01T10:00:00.000Z", market: "Portals", number: 6 }];
      return sendJson(res, { content: rows, page: { number: body.page, totalPages: 2 } });
    }
    return sendJson(res, { error: "not found" }, 404);
  });
  t.after(() => satellite.close());
  const rateBase = await historicalRateServer(t);

  const root = path.resolve(__dirname, "..");
  const child = spawn(process.execPath, ["scripts/snapshot-gift-sales.js", "--collection", "Test Gifts"], {
    cwd: root,
    env: {
      ...process.env,
      GIFT_SATELLITE_INIT_DATA: "test-init-data",
      GIFT_SATELLITE_API_BASE: `http://127.0.0.1:${satellite.address().port}/api`,
      D1_REGISTRY_URL: `http://127.0.0.1:${registry.address().port}`,
      D1_INGEST_SECRET: "test-secret",
      GIFT_SALES_REQUEST_INTERVAL_MS: "1",
      GIFT_SALES_REQUEST_SAFETY_MS: "0",
      GIFT_SALES_REQUEST_TIMEOUT_MS: "5000",
      GIFT_SALES_BASELINE_PAGES: "1",
      GIFT_SALES_BACKFILL_PAGES_PER_COLLECTION: "2",
      GIFT_SALES_BACKFILL_MODE: "chronological",
      GIFT_SALES_RETENTION_DAYS: "365",
      COINGECKO_API_BASE: rateBase,
      TELEGRAM_FLOOR_ENABLED: "0",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const exitCode = await new Promise((resolve) => child.on("exit", resolve));
  assert.equal(exitCode, 0, stderr);

  assert.deepEqual(calls, [
    { page: 0, pageSize: 20 },
    { page: 0, pageSize: 20 },
    { page: 1, pageSize: 20 },
  ]);
  assert.equal(uploads.length, 2);
  assert.equal(uploads[0].mode, "incremental");
  assert.equal(uploads[0].sales[0].saleId, "new-0");
  assert.equal(uploads[0].sales[0].tonUsdRate, 3);
  assert.equal(uploads[0].sales[0].priceUsd, 15);
  assert.equal(uploads[0].sales[0].rateAt, "2026-07-14T10:00:00.000Z");
  assert.equal(uploads[1].mode, "backfill");
  assert.equal(uploads[1].commitState, true);
  assert.equal(uploads[1].complete, true);
  assert.equal(uploads[1].nextPage, 2);
  assert.equal(uploads[1].sales.length, 20);
  assert.equal(uploads[1].sales[0].saleId, "new-0");
  const expectedCutoff = Date.now() - 365 * 86400000;
  assert.ok(Math.abs(new Date(uploads[1].cutoffAt).getTime() - expectedCutoff) < 60_000);
  assert.equal(statuses.at(-1).phase, "cycle_complete");
  assert.equal(statuses.at(-1).completedCollections, 1);
});

test("sales worker prioritizes exact wallet targets and avoids chronological page walking", async (t) => {
  const uploads = [];
  const satelliteCalls = [];
  const registry = await listen(async (req, res) => {
    const url = new URL(req.url, "http://registry.test");
    if (url.pathname === "/collections") return sendJson(res, { collections: [{ collection_name: "Exact Gifts" }] });
    if (url.pathname === "/sales-state" || url.pathname === "/sales-backfill-state") return sendJson(res, { states: [] });
    if (url.pathname === "/sales-targets") return sendJson(res, { targets: [{ collection: "Exact Gifts", model: "Rare Model", backdrop: "Black" }] });
    if (url.pathname === "/collection-combos") {
      return sendJson(res, { collections: [{ collection: "Exact Gifts", combinations: { "rare-model:black": { model: "Rare Model", backdrop: "Black" } } }] });
    }
    if (url.pathname === "/sales" && req.method === "POST") {
      const body = await readBody(req);
      return sendJson(res, { results: body.pairs.map((pair) => ({ ...pair, sales: [] })) });
    }
    if (url.pathname === "/ingest/status") return sendJson(res, { ok: true });
    if (url.pathname === "/ingest/sales") {
      const body = await readBody(req);
      uploads.push(body);
      return sendJson(res, { ok: true, inserted: body.sales.length, accepted: body.sales.length });
    }
    return sendJson(res, { error: "not found" }, 404);
  });
  t.after(() => registry.close());

  const satellite = await listen(async (req, res) => {
    const url = new URL(req.url, "http://satellite.test");
    if (url.pathname === "/api/gift/collections") return sendJson(res, ["Exact Gifts"]);
    if (url.pathname === "/api/history/Exact%20Gifts") {
      const body = await readBody(req);
      satelliteCalls.push(body);
      const rows = body.models.length
        ? [{ _id: "exact-sale", collectionName: "Exact Gifts", modelName: "Rare Model", backdropName: "Black", normalizedPrice: 42, soldAt: "2026-07-15T10:00:00.000Z", market: "Portals", number: 7 }]
        : [];
      return sendJson(res, { content: rows, page: { number: 0, totalPages: 1 } });
    }
    return sendJson(res, { error: "not found" }, 404);
  });
  t.after(() => satellite.close());
  const rateBase = await historicalRateServer(t);

  const root = path.resolve(__dirname, "..");
  const child = spawn(process.execPath, ["scripts/snapshot-gift-sales.js", "--collection", "Exact Gifts"], {
    cwd: root,
    env: {
      ...process.env,
      GIFT_SATELLITE_INIT_DATA: "test-init-data",
      GIFT_SATELLITE_API_BASE: `http://127.0.0.1:${satellite.address().port}/api`,
      D1_REGISTRY_URL: `http://127.0.0.1:${registry.address().port}`,
      D1_INGEST_SECRET: "test-secret",
      GIFT_SALES_REQUEST_INTERVAL_MS: "1",
      GIFT_SALES_REQUEST_SAFETY_MS: "0",
      GIFT_SALES_BACKFILL_MODE: "exact",
      GIFT_SALES_EXACT_REQUESTS_PER_CYCLE: "100",
      GIFT_SALES_EXACT_COMBOS_PER_COLLECTION: "50",
      COINGECKO_API_BASE: rateBase,
      TELEGRAM_FLOOR_ENABLED: "0",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const exitCode = await new Promise((resolve) => child.on("exit", resolve));
  assert.equal(exitCode, 0, stderr);

  const exactCalls = satelliteCalls.filter((call) => call.models.length);
  assert.ok(exactCalls.length >= 1);
  assert.deepEqual(satelliteCalls[0].models, ["Rare Model"]);
  assert.deepEqual(exactCalls[0].models, ["Rare Model"]);
  assert.deepEqual(exactCalls[0].backdrops, ["Black"]);
  assert.ok(uploads.some((upload) => upload.mode === "exact" && upload.sales[0]?.saleId === "exact-sale"));
  assert.ok(uploads.some((upload) => upload.mode === "backfill" && upload.complete === true));
  assert.equal(satelliteCalls.some((call) => call.page > 0), false);
});

test("exact backfill requests and checkpoints every collection/model/backdrop combination", async (t) => {
  const uploads = [];
  const satelliteCalls = [];
  const pairs = ["Black", "Blue", "Gold", "Red"].map((backdrop) => ({
    collection: "Batch Gifts",
    model: "Shared Model",
    backdrop,
  }));
  const registry = await listen(async (req, res) => {
    const url = new URL(req.url, "http://registry.test");
    if (url.pathname === "/collections") return sendJson(res, { collections: [{ collection_name: "Batch Gifts" }] });
    if (url.pathname === "/sales-state" || url.pathname === "/sales-backfill-state") return sendJson(res, { states: [] });
    if (url.pathname === "/sales-targets") return sendJson(res, { targets: [] });
    if (url.pathname === "/collection-combos") {
      return sendJson(res, {
        collections: [{
          collection: "Batch Gifts",
          combinations: Object.fromEntries(pairs.map((pair) => [pair.backdrop, pair])),
        }],
      });
    }
    if (url.pathname === "/sales" && req.method === "POST") {
      const body = await readBody(req);
      return sendJson(res, { results: body.pairs.map((pair) => ({ ...pair, sales: [] })) });
    }
    if (url.pathname === "/ingest/status") return sendJson(res, { ok: true });
    if (url.pathname === "/ingest/sales") {
      const body = await readBody(req);
      uploads.push(body);
      return sendJson(res, { ok: true, inserted: body.sales.length, accepted: body.sales.length });
    }
    return sendJson(res, { error: "not found" }, 404);
  });
  t.after(() => registry.close());

  const satellite = await listen(async (req, res) => {
    const url = new URL(req.url, "http://satellite.test");
    if (url.pathname === "/api/gift/collections") return sendJson(res, ["Batch Gifts"]);
    if (url.pathname === "/api/history/Batch%20Gifts") {
      const body = await readBody(req);
      satelliteCalls.push(body);
      if (!body.models.length) return sendJson(res, { content: [], page: { number: 0, totalPages: 1 } });
      const available = body.backdrops.filter((backdrop) => backdrop !== "Red").slice(0, 2);
      const rows = available.map((backdrop, index) => ({
        _id: `sale-${backdrop}`,
        collectionName: "Batch Gifts",
        modelName: "Shared Model",
        backdropName: backdrop,
        normalizedPrice: 10 + index,
        soldAt: "2026-07-15T10:00:00.000Z",
        market: "Portals",
      }));
      return sendJson(res, { content: rows, page: { number: 0, totalPages: 1 } });
    }
    return sendJson(res, { error: "not found" }, 404);
  });
  t.after(() => satellite.close());
  const rateBase = await historicalRateServer(t);

  const root = path.resolve(__dirname, "..");
  const child = spawn(process.execPath, ["scripts/snapshot-gift-sales.js", "--collection", "Batch Gifts"], {
    cwd: root,
    env: {
      ...process.env,
      GIFT_SATELLITE_INIT_DATA: "test-init-data",
      GIFT_SATELLITE_API_BASE: `http://127.0.0.1:${satellite.address().port}/api`,
      D1_REGISTRY_URL: `http://127.0.0.1:${registry.address().port}`,
      D1_INGEST_SECRET: "test-secret",
      GIFT_SALES_REQUEST_INTERVAL_MS: "1",
      GIFT_SALES_REQUEST_SAFETY_MS: "0",
      GIFT_SALES_BACKFILL_MODE: "exact",
      GIFT_SALES_EXACT_REQUESTS_PER_CYCLE: "100",
      GIFT_SALES_EXACT_COMBOS_PER_COLLECTION: "50",
      GIFT_SALES_EXACT_FILTER_BATCH_SIZE: "20",
      COINGECKO_API_BASE: rateBase,
      TELEGRAM_FLOOR_ENABLED: "0",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const exitCode = await new Promise((resolve) => child.on("exit", resolve));
  assert.equal(exitCode, 0, stderr);

  const exactCalls = satelliteCalls.filter((call) => call.models.length);
  assert.equal(exactCalls.length, 4);
  assert.deepEqual(exactCalls.map((call) => call.backdrops), [
    ["Black"],
    ["Blue"],
    ["Gold"],
    ["Red"],
  ]);
  const backfill = uploads.find((upload) => upload.mode === "backfill");
  assert.equal(backfill.complete, true);
  assert.deepEqual(backfill.sales.map((sale) => sale.backdrop).sort(), ["Black", "Blue", "Gold"]);
});

test("sales worker interpolates sparse historical TON/USD points and commits progress", async (t) => {
  const uploads = [];
  const registry = await listen(async (req, res) => {
    const url = new URL(req.url, "http://registry.test");
    if (url.pathname === "/collections") return sendJson(res, { collections: [{ collection_name: "Sparse Rates" }] });
    if (url.pathname === "/sales-state" || url.pathname === "/sales-backfill-state") return sendJson(res, { states: [] });
    if (url.pathname === "/ingest/status") return sendJson(res, { ok: true });
    if (url.pathname === "/ingest/sales") {
      const body = await readBody(req);
      uploads.push(body);
      return sendJson(res, { ok: true, inserted: body.sales.length, accepted: body.sales.length });
    }
    return sendJson(res, { error: "not found" }, 404);
  });
  t.after(() => registry.close());

  const satellite = await listen(async (req, res) => {
    const url = new URL(req.url, "http://satellite.test");
    if (url.pathname === "/api/history/Sparse%20Rates") {
      return sendJson(res, {
        content: [{
          _id: "sparse-rate-sale",
          collectionName: "Sparse Rates",
          modelName: "Model A",
          backdropName: "Blue",
          normalizedPrice: 10,
          soldAt: "2026-07-14T12:00:00.000Z",
          market: "MRKT",
        }],
        page: { number: 0, totalPages: 1 },
      });
    }
    return sendJson(res, { error: "not found" }, 404);
  });
  t.after(() => satellite.close());

  const rates = await listen((req, res) => sendJson(res, {
    prices: [
      [new Date("2026-07-14T00:00:00.000Z").getTime(), 2],
      [new Date("2026-07-15T00:00:00.000Z").getTime(), 4],
    ],
  }));
  t.after(() => rates.close());

  const root = path.resolve(__dirname, "..");
  const child = spawn(process.execPath, ["scripts/snapshot-gift-sales.js", "--collection", "Sparse Rates"], {
    cwd: root,
    env: {
      ...process.env,
      GIFT_SATELLITE_INIT_DATA: "test-init-data",
      GIFT_SATELLITE_API_BASE: `http://127.0.0.1:${satellite.address().port}/api`,
      D1_REGISTRY_URL: `http://127.0.0.1:${registry.address().port}`,
      D1_INGEST_SECRET: "test-secret",
      GIFT_SALES_REQUEST_INTERVAL_MS: "1",
      GIFT_SALES_REQUEST_SAFETY_MS: "0",
      GIFT_SALES_BACKFILL_MODE: "chronological",
      GIFT_SALES_BACKFILL_PAGES_PER_COLLECTION: "1",
      COINGECKO_API_BASE: `http://127.0.0.1:${rates.address().port}`,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const exitCode = await new Promise((resolve) => child.on("exit", resolve));
  assert.equal(exitCode, 0, stderr);

  const sale = uploads.flatMap((upload) => upload.sales).find((row) => row.saleId === "sparse-rate-sale");
  assert.ok(sale);
  assert.equal(sale.tonUsdRate, 3);
  assert.equal(sale.priceUsd, 30);
  assert.equal(sale.rateAt, "2026-07-14T12:00:00.000Z");
  assert.ok(uploads.some((upload) => upload.commitState === true));
});
