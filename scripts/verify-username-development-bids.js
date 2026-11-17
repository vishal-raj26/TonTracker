"use strict";
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const { createTonCenterUsernameVerifier } = require("../lib/toncenter-username-verifier");
async function main() {
  const dir = path.resolve(__dirname,"../research/telegram-usernames/data");
  const bytes = fs.readFileSync(path.join(dir,"username-development-bids-2026-09-09.jsonl"));
  const records = bytes.toString("utf8").trim().split(/\r?\n/).map(JSON.parse);
  // Bounded provenance audit; one ordinary and first two premium covered cases.
  const selected = [records.find(r=>r.stratum==="ordinary"&&r.bids.length),
    ...records.filter(r=>r.stratum==="missing-evidence-premium"&&r.bids.length).slice(0,2)];
  const verifier = createTonCenterUsernameVerifier({baseUrl:"https://toncenter.com/api/v3", retries:0, requestDelayMs:1100});
  const results = [];
  for (const record of selected) {
    const bid = record.bids[0], bidTime = Date.parse(bid.eventTime)/1000;
    try {
      const transactions = await verifier.fetchTransactions(record.nftAddress,{startUtime:bidTime-60,endUtime:bidTime+60,limit:20});
      results.push({eventId:record.eventId,username:record.username,nftAddress:record.nftAddress,bid,transactions});
      console.log(JSON.stringify({username:record.username,transactions:transactions.map(t=>({hash:t.hash,now:t.now,description:t.description,
        in_msg:{source:t.in_msg?.source,destination:t.in_msg?.destination,value:t.in_msg?.value,opcode:t.in_msg?.opcode,decoded:t.in_msg?.message_content?.decoded}}))}));
    } catch(error) { results.push({eventId:record.eventId,username:record.username,error:error.message}); console.log(JSON.stringify({username:record.username,error:error.message})); }
  }
  const output = path.join(dir,"username-bid-chain-audit-2026-09-09.json");
  fs.writeFileSync(output,JSON.stringify({diagnosticOnly:true,sourceSha256:crypto.createHash("sha256").update(bytes).digest("hex"),
    observedAt:new Date().toISOString(),results},null,2)+"\n",{flag:"wx"});
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
