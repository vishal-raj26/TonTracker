"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { resolveStaticPath } = require("../lib/static-policy");

const root = fs.realpathSync(path.resolve(__dirname, ".."));
const output = path.resolve(root, ".edge-static");
const files = new Map();
const chart = "node_modules/chart.js/dist/chart.umd.js";
const lottie = "node_modules/lottie-web/build/player/lottie.min.js";

function safePath(relative) {
  if (!relative || relative.split("/").some(part => !/^[a-zA-Z0-9_-][a-zA-Z0-9._-]*$/.test(part)) || relative.includes(":")) {
    throw new Error(`Unsafe static path: ${relative}`);
  }
  const resolved = path.resolve(root, relative);
  if (!resolved.startsWith(root + path.sep)) throw new Error(`Static path escapes project: ${relative}`);
  let current = root;
  for (const part of relative.split("/")) {
    current = path.join(current, part);
    if (fs.lstatSync(current).isSymbolicLink()) throw new Error(`Static symlink rejected: ${relative}`);
  }
  return resolved;
}

function add(file, target = file) {
  const source = safePath(file);
  if (resolveStaticPath(root, `/${target}`) !== source) throw new Error(`Non-public static entry: ${file}`);
  if (!fs.statSync(source).isFile()) throw new Error(`Static entry is not a file: ${file}`);
  files.set(target, source);
}

function addEntry(value) {
  if (/^(?:https?:)?\/\//i.test(value)) return;
  let file = value.split(/[?#]/, 1)[0];
  // Do not URL-normalize first: it hides traversal and encoded separators.
  if (file.startsWith("./")) file = file.slice(2);
  else if (file.startsWith("/")) file = file.slice(1);
  if (!resolveStaticPath(root, `/${file}`)) {
    throw new Error(`Non-public HTML entry: ${value}`);
  }
  add(file);
}

add("index.html");
const html = fs.readFileSync(files.get("index.html"), "utf8").replace(/<!--[\s\S]*?-->/g, "");
// Read ordinary HTML attributes; external URLs remain external.
for (const match of html.matchAll(/<(script|link|img|source|video)\b((?:"[^"]*"|'[^']*'|[^'">])*)>/gi)) {
  const attribute = match[1].toLowerCase() === "link" ? "href" : "src";
  const value = new RegExp(`(?:^|\\s)${attribute}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(match[2]);
  if (value) addEntry(value[1] ?? value[2] ?? value[3]);
}

function collectAssets(directory) {
  const source = safePath(directory);
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const file = `${directory}/${entry.name}`;
    if (entry.isSymbolicLink()) throw new Error(`Static symlink rejected: ${file}`);
    if (entry.name.startsWith(".")) continue;
    if (entry.isDirectory()) collectAssets(file);
    else if (entry.isFile() && resolveStaticPath(root, `/${file}`)) add(file);
  }
}
collectAssets("assets");
if (fs.existsSync(path.join(root, "preview-home.png"))) add("preview-home.png");
add(chart);
add(lottie, "assets/vendor/lottie.min.js");

// Validate the exact resolved deletion target before recursive removal.
if (path.dirname(output) !== root || path.basename(output) !== ".edge-static" || !output.startsWith(root + path.sep)) {
  throw new Error("Unsafe edge static output directory");
}
try {
  if (fs.lstatSync(output).isSymbolicLink() || fs.realpathSync(output) !== output) throw new Error("Unsafe edge static output symlink");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
for (const [relative, source] of files) {
  const target = path.join(output, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}
console.log(`[edge-static] built ${output}`);
