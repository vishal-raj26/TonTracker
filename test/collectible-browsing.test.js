"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync(require("node:path").join(__dirname, "..", "app.js"), "utf8");
const functions = source.slice(source.indexOf("function collectibleEmptyStateHtml("), source.indexOf("function sortAssets("));
const escapeHtml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
function context(select = {}) {
  const result = vm.createContext({ document: { getElementById: () => select }, escapeHtml });
  vm.runInContext(functions, result);
  return result;
}
const group = { id: "collection", collection: "Ice Creams", children: [
  { model: "Citrus", backdrop: "Steel: Grey", status: "Unlisted" },
  { traits: [{ label: "Model", value: "Beehive" }], status: "Listed" },
] };
test("filters inspect child direct fields and trait arrays without losing colon-bearing values", () => {
  const c = context();
  for (const filter of ["model:Beehive", "model:Citrus", "backdrop:Steel: Grey", "collection:Ice Creams"]) {
    assert.equal(c.filterAssets([group], filter)[0], group);
  }
  assert.equal(c.filterAssets([group], "model:Absent").length, 0);
  assert.equal(c.filterAssets([{ attributes: [{ trait_type: "Model", value: "Citrus" }] }], "model:Citrus").length, 1);
});
test("unknown listing status is neither listed nor unlisted", () => {
  const c = context();
  assert.equal(c.filterAssets([group, { id: "unknown" }], "listed").length, 1);
  assert.equal(c.filterAssets([group, { id: "unknown" }], "unlisted").length, 0);
  assert.equal(c.filterAssets([{ status: "Unlisted" }], "unlisted").length, 1);
});
test("both collectible searches include child formats, editions, traits and identifiers", () => {
  const text = context().collectibleSearchText({ name: "Brand", children: [{ name: "Pack #42", format: "Animated", edition: "Limited Drop", attributes: [{ trait_type: "Model", value: "Beehive" }] }] });
  for (const query of ["brand", "#42", "animated", "limited drop", "beehive"]) assert.ok(text.includes(query));
});
test("filters derive from actual holdings and preserve a selected option across refresh", () => {
  const select = { value: "model:Left wallet", dataset: {}, innerHTML: "", insertAdjacentHTML(_position, html) { this.innerHTML += html; } };
  const c = context(select);
  c.syncCollectibleFilterOptions("giftFilter", [group], "gift");
  assert.match(select.innerHTML, /model:Beehive/);
  assert.match(select.innerHTML, /backdrop:Steel: Grey/);
  assert.doesNotMatch(select.innerHTML, /Hypnotoad|Diamond Ring/);
  assert.equal(select.value, "model:Left wallet");
  assert.match(select.innerHTML, /model:Left wallet/);
  const before = select.innerHTML;
  c.syncCollectibleFilterOptions("giftFilter", [group], "gift");
  assert.equal(select.innerHTML, before);
});
test("holding-derived option labels and values are escaped", () => {
  const select = { value: "all", dataset: {}, innerHTML: "" };
  context(select).syncCollectibleFilterOptions("giftFilter", [{ model: '<img onerror="x">' }], "gift");
  assert.doesNotMatch(select.innerHTML, /<img/);
  assert.match(select.innerHTML, /&lt;img/);
});
test("filtered empty states offer recovery; unfiltered empty states do not pretend a search failed", () => {
  const c = context();
  assert.match(c.collectibleEmptyStateHtml("gifts", true), /data-clear-collectible-filters="gifts"/);
  assert.doesNotMatch(c.collectibleEmptyStateHtml("stickers", false), /Try another|data-clear/);
});
test("searchable sheet scopes choices by field, preserves All, and matches case-insensitively", () => {
  const c = context();
  const options = [{ value: "all", label: "All Gifts" }, { value: "listed", label: "Listed" }, { value: "model:Beehive", label: "Model: Beehive" }, { value: "collection:Ice Creams", label: "Collection: Ice Creams" }];
  assert.deepEqual(Array.from(c.collectibleFilterChoices(options, "model")).map((x)=>x.value), ["all", "model:Beehive"]);
  assert.deepEqual(Array.from(c.collectibleFilterChoices(options, "model", " BEE ")).map((x)=>x.value), ["model:Beehive"]);
  assert.deepEqual(Array.from(c.collectibleFilterChoices(options, "status")).map((x)=>x.value), ["all", "listed"]);
});
test("native modal tracks selected field, locks scrolling and restores opener state/focus", () => {
  const input = { value: "old", focus() { this.focused = true; } };
  const title = { textContent: "" };
  const sheet = { dataset: { bound: "1" }, open: false, querySelector: (s)=>s === "input" ? input : s === "h2" ? title : null, showModal() { this.open = true; }, close() { this.open = false; } };
  const select = { value: "listed" };
  const opener = { isConnected: true, setAttribute(k,v) { this[k]=v; }, focus() { this.focused = true; } };
  const c = context();
  c.document = { body: { style: { overflow: "auto" } }, getElementById: (id)=> id === "giftFilter" ? select : sheet };
  c.renderCollectibleFilterSheet = () => {};
  c.openCollectibleFilterSheet("giftFilter", opener);
  assert.equal(sheet.open, true);
  assert.equal(vm.runInContext("collectibleFilterSheetState.field", c), "status");
  assert.equal(input.value, "");
  assert.equal(input.focused, true);
  assert.equal(c.document.body.style.overflow, "hidden");
  assert.equal(opener["aria-expanded"], "true");
  c.closeCollectibleFilterSheet();
  assert.equal(c.document.body.style.overflow, "auto");
  assert.equal(opener["aria-expanded"], "false");
  assert.equal(opener.focused, true);
});

test("filter sheet wraps keyboard focus at both boundaries, excluding hidden controls", () => {
  const c = context();
  const control = (visible = true) => ({ getClientRects: () => visible ? [{}] : [], focus() { c.document.activeElement = this; } });
  const first = control(), middle = control(), last = control(), hidden = control(false);
  const sheet = { querySelectorAll: () => [hidden, first, middle, last, hidden] };
  let prevented = 0;
  const press = (key, shiftKey) => c.containCollectibleFilterFocus({ key, shiftKey, currentTarget: sheet, preventDefault() { prevented++; } });
  c.document.activeElement = first;
  press("Tab", true);
  assert.equal(c.document.activeElement, last);
  press("Tab", false);
  assert.equal(c.document.activeElement, first);
  c.document.activeElement = middle;
  press("Tab", false);
  press("Escape", true);
  assert.equal(c.document.activeElement, middle);
  assert.equal(prevented, 2);
});
