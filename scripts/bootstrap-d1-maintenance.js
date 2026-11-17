"use strict";

// Operator-only, explicitly budgeted counter bootstrap. This performs D1 writes
// only after --execute and --row-budget are supplied. Durable cursors live in D1;
// rerunning the command resumes, and no Gift sale is deleted by this endpoint.
async function main() {
  const args=process.argv.slice(2);
  const value=(name)=>args[args.indexOf(name)+1];
  const scope=value('--scope');
  const shard=value('--shard');
  const budget=Number(args.includes('--row-budget')?value('--row-budget'):0);
  if(!Number.isSafeInteger(budget) || budget<=0) throw new Error('--row-budget must be an explicit positive integer');
  if(!args.includes('--execute')) throw new Error('--execute is required to write resumable D1 counter checkpoints');
  if(scope!=='compact') throw new Error('--scope must be compact');
  if(scope==='compact' && !args.includes('--shard')) throw new Error('--shard is required for compact counters');
  const steps=Number(args.includes('--steps')?value('--steps'):1);
  const requests=Number(args.includes('--requests')?value('--requests'):1);
  if(!Number.isSafeInteger(steps)||steps<1||steps>4) throw new Error('--steps must be between 1 and 4');
  if(!Number.isSafeInteger(requests)||requests<1||requests>1000) throw new Error('--requests must be between 1 and 1000');
  const requestBudget=steps*2*500*3;
  if(budget<requestBudget) throw new Error('--row-budget is smaller than one requested bounded step');
  const base=String(process.env.D1_REGISTRY_URL || '').replace(/\/+$/,'');
  const secret=process.env.D1_INGEST_SECRET;
  if(!base || !secret) throw new Error('Set D1_REGISTRY_URL and D1_INGEST_SECRET explicitly');
  let spent=0;
  for(let request=0;request<requests && spent+requestBudget<=budget;request++) {
    const response=await fetch(`${base}/maintenance/counters/bootstrap`,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${secret}`},
      body:JSON.stringify({scope,...(scope==='compact'?{shard}:{}),steps}),signal:AbortSignal.timeout(45000)});
    const result=await response.json();
    if(!response.ok || !['partial','complete'].includes(result.status)) throw new Error(`Counter bootstrap stopped: ${result.status || response.status}`);
    // Charge the conservative request ceiling even for an empty/leased step.
    // This is a local source-row ceiling, not an account-wide D1 quota meter.
    spent+=requestBudget;
    console.log(JSON.stringify({request:request+1,chargedSourceRows:spent,...result}));
    if(result.status==='complete' || result.reason==='lease-held') return;
  }
  console.log(JSON.stringify({status:'partial',chargedSourceRows:spent,budgetOrRequestLimitReached:true,resume:'Repeat the same command after checking the account-wide D1 budget'}));
}

if(require.main===module) main().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={main};
