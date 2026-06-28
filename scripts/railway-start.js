const { spawn } = require("child_process");

const requestedComboWorker = process.env.GIFT_COMBO_CONTINUOUS === "1";
const hasComboWorkerConfig = Boolean(process.env.D1_REGISTRY_URL && process.env.D1_INGEST_SECRET);
const isComboWorker = requestedComboWorker && hasComboWorkerConfig;

if (requestedComboWorker && !hasComboWorkerConfig) {
  console.warn("[railway-start] combo-worker requested without D1_REGISTRY_URL and D1_INGEST_SECRET; starting app-server instead");
}
console.log(`[railway-start] ${isComboWorker ? "combo-worker" : "app-server"} selected`);

const command = process.execPath;
const args = isComboWorker
  ? ["scripts/snapshot-gift-combos.js", "--continuous"]
  : ["server.js"];
const childEnv = { ...process.env };

if (isComboWorker) {
  childEnv.TONTRACK_MODE = "gift-combo-worker";
  childEnv.GIFT_COMBO_MARKETS = childEnv.GIFT_COMBO_MARKETS || "PORTALS,MRKT,TONNEL,GETGEMS,THERMOS";
} else {
  childEnv.TONTRACK_MODE = "app-server";
  childEnv.GIFT_SNAPSHOT_AUTORUN = "0";
}

const child = spawn(command, args, { stdio: "inherit", env: childEnv });

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
