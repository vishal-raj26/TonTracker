const assert = require("node:assert/strict");
const test = require("node:test");

const { tonCenterNftToTonApi } = require("../server");

test("adapts TON Center identity NFT metadata to the existing wallet shape", () => {
  const itemAddress = "0:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const collectionAddress = "0:80d78a35f955a14b679faa887ff4cd5bfc0f43b4a4eea2a7e6927f3701b273c2";
  const payload = {
    metadata: {
      [itemAddress]: {
        token_info: [{
          type: "nft_items",
          valid: true,
          name: "@notgameston",
          image: "https://cdn.example/username.png",
          extra: { buttons: [{ label: "Open", uri: "https://fragment.com/username/notgameston" }] },
        }],
      },
      [collectionAddress]: {
        token_info: [{ type: "nft_collections", valid: true, name: "Telegram Usernames" }],
      },
    },
  };
  const adapted = tonCenterNftToTonApi({
    address: itemAddress,
    collection_address: collectionAddress,
    owner_address: "0:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    index: "42",
  }, payload);

  assert.equal(adapted.metadata.name, "@notgameston");
  assert.equal(adapted.collection.name, "Telegram Usernames");
  assert.equal(adapted.collection.address, collectionAddress);
  assert.equal(adapted.metadata.image, "https://cdn.example/username.png");
  assert.equal(adapted.verified, true);
});

test("preserves animated media and traits for sticker and gift classification", () => {
  const itemAddress = "0:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
  const collectionAddress = "0:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd";
  const attributes = [{ trait_type: "Model", value: "Black Hole" }];
  const payload = {
    metadata: {
      [itemAddress]: {
        token_info: [{
          type: "nft_items",
          valid: true,
          name: "Animated collectible",
          image: "https://cdn.example/static.png",
          extra: {
            content_url: "https://cdn.example/animated.mp4",
            attributes: JSON.stringify(attributes),
          },
        }],
      },
      [collectionAddress]: {
        token_info: [{ type: "nft_collections", valid: true, name: "Collection" }],
      },
    },
  };
  const adapted = tonCenterNftToTonApi({
    address: itemAddress,
    collection_address: collectionAddress,
    owner_address: "0:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  }, payload);

  assert.equal(adapted.metadata.animation_url, "https://cdn.example/animated.mp4");
  assert.deepEqual(adapted.metadata.attributes, attributes);
});
