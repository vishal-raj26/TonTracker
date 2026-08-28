"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { normalizeTonCenterActions } = require("../server");

const wallet = "0:" + "1".repeat(64);
const other = "0:" + "2".repeat(64);

test("normalizes collectible transfers alongside token activity", async () => {
  const rows = await normalizeTonCenterActions([{
    type: "nft_transfer",
    action_id: "nft-1",
    trace_id: "trace-1",
    success: true,
    end_utime: 1_700_000_000,
    details: {
      source: other,
      destination: wallet,
      nft: { metadata: { name: "Diamond Ring", image: "https://example.test/gift.png" } },
    },
  }], wallet, 2);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].actions[0].simplePreview.name, "Diamond Ring");
  assert.equal(rows[0].actions[0].simplePreview.value, "1 collectible");
  assert.equal(rows[0].actions[0].simplePreview.direction, "Received");
});

test("normalizes first-visible native activity as GRAM without optional metadata work", async () => {
  const started = Date.now();
  const rows = await normalizeTonCenterActions([{
    type: "ton_transfer",
    action_id: "gram-1",
    trace_id: "trace-gram-1",
    success: true,
    end_utime: 1_700_000_000,
    details: { source: other, destination: wallet, value: "1000000000" },
  }], wallet, 2, { enrichMetadata: false });
  assert.ok(Date.now() - started < 500, "first visible activity must not wait for metadata endpoints");
  assert.equal(rows.length, 1);
  assert.match(rows[0].actions[0].simplePreview.value, /GRAM/);
  assert.doesNotMatch(rows[0].actions[0].simplePreview.value, /TON/);
});
