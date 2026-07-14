const { spawn } = require("child_process");

const requestedComboWorker = process.env.GIFT_COMBO_CONTINUOUS === "1";
const requestedSalesWorker = process.env.GIFT_SALES_CONTINUOUS === "1";
const hasComboWorkerConfig = Boolean(process.env.D1_REGISTRY_URL && process.env.D1_INGEST_SECRET);
const hasTelegramWebViewAuth = Boolean(process.env.TELEGRAM_API_ID && process.env.TELEGRAM_API_HASH && process.env.TELEGRAM_SESSION);
const hasSalesWorkerConfig = Boolean(hasComboWorkerConfig && (process.env.GIFT_SATELLITE_INIT_DATA || hasTelegramWebViewAuth));
const isComboWorker = requestedComboWorker && hasComboWorkerConfig;
const isSalesWorker = requestedSalesWorker && hasSalesWorkerConfig;

if (requestedComboWorker && requestedSalesWorker) {
  console.error("[railway-start] GIFT_COMBO_CONTINUOUS and GIFT_SALES_CONTINUOUS require separate Railway services");
  process.exit(1);
}

if (requestedComboWorker && !hasComboWorkerConfig) {
  console.warn("[railway-start] combo-worker requested without D1_REGISTRY_URL and D1_INGEST_SECRET; starting app-server instead");
}
if (requestedSalesWorker && !hasSalesWorkerConfig) {
  console.warn("[railway-start] sales-worker requested without GiftSatellite WebApp auth, D1_REGISTRY_URL, and D1_INGEST_SECRET; starting app-server instead");
}
const selectedMode = isSalesWorker ? "sales-worker" : (isComboWorker ? "combo-worker" : "app-server");
console.log(`[railway-start] ${selectedMode} selected`);

const command = process.execPath;
const args = isSalesWorker
  ? ["scripts/snapshot-gift-sales.js", "--continuous"]
  : isComboWorker
    ? ["scripts/snapshot-gift-combos.js", "--continuous"]
    : ["server.js"];
const childEnv = { ...process.env };

if (isSalesWorker) {
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
    if (!isComboWorker && !isSalesWorker) process.exit(code ?? 0);
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
