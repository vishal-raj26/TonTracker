"use strict";

// Read-only repository inspection; writes only this handover's generated evidence.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const root = path.resolve(__dirname, "../..");
const output = __dirname;
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true }).trimEnd();
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const exists = file => fs.existsSync(path.join(root, file));
const lines = text => text.split(/\r?\n/);
const files = [...new Set(git("ls-files", "--cached", "--others", "--exclude-standard", "-z").split("\0").filter(Boolean))].sort();
const excluded = /^(?:\.git\/|\.tmp\/|\.wrangler\/|\.codex\/|\.agents\/|node_modules\/|\.edge-static\/|docs\/handover-2026-10-29\/)|(?:^|\/)(?:\.env(?:\..*)?|\.telegram-session|\.telegram-login\.json)$/;
const sourceFiles = files.filter(f => !excluded.test(f) && /\.(?:js|cjs|mjs|py|sql|jsonc|html|css|toml|ya?ml)$/.test(f) && !/^xgift-/.test(f) && exists(f));
const routeFiles = ["server.js", "cloudflare/gift-registry-worker.mjs", "cloudflare/identity-ingestion-edge.mjs"];
const routes = [];
for (const file of routeFiles) {
  const source = read(file);
  const sourceLines = lines(source);
  for (let i = 0; i < sourceLines.length; i++) {
    const line = sourceLines[i];
    const match = line.match(/(?:url\.pathname|pathname|path)\s*===\s*["']([^"']+)["']/);
    if (!match) continue;
    const next = sourceLines.slice(i + 1).findIndex(l => /if\s*\(.*(?:url\.pathname|pathname|path)\s*===/.test(l));
    const block = sourceLines.slice(i, next < 0 ? i + 50 : i + 1 + next).join("\n");
    const params = [...new Set([...block.matchAll(/searchParams\.get\(["']([^"']+)["']\)/g)].map(m => m[1]))];
    const explicitMethod = line.match(/(?:req|request)\.method\s*===\s*["']([^"']+)["']/)?.[1];
    const method = explicitMethod || (file === "server.js" && i > sourceLines.findIndex(l => l.includes('if (req.method !== "GET")')) ? "GET (shared gate)" : "see handler");
    routes.push({ file, line: i + 1, route: match[1], method, queryKeys: params });
  }
}
const env = new Map();
for (const file of sourceFiles.filter(f => /\.(?:js|cjs|mjs|py)$/.test(f) && !f.startsWith("research/"))) {
  const source = read(file);
  const names = new Set([...source.matchAll(/(?:process\.env\.([A-Z][A-Z0-9_]+)|(?:process\.env|os\.environ)\[["']([A-Z][A-Z0-9_]+)["']\]|(?:getenv|environ\.get)\(["']([A-Z][A-Z0-9_]+)["'])/g)].map(m => m[1] || m[2] || m[3]));
  for (const name of names) { if (!env.has(name)) env.set(name, []); env.get(name).push(file); }
}
const schemaFiles = sourceFiles.filter(f => f.endsWith(".sql"));
const tables = schemaFiles.flatMap(file => lines(read(file)).flatMap((line, i) => {
  const match = line.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z_][a-zA-Z0-9_.]*)/i);
  return match ? [{ table: match[1], file, line: i + 1 }] : [];
}));
const functionFiles = ["server.js", "app.js", "chart-platform.js", "terminal-system.js", ...routeFiles.slice(1)];
const functions = functionFiles.flatMap(file => lines(read(file)).flatMap((line, i) => {
  const match = line.match(/^\s*(?:export\s+)?(?:async\s+)?function\s+([\w$]+)\s*\(/);
  return match ? [{ name: match[1], file, line: i + 1 }] : [];
}));
const pkg = JSON.parse(read("package.json"));
const html = read("index.html");
const screens = [...html.matchAll(/<main[^>]+data-screen="([^"]+)"/g)].map(m => m[1]);
const markers = [...html.matchAll(/(?:src|href)="([^"\r\n]+\?v=[^"\r\n]+)"/g)].map(m => m[1]);
const styles = [...html.matchAll(/href="\.\/([^"?]+\.css)/g)].map(m => m[1]);
const { resolveStaticPath } = require("../../lib/static-policy.js");
const edgeStyleAudit = styles.map(file => {
  const source = fs.readFileSync(path.join(root, file));
  const built = path.join(root, ".edge-static", file);
  return { file, approvedHtmlEntry: Boolean(resolveStaticPath(root, `/${file}`)),
    matchesSource: fs.existsSync(built) && source.equals(fs.readFileSync(built)) };
});
const configs = ["wrangler.jsonc", "wrangler-app.jsonc", "wrangler-identity-ingestion.jsonc"].map(file => {
  const parsed = JSON.parse(read(file));
  return { file, name: parsed.name, main: parsed.main, compatibility_date: parsed.compatibility_date, bindings: (parsed.d1_databases || []).map(d => ({binding:d.binding, database_name:d.database_name, migrations_dir:d.migrations_dir || null})), services:parsed.services || [], crons:parsed.triggers?.crons || [], variableNames:Object.keys(parsed.vars || {}), cleanupPaused:parsed.vars?.GIFT_SALES_CLEANUP_PAUSED || null };
});
const hashes = ["package.json", "index.html", "app.js", "server.js", "chart-platform.js", "styles-reference-ui.css", "cloudflare/gift-registry-worker.mjs", "lib/username-estimator.js", "lib/username-runtime.js", "lib/username-publication.js"].map(file => ({ file, sha256:crypto.createHash("sha256").update(fs.readFileSync(path.join(root,file))).digest("hex"), lines:lines(read(file)).length }));
const snapshot = { date:"2026-10-29", scope:"Local repository evidence, not a deployed-state audit", root, branch:git("branch","--show-current"), head:git("rev-parse","HEAD"), remotes:git("remote","-v"), gitStatus:git("status","--porcelain=v1"), recentCommits:git("log","-10","--date=iso-strict","--format=%h %ad %s"), screens, markers, dependencies:pkg.dependencies, scripts:pkg.scripts, configs, edgeStyleAudit, hashes, routes, tables, environmentVariableNames:[...env.keys()].sort(), testFiles:sourceFiles.filter(f => f.startsWith("test/")), sourceFileCount:sourceFiles.length, documentFiles:files.filter(f => /\.md$/.test(f) && !excluded.test(f) && !f.startsWith("graphify-out/")), functions };
fs.writeFileSync(path.join(output,"snapshot.json"), JSON.stringify(snapshot,null,2)+"\n");
const md = ["# Generated technical inventory — 2026-10-29", "", "Generated by `node docs/handover-2026-10-29/build-inventory.cjs`. Local source evidence only. This file does not contain environment values, credentials, database contents or production account state. Source locations are snapshot-relative and will drift after edits.", "", "## Git snapshot", "", "```text", snapshot.branch, snapshot.head, snapshot.recentCommits, "```", "", "### Working tree (includes this handover's new directory)", "", "```text", snapshot.gitStatus, "```", "", "## Package commands", "", ...Object.entries(pkg.scripts).map(([k,v])=>`- \`${k}\`: \`${v}\``), "", "## Screens", "", screens.join(", "), "", "## Loaded frontend markers", "", ...markers.map(v=>`- \`${v}\``), "", "## Edge stylesheet packaging audit", "", "| Stylesheet | Approved HTML entry | Built bytes match source |", "|---|---|---|", ...edgeStyleAudit.map(r=>`| ${r.file} | ${r.approvedHtmlEntry} | ${r.matchesSource} |`), "", "## Cloudflare configuration (no secrets or database IDs)", "", "```json", JSON.stringify(configs,null,2), "```", "", "## Literal route inventory", "", "Extraction lists literal equality branches, not a formal OpenAPI specification. Nested method gates, shared authorization, body schemas, computed URLs and prefix routes require reading the handler. Query keys are mechanically associated with the branch and may include nested fallback references.", "", "| Source | Method | Route | Query keys |", "|---|---|---|---|", ...routes.map(r=>`| [${r.file}:${r.line}](../../${r.file}) | ${r.method} | \`${r.route}\` | ${r.queryKeys.join(", ")} |`), "", "## Schema tables and migrations", "", "Repeated names are intentional: bootstrap, historical, current and migration definitions coexist. This is not a claim that every table exists in production.", "", ...tables.map(r=>`- \`${r.table}\` — ${r.file}:${r.line}`), "", "## Environment variable names (values intentionally excluded)", "", "Includes legacy/research/test references; presence in source is not a requirement to configure every variable. Dynamic keys and binding-only fields may not be detected. First three referring files shown per key.", "", ...[...env.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`- \`${k}\` — ${v.slice(0,3).join(", ")}${v.length>3?` (+${v.length-3} files)`:""}`), "", "## Core file fingerprints", "", ...hashes.map(h=>`- \`${h.file}\`: ${h.lines} lines; SHA-256 \`${h.sha256}\``), "", "## Core named-function index", "", ...functions.map(f=>`- ${f.file}:${f.line} — \`${f.name}()\``), "", "## First-party source/configuration inventory", "", ...sourceFiles.map(f=>`- \`${f}\``), "", "## Documentation and research reading index", "", ...snapshot.documentFiles.map(f=>`- [${f}](../../${f.replace(/ /g,"%20")})`), "", "## Other artifact groups", "", ...Object.entries(files.filter(f=>!sourceFiles.includes(f)&&!snapshot.documentFiles.includes(f)&&!excluded.test(f)).reduce((acc,f)=>{const group=f.includes("/")?f.split("/")[0]:"root artifacts"; acc[group]=(acc[group]||0)+1;return acc;},{})).map(([k,v])=>`- ${k}: ${v} indexed paths; assets/research data are not reproduced here.`), "", "Ignored runtime files, secrets, vendor dependencies, temporary caches, IDE skills and Wrangler state are deliberately not content-exported. Preserve them separately and securely if needed; do not indiscriminately push them to GitHub.", ""];
fs.writeFileSync(path.join(output,"INVENTORY.md"),md.join("\n"));
const indexedPaths = files.filter(file => !excluded.test(file));
fs.writeFileSync(path.join(output,"FILES.md"), [
  "# Repository path inventory — 2026-10-29", "",
  "Tracked and non-ignored untracked paths reported by Git, excluding secret/runtime/temporary/skill directories described in the generator. Path presence does not mean the file is first-party, production-wired, licensed for redistribution, or safe to publish. Binary media and research dataset contents were not exported. This handover's own directory is excluded to prevent recursive self-indexing.", "",
  `Indexed paths: ${indexedPaths.length}.`, "",
  ...indexedPaths.map(file => `- \`${file}\``), "",
].join("\n"));
console.log(JSON.stringify({output, routes:routes.length, schemaDefinitions:tables.length, environmentKeys:env.size, functions:functions.length, sourceFiles:sourceFiles.length, testFiles:snapshot.testFiles.length, screens:screens.length, edgeStyleAudit},null,2));
