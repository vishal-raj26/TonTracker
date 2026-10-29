"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync(require("node:path").join(__dirname, "..", "app.js"), "utf8");
test("allocation retains small positive shares rather than reporting zero percent", () => {
  const c = vm.createContext({});
  vm.runInContext(source.slice(source.indexOf("function allocationShareLabel("), source.indexOf("function updateAllocationUi(")), c);
  assert.equal(c.allocationShareLabel(213, 45000), "<1%");
  assert.equal(c.allocationShareLabel(40000, 45000), "89%");
  assert.equal(c.allocationShareLabel(0, 45000), "—");
  assert.equal(c.allocationShareLabel(100, 0), "—");
});
function movers() {
  const cards = [0, 1].map(() => ({ dataset: {}, attributes: {}, innerHTML: "",
    setAttribute(k, v) { this.attributes[k] = v; }, removeAttribute(k) { delete this.attributes[k]; if (k === "data-asset") delete this.dataset.asset; if (k === "data-screen-target") delete this.dataset.screenTarget; },
    toggleAttribute(k, on) { if (on) this.attributes[k] = ""; else delete this.attributes[k]; } }));
  const c = vm.createContext({ document: { querySelectorAll: () => cards }, resolveTokenImage: () => "", escapeHtml: String, signedPct: n => `${n}%` });
  vm.runInContext(source.slice(source.indexOf("function updateHomeTokenWidgets("), source.indexOf("function renderTokenLogo(")), c);
  return { c, cards };
}
test("movers reject missing, empty and unpriced changes; no fabricated zero or detail route", () => {
  const { c, cards } = movers();
  c.updateHomeTokenWidgets([null, undefined, "", "   ", false, "invalid"].map((change24h, id) => ({ id, priceUsd: 1, change24h })).concat({ id: "unpriced", priceUsd: 0, change24h: 10 }));
  for (const card of cards) {
    assert.match(card.innerHTML, /Movement unavailable/);
    assert.doesNotMatch(card.innerHTML, /0%/);
    assert.equal(card.dataset.screenTarget, undefined);
    assert.equal(card.attributes.tabindex, undefined);
  }
});
test("movers use actual signed ranking, expose keyboard routes, and avoid duplicate single-token rows", () => {
  const { c, cards } = movers();
  c.updateHomeTokenWidgets([{ id: "a", name: "A", priceUsd: 1, change24h: 0 }]);
  assert.match(cards[0].innerHTML, /class="">0%/);
  assert.equal(cards[0].dataset.asset, "a");
  assert.equal(cards[0].attributes.role, "button");
  assert.equal(cards[0].attributes.tabindex, "0");
  assert.ok(cards[0].innerHTML.indexOf('class="mover-label"') < cards[0].innerHTML.indexOf('<strong'));
  assert.ok(cards[0].innerHTML.indexOf('<strong') < cards[0].innerHTML.indexOf('class="performer-asset-line"'));
  assert.match(cards[0].attributes["aria-label"], /Best 24h/);
  assert.ok("hidden" in cards[1].attributes);
  c.updateHomeTokenWidgets([{ id: "a", priceUsd: 1, change24h: 5 }, { id: "b", priceUsd: 1, change24h: 2 }]);
  assert.equal(cards[1].dataset.asset, "b");
  assert.match(cards[1].innerHTML, /class="positive"/);
  assert.equal("hidden" in cards[1].attributes, false);
  c.updateHomeTokenWidgets([]);
  assert.equal(cards[0].dataset.asset, undefined);
  assert.equal(cards[0].attributes.tabindex, undefined);
  assert.equal(cards[0].attributes["aria-label"], undefined);
  assert.ok("hidden" in cards[1].attributes);
  c.updateHomeTokenWidgets([{ id: "a", priceUsd: 1, change24h: 5 }]);
  vm.runInContext(source.slice(source.indexOf("function resetPerformerCards("), source.indexOf("function resetWalletBoundUi(")), c);
  c.resetPerformerCards();
  assert.equal(cards[0].dataset.asset, undefined);
  assert.equal(cards[0].attributes.role, undefined);
});
test("history context reports the observed snapshot timestamp, not today's refresh date", () => {
  const context = {}, badge = { classList: { remove() {}, toggle() {} } }, title = { setAttribute() {} };
  const c = vm.createContext({ homePortfolioValue: 45000, displayCurrency: "USD", walletConnected: true, telegramConnected: false,
    portfolioHistoryRows: () => [{ timestamp: 100, value: 2900 },{ timestamp: 123, value: 3000 }], updatePortfolioChartReadout() {},
    money: n => `$${n}`, escapeHtml: String, rangePnl: () => ({ available: false }), portfolioTimeLabel: t => `snapshot-${t}`,
    document: { getElementById: id => id === "homePortfolioValue" ? title : context, querySelector: () => badge } });
  vm.runInContext(source.slice(source.indexOf("function renderReferenceFinancialValue("), source.indexOf("function playHomeEntrance(")), c);
  c.resetPortfolioHeader("1D");
  assert.equal(title.textContent, "$45000");
  assert.match(context.textContent, /History through snapshot-123/);
  assert.equal(badge.textContent, "Movement unavailable");
});

