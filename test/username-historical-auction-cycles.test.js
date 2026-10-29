"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { USERNAME_COLLECTION } = require("../lib/username-collection");
const { verifyHistoricalAuctionCycles } = require("../lib/username-historical-auction-cycles");

const nft = `0:${"a".repeat(64)}`;
const bidder = `0:${"b".repeat(64)}`;
const success = { aborted: false, compute_ph: { success: true }, action: { success: true } };
const config = { "@type": "teleitem_auction_config",
  initial_min_bid: { amount: { value: "2000000000" } },
  max_bid: { amount: { value: "0" } }, min_bid_step: "5", min_extend_time: "3600", duration: "604800" };
const target = { nftAddress: nft, username: "example" };
const options = { cutoff: 2800000 * 1000, observedAt: "2026-09-28T00:00:00Z" };

function initial() {
  return { account: nft, hash: "deploy", lt: "1", prev_trans_lt: "0", now: 1000000,
    description: success, in_msg: { source: USERNAME_COLLECTION, destination: nft,
      opcode: "0x299a3e15", bounced: false, message_content: { decoded: {
        "@type": "teleitem_msg_deploy", token_info: { name: { text: Buffer.from("example").toString("hex") } },
        sender_address: { "@type": "addr_std", workchain_id: "0", address: "b".repeat(64) },
        bid: { amount: { value: "3000000000" } }, auction_config: config } } } };
}
function start(previous = initial()) {
  return { account: nft, hash: "restart", lt: "2", prev_trans_lt: previous.lt, prev_trans_hash: previous.hash,
    now: 2000000, description: success, account_state_before: { data_hash: "old" },
    account_state_after: { data_hash: "new" },
    in_msg: { source: bidder, destination: nft, opcode: "0x487a8e81", message_content: { decoded: {
      "@type": "teleitem_msg_start_auction", auction_config: config } } } };
}
function plain(previous, now, value, changed = true) {
  return { account: nft, hash: `plain-${now}`, lt: String(BigInt(previous.lt) + 1n),
    prev_trans_lt: previous.lt, prev_trans_hash: previous.hash, now, description: success,
    account_state_before: { data_hash: "before" }, account_state_after: { data_hash: changed ? "after" : "before" },
    in_msg: { source: bidder, destination: nft, bounced: false, opcode: null, value: String(value),
      message_content: { decoded: { "@type": "empty_cell" } } } };
}

test("segments restarted auctions and excludes later successful plain top-ups", () => {
  const deploy = initial(), restart = start(deploy), bid = plain(restart, 2000100, 2e9);
  const topup = plain(bid, 2700000, 10e9, false);
  const result = verifyHistoricalAuctionCycles([topup, bid, deploy, restart], target, options);
  assert.equal(result.accountChainComplete, true);
  assert.equal(result.cycles.length, 2);
  assert.deepEqual(result.cycles.map(cycle => cycle.bids.map(row => row.amountNano)),
    [["3000000000"], ["2000000000"]]);
  assert.equal(result.ignoredAfterAuction, 1);
  assert.equal(result.valuationEligible, false);
  assert.equal(result.portfolioEligible, false);
});

test("fails closed on gaps, unproved state change and below-minimum in-cycle transfers", () => {
  const deploy = initial(), restart = start(deploy), bid = plain(restart, 2000100, 2e9);
  assert.throws(() => verifyHistoricalAuctionCycles([deploy, { ...restart, prev_trans_hash: "wrong" }, bid], target, options),
    /predecessor gap/);
  assert.throws(() => verifyHistoricalAuctionCycles([deploy, restart, plain(restart, 2000100, 2e9, false)], target, options),
    /state-change proof/);
  assert.throws(() => verifyHistoricalAuctionCycles([deploy, restart, plain(restart, 2000100, 1e9)], target, options),
    /below reconstructed minimum/);
  assert.throws(() => verifyHistoricalAuctionCycles([deploy, { ...restart,
    account_state_after: { data_hash: "old" } }], target, options), /state-change proof/);
});

test("extends the in-cycle end and closes a maximum bid without turning later top-up into a bid", () => {
  const deploy = initial(), restart = start(deploy);
  const atEnd = plain(restart, 2604700, 2e9);
  const extended = plain(atEnd, 2606000, 3e9);
  const result = verifyHistoricalAuctionCycles([deploy, restart, atEnd, extended], target, options);
  assert.equal(result.cycles[1].bids.length, 2);
  assert.ok(Date.parse(result.cycles[1].scheduledEnd) > 2606000 * 1000);
  const maxStart = { ...restart, in_msg: { ...restart.in_msg, message_content: { decoded: {
    "@type": "teleitem_msg_start_auction", auction_config: { ...config,
      max_bid: { amount: { value: "2000000000" } } } } } } };
  const maxBid = plain(maxStart, 2000100, 2e9), after = plain(maxBid, 2000200, 5e9, false);
  const capped = verifyHistoricalAuctionCycles([deploy, maxStart, maxBid, after], target, options);
  assert.equal(capped.cycles[1].closedByMaximum, true);
  assert.equal(capped.cycles[1].bids.length, 1);
  assert.equal(capped.ignoredAfterAuction, 1);
});

test("only a successful, state-changing no-bid cancellation permits an early restart", () => {
  const deploy = initial(), restart = start(deploy);
  const cancel = { account: nft, hash: "cancel", lt: "3", prev_trans_lt: "2", prev_trans_hash: "restart",
    now: 2000200, description: success, account_state_before: { data_hash: "before-cancel" },
    account_state_after: { data_hash: "after-cancel" }, in_msg: { source: bidder, destination: nft,
      opcode: "0x371638ae", message_content: { decoded: { "@type": "teleitem_msg_cancel_auction" } } } };
  const again = { ...start(cancel), hash: "again", lt: "4", now: 2000300 };
  const result = verifyHistoricalAuctionCycles([deploy, restart, cancel, again], target, options);
  assert.equal(result.cycles.length, 3);
  assert.equal(result.cycles[1].cancelled, true);
  assert.throws(() => verifyHistoricalAuctionCycles([deploy, restart,
    { ...cancel, account_state_after: { data_hash: "before-cancel" } }, again], target, options),
  /cancellation lacks cycle\/state proof/);
  const bid = plain(restart, 2000100, 2e9);
  assert.throws(() => verifyHistoricalAuctionCycles([deploy, restart, bid,
    { ...cancel, lt: "4", prev_trans_lt: "3", prev_trans_hash: bid.hash }], target, options),
  /cancellation lacks cycle\/state proof/);
});
