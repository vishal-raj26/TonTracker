const test = require("node:test");
const assert = require("node:assert/strict");

const { verifiedTonListing } = require("../server");

function listedIn(tokenName, currencyType = "native") {
  return {
    sale: {
      price: {
        value: "2500000000",
        decimals: 9,
        token_name: tokenName,
        currency_type: currencyType,
      },
      market: { name: "Getgems" },
    },
  };
}

test("accepts the renamed native GRAM currency for NFT listings", () => {
  const listing = verifiedTonListing(listedIn("Gram"), 2);
  assert.equal(listing.floorTon, 2.5);
  assert.equal(listing.floorUsd, 5);
  assert.equal(listing.priceSource, "verified-native-gram-listing");
});

test("keeps native TON aliases compatible with older marketplace payloads", () => {
  assert.equal(verifiedTonListing(listedIn("TON"), 2).floorTon, 2.5);
  assert.equal(verifiedTonListing(listedIn("Toncoin"), 2).floorTon, 2.5);
});

test("rejects a jetton that only calls itself GRAM", () => {
  assert.equal(verifiedTonListing(listedIn("Gram", "jetton"), 2), null);
});
