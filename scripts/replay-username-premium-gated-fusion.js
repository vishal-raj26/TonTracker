"use strict";
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const hash=bytes=>crypto.createHash("sha256").update(bytes).digest("hex");
function metrics(rows,field){
  const errors=rows.map(row=>Math.abs(Math.log(row[field]/row.actualUsd))).sort((a,b)=>a-b);
  return {samples:rows.length,meanAbsoluteLogError:errors.length?errors.reduce((a,b)=>a+b,0)/errors.length:null,
    medianFactorError:errors.length?Math.exp(errors[Math.floor(errors.length/2)]):null};
}
function replay(classifier,valuation,thresholds=[.1,.25,.5,.75,.9]){
  const values=new Map(valuation.results.map(row=>[row.eventId,row]));
  if(values.size!==valuation.results.length)throw new Error("Duplicate valuation events");
  const results=classifier.results.map(row=>{
    const value=values.get(row.eventId);
    if(!value||value.nftAddress!==row.nftAddress||value.eventTime!==row.eventTime||value.actualUsd!==row.actualUsd)throw new Error("Classifier/valuation identity mismatch");
    return {...row,baseUsd:value.baseline.estimateUsd,fusedUsd:value.globalFusion.estimateUsd};
  });
  const cohorts={overall:()=>true,ordinary:r=>r.actualUsd<100,intermediate:r=>r.actualUsd>=100&&r.actualUsd<500,premium:r=>r.actualUsd>=500};
  const baseline=Object.fromEntries(Object.entries(cohorts).map(([name,test])=>[name,metrics(results.filter(test),"baseUsd")]));
  const candidates=thresholds.map(threshold=>{
    const rows=results.map(row=>({...row,gatedUsd:row.premiumProbability>=threshold?row.fusedUsd:row.baseUsd}));
    return {threshold,selected:rows.filter(row=>row.premiumProbability>=threshold).length,
      metrics:Object.fromEntries(Object.entries(cohorts).map(([name,test])=>[name,metrics(rows.filter(test),"gatedUsd")]))};
  });
  return {baseline,candidates,results};
}
if(require.main===module){
  const dir=path.resolve(__dirname,"../research/telegram-usernames/data");
  const classifierBytes=fs.readFileSync(path.join(dir,"username-premium-classifier-development-2026-09-09.json"));
  const valuationBytes=fs.readFileSync(path.join(dir,"username-broad-density-development-2026-09-09.json"));
  const replayed=replay(JSON.parse(classifierBytes),JSON.parse(valuationBytes));
  const report={qualification:false,intervalsEvaluated:false,thresholdsPreviouslyExposed:true,
    method:"Development replay: use saved global-fusion point only when saved premium classifier probability reaches threshold; no refit and no production change",
    classifierSha256:hash(classifierBytes),valuationSha256:hash(valuationBytes),...replayed};
  const index=process.argv.indexOf("--output");if(index<0)throw new Error("--output required");
  fs.writeFileSync(path.resolve(process.argv[index+1]),JSON.stringify(report,null,2)+"\n",{flag:"wx"});
  console.log(JSON.stringify({...report,results:undefined},null,2));
}
module.exports={metrics,replay};
