"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync(require("node:path").join(__dirname, "..", "app.js"), "utf8");
const helpers = source.slice(source.indexOf("const productPreviewSessions ="), source.indexOf("function openGiftPfpTray("));
function setup() {
  const opener = { isConnected: true, focusCount: 0, setAttribute(k, v) { this[k] = v; }, focus() { this.focusCount++; } };
  const closeButton = { focusCount: 0, focus() { this.focusCount++; } };
  const listeners = {};
  const classes = new Set();
  const dialog = { open: false, dataset: {}, classList: { add: x => classes.add(x), remove: x => classes.delete(x) },
    addEventListener(k, fn) { listeners[k] = fn; }, querySelector: () => closeButton,
    showModal() { this.open = true; }, close() { this.open = false; },
    getBoundingClientRect: () => ({ left: 10, right: 100, top: 100, bottom: 300 }) };
  const c = vm.createContext({ document: { body: { style: { overflow: "auto" } }, activeElement: opener }, containCollectibleFilterFocus() {} });
  vm.runInContext(helpers, c);
  return { c, dialog, opener, closeButton, listeners, classes };
}
test("preview native modal locks scroll, focuses dismissal and restores the exact opener once", () => {
  const { c, dialog, opener, closeButton, listeners, classes } = setup();
  c.openProductPreview(dialog, opener);
  assert.equal(dialog.open, true);
  assert.equal(c.document.body.style.overflow, "hidden");
  assert.equal(opener["aria-expanded"], "true");
  assert.equal(closeButton.focusCount, 1);
  c.closeProductPreview(dialog);
  listeners.close(); // Browser close event is queued; cleanup must be idempotent.
  assert.equal(c.document.body.style.overflow, "auto");
  assert.equal(opener["aria-expanded"], "false");
  assert.equal(opener.focusCount, 1);
  assert.equal(classes.has("is-open"), false);
});
test("Escape and backdrop dismiss, while clicks inside the sheet do not", () => {
  const { c, dialog, opener, listeners } = setup();
  c.openProductPreview(dialog, opener);
  listeners.click({ target: dialog, clientX: 50, clientY: 200 });
  assert.equal(dialog.open, true);
  listeners.click({ target: dialog, clientX: 50, clientY: 50 });
  assert.equal(dialog.open, false);
  c.openProductPreview(dialog, opener);
  let prevented = false;
  listeners.cancel({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(dialog.open, false);
  assert.equal(opener.focusCount, 2);
});
test("reopening before an old close event cannot unlock scrolling or steal focus", () => {
  const { c, dialog, opener, listeners } = setup();
  c.openProductPreview(dialog, opener);
  c.closeProductPreview(dialog);
  c.openProductPreview(dialog, opener);
  listeners.close();
  assert.equal(c.document.body.style.overflow, "hidden");
  assert.equal(dialog.open, true);
  assert.equal(opener.focusCount, 1);
  opener.isConnected = false;
  c.closeProductPreview(dialog);
  assert.equal(opener.focusCount, 1);
  assert.equal(c.document.body.style.overflow, "auto");
});
test("both media viewers use native dialogs and the shared lifecycle, retaining detail routes", () => {
  const tray = source.slice(source.indexOf("function openGiftPfpTray("), source.indexOf("/* Keep card routes"));
  const thumb = source.slice(source.indexOf("function ensureStickerThumbOverlay("), source.indexOf("function formatMetricMoney("));
  for (const body of [tray, thumb]) assert.match(body, /createElement\("dialog"\)/);
  assert.match(tray, /openProductPreview\(tray, trigger\)/);
  assert.match(tray, /initCollectibleAnimations\(tray\)/);
  assert.match(tray, /data-screen-target="detail" data-asset=/);
  assert.match(thumb, /openProductPreview\(overlay, opener\)/);
  assert.doesNotMatch(tray + thumb, /role="dialog"/);
});
