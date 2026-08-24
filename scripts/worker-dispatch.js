const { spawn } = require("child_process");

const roleArgumentIndex = process.argv.indexOf("--role");
const roleArgument = roleArgumentIndex >= 0 ? process.argv[roleArgumentIndex + 1] : "";
const requestedRole = String(process.env.TONTRACK_WORKER_ROLE || roleArgument || "").trim();
const boundedTimeoutMs = Math.max(60_000, Number(process.env.TONTRACK_BOUNDED_TIMEOUT_MS || 4 * 60 * 1000));
const roles = {
  "gift-floor": { script: "scripts/snapshot-gift-combos.js", args: [] },
  "gift-sales": { script: "scripts/snapshot-gift-sales.js", args: ["--once"] },
  "gift-estimate-history": {
    script: "server.js",
    args: [],
    env: { TONTRACK_MODE: "estimate-history-once" },
  },
  "username-market": { script: "scripts/rebuild-username-ledger.js", args: [] },
  "identity-baselines": { script: "scripts/refresh-identity-baselines.js", args: [] },
};

const job = roles[requestedRole];
if (!job) {
  console.error(`[worker-dispatch] choose one role: ${Object.keys(roles).join(", ")}`);
  process.exit(2);
}

console.log(`[worker-dispatch] starting ${requestedRole}`);
const child = spawn(process.execPath, [job.script, ...job.args], {
  stdio: "inherit",
  env: { ...process.env, ...(job.env || {}), TONTRACK_WORKER_ROLE: requestedRole },
});
let childExited = false;

const timeout = setTimeout(() => {
  console.error(`[worker-dispatch] ${requestedRole} exceeded ${boundedTimeoutMs}ms; terminating bounded run`);
  child.kill("SIGTERM");
  setTimeout(() => {
    if (!childExited) child.kill("SIGKILL");
  }, 5_000).unref();
}, boundedTimeoutMs);
timeout.unref();

["SIGINT", "SIGTERM"].forEach((signal) => {
  process.on(signal, () => child.kill(signal));
});

child.on("exit", (code, signal) => {
  childExited = true;
  clearTimeout(timeout);
  if (signal) process.exit(1);
  process.exit(code ?? 1);
});
