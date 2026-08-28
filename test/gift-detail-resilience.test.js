const assert = require("node:assert/strict");
const test = require("node:test");

const {
  giftDetailResponseKey,
  mergeGiftDetailResponse,
  assembleGiftDetailResponse,
  giftDetailTimeoutFallback,
  settleWithin,
  filterGiftHistoryRange,
} = require("../server.js");

test("deduplicates large wallets by exact gift combination", () => {
  const gifts = Array.from({ length: 1200 }, (_, index) => ({
    collection: `Collection ${index % 12}`,
    model: `Model ${index % 40}`,
    backdrop: `Backdrop ${index % 15}`,
    symbol: `Symbol ${index % 8}`,
  }));
  const keys = new Set(gifts.map((gift) => giftDetailResponseKey(
    gift.collection,
    gift.model,
    gift.backdrop,
    gift.symbol,
    "7d",
  )));
  assert.ok(keys.size < gifts.length);
  assert.equal(
    giftDetailResponseKey("Heroic Helmets", "King Leonidas", "Ivory White", "Koala", "7d"),
    giftDetailResponseKey("Heroic Helmets", "King Leonidas", "Ivory White", "Koala", "7d"),
  );
  assert.equal(
    giftDetailResponseKey("Heroic Helmets", "King Leonidas", "Ivory White", "Koala", "7d"),
    giftDetailResponseKey("Heroic Helmets", "King Leonidas", "Ivory White", "Boat", "7d"),
  );
});

test("filters gift history to the selected range", () => {
  const now = Date.parse("2026-08-27T00:00:00Z");
  const history = [
    { date: "2026-08-01T00:00:00Z", floorTon: 10 },
    { date: "2026-08-24T00:00:00Z", floorTon: 11 },
    { date: "2026-08-27T00:00:00Z", floorTon: 12 },
  ];
  assert.deepEqual(filterGiftHistoryRange(history, "7d", now), history.slice(1));
  assert.deepEqual(filterGiftHistoryRange(history, "30d", now), history);
});

test("keeps successful card data when a refresh returns partial failures", () => {
  const stale = {
    floor: { floorTon: 20, listedCount: 3 },
    sales: [{ saleId: "sale-1", priceTon: 18 }],
    floorHistory: [{ priceTon: 19 }, { priceTon: 20 }],
    floorHistorySource: "tontrack-combo-registry",
    modelStats: { modelCount: 200, source: "gift-attributes" },
    collectionStats: { totalMinted: 5000, source: "dune" },
  };
  const merged = mergeGiftDetailResponse({
    floor: {},
    sales: [],
    floorHistory: [],
    modelStats: {},
    collectionStats: {},
  }, stale);
  assert.deepEqual(merged.floor, stale.floor);
  assert.deepEqual(merged.sales, stale.sales);
  assert.deepEqual(merged.floorHistory, stale.floorHistory);
  assert.deepEqual(merged.modelStats, stale.modelStats);
  assert.deepEqual(merged.collectionStats, stale.collectionStats);
});

test("returns a safe fallback when an upstream detail source stalls", async () => {
  const started = Date.now();
  const result = await settleWithin(new Promise(() => {}), 25, { unavailable: true });
  assert.deepEqual(result, { unavailable: true });
  assert.ok(Date.now() - started < 250);
});

test("marks a first-load response deadline as partial while preserving stale data", () => {
  assert.deepEqual(giftDetailTimeoutFallback().partialSources, ["detail-response"]);
  assert.equal(giftDetailTimeoutFallback().partial, true);
  const stale = { floor: { floorTon: 12 }, sales: [{ saleId: "cached" }] };
  assert.equal(giftDetailTimeoutFallback(stale), stale);
});

test("assembles representative exact-combination detail data deterministically", () => {
  const now = Date.parse("2026-08-27T12:00:00Z");
  const combinations = [
    { collection: "Heroic Helmets", model: "King Leonidas", backdrop: "Ivory White", floorTon: 20 },
    { collection: "Plush Pepes", model: "Emerald", backdrop: "Midnight", floorTon: 42 },
    { collection: "Precious Peach", model: "Royal", backdrop: "Sky Blue", floorTon: 7.5 },
  ];
  for (const combo of combinations) {
    const payload = assembleGiftDetailResponse({
      comboResult: { ...combo, listedCount: 3 },
      historyResult: [
        { date: "2026-08-10T00:00:00Z", floorTon: combo.floorTon - 5 },
        { date: "2026-08-26T00:00:00Z", floorTon: combo.floorTon - 2 },
        { date: "2026-08-27T00:00:00Z", floorTon: combo.floorTon },
      ],
      salesResult: [
        { saleId: `${combo.model}-recent`, date: "2026-08-27T06:00:00Z", priceTon: 9, priceUsd: 27 },
        { saleId: `${combo.model}-old`, date: "2026-08-20T06:00:00Z", priceTon: 8, priceUsd: 24 },
      ],
      modelSnapshot: [{ modelCount: 125 }],
      collectionSnapshot: [{ totalMinted: 5000 }],
      rate: 3,
      range: "7d",
      now,
    });
    assert.equal(payload.floor.floorTon, combo.floorTon);
    assert.equal(payload.floor.floorUsd, combo.floorTon * 3);
    assert.equal(payload.floor.totalSupply, 125);
    assert.equal(payload.floorHistory.length, 2);
    assert.equal(payload.floorHistorySource, "tontrack-combo-registry");
    assert.equal(payload.floor.change24hPct, (2 / (combo.floorTon - 2)) * 100);
    assert.deepEqual(payload.sales.map((sale) => sale.saleId), [`${combo.model}-recent`, `${combo.model}-old`]);
    assert.deepEqual(payload.salesStats, { sales24h: 1, volume24hTon: 9, volume24hUsd: 27 });
    assert.equal(payload.salesScope, "same-traits");
    assert.equal(payload.partial, false);
  }
});

