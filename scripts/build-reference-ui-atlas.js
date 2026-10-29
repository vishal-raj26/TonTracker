"use strict";

// Analysis artifacts only. No production image or financial data is changed.
// node scripts/build-reference-ui-atlas.js <original-sheet-directory> <sharp-module-path>
const fs = require("node:fs");
const path = require("node:path");
const sharp = require(process.argv[3] || "sharp");
const spec = require("../docs/reference-ui/atlas-spec.json");
const input = path.resolve(process.argv[2] || "");
const out = path.resolve(__dirname, "../docs/reference-ui/atlas");
const escape = value => String(value).replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[c]);

async function main() {
  fs.mkdirSync(out, { recursive: true });
  const manifest = { ...spec, inputDirectory: input, crops: [] };
  for (const component of spec.components) {
    const sheet = spec.sheets.find(s => s.id === component.sheet);
    const [left, top, width, height] = component.rect;
    const file = path.join(input, sheet.file);
    const metadata = await sharp(file).metadata();
    if (left + width > metadata.width || top + height > metadata.height) throw new Error(`Out-of-bounds ${component.id}`);
    const name = `${component.id}-sheet-${sheet.id}`;
    await sharp(file).extract({ left, top, width, height }).resize({ width: component.width }).png().toFile(path.join(out, `${name}.png`));
    await sharp(file).extract({ left, top, width, height }).resize({ width: component.width }).grayscale().png().toFile(path.join(out, `${name}-mono.png`));
    manifest.crops.push({ ...component, file: `${name}.png`, monochrome: `${name}-mono.png`, source: sheet.file, sourceSize: [metadata.width, metadata.height], normalizedHeight: Number((height * component.width / width).toFixed(2)) });
  }
  fs.writeFileSync(path.join(out, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  const cards = manifest.crops.map(c => `<article><h2>${c.id} · Sheet ${c.sheet} · ${c.kind}</h2><p>${escape(c.use)}</p><div class="pair"><img src="${c.file}" alt="Original source ${c.id}"><img src="${c.monochrome}" alt="Grayscale source ${c.id}"></div><small>Source crop ${c.rect.join(", ")} → ${c.width} × ${c.normalizedHeight}px. ${escape(c.source)}</small></article>`).join("\n");
  fs.writeFileSync(path.join(out, "index.html"), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TonTrack source atlas — internal reference</title><style>body{margin:0;padding:24px;background:#080808;color:white;font:14px/1.5 system-ui}main{max-width:1000px;margin:auto}article{padding:20px;border:1px solid #333;border-radius:24px;margin:20px 0}h1{font-size:24px}h2{font-size:18px}p,small{color:#aaa}.pair{display:flex;gap:20px;align-items:flex-start;flex-wrap:wrap}img{max-width:100%;height:auto}small{display:block;margin-top:16px}</style><main><h1>Source atlas — original / monochrome</h1><p>Internal comparison artifact. Not part of the application. A annotated · M crop-measured · F fitted · C composed. Printed annotations win crop conflicts.</p>${cards}</main></html>`);
  console.log(`Built ${manifest.crops.length} source comparisons from ${spec.sheets.length} registered sheets: ${out}`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
