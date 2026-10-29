"use strict";

const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const {createTonCenterUsernameVerifier}=require("../lib/toncenter-username-verifier");
const {bidLifecycleEvidence}=require("../lib/username-auction-bid-evidence");
const hash=bytes=>crypto.createHash("sha256").update(bytes).digest("hex");

async function main(){
  const dir=path.resolve(__dirname,"../research/telegram-usernames/data");
  const pilotBytes=fs.readFileSync(path.join(dir,"username-chain-bid-recovery-pilot-2026-09-19.json"));
  const sourceBytes=fs.readFileSync(path.join(dir,"username-market-stage-development-2026-09-09.json"));
  const pilot=JSON.parse(pilotBytes),sourceRows=JSON.parse(sourceBytes).rows,source=new Map(sourceRows.map(row=>[row.eventId,row]));
  const selected=pilot.eventIds.map(eventId=>source.get(eventId));
  if(selected.some(row=>!row))throw new Error("Pilot/source identity mismatch");
  const manifest={qualification:false,developmentOnly:true,createdBeforeFetch:true,pilotSha256:hash(pilotBytes),sourceSha256:hash(sourceBytes),
    contractSource:"https://github.com/TelegramMessenger/telemint/blob/main/func/nft-item.fc",
    evidenceRule:"Successful exact-name deployment plus successful empty-message bids to the same NFT, strictly before sale; failed bids excluded",
    eventIds:pilot.eventIds};
  fs.writeFileSync(path.join(dir,"username-chain-bid-lifecycle-pilot-2026-09-19.manifest.json"),JSON.stringify(manifest,null,2)+"\n",{flag:"wx"});
  const verifier=createTonCenterUsernameVerifier({retries:1,requestDelayMs:1100}),observedAt=new Date().toISOString(),results=[];
  for(const target of selected){
    const saleSeconds=Date.parse(target.eventTime)/1000;
    try{
      const transactions=await verifier.fetchTransactions(target.nftAddress,{startUtime:saleSeconds-8*86400,endUtime:saleSeconds+60,limit:100});
      const lifecycle=bidLifecycleEvidence(transactions,target,{cutoff:Date.parse(target.eventTime),observedAt});
      const latestNano=lifecycle.latestBid?.amountNano;
      results.push({eventId:target.eventId,username:target.username,eventTime:target.eventTime,actualUsd:target.actualUsd,
        saleNative:target.priceNative,transactionCount:transactions.length,...lifecycle,
        latestBidMatchesSale:latestNano?BigInt(latestNano)===BigInt(Math.round(target.priceNative*1e9)):false});
    }catch(error){results.push({eventId:target.eventId,username:target.username,eventTime:target.eventTime,saleNative:target.priceNative,error:error.message,bids:[]});}
    console.log(JSON.stringify({completed:results.length,total:selected.length,username:target.username,bids:results.at(-1).bids.length,
      latestBidMatchesSale:results.at(-1).latestBidMatchesSale||false,error:results.at(-1).error||null}));
  }
  const covered=results.filter(row=>row.bids.length),summary={attempted:results.length,covered:covered.length,
    latestBidMatchesSale:covered.filter(row=>row.latestBidMatchesSale).length,errors:results.filter(row=>row.error).length};
  fs.writeFileSync(path.join(dir,"username-chain-bid-lifecycle-pilot-2026-09-19.json"),JSON.stringify({...manifest,observedAt,summary,results},null,2)+"\n",{flag:"wx"});
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
