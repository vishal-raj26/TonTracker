import { httpServerHandler } from "cloudflare:node";
import serverModule from "../server.js";

const nodeHandler = httpServerHandler(serverModule.server);
let valuationWarmPromise = null;

function configureRegistryService(env) {
  globalThis.__tontrackRegistryFetch = env.REGISTRY_SERVICE
    ? (url, options) => env.REGISTRY_SERVICE.fetch(new Request(url, options))
    : null;
}

function warmValuationRuntimes() {
  if (!valuationWarmPromise) {
    valuationWarmPromise = Promise.all([
      serverModule.dnsRuntime.warm(),
      serverModule.usernameRuntime.warm(),
    ]).catch((error) => {
      // A transient read-model failure must not permanently poison this isolate.
      valuationWarmPromise = null;
      throw error;
    });
  }
  return valuationWarmPromise;
}

function portfolioIdentityValue(asset = {}) {
  if (asset.portfolioEligible === false) return 0;
  return Math.max(0, Number(asset.floorUsd || asset.estimatedUsd || 0));
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
  const assets = payload?.assets || {};
  const tonRate = Number(payload?.summary?.tonUsdRate || 0);
  const oldIdentityValue = Number(payload?.summary?.identityValueUsd || 0);
  await warmValuationRuntimes();
  const [dns, usernames] = await Promise.all([
    serverModule.dnsRuntime.valueAssets(Array.isArray(assets.dns) ? assets.dns : [], tonRate),
    serverModule.usernameRuntime.valueAssets(Array.isArray(assets.usernames) ? assets.usernames : []),
  ]);
  assets.dns = dns;
  assets.usernames = usernames;
  const identityValue = [...dns, ...usernames, ...(Array.isArray(assets.anonymousNumbers) ? assets.anonymousNumbers : [])]
    .reduce((sum, asset) => sum + portfolioIdentityValue(asset), 0);
  if (payload.summary) {
    payload.summary.identityValueUsd = identityValue;
    payload.summary.totalUsd = Math.max(0, Number(payload.summary.totalUsd || 0) - oldIdentityValue + identityValue);
    payload.summary.dnsCount = dns.length;
    payload.summary.usernameCount = usernames.length;
  }
  ctx.waitUntil(Promise.all([
    serverModule.dnsRuntime.enqueueAssets(dns),
    serverModule.usernameRuntime.enqueueAssets(usernames),
  ]).catch(() => undefined));
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
      const warm = warmValuationRuntimes();
      if (pathname.startsWith("/api/dns-estimator/") || pathname.startsWith("/api/username-estimator/")) {
        await warm;
      } else {
        ctx.waitUntil(warm.catch(() => undefined));
      }
      return nodeHandler.fetch(request, env, ctx);
    }
    return env.ASSETS.fetch(request);
  },
};
