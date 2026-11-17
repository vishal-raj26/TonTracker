"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),path=require("node:path"),crypto=require("node:crypto");
const {auditDirectory}=require("../scripts/audit-reserved-username-collection");
test("reserved audit emits identities and hashes, not valuation labels, and detects tampering",()=>{
  const from="2026-09-01T00:00:00Z";
  const bytes=Buffer.from(JSON.stringify({from,sales:[{saleId:"event",assetKind:"username",assetKey:"asset",soldAt:"2026-09-02T00:00:00Z",priceUsd:12345}]}));
  const state={from,latestPage:"page-one.json",latestPageSha256:crypto.createHash("sha256").update(bytes).digest("hex"),cursor:{}};
  const io={readdirSync:()=>["state.json","page-one.json"],readFileSync:file=>path.basename(file)==="state.json"?JSON.stringify(state):bytes};
  const report=auditDirectory("test",io);
  assert.equal(report.uniqueEvents,1);
  assert.equal(report.uniqueAssets,1);
  assert.equal(JSON.stringify(report).includes('priceUsd'),false);
  state.latestPageSha256="invalid";
  assert.throws(()=>auditDirectory("test",io),/checksum/);
});
