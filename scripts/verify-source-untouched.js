const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const { source } = JSON.parse(fs.readFileSync(path.join(root, "docs", "chart-parity.json"), "utf8"));

function gitRaw(args, input) {
  return execFileSync("git", ["-C", source.path, ...args], {
    input,
    stdio: [input === undefined ? "ignore" : "pipe", "pipe", "ignore"],
  });
}

function git(args, input) {
  return gitRaw(args, input).toString("utf8").trim();
}

function inputHash(args) {
  return git(["hash-object", "--stdin"], gitRaw(args));
}

assert.equal(git(["rev-parse", "HEAD"]), source.head, "source HEAD changed");
assert.equal(inputHash(["diff", "--binary"]), source.trackedDiffHash, "source tracked files changed");
assert.equal(inputHash(["ls-files", "--others", "--exclude-standard"]), source.untrackedListHash, "source untracked files changed");
console.log("Original repository fingerprint unchanged.");
