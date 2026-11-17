"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const fileHash = (file) => hash(fs.readFileSync(file));

function main() {
  const repo = path.resolve(__dirname, "..");
  const dir = path.join(repo, "research/telegram-usernames/data");
  const reservationFile = path.join(dir, "username-secondary-forward-reservation-manifest-2026-09-20.json");
  const auditFile = path.join(dir, "username-secondary-integrity-2026-09-25-batch3.json");
  const priorSupplement = path.join(dir, "username-secondary-qualification-protocol-supplement-v2-2026-09-25.json");
  const output = path.join(dir, "username-secondary-qualification-protocol-supplement-v3-2026-09-25.json");
  if (fs.existsSync(output)) throw new Error("Secondary qualification protocol supplement already exists");
  const reservation = JSON.parse(fs.readFileSync(reservationFile, "utf8"));
  const audit = JSON.parse(fs.readFileSync(auditFile, "utf8"));
  if (audit.pricesOpened !== false || audit.qualification !== false) throw new Error("Protocol must be frozen before outcomes are opened");
  if (audit.directory !== reservation.window.directory || audit.from !== reservation.window.fromInclusive) throw new Error("Audit window mismatch");
  const files = ["scripts/evaluate-username-secondary-qualification.js", "scripts/seal-username-secondary-qualification.js"];
  const gates = { ...reservation.gates, premiumImprovementBootstrapLower95Minimum: 0,
    overallIntervalScoreRegressionMaximum: 0, candidateAvailabilityRegressionMaximum: 0 };
  const manifest = { schemaVersion: "username-secondary-qualification-protocol-supplement-v3",
    sealedBeforeOutcomeLabelsOpened: true, createdAt: new Date().toISOString(),
    supersedes: { file: path.basename(priorSupplement), sha256: fileHash(priorSupplement),
      reason: "The v2 evaluator still allocated large temporary histories during each target evaluation. No reserved outcome was opened. V3 adds bounded garbage collection, visible progress and a required exposed-GC invocation without changing target selection or model evidence." },
    reservation: { file: path.basename(reservationFile), sha256: fileHash(reservationFile) },
    priceBlindStateAtSeal: { audit: path.basename(auditFile), sha256: fileHash(auditFile), pricesOpened: false,
      uniqueEvents: audit.uniqueEvents, uniqueAssets: audit.uniqueAssets, cursor: audit.cursor },
    frozenFiles: Object.fromEntries(files.map((name) => [name, fileHash(path.join(repo, name))])), gates,
    evaluation: { baseline: "v25 with historical export only; reserved outcomes never enter baseline evidence",
      candidate: "same v25 plus only strictly earlier reserved secondary sales",
      simultaneousEventsExcluded: true, everyReservedEventAttempted: true, pairedCohortComparison: true,
      baselineGlobalModel: "fit once on the latest 30000 historical sales before the first reserved target",
      candidateGlobalModel: "fit on prior-only rolling 30000 sales at the first target and every 50 targets thereafter",
      ownHistory: "include every strictly prior same-username sale even when outside the rolling market history",
      invocation: "node --expose-gc --max-old-space-size=4096 scripts/evaluate-username-secondary-qualification.js",
      bootstrap: { clusteredBy: "nftAddress", iterations: 2000, seed: 25092026, confidence: 0.95 },
      terminalCondition: "first of exact 4000 unique events or 2026-10-20T00:00:00Z with caught-up cursor",
      oneTimeOutput: "username-secondary-qualification-result.json" },
    rationale: "The original pre-window reservation froze candidate behavior and gates but omitted the mechanical final evaluator. This replacement supplement corrects the evaluator's memory behavior while all reserved prices and premium counts remain unopened; it does not select events or change the original accuracy gates." };
  fs.writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
  console.log(JSON.stringify({ output: path.basename(output), sha256: fileHash(output), createdAt: manifest.createdAt,
    priceBlindStateAtSeal: manifest.priceBlindStateAtSeal, frozenFiles: manifest.frozenFiles, gates }, null, 2));
}

if (require.main === module) try { main(); } catch (error) { console.error(error.stack || error.message); process.exitCode = 1; }
