"use strict";

const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const {createTonCenterUsernameVerifier}=require("../lib/toncenter-username-verifier");
const {bidLifecycleEvidence}=require("../lib/username-auction-bid-evidence");
const hash=bytes=>crypto.createHash("sha256").update(bytes).digest("hex");

async function main(){
  const dir=path.resolve(__dirname,"../research/telegram-usernames/data");
  const selectionBytes=fs.readFileSync(path.join(dir,"username-development-bids-expanded-2026-09-19.manifest.json"));
  const sourceBytes=fs.readFileSync(path.join(dir,"username-market-stage-development-2026-09-09.json"));
  const selection=JSON.parse(selectionBytes),sourceRows=JSON.parse(sourceBytes).rows,source=new Map(sourceRows.map(row=>[row.eventId,row]));
  const selected=selection.eventIds.map(eventId=>source.get(eventId));
  if(selected.some(row=>!row)||new Set(selected.map(row=>row.eventId)).size!==selected.length)throw new Error("Selection/source identity mismatch");
  const output=path.join(dir,"username-chain-bid-lifecycles-expanded-2026-09-19.jsonl");
  const manifestFile=path.join(dir,"username-chain-bid-lifecycles-expanded-2026-09-19.manifest.json");
  const manifest={qualification:false,developmentOnly:true,createdBeforeFetch:true,selectionSha256:hash(selectionBytes),sourceSha256:hash(sourceBytes),
    contractSource:"https://github.com/TelegramMessenger/telemint/blob/main/func/nft-item.fc",
    evidenceRule:"Exact-name successful deploy and strictly later successful empty-message bids to the same NFT before sale; failed bids excluded; no settlement or inactive-resale claim",
    queryWindow:"Eight days before through sixty seconds after recorded sale; lifecycle parser excludes transactions at or after sale cutoff",
    eventIds:selection.eventIds};
  if(fs.existsSync(manifestFile)){
    if(JSON.stringify(JSON.parse(fs.readFileSync(manifestFile,"utf8")))!==JSON.stringify(manifest))throw new Error("Lifecycle manifest mismatch");
  }else fs.writeFileSync(manifestFile,JSON.stringify(manifest,null,2)+"\n",{flag:"wx"});
  const done=new Set();
  if(fs.existsSync(output)){
    let rows=fs.readFileSync(output,"utf8").trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
    if(process.argv.includes("--retry-errors")){
      const failed=rows.filter(row=>row.status==="fetch-error");
      if(failed.length){
        const failedFile=path.join(dir,"username-chain-bid-lifecycles-expanded-2026-09-19.fetch-errors.jsonl");
        fs.writeFileSync(failedFile,failed.map(row=>JSON.stringify(row)).join("\n")+"\n",{flag:"wx"});
        rows=rows.filter(row=>row.status!=="fetch-error");
        fs.writeFileSync(output,rows.map(row=>JSON.stringify(row)).join("\n")+"\n");
      }
    }
    for(const row of rows)done.add(row.eventId);
  }
  const maxIndex=process.argv.indexOf("--max"),max=maxIndex<0?selected.length:Number(process.argv[maxIndex+1]);
  if(!Number.isInteger(max)||max<1||max>selected.length)throw new Error("--max must be within manifest size");
  const verifier=createTonCenterUsernameVerifier({retries:2,requestDelayMs:1100});let fetched=0;
  for(const target of selected){
    if(done.has(target.eventId)||fetched>=max)continue;
    const saleSeconds=Date.parse(target.eventTime)/1000,observedAt=new Date().toISOString();let result;
    try{
      const transactions=await verifier.fetchTransactions(target.nftAddress,{startUtime:saleSeconds-8*86400,endUtime:saleSeconds+60,limit:100});
      const lifecycle=bidLifecycleEvidence(transactions,target,{cutoff:Date.parse(target.eventTime),observedAt});
      const latestNano=lifecycle.latestBid?.amountNano;
      result={transactionCount:transactions.length,...lifecycle,
        latestBidMatchesSale:latestNano?BigInt(latestNano)===BigInt(Math.round(target.priceNative*1e9)):false};
    }catch(error){result={status:"fetch-error",error:error.message,bids:[]};}
    const stratum=target.actualUsd>=500?"premium-all":"ordinary-control";
    fs.appendFileSync(output,JSON.stringify({eventId:target.eventId,username:target.username,nftAddress:target.nftAddress,eventTime:target.eventTime,
      stratum,saleNative:target.priceNative,observedAt,...result})+"\n");done.add(target.eventId);fetched+=1;
    console.log(JSON.stringify({completed:done.size,total:selected.length,fetchedThisRun:fetched,status:result.status,bids:result.bids.length,
      latestBidMatchesSale:result.latestBidMatchesSale||false,error:result.error||null}));
  }
  console.log(JSON.stringify({complete:done.size===selected.length,completed:done.size,total:selected.length,fetchedThisRun:fetched}));
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
