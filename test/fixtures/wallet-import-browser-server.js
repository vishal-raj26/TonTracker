"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const port = Number(process.env.TONTRACK_FIXTURE_PORT || 5188);
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".mp4": "video/mp4", ".json": "application/json" };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fixtureAddress = "fixture-wallet";

function walletPayload() {
  return {
    importedAt: new Date().toISOString(),
    account: { address: fixtureAddress, displayAddress: "fixture…wallet", tonName: "Fixture Wallet" },
    summary: { totalUsd: 15, tonValueUsd: 5, jettonsValueUsd: 10, tonUsdRate: 5, tokenCount: 2, giftCount: 0, stickerCount: 0, dnsCount: 0 },
    assets: {
      ton: { balance: 1, priceUsd: 5, valueUsd: 5, symbol: "TON", name: "Toncoin" },
      jettons: [{ address: "jetton-fixture", masterAddress: "jetton-fixture", symbol: "FIX", name: "Fixture Token", balance: 10, priceUsd: 1, valueUsd: 10, verified: true }],
      jettonInventory: { status: "partial", providers: { fixture: { provider: "fixture", status: "ready" } } },
      collectibles: [], dns: [], usernames: [], anonymousNumbers: [],
    },
    warnings: ["Collectibles are loading"], history: [], historyStatus: [], activity: [],
  };
}

function collectiblePayload() {
  return {
    gifts: [{ address: "gift-fixture", type: "gift", name: "Fixture Gift", collection: "Fixture Collection", model: "Model", backdrop: "Backdrop", image: "" }],
    stickers: [{ address: "sticker-fixture", type: "sticker", name: "Fixture Sticker", collection: "Fixture Stickers", image: "" }],
    dns: [{ address: "dns-fixture", type: "dns", name: "fixture.ton", domain: "fixture.ton", valueUsd: 0 }],
    usernames: [{ address: "username-fixture", type: "telegram_username", name: "@fixture", username: "fixture", valueUsd: 0 }],
    anonymousNumbers: [{ address: "number-fixture", type: "anonymous_number", name: "+888 0000 0000", number: "+888 0000 0000", valueUsd: 0 }],
  };
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  if (url.pathname === "/api/wallet") {
    const tokensFirst = url.searchParams.get("address") !== "collectibles-first";
    if (url.searchParams.get("refresh") === "1") await sleep(tokensFirst ? 30 : 220);
    response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    response.end(JSON.stringify(walletPayload()));
    return;
  }
  if (url.pathname === "/api/collectibles") {
    const tokensFirst = url.searchParams.get("address") !== "collectibles-first";
    await sleep(tokensFirst ? 220 : 30);
    response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    response.end(JSON.stringify(collectiblePayload()));
    return;
  }
  if (url.pathname.startsWith("/api/")) {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ items: [], events: [], history: [], points: [] }));
    return;
  }
  const relative = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname.slice(1));
  const target = path.resolve(root, relative);
  if (!target.startsWith(root) || !fs.existsSync(target) || fs.statSync(target).isDirectory()) {
    response.writeHead(404).end("Not found");
    return;
  }
  response.writeHead(200, { "content-type": mime[path.extname(target)] || "application/octet-stream", "cache-control": "no-store" });
  fs.createReadStream(target).pipe(response);
});

server.listen(port, "127.0.0.1", () => console.log(`fixture server listening on ${port}`));
