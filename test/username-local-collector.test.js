"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {pageSize,endTime,historicalMessageCount}=require("../scripts/collect-username-settlements-local");
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
test("local collector request size is bounded without changing default",()=>{
  assert.equal(pageSize([]),80);
  assert.equal(pageSize(["--page-size","10"]),10);
  for(const value of ["0","9","81","NaN","10.5",undefined])assert.throws(()=>pageSize(["--page-size",value]));
});
test("local collector validates an optional bounded historical window",()=>{
  assert.equal(endTime(["--until","2026-09-10T00:00:00Z"],"2026-09-01T00:00:00Z"),1788998400);
  assert.throws(()=>endTime(["--until","2026-08-01T00:00:00Z"],"2026-09-01T00:00:00Z"));
  assert.throws(()=>endTime(["--until","not-a-date"],"2026-09-01T00:00:00Z"));
});
test("local collector keeps the prospective cohort start isolated",()=>{
  const source=fs.readFileSync(path.join(__dirname,"../scripts/collect-username-settlements-local.js"),"utf8");
  assert.match(source,/2026-09-20T13:45:00Z/);
  assert.match(source,/current-username-settlements\$\{suffix\}/);
  assert.match(source,/-forward/);
});
test("time-offset recovery derives its exact offset from durable pages",()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),"username-offset-"));
  fs.writeFileSync(path.join(directory,"page-a.json"),JSON.stringify({metadata:{messages:80}}));
  fs.writeFileSync(path.join(directory,"page-b.json"),JSON.stringify({metadata:{messages:10}}));
  fs.writeFileSync(path.join(directory,"state.json"),"{}");
  assert.equal(historicalMessageCount(directory),90);
});
