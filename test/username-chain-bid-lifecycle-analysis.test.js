"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {analyze}=require("../scripts/analyze-username-chain-bid-lifecycles-expanded");
test("lifecycle analysis measures only bids available at each quote horizon",()=>{
  const eventTime="2025-01-10T00:00:00Z",source=[{eventId:"a",username:"rare",actualUsd:600,baseUsd:60}];
  const audit=[{eventId:"a",username:"rare",stratum:"premium-all",eventTime,saleNative:100,status:"verified-bid-lifecycle",latestBidMatchesSale:true,bids:[
    {eventTime:"2025-01-08T00:00:00Z",amountNano:"10000000000"},{eventTime:"2025-01-09T22:00:00Z",amountNano:"100000000000"}]}];
  const result=analyze({eventIds:["a"]},audit,source).strata.premium;
  assert.equal(result.horizons.find(row=>row.hoursBeforeSale===24).medianFactorError,10);
  assert.equal(result.horizons.find(row=>row.hoursBeforeSale===1).medianFactorError,1);
  assert.equal(result.horizons.find(row=>row.hoursBeforeSale===1).meanAbsoluteLogError,0);
});
test("lifecycle analysis refuses partial audit",()=>assert.throws(()=>analyze({eventIds:["a"]},[],[]),/Incomplete/));
