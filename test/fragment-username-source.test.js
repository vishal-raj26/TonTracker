"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");
const {
  canonicalSourceAddress,
  createFragmentUsernameSource,
  liveCursor,
  parseCurrentCompletedSale,
  parseCurrentOwner,
  parseOwnershipHistory,
  parseSearchRows,
  usernameIndex,
} = require("../lib/fragment-username-source");

test("parses a completed sale shown only in the current sale panel", () => {
  const html = `<section class="tm-section-box tm-section-bid-info">
    <table><thead><tr><th>Sale Price</th></tr></thead><tbody><tr>
      <td><div class="table-cell-value tm-value icon-before icon-ton">515</div></td>
      <td><a href="https://tonviewer.com/EQbuyer">owner</a></td>
    </tr></tbody></table>
    <div>Purchased on <time datetime="2025-05-19T22:38:15+00:00">19 May 2025</time></div>
  </section>`;
  const row = parseCurrentCompletedSale(html, "conviction");
  assert.equal(row.username, "conviction");
  assert.equal(row.priceGram, 515);
  assert.equal(row.eventTime, "2025-05-19T22:38:15.000Z");
  assert.equal(row.buyerAddress, "EQbuyer");
});

test("parses finalized Fragment search rows into stable sale identities", () => {
  const html = `<table><tr class="tm-row-selectable">
    <td><a href="/username/Kick">@kick</a></td>
    <td><div class="table-cell-value tm-value icon-before icon-ton">5,050</div></td>
    <td><time datetime="2023-11-27T22:48:36+00:00">27 Nov</time></td>
  </tr></table>`;
  const rows = parseSearchRows(html);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].username, "kick");
  assert.equal(rows[0].priceGram, 5050);
  assert.equal(rows[0].eventType, "sale");
  assert.equal(rows[0].isFinalized, true);
  assert.equal(rows[0].verified, false);
  assert.match(rows[0].eventId, /^fragment-sale:[0-9a-f]{64}$/);
});

test("ownership history stores sales and ignores transfers", () => {
  const html = `<section><h3>Ownership History</h3><table>
    <tr><td>Sold</td><td><div class="icon-ton">100</div></td><td><time datetime="2024-01-02T03:04:05Z"></time></td><td><a href="https://tonviewer.com/EQbuyer">buyer</a></td></tr>
    <tr><td>Transferred</td><td><time datetime="2024-02-02T03:04:05Z"></time></td></tr>
  </table></section>`;
  const rows = parseOwnershipHistory(html, "example");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].priceGram, 100);
  assert.equal(rows[0].buyerAddress, "EQbuyer");
});

test("reads the public current owner separately from ownership history", () => {
  const html = `<section class="tm-section-bid-info section-bid-info"><a href="https://tonviewer.com/EQcurrent">owner</a></section>
    <section><h3>Ownership History</h3><a href="https://tonviewer.com/EQold">old buyer</a></section>`;
  assert.equal(parseCurrentOwner(html), "EQcurrent");
});

test("Fragment identity uses Telegram's SHA-256 username index", () => {
  const expected = crypto.createHash("sha256").update("kick").digest("hex");
  assert.equal(usernameIndex("@Kick"), expected);
  assert.equal(canonicalSourceAddress("kick"), `fragment-index:${expected}`);
});

test("starts with latest sales and switches completed backfills to lightweight live polling", async () => {
  const requests = [];
  const fetch = async (url, init = {}) => {
    if (!init.method) return {
      ok: true,
      text: async () => `{"apiUrl":"/api?hash=test"}`,
      headers: { getSetCookie: () => ["stel_ssid=test; Path=/"] },
    };
    requests.push(String(init.body));
    return { ok: true, json: async () => ({ ok: true, html: "<table></table>" }) };
  };
  const source = createFragmentUsernameSource({ fetch, requestDelayMs: 0, retryBaseDelayMs: 0 });
  const initial = await source.fetchPage("");
  assert.equal(initial.latest, true);
  assert.match(requests[0], /(?:^|&)query=(?:&|$)/);
  const live = await source.fetchPage(liveCursor(2));
  assert.equal(live.live, true);
  assert.equal(live.cycle, 2);
});

test("persists a dense search cursor when its public-request budget is exhausted", async () => {
  const fetch = async (_url, init = {}) => {
    if (!init.method) return {
      ok: true,
      text: async () => '{"apiUrl":"/api?hash=test"}',
      headers: { getSetCookie: () => ["stel_ssid=test; Path=/"] },
    };
    return { ok: true, json: async () => ({ ok: true, html: `<table>${"<tr class=\"tm-row-selectable\"><a href=\"/username/name\">@name</a><div class=\"icon-ton\">1</div><time datetime=\"2025-01-01T00:00:00Z\"></time></tr>".repeat(500)}</table>` }) };
  };
  const source = createFragmentUsernameSource({ fetch, requestDelayMs: 0, retryBaseDelayMs: 0, maximumDepth: 4, maxSearchRequestsPerPage: 1 });
  const initial = await source.fetchPage("");
  const next = await source.fetchPage(initial.nextCursor);
  assert.equal(next.budgetExhausted, true);
  assert.equal(next.events.length, 0);
  assert.ok(next.nextCursor);
  assert.equal(next.searchRequests, 1);
});

test("defers a rejected Fragment request after refreshing the session without advancing its cursor", async () => {
  let pageLoads = 0;
  let apiCalls = 0;
  const fetch = async (_url, init = {}) => {
    if (!init.method) {
      pageLoads += 1;
      return {
        ok: true,
        text: async () => '{"apiUrl":"/api?hash=test"}',
        headers: { getSetCookie: () => [`stel_ssid=test-${pageLoads}; Path=/`] },
      };
    }
    apiCalls += 1;
    return { ok: true, json: async () => ({ ok: false, error: "try later" }) };
  };
  const source = createFragmentUsernameSource({ fetch, requestDelayMs: 0, retryBaseDelayMs: 0 });
  await assert.rejects(
    () => source.fetchPage(""),
    (error) => error?.code === "FRAGMENT_DEFERRED",
  );
  assert.equal(apiCalls, 6);
  assert.equal(pageLoads, 6);
});