test("day-one history is an intentional no-chart state, distinct from a fetch failure", () => {
  const title = {}, copy = {}, notice = { querySelector: s => s === "b" ? title : copy };
  const c = vm.createContext({ walletConnected: true, telegramConnected: false, document: { getElementById: () => notice } });
  vm.runInContext(source.slice(source.indexOf("function updateHomeHistoryEmptyState("), source.indexOf("function updatePortfolioChartReadout(")), c);
  c.updateHomeHistoryEmptyState(false);
  assert.equal(notice.hidden, false);
  assert.equal(title.textContent, "History starts here");
  assert.match(copy.textContent, /snapshots/);
  assert.doesNotMatch(copy.textContent, /tomorrow|24 hours|0%/);
  c.updateHomeHistoryEmptyState(false, true);
  assert.equal(title.textContent, "History unavailable");
  c.updateHomeHistoryEmptyState(true);
  assert.equal(notice.hidden, true);
  c.walletConnected = false;
  c.updateHomeHistoryEmptyState(false);
  assert.equal(notice.hidden, true);
});

test("restored Home keeps the visible allocation and activity entry point", () => {
  const html = fs.readFileSync(require("node:path").join(__dirname, "..", "index.html"), "utf8");
  assert.match(source, /const HOME_ACTIVITY_LIMIT = 3/);
  assert.match(html, /<section class="allocation-card"[^>]*>/);
  assert.doesNotMatch(html, /<details class="allocation-card"[^>]*>/);
  assert.match(html, /aria-label="Select portfolio allocation segment"/);
  assert.match(html, /id="portfolioHistoryContext"/);
  assert.match(html, /data-screen-target="activity"/);
});

test("optional new allocation safely skips absent markup and Home keeps its restored mover routes", () => {
  const c = vm.createContext({ document: { getElementById: () => null } });
  vm.runInContext(source.slice(source.indexOf('function renderHomeAssetBrowser('), source.indexOf('function updateCategoryAndTopAsset(')), c);
  assert.doesNotThrow(() => c.renderHomeAssetBrowser([], []));
  assert.match(source, /\[data-screen="home"\] \.performer-row article/);
});

