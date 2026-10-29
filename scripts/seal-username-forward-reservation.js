"use strict";

const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const {USERNAME_ESTIMATOR_VERSION,USERNAME_CALIBRATION_VERSION}=require("../lib/username-engine");
const hash=bytes=>crypto.createHash("sha256").update(bytes).digest("hex"),fileHash=file=>hash(fs.readFileSync(file));
function main(){
  const repo=path.resolve(__dirname,".."),dir=path.join(repo,"research/telegram-usernames/data"),output=path.join(dir,"username-forward-reservation-manifest-2026-09-20.json");
  if(fs.existsSync(output))throw new Error("Forward reservation manifest already exists");
  const from="2026-09-20T13:45:00Z",createdAt=new Date().toISOString();
  if(Date.parse(createdAt)>=Date.parse(from))throw new Error("Reservation must be sealed before the prospective window begins");
  const candidateFiles=["lib/username-estimator.js","lib/username-learned-model.js","lib/username-backtest.js","lib/username-active-auction-nowcast.js","lib/username-auction-bid-evidence.js"];
  const protocolFiles=["scripts/collect-username-settlements-local.js","scripts/audit-reserved-username-collection.js","scripts/collect-username-late-lifecycles.js","scripts/evaluate-username-late-qualification.js"];
  const manifest={schemaVersion:"username-forward-reservation-v1",sealedBeforeWindow:true,createdAt,
    window:{fromInclusive:from,untilExclusive:"2026-10-20T00:00:00Z",directory:"current-username-settlements-forward",maximumUniqueEvents:4000,
      weeklyBlocks:["2026-09-20T13:45:00Z","2026-09-27T00:00:00Z","2026-10-04T00:00:00Z","2026-10-11T00:00:00Z","2026-10-18T00:00:00Z","2026-10-20T00:00:00Z"]},
    candidate:{estimatorVersion:USERNAME_ESTIMATOR_VERSION,calibrationVersion:USERNAME_CALIBRATION_VERSION,modelVersion:"telegram-username-learned-v15",maxHistory:30000,
      strategy:"v25 for inactive/uncovered names; exact independently verified chain bid overlay at24h/6h/1h while active; never portfolio eligible",
      horizonsHours:[24,6,1],files:Object.fromEntries(candidateFiles.map(name=>[name,fileHash(path.join(repo,name))]))},
    protocolFiles:Object.fromEntries(protocolFiles.map(name=>[name,fileHash(path.join(repo,name))])),
    predecessor:{lateManifestSha256:fileHash(path.join(dir,"username-late-qualification-manifest-2026-09-20.json")),
      lateResultSha256:fileHash(path.join(dir,"username-late-qualification-result-2026-09-20.json")),lateLabelsDevelopmentOnly:true},
    selection:{includeEveryContractVerifiedUsernameSettlementInWindow:true,noPriceSelection:true,noNameSelection:true,noOutcomeFiltering:true,
      stopAtFirstOf:["maximumUniqueEvents","untilExclusive"],retainLifecycleFailures:true},
    gates:{minimumPremiumUniqueIdentities:100,minimumPremiumWeeklyBlocks:2,premiumThresholdUsd:500,premiumMedianFactorErrorMaximum:3,
      premiumMaleImprovementVsV25Minimum:.25,ordinaryAndIntermediateMaleRegressionMaximum:.05,overallIntervalCoverageMinimum:.75,
      overallIntervalCoverageMaximum:.85,premiumIntervalCoverageMinimum:.70,activeAuctionAvailabilityReportedSeparately:true},
    limitations:["This prospective block can qualify active-auction nowcasting only; it cannot qualify inactive resale without independent inactive-market outcomes.",
      "If fewer than100 premium identities appear, evidence is insufficient and the gate fails without post-hoc pooling or extension."]};
  fs.writeFileSync(output,JSON.stringify(manifest,null,2)+"\n",{flag:"wx"});
  console.log(JSON.stringify({output:path.basename(output),sha256:fileHash(output),createdAt,window:manifest.window,candidate:manifest.candidate},null,2));
}
if(require.main===module)try{main();}catch(error){console.error(error.message);process.exitCode=1;}
