"use strict";
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const {loadHistoricalSales}=require("./evaluate-username-rebuild");
const {backtestTelegramUsernameSales,summarize}=require("../lib/username-backtest");
const hash=bytes=>crypto.createHash("sha256").update(bytes).digest("hex");
const fileHash=file=>hash(fs.readFileSync(file));

async function main(){
  const root=path.resolve(__dirname,"../research/telegram-usernames/data"),repo=path.resolve(__dirname,".."),manifestFile=path.join(root,"username-reserved-qualification-manifest-2026-09-19.json"),output=path.join(root,"username-reserved-qualification-v25-2026-09-19.json");
  if(fs.existsSync(output))throw new Error("Reserved qualification report already exists");
  const manifest=JSON.parse(fs.readFileSync(manifestFile,"utf8"));
  for(const [name,expected] of Object.entries({...manifest.candidate.files,...manifest.trainingSources}))if(fileHash(path.join(repo,name))!==expected)throw new Error(`Frozen input changed: ${name}`);
  const reserved=[];const seen=new Set();
  for(const block of manifest.reserved.blocks)for(const page of block.pageHashes){
    const file=path.join(root,block.directory,page.name);if(fileHash(file)!==page.sha256)throw new Error(`Reserved page changed: ${page.name}`);
    const payload=JSON.parse(fs.readFileSync(file,"utf8"));
    for(const sale of payload.sales||[]){if(seen.has(sale.saleId))continue;seen.add(sale.saleId);reserved.push({
      username:sale.normalizedName,nftAddress:sale.assetKey,eventId:sale.saleId,eventTime:sale.soldAt,priceUsd:Number(sale.priceUsd),priceGram:Number(sale.priceGram),
      historicalUsdRate:Number(sale.historicalUsdRate),eventType:"sale",finalized:true,paymentAsset:"GRAM",marketplace:sale.marketplace,source:sale.source,reliabilityScore:Number(sale.reliabilityScore),qualificationBlock:block.directory});}
  }
  if(reserved.length!==manifest.reserved.uniqueEvents)throw new Error(`Reserved event count changed: ${reserved.length}`);
  const historical=await loadHistoricalSales(undefined,{fingerprint:true});
  const result=backtestTelegramUsernameSales([...historical.sales,...reserved],{evaluationFrom:manifest.evaluation.fromInclusive,evaluationUntil:manifest.evaluation.untilExclusive,
    maxEvaluations:reserved.length,evaluationStride:1,maxHistory:manifest.candidate.maxHistory,modelRefreshInterval:50});
  const premiumRows=result.results.filter(row=>Number(row.sale.priceUsd)>=manifest.gates.premiumThresholdUsd),ordinaryRows=result.results.filter(row=>Number(row.sale.priceUsd)<100),intermediateRows=result.results.filter(row=>Number(row.sale.priceUsd)>=100&&Number(row.sale.priceUsd)<500);
  const premiumIdentities=new Set(reserved.filter(row=>row.priceUsd>=manifest.gates.premiumThresholdUsd).map(row=>row.nftAddress));
  const blockOutcomes=Object.fromEntries(manifest.reserved.blocks.map(block=>{const rows=reserved.filter(row=>row.qualificationBlock===block.directory);return[block.directory,{events:rows.length,uniqueIdentities:new Set(rows.map(row=>row.nftAddress)).size,premiumEvents:rows.filter(row=>row.priceUsd>=manifest.gates.premiumThresholdUsd).length,premiumUniqueIdentities:new Set(rows.filter(row=>row.priceUsd>=manifest.gates.premiumThresholdUsd).map(row=>row.nftAddress)).size}]}));
  const premium=summarize(premiumRows),ordinary=summarize(ordinaryRows),intermediate=summarize(intermediateRows),baseline={premium,ordinary,intermediate};
  const gateResults={minimumPremiumIdentities:premiumIdentities.size>=manifest.gates.minimumPremiumUniqueIdentities,
    premiumMedian:premium.medianFactorError!=null&&premium.medianFactorError<=manifest.gates.premiumMedianFactorErrorMaximum,
    premiumMaleImprovementVsV25:false,ordinaryRegressionVsV25:true,intermediateRegressionVsV25:true,
    overallIntervalCoverage:result.coverage>=manifest.gates.overallIntervalCoverageMinimum&&result.coverage<=manifest.gates.overallIntervalCoverageMaximum,
    premiumIntervalCoverage:premium.coverage>=manifest.gates.premiumIntervalCoverageMinimum};
  const {results,...summary}=result;
  const report={schemaVersion:"username-reserved-qualification-report-v1",qualification:false,passed:Object.values(gateResults).every(Boolean),
    manifest:path.basename(manifestFile),manifestSha256:fileHash(manifestFile),evaluatedAt:new Date().toISOString(),candidate:manifest.candidate,
    sources:{historicalSales:historical.sales.length,historicalRejected:historical.rejected,historicalHashes:historical.sourceHashes,reservedEvents:reserved.length,reservedUniqueIdentities:new Set(reserved.map(row=>row.nftAddress)).size},
    blockOutcomes,premiumUniqueIdentities:premiumIdentities.size,baselineIsCandidate:true,improvementVsV25:0,gateResults,cohorts:baseline,
    limitations:["The frozen candidate is v25 itself, so it cannot pass the required improvement-versus-v25 gate.","Reserved labels are exposed by this report and become development-only after this one run.","No current semantic/popularity evidence was backdated.","No competitor comparison was performed."],...summary};
  fs.writeFileSync(output,JSON.stringify(report,null,2)+"\n",{flag:"wx"});
  console.log(JSON.stringify({output:path.basename(output),sha256:fileHash(output),passed:report.passed,sources:report.sources,blockOutcomes,premiumUniqueIdentities:report.premiumUniqueIdentities,gateResults,cohorts:report.cohorts,overall:{attempted:report.attempted,evaluated:report.evaluated,abstained:report.abstained,medianFactorError:report.medianFactorError,coverage:report.coverage,meanAbsoluteLogError:report.meanAbsoluteLogError}},null,2));
}
if(require.main===module)main().catch(error=>{console.error(error.stack||error.message);process.exitCode=1;});
