"use strict";
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const {parseBidHistory}=require("../lib/username-auction-bid-evidence");
const {parseOwnershipHistory}=require("../lib/fragment-username-source");
const hash=bytes=>crypto.createHash("sha256").update(bytes).digest("hex");
function selectTargets(rows){
  const ordered=values=>values.slice().sort((a,b)=>hash(a.eventId).localeCompare(hash(b.eventId)));
  const premium=ordered(rows.filter(row=>row.actualUsd>=500)).map(row=>({...row,stratum:"premium-all"}));
  const premiumIds=new Set(premium.map(row=>row.eventId));
  const ordinary=ordered(rows.filter(row=>row.actualUsd<100&&!premiumIds.has(row.eventId))).slice(0,premium.length)
    .map(row=>({...row,stratum:"ordinary-control"}));
  if(premium.length!==ordinary.length||new Set([...premium,...ordinary].map(row=>row.eventId)).size!==premium.length+ordinary.length)
    throw new Error("Unable to create balanced disjoint audit strata");
  return [...premium,...ordinary];
}
async function main(){
  const dir=path.resolve(__dirname,"../research/telegram-usernames/data");
  const input=fs.readFileSync(path.join(dir,"username-market-stage-development-2026-09-09.json"));
  const selected=selectTargets(JSON.parse(input).rows);
  const output=path.join(dir,"username-development-bids-expanded-2026-09-19.jsonl");
  const manifestFile=path.join(dir,"username-development-bids-expanded-2026-09-19.manifest.json");
  const manifest={developmentOnly:true,qualification:false,inputSha256:hash(input),createdBeforeFetch:true,
    policy:"Every exposed development premium case plus equal-size deterministic SHA256(eventId)-ranked ordinary control; strata reported separately; realized cohort selects audit sample but outcome price is never an input feature",
    premiumCount:selected.filter(row=>row.stratum==="premium-all").length,
    ordinaryCount:selected.filter(row=>row.stratum==="ordinary-control").length,eventIds:selected.map(row=>row.eventId)};
  if(fs.existsSync(manifestFile)){
    if(JSON.stringify(JSON.parse(fs.readFileSync(manifestFile,"utf8")))!==JSON.stringify(manifest))throw new Error("Expanded bid manifest mismatch");
  }else fs.writeFileSync(manifestFile,JSON.stringify(manifest,null,2)+"\n",{flag:"wx"});
  const done=new Set();
  const retryErrors=process.argv.includes("--retry-errors");
  if(fs.existsSync(output)){
    let rows=fs.readFileSync(output,"utf8").trim().split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));
    if(retryErrors){
      const failed=rows.filter(row=>row.status==="fetch-error");
      if(failed.length){
        const failedFile=path.join(dir,"username-development-bids-expanded-2026-09-19.fetch-errors.jsonl");
        fs.writeFileSync(failedFile,failed.map(row=>JSON.stringify(row)).join("\n")+"\n",{flag:"wx"});
        rows=rows.filter(row=>row.status!=="fetch-error");
        fs.writeFileSync(output,rows.map(row=>JSON.stringify(row)).join("\n")+"\n");
      }
    }
    for(const row of rows)done.add(row.eventId);
  }
  const seedFile=path.join(dir,"username-development-bids-2026-09-09.jsonl");
  if(!fs.existsSync(output)&&fs.existsSync(seedFile)){
    const targets=new Map(selected.map(row=>[row.eventId,row]));
    for(const line of fs.readFileSync(seedFile,"utf8").trim().split(/\r?\n/).filter(Boolean)){
      const prior=JSON.parse(line),target=targets.get(prior.eventId);
      if(!target)continue;
      const seeded={...prior,stratum:target.stratum,seededFrom:"username-development-bids-2026-09-09.jsonl"};
      fs.appendFileSync(output,JSON.stringify(seeded)+"\n");done.add(prior.eventId);
    }
  }
  const maxIndex=process.argv.indexOf("--max"),max=maxIndex<0?selected.length:Number(process.argv[maxIndex+1]);
  if(!Number.isInteger(max)||max<1||max>selected.length)throw new Error("--max must be an integer within manifest size");
  let fetched=0;
  for(const target of selected){
    if(done.has(target.eventId)||fetched>=max)continue;
    const sourceUrl=`https://fragment.com/username/${encodeURIComponent(target.username)}`;let result;
    try{
      const response=await fetch(sourceUrl,{signal:AbortSignal.timeout(15000),headers:{"user-agent":"TonTrack-Username-Research/1.0"}});
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      const html=await response.text(),parsed=parseBidHistory(html,Date.parse(target.eventTime));
      const ownership=parseOwnershipHistory(html,target.username);
      result={...parsed,htmlSha256:hash(html),matchingPublicSale:ownership.some(sale=>sale.eventTime===target.eventTime&&sale.priceGram===target.priceNative)};
    }catch(error){result={status:"fetch-error",error:error.message,bids:[]};}
    fs.appendFileSync(output,JSON.stringify({eventId:target.eventId,username:target.username,nftAddress:target.nftAddress,eventTime:target.eventTime,
      stratum:target.stratum,sourceUrl,observedAt:new Date().toISOString(),...result})+"\n");
    done.add(target.eventId);fetched+=1;
    console.log(JSON.stringify({completed:done.size,total:selected.length,fetchedThisRun:fetched,status:result.status,bids:result.bids.length}));
    await new Promise(resolve=>setTimeout(resolve,500));
  }
  console.log(JSON.stringify({complete:done.size===selected.length,completed:done.size,total:selected.length,fetchedThisRun:fetched}));
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={selectTargets};
