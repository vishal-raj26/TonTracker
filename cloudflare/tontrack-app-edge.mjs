import { httpServerHandler } from "cloudflare:node";
import serverModule from "../server.js";

const nodeHandler = httpServerHandler(serverModule.server);

function configureRegistryService(env) {
  globalThis.__tontrackRegistryFetch = env.REGISTRY_SERVICE
    ? (url, options) => env.REGISTRY_SERVICE.fetch(new Request(url, options))
    : null;
}

async function proxyHeavyWalletImport(request, env, ctx) {
  const origin = String(env.HEAVY_API_ORIGIN || "").replace(/\/+$/, "");
  if (!origin) return null;
  const incoming = new URL(request.url);
  const target = new URL(`${incoming.pathname}${incoming.search}`, origin);
  const headers = new Headers(request.headers);
  headers.set("x-tontrack-edge-origin", incoming.origin);
  const response = await fetch(new Request(target, {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
    redirect: "follow",
  }));
  if (!response.ok) return response;
  const payload = await response.json();
  // TON DNS, usernames and anonymous numbers are out of scope. Strip them if an
  // older heavy origin still returns them, so they never reach totals or the UI.
  const assets = payload?.assets || {};
  delete assets.dns;
  delete assets.usernames;
  delete assets.anonymousNumbers;
  if (payload.summary) {
    const oldIdentityValue = Number(payload.summary.identityValueUsd || 0);
    payload.summary.totalUsd = Math.max(0, Number(payload.summary.totalUsd || 0) - oldIdentityValue);
    delete payload.summary.identityValueUsd;
    delete payload.summary.dnsCount;
    delete payload.summary.usernameCount;
    delete payload.summary.anonymousNumberCount;
  }
  const responseHeaders = new Headers(response.headers);
  responseHeaders.set("content-type", "application/json; charset=utf-8");
  responseHeaders.set("cache-control", "no-store");
  return new Response(JSON.stringify(payload), { status: response.status, headers: responseHeaders });
}

export default {
  async fetch(request, env, ctx) {
    configureRegistryService(env);
    const pathname = new URL(request.url).pathname;
    if (pathname === "/api/wallet" && request.method === "GET") {
      const proxied = await proxyHeavyWalletImport(request, env, ctx);
      return proxied || nodeHandler.fetch(request, env, ctx);
    }
    if (pathname.startsWith("/api/") || pathname === "/tonconnect-manifest.json") {
      return nodeHandler.fetch(request, env, ctx);
    }
    return env.ASSETS.fetch(request);
  },
};
