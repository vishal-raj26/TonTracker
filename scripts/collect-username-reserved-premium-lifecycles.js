"use strict";
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const {createTonCenterUsernameVerifier}=require("../lib/toncenter-username-verifier");
const {bidLifecycleEvidence}=require("../lib/username-auction-bid-evidence");
const hash=bytes=>crypto.createHash("sha256").update(bytes).digest("hex");
async function main(){
  const dir=path.resolve(__dirname,"../research/telegram-usernames/data"),auditFile=path.join(dir,"username-reserved-integrity-2026-09-19-final.json"),auditBytes=fs.readFileSync(auditFile),audit=JSON.parse(auditBytes);
  const all=new Map();for(const block of audit.directories)for(const page of block.pages){const payload=JSON.parse(fs.readFileSync(path.join(dir,block.directory,page.name),"utf8"));for(const sale of payload.sales||[])all.set(sale.saleId,sale);}
  const selected=[...all.values()].filter(row=>Number(row.priceUsd)>=500).sort((a,b)=>String(a.saleId).localeCompare(String(b.saleId)));
  const manifestFile=path.join(dir,"username-reserved-premium-lifecycles-2026-09-20.manifest.json"),output=path.join(dir,"username-reserved-premium-lifecycles-2026-09-20.jsonl");
  const manifest={qualification:false,developmentOnly:true,outcomesAlreadyExposed:true,createdBeforeChainFetch:true,sourceAuditSha256:hash(auditBytes),premiumThresholdUsd:500,
    selection:"Every reserved sale at or above the already-exposed $500 development threshold; deterministic saleId order; no filtering by lifecycle availability",
    queryWindow:"Eight days before through sixty seconds after sale; lifecycle parser excludes transactions at or after sale cutoff",eventIds:selected.map(row=>row.saleId)};
  if(fs.existsSync(manifestFile)){if(JSON.stringify(JSON.parse(fs.readFileSync(manifestFile,"utf8")))!==JSON.stringify(manifest))throw new Error("Lifecycle manifest mismatch");}
  else fs.writeFileSync(manifestFile,JSON.stringify(manifest,null,2)+"\n",{flag:"wx"});
  const done=new Set(fs.existsSync(output)?fs.readFileSync(output,"utf8").trim().split(/\r?\n/).filter(Boolean).map(JSON.parse).map(row=>row.eventId):[]);
  const verifier=createTonCenterUsernameVerifier({retries:2,requestDelayMs:1100});let fetched=0;
  for(const sale of selected){if(done.has(sale.saleId))continue;const target={eventId:sale.saleId,username:sale.normalizedName,nftAddress:sale.assetKey,eventTime:sale.soldAt,priceNative:Number(sale.priceGram)};let result;const observedAt=new Date().toISOString();
    try{const seconds=Date.parse(target.eventTime)/1000,transactions=await verifier.fetchTransactions(target.nftAddress,{startUtime:seconds-8*86400,endUtime:seconds+60,limit:100});const lifecycle=bidLifecycleEvidence(transactions,target,{cutoff:Date.parse(target.eventTime),observedAt});const latest=lifecycle.latestBid?.amountNano;
      result={transactionCount:transactions.length,...lifecycle,latestBidMatchesSale:latest?BigInt(latest)===BigInt(Math.round(target.priceNative*1e9)):false};}
    catch(error){result={status:"fetch-error",error:error.message,bids:[]};}
    fs.appendFileSync(output,JSON.stringify({...target,actualUsd:Number(sale.priceUsd),observedAt,...result})+"\n");done.add(sale.saleId);fetched++;
    console.log(JSON.stringify({completed:done.size,total:selected.length,status:result.status,bids:result.bids.length,latestBidMatchesSale:Boolean(result.latestBidMatchesSale)}));}
  const rows=fs.readFileSync(output,"utf8").trim().split(/\r?\n/).filter(Boolean).map(JSON.parse),covered=rows.filter(row=>row.status==="verified-bid-lifecycle"&&row.bids.length);
  const summary={qualification:false,developmentOnly:true,manifestSha256:hash(fs.readFileSync(manifestFile)),auditSha256:hash(fs.readFileSync(output)),attempted:rows.length,covered:covered.length,
    latestBidMatchesSale:covered.filter(row=>row.latestBidMatchesSale).length,singleBid:covered.filter(row=>row.bids.length===1).length,
    multipleBids:covered.filter(row=>row.bids.length>1).length,multipleBidders:covered.filter(row=>new Set(row.bids.map(bid=>bid.bidderAddress)).size>1).length,
    fetchErrors:rows.filter(row=>row.status==="fetch-error").length};console.log(JSON.stringify(summary,null,2));
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
