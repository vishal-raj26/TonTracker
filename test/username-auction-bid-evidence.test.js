"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { parseBidHistory } = require("../lib/username-auction-bid-evidence");
const { initialBidEvidence } = require("../lib/username-auction-bid-evidence");
const { USERNAME_COLLECTION } = require("../lib/username-collection");
function row(time, amount) { return `<tr><div class="icon-ton">${amount}</div><time datetime="${time}"></time><a href="https://tonviewer.com/bidder">bidder</a></tr>`; }
test("bid parser isolates bid section, excludes cutoff/future, never returns a sale", () => {
  const cutoff = Date.parse("2024-03-26T00:00:00Z");
  const html = `<section><h3>Ownership History</h3>${row("2024-03-01",999)}</section><section><h3>Bid History</h3>${row("2024-03-19",104)}${row("2024-03-26",200)}${row("2025-01-01",300)}</section>`;
  const result = parseBidHistory(html, cutoff);
  assert.equal(result.bids.length,1);
  assert.equal(result.bids[0].priceNative,104);
  assert.equal(result.bids[0].eventType,"bid");
  assert.equal(result.bids[0].settlementVerified,false);
  assert.equal(parseBidHistory("",cutoff).status,"not-exposed");
});
test("initial chain bid requires successful execution and exact collection/contract/name; never publishes", () => {
  const account = "0:"+"a".repeat(64), bidder = "0:"+"b".repeat(64);
  const target = {nftAddress:account,username:"example",bid:{eventTime:"2024-01-01T00:00:00.000Z",priceNative:104,bidderAddress:bidder}};
  const options = {cutoff:Date.parse("2024-01-02"),observedAt:"2026-09-09T00:00:00Z"};
  const tx = {account,hash:"proof",now:1704067200,description:{aborted:false,compute_ph:{success:true},action:{success:true}},
    in_msg:{source:USERNAME_COLLECTION,destination:account,opcode:"0x299a3e15",message_content:{decoded:{"@type":"teleitem_msg_deploy",
      token_info:{name:{text:Buffer.from("example").toString("hex")}},bid:{amount:{value:"104000000000"}},auction_config:{duration:604800},
      sender_address:{"@type":"addr_std",workchain_id:"0",address:"b".repeat(64)}}}}};
  const proof = initialBidEvidence(tx,target,options);
  assert.equal(proof.amountNano,"104000000000");
  assert.equal(proof.auctionStatus,"unknown-after-initial-bid");
  assert.equal(proof.valuationEligible,false);
  assert.equal(proof.settlementVerified,false);
  assert.equal(initialBidEvidence(tx,{...target,username:"other"},options),null);
  assert.equal(initialBidEvidence({...tx,description:{...tx.description,aborted:true}},target,options),null);
  assert.equal(initialBidEvidence({...tx,in_msg:{...tx.in_msg,source:bidder}},target,options),null);
  assert.equal(initialBidEvidence(tx,target,{...options,cutoff:1704067200000}),null);
  assert.equal(initialBidEvidence(tx,{...target,bid:{...target.bid,priceNative:105}},options),null);
});