test("compact Home activity keeps exact swap amounts and separates description from timestamp", () => {
  const c = vm.createContext({
    nativeCurrencyDisplayText: String, signedActivityValue: value => value,
    escapeHtml: value => String(value).replaceAll("<", "&lt;"),
    formatActivityDate: () => "Oct 6 · 22:29", activityDayLabel: () => "Today",
  });
  vm.runInContext(source.slice(source.indexOf("function activityRowsHtml("), source.indexOf("function renderFullActivity(")), c);
  const event = { id: "hash", date: 1, actions: [{ type: "Swap", simplePreview: { name: "Swap Tokens", direction: "Swap", value: "6.573 GRAM → 0.01 GRAM", usdValue: "≈ $10.08" } }] };
  const home = c.activityRowsHtml([event], 3, "Empty", { compact: true });
  assert.match(home, /<small title="Swap Tokens">Swap Tokens<\/small><small class="activity-time">Oct 6 · 22:29/);
  assert.match(home, /<span>6\.573 GRAM<\/span><span>→ 0\.01 GRAM<\/span>/);
  assert.match(home, /≈ \$10\.08/);
  assert.match(home, /data-tx-hash="hash"/);
  const full = c.activityRowsHtml([event], 3, "Empty", { compact: false });
  assert.doesNotMatch(full, /is-long-value/);
  assert.match(full, /6\.573 GRAM<span>→ 0\.01 GRAM<\/span>/);
  const empty = c.activityRowsHtml([], 3, "No TON activity found yet", { compact: true });
  assert.match(empty, /Wallet activity/);
  assert.match(empty, /No TON activity found yet/);
  assert.doesNotMatch(empty, /Synced|data-tx-hash|<aside>/);
});

test("reference allocation segments use exact valued shares and retain unavailable categories", () => {
  const items = ["Gifts", "Tokens", "Stickers", "DNS", "Numbers", "Names"].map((name, index) => {
    const parts = { b: { textContent: name }, small: { textContent: `${index + 1} owned` }, strong: { textContent: index < 2 ? `$${index ? 40 : 60}` : "Unavailable" } };
    return { parts, attrs: {}, classList: { toggle() {} },
      querySelector(selector) { return selector === ".reference-allocation-stack" ? this.stack : parts[selector]; },
      prepend(stack) { this.stack = stack; }, setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; } };
  });
  const host = { dataset: {}, setAttribute() {}, closest: () => ({}), querySelector: selector => selector === "span" ? {} : null };
  let donutCalls = 0;
  const caption = {};
  const c = vm.createContext({ allocationState: { gifts: 60, tokens: 40 }, selectedAllocation: null,
    walletConnected: true, telegramConnected: false, compactMoney: String, window: { devicePixelRatio: 1 },
    Charts: { renderDonut() { donutCalls++; } }, getComputedStyle: () => ({ getPropertyValue: () => "" }),
    document: { body: { classList: { contains: () => true } }, documentElement: {},
      getElementById: id => id === "donut-chart" ? host : null,
      querySelector: selector => selector.includes("caption") ? caption : { classList: { toggle() {} } },
      querySelectorAll: () => items,
      createElement: () => ({ setAttribute() {}, style: { setProperty(k, v) { this[k] = v; } } }),
    },
  });
  vm.runInContext(source.slice(source.indexOf("function allocationShareLabel("), source.indexOf("function updateAllocationUi(")), c);
  vm.runInContext(source.slice(source.indexOf("function renderDonut("), source.indexOf("function portfolioHistoryRows(")), c);
  c.renderDonut();
  assert.equal(donutCalls, 0);
  assert.equal(items[0].stack.style["--allocation-share"], "60");
  assert.equal(items[1].stack.style["--allocation-share"], "40");
  assert.equal(items[2].stack.style["--allocation-share"], "0");
  assert.match(items[2].attrs["aria-label"], /3 owned, Price unavailable, unpriced/);
  assert.equal(items[2].parts.strong.textContent, "—");
  c.selectedAllocation = 0;
  c.renderDonut();
  assert.equal(items[0].attrs["aria-pressed"], "true");
  assert.equal(caption.textContent, "Gifts · 60%");
  // New prices must replace the old fill, not retain a decorative/static stack.
  c.allocationState = { gifts: 20, tokens: 30, stickers: 50 };
  c.renderDonut();
  assert.deepEqual(items.slice(0, 3).map(item => item.stack.style["--allocation-share"]), ["20", "30", "50"]);
  assert.equal(caption.textContent, "Gifts · 20%");
  c.allocationState = {};
  c.renderDonut();
  assert.ok(items.every(item => item.stack.style["--allocation-share"] === "0"));
  assert.equal(caption.textContent, "Gifts · Price unavailable");
});
