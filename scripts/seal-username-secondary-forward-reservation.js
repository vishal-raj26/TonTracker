"use strict";
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const {USERNAME_ESTIMATOR_VERSION,USERNAME_CALIBRATION_VERSION}=require("../lib/username-engine");
const hash=bytes=>crypto.createHash("sha256").update(bytes).digest("hex"),fileHash=file=>hash(fs.readFileSync(file));
function main(){const repo=path.resolve(__dirname,".."),dir=path.join(repo,"research/telegram-usernames/data"),output=path.join(dir,"username-secondary-forward-reservation-manifest-2026-09-20.json");
  if(fs.existsSync(output))throw new Error("Secondary reservation already exists");const from="2026-09-20T14:00:00Z",createdAt=new Date().toISOString();
  if(Date.parse(createdAt)>=Date.parse(from))throw new Error("Secondary reservation must be sealed before start");
  const files=["lib/toncenter-username-secondary-ledger.js","scripts/collect-username-secondary-local.js","scripts/audit-username-secondary-reservation.js",
    "lib/username-estimator.js","lib/username-learned-model.js","lib/username-backtest.js"];
  const manifest={schemaVersion:"username-secondary-forward-reservation-v1",sealedBeforeWindow:true,createdAt,
    window:{fromInclusive:from,untilExclusive:"2026-10-20T00:00:00Z",directory:"current-username-secondary-forward",maximumUniqueEvents:4000,
      weeklyBlocks:[from,"2026-09-27T00:00:00Z","2026-10-04T00:00:00Z","2026-10-11T00:00:00Z","2026-10-18T00:00:00Z","2026-10-20T00:00:00Z"]},
    candidate:{estimatorVersion:USERNAME_ESTIMATOR_VERSION,calibrationVersion:USERNAME_CALIBRATION_VERSION,modelVersion:"telegram-username-learned-v15",maxHistory:30000,
      strategy:"v25 using only strictly prior completed evidence, augmented by prior contract-verified secondary Username sales",files:Object.fromEntries(files.map(name=>[name,fileHash(path.join(repo,name))]))},
    baseline:"same-case v25 without the new prospective secondary stream",selection:{exactUsernameCollection:true,completedNftSaleContract:true,positiveNativePrice:true,
      includeEveryVerifiedSecondarySale:true,noPriceNameOrOutcomeSelection:true,retainFailures:true,stopAtFirstOf:["maximumUniqueEvents","untilExclusive"]},
    gates:{minimumPremiumUniqueIdentities:100,minimumPremiumWeeklyBlocks:2,premiumThresholdUsd:500,premiumMedianFactorErrorMaximum:3,premiumMaleImprovementVsV25Minimum:.25,
      ordinaryAndIntermediateMaleRegressionMaximum:.05,overallIntervalCoverageMinimum:.75,overallIntervalCoverageMaximum:.85,premiumIntervalCoverageMinimum:.70},
    limitations:["This stream targets completed inactive/secondary resales and is separate from Fragment active-auction nowcasting.",
      "The already inspected pre-window API probe is development evidence and is excluded by the prospective start.","Insufficient event or premium counts fail without extension or exposed-label pooling."]};
  fs.writeFileSync(output,JSON.stringify(manifest,null,2)+"\n",{flag:"wx"});console.log(JSON.stringify({output:path.basename(output),sha256:fileHash(output),createdAt,window:manifest.window,candidate:manifest.candidate},null,2));}
if(require.main===module)try{main();}catch(error){console.error(error.message);process.exitCode=1;}
