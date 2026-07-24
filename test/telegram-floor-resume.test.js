const test = require("node:test");
const assert = require("node:assert/strict");

const { resumeIndexFromStatus, telegramPaginationComplete, attributeIdByName } = require("../scripts/snapshot-telegram-floors");

const gifts = [
  { title: "Liberty Figure" },
  { title: "Chill Flame" },
  { title: "Vice Cream" },
];

test("Telegram floor scan retries an interrupted collection", () => {
  assert.equal(resumeIndexFromStatus({ phase: "collection_scanning", collection_name: "Chill Flame" }, gifts), 1);
  assert.equal(resumeIndexFromStatus({ phase: "collection_failed", collection_name: "Chill Flame" }, gifts), 1);
  assert.equal(resumeIndexFromStatus({ phase: "cycle_resumed", collection_name: "Chill Flame" }, gifts), 1);
});

test("Telegram floor scan advances after an uploaded collection", () => {
  assert.equal(resumeIndexFromStatus({ phase: "collection_complete", collection_name: "Chill Flame" }, gifts), 2);
  assert.equal(resumeIndexFromStatus({ phase: "cycle_complete", collection_name: "Vice Cream" }, gifts), 0);
});

test("Telegram floor scan rejects partial pagination", () => {
  assert.equal(telegramPaginationComplete(4973, 4972), true);
  assert.equal(telegramPaginationComplete(4973, 4950), false);
  assert.equal(telegramPaginationComplete(4973, 4973), true);
  assert.equal(telegramPaginationComplete(0, 0), true);
});

test("Telegram floor targets resolve model and backdrop IDs by normalized name", () => {
  const modelId = { toString: () => "123" };
  const models = new Map([[modelId, { name: "Steve" }]]);
  const backdrops = new Map([[46, { name: "Burgundy" }]]);
  assert.equal(attributeIdByName(models, "Steve"), modelId);
  assert.equal(attributeIdByName(backdrops, "Burgundy"), 46);
  assert.equal(attributeIdByName(models, "Missing"), null);
});
