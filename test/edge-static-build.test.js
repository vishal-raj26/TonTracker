"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

function fixture(t, extraHtml = "") {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tontrack-edge-build-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (file, value = file) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), value);
  };
  write("scripts/build-edge-static-assets.js", fs.readFileSync(path.join(__dirname, "../scripts/build-edge-static-assets.js")));
  write("lib/static-policy.js", fs.readFileSync(path.join(__dirname, "../lib/static-policy.js")));
  for (const file of ["styles.css", "styles-product-v2.css", "styles-terminal-system.css", "styles-ui-restoration.css", "styles-reference-ui.css", "app.js", "chart-platform.js", "terminal-system.js", "future-screen.css", "assets/branding/logo.png", "assets/gift-layer-registry.json", "assets/gifts/models/model.json", "node_modules/chart.js/dist/chart.umd.js", "node_modules/lottie-web/build/player/lottie.min.js"]) write(file);
  write("index.html", `<link rel="stylesheet" href="./styles-ui-restoration.css?v=1"><link href='./styles-reference-ui.css#theme' rel='stylesheet'><script src="./app.js?v=1"></script><script src="./node_modules/chart.js/dist/chart.umd.js"></script><script src="https://example.com/external.js"></script>${extraHtml}`);
  return { root, write, run: () => spawnSync(process.execPath, [path.join(root, "scripts/build-edge-static-assets.js")], { encoding: "utf8" }), output: file => path.join(root, ".edge-static", file) };
}

test("build includes every approved local HTML entry stylesheet", t => {
  const f = fixture(t);
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  for (const file of ["styles-ui-restoration.css", "styles-reference-ui.css"]) {
    assert.equal(fs.existsSync(f.output(file)), true, `missing emitted stylesheet: ${file}`);
    assert.equal(fs.readFileSync(f.output(file), "utf8"), file);
  }
});

test("build keeps public layered media and required vendors without private files", t => {
  const f = fixture(t);
  for (const file of [".env", "runtime/wallet.json", "assets/.env", "assets/private.json", "assets/gifts/credentials.json", "server.js"]) f.write(file, "SECRET");
  assert.equal(f.run().status, 0);
  for (const file of ["assets/branding/logo.png", "assets/gift-layer-registry.json", "assets/gifts/models/model.json", "node_modules/chart.js/dist/chart.umd.js", "assets/vendor/lottie.min.js"]) assert.equal(fs.existsSync(f.output(file)), true, file);
  for (const file of [".env", "runtime/wallet.json", "assets/.env", "assets/private.json", "assets/gifts/credentials.json", "server.js"]) assert.equal(fs.existsSync(f.output(file)), false, file);
});

for (const source of ["../outside.css", "%2e%2e/outside.css", "./runtime/private.js", "./.env", "./server.js", "/future-screen.css?v=2", "./assets/branding/../../server.js", "file:///private.css", "C:/private.css"]) {
  test(`build rejects unsafe local entry ${source} before replacing output`, t => {
    const f = fixture(t, `<script src="${source}"></script>`);
    f.write("server.js", "PRIVATE SERVER");
    f.write(".edge-static/previous.txt", "previous");
    assert.notEqual(f.run().status, 0);
    assert.equal(fs.readFileSync(f.output("previous.txt"), "utf8"), "previous");
  });
}

test("build rejects asset and output symlinks without changing their targets", t => {
  const f = fixture(t);
  f.write("outside/keep.txt", "keep");
  fs.symlinkSync(path.join(f.root, "outside"), f.output(""), "junction");
  assert.notEqual(f.run().status, 0);
  assert.equal(fs.readFileSync(path.join(f.root, "outside/keep.txt"), "utf8"), "keep");
  fs.unlinkSync(f.output(""));
  fs.symlinkSync(path.join(f.root, "outside"), path.join(f.root, "assets/branding/linked"), "junction");
  assert.notEqual(f.run().status, 0);
});
