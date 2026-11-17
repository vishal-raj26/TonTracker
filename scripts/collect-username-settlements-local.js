"use strict";

// Isolated research collector: no D1 client, worker scheduler or deployment.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { createTonCenterUsernameSettlementLedger } = require("../lib/toncenter-username-settlement-ledger");

function pageSize(argv) {
  const index = argv.indexOf("--page-size");
  const value = index < 0 ? 80 : Number(argv[index + 1]);
  if (!Number.isInteger(value) || value < 10 || value > 80) throw new Error("--page-size must be an integer from10 through80");
  return value;
}
function endTime(argv, from) {
  const index=argv.indexOf("--until");
  if(index<0)return null;
  const time=Date.parse(argv[index+1]||"");
  if(!Number.isFinite(time)||time<=Date.parse(from)||time>Date.now())throw new Error("--until must be after --from and no later than now");
  return Math.floor(time/1000);
}
function historicalMessageCount(directory) {
  return fs.readdirSync(directory).filter(name=>/^page-.*\.json$/.test(name)).reduce((sum,name)=>{
    const page=JSON.parse(fs.readFileSync(path.join(directory,name),"utf8"));
    const count=Number(page?.metadata?.messages);
    if(!Number.isInteger(count)||count<0)throw new Error(`Invalid message count in ${name}`);
    return sum+count;
  },0);
}

async function main() {
  const pageLimit = pageSize(process.argv);
  const fromIndex = process.argv.indexOf("--from");
  const from = fromIndex < 0 ? "2026-08-01T00:00:00Z" : process.argv[fromIndex + 1];
  if (!["2026-08-01T00:00:00Z", "2026-09-01T00:00:00Z", "2026-09-10T00:00:00Z", "2026-09-20T13:45:00Z"].includes(from)) throw new Error("Use one of the predeclared collection block starts");
  const historyEndUtime=endTime(process.argv,from);
  const suffix = from === "2026-09-20T13:45:00Z" ? "-forward"
    : from.startsWith("2026-08") ? "" : from.startsWith("2026-09-10") ? "-september-late" : "-september";
  const directory = path.resolve(__dirname, `../research/telegram-usernames/data/current-username-settlements${suffix}`);
  fs.mkdirSync(directory, { recursive: true });
  const statePath = path.join(directory, "state.json");
  const saved = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, "utf8")) : null;
  if (saved && (saved.schemaVersion !== "username-local-collection-v1" || saved.from !== from)) throw new Error("Incompatible local collection checkpoint");
  const recoverTimeOffset=process.argv.includes("--recover-time-offset");
  const paginationMode=saved?.cursor?.paginationMode==="time-offset"||recoverTimeOffset?"time-offset":"logical-time";
  const initialOffset=paginationMode==="time-offset"&&saved?.cursor?.paginationMode!=="time-offset"?historicalMessageCount(directory):0;
  const captured = { assets: [], sales: [] };
  const ledger = {
    readState: async () => saved ? { state: { cursor: saved.cursor } } : null,
    ingestAssets: async rows => { captured.assets.push(...rows); return rows.length; },
    ingestSales: async rows => { captured.sales.push(...rows); return rows.length; },
    writeState: async (pipeline, cursor, metadata) => {
      const report = { schemaVersion: "username-local-collection-v1", from, pipeline,
        collectedAt: new Date().toISOString(), cursor, metadata, ...captured };
      const bytes = JSON.stringify(report, null, 2) + "\n";
      const file = `page-${Date.now()}-${crypto.randomUUID()}.json`;
      fs.writeFileSync(path.join(directory, file), bytes, { flag: "wx" });
      const next = { schemaVersion: report.schemaVersion, from, cursor, metadata,
        latestPage: file, latestPageSha256: crypto.createHash("sha256").update(bytes).digest("hex") };
      const temporary = `${statePath}.${crypto.randomUUID()}.tmp`;
      fs.writeFileSync(temporary, JSON.stringify(next, null, 2) + "\n", { flag: "wx" });
      fs.renameSync(temporary, statePath);
    },
  };
  const collector = createTonCenterUsernameSettlementLedger({ ledger,
    historyStartUtime: Date.parse(from) / 1000, historyEndUtime, pageLimit, paginationMode, initialOffset });
  // Single bounded page per invocation. Raw prices stay on disk, unopened for
  // candidate tuning; qualification eligibility still needs a manifest audit.
  console.log(JSON.stringify(await collector.runPage()));
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { pageSize, endTime, historicalMessageCount };
