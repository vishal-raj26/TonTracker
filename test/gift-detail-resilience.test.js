const assert = require("node:assert/strict");
const test = require("node:test");

const {
  giftDetailResponseKey,
  mergeGiftDetailResponse,
  settleWithin,
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
  assert.notEqual(
    giftDetailResponseKey("Heroic Helmets", "King Leonidas", "Ivory White", "Koala", "7d"),
    giftDetailResponseKey("Heroic Helmets", "King Leonidas", "Ivory White", "Boat", "7d"),
  );
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
