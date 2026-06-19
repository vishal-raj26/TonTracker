const { spawn } = require("child_process");

const isComboWorker = process.env.GIFT_COMBO_CONTINUOUS === "1";
const command = process.execPath;
const args = isComboWorker
  ? ["scripts/snapshot-gift-combos.js", "--continuous"]
  : ["server.js"];

const child = spawn(command, args, { stdio: "inherit" });

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
