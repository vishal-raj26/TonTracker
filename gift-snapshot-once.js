"use strict";

const {
  collectGiftFloorSnapshotsNow,
  getGiftSnapshotCollectorState
} = require("./server");

function stamp() {
  return new Date().toISOString();
}

(async () => {
  console.log(`[${stamp()}] Gift snapshot one-shot started`);
  try {
    await collectGiftFloorSnapshotsNow({ force: true });
    const state = getGiftSnapshotCollectorState();
    if (state.status === "error" || !state.total) {
      throw new Error(state.error || "No gift collections loaded");
    }
    console.log(`[${stamp()}] Gift snapshot one-shot complete: ${state.ok}/${state.total} ok, ${state.errors} errors`);
    process.exit(0);
  } catch (error) {
    console.error(`[${stamp()}] Gift snapshot one-shot failed: ${error.message}`);
    process.exit(1);
  }
})();
