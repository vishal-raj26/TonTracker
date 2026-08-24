"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createTonCenterUsernameVerifier, isRealNftAddress, toNanograms } = require("../lib/toncenter-username-verifier");

const ITEM = "0:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

test("only accepts canonical TON collectible item addresses", () => {
  assert.equal(isRealNftAddress(ITEM), true);
  assert.equal(isRealNftAddress("fragment-index:abc"), false);
  assert.equal(toNanograms(12.5), 12_500_000_000n);
});

test("verifies a Fragment sale only when item, exact native amount, and time match", async () => {
  let requestedUrl = "";
  const verifier = createTonCenterUsernameVerifier({
    baseUrl: "https://example.test/api/v3",
    requestDelayMs: 0,
    fetch: async (url) => {
      requestedUrl = String(url);
      return { ok: true, json: async () => ({ transactions: [{
        hash: "tx-1", trace_id: "trace-1", utime: 1_700_000_000,
        in_msg: { value: "5050000000000" }, out_msgs: [],
      }] }) };
    },
  });
  const result = await verifier.verifyFragmentSale({ eventTime: "2023-11-14T22:13:20.000Z", priceGram: 5050 }, [ITEM]);
  assert.equal(result.verified, true);
  assert.equal(result.match.txHash, "tx-1");
  assert.match(requestedUrl, /account=0%3Aaaaaaaaa/);
});

test("does not promote an unrelated transfer to a chain-confirmed sale", async () => {
  const verifier = createTonCenterUsernameVerifier({
    requestDelayMs: 0,
    fetch: async () => ({ ok: true, json: async () => ({ transactions: [{
      hash: "transfer", utime: 1_700_000_000, in_msg: { value: "1" }, out_msgs: [],
    }] }) }),
  });
  const result = await verifier.verifyFragmentSale({ eventTime: "2023-11-14T22:13:20.000Z", priceGram: 5050 }, [ITEM]);
  assert.equal(result.verified, false);
  assert.equal(result.reason, "no-matching-chain-settlement");
});

test("accepts bounded seller net proceeds for a gross Fragment sale price", async () => {
  const verifier = createTonCenterUsernameVerifier({
    requestDelayMs: 0,
    fetch: async () => ({ ok: true, json: async () => ({ transactions: [{
      hash: "net-proceeds", utime: 1_700_000_000,
      in_msg: { value: "0" }, out_msgs: [{ value: "378948407230" }],
    }] }) }),
  });
  const result = await verifier.verifyFragmentSale({ eventTime: "2023-11-14T22:13:20.000Z", priceGram: 380 }, [ITEM]);
  assert.equal(result.verified, true);
  assert.equal(result.match.paymentKind, "net-proceeds");
  assert.ok(result.match.paymentDeviation < 0.01);
});

test("resolves a current owner's real Username NFT by its public domain metadata", async () => {
  const verifier = createTonCenterUsernameVerifier({
    requestDelayMs: 0,
    fetch: async () => ({ ok: true, json: async () => ({ nft_items: [
      { address: ITEM, collection_address: "0:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", content: { domain: "other.t.me" } },
      { address: ITEM, collection_address: "0:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc", content: { domain: "kick.t.me" } },
    ] }) }),
  });
  const found = await verifier.findOwnedUsernameNft("0:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd", "@Kick", "0:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc");
  assert.equal(found, ITEM);
});
