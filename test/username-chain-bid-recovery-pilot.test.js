"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {selectPilot} = require("../scripts/collect-username-chain-bid-recovery-pilot");
const {bidLifecycleEvidence} = require("../lib/username-auction-bid-evidence");
const {USERNAME_COLLECTION} = require("../lib/username-collection");

test("chain recovery pilot is balanced and excludes already exposed bids", () => {
  const source = [];
  const audit = [];
  for (const [stratum, actualUsd] of [["premium-all", 600], ["ordinary-control", 50]]) {
    for (let index = 0; index < 3; index += 1) {
      const eventId = `${stratum}-${index}`;
      source.push({eventId, priceNative: index + 1, actualUsd});
      audit.push({eventId, stratum, matchingPublicSale: true, status: index === 2 ? "prior-bids-observed" : "no-prior-bids-observed"});
    }
  }
  const selected = selectPilot(audit, source, 2);
  assert.equal(selected.length, 4);
  assert.equal(selected.filter(row => row.stratum === "premium-all").length, 2);
  assert.equal(selected.filter(row => row.stratum === "ordinary-control").length, 2);
  assert.ok(selected.every(row => row.status !== "prior-bids-observed"));
});

test("bid lifecycle accepts successful empty transfers and rejects aborted bids", () => {
  const nftAddress = `0:${"a".repeat(64)}`, bidder = `0:${"b".repeat(64)}`;
  const success = {aborted:false,compute_ph:{success:true},action:{success:true}};
  const initial = {now:100,hash:"initial",account:nftAddress,description:success,in_msg:{source:USERNAME_COLLECTION,destination:nftAddress,bounced:false,opcode:"0x299a3e15",message_content:{decoded:{"@type":"teleitem_msg_deploy",sender_address:{"@type":"addr_std",workchain_id:"0",address:"b".repeat(64)},bid:{amount:{value:"10000000000"}},token_info:{name:{text:Buffer.from("rare").toString("hex")}},auction_config:{duration:"604800"}}}}};
  const later = (now, value, aborted=false) => ({now,hash:`bid-${now}`,account:nftAddress,description:{...success,aborted,compute_ph:{success:!aborted}},in_msg:{source:bidder,destination:nftAddress,opcode:null,value:String(value),message_content:{decoded:{"@type":"empty_cell"}}}});
  const result = bidLifecycleEvidence([initial,later(200,11e9),later(250,12e9,true),later(300,13e9)],{nftAddress,username:"rare"},{cutoff:400000,observedAt:"2026-09-19T00:00:00Z"});
  assert.deepEqual(result.bids.map(row=>row.amountNano),["10000000000","11000000000","13000000000"]);
  assert.equal(result.latestBid.amountNano,"13000000000");
});
