"use strict";

const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const hash=bytes=>crypto.createHash("sha256").update(bytes).digest("hex");
const median=values=>{const sorted=values.slice().sort((a,b)=>a-b);if(!sorted.length)return null;const mid=(sorted.length-1)/2;return (sorted[Math.floor(mid)]+sorted[Math.ceil(mid)])/2;};
const quantile=(values,fraction)=>{const sorted=values.slice().sort((a,b)=>a-b);if(!sorted.length)return null;const index=(sorted.length-1)*fraction,low=Math.floor(index),high=Math.ceil(index);return low===high?sorted[low]:sorted[low]+(sorted[high]-sorted[low])*(index-low);};
function factor(a,b){const ratio=a/b;return Math.max(ratio,1/ratio);}
function horizon(rows,hours){
  const evaluated=[];
  for(const row of rows){
    const quoteTime=Date.parse(row.eventTime)-hours*36e5;
    const bids=row.bids.filter(bid=>Date.parse(bid.eventTime)<=quoteTime);
    if(!bids.length)continue;
    const bid=bids.at(-1),amount=Number(BigInt(bid.amountNano))/1e9;
    evaluated.push({eventId:row.eventId,username:row.username,bidNative:amount,saleNative:row.saleNative,
      factorError:factor(amount,row.saleNative),bidAgeHours:(quoteTime-Date.parse(bid.eventTime))/36e5});
  }
  const logErrors=evaluated.map(row=>Math.log(row.factorError));
  return {hoursBeforeSale:hours,covered:evaluated.length,coverageRate:rows.length?evaluated.length/rows.length:null,
    meanAbsoluteLogError:logErrors.length?logErrors.reduce((sum,value)=>sum+value,0)/logErrors.length:null,
    medianFactorError:median(evaluated.map(row=>row.factorError)),p90FactorError:quantile(evaluated.map(row=>row.factorError),.9),
    withinTwoFactor:evaluated.filter(row=>row.factorError<=2).length,evaluated};
}
function summarize(rows){
  const statusCounts={};for(const row of rows)statusCounts[row.status]=(statusCounts[row.status]||0)+1;
  const covered=rows.filter(row=>row.status==="verified-bid-lifecycle"&&row.bids.length);
  const baseline=rows.filter(row=>row.baseUsd>0&&row.actualUsd>0).map(row=>({covered:row.status==="verified-bid-lifecycle",error:Math.abs(Math.log(row.baseUsd/row.actualUsd))}));
  const totalError=baseline.reduce((sum,row)=>sum+row.error,0),coveredError=baseline.filter(row=>row.covered).reduce((sum,row)=>sum+row.error,0);
  return {attempted:rows.length,statusCounts,covered:covered.length,coverageRate:rows.length?covered.length/rows.length:null,
    latestBidMatchesSale:covered.filter(row=>row.latestBidMatchesSale).length,
    latestBidMatchRate:covered.length?covered.filter(row=>row.latestBidMatchesSale).length/covered.length:null,
    baselineAbsoluteLogErrorShareAmongLifecycleCovered:totalError?coveredError/totalError:null,
    horizons:[24,6,1].map(hours=>horizon(rows,hours))};
}
function analyze(manifest,auditRows,sourceRows){
  const source=new Map(sourceRows.map(row=>[row.eventId,row])),audit=new Map();
  for(const row of auditRows){if(audit.has(row.eventId))throw new Error(`Duplicate eventId: ${row.eventId}`);audit.set(row.eventId,row);}
  if(audit.size!==manifest.eventIds.length)throw new Error(`Incomplete lifecycle audit: ${audit.size}/${manifest.eventIds.length}`);
  const rows=manifest.eventIds.map(eventId=>{const target=source.get(eventId),row=audit.get(eventId);if(!target||!row||target.username!==row.username)throw new Error(`Identity mismatch: ${eventId}`);return {...target,...row};});
  return {overall:summarize(rows),strata:{premium:summarize(rows.filter(row=>row.stratum==="premium-all")),ordinary:summarize(rows.filter(row=>row.stratum==="ordinary-control"))}};
}
if(require.main===module){
  const dir=path.resolve(__dirname,"../research/telegram-usernames/data"),files={
    manifest:path.join(dir,"username-chain-bid-lifecycles-expanded-2026-09-19.manifest.json"),
    audit:path.join(dir,"username-chain-bid-lifecycles-expanded-2026-09-19.jsonl"),source:path.join(dir,"username-market-stage-development-2026-09-09.json")};
  const bytes=Object.fromEntries(Object.entries(files).map(([key,file])=>[key,fs.readFileSync(file)]));
  const manifest=JSON.parse(bytes.manifest),auditRows=bytes.audit.toString("utf8").trim().split(/\r?\n/).filter(Boolean).map(JSON.parse),sourceRows=JSON.parse(bytes.source).rows;
  const report={qualification:false,developmentOnly:true,productionChanged:false,
    interpretation:"Point-in-time active-auction bid nowcasting only. It does not estimate an inactive username's resale value and must not create a permanent floor.",
    inputs:Object.fromEntries(Object.entries(bytes).map(([key,value])=>[key,{sha256:hash(value)}])),...analyze(manifest,auditRows,sourceRows)};
  const index=process.argv.indexOf("--output");if(index<0||!process.argv[index+1])throw new Error("--output required");
  fs.writeFileSync(path.resolve(process.argv[index+1]),JSON.stringify(report,null,2)+"\n",{flag:"wx"});
  const compact=summary=>({...summary,horizons:summary.horizons.map(item=>({...item,evaluated:undefined}))});
  console.log(JSON.stringify({...report,overall:compact(report.overall),strata:Object.fromEntries(Object.entries(report.strata).map(([key,value])=>[key,compact(value)]))},null,2));
}
module.exports={analyze,horizon,summarize};
