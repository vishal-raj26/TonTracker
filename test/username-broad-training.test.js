"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { selectTraining } = require("../scripts/export-username-broad-training");
test("broad training is strictly earlier, finalized native, economically deduplicated", () => {
  const sale = {username:"example",nftAddress:"a",eventId:"1",eventTime:"2024-01-01T00:00:00.000Z",priceUsd:10,eventType:"sale",finalized:true,paymentAsset:"ton",reliabilityScore:.8};
  const cutoff = "2024-02-01T00:00:00.000Z";
  const rows = selectTraining([sale,{...sale,eventId:"duplicate"},{...sale,eventId:"same-time",eventTime:cutoff},
    {...sale,eventId:"future",eventTime:"2025-01-01T00:00:00.000Z"},
    {...sale,nftAddress:"bad",paymentAsset:"usdt"}], cutoff, 30000);
  assert.deepEqual(rows,[sale]);
});
