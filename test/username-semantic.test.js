"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { usernameSemanticProfile, usernameSemanticSimilarity } = require("../lib/username-semantic");

test("extracts reusable Telegram market concepts", () => {
  assert.deepEqual([...usernameSemanticProfile("buygram").categories].sort(), ["commerce", "ecosystem"]);
  assert.ok(usernameSemanticProfile("conviction").categories.includes("aspirational"));
  assert.deepEqual(usernameSemanticProfile("conviction").exactTerms, ["aspirational:conviction"]);
  assert.ok(usernameSemanticProfile("damxagent").categories.includes("technology"));
});

test("prefers concept overlap over accidental character overlap", () => {
  assert.ok(usernameSemanticSimilarity("buygram", "grammarket") >= 0.4);
  assert.equal(usernameSemanticSimilarity("conviction", "nanization"), 0);
  assert.equal(usernameSemanticSimilarity("damxscam", "damxagent"), 0);
});
