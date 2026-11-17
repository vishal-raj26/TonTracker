"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { selectSample, auditHistory } = require("../scripts/diagnose-username-prior-bid-cycles");

test("cycle diagnostic reproduces the fixed exposed-history pilot selection", () => {
  const directory = path.resolve(__dirname, "../research/telegram-usernames/data");
  const comparison = JSON.parse(fs.readFileSync(path.join(directory,
    "username-secondary-own-history-v25-comparison-2026-09-27.json"), "utf8"));
  const features = JSON.parse(fs.readFileSync(path.join(directory,
    "username-secondary-own-history-features-2026-09-27.json"), "utf8"));
  const sample = selectSample(comparison, features);
  assert.equal(sample.length, 24);
  assert.equal(new Set(sample.map(row => row.nftAddress)).size, 24);
});

test("cycle diagnostic requires genesis and an unbroken account transaction chain", () => {
  const address = `0:${"a".repeat(64)}`;
  const target = { nftAddress: address, username: "example", eventTime: "2024-01-03T00:00:00Z" };
  const success = { aborted: false, compute_ph: { success: true }, action: { success: true } };
  const first = { account: address, hash: "first", lt: "1", prev_trans_lt: "0", now: 1704067200,
    description: success, in_msg: { opcode: "0x299a3e15" } };
  const start = { account: address, hash: "start", lt: "2", prev_trans_lt: "1", prev_trans_hash: "first",
    now: 1704153600, description: success,
    in_msg: { message_content: { decoded: { "@type": "teleitem_msg_start_auction" } } } };
  const topup = { account: address, hash: "topup", lt: "3", prev_trans_lt: "2", prev_trans_hash: "start",
    now: 1704153660, description: success,
    in_msg: { opcode: null, message_content: { decoded: { "@type": "empty_cell" } } },
    account_state_before: { data_hash: "before" }, account_state_after: { data_hash: "before" } };
  const result = auditHistory([topup, first, start], target);
  assert.equal(result.complete, true);
  assert.equal(result.successfulAuctionStarts, 1);
  assert.equal(result.successfulPlainAfterLatestStart, 1);
  assert.equal(result.changedStateAfterLatestStart, 0);
  assert.equal(auditHistory([first, { ...start, prev_trans_hash: "wrong" }, topup], target).complete, false);
  assert.equal(auditHistory([{ ...first, prev_trans_lt: "9" }, start, topup], target).complete, false);
});
