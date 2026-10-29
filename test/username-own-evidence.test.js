"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { ownEvidence } = require("../scripts/diagnose-username-own-evidence");
test("own evidence is contract-matched and strictly prior with no future ambiguity leak", () => {
  const sale = { username:"name", nftAddress:"a", eventId:"old", eventTime:"2024-01-01T00:00:00Z", priceUsd:100,
    eventType:"sale", finalized:true, paymentAsset:"ton" };
  const target = {username:"name",nftAddress:"a",eventTime:"2024-02-01T00:00:00Z"};
  const sales = [sale, {...sale,eventId:"same-time",eventTime:target.eventTime,priceUsd:999},
    {...sale,eventId:"future-alias",username:"different",eventTime:"2025-01-01T00:00:00Z"},
    {...sale,eventId:"wrong-contract",nftAddress:"b",priceUsd:888}];
  const [result] = ownEvidence(sales, [target]);
  assert.equal(result.priorOwnUsd,100);
  assert.equal(result.ownCount,1);
  assert.equal(ownEvidence(sales,[{...target,nftAddress:"c"}])[0].ownStatus,"absent");
  assert.equal(ownEvidence(sales,[{...target,eventTime:"2026-01-01T00:00:00Z"}])[0].ownStatus,"ambiguous");
});
