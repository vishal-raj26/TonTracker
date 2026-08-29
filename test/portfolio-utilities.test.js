const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const appSource = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");

test("analytics history loading is enabled for real wallet snapshots", () => {
  assert.match(appSource, /let graphHistoryLoadingPaused = false;/);
  assert.match(appSource, /function isGraphHistoryLoadingEnabled\(\) \{\s*return !graphHistoryLoadingPaused;/);
});

test("watchlist persists serializable details and hydrates saved assets", () => {
  assert.match(appSource, /function watchlistStore\(\)/);
  assert.match(appSource, /details: Object\.fromEntries/);
  assert.match(appSource, /const saved = watchlistStore\(\)\.details\[id\]/);
  assert.match(appSource, /function saveWatchlistAsset\(id\)/);
});

test("refresh frequency cycles through bounded options and stops on disconnect", () => {
  assert.match(appSource, /REFRESH_FREQUENCY_OPTIONS = \[0, 5, 15, 30\]/);
  assert.match(appSource, /function schedulePortfolioRefresh\(\)/);
  assert.match(appSource, /refreshTimer = setInterval\(\(\) => refreshActivePortfolio\(\), minutes \* 60_000\)/);
  const disconnectSource = appSource.slice(appSource.indexOf("async function disconnectWallet("), appSource.indexOf("function normalizeWalletHistory("));
  assert.match(disconnectSource, /walletConnected = false;\s*stopPortfolioRefresh\(\);/);
  assert.doesNotMatch(appSource, /window\.prompt\("Refresh frequency/);
});