test("keeps floor, exact-sale, and chart evidence isolated across a broad trait matrix", () => {
  const now = Date.parse("2026-08-27T12:00:00Z");
  const collections = ["Vintage Cigar", "Plush Pepes", "Precious Peach", "Heroic Helmets"];
  const models = ["Golden Hour", "Emerald", "Royal", "King Leonidas"];
  const backdrops = ["Shamrock Green", "Midnight", "Sky Blue", "Ivory White"];
  const seenSales = new Set();

  for (let index = 0; index < 16; index += 1) {
    const floorTon = 5 + index;
    const payload = assembleGiftDetailResponse({
      comboResult: {
        collection: collections[index % collections.length],
        model: models[index % models.length],
        backdrop: backdrops[Math.floor(index / models.length)],
        floorTon,
        listedCount: 2,
      },
      historyResult: [
        { date: "2026-08-10T00:00:00Z", floorTon: floorTon - 2 },
        { date: "2026-08-20T00:00:00Z", floorTon: floorTon - 1 },
        { date: "2026-08-27T00:00:00Z", floorTon },
      ],
      salesResult: [{
        saleId: `matrix-sale-${index}`,
        date: "2026-08-27T06:00:00Z",
        priceTon: floorTon - 0.5,
        priceUsd: (floorTon - 0.5) * 3,
      }],
      modelSnapshot: [{ modelCount: 50 + index }],
      collectionSnapshot: [{ totalMinted: 5000 + index }],
      rate: 3,
      range: "30d",
      now,
    });
    assert.equal(payload.floor.floorTon, floorTon);
    assert.equal(payload.floorHistory.length, 3);
    assert.equal(payload.floorHistorySource, "tontrack-combo-registry");
    assert.equal(payload.salesScope, "same-traits");
    assert.equal(payload.sales[0].saleId, `matrix-sale-${index}`);
    assert.equal(payload.floor.totalSupply, 50 + index);
    seenSales.add(payload.sales[0].saleId);
  }
  assert.equal(seenSales.size, 16);
});

test("keeps successful sources and names every timed-out detail source", () => {
  const timeout = { timedOut: true };
  const floorAndSales = assembleGiftDetailResponse({
    comboResult: { floorTon: 15, listedCount: 2 },
    historyResult: timeout,
    salesResult: [{ saleId: "exact-sale", date: "2026-08-27T11:00:00Z", priceTon: 14, priceUsd: 42 }],
    modelSnapshot: [{ modelCount: 50 }],
    collectionSnapshot: [{ totalMinted: 1000 }],
    rate: 3,
    now: Date.parse("2026-08-27T12:00:00Z"),
  });
  assert.equal(floorAndSales.floor.floorTon, 15);
  assert.equal(floorAndSales.sales[0].saleId, "exact-sale");
  assert.deepEqual(floorAndSales.partialSources, ["history"]);

  const statsOnly = assembleGiftDetailResponse({
    comboResult: timeout,
    historyResult: timeout,
    salesResult: timeout,
    modelSnapshot: [{ modelCount: 50 }],
    collectionSnapshot: [{ totalMinted: 1000 }],
  });
  assert.equal(statsOnly.floor.floorTon, undefined);
  assert.equal(statsOnly.floor.totalSupply, 50);
  assert.deepEqual(statsOnly.sales, []);
  assert.equal(statsOnly.modelStats.modelCount, 50);
  assert.equal(statsOnly.collectionStats.totalMinted, 1000);
  assert.deepEqual(statsOnly.partialSources, ["floor", "history", "sales"]);
});

test("uses exact sales only as explicitly labelled partial history when the floor registry is empty", () => {
  const now = Date.parse("2026-08-27T12:00:00Z");
  const payload = assembleGiftDetailResponse({
    comboResult: null,
    historyResult: [],
    salesResult: [
      { saleId: "sale-1", date: "2026-08-26T11:00:00Z", priceTon: 9, priceUsd: 27 },
      { saleId: "sale-2", date: "2026-08-27T11:00:00Z", priceTon: 11, priceUsd: 33 },
    ],
    rate: 3,
    range: "7d",
    now,
  });
  assert.equal(payload.floor.floorTon, undefined);
  assert.equal(payload.floorHistorySource, "sales-derived");
  assert.deepEqual(payload.floorHistory.map((point) => point.floorTon), [9, 11]);
  assert.equal(payload.partial, true);
  assert.deepEqual(payload.partialSources, ["floor"]);
});

test("marks absent floor and insufficient history unavailable instead of fabricating a market value", () => {
  const payload = assembleGiftDetailResponse({
    comboResult: null,
    historyResult: [],
    salesResult: [],
    now: Date.parse("2026-08-27T12:00:00Z"),
  });
  assert.equal(payload.floor.floorTon, undefined);
  assert.deepEqual(payload.floorHistory, []);
  assert.deepEqual(payload.partialSources, ["floor", "history"]);
});
