const { spawn } = require("child_process");

const dispatchedRole = String(process.env.TONTRACK_WORKER_ROLE || "").trim();

const requestedComboWorker = process.env.GIFT_COMBO_CONTINUOUS === "1";
const requestedSalesWorker = process.env.GIFT_SALES_CONTINUOUS === "1";
const requestedTelegramFloorWorker = process.env.TELEGRAM_FLOOR_CONTINUOUS === "1";
const requestedEstimateHistoryWorker = process.env.ESTIMATE_HISTORY_CONTINUOUS === "1";
const requestedUsernameIngestWorker = process.env.USERNAME_INGEST_CONTINUOUS === "1";
const requestedRetiredIdentityWorker = [
  "DNS_PIPELINE_CONTINUOUS",
  "DNS_RATE_CONTINUOUS",
  "USERNAME_PIPELINE_CONTINUOUS",
  "USERNAME_SEMANTIC_CONTINUOUS",
].some((name) => process.env[name] === "1");
const hasComboWorkerConfig = Boolean(process.env.D1_REGISTRY_URL && process.env.D1_INGEST_SECRET);
const hasTelegramWebViewAuth = Boolean(process.env.TELEGRAM_API_ID && process.env.TELEGRAM_API_HASH && process.env.TELEGRAM_SESSION);
const hasSalesWorkerConfig = Boolean(hasComboWorkerConfig && (process.env.GIFT_SATELLITE_INIT_DATA || hasTelegramWebViewAuth));
const isComboWorker = requestedComboWorker && hasComboWorkerConfig;
const isSalesWorker = requestedSalesWorker && hasSalesWorkerConfig;
const isEstimateHistoryWorker = requestedEstimateHistoryWorker && hasComboWorkerConfig;
const hasIdentityLedgerConfig = Boolean(process.env.D1_REGISTRY_URL && process.env.D1_INGEST_SECRET);
const isUsernameIngestWorker = requestedUsernameIngestWorker && hasIdentityLedgerConfig;

if (requestedTelegramFloorWorker) {
  console.log("[railway-start] telegram-floor-worker retired; exiting without fetching Telegram Marketplace floors");
  process.exit(0);
}
if (!dispatchedRole && requestedRetiredIdentityWorker) {
  console.error("[railway-start] PostgreSQL identity workers are retired; use dns-d1-ingest-cron, username-market, and identity-baselines");
  process.exit(2);
}

const requestedWorkerCount = [requestedComboWorker, requestedSalesWorker, requestedEstimateHistoryWorker, requestedUsernameIngestWorker].filter(Boolean).length;
if (!dispatchedRole && requestedWorkerCount > 1) {
  console.error("[railway-start] workers require separate Railway services");
  process.exit(1);
}

if (requestedComboWorker && !hasComboWorkerConfig) {
  console.warn("[railway-start] combo-worker requested without D1_REGISTRY_URL and D1_INGEST_SECRET; starting app-server instead");
}
if (requestedSalesWorker && !hasSalesWorkerConfig) {
  console.warn("[railway-start] sales-worker requested without GiftSatellite WebApp auth, D1_REGISTRY_URL, and D1_INGEST_SECRET; starting app-server instead");
}
if (requestedEstimateHistoryWorker && !hasComboWorkerConfig) {
  console.warn("[railway-start] estimate-history worker requested without D1 registry configuration; starting app-server instead");
}
if (requestedUsernameIngestWorker && !isUsernameIngestWorker) {
  console.warn("[railway-start] username-ingest worker needs D1_REGISTRY_URL and D1_INGEST_SECRET; starting app-server instead");
}
const selectedMode = dispatchedRole
  ? `bounded-${dispatchedRole}`
  : isUsernameIngestWorker
  ? "username-ingest-worker"
  : isEstimateHistoryWorker
  ? "estimate-history-worker"
  : isSalesWorker
    ? "sales-worker"
    : (isComboWorker ? "combo-worker" : "app-server");
console.log(`[railway-start] ${selectedMode} selected`);

const command = process.execPath;
const args = dispatchedRole
  ? ["scripts/worker-dispatch.js", "--role", dispatchedRole]
  : isUsernameIngestWorker
  ? ["scripts/rebuild-username-ledger.js", "--continuous"]
  : isEstimateHistoryWorker
  ? ["server.js"]
  : isSalesWorker
  ? ["scripts/snapshot-gift-sales.js", "--continuous"]
  : isComboWorker
    ? ["scripts/snapshot-gift-combos.js", "--continuous"]
    : ["server.js"];
const childEnv = { ...process.env };

if (isUsernameIngestWorker) {
  childEnv.TONTRACK_MODE = "username-ingest-worker";
} else if (isEstimateHistoryWorker) {
  childEnv.TONTRACK_MODE = "estimate-history-worker";
} else if (isSalesWorker) {
  childEnv.TONTRACK_MODE = "gift-sales-worker";
} else if (isComboWorker) {
  childEnv.TONTRACK_MODE = "gift-combo-worker";
  childEnv.GIFT_COMBO_MARKETS = childEnv.GIFT_COMBO_MARKETS || "AGGREGATE";
  childEnv.GIFT_COMBO_SCAN_BACKDROPS = childEnv.GIFT_COMBO_SCAN_BACKDROPS || "1";
} else {
  childEnv.TONTRACK_MODE = "app-server";
  childEnv.GIFT_SNAPSHOT_AUTORUN = "0";
}

let shuttingDown = false;
let child = null;

function startChild() {
  child = spawn(command, args, { stdio: "inherit", env: childEnv });

  child.on("exit", (code, signal) => {
    if (shuttingDown) process.exit(code ?? 0);
    if (dispatchedRole) process.exit(code ?? 0);
    if (!isComboWorker && !isSalesWorker && !isEstimateHistoryWorker && !isUsernameIngestWorker) process.exit(code ?? 0);
    console.error(`[railway-start] ${selectedMode} exited (${signal || code}); restarting in 10s`);
    setTimeout(startChild, 10000);
  });
}

["SIGINT", "SIGTERM"].forEach((signal) => {
  process.on(signal, () => {
    shuttingDown = true;
    if (child && !child.killed) {
      child.kill(signal);
      return;
    }
    process.exit(0);
  });
});

startChild();
