const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const manifestPath = path.join(root, "docs", "chart-loc.json");

function fail(message) {
  throw new Error(`Chart LOC verifier: ${message}`);
}

function stripComments(source) {
  let result = "";
  let state = "code";
  let escaped = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (state === "line-comment") {
      if (char === "\n" || char === "\r") {
        state = "code";
        result += char;
      } else {
        result += " ";
      }
      continue;
    }

    if (state === "block-comment") {
      if (char === "*" && next === "/") {
        result += "  ";
        index += 1;
        state = "code";
      } else {
        result += char === "\n" || char === "\r" ? char : " ";
      }
      continue;
    }

    if (state === "single" || state === "double" || state === "template") {
      result += char;
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (
        (state === "single" && char === "'")
        || (state === "double" && char === '"')
        || (state === "template" && char === "`")
      ) {
        state = "code";
      }
      continue;
    }

    if (char === "/" && next === "/") {
      result += "  ";
      index += 1;
      state = "line-comment";
    } else if (char === "/" && next === "*") {
      result += "  ";
      index += 1;
      state = "block-comment";
    } else {
      result += char;
      if (char === "'") state = "single";
      else if (char === '"') state = "double";
      else if (char === "`") state = "template";
    }
  }

  return result;
}

function maskNonCode(source) {
  const uncommented = stripComments(source);
  let result = "";
  let state = "code";
  let escaped = false;

  for (const char of uncommented) {
    if (state === "code") {
      if (char === "'") state = "single";
      else if (char === '"') state = "double";
      else if (char === "`") state = "template";
      result += state === "code" ? char : " ";
      continue;
    }

    result += char === "\n" || char === "\r" ? char : " ";
    if (escaped) {
      escaped = false;
    } else if (char === "\\") {
      escaped = true;
    } else if (
      (state === "single" && char === "'")
      || (state === "double" && char === '"')
      || (state === "template" && char === "`")
    ) {
      state = "code";
    }
  }

  return result;
}

function countSloc(source) {
  return stripComments(source).split(/\r?\n/).filter((line) => line.trim()).length;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function functionSource(source, masked, name, filePath) {
  const pattern = new RegExp(`\\b(?:async\\s+)?function\\s+${escapeRegExp(name)}\\s*\\(`, "g");
  const matches = [...masked.matchAll(pattern)];
  if (matches.length !== 1) {
    fail(`${filePath}: expected exactly one declaration for ${name}, found ${matches.length}`);
  }

  const start = matches[0].index;
  const openParen = masked.indexOf("(", start);
  let parameterDepth = 0;
  let closeParen = -1;
  for (let index = openParen; index < masked.length; index += 1) {
    if (masked[index] === "(") parameterDepth += 1;
    else if (masked[index] === ")") parameterDepth -= 1;
    if (parameterDepth === 0) {
      closeParen = index;
      break;
    }
  }
  if (closeParen < 0) fail(`${filePath}: unterminated parameters for ${name}`);

  const openBrace = masked.indexOf("{", closeParen + 1);
  if (openBrace < 0) fail(`${filePath}: could not find body for ${name}`);

  let depth = 0;
  for (let index = openBrace; index < masked.length; index += 1) {
    if (masked[index] === "{") depth += 1;
    else if (masked[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }

  fail(`${filePath}: unterminated body for ${name}`);
}

function validateManifest(manifest) {
  if (manifest.schemaVersion !== 1) fail("unsupported manifest schema");
  if (!Number.isInteger(manifest.baselineSloc) || manifest.baselineSloc <= 0) fail("invalid baselineSloc");
  if (!Number.isInteger(manifest.maximumSloc) || manifest.maximumSloc <= 0) fail("invalid maximumSloc");
  if (!Array.isArray(manifest.components) || !manifest.components.length) fail("manifest has no components");

  const expectedMaximum = Math.floor(manifest.baselineSloc * (1 - manifest.requiredReductionPercent / 100));
  if (manifest.maximumSloc !== expectedMaximum) {
    fail(`maximumSloc must be ${expectedMaximum} for the declared baseline and reduction`);
  }
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
validateManifest(manifest);

let total = 0;
const componentResults = manifest.components.map((component) => {
  const absolutePath = path.resolve(root, component.path);
  if (path.relative(root, absolutePath).startsWith("..")) fail(`component escapes repository: ${component.path}`);
  const source = fs.readFileSync(absolutePath, "utf8");

  if (component.mode === "file") {
    const sloc = countSloc(source);
    total += sloc;
    return { path: component.path, sloc, declarations: [] };
  }

  if (component.mode !== "functions" || !Array.isArray(component.functions) || !component.functions.length) {
    fail(`${component.path}: invalid component mode or function list`);
  }

  const masked = maskNonCode(source);
  const seen = new Set();
  const declarations = component.functions.map((name) => {
    if (seen.has(name)) fail(`${component.path}: duplicate manifest declaration ${name}`);
    seen.add(name);
    return { name, sloc: countSloc(functionSource(source, masked, name, component.path)) };
  });
  const sloc = declarations.reduce((sum, declaration) => sum + declaration.sloc, 0);
  total += sloc;
  return { path: component.path, sloc, declarations };
});

console.log("Chart JavaScript SLOC");
for (const component of componentResults) {
  console.log(`${String(component.sloc).padStart(4)}  ${component.path}`);
  for (const declaration of component.declarations) {
    console.log(`      ${String(declaration.sloc).padStart(4)}  ${declaration.name}()`);
  }
}
console.log(`Baseline: ${manifest.baselineSloc}`);
console.log(`Target:   <= ${manifest.maximumSloc} (${manifest.requiredReductionPercent}% reduction)`);
console.log(`Current:  ${total}`);
console.log(`Reduction: ${((1 - total / manifest.baselineSloc) * 100).toFixed(1)}%`);

if (total > manifest.maximumSloc) {
  console.error(`FAIL: chart JavaScript SLOC exceeds the target by ${total - manifest.maximumSloc}.`);
  process.exitCode = 1;
} else {
  console.log(`PASS: chart JavaScript SLOC is ${manifest.maximumSloc - total} lines under the target.`);
}
