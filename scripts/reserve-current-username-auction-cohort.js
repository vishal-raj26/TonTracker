"use strict";

const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const {createFragmentUsernameSource,usernameIndex}=require("../lib/fragment-username-source");
const {createUsernameAuctionStateSource}=require("../lib/username-auction-state");
const {USERNAME_COLLECTION}=require("../lib/username-collection");
const hash=value=>crypto.createHash("sha256").update(value).digest("hex");
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function main(){
  const dir=path.resolve(__dirname,"../research/telegram-usernames/data"),limitIndex=process.argv.indexOf("--limit"),limit=limitIndex<0?40:Number(process.argv[limitIndex+1]);
  if(!Number.isInteger(limit)||limit<10||limit>100)throw new Error("--limit must be 10..100");
  const sortIndex=process.argv.indexOf("--sort"),sort=sortIndex<0?"listed":String(process.argv[sortIndex+1]);
  if(!["listed","ending"].includes(sort))throw new Error("--sort must be listed or ending");
  const horizonIndex=process.argv.indexOf("--min-horizon-minutes"),minimumHorizonMinutes=horizonIndex<0?10:Number(process.argv[horizonIndex+1]);
  if(!Number.isFinite(minimumHorizonMinutes)||minimumHorizonMinutes<1||minimumHorizonMinutes>60)throw new Error("--min-horizon-minutes must be 1..60");
  const cohort=sort==="ending"?"username-current-auction-ending-reservation-2026-09-19":"username-current-auction-reservation-2026-09-19";
  const retryErrors=process.argv.includes("--retry-errors");
  const manifestFile=path.join(dir,`${cohort}.manifest.json`),output=path.join(dir,`${cohort}.jsonl`),summaryFile=path.join(dir,retryErrors?`${cohort}.summary-v2.json`:`${cohort}.summary.json`);
  let manifest;
  if(fs.existsSync(manifestFile)) manifest=JSON.parse(fs.readFileSync(manifestFile,"utf8"));
  else{
    const discoveryObservedAt=new Date().toISOString(),source=createFragmentUsernameSource({requestDelayMs:1000,retryBaseDelayMs:1000});
    const discovered=await source.fetchActiveAuctions({sort}),minimumEnd=Date.parse(discoveryObservedAt)+minimumHorizonMinutes*60_000;
    const selected=discovered.filter(row=>Date.parse(row.endTime)>minimumEnd)
      .sort((a,b)=>hash(`${a.username}|${a.endTime}`).localeCompare(hash(`${b.username}|${b.endTime}`))).slice(0,limit);
    if(selected.length<limit)throw new Error(`Only ${selected.length}/${limit} active auctions satisfy the predeclared horizon`);
    manifest={qualification:false,reservedForFutureOutcomeAudit:true,createdBeforeChainFetch:true,developmentInputsVisible:true,
      selection:`SHA256(username|endTime) first N from Fragment active auctions sorted by ${sort}, end at least ${minimumHorizonMinutes} minutes after discovery; no outcome access`,
      discoveryObservedAt,minimumHorizonMinutes,requested:limit,targets:selected.map(row=>({...row,selectionId:hash(`${row.username}|${row.endTime}`)}))};
    fs.writeFileSync(manifestFile,JSON.stringify(manifest,null,2)+"\n",{flag:"wx"});
  }
  const done=new Set();if(fs.existsSync(output)){
    let rows=fs.readFileSync(output,"utf8").trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
    if(retryErrors){
      const failed=rows.filter(row=>row.status==="fetch-error");
      if(failed.length){
        fs.writeFileSync(path.join(dir,`${cohort}.fetch-errors.jsonl`),failed.map(row=>JSON.stringify(row)).join("\n")+"\n",{flag:"wx"});
        rows=rows.filter(row=>row.status!=="fetch-error");fs.writeFileSync(output,rows.map(row=>JSON.stringify(row)).join("\n")+"\n");
      }
    }
    for(const row of rows)done.add(row.selectionId);
  }
  const apiKey=String(process.env.USERNAME_TONCENTER_API_KEY||process.env.TONCENTER_API_KEY||"").trim(),headers={accept:"application/json","user-agent":"TonTrack-Username-Auction-Reservation/1.0",...(apiKey?{"x-api-key":apiKey}:{})};
  const stateSource=createUsernameAuctionStateSource({apiKey,tonDelayMs:apiKey?0:1050,fragmentDelayMs:500});let fetched=0;
  for(const target of manifest.targets){
    if(done.has(target.selectionId))continue;
    const index=BigInt(`0x${usernameIndex(target.username)}`).toString(),query=new URLSearchParams({collection_address:USERNAME_COLLECTION,index,limit:"2"});let result;
    try{
      const response=await fetch(`https://toncenter.com/api/v3/nft/items?${query}`,{headers,signal:AbortSignal.timeout(15000)});
      if(!response.ok)throw new Error(`TON Center NFT identity ${response.status}`);
      const items=(await response.json()).nft_items||[];
      if(items.length!==1)throw new Error(`TON Center NFT identity count ${items.length}`);
      if(!apiKey)await sleep(1100);
      const state=await stateSource.load({username:target.username,nftAddress:items[0].address},{item:items[0]});
      result={nftAddress:String(items[0].address).toLowerCase(),state};
    }catch(error){result={status:"fetch-error",error:error.message};}
    fs.appendFileSync(output,JSON.stringify({...target,...result})+"\n");done.add(target.selectionId);fetched+=1;
    console.log(JSON.stringify({completed:done.size,total:manifest.targets.length,fetchedThisRun:fetched,status:result.state?.status||result.status,nowcastEligible:result.state?.nowcastEligible||false}));
    if(!apiKey)await sleep(1100);
  }
  const rows=fs.readFileSync(output,"utf8").trim().split(/\r?\n/).filter(Boolean).map(JSON.parse),summary={qualification:false,reservedForFutureOutcomeAudit:true,
    manifestSha256:hash(fs.readFileSync(manifestFile)),auditSha256:hash(fs.readFileSync(output)),attempted:rows.length,
    verifiedActive:rows.filter(row=>row.state?.status==="active").length,withCurrentBid:rows.filter(row=>row.state?.nowcastEligible).length,
    unavailable:rows.filter(row=>row.state?.status==="unavailable").length,fetchErrors:rows.filter(row=>row.status==="fetch-error").length,
    earliestEndTime:rows.map(row=>row.endTime).sort()[0],latestEndTime:rows.map(row=>row.endTime).sort().at(-1),
    outcomePolicy:"Do not tune on future settlements. After every recorded end time, fetch finalized outcomes, retain failures/unsold cases, and score the frozen point-in-time states once."};
  fs.writeFileSync(summaryFile,JSON.stringify(summary,null,2)+"\n",{flag:"wx"});console.log(JSON.stringify(summary,null,2));
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
