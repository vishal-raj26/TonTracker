"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { FOLDS, fixedSaleTargets, developmentSample } = require("../scripts/evaluate-username-secondary-development");

test("secondary development folds are fixed, disjoint, and target only completed fixed resale", () => {
  for (let index = 1; index < FOLDS.length; index += 1) assert.ok(Date.parse(FOLDS[index - 1].until) <= Date.parse(FOLDS[index].from));
  const fold = FOLDS[0];
  const row = (overrides = {}) => ({ marketStage: "secondary", saleType: "sale", eventTime: fold.from, ...overrides });
  assert.deepEqual(fixedSaleTargets([
    row({ id: "accepted" }),
    row({ id: "primary", marketStage: "primary" }),
    row({ id: "auction", saleType: "auction" }),
    row({ id: "before", eventTime: "2024-09-30T23:59:59Z" }),
    row({ id: "exclusive-end", eventTime: fold.until }),
  ], fold).map((value) => value.id), ["accepted"]);
});

test("development sample retains every premium and intermediate case with deterministic ordinary controls", () => {
  const ordinary = Array.from({ length: 120 }, (_, index) => ({ eventId: `ordinary-${index}`, priceUsd: 10,
    eventTime: "2025-01-01T00:00:00Z" }));
  const rows = [...ordinary, { eventId: "mid", priceUsd: 200, eventTime: "2025-01-01T00:00:01Z" },
    { eventId: "premium", priceUsd: 1000, eventTime: "2025-01-01T00:00:02Z" }];
  const selected = developmentSample(rows);
  assert.equal(selected.length, 102);
  assert.ok(selected.some((row) => row.eventId === "mid"));
  assert.ok(selected.some((row) => row.eventId === "premium"));
  assert.deepEqual(selected.map((row) => row.eventId), developmentSample(rows.slice().reverse()).map((row) => row.eventId));
});
