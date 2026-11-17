"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createHistoricalVectorRetrieval, unitVector } = require("../lib/username-vector-retrieval");
const vector = (x, y) => [x, y, ...Array(48).fill(0)];
const knowledge = name => ({ observedAt: "2020-01-01", semanticVector: name === "far" ? vector(1, 1) : vector(1, 0) });
const sale = (username, day, priceUsd = 100) => ({ username, nftAddress: `contract:${username}`, eventId: `${username}:${day}`,
  eventTime: `2025-01-0${day}T00:00:00Z`, priceUsd, eventType: "sale", finalized: true, paymentAsset: "TON" });
const cutoff = Date.parse("2025-01-03");
test("vector retrieval uses only prior finalized sales and excludes own identity", () => {
  const rows = [sale("target", 1), sale("near", 1), sale("near", 2), sale("near", 3), sale("future", 4),
    { ...sale("cancelled", 1), cancelled: true }, sale("far", 1)];
  const result = createHistoricalVectorRetrieval(rows, { knowledge })({ username: "target", nftAddress: "contract:target" }, cutoff);
  assert.deepEqual(result.map(row => row.sale.username), ["near", "far"]);
  assert.equal(result[0].sale.eventId, "near:2");
});
test("prices cannot alter vector candidate ordering and future knowledge is excluded", () => {
  const rows = [sale("near", 1, 1), sale("far", 1, 100000)];
  const names = source => createHistoricalVectorRetrieval(source, { knowledge })({ username: "target" }, cutoff).map(row => row.sale.username);
  assert.deepEqual(names(rows), names(rows.map(row => ({ ...row, priceUsd: 1 / row.priceUsd }))));
  const future = createHistoricalVectorRetrieval(rows, { knowledge: name => ({ ...knowledge(name), observedAt: "2026-01-01" }) });
  assert.deepEqual(future({ username: "target" }, cutoff), []);
});
test("ambiguous contract/name mappings and invalid vectors cannot produce candidates", () => {
  const rows = [sale("near", 1), { ...sale("alias", 2), nftAddress: "contract:near" }];
  assert.deepEqual(createHistoricalVectorRetrieval(rows, { knowledge })({ username: "target" }, cutoff), []);
  const futureConflict = [sale("near", 1), { ...sale("alias", 4), nftAddress: "contract:near" }];
  assert.equal(createHistoricalVectorRetrieval(futureConflict, { knowledge })({ username: "target" }, cutoff).length, 1);
  assert.equal(unitVector(Array(50).fill(0)), null);
  assert.equal(unitVector(Array(50).fill(Infinity)), null);
  assert.equal(unitVector([1]), null);
});
