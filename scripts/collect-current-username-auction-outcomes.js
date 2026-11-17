"use strict";

const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const {createFragmentUsernameSource}=require("../lib/fragment-username-source");
const {createTonCenterUsernameVerifier}=require("../lib/toncenter-username-verifier");
const {classifyUsernameAuctionOutcome,settlementCandidate}=require("../lib/username-auction-outcome");
const hash=value=>crypto.createHash("sha256").update(value).digest("hex");

async function main(){
  const cohortIndex=process.argv.indexOf("--cohort"),cohort=cohortIndex<0?"username-current-auction-ending-reservation-2026-09-19":String(process.argv[cohortIndex+1]);
  if(!/^username-current-auction(?:-ending)?-reservation-[0-9-]+$/.test(cohort))throw new Error("Invalid cohort name");
  const dir=path.resolve(__dirname,"../research/telegram-usernames/data"),input=path.join(dir,`${cohort}.jsonl`),manifestFile=path.join(dir,`${cohort}.manifest.json`),output=path.join(dir,`${cohort}.outcomes.jsonl`),summaryFile=path.join(dir,`${cohort}.outcomes.summary.json`);
  if(!fs.existsSync(input)||!fs.existsSync(manifestFile))throw new Error("Frozen cohort files are missing");
  if(fs.existsSync(output)||fs.existsSync(summaryFile))throw new Error("Outcome capture already exists; immutable one-time audit will not overwrite it");
  const manifest=JSON.parse(fs.readFileSync(manifestFile,"utf8")),rows=fs.readFileSync(input,"utf8").trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
  const latestEnd=Math.max(...manifest.targets.map(row=>Date.parse(row.endTime||"")));
  if(!Number.isFinite(latestEnd)||Date.now()<=latestEnd)throw new Error("Every reserved auction must close before outcome capture");
  const apiKey=String(process.env.USERNAME_TONCENTER_API_KEY||process.env.TONCENTER_API_KEY||"").trim();
  const fragment=createFragmentUsernameSource({requestDelayMs:1000,retryBaseDelayMs:1000}),verifier=createTonCenterUsernameVerifier({apiKey,requestDelayMs:apiKey?0:1050});
  const observedAt=new Date().toISOString(),outcomes=[];
  for(const snapshot of rows){
    let events=[],transactions=[],settlementVerification=null,providersComplete=false,error=null;
    try{
      const record=await fragment.fetchUsernameRecord(snapshot.username);events=record.events;
      const start=Math.floor(Date.parse(snapshot.state?.observedAt||snapshot.endTime)/1000)-1,end=Math.ceil(Date.parse(snapshot.endTime)/1000)+15*60;
      transactions=await verifier.fetchTransactions(snapshot.nftAddress,{startUtime:start,endUtime:end,limit:100});
      const candidate=snapshot.state?.status==="active"?settlementCandidate(events,{observedAt:snapshot.state.observedAt,endTime:snapshot.state.endTime}):null;
      if(candidate)settlementVerification=await verifier.verifyFragmentSale(candidate,[snapshot.nftAddress]);
      providersComplete=true;
    }catch(cause){error=String(cause?.message||cause);}
    const outcome=classifyUsernameAuctionOutcome(snapshot,{events,transactions,settlementVerification,providersComplete,observedAt});
    const row={selectionId:snapshot.selectionId,username:snapshot.username,nftAddress:snapshot.nftAddress,endTime:snapshot.endTime,
      frozenStateStatus:snapshot.state?.status||snapshot.status||"unknown",observedAt,providerError:error,outcome};
    fs.appendFileSync(output,JSON.stringify(row)+"\n");outcomes.push(row);
    console.log(JSON.stringify({completed:outcomes.length,total:rows.length,username:snapshot.username,outcome:outcome.status}));
  }
  const summary={qualification:false,immutableOneTimeAudit:true,cohortManifestSha256:hash(fs.readFileSync(manifestFile)),cohortAuditSha256:hash(fs.readFileSync(input)),
    outcomesSha256:hash(fs.readFileSync(output)),observedAt,attempted:outcomes.length,sold:outcomes.filter(row=>row.outcome.status==="sold").length,
    unsoldNoBidObserved:outcomes.filter(row=>row.outcome.status==="unsold-no-bid-observed").length,
    indeterminate:outcomes.filter(row=>row.outcome.status==="indeterminate").length,providerErrors:outcomes.filter(row=>row.providerError).length,
    interpretation:"Frozen current-auction evidence was scored once after closure. Results are audit evidence only and were not used to tune the estimator."};
  fs.writeFileSync(summaryFile,JSON.stringify(summary,null,2)+"\n",{flag:"wx"});console.log(JSON.stringify(summary,null,2));
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
