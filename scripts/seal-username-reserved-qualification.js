"use strict";
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const {USERNAME_ESTIMATOR_VERSION,USERNAME_CALIBRATION_VERSION}=require("../lib/username-engine");
const hash=bytes=>crypto.createHash("sha256").update(bytes).digest("hex");
function fileHash(file){return hash(fs.readFileSync(file));}
function main(){
  const root=path.resolve(__dirname,"../research/telegram-usernames/data"),auditFile=path.join(root,"username-reserved-integrity-2026-09-19-final.json"),output=path.join(root,"username-reserved-qualification-manifest-2026-09-19.json");
  if(fs.existsSync(output))throw new Error("Qualification manifest already exists");
  const audit=JSON.parse(fs.readFileSync(auditFile,"utf8"));
  if(audit.pricesOpened!==false||audit.uniqueEvents!==998||audit.crossBlockDuplicateEvents!==0)throw new Error("Unexpected reserved integrity state");
  const candidateFiles=["lib/username-estimator.js","lib/username-learned-model.js","lib/username-backtest.js","lib/username-engine.js"];
  const trainingFiles=["research/telegram-usernames/data/dune_username_sales.part","research/telegram-usernames/data/tonapi_username_universe.csv"];
  const manifest={schemaVersion:"username-reserved-qualification-v1",sealedBeforeLabelsOpened:true,createdAt:new Date().toISOString(),
    candidate:{estimatorVersion:USERNAME_ESTIMATOR_VERSION,calibrationVersion:USERNAME_CALIBRATION_VERSION,modelVersion:"telegram-username-learned-v15",maxHistory:30000,semanticSnapshot:null,
      files:Object.fromEntries(candidateFiles.map(name=>[name,fileHash(path.resolve(__dirname,"..",name))]))},
    trainingSources:Object.fromEntries(trainingFiles.map(name=>[name,fileHash(path.resolve(__dirname,"..",name))])),
    reserved:{integrityAudit:path.basename(auditFile),integrityAuditSha256:fileHash(auditFile),uniqueEvents:audit.uniqueEvents,uniqueAssets:audit.uniqueAssets,
      blocks:audit.directories.map(row=>({directory:row.directory,from:row.from,pageCount:row.pageCount,uniqueEvents:row.uniqueEvents,uniqueAssets:row.uniqueAssets,cursor:row.cursor,
        pageHashes:row.pages.map(page=>({name:page.name,sha256:page.sha256,eventCount:page.eventCount}))}))},
    evaluation:{fromInclusive:"2026-08-01T00:00:00Z",untilExclusive:"2026-09-10T00:00:00Z",attemptEveryReservedEvent:true,previousReservedEventsMayEnterOnlyAfterTheirTimestamp:true,noCurrentSemantics:true,noOutcomeTuning:true},
    gates:{minimumPremiumUniqueIdentities:100,premiumThresholdUsd:500,premiumMedianFactorErrorMaximum:3,premiumMaleImprovementVsV25Minimum:0.25,
      ordinaryAndIntermediateMaleRegressionMaximum:0.05,overallIntervalCoverageMinimum:0.75,overallIntervalCoverageMaximum:0.85,premiumIntervalCoverageMinimum:0.70},
    limitation:"Candidate and acceptance gates frozen before reading reserved prices. Failure is retained; this manifest does not itself prove the two collection blocks are representative."};
  fs.writeFileSync(output,JSON.stringify(manifest,null,2)+"\n",{flag:"wx"});console.log(JSON.stringify({output:path.basename(output),sha256:fileHash(output),events:manifest.reserved.uniqueEvents,candidate:manifest.candidate},null,2));
}
if(require.main===module)try{main();}catch(error){console.error(error.message);process.exitCode=1;}
