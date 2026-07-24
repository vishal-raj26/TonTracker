const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

let lastConfig;
let destroyed = 0;
global.Chart = class FakeChart {
  constructor(_canvas, config) { lastConfig = config; }
  destroy() { destroyed += 1; }
};
const Charts = require("../chart-platform.js");
const canvas = () => ({ tagName: "CANVAS", getContext() {} });

test("declares every retained chart family and range", () => {
  assert.deepEqual(Object.keys(Charts.definitions), ["portfolio", "allocation", "analytics", "tokenPrice", "collectibleFloor"]);
  assert.deepEqual(Charts.definitions.portfolio.ranges, ["1D", "7D", "1M"]);
  assert.deepEqual(Charts.definitions.tokenPrice.ranges, ["day", "week", "month", "year", "all"]);
  assert.deepEqual(Charts.definitions.collectibleFloor.ranges, ["7d"]);
  assert.equal(Charts.definitions.collectibleFloor.detail.interactive, true);
});

test("derives shared range controls", () => {
  assert.equal(
    Charts.rangeButtons("collectibleFloor", "7d", { attribute: "data-gift-detail-range" }),
    '<button class="mini-button active" type="button" data-gift-detail-range="7d">7D</button>',
  );
});

test("normalizes rows and replaces the previous chart instance", () => {
  const element = canvas();
  const first = Charts.renderConfigured("portfolio", [[10, 2], { timestamp: 20, value: "4" }, { value: "bad" }], { element });
  assert.deepEqual(first.points.map(({ value, timestamp }) => ({ value, timestamp })), [{ value: 2, timestamp: 10 }, { value: 4, timestamp: 20 }]);
  assert.equal(lastConfig.type, "line");
  assert.deepEqual(lastConfig.data.datasets[0].data, [2, 4]);
  Charts.renderConfigured("portfolio", [{ value: 8 }], { element });
  assert.equal(destroyed, 1);
});

test("renders doughnut data and deterministic hit testing", () => {
  const result = Charts.renderDonut(canvas(), [2, -4, 6]);
  assert.deepEqual(result.segments.map(({ ratio }) => ratio), [0.25, 0, 0.75]);
  assert.equal(lastConfig.type, "doughnut");
  assert.deepEqual(lastConfig.data.datasets[0].offset, [0, 0, 0]);
  Charts.renderDonut(canvas(), [2, 4, 6], { selected: 1 });
  assert.deepEqual(lastConfig.data.datasets[0].offset, [0, 7, 0]);
  assert.equal(Charts.donutHitIndex([1, 1], 0, -57.6, 160), 0);
  assert.equal(Charts.donutHitIndex([1, 1], 0, 0, 160), -1);
});

test("computes the canonical series metric set", () => {
  assert.deepEqual(Charts.seriesStats([10, 20, 15]), { first: 10, latest: 15, low: 10, high: 20, average: 15, changePct: 50, swingPct: 100 });
});

test("proves route, renderer, and pipeline parity", () => {
  const root = path.resolve(__dirname, "..");
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "docs", "chart-parity.json"), "utf8"));
  assert.ok(html.indexOf("chart.umd.js") < html.indexOf('src="./chart-platform.js'));
  assert.ok(html.indexOf('src="./chart-platform.js') < html.indexOf('src="./app.js'));
  const screens = [...html.matchAll(/<main class="screen[^"]*" data-screen="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(manifest.routes.map(({ id }) => id), screens);
  for (const [id, definition] of Object.entries(Charts.definitions)) {
    const parity = manifest.charts.find((chart) => chart.id === id);
    assert.equal(parity?.renderer, definition.renderer);
    for (const endpoint of definition.pipeline.filter((entry) => entry.startsWith("/api/"))) {
      assert.ok(server.includes(`url.pathname === "${endpoint}"`), `missing server route ${endpoint}`);
      assert.ok(app.includes(endpoint), `missing client pipeline ${endpoint}`);
    }
  }
});

test("exposes only chart APIs used by production", () => {
  const app = fs.readFileSync(path.resolve(__dirname, "..", "app.js"), "utf8");
  for (const name of Object.keys(Charts)) assert.ok(app.includes(`Charts.${name}`), `unused chart export: ${name}`);
});
