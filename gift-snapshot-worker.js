"use strict";

const {
  collectGiftFloorSnapshotsNow,
  getGiftSnapshotCollectorState
} = require("./server");

const intervalMs = Number(process.env.GIFT_SNAPSHOT_INTERVAL_MS || 60 * 60 * 1000);
let running = false;

function stamp() {
  return new Date().toISOString();
}

async function runSnapshot(reason) {
  if (running) {
    console.log(`[${stamp()}] Gift snapshot skipped; previous run still active`);
    return;
  }
  running = true;
  console.log(`[${stamp()}] Gift snapshot ${reason} started`);
  try {
    await collectGiftFloorSnapshotsNow();
    const state = getGiftSnapshotCollectorState();
    if (state.status === "error" || !state.total) {
      throw new Error(state.error || "No gift collections loaded");
    }
    console.log(
      `[${stamp()}] Gift snapshot complete: ${state.ok}/${state.total} ok, ${state.errors} errors`
    );
  } catch (error) {
    console.error(`[${stamp()}] Gift snapshot failed: ${error.message}`);
  } finally {
    running = false;
  }
}

console.log(`[${stamp()}] TonTrack gift snapshot worker running every ${Math.round(intervalMs / 60000)} minutes`);
runSnapshot("startup");

setInterval(() => {
  runSnapshot("scheduled");
}, intervalMs);

process.on("SIGINT", () => {
  console.log(`[${stamp()}] Gift snapshot worker stopping`);
  process.exit(0);
});
