const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const root = path.resolve(__dirname, "..");
const registryFile = path.join(root, "data", "gift-layer-registry.json");
const patternDir = path.join(root, "assets", "gifts", "patterns");
const backdropsUrl = "https://cdn.changes.tg/gifts/backdrops.json";
const patternsUrl = "https://cdn.changes.tg/gifts/patterns.json";

function key(value = "") {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function colorHex(value) {
  return `#${Math.max(0, Number(value) || 0).toString(16).padStart(6, "0").slice(-6)}`;
}

async function fetchChecked(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response;
}

async function download(url, output) {
  if (fs.existsSync(output) && fs.statSync(output).size > 0) return false;
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const bytes = Buffer.from(await (await fetchChecked(url)).arrayBuffer());
      if (!bytes.length) throw new Error(`Empty response: ${url}`);
      fs.writeFileSync(output, bytes);
      return true;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

async function runPool(items, worker, concurrency = 8) {
  let cursor = 0;
  const failures = [];
  const workers = Array.from({ length: concurrency }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      try {
        await worker(items[index], index);
      } catch (error) {
        failures.push({ item: items[index], error: error.message });
      }
    }
  });
  await Promise.all(workers);
  return failures;
}

async function main() {
  fs.mkdirSync(patternDir, { recursive: true });
  const [backdrops, patternMap] = await Promise.all([
    fetchChecked(backdropsUrl).then((response) => response.json()),
    fetchChecked(patternsUrl).then((response) => response.json()),
  ]);
  const registry = fs.existsSync(registryFile)
    ? JSON.parse(fs.readFileSync(registryFile, "utf8"))
    : { version: 1, collections: {} };
  registry.version = Math.max(2, Number(registry.version || 1));
  registry.collections ||= {};
  registry.backdrops = {};
  registry.patterns = {};

  for (const backdrop of backdrops) {
    registry.backdrops[key(backdrop.name)] = {
      name: backdrop.name,
      backdropId: backdrop.backdropId,
      hex: {
        centerColor: colorHex(backdrop.centerColor),
        edgeColor: colorHex(backdrop.edgeColor),
        patternColor: colorHex(backdrop.patternColor),
        textColor: colorHex(backdrop.textColor),
      },
    };
  }

  const patterns = Object.values(patternMap).map((source) => {
    const parts = String(source).replace(/\.tgs$/i, "").split("/");
    const sourceGift = parts[0];
    const name = parts.at(-1);
    const suffix = crypto.createHash("sha1").update(source).digest("hex").slice(0, 8);
    const filename = `${key(name) || "symbol"}-${suffix}.png`;
    return {
      name,
      sourceGift,
      source,
      filename,
      remoteUrl: `https://cdn.changes.tg/gifts/patterns/${encodeURIComponent(sourceGift)}/png/${encodeURIComponent(name)}.png`,
      output: path.join(patternDir, filename),
      localUrl: `/assets/gifts/patterns/${filename}`,
    };
  });

  const failures = await runPool(patterns, async (pattern, index) => {
    await download(pattern.remoteUrl, pattern.output);
    registry.patterns[key(pattern.name)] = {
      name: pattern.name,
      sourceGift: pattern.sourceGift,
      imageUrl: pattern.localUrl,
    };
    if ((index + 1) % 100 === 0) console.log(`Processed ${index + 1}/${patterns.length} symbols`);
  });

  if (failures.length) {
    console.error(JSON.stringify(failures.slice(0, 20), null, 2));
    throw new Error(`${failures.length} symbol downloads failed`);
  }

  registry.updatedAt = new Date().toISOString();
  registry.source = {
    provider: "GiftChanges",
    backdropsUrl,
    patternsUrl,
  };
  fs.writeFileSync(registryFile, `${JSON.stringify(registry, null, 2)}\n`);
  const bytes = patterns.reduce((total, pattern) => total + fs.statSync(pattern.output).size, 0);
  console.log(`Saved ${backdrops.length} backdrops and ${patterns.length} symbols (${(bytes / 1024 / 1024).toFixed(1)} MB)`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
