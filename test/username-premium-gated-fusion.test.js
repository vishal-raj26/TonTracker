"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {replay}=require("../scripts/replay-username-premium-gated-fusion");
test("premium gate changes only selected saved point estimates and verifies identity",()=>{
  const classifier={results:[{eventId:"a",nftAddress:"x",eventTime:"2024-01-01",actualUsd:1000,premiumProbability:.8},{eventId:"b",nftAddress:"y",eventTime:"2024-01-02",actualUsd:10,premiumProbability:.2}]};
  const valuation={results:[{eventId:"a",nftAddress:"x",eventTime:"2024-01-01",actualUsd:1000,baseline:{estimateUsd:100},globalFusion:{estimateUsd:500}},{eventId:"b",nftAddress:"y",eventTime:"2024-01-02",actualUsd:10,baseline:{estimateUsd:10},globalFusion:{estimateUsd:99}}]};
  const result=replay(classifier,valuation,[.5]);
  assert.equal(result.candidates[0].selected,1);
  assert.equal(result.candidates[0].metrics.ordinary.meanAbsoluteLogError,0);
  assert.equal(result.candidates[0].metrics.premium.medianFactorError,2);
  assert.throws(()=>replay(classifier,{results:[{...valuation.results[0],nftAddress:"wrong"},valuation.results[1]]},[.5]),/identity/);
});
