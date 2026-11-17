"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {quoteUsernameActiveAuction,upperFactor}=require("../lib/username-active-auction-nowcast");
const now=Date.parse("2026-09-20T10:00:00Z"),state={schemaVersion:"username-verified-auction-state-v1",status:"active",username:"rare",nftAddress:`0:${"a".repeat(64)}`,
  identityVerified:true,independentlyConfirmed:true,nowcastEligible:true,portfolioEligible:false,currentBidGram:100,observedAt:"2026-09-20T09:59:50Z",staleAt:"2026-09-20T10:00:50Z",endTime:"2026-09-20T11:00:00Z"};
test("quotes only a fresh independently verified nonzero auction bid",()=>{
  const quote=quoteUsernameActiveAuction(state,{gramUsdRate:2.5,now});assert.equal(quote.estimateUsd,250);assert.equal(quote.rangeLowUsd,250);assert.equal(quote.rangeHighUsd,262.5);assert.equal(quote.portfolioEligible,false);
  assert.equal(quoteUsernameActiveAuction({...state,currentBidGram:0,nowcastEligible:false},{gramUsdRate:2.5,now}).status,"unavailable");
  assert.equal(quoteUsernameActiveAuction(state,{gramUsdRate:2.5,now:Date.parse(state.staleAt)}).status,"unavailable");
});
test("predeclared auction uncertainty contracts toward closure",()=>{
  assert.deepEqual([upperFactor(48),upperFactor(12),upperFactor(3),upperFactor(.5)],[4.7,2,1.8,1.05]);
});
