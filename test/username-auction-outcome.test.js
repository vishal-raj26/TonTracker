"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {classifyUsernameAuctionOutcome}=require("../lib/username-auction-outcome");
const address=`0:${"a".repeat(64)}`,bidder=`0:${"b".repeat(64)}`;
const snapshot={nftAddress:address,state:{status:"active",currentBidNano:"0",observedAt:"2026-09-19T10:00:00Z",endTime:"2026-09-19T10:05:00Z"}};

test("classifies only complete zero-bid evidence as unsold",()=>{
  const result=classifyUsernameAuctionOutcome(snapshot,{events:[],transactions:[],providersComplete:true,observedAt:"2026-09-19T10:06:00Z"});
  assert.equal(result.status,"unsold-no-bid-observed");
  assert.equal(classifyUsernameAuctionOutcome(snapshot,{providersComplete:false,observedAt:"2026-09-19T10:06:00Z"}).status,"indeterminate");
});
test("a later successful bid prevents an unsold inference",()=>{
  const transactions=[{now:Math.floor(Date.parse("2026-09-19T10:03:00Z")/1000),hash:"bid",account:address,
    description:{aborted:false,compute_ph:{success:true},action:{success:true}},
    in_msg:{source:bidder,destination:address,opcode:null,value:"2000000000",message_content:{decoded:{"@type":"empty_cell"}}}}];
  const result=classifyUsernameAuctionOutcome(snapshot,{events:[],transactions,providersComplete:true,observedAt:"2026-09-19T10:06:00Z"});
  assert.equal(result.status,"indeterminate");assert.equal(result.laterBids.length,1);
});
test("accepts a sale only with an independently verified settlement",()=>{
  const sale={eventTime:"2026-09-19T10:05:02Z",priceGram:20,eventId:"sale"};
  assert.equal(classifyUsernameAuctionOutcome(snapshot,{events:[sale],transactions:[],providersComplete:true,observedAt:"2026-09-19T10:06:00Z"}).status,"indeterminate");
  assert.equal(classifyUsernameAuctionOutcome(snapshot,{events:[sale],transactions:[],settlementVerification:{verified:true},providersComplete:true,observedAt:"2026-09-19T10:06:00Z"}).status,"sold");
});
