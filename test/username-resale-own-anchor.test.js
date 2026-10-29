"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { summarize } = require("../scripts/diagnose-username-resale-own-anchor");

test("resale own-anchor diagnostic retains absent cases and compares only matched own-covered outcomes", () => {
  const rows = [
    { nftAddress: "a", realizedVenue: "secondary/auction", actualUsd: 1000,
      ownStatus: "available", priorOwnUsd: 500, baseUsd: 100 },
    { nftAddress: "b", realizedVenue: "secondary/sale", actualUsd: 10,
      ownStatus: "available", priorOwnUsd: 20, baseUsd: 10 },
    { nftAddress: "c", realizedVenue: "secondary/auction", actualUsd: 1000,
      ownStatus: "absent", priorOwnUsd: null, baseUsd: 100 },
  ];
  const result = summarize(rows);
  assert.equal(result["secondary/premium"].attempts, 2);
  assert.equal(result["secondary/premium"].ownAvailable, 1);
  assert.equal(result["secondary/premium"].ownAbsent, 1);
  assert.equal(result["secondary/premium"].lastOwnCovered.samples, 1);
  assert.equal(result["secondary/premium"].allStageAll.samples, 2);
  assert.equal(result["secondary/ordinary"].lastOwnCovered.meanAbsoluteLogError,
    Math.log(2));
  assert.equal(result["primary/all"].attempts, 0);
});
