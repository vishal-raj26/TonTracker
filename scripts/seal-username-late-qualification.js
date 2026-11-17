"use strict";
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const {USERNAME_ESTIMATOR_VERSION,USERNAME_CALIBRATION_VERSION}=require("../lib/username-engine");
const hash=bytes=>crypto.createHash("sha256").update(bytes).digest("hex"),fileHash=file=>hash(fs.readFileSync(file));
function main(){
  const repo=path.resolve(__dirname,".."),dir=path.join(repo,"research/telegram-usernames/data"),auditFile=path.join(dir,"username-reserved-integrity-2026-09-20-late-final.json"),output=path.join(dir,"username-late-qualification-manifest-2026-09-20.json");
  if(fs.existsSync(output))throw new Error("Late qualification manifest already exists");const audit=JSON.parse(fs.readFileSync(auditFile,"utf8")),late=audit.directories.find(row=>row.directory==="current-username-settlements-september-late");
  if(audit.pricesOpened!==false||!late||late.uniqueEvents!==988||late.duplicateRows!==0)throw new Error("Unexpected sealed late block");
  const files=["lib/username-estimator.js","lib/username-learned-model.js","lib/username-backtest.js","lib/username-active-auction-nowcast.js","lib/username-auction-bid-evidence.js"];
  const manifest={schemaVersion:"username-late-qualification-v1",sealedBeforeLateLabelsOpened:true,createdAt:new Date().toISOString(),
    candidate:{estimatorVersion:USERNAME_ESTIMATOR_VERSION,calibrationVersion:USERNAME_CALIBRATION_VERSION,modelVersion:"telegram-username-learned-v15",maxHistory:30000,
      strategy:"v25 for inactive/uncovered names; at each declared pre-close horizon replace point/range only when an exact verified chain bid exists; never portfolio eligible",
      horizonsHours:[24,6,1],files:Object.fromEntries(files.map(name=>[name,fileHash(path.join(repo,name))]))},
    developmentEvidence:{earlyQualificationSha256:fileHash(path.join(dir,"username-reserved-qualification-v25-2026-09-19.json")),
      earlyPremiumLifecycleSha256:fileHash(path.join(dir,"username-reserved-premium-lifecycles-2026-09-20.jsonl"))},
    trainingSources:{historicalSalesSha256:fileHash(path.join(dir,"dune_username_sales.part")),inventorySha256:fileHash(path.join(dir,"tonapi_username_universe.csv")),
      earlyIntegritySha256:fileHash(path.join(dir,"username-reserved-integrity-2026-09-19-final.json"))},
    holdout:{directory:late.directory,fromInclusive:"2026-09-10T00:00:00Z",untilExclusive:"2026-09-20T00:00:00Z",uniqueEvents:late.uniqueEvents,uniqueAssets:late.uniqueAssets,
      integrityAuditSha256:fileHash(auditFile),pageHashes:late.pages.map(page=>({name:page.name,sha256:page.sha256,eventCount:page.eventCount}))},
    evaluation:{attemptEveryHoldoutEvent:true,collectLifecycleForEveryHoldoutEvent:true,retainUnavailableAndMismatchedCases:true,baseline:"same-case v25 with strictly prior historical+early evidence",noLateOutcomeTuning:true},
    gates:{minimumPremiumUniqueIdentities:100,premiumThresholdUsd:500,premiumMedianFactorErrorMaximum:3,premiumMaleImprovementVsV25Minimum:.25,
      ordinaryAndIntermediateMaleRegressionMaximum:.05,overallIntervalCoverageMinimum:.75,overallIntervalCoverageMaximum:.85,premiumIntervalCoverageMinimum:.70,
      activeAuctionAvailabilityReportedSeparately:true},limitation:"Active-auction gates cannot qualify inactive resale. Insufficient premium identities is a qualification failure, not permission to pool exposed labels."};
  fs.writeFileSync(output,JSON.stringify(manifest,null,2)+"\n",{flag:"wx"});console.log(JSON.stringify({output:path.basename(output),sha256:fileHash(output),events:late.uniqueEvents,assets:late.uniqueAssets,candidate:manifest.candidate},null,2));
}
if(require.main===module)try{main();}catch(error){console.error(error.message);process.exitCode=1;}
