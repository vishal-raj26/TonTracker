import usernameLedger from "../scripts/rebuild-username-ledger.js";
import usernameSettlementModule from "../lib/toncenter-username-settlement-ledger.js";
import dnsLedgerModule from "../lib/dns-toncenter-ledger.js";
import baselineModule from "../scripts/refresh-identity-baselines.js";
import usernameKnowledgeModule from "../lib/username-knowledge.js";
import dnsStructuralModule from "../lib/dns-structural.js";
import dnsEngineModule from "../lib/dns-engine.js";

let dnsLedger = dnsLedgerModule.createDnsTonCenterLedger();
let usernameSettlementLedger = usernameSettlementModule.createTonCenterUsernameSettlementLedger();
let checkpointLedger = dnsLedgerModule.createLedgerClient();
const REFRESH_PIPELINE_KEY = "identity-baseline-refresh-v1";
const REFRESH_RUNNING_STALE_MS = 20 * 60 * 1000;
const { SCHEMA_VERSION: USERNAME_KNOWLEDGE_SCHEMA_VERSION, resolveUsernameKnowledge } = usernameKnowledgeModule;
const { classifyTonDns } = dnsStructuralModule;
const { dnsLengthBucket } = dnsEngineModule;

function configureRuntime(env) {
  if (!env.REGISTRY) return;
  const fetchImpl = (input, init) => env.REGISTRY.fetch(input, init);
  const clientOptions = { fetch: fetchImpl, secret: env.D1_INGEST_SECRET };
  usernameLedger.configureLedger(clientOptions);
  baselineModule.configureLedger(clientOptions);
  checkpointLedger = dnsLedgerModule.createLedgerClient(clientOptions);
  usernameSettlementLedger = usernameSettlementModule.createTonCenterUsernameSettlementLedger({
    ledger: dnsLedgerModule.createLedgerClient(clientOptions),
  });
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

async function runUsernameSettlementCycle() {
  const startedAt = new Date().toISOString();
  return { startedAt, completedAt: new Date().toISOString(), ...(await usernameSettlementLedger.runPage()) };
}

async function runDnsCycle() {
  const startedAt = new Date().toISOString();
  return { startedAt, completedAt: new Date().toISOString(), ...(await dnsLedger.runPage()) };
}

async function runRefreshCycle(force = false) {
  const now = Date.now();
  const intervalMs = Math.max(60 * 60 * 1000, Number(process.env.IDENTITY_BASELINE_REFRESH_INTERVAL_MS || 6 * 60 * 60 * 1000));
  const read = await checkpointLedger.readState(REFRESH_PIPELINE_KEY);
  const state = read?.state || read || {};
  const metadata = state?.metadata || state?.metadata_json || {};
  const lastCompletedAt = Date.parse(metadata.lastCompletedAt || "");
  const runningAt = Date.parse(metadata.startedAt || "");
  if (!force && Number.isFinite(lastCompletedAt) && now - lastCompletedAt < intervalMs) {
    return { ok: true, skipped: true, pipeline: REFRESH_PIPELINE_KEY, nextAt: new Date(lastCompletedAt + intervalMs).toISOString() };
  }
  if (!force && metadata.status === "running" && Number.isFinite(runningAt) && now - runningAt < REFRESH_RUNNING_STALE_MS) {
    return { ok: true, skipped: true, pipeline: REFRESH_PIPELINE_KEY, reason: "refresh-in-progress" };
  }
  const nextKind = metadata.nextKind === "dns" ? "dns" : "username";
  const startedAt = new Date(now).toISOString();
  await checkpointLedger.writeState(REFRESH_PIPELINE_KEY, { phase: "running", kind: nextKind, startedAt }, {
    status: "running", startedAt, nextKind,
    recoveredStaleRun: metadata.status === "running" && Number.isFinite(runningAt) && now - runningAt >= REFRESH_RUNNING_STALE_MS,
  });
  try {
    const result = await baselineModule.refreshKind(nextKind, { aggregateSource: true, writeExactValuations: false });
    const lastCompleted = new Date().toISOString();
    if (nextKind === "username") {
      await checkpointLedger.writeState(REFRESH_PIPELINE_KEY, { phase: "pending", nextKind: "dns", usernameCompletedAt: lastCompleted }, {
        status: "partial", startedAt, usernameCompletedAt: lastCompleted, usernameSales: result.sales, nextKind: "dns",
      });
      return { ok: true, pipeline: REFRESH_PIPELINE_KEY, startedAt, completedAt: lastCompleted, username: result, pending: "dns" };
    }
    await checkpointLedger.writeState(REFRESH_PIPELINE_KEY, { phase: "complete", lastCompletedAt: lastCompleted }, {
      status: "complete", startedAt, lastCompletedAt: lastCompleted, dnsSales: result.sales, nextKind: "username",
      usernameCompletedAt: metadata.usernameCompletedAt || null,
    });
    return { ok: true, pipeline: REFRESH_PIPELINE_KEY, startedAt, completedAt: lastCompleted, dns: result };
  } catch (error) {
    await checkpointLedger.writeState(REFRESH_PIPELINE_KEY, { phase: "failed", kind: nextKind, startedAt }, {
      status: "failed", startedAt, failedAt: new Date().toISOString(), nextKind, error: String(error?.message || error).slice(0, 240),
    });
    throw error;
  }
}

function classificationOptions(knowledge, name) {
  const label = String(name || "").replace(/\.ton$/i, "");
  return {
    dictionaryWords: knowledge.dictionaryMatch ? [label] : [],
    entityHints: knowledge.entityMarketVerified === true ? [label] : [],
  };
}

function knowledgeBatchSize(env, key, fallback, maximum) {
  return Math.max(1, Math.min(maximum, Number(env[key]) || fallback));
}

async function runKnowledgeKind(env, assetKind, limit = 4, options = {}) {
  const mode = options.fast ? "fast" : "full";
  const headers = { "content-type": "application/json", authorization: `Bearer ${env.D1_INGEST_SECRET}` };
  const queued = await env.REGISTRY.fetch("https://registry/identity/knowledge/queue", {
    method: "POST", headers, body: JSON.stringify({ limit, assetKind, mode }),
  });
  if (!queued.ok) throw new Error(`knowledge queue ${queued.status}`);
  const payload = await queued.json();
  const records = [];
  for (const row of payload.records || []) {
    const lookupName = assetKind === "dns" ? String(row.normalized_name || "").replace(/\.ton$/i, "") : row.normalized_name;
    const knowledge = await resolveUsernameKnowledge(lookupName, {
      fetch, fast: options.fast === true, maxAttempts: 1,
    });
    if (assetKind === "dns") {
      knowledge.schemaVersion = "dns-knowledge-v1";
      knowledge.dnsClassificationVersion = "dns-semantic-route-v2";
    }
    const classification = assetKind === "dns"
      ? classifyTonDns(row.normalized_name, classificationOptions(knowledge, row.normalized_name))
      : null;
    records.push({
      assetKind, assetKey: row.asset_key, normalizedName: row.normalized_name, knowledge, classification,
      lengthBucket: classification ? dnsLengthBucket(classification.characterLength) : undefined,
    });
    await new Promise((resolve) => setTimeout(resolve, options.fast ? 240 : 650));
  }
  let written = 0;
  if (records.length) {
    const write = await env.REGISTRY.fetch("https://registry/ingest/identity-knowledge", {
      method: "POST", headers, body: JSON.stringify({ records }),
    });
    if (!write.ok) throw new Error(`knowledge ingest ${write.status}`);
    const result = await write.json();
    written = Math.floor(Number(result.written || 0) / 2);
  }
  return { ok: true, assetKind, mode, inspected: (payload.records || []).length, written };
}

async function runKnowledgeCycle(env) {
  // Fast lexical coverage is cheap enough to pre-feed the broad market. Full
  // enrichment remains deliberately smaller because it includes Wikipedia and
  // pageview calls. Running sequentially prevents source bursts and stays
  // under the Worker subrequest ceiling.
  const usernameFast = await runKnowledgeKind(env, "username", knowledgeBatchSize(env, "USERNAME_KNOWLEDGE_FAST_BATCH_SIZE", 8, 8), { fast: true });
  const dnsFast = await runKnowledgeKind(env, "dns", knowledgeBatchSize(env, "DNS_KNOWLEDGE_FAST_BATCH_SIZE", 2, 2), { fast: true });
  const usernameFull = await runKnowledgeKind(env, "username", knowledgeBatchSize(env, "USERNAME_KNOWLEDGE_FULL_BATCH_SIZE", 2, 2));
  const dnsFull = await runKnowledgeKind(env, "dns", knowledgeBatchSize(env, "DNS_KNOWLEDGE_FULL_BATCH_SIZE", 1, 1));
  return {
    ok: usernameFast.ok && dnsFast.ok && usernameFull.ok && dnsFull.ok,
    username: { fast: usernameFast, full: usernameFull },
    dns: { fast: dnsFast, full: dnsFull },
  };
}

async function runIdentityCycle(env) {
  const jobs = {
    username: () => runUsernameCycle(),
    usernameSettlements: () => runUsernameSettlementCycle(),
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
    if (url.pathname === "/run/username-settlements" && request.method === "POST") {
      if (!authorized(request, env)) return json({ error: "Unauthorized" }, 401);
      try {
        return json(await runUsernameSettlementCycle());
      } catch (error) {
        return json({ ok: false, pipeline: usernameSettlementModule.PIPELINE_KEY, error: String(error?.message || error).slice(0, 300) }, 503);
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
        return json({ ok: false, pipeline: USERNAME_KNOWLEDGE_SCHEMA_VERSION, error: String(error?.message || error).slice(0, 300) }, 503);
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
