"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const output = path.join(root, ".edge-static");
const copy = (source, target) => {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
};
const copyTree = (source, target) => {
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);
    if (entry.isDirectory()) copyTree(from, to);
    else if (entry.isFile()) copy(from, to);
  }
};

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
for (const file of ["index.html", "styles.css", "styles-product-v2.css", "styles-terminal-system.css", "app.js", "chart-platform.js", "terminal-system.js"]) {
  copy(path.join(root, file), path.join(output, file));
}
for (const file of ["preview-home.png"]) {
  if (fs.existsSync(path.join(root, file))) copy(path.join(root, file), path.join(output, file));
}
copyTree(path.join(root, "assets"), path.join(output, "assets"));
copy(path.join(root, "node_modules", "chart.js", "dist", "chart.umd.js"), path.join(output, "node_modules", "chart.js", "dist", "chart.umd.js"));
copy(path.join(root, "node_modules", "lottie-web", "build", "player", "lottie.min.js"), path.join(output, "assets", "vendor", "lottie.min.js"));
console.log(`[edge-static] built ${output}`);
