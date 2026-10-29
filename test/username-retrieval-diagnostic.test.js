"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { historicalNeighbors } = require("../scripts/diagnose-username-retrieval");
const { createHistoricalUsernameRetrieval } = require("../lib/username-historical-retrieval");
test("semantic retrieval requires prior knowledge and strictly earlier completed sales", () => {
  const sale = { username: "illness", eventTime: "2024-01-01", priceUsd: 20, eventType: "sale" };
  const rows = [sale, { ...sale, eventTime: "2025-01-01" }, { ...sale, username: "malady", eventType: "transfer" }];
  const knowledge = () => ({ observedAt: "2023-01-01", relatedTerms: ["illness", "malady"] });
  const retrieve = createHistoricalUsernameRetrieval(rows, { lexical: false, knowledge });
  assert.deepEqual(retrieve("sickness", Date.parse("2025-01-01")), [sale]);
  assert.deepEqual(retrieve("sickness", Date.parse("2023-01-01")), []);
  assert.deepEqual(retrieve("sickness", NaN), []);
  assert.deepEqual(createHistoricalUsernameRetrieval(rows, { lexical: false,
    knowledge: () => ({ observedAt: "2026-01-01", relatedTerms: ["illness"] }),
  })("sickness", Date.parse("2025-01-01")), []);
});
test("retrieval diagnostics exclude future and same-time events and do not rank by price", () => {
  const target = { username: "example", eventTime: "2025-01-02" };
  const row = { username: "examples", eventTime: "2025-01-01", priceUsd: 20, eventType: "sale" };
  const rows = [row, { ...row, username: "example", eventTime: "2025-01-02" },
    { ...row, username: "example", eventTime: "2025-01-03" }];
  const result = historicalNeighbors(target, rows);
  assert.deepEqual(result.map(row => row.username), ["examples"]);
  assert.deepEqual(historicalNeighbors(target, rows.map(row => ({ ...row, priceUsd: 99999 }))).map(row => row.username), ["examples"]);
});
test("indexed historical retrieval uses strictly earlier evidence without changing ranking by price", () => {
  const sale = { username: "examples", eventTime: "2025-01-01", priceUsd: 20, eventType: "sale" };
  const older = { ...sale, username: "examplet", eventTime: "2024-01-01", priceUsd: 5000 };
  const rows = [sale, older, { ...sale, eventTime: "2025-01-02", priceUsd: 2000 },
    { ...sale, username: "examplez", eventTime: "2025-01-03" }];
  const retrieve = createHistoricalUsernameRetrieval(rows);
  assert.deepEqual(retrieve("example", Date.parse("2025-01-02")), [sale, older]);
  assert.deepEqual(createHistoricalUsernameRetrieval(rows.map(row => ({ ...row, priceUsd: 999 })))
    ("example", Date.parse("2025-01-02")).map(row => row.username), ["examples", "examplet"]);
});
