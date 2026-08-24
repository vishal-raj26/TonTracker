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

function railwayVariables() {
  const output = execFileSync(
    process.env.ComSpec || "cmd.exe",
    [
      "/d",
      "/s",
      "/c",
      "railway.cmd variables --service Postgres --environment production --json",
    ],
    { cwd: root, encoding: "utf8", windowsHide: true },
  );
  return JSON.parse(output);
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

const variables = railwayVariables();
const user = encodeURIComponent(variables.PGUSER);
const password = encodeURIComponent(variables.PGPASSWORD);
const host = variables.RAILWAY_TCP_PROXY_DOMAIN;
const port = variables.RAILWAY_TCP_PROXY_PORT;
const database = encodeURIComponent(variables.PGDATABASE);

if (!user || !password || !host || !port || !database) {
  throw new Error("Railway PostgreSQL public proxy is not configured");
}

stopPort(5177);

const output = fs.openSync(path.join(root, ".local-server.out.log"), "a");
const error = fs.openSync(path.join(root, ".local-server.err.log"), "a");
const child = spawn(process.execPath, ["server.js"], {
  cwd: root,
  detached: true,
  env: {
    ...process.env,
    DNS_DATABASE_URL: `postgresql://${user}:${password}@${host}:${port}/${database}?uselibpqcompat=true&sslmode=require`,
    DNS_PORTFOLIO_ESTIMATES_ENABLED: "1",
  },
  stdio: ["ignore", output, error],
  windowsHide: true,
});
child.unref();
console.log(`[active-local] started ${root} pid=${child.pid}`);
