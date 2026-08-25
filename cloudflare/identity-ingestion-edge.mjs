import usernameLedger from "../scripts/rebuild-username-ledger.js";
import dnsLedgerModule from "../lib/dns-toncenter-ledger.js";
import baselineModule from "../scripts/refresh-identity-baselines.js";
import usernameKnowledgeModule from "../lib/username-knowledge.js";

let dnsLedger = dnsLedgerModule.createDnsTonCenterLedger();
let checkpointLedger = dnsLedgerModule.createLedgerClient();
const REFRESH_PIPELINE_KEY = "identity-baseline-refresh-v1";
const { resolveUsernameKnowledge } = usernameKnowledgeModule;

function configureRuntime(env) {
  if (!env.REGISTRY) return;
  const fetchImpl = (input, init) => env.REGISTRY.fetch(input, init);
  const clientOptions = { fetch: fetchImpl, secret: env.D1_INGEST_SECRET };
  usernameLedger.configureLedger(clientOptions);
  baselineModule.configureLedger(clientOptions);
  checkpointLedger = dnsLedgerModule.createLedgerClient(clientOptions);
  dnsLedger = dnsLedgerModule.createDnsTonCenterLedger({
    ledger: dnsLedgerModule.createLedgerClient(clientOptions),
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

async function runRefreshCycle(force = false) {
  const now = Date.now();
  const intervalMs = Math.max(60 * 60 * 1000, Number(process.env.IDENTITY_BASELINE_REFRESH_INTERVAL_MS || 6 * 60 * 60 * 1000));
  const state = await checkpointLedger.readState(REFRESH_PIPELINE_KEY);
  const metadata = state?.metadata || state?.metadata_json || {};
  const lastCompletedAt = Date.parse(metadata.lastCompletedAt || "");
  if (!force && Number.isFinite(lastCompletedAt) && now - lastCompletedAt < intervalMs) {
    return { ok: true, skipped: true, pipeline: REFRESH_PIPELINE_KEY, nextAt: new Date(lastCompletedAt + intervalMs).toISOString() };
  }
  const startedAt = new Date(now).toISOString();
  await checkpointLedger.writeState(REFRESH_PIPELINE_KEY, { phase: "running", startedAt }, { status: "running", startedAt });
  try {
    const username = await baselineModule.refreshKind("username", { aggregateSource: true, writeExactValuations: false });
    const dns = await baselineModule.refreshKind("dns", { aggregateSource: true, writeExactValuations: false });
    const lastCompleted = new Date().toISOString();
    await checkpointLedger.writeState(REFRESH_PIPELINE_KEY, { phase: "complete", lastCompletedAt: lastCompleted }, {
      status: "complete", startedAt, lastCompletedAt: lastCompleted, usernameSales: username.sales, dnsSales: dns.sales,
    });
    return { ok: true, pipeline: REFRESH_PIPELINE_KEY, startedAt, completedAt: lastCompleted, username, dns };
  } catch (error) {
    await checkpointLedger.writeState(REFRESH_PIPELINE_KEY, { phase: "failed", startedAt }, {
      status: "failed", startedAt, failedAt: new Date().toISOString(), error: String(error?.message || error).slice(0, 240),
    });
    throw error;
  }
}

async function runKnowledgeCycle(env) {
  const headers = { "content-type": "application/json", authorization: `Bearer ${env.D1_INGEST_SECRET}` };
  const queued = await env.REGISTRY.fetch("https://registry/identity/knowledge/queue", {
    method: "POST", headers, body: JSON.stringify({ limit: 4 }),
  });
  if (!queued.ok) throw new Error(`knowledge queue ${queued.status}`);
  const payload = await queued.json();
  const records = [];
  for (const row of payload.records || []) {
    const knowledge = await resolveUsernameKnowledge(row.normalized_name, { fetch });
    records.push({ assetKey: row.asset_key, knowledge });
    await new Promise((resolve) => setTimeout(resolve, 650));
  }
  if (records.length) {
    const write = await env.REGISTRY.fetch("https://registry/ingest/identity-knowledge", {
      method: "POST", headers, body: JSON.stringify({ records }),
    });
    if (!write.ok) throw new Error(`knowledge ingest ${write.status}`);
  }
  return { ok: true, inspected: (payload.records || []).length, written: records.length };
}

async function runIdentityCycle(env) {
  const jobs = {
    username: () => runUsernameCycle(),
    dns: () => runDnsCycle(),
    refresh: () => runRefreshCycle(false),
  };
  const entries = await Promise.all(Object.entries(jobs).map(async ([name, run]) => {
    try { return [name, await run()]; }
    catch (error) {
      console.error(`[identity-ingestion] ${name} failed: ${error?.stack || error}`);
      return [name, { ok: false, error: String(error?.message || error).slice(0, 300) }];
    }
  }));
  const result = Object.fromEntries(entries);
  return { ok: Object.values(result).every((row) => row?.ok !== false), ...result };
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
    if (url.pathname === "/run/refresh" && request.method === "POST") {
      if (!authorized(request, env)) return json({ error: "Unauthorized" }, 401);
      try {
        return json(await runRefreshCycle(true));
      } catch (error) {
        return json({ ok: false, pipeline: REFRESH_PIPELINE_KEY, error: String(error?.message || error).slice(0, 300) }, 503);
      }
    }
    if (url.pathname === "/run/knowledge" && request.method === "POST") {
      if (!authorized(request, env)) return json({ error: "Unauthorized" }, 401);
      try {
        return json(await runKnowledgeCycle(env));
      } catch (error) {
        return json({ ok: false, pipeline: "username-knowledge-v3", error: String(error?.message || error).slice(0, 300) }, 503);
      }
    }
    if (url.pathname === "/run/all" && request.method === "POST") {
      if (!authorized(request, env)) return json({ error: "Unauthorized" }, 401);
      return json({ ...(await runIdentityCycle(env)), knowledge: { ok: true, scheduledSeparately: true } });
    }
    return json({ error: "Not found" }, 404);
  },

  async scheduled(controller, env, ctx) {
    configureRuntime(env);
    const run = String(controller.cron || "") === "* * * * *"
      ? () => runKnowledgeCycle(env)
      : () => runIdentityCycle(env);
    ctx.waitUntil(run().catch((error) => {
      console.error(`[identity-ingestion] cycle failed: ${error?.stack || error}`);
    }));
  },
};
