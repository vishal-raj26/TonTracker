"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {FROM,DIRECTORY,until,pageSize}=require("../scripts/collect-username-secondary-local");
test("secondary collector is pinned to the prospective isolated window",()=>{assert.equal(FROM,"2026-09-20T14:00:00Z");assert.equal(DIRECTORY,"current-username-secondary-forward");
  assert.equal(pageSize([]),100);assert.equal(pageSize(["--page-size","10"]),10);assert.throws(()=>pageSize(["--page-size","9"]));
  assert.throws(()=>until(["--until","2026-09-20T13:59:59Z"]));assert.throws(()=>until([]));});
