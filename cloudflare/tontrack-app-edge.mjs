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

function proxyHeavyWalletImport(request, env) {
  const origin = String(env.HEAVY_API_ORIGIN || "").replace(/\/+$/, "");
  if (!origin) return null;
  const incoming = new URL(request.url);
  const target = new URL(`${incoming.pathname}${incoming.search}`, origin);
  const headers = new Headers(request.headers);
  headers.set("x-tontrack-edge-origin", incoming.origin);
  return fetch(new Request(target, {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
    redirect: "follow",
  }));
}

export default {
  async fetch(request, env, ctx) {
    configureRegistryService(env);
    const pathname = new URL(request.url).pathname;
    if (pathname === "/api/wallet" && request.method === "GET") {
      return proxyHeavyWalletImport(request, env) || nodeHandler.fetch(request, env, ctx);
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
