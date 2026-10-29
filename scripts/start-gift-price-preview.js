"use strict";
const { spawnSync, spawn } = require("node:child_process");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const expected = "C:\\Users\\vishu\\Documents\\New project\\ton-portfolio-chart-platform";
if (root.toLowerCase() !== expected.toLowerCase()) throw new Error("Inactive TonTrack workspace");
if (process.env.NODE_ENV === "production" || process.env.RAILWAY_PROJECT_ID) throw new Error("Local UI preview only");
const stop = spawnSync("powershell.exe", ["-NoProfile", "-Command",
  "Get-NetTCPConnection -LocalPort 5177 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force }"],
  { cwd: root, windowsHide: true });
if (stop.status && stop.status !== 1) throw new Error("Could not stop port 5177 listener");
const child = spawn(process.execPath, ["server.js"], { cwd: root, windowsHide: true, stdio: "inherit",
  env: { ...process.env, PORT: "5177", TONTRACK_GIFT_PRICE_PREVIEW: "1" } });
child.on("exit", (code) => { process.exitCode = code; });
