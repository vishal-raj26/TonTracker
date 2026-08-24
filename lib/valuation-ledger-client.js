"use strict";

function createValuationLedgerClient(options = {}) {
  const baseUrl = String(options.baseUrl || process.env.D1_REGISTRY_URL || process.env.VALUATION_READ_MODEL_URL || "").replace(/\/+$/, "");
  const secret = String(options.secret || process.env.D1_INGEST_SECRET || "").trim();
  const fetchImpl = options.fetch || fetch;
  if (!baseUrl) throw new Error("D1_REGISTRY_URL or VALUATION_READ_MODEL_URL is required");

  async function request(path, init = {}, authorized = false) {
    const headers = { accept: "application/json", ...(init.body ? { "content-type": "application/json" } : {}), ...(init.headers || {}) };
    if (authorized) {
      if (!secret) throw new Error("D1_INGEST_SECRET is required for ledger writes");
      headers.authorization = `Bearer ${secret}`;
    }
    const response = await fetchImpl(`${baseUrl}${path}`, { ...init, headers, signal: init.signal || AbortSignal.timeout(45_000) });
    const text = await response.text();
    let payload;
    try { payload = text ? JSON.parse(text) : {}; } catch { payload = { error: text }; }
    if (!response.ok) throw new Error(`${path} returned ${response.status}: ${payload.error || text}`);
    return payload;
  }

  async function write(path, records) {
    const rows = Array.isArray(records) ? records : [];
    let accepted = 0;
    for (let index = 0; index < rows.length; index += 500) {
      const result = await request(path, { method: "POST", body: JSON.stringify({ records: rows.slice(index, index + 500) }) }, true);
      accepted += Number(result.inserted ?? result.written ?? result.changed ?? result.accepted ?? 0);
    }
    return accepted;
  }

  async function readAliases(assetKind, names = []) {
    const values = [...new Set((Array.isArray(names) ? names : []).map(String).filter(Boolean))];
    const records = [];
    for (let index = 0; index < values.length; index += 100) {
      const page = await request("/identity/aliases/read", {
        method: "POST", body: JSON.stringify({ assetKind, names: values.slice(index, index + 100) }),
      });
      records.push(...(page.records || []));
    }
    return { records };
  }

  return {
    ingestAssets: (records) => write("/ingest/identity-assets", records),
    ingestAliases: (records) => write("/ingest/identity-aliases", records),
    ingestSales: (records) => write("/ingest/identity-sales", records),
    ingestBaselines: (records) => write("/ingest/identity-baselines", records),
    ingestMarket: (records) => write("/ingest/identity-market", records),
    ingestValuations: (records) => write("/ingest/valuations", records),
    readBaselines: (assetKind, estimatorVersion) => request("/identity/baselines/read", {
      method: "POST", body: JSON.stringify({ assetKind, estimatorVersion }),
    }),
    readSales: (assetKind, cursor = null, limit = 5000) => request("/identity/sales/read", {
      method: "POST", body: JSON.stringify({ assetKind, cursor, limit }),
    }),
    readBaselineSource: (assetKind, trainingLimit = 2048) => request("/identity/baseline-source/read", {
      method: "POST", body: JSON.stringify({ assetKind, trainingLimit }),
    }, true),
    readAliases,
    readState: (pipelineKey) => request(`/identity/state?key=${encodeURIComponent(pipelineKey)}`),
    writeState: (pipelineKey, cursor, metadata = {}) => request("/ingest/identity-state", {
      method: "POST", body: JSON.stringify({ pipelineKey, cursor, metadata }),
    }, true),
    maintain: () => request("/maintenance/identity-storage", { method: "POST", body: "{}" }, true),
  };
}

module.exports = { createValuationLedgerClient };
