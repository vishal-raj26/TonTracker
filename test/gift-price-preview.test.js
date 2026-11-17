const test = require("node:test");
const assert = require("node:assert/strict");
const preview = require("../lib/gift-price-preview");
const pair = { collection: "Diamond Ring", model: "Black Hole", backdrop: "Midnight" };
test("mock prices require explicit opt-in and cannot run in production", () => {
  assert.equal(preview.enabled({}), false);
  assert.equal(preview.enabled({ TONTRACK_GIFT_PRICE_PREVIEW: "1" }), true);
  for (const [name, value] of [["NODE_ENV", "production"], ["RAILWAY_PROJECT_ID", "project"], ["CF_WORKER", "1"]]) {
    assert.equal(preview.enabled({ TONTRACK_GIFT_PRICE_PREVIEW: "1", [name]: value }), false);
  }
});
test("same combo has consistent mock wallet, detail, bulk and history prices independent of symbol", () => {
  const now = Date.UTC(2026, 9, 3);
  const detail = preview.fixture(pair, "7d", now);
  const other = preview.fixture({ ...pair, symbol: "Different" }, "7d", now);
  assert.equal(detail.floor.floorTon, other.floor.floorTon);
  assert.equal(detail.floor.floorTon, detail.floorHistory.at(-1).floorTon);
  const gift = preview.priceGift({ ...pair, id: "real-nft", image: "real-art.png", name: "Diamond Ring #99" });
  assert.equal(gift.floorTon, detail.floor.floorTon);
  assert.equal(gift.id, "real-nft");
  assert.equal(gift.image, "real-art.png");
  const bulk = preview.apiResponse("/api/gift-model-floors/bulk", new URLSearchParams(), { pairs: [pair] });
  assert.equal(bulk.models[0].floorTon, gift.floorTon);
  assert.ok(detail.sales.length && detail.modelStats.modelCount && detail.collectionStats.totalSupply);
  assert.ok(detail.floorHistory.every((p) => p.preview));
});
test("preview wallet responses cannot mutate caches, invent holdings or change tokens/stickers", () => {
  const body = { gifts: [{ ...pair, floorUsd: 0 }], stickers: [{ floorUsd: 7 }], jettons: [{ price: 9 }] };
  const result = preview.walletResponse(body);
  assert.equal(body.gifts[0].floorUsd, 0);
  assert.equal(result.gifts.length, body.gifts.length);
  assert.ok(result.gifts[0].preview && result.gifts[0].floorUsd > 0);
  assert.deepEqual(result.stickers, body.stickers);
  assert.deepEqual(result.jettons, body.jettons);
});
test("preview periods change chart coverage and estimates obey thin listing rule", () => {
  const now = Date.UTC(2026, 9, 3);
  for (let i = 0; i < 20; i++) {
    const value = preview.fixture({ ...pair, model: `Model ${i}` }, "1d", now);
    assert.equal(new Date(value.floorHistory[0].date).getTime(), now - 86400000);
    assert.equal(value.floor.floorStatus === "estimated", value.floor.listedCount <= 1);
  }
  assert.equal(new Date(preview.fixture(pair, "1m", now).floorHistory[0].date).getTime(), now - 30 * 86400000);
});
test("preview USD values use the wallet's TON rate for consistent chart currency switching", () => {
  preview.setTonRate(1.51);
  const value = preview.fixture(pair);
  assert.equal(value.floor.floorUsd, value.floor.floorTon * 1.51);
  assert.equal(value.floorHistory.at(-1).priceUsd / 1.51, value.floor.floorTon);
  preview.setTonRate(0);
  assert.equal(preview.fixture(pair).floor.tonUsdRate, 1.51);
  preview.setTonRate(3.25);
});

test("visible gift provenance is neutral while internal preview markers remain explicit", () => {
  const value = preview.fixture(pair);
  assert.equal(value.floor.marketPlatform, "Reference");
  assert.ok(value.sales.every((sale) => sale.marketplace === "Reference"));
  assert.ok(value.preview && value.floor.preview);
  assert.equal(value.floorHistorySource, "mock-ui-preview");
  assert.ok(value.sales.every((sale) => sale.preview && sale.source === "mock-ui-preview"));
});

test("legacy cached preview provenance cannot expose mock-price wording in the UI", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const vm = require("node:vm");
  const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  const context = vm.createContext({});
  vm.runInContext(source.slice(source.indexOf("function marketSourceLabel("), source.indexOf("function identityAssetId(")), context);
  for (const label of ["Mock prices", "Mock UI preview", "mock-ui-preview", "UI Preview", "Preview market prices"]) {
    assert.equal(context.marketSourceLabel(label), "Reference");
  }
  assert.equal(context.marketSourceLabel("Getgems"), "Getgems");
  assert.match(source, /detail\.floorHistorySource === "mock-ui-preview" \? "Floor history"/);
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  assert.doesNotMatch(html, /UI preview\s*[·—-]|Mock gift prices|not live data/i);
});
