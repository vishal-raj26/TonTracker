const { execFileSync, spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const expectedRoot = path.resolve(
  process.env.TONTRACK_ACTIVE_ROOT ||
    "C:\\Users\\vishu\\Documents\\New project\\ton-portfolio-chart-platform",
);

if (root.toLowerCase() !== expectedRoot.toLowerCase()) {
  throw new Error(`Refusing to start from an inactive workspace: ${root}`);
}

function stopPort(port) {
  const command = [
    `$connections = Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue`,
    "$connections | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force }",
  ].join("; ");
  execFileSync("powershell.exe", ["-NoProfile", "-Command", command], {
    cwd: root,
    stdio: "ignore",
    windowsHide: true,
  });
}

stopPort(5177);

const output = fs.openSync(path.join(root, ".local-server.out.log"), "a");
const error = fs.openSync(path.join(root, ".local-server.err.log"), "a");
const child = spawn(process.execPath, ["server.js"], {
  cwd: root,
  detached: true,
  env: { ...process.env },
  stdio: ["ignore", output, error],
  windowsHide: true,
});
child.unref();
console.log(`[active-local] started ${root} pid=${child.pid}`);
