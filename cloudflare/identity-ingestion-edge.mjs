import usernameLedger from "../scripts/rebuild-username-ledger.js";
import dnsLedgerModule from "../lib/dns-toncenter-ledger.js";

let dnsLedger = dnsLedgerModule.createDnsTonCenterLedger();

function configureRuntime(env) {
  if (!env.REGISTRY) return;
  const fetchImpl = (input, init) => env.REGISTRY.fetch(input, init);
  usernameLedger.configureLedger({ fetch: fetchImpl });
  dnsLedger = dnsLedgerModule.createDnsTonCenterLedger({
    ledger: dnsLedgerModule.createLedgerClient({ fetch: fetchImpl }),
  });
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function authorized(request, env) {
  const expected = String(env.IDENTITY_TRIGGER_SECRET || env.D1_INGEST_SECRET || "").trim();
  const supplied = String(request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  return Boolean(expected && supplied && expected === supplied);
}

async function runUsernameCycle() {
  const startedAt = new Date().toISOString();
  const result = await usernameLedger.runPage();
  return { ok: true, pipeline: "username-fragment-sales-v1", startedAt, completedAt: new Date().toISOString(), ...result };
}

async function runDnsCycle() {
  const startedAt = new Date().toISOString();
  return { startedAt, completedAt: new Date().toISOString(), ...(await dnsLedger.runPage()) };
}

async function runIdentityCycle() {
  const username = await runUsernameCycle();
  const dns = await runDnsCycle();
  return { ok: username.ok && dns.ok, username, dns };
}

export default {
  async fetch(request, env) {
    configureRuntime(env);
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return json({ ok: true, service: "tontrack-identity-ingestion", scheduled: true });
    }
    if (url.pathname === "/run/username" && request.method === "POST") {
      if (!authorized(request, env)) return json({ error: "Unauthorized" }, 401);
      try {
        return json(await runUsernameCycle());
      } catch (error) {
        return json({ ok: false, pipeline: "username-fragment-sales-v1", error: String(error?.message || error).slice(0, 300) }, 503);
      }
    }
    if (url.pathname === "/run/dns" && request.method === "POST") {
      if (!authorized(request, env)) return json({ error: "Unauthorized" }, 401);
      try {
        return json(await runDnsCycle());
      } catch (error) {
        return json({ ok: false, pipeline: "dns-toncenter-history-v1", error: String(error?.message || error).slice(0, 300) }, 503);
      }
    }
    return json({ error: "Not found" }, 404);
  },

  async scheduled(_controller, env, ctx) {
    configureRuntime(env);
    ctx.waitUntil(runIdentityCycle().catch((error) => {
      console.error(`[identity-ingestion] cycle failed: ${error?.stack || error}`);
    }));
  },
};
