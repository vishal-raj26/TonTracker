"use strict";
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const { parseBidHistory } = require("../lib/username-auction-bid-evidence");
const { parseOwnershipHistory } = require("../lib/fragment-username-source");
const hash = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
async function main() {
  const dir = path.resolve(__dirname,"../research/telegram-usernames/data");
  const input = fs.readFileSync(path.join(dir,"username-market-stage-development-2026-09-09.json"));
  const rows = JSON.parse(input).rows;
  const ordered = values => values.slice().sort((a,b) => hash(a.eventId).localeCompare(hash(b.eventId)));
  // Two separate strata; never pool as representative market accuracy.
  const selected = [...ordered(rows.filter(r=>r.actualUsd<100)).slice(0,40).map(r=>({...r,stratum:"ordinary"})),
    ...ordered(rows.filter(r=>r.actualUsd>=500&&r.ownStatus!=="available"&&!(r.vectorUsd>0))).slice(0,40).map(r=>({...r,stratum:"missing-evidence-premium"}))];
  const output = path.join(dir,"username-development-bids-2026-09-09.jsonl");
  const manifestFile = path.join(dir,"username-development-bids-2026-09-09.manifest.json");
  const manifest = { developmentOnly:true, qualification:false, inputSha256:hash(input),
    policy:"40 ordinary and40 missing-evidence premium; deterministic SHA256(eventId) rank within each stratum; report separately; no outcome amount used as feature", eventIds:selected.map(r=>r.eventId) };
  if (fs.existsSync(manifestFile)) {
    if (JSON.stringify(JSON.parse(fs.readFileSync(manifestFile,"utf8")))!==JSON.stringify(manifest)) throw new Error("Collection manifest mismatch");
  } else fs.writeFileSync(manifestFile,JSON.stringify(manifest,null,2)+"\n",{flag:"wx"});
  const done = new Set(fs.existsSync(output) ? fs.readFileSync(output,"utf8").trim().split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line).eventId) : []);
  for (const target of selected) {
    if (done.has(target.eventId)) continue;
    const url = `https://fragment.com/username/${encodeURIComponent(target.username)}`;
    let result;
    try {
      const response = await fetch(url,{signal:AbortSignal.timeout(15000),headers:{"user-agent":"TonTrack-Username-Research/1.0"}});
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const html = await response.text();
      const parsed = parseBidHistory(html,Date.parse(target.eventTime));
      const ownership = parseOwnershipHistory(html,target.username);
      result = { ...parsed, htmlSha256:hash(html), matchingPublicSale:ownership.some(s=>s.eventTime===target.eventTime&&s.priceGram===target.priceNative) };
    } catch(error) { result = {status:"fetch-error",error:error.message,bids:[]}; }
    const record = { eventId:target.eventId, username:target.username, nftAddress:target.nftAddress, eventTime:target.eventTime,
      stratum:target.stratum, sourceUrl:url, observedAt:new Date().toISOString(), ...result };
    fs.appendFileSync(output,JSON.stringify(record)+"\n");
    done.add(target.eventId);
    console.log(JSON.stringify({completed:done.size,total:selected.length,status:result.status,bids:result.bids.length}));
    await new Promise(resolve=>setTimeout(resolve,500));
  }
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
