const test = require("node:test");
const assert = require("node:assert/strict");

const { identityAssetFields } = require("../server.js");

test("extracts the same canonical username from supported identity NFT payload shapes", () => {
  const samples = [
    { content: { username: "@NotGameSTON" } },
    { raw: { content: { domain: "notgameston.t.me" } } },
    { raw: { raw: { content: { username: "https://t.me/notgameston/" } } } },
    { metadata: { domain: "notgameston.telegram.me" } },
  ];
  for (const sample of samples) {
    const result = identityAssetFields(sample, "telegram_username", 0);
    assert.equal(result.username, "notgameston");
    assert.equal(result.displayName, "@notgameston");
    assert.equal(result.marketUrl, "https://fragment.com/username/notgameston");
  }
});

test("does not score a generic Telegram username placeholder", () => {
  const result = identityAssetFields({ metadata: { name: "Telegram username" } }, "telegram_username", 0);
  assert.equal(result.username, "");
  assert.equal(result.displayName, "Telegram username");
  assert.equal(result.marketUrl, "https://fragment.com/usernames");
});
