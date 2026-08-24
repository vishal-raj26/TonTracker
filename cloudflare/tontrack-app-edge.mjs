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

export default {
  async fetch(request, env, ctx) {
    configureRegistryService(env);
    const pathname = new URL(request.url).pathname;
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
