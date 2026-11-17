"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {selectTargets}=require("../scripts/collect-username-development-bids-expanded");
test("expanded bid audit selects every premium and an equal disjoint ordinary control",()=>{
  const rows=[...Array.from({length:3},(_,i)=>({eventId:`p${i}`,actualUsd:500+i})),
    ...Array.from({length:5},(_,i)=>({eventId:`o${i}`,actualUsd:10+i})),{eventId:"mid",actualUsd:200}];
  const selected=selectTargets(rows),premium=selected.filter(row=>row.stratum==="premium-all"),ordinary=selected.filter(row=>row.stratum==="ordinary-control");
  assert.equal(premium.length,3);assert.equal(ordinary.length,3);
  assert.deepEqual(new Set(premium.map(row=>row.eventId)),new Set(["p0","p1","p2"]));
  assert.equal(new Set(selected.map(row=>row.eventId)).size,6);
  assert.ok(ordinary.every(row=>row.actualUsd<100));
});
